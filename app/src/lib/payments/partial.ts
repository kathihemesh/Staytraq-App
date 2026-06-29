// Partial-payment helpers (mobile owner side).
//
// A payment row tracks `total_amount` (owed) and `amount_paid` (cumulative
// approved). Each tenant proof is a row in `payment_submissions` (kept so every
// partial screenshot is preserved). The owner approves a proof for a specific
// amount; the running total advances and the record becomes `partially_paid`
// until fully covered, then `paid`. Overpayment is ignored (capped at balance).
//
// `payment_submissions` / `amount_paid` aren't in the generated Supabase types,
// so the client is passed as `any`.

export type SubmissionStatus = "submitted" | "approved" | "rejected"

export interface PaymentSubmission {
  id: number
  payment_id: number
  owner_id: string
  tenant_id: number | null
  amount_approved: number | null
  screenshot_path: string | null
  utr_number: string | null
  payment_method: string | null
  status: SubmissionStatus
  notes: string | null
  submitted_at: string | null
  verified_at: string | null
  created_at: string | null
  /** Resolved signed URL for the screenshot (populated client-side). */
  signedUrl?: string | null
}

export interface PartialPaymentLike {
  id: number
  total_amount: number
  amount_paid?: number | null
  status?: string | null
  paid_at?: string | null
  due_date?: string | null
}

/** Remaining balance for a payment (never negative). */
export function paymentBalance(p: PartialPaymentLike): number {
  const total = Number(p.total_amount) || 0
  const paid = Number(p.amount_paid) || 0
  return Math.max(total - paid, 0)
}

/** True when the record has a partial (but not full) amount recorded. */
export function isPartiallyPaid(p: PartialPaymentLike): boolean {
  const paid = Number(p.amount_paid) || 0
  return paid > 0 && paymentBalance(p) > 0
}

/** Fetch the proof-submission history for a payment, newest first. */
export async function fetchPaymentSubmissions(
  supabase: any,
  paymentId: number,
): Promise<PaymentSubmission[]> {
  const { data, error } = await supabase
    .from("payment_submissions")
    .select(
      "id, payment_id, owner_id, tenant_id, amount_approved, screenshot_path, utr_number, payment_method, status, notes, submitted_at, verified_at, created_at",
    )
    .eq("payment_id", paymentId)
    .order("submitted_at", { ascending: false })
  if (error) {
    console.error("Error fetching payment submissions:", error)
    return []
  }
  return (data || []) as PaymentSubmission[]
}

/** Resolve signed URLs for each submission's screenshot (payment_screenshots bucket). */
export async function signSubmissionScreenshots(
  supabase: any,
  submissions: PaymentSubmission[],
): Promise<PaymentSubmission[]> {
  return Promise.all(
    submissions.map(async (s) => {
      if (!s.screenshot_path) return { ...s, signedUrl: null }
      try {
        const { data } = await supabase.storage
          .from("payment_screenshots")
          .createSignedUrl(s.screenshot_path, 3600)
        return { ...s, signedUrl: data?.signedUrl || null }
      } catch {
        return { ...s, signedUrl: null }
      }
    }),
  )
}

export interface ApproveResult {
  applied: number
  newAmountPaid: number
  newStatus: "paid" | "pending" | "late"
  paidAt: string | null
  isPartial: boolean
}

/**
 * Approve a submission for `amount` (capped at the remaining balance — overpay is
 * ignored). Advances `payments.amount_paid`; the record becomes `paid` when fully
 * covered, otherwise stays `pending` (a "Partial" badge is derived from
 * `amount_paid`, not a separate status). Marks the submission approved + audits.
 */
export async function approveSubmission(
  supabase: any,
  args: {
    payment: PartialPaymentLike
    submission: PaymentSubmission
    amount: number
    ownerId: string
  },
): Promise<ApproveResult> {
  const { payment, submission, amount, ownerId } = args
  const balance = paymentBalance(payment)
  const applied = Math.max(0, Math.min(Number(amount) || 0, balance))
  const newAmountPaid = (Number(payment.amount_paid) || 0) + applied
  const fullyPaid = newAmountPaid >= (Number(payment.total_amount) || 0)
  const todayStr = new Date().toISOString().split("T")[0]
  const isOverdue = payment.due_date ? payment.due_date < todayStr : false
  const newStatus: "paid" | "pending" | "late" = fullyPaid ? "paid" : (isOverdue ? "late" : "pending")
  const now = new Date().toISOString()
  const paidAt = fullyPaid ? now : payment.paid_at ?? null

  const { error: payErr } = await supabase
    .from("payments")
    .update({
      amount_paid: newAmountPaid,
      status: newStatus,
      verified_at: now,
      paid_at: paidAt,
    })
    .eq("id", payment.id)
  if (payErr) throw payErr

  const { error: subErr } = await supabase
    .from("payment_submissions")
    .update({ status: "approved", amount_approved: applied, verified_at: now })
    .eq("id", submission.id)
  if (subErr) throw subErr

  await supabase.from("payment_audit_log").insert({
    payment_id: payment.id,
    owner_id: ownerId,
    action: fullyPaid ? "proof_approved" : "partial_approved",
    old_status: payment.status ?? null,
    new_status: newStatus,
    notes: fullyPaid
      ? `Approved ₹${applied}; payment fully settled.`
      : `Partial approval of ₹${applied}. Paid ₹${newAmountPaid} of ₹${payment.total_amount}.`,
    metadata: { applied, amount_paid: newAmountPaid, submission_id: submission.id },
  })

  return { applied, newAmountPaid, newStatus, paidAt, isPartial: !fullyPaid }
}

/**
 * Reject a submission with a reason. Leaves `amount_paid` untouched; the payment
 * reverts to `pending` (any prior partial amount is still reflected via
 * `amount_paid` and the derived "Partial" badge).
 */
export async function rejectSubmission(
  supabase: any,
  args: {
    payment: PartialPaymentLike
    submission: PaymentSubmission
    ownerId: string
    notes: string
  },
): Promise<{ newStatus: "pending" | "late" }> {
  const { payment, submission, ownerId, notes } = args
  const todayStr = new Date().toISOString().split("T")[0]
  const isOverdue = payment.due_date ? payment.due_date < todayStr : false
  const newStatus: "pending" | "late" = isOverdue ? "late" : "pending"
  const now = new Date().toISOString()

  const { error: subErr } = await supabase
    .from("payment_submissions")
    .update({ status: "rejected", notes: notes || null, verified_at: now })
    .eq("id", submission.id)
  if (subErr) throw subErr

  const { error: payErr } = await supabase
    .from("payments")
    .update({ status: newStatus, verification_notes: notes || null })
    .eq("id", payment.id)
  if (payErr) throw payErr

  await supabase.from("payment_audit_log").insert({
    payment_id: payment.id,
    owner_id: ownerId,
    action: "proof_rejected",
    old_status: payment.status ?? null,
    new_status: newStatus,
    notes: notes || null,
    metadata: { submission_id: submission.id },
  })

  return { newStatus }
}
