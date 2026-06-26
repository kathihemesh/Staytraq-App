"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth-provider"
import { useIsMobile } from "@/lib/hooks/useIsMobile"

// Desktop components
import { SummaryCards } from "@/components/payments/SummaryCards"
import { FilterBar } from "@/components/payments/FilterBar"
import { PaymentsTable } from "@/components/payments/PaymentsTable"
import { PaymentDrawer } from "@/components/payments/PaymentDrawer"

// Mobile components
import { MobileSummaryCards } from "@/components/payments/mobile/MobileSummaryCards"
import { MobileFilterBar } from "@/components/payments/mobile/MobileFilterBar"
import { MobilePaymentList } from "@/components/payments/mobile/MobilePaymentList"
import { MobilePaymentDrawer } from "@/components/payments/mobile/MobilePaymentDrawer"

import { ToastContainer, ToastItem } from "@/components/payments/Toast"
import { usePaymentFilters, Payment } from "@/components/payments/usePaymentFilters"

// Server-side, bounded pagination data layer (replaces the old 200-row fetch).
import {
  fetchPaymentsPage,
  fetchMonthSummary,
  buildPageArgs,
  buildSummaryArgs,
  reducePageResult,
  filterSignature,
  initialPageState,
  summaryCardTotals,
  type PageState,
  type PaymentRow,
  type PaymentFilters,
  type MonthSummary,
} from "@/lib/payments/payments-page"

// ✅ IMPORTANT: Create Supabase client OUTSIDE component
const supabase = createClient()

/**
 * Parse the `usePaymentFilters` month string (e.g. "June 2026") into the numeric
 * month (1-12) and year the RPCs expect. Falls back to the current month/year for
 * any malformed value so a request is never built with NaN.
 */
function parseSelectedMonth(value: string): { month: number; year: number } {
  const parts = value.trim().split(/\s+/)
  const monthIndex = new Date(`${parts[0]} 1, 2000`).getMonth()
  const year = Number(parts[1])
  const now = new Date()
  return {
    month: Number.isNaN(monthIndex) ? now.getMonth() + 1 : monthIndex + 1,
    year: Number.isFinite(year) && year > 0 ? year : now.getFullYear(),
  }
}

/**
 * Adapt a server `PaymentRow` into the existing `Payment` view type consumed by
 * `usePaymentFilters`, `PaymentsTable`, and the drawers. The `Payment` shape is
 * unchanged. The list passes only `screenshot_path` through — it never resolves a
 * signed URL. The detail drawer resolves a fresh signed URL on open (task 8.1).
 */
function rowToPayment(r: PaymentRow): Payment {
  const monthName =
    r.month != null
      ? new Date(2000, Number(r.month) - 1).toLocaleString("en-US", { month: "long" })
      : ""

  return {
    id: String(r.id),
    tenantName: r.tenant_name || "Unknown",
    roomNumber: r.room_number || "—",

    amount: Number(r.total_amount) || 0,
    baseRent: Number(r.rent_amount) || 0,
    extraCharges: Number(r.extra_charges) || 0,

    status: (r.status || "pending") as "paid" | "pending" | "late" | "submitted",

    dueDate: r.due_date || "",
    paidDate: r.paid_at ? r.paid_at.split("T")[0] : undefined,

    month: monthName,
    year: Number(r.year) || 0,

    payment_token: r.payment_token ?? undefined,
    screenshot_path: r.screenshot_path ?? null,
    utr_number: r.utr_number ?? undefined,
    verification_notes: r.verification_notes ?? undefined,
  }
}

export default function PaymentsPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()

  // Bounded, server-driven pagination state (rows currently displayed + offset/flags).
  const [pageState, setPageState] = useState<PageState>(() =>
    initialPageState({ month: 0, year: 0, status: "all", search: "" }),
  )
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Month summary, sourced exclusively from `get_payment_month_summary` (never the
  // loaded pages). `null` means unavailable — we never substitute page-derived totals.
  const [summary, setSummary] = useState<MonthSummary | null>(null)

  // Monotonic request id so superseded responses still apply to their own filter view.
  const requestIdRef = useRef(0)

  // Drawer state
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Toast state
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((type: ToastItem["type"], message: string) => {
    const newToast: ToastItem = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      message,
    }
    setToasts((prev) => [...prev, newToast])
  }, [])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  // Map the loaded server rows into the existing `Payment` view type.
  const mappedPayments = useMemo(
    () => pageState.rows.map(rowToPayment),
    [pageState.rows],
  )

  // Filters (month/year selection, status, debounced search, sort) live in the hook.
  // The hook no longer filters the dataset locally — it only sorts the loaded page.
  const {
    searchValue,
    setSearchValue,
    statusFilter,
    setStatusFilter,
    sortField,
    sortDirection,
    toggleSort,
    selectedMonth,
    setSelectedMonth,
    debouncedSearch,
    filteredPayments,
  } = usePaymentFilters(mappedPayments)

  // Derive the server-side filter set from the hook's UI state.
  const filters: PaymentFilters = useMemo(() => {
    const { month, year } = parseSelectedMonth(selectedMonth)
    return { month, year, status: statusFilter, search: debouncedSearch }
  }, [selectedMonth, statusFilter, debouncedSearch])

  const filtersSig = filterSignature(filters)

  // Load one page of payments. `pageOffset === 0` is a first page (initial load,
  // filter change, or refresh) and replaces the rows; `pageOffset > 0` appends.
  // Previous results stay visible because the rows only change when the result
  // arrives (the reducer never clears rows at request start).
  const loadPage = useCallback(
    async (f: PaymentFilters, pageOffset: number) => {
      if (!user?.id) return

      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      const sig = filterSignature(f)

      if (pageOffset > 0) setIsLoadingMore(true)

      const result = await fetchPaymentsPage(supabase, buildPageArgs(user.id, f, pageOffset))

      if (result.ok) {
        setPageState((prev) =>
          pageOffset === 0
            ? // First page: replace by reducing onto a fresh (empty) state for this
              // filter signature, so a same-filter refresh does not duplicate rows.
              reducePageResult(initialPageState(f), result.data, requestId, sig)
            : // Next page: append to the existing rows under the same signature.
              reducePageResult(prev, result.data, requestId, sig)
        )
      } else {
        // Keep the previously displayed rows visible on error (Req 4.4 / 6.1).
        addToast("error", "Failed to load payments.")
      }

      if (pageOffset > 0) setIsLoadingMore(false)
      setIsInitialLoading(false)
    },
    [user?.id, addToast],
  )

  // Load the month summary for the selected month/year. On failure we keep the
  // last-known/empty summary and never substitute page-derived totals (Req 5.10).
  const loadSummary = useCallback(
    async (f: PaymentFilters) => {
      if (!user?.id) return
      const result = await fetchMonthSummary(supabase, buildSummaryArgs(user.id, f))
      if (result.ok) {
        setSummary(result.data)
      } else {
        addToast("error", "Failed to load payment summary.")
      }
    },
    [user?.id, addToast],
  )

  // First page for the current filters whenever they change (Req 4.6: offset resets
  // to 0 on any month/year/status/search change).
  useEffect(() => {
    if (!user?.id) return
    loadPage(filters, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersSig, user?.id])

  // Summary depends only on month/year.
  useEffect(() => {
    if (!user?.id) return
    loadSummary(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.month, filters.year, user?.id])

  // Infinite load: request the next page, appending to the current rows.
  const handleLoadMore = useCallback(() => {
    if (pageState.fullyLoaded || isLoadingMore || isInitialLoading) return
    loadPage(filters, pageState.pageOffset)
  }, [
    pageState.fullyLoaded,
    pageState.pageOffset,
    isLoadingMore,
    isInitialLoading,
    filters,
    loadPage,
  ])

  // Re-request the current first page + summary (mobile pull-to-refresh / retry).
  const refresh = useCallback(() => {
    loadPage(filters, 0)
    loadSummary(filters)
  }, [filters, loadPage, loadSummary])

  const hasMore = !pageState.fullyLoaded

  // Optimistically patch a loaded row's status (used by the action handlers).
  const patchRow = useCallback((id: string, updates: Partial<PaymentRow>) => {
    setPageState((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (String(r.id) === id ? { ...r, ...updates } : r)),
    }))
  }, [])

  // MARK PAID
  const handleMarkPaid = async (
    id: string,
    tenantName: string,
    roomNumber: string
  ) => {
    const paidAt = new Date().toISOString()
    const paidDate = paidAt.split("T")[0]

    // Optimistic update
    patchRow(id, { status: "paid", paid_at: paidAt })

    // Update drawer
    if (selectedPayment?.id === id) {
      setSelectedPayment((prev) =>
        prev ? { ...prev, status: "paid" as const, paidDate } : null
      )
    }

    addToast("success", `${tenantName} (Room ${roomNumber}) marked as paid.`)

    try {
      const res = await fetch(`/api/payments/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })

      if (!res.ok) {
        throw new Error(await res.text())
      }
    } catch (err: any) {
      console.error("Failed to update:", err)
      addToast("error", "Failed to update payment status.")
      refresh()
    }
  }

  // APPROVE PAYMENT
  const handleApprovePayment = async (
    id: string,
    tenantName: string,
    roomNumber: string
  ) => {
    const paidAt = new Date().toISOString()
    const paidDate = paidAt.split("T")[0]

    patchRow(id, { status: "paid", paid_at: paidAt })

    if (selectedPayment?.id === id) {
      setSelectedPayment((prev) =>
        prev ? { ...prev, status: "paid" as const, paidDate } : null
      )
    }

    addToast("success", `${tenantName} (Room ${roomNumber}) payment approved.`)

    try {
      const res = await fetch(`/api/payments/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })

      if (!res.ok) {
        throw new Error(await res.text())
      }
    } catch (err: any) {
      console.error("Failed to approve:", err)
      addToast("error", "Failed to approve payment.")
      refresh()
    }
  }

  // REJECT PAYMENT
  const handleRejectPayment = async (
    id: string,
    tenantName: string,
    roomNumber: string,
    notes: string
  ) => {
    patchRow(id, { status: "pending", verification_notes: notes })

    if (selectedPayment?.id === id) {
      setSelectedPayment((prev) =>
        prev ? { ...prev, status: "pending" as const, verification_notes: notes } : null
      )
    }

    addToast("warning", `${tenantName} (Room ${roomNumber}) payment rejected.`)

    try {
      const res = await fetch(`/api/payments/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", notes }),
      })

      if (!res.ok) {
        throw new Error(await res.text())
      }
    } catch (err: any) {
      console.error("Failed to reject:", err)
      addToast("error", "Failed to reject payment.")
      refresh()
    }
  }

  // Drawer open
  const handleRowClick = (payment: Payment) => {
    setSelectedPayment(payment)
    setIsDrawerOpen(true)
  }

  // Summary-card totals come exclusively from the month-summary RPC (never the loaded
  // pages). When the summary is unavailable, totals fall back to 0 — never to
  // page-derived sums (Req 5.5, 5.10). Sourcing is centralized in `summaryCardTotals`.
  const { totalCollected, totalPending, totalLate, totalSubmitted } =
    summaryCardTotals(summary)

  const hasActiveFilters = searchValue !== "" || statusFilter !== "all"

  const handleClearFilters = () => {
    setSearchValue("")
    setStatusFilter("all")
  }

  // MOBILE
  if (isMobile) {
    return (
      <DashboardLayout title={`Payments · ${selectedMonth.split(" ")[0]}`}>
        <div className="flex flex-col h-full overflow-hidden">
          <div
            className="sticky top-0 z-20 flex flex-col bg-background/90 px-4 pt-3 pb-2 border-b border-border"
            style={{
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <MobileSummaryCards
              totalCollected={totalCollected}
              totalPending={totalPending}
              totalLate={totalLate}
              totalSubmitted={totalSubmitted}
            />

            <MobileFilterBar
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              sortField={sortField}
              sortDirection={sortDirection}
              onToggleSort={toggleSort}
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
            />

            {!isInitialLoading && filteredPayments.length > 0 && (
              <div className="flex justify-between text-[11px] text-muted-foreground pt-1 pb-0.5">
                <span>
                  {filteredPayments.length} payment
                  {filteredPayments.length !== 1 ? "s" : ""}
                </span>

                <span>
                  {filteredPayments.filter((p) => p.status === "paid").length} paid
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden px-4 pt-2">
            <MobilePaymentList
              payments={filteredPayments}
              isLoading={isInitialLoading}
              totalPayments={filteredPayments.length}
              onCardClick={handleRowClick}
              onMarkPaid={handleMarkPaid}
              onClearFilters={handleClearFilters}
              hasActiveFilters={hasActiveFilters}
              onRefresh={refresh}
              selectedMonth={selectedMonth}
              onLoadMore={handleLoadMore}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
            />
          </div>
        </div>

        <MobilePaymentDrawer
          payment={selectedPayment}
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onMarkPaid={handleMarkPaid}
          onApprovePayment={handleApprovePayment}
          onRejectPayment={handleRejectPayment}
        />

        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </DashboardLayout>
    )
  }

  // DESKTOP
  return (
    <DashboardLayout title={`Payments · ${selectedMonth.split(" ")[0]}`}>
      <div className="flex flex-col h-full max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8">
        <SummaryCards
          totalCollected={totalCollected}
          totalPending={totalPending}
          totalLate={totalLate}
          totalSubmitted={totalSubmitted}
        />

        <div>
          <FilterBar
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            sortField={sortField}
            sortDirection={sortDirection}
            onToggleSort={toggleSort}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
          />

          <PaymentsTable
            payments={filteredPayments}
            isLoading={isInitialLoading}
            onRowClick={handleRowClick}
            onMarkPaid={handleMarkPaid}
            onClearFilters={handleClearFilters}
            hasActiveFilters={hasActiveFilters}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
          />
        </div>
      </div>

      <PaymentDrawer
        payment={selectedPayment}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onMarkPaid={handleMarkPaid}
        onApprovePayment={handleApprovePayment}
        onRejectPayment={handleRejectPayment}
      />

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </DashboardLayout>
  )
}
