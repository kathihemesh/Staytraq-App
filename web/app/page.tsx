"use client"

// Feature: web-dashboard-parity
// Task 16.1: Complete dashboard home page wiring
//
// This page mounts `useDashboardHome` (the data lifecycle hook), renders all
// sections (Time_Filter, Priority_Cards, Revenue/Occupancy/Payment_Status overviews,
// Monthly_Collection_Chart, Tasks_Section, Recent_Activity, Leads_Section) inside
// the extended Dashboard_Layout, connects the three modal panels (Payment_Verification,
// Complaint_Detail, Lead_Detail), wires the Chatbot_Launcher (conditional on
// chatbot_enabled), and applies the responsive layout: single-column below lg,
// multi-column at lg+ (Requirements 1.1, 1.4–1.8, 13.1–13.3, 13.6, 16.1).
//
// Auth states, loading skeleton, ready/error phases, and the manual refresh control
// are wired to `useDashboardHome()`'s status flags and API (phase, isRefreshing,
// isStale, refresh, retryInitial). Panels open via local state setters and refresh
// dashboard data via `useDashboardHome().refresh()` on success (Req 9.6, 9.7, 10.5).
//
// Layout: below lg, single column; at lg+, multi-column grid matching the mobile
// dashboard's feature parity (Req 13.1, 13.2, 13.6).

import { useState } from "react"
import { Loader2, AlertCircle } from "lucide-react"

import { useDashboardHome } from "@/lib/hooks/useDashboardHome"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"

// Section components
import { TimeFilter } from "@/components/dashboard/home/time-filter"
import { PriorityCards } from "@/components/dashboard/home/priority-cards"
import { RevenueOverview } from "@/components/dashboard/home/revenue-overview"
import { OccupancyOverview } from "@/components/dashboard/home/occupancy-overview"
import { PaymentStatusOverview } from "@/components/dashboard/home/payment-status-overview"
import { MonthlyCollectionChart } from "@/components/dashboard/home/monthly-collection-chart"
import { TasksSection } from "@/components/dashboard/home/tasks-section"
import { RecentActivity } from "@/components/dashboard/home/recent-activity"
import { LeadsSection } from "@/components/dashboard/home/leads-section"
import { ChatbotLauncher } from "@/components/dashboard/home/chatbot-launcher"

// Panel components
import { PaymentVerificationPanel } from "@/components/dashboard/home/payment-verification-panel"
import { ComplaintDetailPanel } from "@/components/dashboard/home/complaint-detail-panel"
import { LeadDetailPanel } from "@/components/dashboard/home/lead-detail-panel"

import type { PaymentRow, ComplaintRow, LeadRow, FollowUpTask } from "@/lib/dashboard/home-compute"

export default function DashboardPage() {
  const hook = useDashboardHome()

  // Panel open state: each panel is controlled by a local open/close flag plus
  // the selected record (payment/complaint/lead). A null record with open=false
  // keeps the panel closed.
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null)
  const [paymentPanelOpen, setPaymentPanelOpen] = useState(false)

  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintRow | null>(null)
  const [complaintPanelOpen, setComplaintPanelOpen] = useState(false)

  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null)
  const [leadPanelOpen, setLeadPanelOpen] = useState(false)

  // Panel open helpers
  const openPaymentPanel = (payment: PaymentRow) => {
    setSelectedPayment(payment)
    setPaymentPanelOpen(true)
  }

  const openComplaintPanel = (complaint: ComplaintRow) => {
    setSelectedComplaint(complaint)
    setComplaintPanelOpen(true)
  }

  const openLeadPanel = (lead: LeadRow) => {
    setSelectedLead(lead)
    setLeadPanelOpen(true)
  }

  // Task activation: follow-up tasks open the Payment_Verification_Panel when the
  // payment is awaiting verification (status `submitted`) and otherwise initiate
  // the follow-up action (Req 6.6). For now the action is just opening the panel;
  // a future enhancement would implement the mobile's follow-up flow.
  const handleFollowUpActivate = (task: FollowUpTask) => {
    openPaymentPanel(task.payment)
  }

  // Auth phase: render a full-screen loader with message while auth resolves and
  // nothing has rendered yet (Req 17.1), stopping after 10s (Req 17.4).
  if (hook.phase === "auth") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  // Skeleton phase: render the dashboard shell + placeholders so positions match
  // the loaded content and there is no layout shift when data arrives (Req 12.1–12.3,
  // 12.6). The skeleton phase is capped at 10s; after that it transitions to error.
  if (hook.phase === "skeleton") {
    return (
      <DashboardLayout title="Dashboard" onRefresh={hook.refresh} isRefreshing={hook.isRefreshing}>
        <div className="flex flex-col gap-6">
          {/* Skeleton: single column of loading placeholders */}
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-80 animate-pulse rounded-lg bg-muted" />
            <div className="h-80 animate-pulse rounded-lg bg-muted" />
          </div>
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </DashboardLayout>
    )
  }

  // Error phase: render an error state with a retry control inside the dashboard
  // shell so the layout and header stay consistent (Req 12.9).
  if (hook.phase === "error") {
    return (
      <DashboardLayout title="Dashboard" onRefresh={hook.refresh} isRefreshing={hook.isRefreshing}>
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16 text-center"
        >
          <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
          <div>
            <p className="text-lg font-semibold text-foreground">
              Couldn't load dashboard data
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
          </div>
          <Button type="button" onClick={hook.retryInitial} disabled={hook.isRefreshing}>
            {hook.isRefreshing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Retrying…
              </>
            ) : (
              "Retry"
            )}
          </Button>
        </div>
      </DashboardLayout>
    )
  }

  // Ready phase: render every section with live data. Layout: single-column below
  // lg, multi-column at lg+ (Req 13.1, 13.2, 13.6).
  return (
    <>
      <DashboardLayout title="Dashboard" onRefresh={hook.refresh} isRefreshing={hook.isRefreshing}>
        <div className="flex flex-col gap-6">
          {/* Time filter */}
          <TimeFilter
            filter={hook.filter}
            customStart={hook.customStart}
            customEnd={hook.customEnd}
            onFilterChange={hook.setFilter}
            onCustomRangeChange={hook.setCustomRange}
          />

          {/* Priority cards: four at-a-glance metrics (Req 3) */}
          <PriorityCards
            summary={hook.summary}
            payments={hook.payments}
            rooms={hook.rooms}
            complaints={hook.complaints}
            dateRange={hook.dateRange}
            filter={hook.filter}
          />

          {/* Revenue, occupancy, payment-status overviews: single column below lg,
              multi-column (3 cols) at lg+ (Req 4, 13.1, 13.2) */}
          <div className="grid gap-6 lg:grid-cols-3">
            <RevenueOverview
              summary={hook.summary}
              payments={hook.payments}
              dateRange={hook.dateRange}
              filter={hook.filter}
            />
            <OccupancyOverview summary={hook.summary} rooms={hook.rooms} />
            <PaymentStatusOverview
              className="hidden lg:flex"
              summary={hook.summary}
              payments={hook.payments}
              dateRange={hook.dateRange}
              filter={hook.filter}
            />
          </div>

          {/* Monthly collection chart (Req 5) */}
          <MonthlyCollectionChart monthly={hook.monthly} payments={hook.payments} />

          {/* Tasks section: follow-up, maintenance, move-out, check-in (Req 6).
              Loading/error states are controlled by the hook's phase; since we're
              in the ready phase, `loading` and `error` are both false. A future
              enhancement could expose per-section status if needed. */}
          <TasksSection
            payments={hook.payments}
            complaints={hook.complaints}
            tenants={hook.tenants}
            dateRange={hook.dateRange}
            filter={hook.filter}
            onFollowUpActivate={handleFollowUpActivate}
          />

          {/* Recent activity and leads: single column below lg, side-by-side at lg+ (Req 7, 8, 13.1) */}
          <div className="grid gap-6 lg:grid-cols-2">
            <RecentActivity
              activity={hook.activity}
              dismissedActivityIds={hook.dismissedActivityIds}
              onDismiss={hook.dismissActivity}
            />
            <LeadsSection leads={hook.leads} onSelectLead={openLeadPanel} />
          </div>
        </div>
      </DashboardLayout>

      {/* Chatbot launcher: rendered only when chatbotEnabled is true (Req 1.2, 1.3).
          Positioned fixed at bottom-right (below lg, above bottom nav; at lg+, lower right). */}
      <ChatbotLauncher chatbotEnabled={hook.chatbotEnabled} />

      {/* Modal panels: each controlled by its open flag + selected record */}
      <PaymentVerificationPanel
        payment={selectedPayment}
        open={paymentPanelOpen}
        onOpenChange={setPaymentPanelOpen}
        onResolved={hook.refresh}
      />

      <ComplaintDetailPanel
        complaint={selectedComplaint}
        open={complaintPanelOpen}
        onOpenChange={setComplaintPanelOpen}
        onResolved={hook.refresh}
      />

      <LeadDetailPanel
        lead={selectedLead}
        open={leadPanelOpen}
        onOpenChange={setLeadPanelOpen}
      />
    </>
  )
}
