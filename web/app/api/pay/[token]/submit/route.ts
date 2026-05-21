import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const formData = await request.formData()
    const screenshot = formData.get('screenshot') as File | null
    const utr = formData.get('utr') as string | null
    const paymentMethod = formData.get('payment_method') as string || 'upi'

    const supabase = createAdminClient()

    // 1. Fetch payment to verify it exists and is in a valid state
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id, owner_id, status')
      .eq('payment_token', token)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    if (payment.status === 'paid') {
      return NextResponse.json({ error: 'Payment is already paid' }, { status: 400 })
    }

    let screenshotPath = null

    // 2. Upload screenshot if provided
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

    // 3. Update payment
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
      updateData.utr_number = utr
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update(updateData)
      .eq('id', payment.id)

    if (updateError) {
      console.error('Error updating payment:', updateError)
      return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
    }

    // 4. Audit Log
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
