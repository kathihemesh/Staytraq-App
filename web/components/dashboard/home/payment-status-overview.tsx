"use client"

// Feature: web-dashboard-parity
// PaymentStatusOverview (Requirements 4.4, 4.5, 4.8)
//
// Shows the breakdown of payment statuses — paid, pending, late, submitted,
// rejected — for the active Time_Filter. The component derives the counts through
// the pure `computePaymentStatus`, which uses the This-Month summary
// `payment_status_counts` fast path and otherwise tallies the payments within the
// active Date_Range, identically to the Mobile_Dashboard. A range with no
// payments renders all-zero counts rather than being omitted (Req 1.8). All colors
// resolve from Theme_System tokens.

import { CheckCircle2, Clock, AlertTriangle, Upload, XCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  computePaymentStatus,
  type DashboardSummary,
  type DateRange,
  type PaymentRow,
  type PaymentStatusMetrics,
  type TimeFilter,
} from "@/lib/dashboard/home-compute"

/** Props: the raw inputs the pure compute consumes (design contract). */
export interface PaymentStatusOverviewProps {
  summary: DashboardSummary | null | undefined
  payments: readonly PaymentRow[]
  dateRange: DateRange
  filter: TimeFilter
  className?: string
}

interface StatusSpec {
  key: keyof PaymentStatusMetrics
  label: string
  icon: LucideIcon
  iconClass: string
}

const STATUS_SPECS: readonly StatusSpec[] = [
  { key: "paid", label: "Paid", icon: CheckCircle2, iconClass: "text-success" },
  { key: "pending", label: "Pending", icon: Clock, iconClass: "text-warning" },
  { key: "late", label: "Late", icon: AlertTriangle, iconClass: "text-destructive" },
  { key: "submitted", label: "Submitted", icon: Upload, iconClass: "text-primary" },
  { key: "rejected", label: "Rejected", icon: XCircle, iconClass: "text-destructive" },
]

export function PaymentStatusOverview({
  summary,
  payments,
  dateRange,
  filter,
  className,
}: PaymentStatusOverviewProps) {
  const metrics = computePaymentStatus(summary, payments, dateRange, filter)

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle className="text-base">Payment Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STATUS_SPECS.map((spec) => {
            const Icon = spec.icon
            return (
              <div
                key={spec.key}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-3 text-center"
              >
                <Icon className={cn("h-5 w-5", spec.iconClass)} aria-hidden="true" />
                <span className="text-xl font-bold tabular-nums">{metrics[spec.key]}</span>
                <span className="text-xs font-medium text-muted-foreground">{spec.label}</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default PaymentStatusOverview
