"use client"

// Feature: web-dashboard-parity
// LeadDetailPanel (Requirements 8.2, 8.3, 8.4, 13.5)
//
// Modal detail view for a single enquiry lead. Shows the lead's name, phone,
// enquiry details, and creation timestamp. Owner-/tenant-provided text (the lead
// name and enquiry details) is rendered as INERT content (Req 18.1): the raw
// string is passed as React children so React escapes it and any embedded markup
// or script is displayed as literal characters and never interpreted by the
// browser. We deliberately do NOT use `dangerouslySetInnerHTML`. (`sanitizeInert`
// from `home-compute.ts` exists for innerHTML contexts; here React's own text
// escaping is the correct inert mechanism, so layering entity-encoding on top
// would only surface literal `&lt;`/`&amp;` sequences to the Owner.)
//
// The copy-phone action is enabled only when `canCopyPhone(lead)` is true. On
// click it writes the lead's phone to the clipboard, reporting success or
// failure through the Toast_Service (Req 8.3, 8.4) and leaving the lead data
// unchanged. All controls stay fully within the viewport at every width
// (Req 13.5) and all colors resolve from Theme_System tokens.

import * as React from "react"
import { Copy, Phone } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { dashboardToast } from "@/lib/dashboard/toast"
import {
  canCopyPhone,
  resolveTenantName,
  type LeadRow,
} from "@/lib/dashboard/home-compute"

/** Prop contract for the lead detail modal (design contract). */
export interface LeadDetailPanelProps {
  /** The lead to display, or `null` when no lead is selected. */
  lead: LeadRow | null
  /** Whether the modal is open. */
  open: boolean
  /** Controlled open-state change handler (e.g. close on overlay/Escape). */
  onOpenChange: (open: boolean) => void
}

/** Format an ISO/timestamp string for display; empty string for unparseable input. */
function formatCreated(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) return ""
  const ts = new Date(value)
  if (Number.isNaN(ts.getTime())) return ""
  return ts.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function LeadDetailPanel({ lead, open, onOpenChange }: LeadDetailPanelProps) {
  const name = resolveTenantName(lead?.name)
  const phone = typeof lead?.phone === "string" ? lead.phone.trim() : ""
  const details = typeof lead?.details === "string" ? lead.details : ""
  const created = formatCreated(lead?.created_at)
  const copyEnabled = lead != null && canCopyPhone(lead)

  const handleCopyPhone = React.useCallback(async () => {
    if (lead == null || !canCopyPhone(lead) || lead.phone == null) return
    try {
      await navigator.clipboard.writeText(lead.phone)
      dashboardToast.success("Phone number copied", { description: lead.phone })
    } catch {
      dashboardToast.error("Couldn't copy phone number", {
        description: "Copy the number manually and try again.",
      })
    }
  }, [lead])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          {/* Inert: raw name rendered as React children (React escapes markup). */}
          <DialogTitle className="break-words">{name}</DialogTitle>
          <DialogDescription>Lead enquiry details</DialogDescription>
        </DialogHeader>

        <dl className="flex flex-col gap-4">
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Phone</dt>
            <dd className="mt-1 flex items-center gap-2 text-sm font-medium tabular-nums break-words text-foreground">
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {/* Inert: phone rendered as React children. */}
              <span className="min-w-0 break-words">{phone || "—"}</span>
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Enquiry details</dt>
            {/* Inert: raw details rendered as React children; markup stays literal. */}
            <dd className="mt-1 text-sm break-words whitespace-pre-wrap text-foreground">
              {details.trim().length > 0 ? details : "No details provided."}
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Created</dt>
            <dd className="mt-1 text-sm tabular-nums text-foreground">{created || "—"}</dd>
          </div>
        </dl>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleCopyPhone}
            disabled={!copyEnabled}
            aria-label="Copy phone number"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy phone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default LeadDetailPanel
