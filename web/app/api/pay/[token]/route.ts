import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function normalizeMobileLast10(mobileNumber: string) {
  const clean = mobileNumber.replace(/\D/g, '')
  return clean.length >= 10 ? clean.slice(-10) : null
}

/**
 * Resolve a per-tenant payment-portal token (tenants_table.payment_portal_token)
 * into the same payload the mobile-verification POST returns, plus the owner's
 * settings and pg name. Returns null when the token does not match a tenant, so
 * the caller can fall through to a 404. This powers the unique per-tenant link
 * sent by the daily reminder scheduler: it skips mobile verification and shows
 * the tenant's outstanding dues directly.
 */
async function resolveTenantTokenPayload(
  supabase: ReturnType<typeof createAdminClient>,
  token: string
) {
  const { data: tenant } = await supabase
    .from('tenants_table')
    .select('id, name, owner_id, payment_code, status, rooms_table ( room_number )')
    .eq('payment_portal_token', token)
    .maybeSingle()

  if (!tenant) return null

  const [{ data: settings }, { data: pgDetails }, { data: payData }] = await Promise.all([
    supabase
      .from('settings')
      .select('upi_id, upi_name, payment_instructions, is_merchant')
      .eq('owner_id', tenant.owner_id)
      .maybeSingle(),
    supabase
      .from('pg_details')
      .select('pg_name')
      .eq('owner_id', tenant.owner_id)
      .maybeSingle(),
    supabase
      .from('payments')
      .select('id, rent_amount, extra_charges, total_amount, status, due_date, month, year, verification_notes, payment_code')
      .eq('tenant_id', tenant.id),
  ])

  const roomRaw = (tenant as { rooms_table?: unknown }).rooms_table
  const room = Array.isArray(roomRaw) ? roomRaw[0] : (roomRaw as { room_number?: string } | null)

  // Show every outstanding invoice (anything not yet paid), most-recent first.
  const activePayments = (payData || [])
    .filter((p) => p.status !== 'paid')
    .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())

  const mappedPayments = activePayments.map((payment) => ({
    id: payment.id,
    amount: (payment.rent_amount || 0) + (payment.extra_charges || 0),
    status: payment.status,
    due_date: payment.due_date,
    month: payment.month,
    year: payment.year,
    verification_notes: payment.verification_notes || null,
    payment_code: payment.payment_code,
  }))

  return {
    valid: true,
    mode: 'tenant' as const,
    pg_name: pgDetails?.pg_name || null,
    settings: settings || null,
    tenant: {
      name: tenant.name || 'Tenant',
      room_number: room?.room_number || 'Unknown',
      payment_code: tenant.payment_code || 'ST-XXXXXX',
    },
    payments: mappedPayments,
  }
}

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

    // 1. Fetch monthly payment link matching the portal_token (owner grouped portal)
    const { data: linkRecord } = await supabase
      .from('monthly_payment_links')
      .select('owner_id, month, year')
      .eq('portal_token', token)
      .maybeSingle()

    // 1a. Not an owner portal token → try a per-tenant payment-portal token,
    //     which resolves the tenant's dues directly (no mobile verification).
    if (!linkRecord) {
      const tenantPayload = await resolveTenantTokenPayload(supabase, token)
      if (tenantPayload) return NextResponse.json(tenantPayload)
      return NextResponse.json({ error: 'Invalid or expired payment portal link' }, { status: 404 })
    }

    // 2. Fetch settings for the owner
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('upi_id, upi_name, payment_instructions, is_merchant')
      .eq('owner_id', linkRecord.owner_id)
      .single()

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('[pay/token] Error fetching settings:', JSON.stringify(settingsError))
    }

    // Fetch PG details for the owner
    const { data: pgDetails, error: pgError } = await supabase
      .from('pg_details')
      .select('pg_name')
      .eq('owner_id', linkRecord.owner_id)
      .maybeSingle()

    if (pgError) {
      console.error('[pay/token] Error fetching pg details:', JSON.stringify(pgError))
    }

    return NextResponse.json({
      valid: true,
      mode: 'portal',
      month: linkRecord.month,
      year: linkRecord.year,
      settings: settings || null,
      pg_name: pgDetails?.pg_name || null
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

    const normalizedMobile = normalizeMobileLast10(mobile_number)
    if (!normalizedMobile) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit mobile number' }, { status: 400 })
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

    // 2. Find matching tenants by owner and normalized last-10 mobile digits (including active, notice_period, move_out status).
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants_table')
      .select(`
        id,
        name,
        payment_code,
        status,
        rooms_table (
          room_number
        )
      `)
      .eq('owner_id', linkRecord.owner_id)
      .eq('mobile_number_normalized', normalizedMobile)
      .in('status', ['active', 'notice_period', 'move_out'])

    if (tenantsError) {
      console.error('[pay/token] Error fetching tenants:', JSON.stringify(tenantsError))
      return NextResponse.json({ error: 'Database error verifying tenant identity' }, { status: 500 })
    }

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ error: 'No tenant found matching this mobile number. Please check or contact the property owner.' }, { status: 404 })
    }

    // Sort tenants to prioritize status: active > notice_period > move_out
    const statusPriority: Record<string, number> = {
      active: 1,
      notice_period: 2,
      move_out: 3,
    }
    const sortedTenants = [...tenants].sort((a, b) => {
      const pA = statusPriority[a.status] || 99
      const pB = statusPriority[b.status] || 99
      return pA - pB
    })

    let matchedTenant = null
    let payments: any[] = []

    for (const tenant of sortedTenants) {
      if (tenant.status === 'active' || tenant.status === 'notice_period') {
        const { data: payData, error: payError } = await supabase
          .from('payments')
          .select('id, rent_amount, extra_charges, total_amount, status, due_date, month, year, verification_notes, payment_code')
          .eq('tenant_id', tenant.id)
        if (payError) {
          console.error('[pay/token] Error fetching payment:', JSON.stringify(payError))
          return NextResponse.json({ error: 'Database error retrieving billing record' }, { status: 500 })
        }
        matchedTenant = tenant
        payments = payData || []
        break
      } else if (tenant.status === 'move_out') {
        const { data: payData, error: payError } = await supabase
          .from('payments')
          .select('id, rent_amount, extra_charges, total_amount, status, due_date, month, year, verification_notes, payment_code')
          .eq('tenant_id', tenant.id)
        if (payError) {
          console.error('[pay/token] Error fetching payment:', JSON.stringify(payError))
          return NextResponse.json({ error: 'Database error retrieving billing record' }, { status: 500 })
        }
        if (payData && payData.length > 0) {
          matchedTenant = tenant
          payments = payData
          break
        }
      }
    }

    if (!matchedTenant) {
      return NextResponse.json({ error: 'No tenant found matching this mobile number. Please check or contact the property owner.' }, { status: 404 })
    }

    // Normalise room details
    const roomRaw = matchedTenant.rooms_table
    const room = Array.isArray(roomRaw) ? roomRaw[0] : roomRaw

    // Filter to show:
    // 1. All payments generated for the current monthly link's month/year
    // 2. Outstanding / late payments from previous months so they are not missed
    const activePayments = (payments || []).filter((p) => {
      const isCurrentMonth = p.month === linkRecord.month && p.year === linkRecord.year
      const isUnpaid = p.status !== 'paid'
      return isCurrentMonth || isUnpaid
    })

    if (!activePayments || activePayments.length === 0) {
      return NextResponse.json({
        tenant: {
          name: matchedTenant.name || 'Tenant',
          room_number: room?.room_number || 'Unknown',
          payment_code: matchedTenant.payment_code || 'ST-XXXXXX'
        },
        payments: [],
        message: `No billing invoice generated for ${months[linkRecord.month - 1]} ${linkRecord.year} yet.`
      })
    }

    const mappedPayments = activePayments.map(payment => ({
      id: payment.id,
      amount: (payment.rent_amount || 0) + (payment.extra_charges || 0),
      status: payment.status,
      due_date: payment.due_date,
      month: payment.month,
      year: payment.year,
      verification_notes: payment.verification_notes || null,
      payment_code: payment.payment_code
    }))

    return NextResponse.json({
      tenant: {
        name: matchedTenant.name || 'Tenant',
        room_number: room?.room_number || 'Unknown',
        payment_code: matchedTenant.payment_code || 'ST-XXXXXX'
      },
      payments: mappedPayments
    })

  } catch (error) {
    console.error('[pay/token] POST verification unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
