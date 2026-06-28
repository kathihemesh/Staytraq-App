import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
      .select('id, rent_amount, extra_charges, total_amount, amount_paid, status, due_date, month, year, verification_notes, payment_code')
      .eq('tenant_id', tenant.id),
  ])

  const roomRaw = (tenant as { rooms_table?: unknown }).rooms_table
  const room = Array.isArray(roomRaw) ? roomRaw[0] : (roomRaw as { room_number?: string } | null)

  // Show every invoice with an outstanding balance (not fully paid), most-recent first.
  const activePayments = (payData || [])
    .filter((p) => {
      const total = Number(p.total_amount) || 0
      const paid = Number((p as { amount_paid?: number }).amount_paid) || 0
      return p.status !== 'paid' && total - paid > 0
    })
    .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())

  const mappedPayments = activePayments.map((payment) => {
    const total = (payment.rent_amount || 0) + (payment.extra_charges || 0)
    const paid = Number((payment as { amount_paid?: number }).amount_paid) || 0
    const balance = Math.max((Number(payment.total_amount) || total) - paid, 0)
    return {
      id: payment.id,
      // `amount` is the remaining balance the tenant still needs to pay.
      amount: balance,
      total_amount: Number(payment.total_amount) || total,
      amount_paid: paid,
      status: payment.status,
      due_date: payment.due_date,
      month: payment.month,
      year: payment.year,
      verification_notes: payment.verification_notes || null,
      payment_code: payment.payment_code,
    }
  })

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

    // Resolves the tenant's dues directly (no mobile verification).
    const tenantPayload = await resolveTenantTokenPayload(supabase, token)
    if (tenantPayload) return NextResponse.json(tenantPayload)
    return NextResponse.json({ error: 'Invalid or expired payment portal link' }, { status: 404 })
  } catch (error: any) {
    console.error('[pay/token] GET unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Resolve tenant payments by verifying registered mobile number.
// (Grouped portal mode is disabled - return 403 Forbidden).
export async function POST() {
  return NextResponse.json({
    error: 'Grouped payment portal verification is disabled. Please use your individual payment link.'
  }, { status: 403 })
}
