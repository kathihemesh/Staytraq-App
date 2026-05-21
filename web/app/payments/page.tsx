"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
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

export default function PaymentsPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const isMobile = useIsMobile()

  const [payments, setPayments] = useState<Payment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Drawer state
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Toast state
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = (type: ToastItem["type"], message: string) => {
    const newToast: ToastItem = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      message,
    }
    setToasts((prev) => [...prev, newToast])
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const fetchPayments = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          id,
          month,
          year,
          rent_amount,
          extra_charges,
          total_amount,
          due_date,
          status,
          paid_at,
          payment_token,
          screenshot_path,
          utr_number,
          verification_notes,
          tenant_id,
          tenants_table (
            name,
            rooms_table (
              room_number
            )
          )
        `)
        .eq("owner_id", user.id)
        .order("due_date", { ascending: false })

      if (error) throw error

      const mappedPayments = (data || []).map((p: any) => {
        const monthName =
          typeof p.month === "number" || !isNaN(Number(p.month))
            ? new Date(2000, Number(p.month) - 1).toLocaleString("en-US", { month: "long" })
            : p.month

        // Normalise tenant and room from potential array structure
        const tenantRaw = p.tenants_table
        const tenant = Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw

        const roomRaw = tenant?.rooms_table
        const room = Array.isArray(roomRaw) ? roomRaw[0] : roomRaw

        return {
          id: String(p.id),
          tenantName: tenant?.name || "Unknown",
          roomNumber: room?.room_number || "—",
          amount: Number(p.total_amount),
          baseRent: Number(p.rent_amount) || 0,
          extraCharges: Number(p.extra_charges) || 0,
          status: (p.status || "pending") as "paid" | "pending" | "late" | "submitted",
          dueDate: p.due_date,
          paidDate: p.paid_at ? p.paid_at.split("T")[0] : undefined,
          month: monthName,
          year: p.year,
          payment_token: p.payment_token ?? undefined,
          screenshot_url: p.screenshot_path ?? undefined,
          utr_number: p.utr_number ?? undefined,
          verification_notes: p.verification_notes ?? undefined,
        }
      })

      setPayments(mappedPayments)
    } catch (err: any) {
      console.error("Failed to load payments from Supabase:", err)
      addToast("error", "Failed to load payments.")
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, supabase])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  // Filter Hook
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
    filteredPayments,
  } = usePaymentFilters(payments)

  const handleMarkPaid = async (id: string, tenantName: string, roomNumber: string) => {
    // Optimistic UI Update
    setPayments((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, status: "paid" as const, paidDate: new Date().toISOString().split("T")[0] }
          : p
      )
    )

    // Update selected payment in drawer if open
    if (selectedPayment?.id === id) {
      setSelectedPayment((prev) =>
        prev ? { ...prev, status: "paid" as const, paidDate: new Date().toISOString().split("T")[0] } : null
      )
    }

    addToast("success", `${tenantName} (Room ${roomNumber}) marked as paid.`)

    try {
      const res = await fetch(`/api/payments/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err: any) {
      console.error("Failed to update status in Supabase:", err)
      addToast("error", "Failed to update payment status on server.")
      fetchPayments() // revert optimistic update
    }
  }

  const handleApprovePayment = async (id: string, tenantName: string, roomNumber: string) => {
    // Optimistic update
    const paidDate = new Date().toISOString().split("T")[0]
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "paid" as const, paidDate } : p))
    )
    if (selectedPayment?.id === id) {
      setSelectedPayment((prev) => prev ? { ...prev, status: "paid" as const, paidDate } : null)
    }
    addToast("success", `${tenantName} (Room ${roomNumber}) payment approved.`)

    try {
      const res = await fetch(`/api/payments/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err: any) {
      console.error("Failed to approve payment:", err)
      addToast("error", "Failed to approve payment on server.")
      fetchPayments() // revert optimistic update
    }
  }

  const handleRejectPayment = async (id: string, tenantName: string, roomNumber: string, notes: string) => {
    // Optimistic update back to pending
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "pending" as const, verification_notes: notes } : p))
    )
    if (selectedPayment?.id === id) {
      setSelectedPayment((prev) => prev ? { ...prev, status: "pending" as const, verification_notes: notes } : null)
    }
    addToast("warning", `${tenantName} (Room ${roomNumber}) payment rejected.`)

    try {
      const res = await fetch(`/api/payments/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", notes }),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err: any) {
      console.error("Failed to reject payment:", err)
      addToast("error", "Failed to reject payment on server.")
      fetchPayments() // revert optimistic update
    }
  }

  const handleRowClick = (payment: Payment) => {
    setSelectedPayment(payment)
    setIsDrawerOpen(true)
  }

  // Calculate totals based on the currently selected month
  const paymentsForSelectedMonth = useMemo(() => {
    return payments.filter((p) => `${p.month} ${p.year}` === selectedMonth)
  }, [payments, selectedMonth])

  const totalCollected = paymentsForSelectedMonth
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0)
  const totalPending = paymentsForSelectedMonth
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0)
  const totalLate = paymentsForSelectedMonth
    .filter((p) => p.status === "late")
    .reduce((sum, p) => sum + p.amount, 0)

  const totalSubmitted = paymentsForSelectedMonth
    .filter((p) => p.status === "submitted")
    .reduce((sum, p) => sum + p.amount, 0)

  const hasActiveFilters = searchValue !== "" || statusFilter !== "all"

  const handleClearFilters = () => {
    setSearchValue("")
    setStatusFilter("all")
  }

  // ─── Mobile Layout ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <DashboardLayout title={`Payments · ${selectedMonth.split(" ")[0]}`}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Sticky header block */}
          <div
            className="sticky top-0 z-20 flex flex-col bg-background/90 px-4 pt-3 pb-2 border-b border-border"
            style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
          >
            {/* Page title */}
            <h1 className="text-lg font-bold mb-3 leading-none">
              Payments <span className="text-muted-foreground font-normal text-sm">· {selectedMonth}</span>
            </h1>

            {/* Compact summary cards */}
            <MobileSummaryCards
              totalCollected={totalCollected}
              totalPending={totalPending}
              totalLate={totalLate}
              totalSubmitted={totalSubmitted}
            />

            {/* Compact filter bar */}
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

            {/* List section header */}
            {!isLoading && filteredPayments.length > 0 && (
              <div className="flex justify-between text-[11px] text-muted-foreground pt-1 pb-0.5">
                <span>{filteredPayments.length} payment{filteredPayments.length !== 1 ? "s" : ""}</span>
                <span>{filteredPayments.filter(p => p.status === "paid").length} paid</span>
              </div>
            )}
          </div>

          {/* Scrollable payment list */}
          <div className="flex-1 overflow-hidden px-4 pt-2">
            <MobilePaymentList
              payments={filteredPayments}
              isLoading={isLoading}
              totalPayments={paymentsForSelectedMonth.length}
              onCardClick={handleRowClick}
              onMarkPaid={handleMarkPaid}
              onClearFilters={handleClearFilters}
              hasActiveFilters={hasActiveFilters}
              onRefresh={fetchPayments}
              selectedMonth={selectedMonth}
            />
          </div>
        </div>

        {/* Mobile bottom-sheet drawer */}
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

  // ─── Desktop Layout (unchanged) ───────────────────────────────────────────
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
            isLoading={isLoading}
            onRowClick={handleRowClick}
            onMarkPaid={handleMarkPaid}
            onClearFilters={handleClearFilters}
            hasActiveFilters={hasActiveFilters}
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
