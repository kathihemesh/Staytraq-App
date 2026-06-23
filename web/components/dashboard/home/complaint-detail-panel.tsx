"use client"

// Feature: web-dashboard-parity
// ComplaintDetailPanel (Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 13.5)
//
// Modal detail view for a single complaint. It shows the complaint's current
// status and existing owner response (an empty field when none, Req 10.1), lets
// the Owner set the status to exactly one of `Under Working` / `Resolved` /
// `Ignored` preselected to the complaint's current status (Req 10.2), and caps
// the owner-response input at 2,000 characters (Req 10.3).
//
// On save the response is validated via `validateOwnerResponse` (which strips
// HTML and enforces the max length) and persisted together with the selected
// status and an `updated_at` timestamp set to the save time, mirroring the
// mobile dashboard's `supabase.from("complaints").update(...)` path exactly
// (Req 10.4). On success the panel closes, a success toast is shown, and
// `onResolved` is called so the complaint-derived sections refresh (Req 10.5).
// On failure the panel stays open, the selected status and entered response are
// retained, and an error toast is shown (Req 10.6).
//
// All colors resolve from Theme_System tokens and every control stays within the
// viewport at every width (Req 13.5).

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { createClient } from "@/lib/supabase/client"
import { dashboardToast } from "@/lib/dashboard/toast"
import {
  validateOwnerResponse,
  type ComplaintRow,
} from "@/lib/dashboard/home-compute"

/** The exact set of statuses the Owner may assign to a complaint (Req 10.2). */
const COMPLAINT_STATUS_OPTIONS = ["Under Working", "Resolved", "Ignored"] as const

/** Maximum characters accepted in the owner-response input (Req 10.3). */
const OWNER_RESPONSE_INPUT_MAX = 2000

/** Prop contract for the complaint detail modal (design contract). */
export interface ComplaintDetailPanelProps {
  /** The complaint to display, or `null` when no complaint is selected. */
  complaint: ComplaintRow | null
  /** Whether the modal is open. */
  open: boolean
  /** Controlled open-state change handler (e.g. close on overlay/Escape). */
  onOpenChange: (open: boolean) => void
  /** Invoked after a successful save so complaint-derived sections refresh (Req 10.5). */
  onResolved: () => void
}

export function ComplaintDetailPanel({
  complaint,
  open,
  onOpenChange,
  onResolved,
}: ComplaintDetailPanelProps) {
  const [status, setStatus] = React.useState<string>("")
  const [response, setResponse] = React.useState<string>("")
  const [isSaving, setIsSaving] = React.useState(false)

  // Preselect the complaint's current status and existing owner response when a
  // complaint is opened; render an empty field when there is no stored response
  // (Req 10.1, 10.2). Resetting on complaint id keeps the inputs in sync when the
  // Owner navigates from one complaint to another without closing the panel.
  React.useEffect(() => {
    if (complaint == null) return
    setStatus(complaint.status ?? "")
    setResponse(complaint.owner_response ?? "")
  }, [complaint?.id, complaint?.status, complaint?.owner_response])

  const handleSave = React.useCallback(async () => {
    if (complaint == null) return

    // Validate + prepare the response for persistence: HTML is stripped and the
    // max length enforced (Req 10.4). On rejection keep the panel open and retain
    // the Owner's input (Req 10.6).
    const validation = validateOwnerResponse(response)
    if (!validation.ok) {
      dashboardToast.error("Response is too long", {
        description: "Shorten the response and try again.",
      })
      return
    }

    const strippedResponse = validation.value
    const responseToStore =
      strippedResponse.trim().length > 0 ? strippedResponse : null

    setIsSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("complaints")
        .update({
          status,
          owner_response: responseToStore,
          updated_at: new Date().toISOString(),
        })
        .eq("id", complaint.id)

      if (error) throw error

      // Success: close, toast, and refresh complaint-derived sections (Req 10.5).
      dashboardToast.success("Complaint updated", {
        description: "Changes saved successfully.",
      })
      onOpenChange(false)
      onResolved()
    } catch {
      // Failure: keep panel open, retain status + response, toast error (Req 10.6).
      dashboardToast.error("Couldn't update complaint", {
        description: "Your changes were not saved. Try again.",
      })
    } finally {
      setIsSaving(false)
    }
  }, [complaint, status, response, onOpenChange, onResolved])

  const message =
    typeof complaint?.complaint_message === "string"
      ? complaint.complaint_message
      : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complaint details</DialogTitle>
          <DialogDescription>
            Update the complaint status and respond to the tenant.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {message.trim().length > 0 ? (
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Complaint</p>
              {/* Inert: raw message rendered as React children; markup stays literal. */}
              <p className="mt-1 text-sm break-words whitespace-pre-wrap text-foreground">
                {message}
              </p>
            </div>
          ) : null}

          <div className="min-w-0">
            <label
              htmlFor="complaint-status"
              className="text-xs font-medium text-muted-foreground"
            >
              Status
            </label>
            <Select
              value={status}
              onValueChange={setStatus}
              disabled={isSaving}
            >
              <SelectTrigger id="complaint-status" className="mt-1 w-full">
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent>
                {COMPLAINT_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="complaint-owner-response"
              className="text-xs font-medium text-muted-foreground"
            >
              Owner response
            </label>
            <Textarea
              id="complaint-owner-response"
              className="mt-1 min-h-24 resize-none"
              placeholder="Write a response to the tenant…"
              value={response}
              maxLength={OWNER_RESPONSE_INPUT_MAX}
              onChange={(event) => setResponse(event.target.value)}
              disabled={isSaving}
            />
            <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
              {response.length}/{OWNER_RESPONSE_INPUT_MAX}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={handleSave}
            disabled={isSaving || complaint == null}
          >
            {isSaving ? (
              <>
                <Spinner className="h-4 w-4" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ComplaintDetailPanel
