"use client"

// Feature: web-dashboard-parity
// PaymentVerificationPanel (Requirements 9.1–9.10, 13.5)
//
// Modal detail view for verifying a submitted payment from the dashboard. It
// reuses the patterns established by `web/components/payments/VerificationPanel.tsx`
// and the already-implemented API routes:
//
//   - Proof image:   GET  /api/payments/{id}/screenshot  -> { url } signed URL
//                    (the server signs the object; the URL expires within 3600s
//                    of generation — Req 9.1). On any retrieval/signing failure we
//                    show an inline error and KEEP the panel open (Req 9.8).
//   - Approve/Reject: POST /api/payments/{id}/verify  with { action, notes }
//                    action "approve" -> status "paid"; action "reject" -> status
//                    "pending" with the stored proof reference cleared server-side
//                    and the rejection notes (0–500 chars, empty permitted)
//                    recorded (Req 9.2, 9.3).
//   - Delete:         supabase `payments` delete by id, mirroring the mobile
//                    dashboard's delete path, behind a confirmation prompt
//                    (Req 9.5, 9.9).
//
// Full-screen proof viewing (Req 9.4) and dismissal back to the panel (Req 9.10)
// are handled by an in-component overlay. On a successful action the panel closes
// and reports success through the Toast_Service (Req 9.7). On a failed action it
// reports the failure and triggers a dashboard refresh via `onResolved` (Req 9.6).
// All controls render fully within the viewport with no horizontal scroll at any
// width (Req 13.5) and every color resolves from Theme_System tokens.

import * as React from "react"
import { Check, X, Maximize2, ExternalLink, Loader2, Trash2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { dashboardToast } from "@/lib/dashboard/toast"
import {
  REJECT_NOTES_MAX,
  resolveTenantName,
  type PaymentRow,
} from "@/lib/dashboard/home-compute"

/** Prop contract for the payment verification modal (design contract). */
export interface PaymentVerificationPanelProps {
  /** The payment to verify, or `null` when no payment is selected. */
  payment: PaymentRow | null
  /** Whether the modal is open. */
  open: boolean
  /** Controlled open-state change handler (e.g. close on overlay/Escape). */
  onOpenChange: (open: boolean) => void
  /**
   * Invoked after any verification/delete action resolves (success or failure)
   * so the dashboard can refresh its data (Req 9.6). Success also closes the
   * panel before this fires (Req 9.7).
   */
  onResolved: () => void
}

type ImageState = "idle" | "loading" | "loaded" | "error"

export function PaymentVerificationPanel({
  payment,
  open,
  onOpenChange,
  onResolved,
}: PaymentVerificationPanelProps) {
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null)
  const [imageState, setImageState] = React.useState<ImageState>("idle")
  const [isFullScreen, setIsFullScreen] = React.useState(false)
  const [isRejecting, setIsRejecting] = React.useState(false)
  const [rejectNotes, setRejectNotes] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const paymentId = payment?.id ?? null
  const screenshotPath = payment?.screenshot_path ?? null
  const tenantName = resolveTenantName(payment?.tenants_table?.name)
  const roomNumber = payment?.tenants_table?.rooms_table?.room_number ?? null
  // Only a `submitted` payment is eligible for approve/reject actions (Req 9.2, 9.3).
  const canVerify = payment?.status === "submitted"

  // Reset transient UI state whenever the modal opens or the selected payment
  // changes, so notes/full-screen/reject mode never leak across openings.
  React.useEffect(() => {
    if (!open) return
    setIsRejecting(false)
    setRejectNotes("")
    setIsFullScreen(false)
    setConfirmDelete(false)
    setIsSubmitting(false)
  }, [open, paymentId])

  // Resolve a fresh signed URL whenever the panel opens for a payment with a
  // stored proof. Records without a proof request nothing. A failure to fetch or
  // sign keeps the panel open and surfaces an inline error (Req 9.1, 9.8).
  React.useEffect(() => {
    if (!open || paymentId == null || !screenshotPath) {
      setSignedUrl(null)
      setImageState("idle")
      return
    }

    let cancelled = false
    setImageState("loading")
    setSignedUrl(null)

    fetch(`/api/payments/${paymentId}/screenshot`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`screenshot request failed: ${res.status}`)
        return res.json()
      })
      .then((data: { url?: string }) => {
        if (cancelled) return
        if (data?.url) {
          setSignedUrl(data.url)
          setImageState("loaded")
        } else {
          setImageState("error")
        }
      })
      .catch(() => {
        if (cancelled) return
        setImageState("error")
      })

    return () => {
      cancelled = true
    }
  }, [open, paymentId, screenshotPath])

  const handleVerify = React.useCallback(
    async (action: "approve" | "reject", notes: string) => {
      if (paymentId == null || isSubmitting) return
      setIsSubmitting(true)
      try {
        const res = await fetch(`/api/payments/${paymentId}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, notes: notes.slice(0, REJECT_NOTES_MAX) }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || `verify failed: ${res.status}`)
        }
        // Success: close + success toast (Req 9.7), then refresh dashboard data.
        dashboardToast.success(
          action === "approve" ? "Payment approved" : "Payment rejected",
          {
            description:
              action === "approve"
                ? "The payment is now marked paid."
                : "The payment was returned to pending.",
          },
        )
        onOpenChange(false)
        onResolved()
      } catch {
        // Failure: report + refresh dashboard data; keep the panel open (Req 9.6).
        dashboardToast.error(
          action === "approve" ? "Couldn't approve payment" : "Couldn't reject payment",
          { description: "Please try again." },
        )
        onResolved()
      } finally {
        setIsSubmitting(false)
      }
    },
    [paymentId, isSubmitting, onOpenChange, onResolved],
  )

  const handleRejectClick = React.useCallback(() => {
    if (!isRejecting) {
      setIsRejecting(true)
      return
    }
    void handleVerify("reject", rejectNotes)
  }, [isRejecting, handleVerify, rejectNotes])

  const handleDelete = React.useCallback(async () => {
    if (paymentId == null || isSubmitting) return
    setIsSubmitting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("payments").delete().eq("id", paymentId)
      if (error) throw error
      // Success: close + success toast (Req 9.5, 9.7), then refresh.
      dashboardToast.success("Payment deleted", {
        description: "The billing record has been permanently removed.",
      })
      onOpenChange(false)
      onResolved()
    } catch {
      // Failure: report + refresh; keep the panel open (Req 9.6).
      dashboardToast.error("Couldn't delete payment", { description: "Please try again." })
      onResolved()
    } finally {
      setIsSubmitting(false)
      setConfirmDelete(false)
    }
  }, [paymentId, isSubmitting, onOpenChange, onResolved])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="break-words">{tenantName}</DialogTitle>
          <DialogDescription>
            {roomNumber ? `Room ${roomNumber} · ` : ""}Verify payment proof
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Payment proof image */}
          {screenshotPath ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">Payment proof</p>
              {imageState === "loading" ? (
                <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-border bg-muted/30">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              ) : imageState === "loaded" && signedUrl ? (
                <button
                  type="button"
                  className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted/30"
                  onClick={() => setIsFullScreen(true)}
                  aria-label="View payment proof full screen"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signedUrl}
                    alt="Payment proof"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    onError={() => setImageState("error")}
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-6 w-6 text-white drop-shadow-md" aria-hidden="true" />
                  </span>
                </button>
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
                  Could not load payment proof.
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No payment proof was submitted.</p>
          )}

          {/* UTR / Transaction ID */}
          {payment?.utr_number ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">UTR / Transaction ID</p>
              <p className="font-mono text-sm break-words text-foreground">{payment.utr_number}</p>
            </div>
          ) : null}

          {/* Rejection notes input (0–500 chars, empty permitted — Req 9.3) */}
          {canVerify && isRejecting ? (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <label htmlFor="reject-notes" className="text-sm font-medium text-foreground">
                Reason for rejection (optional)
              </label>
              <Textarea
                id="reject-notes"
                placeholder="E.g., Screenshot is blurry, UTR is missing…"
                value={rejectNotes}
                maxLength={REJECT_NOTES_MAX}
                onChange={(e) => setRejectNotes(e.target.value.slice(0, REJECT_NOTES_MAX))}
                className="h-20 resize-none"
              />
              <p className="text-right text-xs text-muted-foreground tabular-nums">
                {rejectNotes.length}/{REJECT_NOTES_MAX}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {/* Delete is always available; verification actions only when submitted. */}
          <Button
            type="button"
            variant="outline"
            className="w-full text-destructive hover:text-destructive sm:w-auto"
            onClick={() => setConfirmDelete(true)}
            disabled={isSubmitting}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </Button>

          {canVerify ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleRejectClick}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <X className="h-4 w-4" aria-hidden="true" />
                )}
                {isRejecting ? "Confirm reject" : "Reject"}
              </Button>
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => void handleVerify("approve", "")}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                Approve
              </Button>
            </div>
          ) : null}
        </DialogFooter>
      </DialogContent>

      {/* Full-screen proof viewer (Req 9.4); dismiss returns to the panel (Req 9.10). */}
      {isFullScreen && signedUrl ? (
        <div
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setIsFullScreen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Payment proof full screen"
        >
          <div className="relative flex max-h-[90vh] w-full max-w-4xl items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signedUrl}
              alt="Payment proof full screen"
              className="max-h-[90vh] max-w-full rounded-md object-contain"
            />
            <div className="absolute top-4 right-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="rounded-full"
                onClick={(e) => {
                  e.stopPropagation()
                  window.open(signedUrl, "_blank", "noopener,noreferrer")
                }}
                aria-label="Open proof in new tab"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="rounded-full"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsFullScreen(false)
                }}
                aria-label="Close full screen"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirmation prompt (Req 9.9). */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the billing record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}

export default PaymentVerificationPanel
