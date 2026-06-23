"use client"

// Feature: web-dashboard-parity
// MonthlyCollectionChart (Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7)
//
// Renders the six-month rent-collection trend as a bar chart. Every bar (and its
// ordering, fallback grouping, and 0-collected handling) is derived through the
// pure `computeMonthlyBars`, mirroring the Mobile_Dashboard exactly:
//   - history fast path when the Aggregation_Service monthly history is present;
//   - otherwise the six bars are grouped from the owner's raw payments (Req 5.2);
//   - a month with no collected payments renders a bar with value 0 (Req 5.4).
//
// Selecting a bar toggles a currency amount label for that month via
// `toggleBarSelection`; re-selecting the same bar clears it (Req 5.5, 5.6).
// A 0-collected bar never shows an amount label (`shouldShowBarAmount`, Req 5.7).
// When BOTH the monthly history and the owner's payments are unavailable, no bars
// are rendered and an error indication is shown instead (Req 5.3).
//
// Colors resolve from Theme_System tokens through the chart CSS variables.

import * as React from "react"
import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from "recharts"
import { BarChart3, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import {
  computeMonthlyBars,
  shouldShowBarAmount,
  toggleBarSelection,
  type DashboardCollectionRow,
  type MonthlyBar,
  type PaymentRow,
} from "@/lib/dashboard/home-compute"
import { formatCurrency } from "./format"

/** Props: the raw inputs the pure compute consumes (design contract). */
export interface MonthlyCollectionChartProps {
  monthly: readonly DashboardCollectionRow[] | null | undefined
  payments: readonly PaymentRow[]
  className?: string
}

const chartConfig = {
  collected: { label: "Collected", color: "var(--chart-1)" },
} satisfies ChartConfig

export function MonthlyCollectionChart({
  monthly,
  payments,
  className,
}: MonthlyCollectionChartProps) {
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)

  // Req 5.3: when BOTH the monthly history and the owner's payment records are
  // unavailable, render no bars and an error indication instead.
  const historyUnavailable = !monthly || monthly.length === 0
  const paymentsUnavailable = payments.length === 0
  const dataUnavailable = historyUnavailable && paymentsUnavailable

  const bars = React.useMemo<MonthlyBar[]>(
    () => (dataUnavailable ? [] : computeMonthlyBars(monthly, payments)),
    [dataUnavailable, monthly, payments],
  )

  const handleBarClick = React.useCallback(
    (entry: { key?: string; payload?: { key?: string } } | undefined) => {
      const key = entry?.key ?? entry?.payload?.key
      if (typeof key !== "string") return
      setSelectedKey((current) => toggleBarSelection(current, key))
    },
    [],
  )

  // Custom label content: show the selected, non-zero bar's currency amount only.
  const renderAmountLabel = React.useCallback(
    (props: {
      x?: string | number
      y?: string | number
      width?: string | number
      index?: number
    }) => {
      const { index } = props
      if (index === undefined) return null
      const bar = bars[index]
      if (!bar || bar.key !== selectedKey || !shouldShowBarAmount(bar)) return null
      const x = Number(props.x) || 0
      const y = Number(props.y) || 0
      const width = Number(props.width) || 0
      return (
        <text
          x={x + width / 2}
          y={y - 6}
          textAnchor="middle"
          className="fill-foreground text-xs font-semibold"
        >
          {formatCurrency(bar.collected)}
        </text>
      )
    },
    [bars, selectedKey],
  )

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </span>
          Monthly Collection
        </CardTitle>
      </CardHeader>
      <CardContent>
        {dataUnavailable ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center"
          >
            <AlertCircle className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Collection data could not be loaded.
            </p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
            <BarChart accessibilityLayer data={bars} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <Bar
                dataKey="collected"
                fill="var(--color-collected)"
                radius={[6, 6, 0, 0]}
                cursor="pointer"
                onClick={handleBarClick}
              >
                <LabelList dataKey="collected" content={renderAmountLabel} />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

export default MonthlyCollectionChart
