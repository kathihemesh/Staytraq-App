import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Fetch payment with tenant and room details
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select(`
        id,
        total_amount,
        status,
        due_date,
        month,
        year,
        owner_id,
        verification_notes,
        tenants_table (
          name,
          rooms_table (
            room_number
          )
        )
      `)
      .eq('payment_token', token)
      .single()

    if (paymentError) {
      console.error('[pay/token] Error fetching payment:', JSON.stringify(paymentError))
      if (paymentError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Supabase can return joined relations as array or object — normalise defensively
    const tenantRaw = payment.tenants_table
    const tenant = Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw

    const roomRaw = tenant?.rooms_table
    const room = Array.isArray(roomRaw) ? roomRaw[0] : roomRaw

    // Fetch settings for the owner
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('upi_id, upi_name, payment_instructions, screenshot_required, utr_required')
      .eq('owner_id', payment.owner_id)
      .single()

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('[pay/token] Error fetching settings:', JSON.stringify(settingsError))
      // Continue — settings are optional, UPI just won't show
    }

    return NextResponse.json({
      payment: {
        id: payment.id,
        amount: payment.total_amount,
        status: payment.status,
        due_date: payment.due_date,
        month: payment.month,
        year: payment.year,
        tenant_name: tenant?.name || 'Tenant',
        room_number: room?.room_number || 'Unknown',
        verification_notes: payment.verification_notes || null
      },
      settings: settings || null
    })

  } catch (error) {
    console.error('[pay/token] Unhandled error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
