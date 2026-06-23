"use client"

// Feature: web-dashboard-parity
// RevenueOverview (Requirements 4.1, 4.2, 4.6, 4.7)
//
// Shows collected, pending, and expected (collected + pending) amounts for the
// active Time_Filter plus a collected-vs-expected percentage. The component is
// given the raw inputs and derives every figure through the pure `computeRevenue`,
// which applies the This-Month summary fast path and the record-level fallback
// (and the safe 0-when-expected-is-0 percentage) identically to the
// Mobile_Dashboard. A range with no payments renders ₹0 / 0% rather than being
// omitted (Req 1.8). All colors resolve from Theme_System tokens.

import { TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  computeRevenue,
  type DashboardSummary,
  type DateRange,
  type PaymentRow,
  type TimeFilter,
} from "@/lib/dashboard/home-compute"
import { formatCurrency } from "./format"

/** Props: the raw inputs the pure compute consumes (design contract). */
export interface RevenueOverviewProps {
  summary: DashboardSummary | null | undefined
  payments: readonly PaymentRow[]
  dateRange: DateRange
  filter: TimeFilter
  className?: string
}

export function RevenueOverview({
  summary,
  payments,
  dateRange,
  filter,
  className,
}: RevenueOverviewProps) {
  const { collected, pending, expected, percent } = computeRevenue(
    summary,
    payments,
    dateRange,
    filter,
  )

  const rows: { label: string; value: number; valueClass: string }[] = [
    { label: "Collected", value: collected, valueClass: "text-success" },
    { label: "Pending", value: pending, valueClass: "text-warning" },
    { label: "Expected", value: expected, valueClass: "text-foreground" },
  ]

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
          </span>
          Revenue Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Collected</p>
            <p className="text-2xl font-bold tracking-tight text-success tabular-nums sm:text-3xl">
              {formatCurrency(collected)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">of {formatCurrency(expected)}</p>
            <p className="text-lg font-semibold tabular-nums">{percent}%</p>
          </div>
        </div>

        <Progress value={percent} aria-label={`${percent}% collected`} />

        <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{row.label}</dt>
              <dd className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums", row.valueClass)}>
                {formatCurrency(row.value)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

export default RevenueOverview
