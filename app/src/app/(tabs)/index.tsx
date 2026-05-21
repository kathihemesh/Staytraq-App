import { useState, useEffect, useCallback, useRef } from "react"
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import { RentCollectionChart, PaymentStatusChart } from "@/components/ui/charts"
import { Users, IndianRupee, Clock, AlertTriangle, ArrowRight, Bell, RefreshCw } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"

interface ActivityItem {
  id: string
  tenant: string
  action: string
  amount?: string
  time: string
  status: "success" | "pending" | "late"
  timestamp: Date
}

export default function DashboardScreen() {
  const { isDark } = useTheme()
  const { user, isAuthenticated } = useAuth()
  const router = useRouter()

  const [dataLoading, setDataLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [totalTenants, setTotalTenants] = useState(0)
  const [paidThisMonth, setPaidThisMonth] = useState(0)
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState(0)
  const [pendingPaymentsTotal, setPendingPaymentsTotal] = useState(0)
  const [latePaymentsCount, setLatePaymentsCount] = useState(0)
  
  const [rentData, setRentData] = useState<any[]>([])
  const [statusData, setStatusData] = useState<any[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const hasLoadedOnce = useRef(false)

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!user?.id) return

    try {
      if (!silent) {
        if (hasLoadedOnce.current) setIsRefreshing(true)
        else setDataLoading(true)
      }

      // Fetch tenants
      const { data: tenants, error: tenantsErr } = await supabase
        .from("tenants_table")
        .select("id, name, status")
        .eq("owner_id", user.id)

      if (tenantsErr) throw tenantsErr

      const activeTenants = tenants?.filter((t) => t.status === "active") || []
      setTotalTenants(activeTenants.length)

      const tenantMap = new Map<number, string>(
        (tenants || []).map((t: any) => [t.id, t.name || ""])
      )
      const tenantIds = (tenants?.map((t) => t.id) || []) as number[]

      // Fetch payments
      const { data: payments, error: paymentsErr } = await supabase
        .from("payments")
        .select("*")
        .eq("owner_id", user.id)

      if (paymentsErr) throw paymentsErr

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
        { name: "Paid", value: currentMonthStatusCounts.paid, color: "#10b981" },
        { name: "Pending", value: currentMonthStatusCounts.pending, color: "#f59e0b" },
        { name: "Late", value: currentMonthStatusCounts.late, color: "#ef4444" },
      ])

      // Generate last 6 months list
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

      // Reminders recent history
      let allReminders: any[] = []
      if (tenantIds.length > 0) {
        const { data: reminders, error: remindersErr } = await supabase
          .from("reminders")
          .select("*")
          .in("tenant_id", tenantIds)
        if (!remindersErr) {
          allReminders = reminders || []
        }
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
            id: `pay-${payment.id}`,
            tenant: tenantMap.get(payment.tenant_id) || "Unknown Tenant",
            action: actionStr,
            amount: (payment.total_amount || payment.amount) ? `₹${Number(payment.total_amount || payment.amount).toLocaleString()}` : undefined,
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
            id: `rem-${reminder.id}`,
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
        else if (diffHours > 0) timeStr = `${diffHours} hr${diffHours > 1 ? "s" : ""} ago`
        else if (diffMins > 0) timeStr = `${diffMins} min${diffMins > 1 ? "s" : ""} ago`

        return { ...item, time: timeStr }
      })

      setRecentActivity(top7)
      hasLoadedOnce.current = true
    } catch (err) {
      console.error("Error fetching dashboard data:", err)
    } finally {
      setDataLoading(false)
      setIsRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      fetchDashboardData()
    }
  }, [isAuthenticated, user?.id, fetchDashboardData])

  // Realtime subscribe
  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`dashboard_owner_realtime_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `owner_id=eq.${user.id}` },
        () => {
          void fetchDashboardData(true)
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenants_table", filter: `owner_id=eq.${user.id}` },
        () => {
          void fetchDashboardData(true)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, fetchDashboardData])

  const onRefresh = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void fetchDashboardData()
  }, [fetchDashboardData])

  if (dataLoading && !hasLoadedOnce.current) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark items-center justify-center">
        <ActivityIndicator size="large" color={isDark ? "#0091ff" : "#0071df"} />
        <Text className="text-sm text-muted dark:text-muted-dark mt-3">Loading Staytraq...</Text>
      </View>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark" edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={isDark ? "#0091ff" : "#0071df"} />
        }
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-6 flex-row justify-between items-center">
          <View>
            <Text className="text-2xl font-black text-foreground dark:text-foreground-dark tracking-tight">
              Dashboard
            </Text>
            <Text className="text-sm text-muted dark:text-muted-dark font-medium mt-1">
              Your rental estate overview
            </Text>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity 
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                router.push("/reminders")
              }}
              className="h-10 w-10 border border-border dark:border-border-dark rounded-xl items-center justify-center bg-card dark:bg-card-dark"
            >
              <Bell size={18} color={isDark ? "#0091ff" : "#0071df"} />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={onRefresh}
              className="h-10 w-10 border border-border dark:border-border-dark rounded-xl items-center justify-center bg-card dark:bg-card-dark"
            >
              <RefreshCw size={18} color={isDark ? "#0091ff" : "#0071df"} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Grid */}
        <View className="px-6 pb-6 flex-row flex-wrap justify-between">
          {/* Card 1: Total Tenants */}
          <View className="w-[48%] bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-3xl mb-4 shadow-sm">
            <View className="flex-row justify-between items-center mb-3">
              <View className="p-2 bg-primary/10 rounded-xl">
                <Users size={20} color={isDark ? "#0091ff" : "#0071df"} />
              </View>
              <Text className="text-[11px] font-bold text-muted dark:text-muted-dark uppercase tracking-wider">
                Tenants
              </Text>
            </View>
            <Text className="text-2xl font-black text-foreground dark:text-foreground-dark">
              {totalTenants}
            </Text>
            <Text className="text-[11px] text-muted dark:text-muted-dark font-medium mt-1">
              Active residents
            </Text>
          </View>

          {/* Card 2: Collected */}
          <View className="w-[48%] bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-3xl mb-4 shadow-sm">
            <View className="flex-row justify-between items-center mb-3">
              <View className="p-2 bg-success/10 rounded-xl">
                <IndianRupee size={20} color="#10b981" />
              </View>
              <Text className="text-[11px] font-bold text-muted dark:text-muted-dark uppercase tracking-wider">
                Collected
              </Text>
            </View>
            <Text className="text-2xl font-black text-foreground dark:text-foreground-dark">
              ₹{paidThisMonth.toLocaleString()}
            </Text>
            <Text className="text-[11px] text-muted dark:text-muted-dark font-medium mt-1">
              Received this month
            </Text>
          </View>

          {/* Card 3: Pending */}
          <View className="w-[48%] bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-3xl shadow-sm">
            <View className="flex-row justify-between items-center mb-3">
              <View className="p-2 bg-warning/10 rounded-xl">
                <Clock size={20} color="#f59e0b" />
              </View>
              <Text className="text-[11px] font-bold text-muted dark:text-muted-dark uppercase tracking-wider">
                Pending
              </Text>
            </View>
            <Text className="text-2xl font-black text-foreground dark:text-foreground-dark">
              ₹{pendingPaymentsTotal.toLocaleString()}
            </Text>
            <Text className="text-[11px] text-muted dark:text-muted-dark font-medium mt-1">
              {pendingPaymentsCount} collections left
            </Text>
          </View>

          {/* Card 4: Overdue */}
          <View className="w-[48%] bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-3xl shadow-sm">
            <View className="flex-row justify-between items-center mb-3">
              <View className="p-2 bg-destructive/10 rounded-xl">
                <AlertTriangle size={20} color="#ef4444" />
              </View>
              <Text className="text-[11px] font-bold text-muted dark:text-muted-dark uppercase tracking-wider">
                Late
              </Text>
            </View>
            <Text className="text-2xl font-black text-foreground dark:text-foreground-dark">
              {latePaymentsCount}
            </Text>
            <Text className="text-[11px] text-muted dark:text-muted-dark font-medium mt-1">
              Overdue this month
            </Text>
          </View>
        </View>

        {/* Custom High-Performance Charts */}
        <View className="px-6 gap-6">
          <RentCollectionChart data={rentData} />
          
          <PaymentStatusChart data={statusData} />
        </View>

        {/* Recent Activity */}
        <View className="px-6 mt-6">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-bold text-foreground dark:text-foreground-dark tracking-tight">
              Recent Activity
            </Text>
            <TouchableOpacity 
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                router.push("/(tabs)/payments")
              }}
              className="flex-row items-center"
            >
              <Text className="text-sm font-semibold text-primary dark:text-foreground-dark mr-1">
                View All
              </Text>
              <ArrowRight size={14} color={isDark ? "#0091ff" : "#0071df"} />
            </TouchableOpacity>
          </View>

          {recentActivity.length === 0 ? (
            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-6 rounded-3xl items-center justify-center h-32">
              <Text className="text-sm text-muted dark:text-muted-dark font-medium text-center">
                No recent activity in the last 7 days
              </Text>
            </View>
          ) : (
            <View>
              {recentActivity.map((item, index) => (
                <View key={item.id}>
                  <View
                    className={`flex-row items-center justify-between py-3 border-border/40 dark:border-border-dark/40 ${
                      index === recentActivity.length - 1 ? "border-b-0" : "border-b"
                    }`}
                  >
                    <View className="flex-row items-center flex-1 pr-4">
                      <View className={`h-10 w-10 rounded-full items-center justify-center mr-3.5 ${
                        item.status === "success" 
                          ? "bg-success/10" 
                          : item.status === "late" 
                            ? "bg-destructive/10" 
                            : "bg-warning/10"
                      }`}>
                        {item.id.startsWith("rem-") ? (
                          <Bell size={18} color="#f59e0b" />
                        ) : item.status === "success" ? (
                          <IndianRupee size={18} color="#10b981" />
                        ) : item.status === "late" ? (
                          <AlertTriangle size={18} color="#ef4444" />
                        ) : (
                          <Clock size={18} color="#f59e0b" />
                        )}
                      </View>
                      
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-foreground dark:text-foreground-dark" numberOfLines={1}>
                          {item.tenant}
                        </Text>
                        <Text className="text-xs text-muted dark:text-muted-dark font-medium mt-0.5" numberOfLines={1}>
                          {item.action}
                        </Text>
                      </View>
                    </View>

                    <View className="items-end">
                      {item.amount && (
                        <Text className="text-sm font-extrabold text-foreground dark:text-foreground-dark">
                          {item.amount}
                        </Text>
                      )}
                      <Text className="text-[10px] text-muted dark:text-muted-dark font-semibold mt-1">
                        {item.time}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
