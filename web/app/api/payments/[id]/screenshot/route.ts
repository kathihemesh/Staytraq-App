import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify payment belongs to owner
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id, owner_id, screenshot_path')
      .eq('id', id)
      .eq('owner_id', user.id)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json({ error: 'Payment not found or access denied' }, { status: 404 })
    }

    if (!payment.screenshot_path) {
      return NextResponse.json({ error: 'No screenshot available for this payment' }, { status: 404 })
    }

    // Generate signed URL (valid for 60 seconds)
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('payment_screenshots')
      .createSignedUrl(payment.screenshot_path, 60)

    if (signedUrlError || !signedUrlData) {
      console.error('Error generating signed URL:', signedUrlError)
      return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
    }

    return NextResponse.json({ url: signedUrlData.signedUrl })

  } catch (error) {
    console.error('Error in GET /api/payments/[id]/screenshot:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
