import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth-provider"

export type HistoryDateFilter = "all" | "7days" | "30days"
export type HistoryStatusFilter = "all" | "sent" | "failed"

export interface ReminderHistoryItem {
  id: number
  tenantId: number
  tenantName: string
  tenantRoom: string
  message: string
  sentVia: string
  sentAt: Date
  status: "sent" | "failed"
}

export function useReminderHistory(
  dateFilter: HistoryDateFilter,
  statusFilter: HistoryStatusFilter,
  searchTerm: string,
  page: number,
  pageSize: number = 20
) {
  const { user } = useAuth()
  const supabase = createClient()
  
  const [history, setHistory] = useState<ReminderHistoryItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    setError(null)

    try {
      let query = supabase
        .from("reminders")
        .select(`
          id,
          tenant_id,
          message,
          sent_via,
          sent_at,
          status,
          tenants_table (
            name,
            rooms_table (
              room_number
            )
          )
        `, { count: "exact" })
        .eq("owner_id", user.id)

      // Apply Status Filter
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter)
      }

      // Apply Date Filter
      if (dateFilter !== "all") {
        const days = dateFilter === "7days" ? 7 : 30
        const dateLimit = new Date()
        dateLimit.setDate(dateLimit.getDate() - days)
        query = query.gte("sent_at", dateLimit.toISOString())
      }
      
      // We can't easily search nested JSON via text search in simple supabase queries without RPC,
      // so if searchTerm exists, we will fetch more and filter client-side, 
      // OR since it's a simple app, we can just do server-side text search on the message.
      if (searchTerm) {
        query = query.ilike("message", `%${searchTerm}%`)
      }

      // Pagination
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      query = query.order("sent_at", { ascending: false }).range(from, to)

      const { data, error, count } = await query

      if (error) throw error

      setTotalCount(count || 0)

      const formatted = (data || []).map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenants_table?.name || "Unknown Tenant",
        tenantRoom: row.tenants_table?.rooms_table?.room_number || "—",
        message: row.message,
        sentVia: row.sent_via,
        sentAt: new Date(row.sent_at),
        status: row.status,
      }))

      setHistory(formatted)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Failed to load history")
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, dateFilter, statusFilter, searchTerm, page, pageSize])

  useEffect(() => {
    if (user?.id) {
      // Debounce fetch slightly if typing in search
      const timer = setTimeout(fetchHistory, 300)
      return () => clearTimeout(timer)
    }
  }, [fetchHistory, user?.id])

  return { history, totalCount, isLoading, error, refresh: fetchHistory }
}
