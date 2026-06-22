"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/components/auth-provider"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { StatsCard } from "@/components/dashboard/stats-card"
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"
import { RentCollectionChart, type RentCollectionData } from "@/components/dashboard/rent-collection-chart"
import { PaymentStatusChart, type PaymentStatusData } from "@/components/dashboard/payment-status-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, IndianRupee, Clock, AlertTriangle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"


import { runWithNetworkRetry } from "@/lib/networkRetry"
import { loadDashboardAggregates, type DashboardAggregates } from "@/lib/dashboard/dashboard-aggregates"
import { retrieveAggregates, storeAggregates, invalidateAggregates, createTrailingDebounce } from "@/lib/dashboard/dashboard-cache"

interface ActivityItem {
  tenant: string
  action: string
  amount?: string
  time: string
  status: "success" | "pending" | "late"
  timestamp: Date
}

function formatRelativeTime(timestamp: Date) {
  const now = new Date()
  const diffMs = now.getTime() - timestamp.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
  if (diffMins > 0) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`
  return "Just now"
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

  // Map a `DashboardAggregates` value into the existing useState setters.
  // Shared by the cached render-immediately path and the background refetch so
  // both render byte-for-byte the same way. Per-section errors keep prior values
  // so the dashboard is never blanked (Req 13).
  const applyAggregates = useCallback((aggregates: DashboardAggregates) => {
    const { summary, monthly, activity } = aggregates

    // Summary section: update metrics + status chart only when it succeeded.
    if (summary.ok) {
      const s = summary.data
      const statusCounts = s.payment_status_counts || {}

      setTotalTenants(Number(s.total_active_tenants || 0))
      setPaidThisMonth(Number(s.paid_amount_this_month || 0))
      setPendingPaymentsCount(Number(s.pending_payment_count_this_month || 0))
      setPendingPaymentsTotal(Number(s.pending_amount_this_month || 0))
      setLatePaymentsCount(Number(s.late_payment_count_this_month || 0))

      setStatusData([
        { name: "Paid", value: Number(statusCounts.paid || 0), color: "var(--color-success)" },
        { name: "Pending", value: Number(statusCounts.pending || 0), color: "var(--color-warning)" },
        { name: "Late", value: Number(statusCounts.late || 0), color: "var(--color-destructive)" },
      ])
    } else {
      console.error("Error fetching dashboard summary:", summary.error)
    }

    // Monthly collection chart: keep prior values on error.
    if (monthly.ok) {
      setRentData(monthly.data.map((row) => ({
        month: row.month,
        collected: Number(row.collected || 0),
        pending: Number(row.pending || 0),
      })))
    } else {
      console.error("Error fetching dashboard monthly collection:", monthly.error)
    }

    // Recent activity: keep prior values on error.
    if (activity.ok) {
      setRecentActivity(activity.data.map((row) => {
        const timestamp = row.occurred_at ? new Date(row.occurred_at) : new Date()
        return {
          tenant: row.tenant || "Unknown Tenant",
          action: row.action || "Activity",
          amount: row.amount || "",
          status: row.status || "pending",
          timestamp,
          time: formatRelativeTime(timestamp),
        }
      }))
    } else {
      console.error("Error fetching dashboard recent activity:", activity.error)
    }
  }, [])

  const fetchDashboardData = useCallback(async () => {
    if (!user?.id) return
    const ownerId = user.id

    try {
      if (hasLoadedOnce) setIsRefreshing(true)

      const aggregates = await loadDashboardAggregates(
        supabase as unknown as Parameters<typeof loadDashboardAggregates>[0],
        { ownerId, call: runWithNetworkRetry }
      )

      applyAggregates(aggregates)

      // Cache the last successful result for stale-while-revalidate (Req 10.1,
      // 10.2). Only store when every section succeeded so a partial failure never
      // overwrites a previously good cache with a degraded snapshot (Req 13.2).
      if (aggregates.summary.ok && aggregates.monthly.ok && aggregates.activity.ok) {
        storeAggregates(ownerId, aggregates)
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err)
    } finally {
      setDataLoading(false)
      setIsRefreshing(false)
    }
  }, [user?.id, hasLoadedOnce, applyAggregates])

  // Manual refresh: invalidate the cache first so the refetch always returns fresh
  // values rather than re-rendering a stale cached aggregate (Req 10.5).
  const handleRefresh = useCallback(() => {
    if (!user?.id) return
    invalidateAggregates(user.id)
    if (hasLoadedOnce) setIsRefreshing(true)
    fetchDashboardData()
  }, [user?.id, hasLoadedOnce, fetchDashboardData])

  // Keep refs to the latest `fetchDashboardData` and `user.id` so the single
  // debouncer instance (created once per mount, below) always invokes the current
  // closure without needing to be re-created when those values change.
  const fetchDashboardDataRef = useRef(fetchDashboardData)
  useEffect(() => {
    fetchDashboardDataRef.current = fetchDashboardData
  }, [fetchDashboardData])

  const userIdRef = useRef(user?.id)
  useEffect(() => {
    userIdRef.current = user?.id
  }, [user?.id])

  // Single trailing-edge debouncer shared across every realtime channel event
  // handler for this dashboard mount. Each realtime event calls `trigger()`, so a
  // burst of changes across the subscribed tables coalesces into exactly one
  // refetch after the 400ms window elapses (Req 11.1–11.5). The debounced callback
  // invalidates the cache and then triggers the three-RPC refetch via
  // `fetchDashboardData`, which itself sets `isRefreshing` once loaded (Req 10.4).
  const realtimeDebouncerRef = useRef<ReturnType<typeof createTrailingDebounce> | null>(null)
  if (realtimeDebouncerRef.current === null) {
    realtimeDebouncerRef.current = createTrailingDebounce(() => {
      const ownerId = userIdRef.current
      if (!ownerId) return
      invalidateAggregates(ownerId)
      return fetchDashboardDataRef.current()
    })
  }

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      // Stale-while-revalidate: render a cached aggregate immediately (if present)
      // so the dashboard is populated without waiting on the network, then refetch
      // in the background and replace the rendered values on success (Req 10.1).
      const cached = retrieveAggregates(user.id)
      if (cached) {
        applyAggregates(cached)
        setDataLoading(false)
      } else if (!hasLoadedOnce) {
        setDataLoading(true)
      }
      fetchDashboardData()
    }
  }, [isAuthenticated, user?.id, hasLoadedOnce, fetchDashboardData, applyAggregates])

  // Realtime: keep dashboard in sync without refetch-on-focus.
  // Every event routes through the single 400ms trailing debouncer so bursts
  // coalesce into exactly one three-RPC refetch (Req 5.1, 11.1–11.5). The channel
  // name, subscribed tables, and owner-scoped filters are unchanged (Req 5.2).
  useEffect(() => {
    if (!user?.id) return

    const debouncer = realtimeDebouncerRef.current!

    const channel = supabase
      .channel(`dashboard_owner_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `owner_id=eq.${user.id}` },
        () => {
          debouncer.trigger()
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenants_table", filter: `owner_id=eq.${user.id}` },
        () => {
          debouncer.trigger()
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders" },
        (payload) => {
          const reminderOwnerId = (payload.new as any)?.owner_id ?? (payload.old as any)?.owner_id
          if (reminderOwnerId && reminderOwnerId !== user.id) return
          debouncer.trigger()
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints", filter: `owner_id=eq.${user.id}` },
        () => {
          debouncer.trigger()
        }
      )
      .subscribe()

    return () => {
      // Cancel any pending debounced refetch before tearing down the channel so a
      // queued trigger can't fire after unmount.
      debouncer.cancel()
      supabase.removeChannel(channel)
    }
  }, [user?.id])

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

  // Show the full-screen spinner only while auth itself is still resolving,
  // before the first successful render. Once auth is ready the dashboard shell
  // (and its skeleton) takes over so loading placeholders match the real layout.
  const shouldShowAuthLoader = !hasLoadedOnce && (!authReady || isAuthLoading)

  if (shouldShowAuthLoader) {
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

  // First load with no Cached_Aggregate: render the skeleton inside the real
  // dashboard shell so placeholders occupy the same positions/dimensions as the
  // loaded content and there is no layout shift when data arrives (Req 12.1–12.3).
  // When a cache exists, the mount effect clears `dataLoading` and applies the
  // cached values immediately, so this branch is skipped (stale-while-revalidate).
  const shouldShowSkeleton = !hasLoadedOnce && dataLoading

  if (shouldShowSkeleton) {
    return (
      <DashboardLayout title="Dashboard">
        <DashboardSkeleton />
      </DashboardLayout>
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
