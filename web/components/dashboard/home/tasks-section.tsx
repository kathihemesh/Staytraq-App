"use client"

// Feature: web-dashboard-parity
// TasksSection (Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9)
//
// The actionable task list for the active Time_Filter. Renders a period-specific
// heading (`tasksHeading`) and four task categories, each derived through the
// pure compute functions so the web and mobile dashboards produce identical
// lists:
//   - Follow-up payments  (`computeFollowUpTasks`) — tenant, room, amount, due date
//   - Maintenance         (`computeMaintenanceTasks`) — message, room / Anonymous
//   - Move-out            (`computeMoveTasks().moveOut`) — tenant, room, exit date
//   - Check-in            (`computeMoveTasks().checkIn`) — tenant, room, move-in date
//
// Each category renders its own empty-state indication when it has no items
// (Req 6.7). Activating a follow-up task calls `onFollowUpActivate(task)`; the
// page opens the Payment_Verification_Panel when the payment is awaiting
// verification (status `submitted`) and otherwise initiates the follow-up action
// (Req 6.6). While `loading`, only a loading indication is shown and NO partial
// lists are rendered (Req 6.8). On `error`, an error indication is shown while the
// current Time_Filter heading (the filter selection) is preserved (Req 6.9).
// All colors resolve from Theme_System tokens.

import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  LogOut,
  LogIn,
  Wrench,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  computeFollowUpTasks,
  computeMaintenanceTasks,
  computeMoveTasks,
  tasksHeading,
  type ComplaintRow,
  type DateRange,
  type FollowUpTask,
  type PaymentRow,
  type TenantRow,
  type TimeFilter,
} from "@/lib/dashboard/home-compute"
import { formatCurrency } from "./format"

/** Props: the raw inputs the pure compute consumes plus status flags + callback. */
export interface TasksSectionProps {
  payments: readonly PaymentRow[]
  complaints: readonly ComplaintRow[]
  tenants: readonly TenantRow[]
  dateRange: DateRange
  filter: TimeFilter
  /** While true, show a loading indication and NO partial lists (Req 6.8). */
  loading?: boolean
  /** While true, show an error indication; the filter heading is preserved (Req 6.9). */
  error?: boolean
  /**
   * Activate a follow-up payment task (Req 6.6). The page opens the
   * Payment_Verification_Panel when `task.payment.status` is `submitted`
   * (awaiting verification) and otherwise initiates the follow-up action.
   */
  onFollowUpActivate?: (task: FollowUpTask) => void
  className?: string
}

/** Format an ISO/date string to a short local date, falling back to a dash. */
function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

/** A category header row with icon, label, and item count. */
function CategoryHeader({
  icon: Icon,
  label,
  count,
  iconClass,
}: {
  icon: LucideIcon
  label: string
  count: number
  iconClass: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn("flex h-7 w-7 items-center justify-center rounded-lg", iconClass)}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <Badge variant="secondary" className="ml-auto tabular-nums">
        {count}
      </Badge>
    </div>
  )
}

/** The actionable task list for the active Time_Filter. */

export function TasksSection({
  payments,
  complaints,
  tenants,
  dateRange,
  filter,
  loading = false,
  error = false,
  onFollowUpActivate,
  className,
}: TasksSectionProps) {
  const heading = tasksHeading(filter)

  // Compute every category up front; only rendered when not loading/error so no
  // partial lists leak through the loading/error indications (Req 6.8, 6.9).
  const followUp = computeFollowUpTasks(payments, dateRange, filter)
  const maintenance = computeMaintenanceTasks(complaints, tenants)
  const { moveOut, checkIn } = computeMoveTasks(tenants, dateRange)

  // Only sections that have records are rendered (parity with the mobile app).
  // When every category is empty, a single overall empty state is shown instead
  // of four per-category empty states.
  const allEmpty =
    followUp.length === 0 &&
    maintenance.length === 0 &&
    moveOut.length === 0 &&
    checkIn.length === 0

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
          </span>
          {heading}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          // Req 6.8: loading indication, NO partial lists.
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center"
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Loading tasks…</p>
          </div>
        ) : error ? (
          // Req 6.9: error indication; the filter heading above is preserved.
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center"
          >
            <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Tasks could not be loaded. Please try again.
            </p>
          </div>
        ) : allEmpty ? (
          // Parity with mobile: a single overall empty state when nothing is due.
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
            <CheckCircle2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">No tasks for this period.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Follow-up payments (Req 6.2, 6.6) */}
            {followUp.length > 0 && (
              <section className="flex flex-col gap-3">
                <CategoryHeader
                  icon={CalendarClock}
                  label="Follow-up Payments"
                  count={followUp.length}
                  iconClass="bg-primary/10 text-primary"
                />
                <ul className="flex flex-col gap-2">
                  {followUp.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => onFollowUpActivate?.(task)}
                        className="flex w-full items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-medium text-foreground">
                              {task.tenantName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Room {task.roomNumber}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Due {formatDate(task.dueDate)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-foreground tabular-nums">
                          {formatCurrency(task.amount)}
                        </span>
                        <ArrowRight
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Maintenance (Req 6.3) */}
            {maintenance.length > 0 && (
              <section className="flex flex-col gap-3">
                <CategoryHeader
                  icon={Wrench}
                  label="Maintenance"
                  count={maintenance.length}
                  iconClass="bg-warning/10 text-warning"
                />
                <ul className="flex flex-col gap-2">
                  {maintenance.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge
                            variant={task.roomNumber === "Anonymous" ? "outline" : "secondary"}
                          >
                            {task.roomNumber === "Anonymous"
                              ? "Anonymous"
                              : `Room ${task.roomNumber}`}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {task.message || "—"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Move-out (Req 6.4) */}
            {moveOut.length > 0 && (
              <section className="flex flex-col gap-3">
                <CategoryHeader
                  icon={LogOut}
                  label="Move-out"
                  count={moveOut.length}
                  iconClass="bg-destructive/10 text-destructive"
                />
                <ul className="flex flex-col gap-2">
                  {moveOut.map((task) => (
                    <li key={task.id}>
                      <Link
                        href={`/tenants?status=notice_period&search=${encodeURIComponent(task.tenantName)}`}
                        className="flex w-full items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-medium text-foreground">
                              {task.tenantName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Room {task.roomNumber}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Exit {formatDate(task.date)}
                          </p>
                        </div>
                        <ArrowRight
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Check-in (Req 6.5) */}
            {checkIn.length > 0 && (
              <section className="flex flex-col gap-3">
                <CategoryHeader
                  icon={LogIn}
                  label="Check-in"
                  count={checkIn.length}
                  iconClass="bg-primary/10 text-primary"
                />
                <ul className="flex flex-col gap-2">
                  {checkIn.map((task) => (
                    <li key={task.id}>
                      <Link
                        href={`/tenants?search=${encodeURIComponent(task.tenantName)}`}
                        className="flex w-full items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-medium text-foreground">
                              {task.tenantName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Room {task.roomNumber}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Check-in {formatDate(task.date)}
                          </p>
                        </div>
                        <ArrowRight
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default TasksSection
