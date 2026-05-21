import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth-provider"

export type ReminderStatus = "overdue" | "due_today" | "due_week" | "upcoming" | "paid"

export interface ReminderTenant {
  id: number
  name: string
  phone: string
  room: string
  roomId: number
  floor: number
  amount: number       // rent_amount + extra_charges
  dueDate: Date        // computed: day rent_due_day of current month
  status: ReminderStatus
}

function computeDueDate(rentDueDay: number): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), rentDueDay)
}

function computeStatus(dueDate: Date, isPaidThisMonth: boolean): ReminderStatus {
  if (isPaidThisMonth) return "paid"

  const now = new Date()
  // Compare date only (strip time)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return "overdue"
  if (diffDays === 0) return "due_today"
  if (diffDays <= 7) return "due_week"
  if (diffDays <= 10) return "upcoming"
  // > 10 days away — show as paid
  return "paid"
}

export function useReminderTenants() {
  const { user } = useAuth()
  const supabase = createClient()
  const [tenants, setTenants] = useState<ReminderTenant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTenants = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    setError(null)

    try {
      // Get current month and year for payments comparison
      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const currentYear = now.getFullYear()

      // Fetch active tenants with room info
      const { data: tenantsData, error: tenantsErr } = await supabase
        .from("tenants_table")
        .select(`
          id,
          name,
          mobile_number,
          rent_due_day,
          extra_charges,
          room_id,
          rooms_table (
            id,
            room_number,
            floor_no,
            rent_amount
          )
        `)
        .eq("owner_id", user.id)
        .eq("status", "active")

      if (tenantsErr) throw tenantsErr

      // Fetch this month's paid payments using correct month and year columns
      const { data: paymentsData, error: paymentsErr } = await supabase
        .from("payments")
        .select("tenant_id, status")
        .eq("owner_id", user.id)
        .eq("month", currentMonth)
        .eq("year", currentYear)
        .eq("status", "paid")

      if (paymentsErr) throw paymentsErr

      const paidTenantIds = new Set((paymentsData || []).map((p) => p.tenant_id))

      const result: ReminderTenant[] = []

      for (const t of tenantsData || []) {
        const room = (t as any).rooms_table
        const rentDueDay = t.rent_due_day ?? 1
        const dueDate = computeDueDate(rentDueDay)
        const isPaid = paidTenantIds.has(t.id)
        const status = computeStatus(dueDate, isPaid)

        // We now show all tenants, those > 10 days are already marked as "paid"

        result.push({
          id: t.id,
          name: t.name || "Unknown",
          phone: t.mobile_number || "",
          room: room?.room_number || "—",
          roomId: t.room_id || 0,
          floor: room?.floor_no || 0,
          amount: (room?.rent_amount || 0) + (t.extra_charges || 0),
          dueDate,
          status,
        })
      }

      setTenants(result)
    } catch (err: any) {
      setError(err.message || "Failed to load tenants")
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (user?.id) fetchTenants()
  }, [user?.id, fetchTenants])

  return { tenants, isLoading, error, refresh: fetchTenants }
}
