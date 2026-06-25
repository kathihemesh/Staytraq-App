import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Portal token is required' }, { status: 400 })
    }

    const formData = await request.formData()
    const paymentIdStr = formData.get('payment_id') as string | null
    const screenshot = formData.get('screenshot') as File | null
    const utr = formData.get('utr') as string | null
    const paymentMethod = formData.get('payment_method') as string || 'upi'

    if (!paymentIdStr) {
      return NextResponse.json({ error: 'Payment reference ID is required' }, { status: 400 })
    }

    if (!screenshot || screenshot.size === 0) {
      return NextResponse.json({ error: 'Payment screenshot is required' }, { status: 400 })
    }

    if (!utr || !utr.trim()) {
      return NextResponse.json({ error: 'UTR/Reference Number is required' }, { status: 400 })
    }

    const paymentId = parseInt(paymentIdStr, 10)

    const supabase = createAdminClient()

    // 1. Verify owner portal_token and load owner_id, month, and year details
    const { data: linkRecord } = await supabase
      .from('monthly_payment_links')
      .select('owner_id, month, year')
      .eq('portal_token', token)
      .maybeSingle()

    // Resolve the owner from either an owner portal token or a per-tenant
    // payment-portal token (the unique reminder link that skips verification).
    let ownerId: string | null = linkRecord?.owner_id ?? null
    let tenantScopeId: number | null = null
    if (!ownerId) {
      const { data: tokenTenant } = await supabase
        .from('tenants_table')
        .select('id, owner_id')
        .eq('payment_portal_token', token)
        .maybeSingle()
      if (tokenTenant) {
        ownerId = tokenTenant.owner_id
        tenantScopeId = tokenTenant.id
      }
    }

    if (!ownerId) {
      return NextResponse.json({ error: 'Invalid or expired payment portal' }, { status: 404 })
    }

    // 2. Fetch the payment record and verify it matches the owner constraint
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id, owner_id, tenant_id, status, month, year')
      .eq('id', paymentId)
      .eq('owner_id', ownerId)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json({ error: 'Payment invoice not found or does not belong to this property' }, { status: 404 })
    }

    // For a per-tenant token, the invoice must belong to that exact tenant.
    if (tenantScopeId !== null && payment.tenant_id !== tenantScopeId) {
      return NextResponse.json({ error: 'Payment invoice does not belong to this tenant' }, { status: 404 })
    }

    if (payment.status === 'paid') {
      return NextResponse.json({ error: 'Payment has already been marked as paid' }, { status: 400 })
    }

    // 3. Security Check: Validate UTR number uniqueness to prevent fraud/re-submission
    if (utr) {
      const cleanUtr = utr.trim()
      if (cleanUtr.length > 0) {
        const { data: duplicatePayment, error: dupError } = await supabase
          .from('payments')
          .select('id, status')
          .eq('utr_number', cleanUtr)
          .limit(1)

        if (duplicatePayment && duplicatePayment.length > 0) {
          return NextResponse.json({ 
            error: 'This transaction reference (UTR) has already been submitted for another payment. Please verify your reference number or contact the owner.' 
          }, { status: 400 })
        }
      }
    }

    let screenshotPath = null

    // 4. Upload screenshot if provided
    if (screenshot && screenshot.size > 0) {
      const fileExt = screenshot.name.split('.').pop()
      const fileName = `${payment.owner_id}/${payment.id}/${Date.now()}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('payment_screenshots')
        .upload(fileName, screenshot, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) {
        console.error('Error uploading screenshot:', uploadError)
        return NextResponse.json({ error: 'Failed to upload screenshot' }, { status: 500 })
      }

      screenshotPath = fileName
    }

    // 5. Update payment
    const oldStatus = payment.status
    const updateData: any = {
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      payment_method: paymentMethod,
    }

    if (screenshotPath) {
      updateData.screenshot_path = screenshotPath
    }
    
    if (utr) {
      updateData.utr_number = utr.trim()
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update(updateData)
      .eq('id', payment.id)

    if (updateError) {
      console.error('Error updating payment:', updateError)
      return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
    }

    // 6. Audit Log
    await supabase.from('payment_audit_log').insert({
      payment_id: payment.id,
      action: 'proof_submitted',
      old_status: oldStatus,
      new_status: 'submitted',
      metadata: { payment_method: paymentMethod, has_screenshot: !!screenshotPath, has_utr: !!utr }
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error in POST /api/pay/[token]/submit:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
