"use client"

// Feature: web-dashboard-parity
// PriorityCards (Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 1.8)
//
// The four at-a-glance priority cards: Rent Due (count + summed amount),
// Overdue Payments (count + summed amount), Vacant Beds, and Pending Complaints.
//
// The component is given the raw owner-scoped inputs (summary, payments, rooms,
// complaints) plus the active Date_Range and Time_Filter, and derives every
// number through the pure `computePriorityMetrics` so the web and mobile
// dashboards compute identical results. Activating a card navigates to the same
// management destination as the Mobile_Dashboard via `derivePriorityNavTarget`
// (Rent Due / Overdue → /payments, Vacant Beds → /rooms, Pending Complaints →
// /complaints). Zero/empty selections render a count of 0 (and ₹0 amount) rather
// than omitting the card (Req 3.6, 1.8). All colors resolve from Theme_System
// tokens.

import { useRouter } from "next/navigation"
import { CalendarClock, AlertTriangle, BedDouble, MessageSquareWarning } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  computePriorityMetrics,
  derivePriorityNavTarget,
  type ComplaintRow,
  type DashboardSummary,
  type DateRange,
  type PaymentRow,
  type PriorityCard,
  type PriorityNavTarget,
  type RoomRow,
  type TimeFilter,
} from "@/lib/dashboard/home-compute"
import { formatCurrency } from "./format"

/** Props: the raw inputs the pure compute consumes (design contract). */
export interface PriorityCardsProps {
  summary: DashboardSummary | null | undefined
  payments: readonly PaymentRow[]
  rooms: readonly RoomRow[]
  complaints: readonly ComplaintRow[]
  dateRange: DateRange
  filter: TimeFilter
  className?: string
}

/** Maps a navigation target to its management-page route. */
const NAV_ROUTES: Record<PriorityNavTarget, string> = {
  payments: "/payments",
  rooms: "/rooms",
  complaints: "/complaints",
}

interface CardSpec {
  card: PriorityCard
  title: string
  icon: LucideIcon
  primary: string
  secondary?: string
  accent: string
  iconBg: string
}

export function PriorityCards({
  summary,
  payments,
  rooms,
  complaints,
  dateRange,
  filter,
  className,
}: PriorityCardsProps) {
  const router = useRouter()
  const metrics = computePriorityMetrics(summary, payments, rooms, complaints, dateRange, filter)

  const specs: CardSpec[] = [
    {
      card: "rentDue",
      title: "Rent Due",
      icon: CalendarClock,
      primary: `${metrics.rentDue.count}`,
      secondary: formatCurrency(metrics.rentDue.amount),
      accent: "text-primary",
      iconBg: "bg-primary/10 text-primary",
    },
    {
      card: "overdue",
      title: "Overdue",
      icon: AlertTriangle,
      primary: `${metrics.overdue.count}`,
      secondary: formatCurrency(metrics.overdue.amount),
      accent: "text-destructive",
      iconBg: "bg-destructive/10 text-destructive",
    },
    {
      card: "vacantBeds",
      title: "Vacant Beds",
      icon: BedDouble,
      primary: `${metrics.vacantBeds}`,
      accent: "text-foreground",
      iconBg: "bg-muted text-muted-foreground",
    },
    {
      card: "pendingComplaints",
      title: "Pending Complaints",
      icon: MessageSquareWarning,
      primary: `${metrics.pendingComplaints}`,
      accent: "text-warning",
      iconBg: "bg-warning/10 text-warning",
    },
  ]

  const navigate = (card: PriorityCard) => {
    router.push(NAV_ROUTES[derivePriorityNavTarget(card)])
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4",
        className,
      )}
    >
      {specs.map((spec) => {
        const Icon = spec.icon
        return (
          <Card
            key={spec.card}
            role="button"
            tabIndex={0}
            aria-label={`${spec.title}: ${spec.primary}${
              spec.secondary ? `, ${spec.secondary}` : ""
            }`}
            onClick={() => navigate(spec.card)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                navigate(spec.card)
              }
            }}
            className="cursor-pointer py-0 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-muted-foreground">{spec.title}</p>
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    spec.iconBg,
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <div className="min-w-0">
                <p className={cn("text-2xl font-bold tracking-tight sm:text-3xl", spec.accent)}>
                  {spec.primary}
                </p>
                {spec.secondary && (
                  <p className="mt-0.5 truncate text-sm font-medium text-muted-foreground tabular-nums">
                    {spec.secondary}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default PriorityCards
