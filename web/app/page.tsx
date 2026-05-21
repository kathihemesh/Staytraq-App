"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/components/auth-provider"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { StatsCard } from "@/components/dashboard/stats-card"
import { RentCollectionChart, type RentCollectionData } from "@/components/dashboard/rent-collection-chart"
import { PaymentStatusChart, type PaymentStatusData } from "@/components/dashboard/payment-status-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, IndianRupee, Clock, AlertTriangle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"


import { runWithNetworkRetry } from "@/lib/networkRetry"

interface ActivityItem {
  tenant: string
  action: string
  amount?: string
  time: string
  status: "success" | "pending" | "late"
  timestamp: Date
}

export default function DashboardPage() {
  const supabase = createClient()
  const { authReady, isLoading: isAuthLoading, isAuthenticated, user } = useAuth()
  
  const [dataLoading, setDataLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [totalTenants, setTotalTenants] = useState(0)
  const [paidThisMonth, setPaidThisMonth] = useState(0)
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState(0)
  const [pendingPaymentsTotal, setPendingPaymentsTotal] = useState(0)
  const [latePaymentsCount, setLatePaymentsCount] = useState(0)
  
  const [rentData, setRentData] = useState<RentCollectionData[]>([])
  const [statusData, setStatusData] = useState<PaymentStatusData[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const tenantIdsRef = useRef<number[]>([])

  const fetchDashboardData = useCallback(async () => {
    if (!user?.id) return

    try {
      if (hasLoadedOnce) setIsRefreshing(true)

      const { data: tenants } = await runWithNetworkRetry(async () => {
        return await supabase
          .from("tenants_table")
          .select("id, name, status")
          .eq("owner_id", user.id)
      })

      const activeTenants = tenants?.filter((t) => t.status === "active") || []
      setTotalTenants(activeTenants.length)

      const tenantMap = new Map<number, string>(
        (tenants || []).map((t: any) => [t.id, t.name || ""])
      )
      const tenantIds = (tenants?.map((t) => t.id) || []) as number[]
      tenantIdsRef.current = tenantIds

      const { data: payments } = await runWithNetworkRetry(async () => {
        return await supabase.from("payments").select("*").eq("owner_id", user.id)
      })

      const allPayments = (payments || []) as any[]

      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()

      let currentPaid = 0
      let currentPendingCount = 0
      let currentPendingTotal = 0
      let currentLateCount = 0

      const currentMonthStatusCounts = { paid: 0, pending: 0, late: 0 }

      allPayments.forEach((payment) => {
        const dateStr = payment.payment_date || payment.created_at
        if (!dateStr) return
        const pDate = new Date(dateStr)

        if (pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear) {
          if (payment.status === "paid" || payment.status === "success" || payment.status === "completed") {
            currentPaid += Number(payment.total_amount || payment.amount || 0)
            currentMonthStatusCounts.paid++
          } else if (payment.status === "pending") {
            currentPendingCount++
            currentPendingTotal += Number(payment.total_amount || payment.amount || 0)
            currentMonthStatusCounts.pending++
          } else if (payment.status === "late") {
            currentLateCount++
            currentMonthStatusCounts.late++
          }
        }
      })

      setPaidThisMonth(currentPaid)
      setPendingPaymentsCount(currentPendingCount)
      setPendingPaymentsTotal(currentPendingTotal)
      setLatePaymentsCount(currentLateCount)

      setStatusData([
        { name: "Paid", value: currentMonthStatusCounts.paid, color: "var(--color-success)" },
        { name: "Pending", value: currentMonthStatusCounts.pending, color: "var(--color-warning)" },
        { name: "Late", value: currentMonthStatusCounts.late, color: "var(--color-destructive)" },
      ])

      const last6Months: { month: string; collected: number; pending: number; year: number; monthIndex: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        last6Months.push({
          month: d.toLocaleString("default", { month: "short" }),
          monthIndex: d.getMonth(),
          year: d.getFullYear(),
          collected: 0,
          pending: 0,
        })
      }

      allPayments.forEach((payment) => {
        const dateStr = payment.payment_date || payment.created_at
        if (!dateStr) return
        const pDate = new Date(dateStr)
        const monthData = last6Months.find((m) => m.monthIndex === pDate.getMonth() && m.year === pDate.getFullYear())

        if (monthData) {
          if (payment.status === "paid" || payment.status === "success" || payment.status === "completed") {
            monthData.collected += Number(payment.total_amount || payment.amount || 0)
          } else if (payment.status === "pending" || payment.status === "late") {
            monthData.pending += Number(payment.total_amount || payment.amount || 0)
          }
        }
      })

      setRentData(last6Months.map(({ month, collected, pending }) => ({ month, collected, pending })))

      let allReminders: any[] = []
      if (tenantIds.length > 0) {
        const { data: reminders } = await runWithNetworkRetry(async () => {
          return await supabase.from("reminders").select("*").in("tenant_id", tenantIds)
        })
        allReminders = reminders || []
      }

      const activityList: ActivityItem[] = []
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      allPayments.forEach((payment) => {
        const dateStr = payment.payment_date || payment.created_at
        if (!dateStr) return
        const pDate = new Date(dateStr)

        if (pDate >= sevenDaysAgo) {
          let actionStr = "Payment processed"
          let actionStatus: "success" | "pending" | "late" = "success"

          if (payment.status === "late") {
            actionStr = "Late payment"
            actionStatus = "late"
          } else if (payment.status === "pending") {
            actionStr = "Payment pending"
            actionStatus = "pending"
          } else {
            actionStr = "Rent paid"
            actionStatus = "success"
          }

          activityList.push({
            tenant: tenantMap.get(payment.tenant_id) || "Unknown Tenant",
            action: actionStr,
            amount: (payment.total_amount || payment.amount) ? `₹${Number(payment.total_amount || payment.amount).toLocaleString()}` : "",
            status: actionStatus,
            timestamp: pDate,
            time: "",
          })
        }
      })

      allReminders.forEach((reminder) => {
        const dateStr = reminder.sent_at || reminder.updated_at
        if (!dateStr) return
        const rDate = new Date(dateStr)

        if (rDate >= sevenDaysAgo) {
          activityList.push({
            tenant: tenantMap.get(reminder.tenant_id) || "Unknown Tenant",
            action: `Reminder sent${reminder.sent_via ? ` via ${reminder.sent_via}` : ""}`,
            status: "pending",
            timestamp: rDate,
            time: "",
          })
        }
      })

      activityList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      const top7 = activityList.slice(0, 7).map((item) => {
        const diffMs = now.getTime() - item.timestamp.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMins / 60)
        const diffDays = Math.floor(diffHours / 24)

        let timeStr = "Just now"
        if (diffDays > 0) timeStr = `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
        else if (diffHours > 0) timeStr = `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
        else if (diffMins > 0) timeStr = `${diffMins} min${diffMins > 1 ? "s" : ""} ago`

        return { ...item, time: timeStr }
      })

      setRecentActivity(top7)
    } catch (err) {
      console.error("Error fetching dashboard data:", err)
    } finally {
      setDataLoading(false)
      setIsRefreshing(false)
    }
  }, [user?.id, hasLoadedOnce])

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      if (!hasLoadedOnce) setDataLoading(true)
      fetchDashboardData()
    }
  }, [isAuthenticated, user?.id, hasLoadedOnce, fetchDashboardData])

  // Realtime: keep dashboard in sync without refetch-on-focus.
  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`dashboard_owner_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `owner_id=eq.${user.id}` },
        () => {
          if (hasLoadedOnce) setIsRefreshing(true)
          fetchDashboardData()
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenants_table", filter: `owner_id=eq.${user.id}` },
        () => {
          if (hasLoadedOnce) setIsRefreshing(true)
          fetchDashboardData()
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders" },
        (payload) => {
          // Reminders table does not have owner_id; only refetch when it relates to current tenants.
          const tenantIds = tenantIdsRef.current
          const newTenantId = (payload.new as any)?.tenant_id ?? (payload.old as any)?.tenant_id
          if (tenantIds.length > 0 && newTenantId && !tenantIds.includes(Number(newTenantId))) return
          if (hasLoadedOnce) setIsRefreshing(true)
          fetchDashboardData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, hasLoadedOnce, fetchDashboardData])

  // If auth says "authenticated" but user hasn't hydrated yet, don't get stuck
  // in the dashboard loading state forever.
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && !user?.id) {
      setDataLoading(false)
    }
  }, [isAuthLoading, isAuthenticated, user?.id])

  useEffect(() => {
    if (isAuthenticated && !dataLoading) {
      setHasLoadedOnce(true)
    }
  }, [isAuthenticated, dataLoading])

  const shouldShowFullScreenLoader = !hasLoadedOnce && (isAuthLoading || (isAuthenticated && dataLoading))

  // Only show the full-screen loader before the first successful render.
  // After that, keep UI visible across focus/session revalidation.
  const shouldShowInitialLoader =
    !hasLoadedOnce && (!authReady || isAuthLoading || (isAuthenticated && dataLoading))

  if (shouldShowInitialLoader) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout title="Dashboard">
      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Total Tenants"
          value={totalTenants}
          icon={Users}
        />
        <StatsCard
          title="Paid This Month"
          value={`₹${paidThisMonth.toLocaleString()}`}
          icon={IndianRupee}
          iconClassName="bg-success/10"
        />
        <StatsCard
          title="Pending Payments"
          value={pendingPaymentsCount}
          description={pendingPaymentsTotal > 0 ? `₹${pendingPaymentsTotal.toLocaleString()} pending` : undefined}
          icon={Clock}
          iconClassName="bg-warning/10"
        />
        <StatsCard
          title="Late Payments"
          value={latePaymentsCount}
          description={latePaymentsCount > 0 ? "follow up required" : undefined}
          icon={AlertTriangle}
          iconClassName="bg-destructive/10"
        />
      </div>

      {/* Charts */}
      <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <RentCollectionChart data={rentData} />
        </div>
        <div className="min-w-0">
          <PaymentStatusChart data={statusData} />
        </div>
      </div>

      {/* Recent Activity */}
      <Card className="mt-6 min-w-0 overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentActivity.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No recent activity in the last 7 days.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 px-4 py-4 transition-colors hover:bg-muted/50 sm:items-center sm:gap-4 sm:px-6"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase">
                    {activity.tenant
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .substring(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{activity.tenant}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              activity.status === "success" &&
                                "border-success/30 bg-success/10 text-success",
                              activity.status === "pending" &&
                                "border-warning/30 bg-warning/10 text-warning",
                              activity.status === "late" &&
                                "border-destructive/30 bg-destructive/10 text-destructive"
                            )}
                          >
                            {activity.action}
                          </Badge>
                          <span className="text-xs text-muted-foreground sm:text-sm">
                            {activity.time}
                          </span>
                        </div>
                      </div>
                      {activity.amount && (
                        <p className="mt-1 text-base font-semibold sm:mt-0 sm:text-right">
                          {activity.amount}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  )
}
