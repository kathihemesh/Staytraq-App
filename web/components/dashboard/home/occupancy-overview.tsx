"use client"

// Feature: web-dashboard-parity
// OccupancyOverview (Requirement 4.3)
//
// Shows total, occupied, and vacant bed counts. The component derives the figures
// through the pure `computeOccupancy`, which uses the summary `bed_stats` when
// present and otherwise sums the owner's rooms (total − occupied), clamping vacant
// to a minimum of zero — identical to the Mobile_Dashboard and to the Vacant Beds
// priority card. An owner with no rooms renders 0/0/0 rather than being omitted
// (Req 1.8). All colors resolve from Theme_System tokens.

import { BedDouble } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  computeOccupancy,
  type DashboardSummary,
  type RoomRow,
} from "@/lib/dashboard/home-compute"

/** Props: the raw inputs the pure compute consumes (design contract). */
export interface OccupancyOverviewProps {
  summary: DashboardSummary | null | undefined
  rooms: readonly RoomRow[]
  className?: string
}

export function OccupancyOverview({ summary, rooms, className }: OccupancyOverviewProps) {
  const { total, occupied, vacant } = computeOccupancy(summary, rooms)
  const occupancyPercent = total > 0 ? Math.round((occupied / total) * 100) : 0

  const stats: { label: string; value: number; valueClass: string }[] = [
    { label: "Total Beds", value: total, valueClass: "text-foreground" },
    { label: "Occupied", value: occupied, valueClass: "text-primary" },
    { label: "Vacant", value: vacant, valueClass: "text-success" },
  ]

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BedDouble className="h-4 w-4" aria-hidden="true" />
          </span>
          Occupancy
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Occupied</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
              {occupied}
              <span className="text-base font-medium text-muted-foreground"> / {total}</span>
            </p>
          </div>
          <p className="text-lg font-semibold tabular-nums">{occupancyPercent}%</p>
        </div>

        <Progress value={occupancyPercent} aria-label={`${occupancyPercent}% occupied`} />

        <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{stat.label}</dt>
              <dd className={cn("mt-0.5 text-sm font-semibold tabular-nums", stat.valueClass)}>
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

export default OccupancyOverview
