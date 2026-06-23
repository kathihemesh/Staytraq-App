"use client"

// Feature: web-dashboard-parity
// RecentActivity (Requirements 7.1, 7.2, 7.3, 7.5)
//
// The dismissible recent-activity feed: submitted payments and `Under Working`
// complaints, each showing the tenant name, an action label, an optional amount
// (only when present), a status label, and a relative-time label, sorted by
// timestamp descending and capped to the 20 most recent non-dismissed items.
//
// All selection/ordering/cap/dismissal logic and the relative-time label live in
// the pure `computeRecentActivity` (which composes `relativeTimeLabel`), so the
// web and mobile dashboards render identical feeds. Dismissing an item calls the
// `onDismiss(id)` callback (wired to `useDashboardHome().dismissActivity`, which
// persists the id to localStorage — Req 7.3). When there are no non-dismissed
// items, an empty state is rendered in place of the list (Req 7.5). All colors
// resolve from Theme_System tokens.

import { Activity, CreditCard, MessageSquareWarning, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  computeRecentActivity,
  type ActivityView,
  type DashboardActivityRow,
} from "@/lib/dashboard/home-compute"

/** Props: the raw activity rows plus the dismissed set and dismiss callback. */
export interface RecentActivityProps {
  activity: readonly DashboardActivityRow[]
  dismissedActivityIds: ReadonlySet<string>
  /** Remove + persist a dismissal; wired to `useDashboardHome().dismissActivity`. */
  onDismiss: (id: string) => void
  className?: string
}

/** Per-type icon for an activity item. */
const TYPE_ICON: Record<ActivityView["type"], LucideIcon> = {
  payment: CreditCard,
  complaint: MessageSquareWarning,
}

/** Map an activity status to a Badge variant resolved from Theme_System tokens. */
function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status.trim().toLowerCase()) {
    case "success":
      return "default"
    case "late":
      return "destructive"
    case "pending":
    default:
      return "secondary"
  }
}

export function RecentActivity({
  activity,
  dismissedActivityIds,
  onDismiss,
  className,
}: RecentActivityProps) {
  const items = computeRecentActivity(activity, dismissedActivityIds, new Date())

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
            <Activity className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-muted-foreground">No recent activity</p>
            <p className="text-xs text-muted-foreground">
              New submitted payments and working complaints will appear here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const Icon = TYPE_ICON[item.type]
              return (
                <li
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      item.type === "complaint"
                        ? "bg-warning/10 text-warning"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium text-foreground">
                        {item.tenant}
                      </span>
                      <Badge variant={statusVariant(item.status)} className="capitalize">
                        {item.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {item.action}
                      {item.amount ? (
                        <span className="font-medium text-foreground"> · {item.amount}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.relativeTime}</p>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Dismiss activity for ${item.tenant}`}
                    onClick={() => onDismiss(item.id)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export default RecentActivity
