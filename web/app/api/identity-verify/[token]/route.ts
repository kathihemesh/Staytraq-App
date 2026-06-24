import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PortalTenantContext } from '@/lib/identity/portal'

// GET: Validates the public verification portal token and returns the tenant
// context (name, room/bed, already-verified) for the single tenant the token
// resolves to. The `verification_token` column carries a partial unique index,
// so a valid token matches at most one tenant (Reqs 4.1, 4.2, 4.3, 4.6).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'Verification token is required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Resolve the single tenant bound to this verification token. The partial
    // unique index guarantees at most one match; `maybeSingle` returns null for
    // no match rather than erroring (Req 4.2).
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants_table')
      .select(`
        id,
        name,
        verification_status,
        rooms_table (
          room_number
        )
      `)
      .eq('verification_token', token)
      .maybeSingle()

    if (tenantError) {
      console.error('[identity-verify/token] Error fetching tenant:', JSON.stringify(tenantError))
      return NextResponse.json(
        { valid: false, error: 'Database error validating verification link' },
        { status: 500 }
      )
    }

    // No tenant matches this token -> the link is invalid (Req 4.2).
    if (!tenant) {
      return NextResponse.json(
        { valid: false, error: 'Invalid or expired verification link' },
        { status: 404 }
      )
    }

    // Normalise the room/bed identifier. A missing assignment is reported as
    // `null` so the portal can show the "no room/bed assigned" indication
    // (Req 4.6).
    const roomRaw = (tenant as { rooms_table?: unknown }).rooms_table
    const room = Array.isArray(roomRaw) ? roomRaw[0] : roomRaw
    const roomNumber = (room as { room_number?: string } | null | undefined)?.room_number
    const roomValue =
      typeof roomNumber === 'string' && roomNumber.trim().length > 0 ? roomNumber : null

    const context: PortalTenantContext = {
      name: tenant.name || 'Tenant',
      room: roomValue,
      // A "Verified" tenant gets the already-complete state (Req 4.3); any other
      // status is treated as a non-verified tenant ready for input (Req 4.1).
      alreadyVerified: tenant.verification_status === 'Verified',
    }

    return NextResponse.json({ valid: true, ...context })
  } catch (error) {
    console.error('[identity-verify/token] GET unhandled error:', error)
    return NextResponse.json(
      { valid: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
