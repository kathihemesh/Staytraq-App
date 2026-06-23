"use client"

// Feature: web-dashboard-parity
// LeadsSection (Requirements 8.1, 8.3, 8.4, 8.5, 8.6)
//
// Lists the owner's enquiry leads, each showing the lead's name (a fixed
// placeholder substitutes a missing/empty name), phone, and creation timestamp.
// Ordering (creation time descending, then lead id descending) and the name
// placeholder are produced by the pure `computeLeads`, so the web and mobile
// dashboards render identical lists. A copy-phone action is presented enabled
// only when `canCopyPhone` is true (a non-empty phone — Req 8.5); activating it
// writes the phone to the clipboard and confirms via the Toast_Service (Req 8.3),
// reporting a clipboard failure via the Toast_Service while leaving the lead data
// unchanged (Req 8.4). Selecting a lead row opens its detail view through
// `onSelectLead`. With no leads, an empty state is rendered (Req 8.6). All colors
// resolve from Theme_System tokens.

import { Copy, Phone, UserRound, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { dashboardToast } from "@/lib/dashboard/toast"
import {
  canCopyPhone,
  computeLeads,
  type LeadRow,
} from "@/lib/dashboard/home-compute"

/** Props: the raw leads plus the detail-open callback (design contract). */
export interface LeadsSectionProps {
  leads: readonly LeadRow[]
  /** Open the lead detail view for the selected lead. */
  onSelectLead: (lead: LeadRow) => void
  className?: string
}

/** Render a lead's creation timestamp, falling back to the raw value if unparseable. */
function formatCreated(created: string): string {
  const date = new Date(created)
  if (Number.isNaN(date.getTime())) return created
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function LeadsSection({ leads, onSelectLead, className }: LeadsSectionProps) {
  const views = computeLeads(leads)
  const leadById = new Map(leads.map((lead) => [lead.id, lead]))

  const copyPhone = async (phone: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable")
      }
      await navigator.clipboard.writeText(phone)
      dashboardToast.success("Phone number copied")
    } catch {
      dashboardToast.error("Could not copy phone number")
    }
  }

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-4 w-4" aria-hidden="true" />
          </span>
          Leads
        </CardTitle>
      </CardHeader>
      <CardContent>
        {views.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
            <Users className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-muted-foreground">No leads yet</p>
            <p className="text-xs text-muted-foreground">
              Enquiry leads from prospective tenants will appear here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {views.map((view) => {
              const canCopy = canCopyPhone(view)
              return (
                <li key={view.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Open lead ${view.name}`}
                    onClick={() => {
                      const lead = leadById.get(view.id)
                      if (lead) onSelectLead(lead)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        const lead = leadById.get(view.id)
                        if (lead) onSelectLead(lead)
                      }
                    }}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserRound className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{view.name}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {view.phone || "No phone"}
                      </p>
                    </div>

                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatCreated(view.created_at)}
                    </span>

                    {canCopy ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label={`Copy phone number for ${view.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          void copyPhone(view.phone)
                        }}
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export default LeadsSection
