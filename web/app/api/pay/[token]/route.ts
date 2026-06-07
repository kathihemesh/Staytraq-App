import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// GET: Validates the public portal token and returns the owner's payment settings + month details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Portal token is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Fetch monthly payment link matching the portal_token
    const { data: linkRecord, error: linkError } = await supabase
      .from('monthly_payment_links')
      .select('owner_id, month, year')
      .eq('portal_token', token)
      .single()

    if (linkError || !linkRecord) {
      console.error('[pay/token] Error fetching monthly link:', JSON.stringify(linkError))
      return NextResponse.json({ error: 'Invalid or expired payment portal link' }, { status: 404 })
    }

    // 2. Fetch settings for the owner
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('upi_id, upi_name, payment_instructions, screenshot_required, utr_required')
      .eq('owner_id', linkRecord.owner_id)
      .single()

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('[pay/token] Error fetching settings:', JSON.stringify(settingsError))
    }

    return NextResponse.json({
      valid: true,
      month: linkRecord.month,
      year: linkRecord.year,
      settings: settings || null
    })

  } catch (error) {
    console.error('[pay/token] GET unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Accepts a mobile number, verifies identity, and returns the tenant's specific monthly invoice
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Portal token is required' }, { status: 400 })
    }

    const { mobile_number } = await request.json()
    if (!mobile_number) {
      return NextResponse.json({ error: 'Registered mobile number is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Fetch monthly payment link matching the portal_token
    const { data: linkRecord, error: linkError } = await supabase
      .from('monthly_payment_links')
      .select('owner_id, month, year')
      .eq('portal_token', token)
      .single()

    if (linkError || !linkRecord) {
      return NextResponse.json({ error: 'Invalid or expired payment portal link' }, { status: 404 })
    }

    // 2. Fetch active tenants under this owner to find a mobile number match
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants_table')
      .select(`
        id,
        name,
        payment_code,
        mobile_number,
        rooms_table (
          room_number
        )
      `)
      .eq('owner_id', linkRecord.owner_id)
      .eq('status', 'active')

    if (tenantsError || !tenants) {
      console.error('[pay/token] Error fetching tenants:', JSON.stringify(tenantsError))
      return NextResponse.json({ error: 'No active tenants found for this property' }, { status: 404 })
    }

    // Clean input mobile number
    const cleanInput = mobile_number.replace(/\D/g, '')
    if (cleanInput.length < 10) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit mobile number' }, { status: 400 })
    }

    // Look for a matching tenant
    const matchedTenant = tenants.find((t) => {
      if (!t.mobile_number) return false
      const dbClean = t.mobile_number.replace(/\D/g, '')
      return dbClean.slice(-10) === cleanInput.slice(-10)
    })

    if (!matchedTenant) {
      return NextResponse.json({ error: 'No tenant found matching this mobile number. Please check or contact the property owner.' }, { status: 404 })
    }

    // Normalise room details
    const roomRaw = matchedTenant.rooms_table
    const room = Array.isArray(roomRaw) ? roomRaw[0] : roomRaw

    // 3. Fetch the payment record matching this tenant and this specific month & year
    const { data: payments, error: payError } = await supabase
      .from('payments')
      .select('id, total_amount, status, due_date, month, year, verification_notes')
      .eq('tenant_id', matchedTenant.id)
      .eq('month', linkRecord.month)
      .eq('year', linkRecord.year)
      .limit(1)

    if (payError) {
      console.error('[pay/token] Error fetching payment:', JSON.stringify(payError))
      return NextResponse.json({ error: 'Database error retrieving billing record' }, { status: 500 })
    }

    const payment = payments && payments.length > 0 ? payments[0] : null

    if (!payment) {
      return NextResponse.json({
        tenant: {
          name: matchedTenant.name || 'Tenant',
          room_number: room?.room_number || 'Unknown',
          payment_code: matchedTenant.payment_code || 'ST-XXXXXX'
        },
        payment: null,
        message: `No billing invoice generated for ${months[linkRecord.month - 1]} ${linkRecord.year} yet.`
      })
    }

    return NextResponse.json({
      tenant: {
        name: matchedTenant.name || 'Tenant',
        room_number: room?.room_number || 'Unknown',
        payment_code: matchedTenant.payment_code || 'ST-XXXXXX'
      },
      payment: {
        id: payment.id,
        amount: payment.total_amount,
        status: payment.status,
        due_date: payment.due_date,
        month: payment.month,
        year: payment.year,
        verification_notes: payment.verification_notes || null
      }
    })

  } catch (error) {
    console.error('[pay/token] POST verification unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
