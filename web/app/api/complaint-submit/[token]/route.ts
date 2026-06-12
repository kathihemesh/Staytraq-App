import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET: Validates the public complaint portal token and returns the property/owner details
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

    // Fetch owner details and their PG details matching the complaint_token
    const { data: ownerRecord, error: ownerError } = await supabase
      .from('pg_owners')
      .select('id, name, pg_details(pg_name)')
      .eq('complaint_token', token)
      .single()

    if (ownerError || !ownerRecord) {
      console.error('[complaint-submit/token] Error fetching owner:', JSON.stringify(ownerError))
      return NextResponse.json({ error: 'Invalid or expired complaint portal link' }, { status: 404 })
    }

    // Normalise pg details
    const pgDetailsRaw = ownerRecord.pg_details
    const pgDetails = Array.isArray(pgDetailsRaw) ? pgDetailsRaw[0] : pgDetailsRaw

    return NextResponse.json({
      valid: true,
      owner_name: ownerRecord.name,
      pg_name: pgDetails?.pg_name || null
    })

  } catch (error) {
    console.error('[complaint-submit/token] GET unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Accepts a mobile number, verifies if the tenant is active under this owner, and confirms validation
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

    // 1. Fetch owner record matching the complaint_token
    const { data: ownerRecord, error: ownerError } = await supabase
      .from('pg_owners')
      .select('id')
      .eq('complaint_token', token)
      .single()

    if (ownerError || !ownerRecord) {
      return NextResponse.json({ error: 'Invalid or expired complaint portal link' }, { status: 404 })
    }

    // 2. Fetch active tenants under this owner to find a mobile number match
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants_table')
      .select('id, name, mobile_number')
      .eq('owner_id', ownerRecord.id)
      .eq('status', 'active')

    if (tenantsError || !tenants) {
      console.error('[complaint-submit/token] Error fetching tenants:', JSON.stringify(tenantsError))
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

    return NextResponse.json({
      success: true,
      tenant: {
        name: matchedTenant.name || 'Tenant'
      }
    })

  } catch (error) {
    console.error('[complaint-submit/token] POST verification unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
