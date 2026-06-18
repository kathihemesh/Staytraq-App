import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripHtml } from '@/lib/utils/sanitize'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Portal token is required' }, { status: 400 })
    }

    const { mobile_number, complaint_message } = await request.json()
    if (!mobile_number) {
      return NextResponse.json({ error: 'Registered mobile number is required' }, { status: 400 })
    }
    if (!complaint_message || !complaint_message.trim()) {
      return NextResponse.json({ error: 'Complaint message is required' }, { status: 400 })
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

    // 2. Fetch active tenants under this owner to verify identity
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants_table')
      .select('id, mobile_number')
      .eq('owner_id', ownerRecord.id)
      .eq('status', 'active')

    if (tenantsError || !tenants) {
      console.error('[complaint-submit/submit] Error fetching tenants:', JSON.stringify(tenantsError))
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

    // Store cleaned 10-digit phone number for uniformity
    const tenantPhoneDb = cleanInput.slice(-10)

    // 3. Enforce Rate Limiting: 3 complaints per hour per phone number
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await supabase
      .from('complaints')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_phone', tenantPhoneDb)
      .gte('created_at', oneHourAgo)

    if (countError) {
      console.error('[complaint-submit/submit] Error checking rate limit:', JSON.stringify(countError))
      return NextResponse.json({ error: 'Database error checking submission limit' }, { status: 500 })
    }

    if (count !== null && count >= 3) {
      return NextResponse.json({
        error: 'Too many requests. You have reached the limit of 3 complaints per hour. Please try again later.'
      }, { status: 429 })
    }

    // 4. Insert complaint record
    const sanitizedMessage = stripHtml(complaint_message.trim())
    
    const { error: insertError } = await supabase
      .from('complaints')
      .insert({
        owner_id: ownerRecord.id,
        tenant_phone: tenantPhoneDb,
        complaint_message: sanitizedMessage,
        status: 'Under Working'
      })

    if (insertError) {
      console.error('[complaint-submit/submit] Error inserting complaint:', JSON.stringify(insertError))
      return NextResponse.json({ error: 'Failed to submit complaint' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[complaint-submit/submit] POST unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
