import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 })
    }

    const { action, notes } = await request.json()
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const supabase = await createClient()

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify payment belongs to owner and is in 'submitted' state
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id, owner_id, status')
      .eq('id', id)
      .eq('owner_id', user.id)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json({ error: 'Payment not found or access denied' }, { status: 404 })
    }

    if (action === 'approve') {
      if (!['pending', 'late', 'submitted'].includes(payment.status)) {
        return NextResponse.json({ error: 'Payment cannot be approved from current state' }, { status: 400 })
      }
    } else if (action === 'reject') {
      if (payment.status !== 'submitted') {
        return NextResponse.json({ error: 'Payment is not in submitted state' }, { status: 400 })
      }
    }

    const oldStatus = payment.status
    const now = new Date().toISOString()
    
    let updateData: any = {
      verified_at: now,
      verification_notes: notes || null,
    }

    let newStatus = ''

    if (action === 'approve') {
      newStatus = 'paid'
      updateData.status = 'paid'
      updateData.paid_at = now
    } else if (action === 'reject') {
      // User requested: "when rejected automatically return to pending"
      newStatus = 'pending'
      updateData.status = 'pending'
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update(updateData)
      .eq('id', payment.id)

    if (updateError) {
      console.error('Error updating payment:', updateError)
      return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
    }

    // Add to audit log
    await supabase.from('payment_audit_log').insert({
      payment_id: payment.id,
      owner_id: user.id,
      action: action === 'approve' ? 'proof_approved' : 'proof_rejected',
      old_status: oldStatus,
      new_status: newStatus,
      notes: notes || null
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error in POST /api/payments/[id]/verify:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
