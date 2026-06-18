import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  RefreshControl,
  Modal,
  TextInput,
  Platform,
  Image,
  Dimensions,
  Clipboard,
  Animated,
  StyleSheet,
  KeyboardAvoidingView,
  Linking,
  Alert
} from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { useRouter, useFocusEffect } from "expo-router"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import { 
  Users, 
  IndianRupee, 
  Clock, 
  AlertTriangle, 
  RefreshCw,
  Trash2,
  X,
  Check,
  Maximize2,
  Eye,
  ShieldCheck,
  MessageSquare,
  Inbox,
  Info,
  Copy,
  Calendar,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  Settings,
  MessageCircle
} from "lucide-react-native"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import * as SecureStore from "expo-secure-store"
import ThemeDatePicker from "@/components/ui/theme-date-picker"
import { BarChart } from "react-native-gifted-charts"

interface ActivityItem {
  id: string
  type: "payment" | "complaint"
  tenant: string
  action: string
  amount?: string
  time: string
  status: "success" | "pending" | "late"
  timestamp: Date
  rawItem: any
}

const { height } = Dimensions.get("window")

export default function DashboardScreen() {
  const { isDark } = useTheme()
  const { user, isAuthenticated } = useAuth()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [dataLoading, setDataLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const hasLoadedOnce = useRef(false)

  // Raw Database States
  const [rawTenants, setRawTenants] = useState<any[]>([])
  const [rawPayments, setRawPayments] = useState<any[]>([])
  const [rawRooms, setRawRooms] = useState<any[]>([])
  const [rawComplaints, setRawComplaints] = useState<any[]>([])
  const [pgId, setPgId] = useState<number | null>(null)

  // Filters State
  const [selectedFilter, setSelectedFilter] = useState<string>("This Month")
  const [customStartDate, setCustomStartDate] = useState<string>("")
  const [customEndDate, setCustomEndDate] = useState<string>("")
  const [customRangePickerVisible, setCustomRangePickerVisible] = useState(false)
  const [selectedBarKey, setSelectedBarKey] = useState<string | null>(null)

  // Dismissed recent activity persistence
  const [dismissedActivityIds, setDismissedActivityIds] = useState<string[]>([])

  // Payment Detail Modal State
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null)
  const [paymentDetailModalVisible, setPaymentDetailModalVisible] = useState(false)
  const [signedScreenshotUrl, setSignedScreenshotUrl] = useState<string | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const [imageFullScreen, setImageFullScreen] = useState(false)
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null)
  const [detailsCollapsed, setDetailsCollapsed] = useState(true)
  const [rejectingMode, setRejectingMode] = useState(false)
  const [rejectNotes, setRejectNotes] = useState("")
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null)
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false)

  // Complaint Detail Modal State
  const [selectedComplaint, setSelectedComplaint] = useState<any | null>(null)
  const [complaintDetailModalVisible, setComplaintDetailModalVisible] = useState(false)
  const [updatedStatus, setUpdatedStatus] = useState<string>("Under Working")
  const [ownerResponseText, setOwnerResponseText] = useState("")
  const [isSavingDetails, setIsSavingDetails] = useState(false)

  // Custom Toast State
  const [toast, setToast] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "info" | "warning";
  }>({
    visible: false,
    title: "",
    message: "",
    type: "success",
  })
  const toastTranslateX = useRef(new Animated.Value(300)).current
  const toastOpacity = useRef(new Animated.Value(0)).current
  const toastTimeoutRef = useRef<any>(null)

  const showToast = useCallback((title: string, message: string, type: "success" | "error" | "info" | "warning" = "success") => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }

    setToast({ visible: true, title, message, type })

    toastTranslateX.setValue(300)
    toastOpacity.setValue(0)

    Animated.parallel([
      Animated.spring(toastTranslateX, {
        toValue: 0,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      })
    ]).start()

    toastTimeoutRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastTranslateX, {
          toValue: 300,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        })
      ]).start(() => {
        setToast((prev) => ({ ...prev, visible: false }))
      })
    }, 2000)
  }, [toastTranslateX, toastOpacity])

  // Load dismissed activity IDs from SecureStore on mount
  useEffect(() => {
    const loadDismissed = async () => {
      try {
        const stored = await SecureStore.getItemAsync("dismissed_activity_ids")
        if (stored) {
          setDismissedActivityIds(JSON.parse(stored))
        }
      } catch (err) {
        console.error("Failed to load dismissed activity IDs:", err)
      }
    }
    void loadDismissed()
  }, [])

  // Fetch all tables concurrently
  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!user?.id) {
      setDataLoading(false)
      return
    }

    try {
      if (!silent) {
        if (hasLoadedOnce.current) setIsRefreshing(true)
        else setDataLoading(true)
      }

      // Concurrently fetch pg_details, tenants, payments, and complaints
      const [pgRes, tenantsRes, paymentsRes, complaintsRes] = await Promise.all([
        supabase
          .from("pg_details")
          .select("id")
          .eq("owner_id", user.id),
        supabase
          .from("tenants_table")
          .select("id, name, mobile_number, status, room_id, join_date, exit_date, deposit_amount, deposit_refund_amount, rent_due_day, rooms_table(id, room_number, rent_amount)")
          .eq("owner_id", user.id),
        supabase
          .from("payments")
          .select("*")
          .eq("owner_id", user.id),
        supabase
          .from("complaints")
          .select("id, owner_id, complaint_message, status, owner_response, created_at, updated_at, tenant_phone")
          .eq("owner_id", user.id)
      ])

      if (pgRes.error) throw pgRes.error
      if (tenantsRes.error) throw tenantsRes.error
      if (paymentsRes.error) throw paymentsRes.error
      if (complaintsRes.error) throw complaintsRes.error

      const pgs = pgRes.data || []
      const pgIds = pgs.map(p => p.id)
      
      let roomsData: any[] = []
      if (pgIds.length > 0) {
        const { data: rooms, error: roomsErr } = await supabase
          .from("rooms_table")
          .select("id, pg_id, room_number, total_beds, occupied_beds, status, rent_amount")
          .in("pg_id", pgIds)
        
        if (roomsErr) throw roomsErr
        roomsData = rooms || []
      }

      setRawTenants(tenantsRes.data || [])
      setRawPayments(paymentsRes.data || [])
      setRawRooms(roomsData)
      setRawComplaints(complaintsRes.data || [])
      if (pgs.length > 0) {
        setPgId(pgs[0].id)
      }

      hasLoadedOnce.current = true
    } catch (err) {
      console.error("Error fetching dashboard data:", err)
      showToast("Error", "Failed to retrieve dashboard data", "error")
    } finally {
      setDataLoading(false)
      setIsRefreshing(false)
    }
  }, [user?.id, showToast])

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && user?.id) {
        void fetchDashboardData(hasLoadedOnce.current)
      }
    }, [isAuthenticated, user?.id, fetchDashboardData])
  )

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints", filter: `owner_id=eq.${user.id}` },
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

  // Custom filter helper function
  const getDateRangeForFilter = useCallback((filter: string, customStartStr?: string, customEndStr?: string) => {
    const now = new Date()
    let startDate = new Date()
    let endDate = new Date()

    switch (filter) {
      case "Today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
        break
      case "This Week": {
        const day = now.getDay()
        const diff = now.getDate() - day + (day === 0 ? -6 : 1)
        startDate = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0)
        endDate = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59, 999)
        break
      }
      case "This Month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        break
      case "Last Month":
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
        break
      case "Custom Range":
        if (customStartStr && customEndStr) {
          startDate = new Date(customStartStr)
          endDate = new Date(customEndStr)
          endDate.setHours(23, 59, 59, 999)
        } else {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        }
        break
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    }

    return { startDate, endDate }
  }, [])

  const isDateInRange = useCallback((dateStr: string | null | undefined, start: Date, end: Date) => {
    if (!dateStr) return false
    const date = new Date(dateStr)
    return date >= start && date <= end
  }, [])

  // Analytical computation blocks
  const dateRange = useMemo(() => {
    return getDateRangeForFilter(selectedFilter, customStartDate, customEndDate)
  }, [selectedFilter, customStartDate, customEndDate, getDateRangeForFilter])

  const tenantMap = useMemo(() => {
    return new Map<number, any>(rawTenants.map(t => [t.id, t]))
  }, [rawTenants])

  const paymentsInRange = useMemo(() => {
    return rawPayments.filter(p => isDateInRange(p.due_date, dateRange.startDate, dateRange.endDate))
  }, [rawPayments, dateRange, isDateInRange])

  // Priority Card 1: Rent due in selected range
  const rentDueInRange = useMemo(() => {
    const uniqueTenants = new Set(paymentsInRange.map(p => p.tenant_id))
    const totalAmount = paymentsInRange.reduce((sum, p) => sum + Number(p.total_amount || 0), 0)
    return {
      count: uniqueTenants.size,
      amount: totalAmount
    }
  }, [paymentsInRange])

  // Priority Card 2: Overdue payments (globally outstanding)
  const overduePayments = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const unpaid = rawPayments.filter(p => {
      const isUnpaid = p.status !== "paid" && p.status !== "success" && p.status !== "completed"
      if (!p.due_date) return false
      const dueDate = new Date(p.due_date)
      return isUnpaid && dueDate < today
    })
    const uniqueTenants = new Set(unpaid.map(p => p.tenant_id))
    const totalAmount = unpaid.reduce((sum, p) => sum + Number(p.total_amount || 0), 0)
    return {
      count: uniqueTenants.size,
      amount: totalAmount
    }
  }, [rawPayments])

  // Priority Card 3 & Occupancy Overview: Vacant Beds
  const bedStats = useMemo(() => {
    let total = 0
    let occupied = 0
    rawRooms.forEach(r => {
      total += Number(r.total_beds || 0)
      occupied += Number(r.occupied_beds || 0)
    })
    return {
      total,
      occupied,
      vacant: Math.max(0, total - occupied)
    }
  }, [rawRooms])

  // Priority Card 4: Pending Complaints
  const pendingComplaintsCount = useMemo(() => {
    return rawComplaints.filter(c => c.status === "Under Working").length
  }, [rawComplaints])

  // Revenue Overview
  const revenueOverview = useMemo(() => {
    let expected = 0
    let collected = 0
    let pending = 0
    
    paymentsInRange.forEach(p => {
      const amt = Number(p.total_amount || 0)
      expected += amt
      if (p.status === "paid" || p.status === "success" || p.status === "completed") {
        collected += amt
      } else {
        pending += amt
      }
    })
    
    const percent = expected > 0 ? Math.round((collected / expected) * 100) : 0
    return { expected, collected, pending, percent }
  }, [paymentsInRange])

  // Today's Tasks
  const followUpPayments = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const unpaid = rawPayments.filter(p => {
      const isUnpaid = p.status !== "paid" && p.status !== "success" && p.status !== "completed"
      if (!p.due_date) return false
      const dueDate = new Date(p.due_date)
      return isUnpaid && (isDateInRange(p.due_date, dateRange.startDate, dateRange.endDate) || dueDate < today)
    })

    return unpaid.map(p => {
      const tenant = tenantMap.get(p.tenant_id)
      return {
        id: p.id,
        tenantName: tenant?.name || "Unknown",
        roomNumber: tenant?.rooms_table?.room_number || "—",
        amount: Number(p.total_amount || 0),
        dueDate: p.due_date,
        payment: p
      }
    }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
  }, [rawPayments, dateRange, tenantMap, isDateInRange])

  const maintenanceTasks = useMemo(() => {
    const active = rawComplaints.filter(c => c.status === "Under Working")
    return active.map(c => {
      const phoneClean = c.tenant_phone ? c.tenant_phone.replace(/\s+/g, "").slice(-10) : ""
      const tenant = rawTenants.find(t => {
        if (!t.mobile_number) return false
        const tPhoneClean = t.mobile_number.replace(/\s+/g, "").slice(-10)
        return phoneClean && tPhoneClean === phoneClean
      })
      
      return {
        id: c.id,
        message: c.complaint_message,
        roomNumber: tenant?.rooms_table?.room_number || "Anonymous",
        complaint: c
      }
    })
  }, [rawComplaints, rawTenants])

  const moveOutTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return rawTenants.filter(t => {
      const isLeaving = t.status === "notice_period" || t.status === "move_out"
      if (!isLeaving || !t.exit_date) return false

      const exitDate = new Date(t.exit_date)
      exitDate.setHours(0, 0, 0, 0)
      if (exitDate < today) return false

      return isDateInRange(t.exit_date, dateRange.startDate, dateRange.endDate)
    }).map(t => ({
      id: t.id,
      name: t.name || "Unknown",
      roomNumber: t.rooms_table?.room_number || "—",
      exitDate: t.exit_date,
      deposit: Number(t.deposit_amount || 0)
    }))
  }, [rawTenants, dateRange, isDateInRange])

  const checkInTasks = useMemo(() => {
    return rawTenants.filter(t => {
      const isNew = t.status === "pending_move_in"
      if (!isNew || !t.join_date) return false
      return isDateInRange(t.join_date, dateRange.startDate, dateRange.endDate)
    }).map(t => ({
      id: t.id,
      name: t.name || "Unknown",
      roomNumber: t.rooms_table?.room_number || "—",
      joinDate: t.join_date
    }))
  }, [rawTenants, dateRange, isDateInRange])

  const tasksHeading = useMemo(() => {
    switch (selectedFilter) {
      case "Today": return "Today's Tasks"
      case "This Week": return "This Week's Tasks"
      case "This Month": return "This Month's Tasks"
      case "Last Month": return "Last Month's Tasks"
      case "Custom Range": return "Custom Range Tasks"
      default: return "Today's Tasks"
    }
  }, [selectedFilter])

  // Recent Activity List (Submitted Payments + Working Complaints)
  const recentActivityList = useMemo(() => {
    const activityList: ActivityItem[] = []
    
    rawPayments.forEach(payment => {
      if (payment.status === "submitted") {
        const dateStr = payment.submitted_at || payment.created_at
        if (!dateStr) return
        const pDate = new Date(dateStr)
        const tenant = tenantMap.get(payment.tenant_id)
        
        activityList.push({
          id: `pay-${payment.id}`,
          type: "payment",
          tenant: tenant?.name || "Unknown Tenant",
          action: "Payment under review",
          amount: (payment.total_amount || payment.amount) ? `₹${Number(payment.total_amount || payment.amount).toLocaleString()}` : undefined,
          status: "pending",
          timestamp: pDate,
          time: "",
          rawItem: {
            ...payment,
            tenants_table: tenant ? {
              name: tenant.name,
              rooms_table: tenant.rooms_table
            } : null
          }
        })
      }
    })
    
    rawComplaints.forEach(complaint => {
      if (complaint.status === "Under Working") {
        const dateStr = complaint.created_at
        if (!dateStr) return
        const cDate = new Date(dateStr)
        
        activityList.push({
          id: `comp-${complaint.id}`,
          type: "complaint",
          tenant: "Anonymous Complaint",
          action: complaint.complaint_message,
          amount: undefined,
          status: "pending",
          timestamp: cDate,
          time: "",
          rawItem: complaint
        })
      }
    })
    
    activityList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    
    const now = new Date()
    return activityList.map(item => {
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
  }, [rawPayments, rawComplaints, tenantMap])

  // Filter recent activities to hide dismissed ones
  const filteredRecentActivity = useMemo(() => {
    return recentActivityList.filter((item) => !dismissedActivityIds.includes(item.id))
  }, [recentActivityList, dismissedActivityIds])

  // Clear all recent activities
  const handleClearAll = async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    const newDismissed = [...dismissedActivityIds, ...filteredRecentActivity.map(item => item.id)]
    setDismissedActivityIds(newDismissed)
    await SecureStore.setItemAsync("dismissed_activity_ids", JSON.stringify(newDismissed))
  }

  // Delete individual recent activity item
  const handleDeleteActivityItem = async (id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const newDismissed = [...dismissedActivityIds, id]
    setDismissedActivityIds(newDismissed)
    await SecureStore.setItemAsync("dismissed_activity_ids", JSON.stringify(newDismissed))
  }

  // Collection history (last 6 months bar chart)
  const collectionTrendData = useMemo(() => {
    const now = new Date()
    const monthsData: any[] = []
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthIndex = d.getMonth()
      const year = d.getFullYear()
      const barKey = `${year}-${monthIndex}`
      
      let monthlyCollected = 0
      rawPayments.forEach(p => {
        if (Number(p.month) === (monthIndex + 1) && Number(p.year) === year) {
          if (p.status === "paid" || p.status === "success" || p.status === "completed") {
            monthlyCollected += Number(p.total_amount || p.amount || 0)
          }
        }
      })
      
      const isLastBar = i === 0
      monthsData.push({
        value: monthlyCollected,
        label: d.toLocaleString("default", { month: "short" }),
        frontColor: "#0091ff",
        onPress: () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          setSelectedBarKey(selectedBarKey === barKey ? null : barKey)
        },
        topLabelComponent: selectedBarKey === barKey && monthlyCollected > 0 ? () => (
          <View 
            style={{ 
              minWidth: 46, 
              alignItems: 'center', 
              justifyContent: 'center', 
              transform: [{ translateX: isLastBar ? -12 : 0 }] 
            }} 
            className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded shadow-sm -mb-1"
          >
            <Text numberOfLines={1} className="text-[7px] font-black text-slate-900 dark:text-white text-center">
              ₹{monthlyCollected.toLocaleString()}
            </Text>
          </View>
        ) : undefined
      })
    }
    return monthsData
  }, [rawPayments, selectedBarKey])

  // Payment status breakdown percentages
  const paymentStatusOverview = useMemo(() => {
    let paidCount = 0
    let pendingCount = 0
    let lateCount = 0
    
    paymentsInRange.forEach(p => {
      if (p.status === "paid" || p.status === "success" || p.status === "completed") {
        paidCount++
      } else if (p.status === "late") {
        lateCount++
      } else {
        pendingCount++
      }
    })
    
    const total = paidCount + pendingCount + lateCount
    if (total === 0) {
      return { paid: 0, pending: 0, late: 0, paidPct: 0, pendingPct: 0, latePct: 0, total }
    }
    return {
      paid: paidCount,
      pending: pendingCount,
      late: lateCount,
      paidPct: Math.round((paidCount / total) * 100),
      pendingPct: Math.round((pendingCount / total) * 100),
      latePct: Math.round((lateCount / total) * 100),
      total
    }
  }, [paymentsInRange])

  // Upcoming scheduled check-ins & check-outs count
  const upcomingEventsSummary = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const checkIns = rawTenants.filter(t => {
      if (!t.join_date) return false
      return isDateInRange(t.join_date, dateRange.startDate, dateRange.endDate) && t.status === "pending_move_in"
    }).length

    const checkOuts = rawTenants.filter(t => {
      if (!t.exit_date) return false
      const exitDate = new Date(t.exit_date)
      exitDate.setHours(0, 0, 0, 0)
      if (exitDate < today) return false
      return isDateInRange(t.exit_date, dateRange.startDate, dateRange.endDate) && (t.status === "notice_period" || t.status === "move_out")
    }).length

    return { checkIns, checkOuts }
  }, [rawTenants, dateRange, isDateInRange])

  const upcomingVacancies = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    return rawTenants.filter(t => {
      const isLeaving = t.status === "notice_period" || t.status === "move_out"
      if (!isLeaving || !t.exit_date) return false
      
      const exitDate = new Date(t.exit_date)
      exitDate.setHours(0, 0, 0, 0)
      if (exitDate < today) return false

      return isDateInRange(t.exit_date, dateRange.startDate, dateRange.endDate)
    }).map(t => ({
      tenantName: t.name || "Unknown",
      roomNumber: t.rooms_table?.room_number || "—",
      exitDate: t.exit_date
    })).sort((a, b) => new Date(a.exitDate).getTime() - new Date(b.exitDate).getTime())
  }, [rawTenants, dateRange, isDateInRange])

  // Defaulters prioritized by Overdue Amount * Days Overdue
  const topDefaulters = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const unpaid = rawPayments.filter(p => {
      return p.status !== "paid" && p.status !== "success" && p.status !== "completed"
    })
    
    const tenantDuesMap = new Map<number, { totalAmount: number; oldestDueDate: Date }>()
    unpaid.forEach(p => {
      const amt = Number(p.total_amount || 0)
      if (!p.due_date) return
      const dueDate = new Date(p.due_date)
      const existing = tenantDuesMap.get(p.tenant_id)
      if (existing) {
        existing.totalAmount += amt
        if (dueDate < existing.oldestDueDate) {
          existing.oldestDueDate = dueDate
        }
      } else {
        tenantDuesMap.set(p.tenant_id, {
          totalAmount: amt,
          oldestDueDate: dueDate
        })
      }
    })
    
    return Array.from(tenantDuesMap.entries()).map(([tenantId, data]) => {
      const tenant = tenantMap.get(tenantId)
      const diffMs = today.getTime() - data.oldestDueDate.getTime()
      const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const score = daysOverdue > 0 
        ? data.totalAmount * daysOverdue 
        : data.totalAmount * 0.01
      
      const hasLate = unpaid.some(p => p.tenant_id === tenantId && p.status === "late")

      return {
        tenantId,
        name: tenant?.name || "Unknown Resident",
        roomNumber: tenant?.rooms_table?.room_number || "—",
        totalAmount: data.totalAmount,
        daysOverdue: Math.max(0, daysOverdue),
        priorityScore: score,
        hasLate
      }
    }).sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 5)
  }, [rawPayments, tenantMap])

  // UTR Copy, screenshot fetch and database mutations
  const fetchScreenshotUrl = async (path: string | null) => {
    if (!path) return
    setLoadingImage(true)
    try {
      const { data, error } = await supabase.storage
        .from("payment_screenshots")
        .createSignedUrl(path, 3600)

      if (error) throw error
      setSignedScreenshotUrl(data.signedUrl)

      Image.getSize(
        data.signedUrl,
        (width, height) => {
          if (width && height) {
            setImageAspectRatio(width / height)
          }
        },
        (err) => {
          console.error("Failed to get screenshot size:", err)
          setImageAspectRatio(null)
        }
      )
    } catch (err) {
      console.error("Error generating signed screenshot URL:", err)
      setSignedScreenshotUrl(null)
      setImageAspectRatio(null)
    } finally {
      setLoadingImage(false)
    }
  }

  useEffect(() => {
    if (paymentDetailModalVisible && selectedPayment?.screenshot_path) {
      void fetchScreenshotUrl(selectedPayment.screenshot_path)
    }
  }, [paymentDetailModalVisible, selectedPayment])

  const handleToggleFullscreenImage = () => {
    setImageFullScreen(!imageFullScreen)
  }

  const handleApprovePayment = async (payment: any) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    const now = new Date().toISOString()

    try {
      const { error } = await supabase
        .from("payments")
        .update({
          status: "paid",
          paid_at: now,
          verified_at: now
        })
        .eq("id", payment.id)

      if (error) throw error

      await supabase.from("payment_audit_log").insert({
        payment_id: payment.id,
        owner_id: user!.id,
        action: "proof_approved",
        old_status: payment.status,
        new_status: "paid",
        notes: "Approved via Mobile Verification Panel (Dashboard)"
      })

      setPaymentDetailModalVisible(false)
      showToast("Payment Approved", "The payment proof has been approved.", "success")
      void fetchDashboardData(true)
    } catch (err) {
      console.error("Approve payment error:", err)
      showToast("Database Error", "Failed to approve payment record.", "error")
      void fetchDashboardData(true)
    }
  }

  const handleRejectPayment = async (payment: any) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    
    try {
      const { error } = await supabase
        .from("payments")
        .update({
          status: "pending",
          verified_at: new Date().toISOString(),
          verification_notes: rejectNotes || null,
          screenshot_path: null,
          utr_number: null
        })
        .eq("id", payment.id)

      if (error) throw error

      await supabase.from("payment_audit_log").insert({
        payment_id: payment.id,
        owner_id: user!.id,
        action: "proof_rejected",
        old_status: payment.status,
        new_status: "pending",
        notes: rejectNotes || "Rejected via Mobile Verification Panel (Dashboard)"
      })

      setPaymentDetailModalVisible(false)
      setRejectingMode(false)
      setRejectNotes("")
      showToast("Payment Rejected", "The payment proof has been rejected.", "warning")
      void fetchDashboardData(true)
    } catch (err) {
      console.error("Reject payment error:", err)
      showToast("Database Error", "Failed to reject payment record.", "error")
      void fetchDashboardData(true)
    }
  }

  const handleDeletePayment = (paymentId: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setDeletingPaymentId(paymentId)
    setDeleteConfirmVisible(true)
  }

  const confirmDeletePayment = async () => {
    if (!deletingPaymentId) return
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      const { error } = await supabase
        .from("payments")
        .delete()
        .eq("id", deletingPaymentId)

      if (error) throw error
      setPaymentDetailModalVisible(false)
      setDeleteConfirmVisible(false)
      showToast("Deleted Successfully", "The billing record has been permanently deleted.", "success")
      void fetchDashboardData(true)
    } catch (err) {
      console.error("Error deleting payment record:", err)
      showToast("Database Error", "Failed to delete the selected billing row.", "error")
    } finally {
      setDeletingPaymentId(null)
    }
  }

  const handleWhatsAppReminder = async (payment: any) => {
    if (!payment) return
    
    const phone = payment.tenants_table?.mobile_number
    if (!phone) {
      Alert.alert("Missing Phone Number", "This tenant does not have a registered mobile number.")
      return
    }

    try {
      const { data: linkData, error: linkError } = await supabase
        .from("monthly_payment_links")
        .select("portal_token")
        .eq("owner_id", user!.id)
        .eq("month", payment.month)
        .eq("year", payment.year)
        .maybeSingle()

      if (linkError) throw linkError

      let activePortalToken = linkData?.portal_token
      if (!activePortalToken) {
        activePortalToken = Math.random().toString(36).substring(2, 14)
        await supabase
          .from("monthly_payment_links")
          .upsert({
            owner_id: user!.id,
            month: payment.month,
            year: payment.year,
            portal_token: activePortalToken
          }, { onConflict: "owner_id,month,year" })
      }

      const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ]

      const tenantName = payment.tenants_table?.name || "Tenant"
      const amount = payment.total_amount || payment.amount
      const monthName = MONTH_NAMES[payment.month - 1] || "Current Month"
      const year = payment.year
      
      let formattedDueDate = "—"
      if (payment.due_date) {
        const d = new Date(payment.due_date)
        formattedDueDate = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      }
      
      const paymentLink = `https://staytraq.vercel.app/pay/${activePortalToken}`
      const message = payment.status === "late"
        ? `Hi ${tenantName},\n\nThis is a reminder that your rent payment of ₹${amount} for ${monthName} ${year} was due on ${formattedDueDate} and is currently overdue.\n\nPlease clear the outstanding amount as soon as possible and submit the payment proof here: ${paymentLink}\n\nIf you have already paid, please ignore this message. Thank you!`
        : `Hi ${tenantName},\n\nThis is a friendly reminder that your rent payment of ₹${amount} for ${monthName} ${year} is due on ${formattedDueDate}.\n\nYou can view your invoice and submit the payment proof directly here: ${paymentLink}\n\nThank you!`

      let cleanPhone = phone.replace(/[^0-9]/g, "")
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone
      }
      
      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      await Linking.openURL(url)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } catch (err) {
      console.error("Error generating WhatsApp reminder:", err)
      Alert.alert("Error", "Could not generate reminder link or open WhatsApp.")
    }
  }

  const handleMarkAsPaid = async (payment: any) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    const now = new Date().toISOString()

    try {
      const { error } = await supabase
        .from("payments")
        .update({
          status: "paid",
          paid_at: now,
          verified_at: now,
          payment_method: "UPI"
        })
        .eq("id", payment.id)

      if (error) throw error

      await supabase.from("payment_audit_log").insert({
        payment_id: payment.id,
        owner_id: user!.id,
        action: "proof_approved",
        old_status: payment.status,
        new_status: "paid",
        notes: "Marked as paid via Dashboard"
      })

      setPaymentDetailModalVisible(false)
      showToast("Payment Success", "The payment has been marked as paid.", "success")
      void fetchDashboardData(true)
    } catch (err) {
      console.error("Mark as paid error:", err)
      showToast("Database Error", "Failed to update payment status.", "error")
      void fetchDashboardData(true)
    }
  }

  const handleSaveComplaintDetails = async () => {
    if (!selectedComplaint) return
    setIsSavingDetails(true)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    try {
      const { error } = await supabase
        .from("complaints")
        .update({
          status: updatedStatus,
          owner_response: ownerResponseText.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", selectedComplaint.id)

      if (error) throw error

      showToast("Complaint Updated", "Changes saved successfully.", "success")
      setComplaintDetailModalVisible(false)
      void fetchDashboardData(true)
    } catch (err) {
      console.error("Error saving complaint details:", err)
      showToast("Error", "Failed to save updates.", "error")
      void fetchDashboardData(true)
    } finally {
      setIsSavingDetails(false)
    }
  }

  const handleOpenActivityModal = (item: ActivityItem) => {
    if (item.type === "payment") {
      setSelectedPayment(item.rawItem)
      setPaymentDetailModalVisible(true)
      setRejectingMode(false)
      setRejectNotes("")
    } else if (item.type === "complaint") {
      setSelectedComplaint(item.rawItem)
      setUpdatedStatus(item.rawItem.status)
      setOwnerResponseText(item.rawItem.owner_response || "")
      setComplaintDetailModalVisible(true)
    }
  }

  const getToastIcon = (type: "success" | "error" | "info" | "warning", isDark: boolean) => {
    const color = isDark 
      ? (type === "success" ? "#4ade80" : type === "error" ? "#f87171" : type === "warning" ? "#fbbf24" : "#60a5fa")
      : (type === "success" ? "#16a34a" : type === "error" ? "#dc2626" : type === "warning" ? "#d97706" : "#2563eb")
    
    switch (type) {
      case "success": return <Check size={16} color={color} strokeWidth={3} />
      case "error": return <X size={16} color={color} strokeWidth={3} />
      case "warning": return <AlertTriangle size={16} color={color} strokeWidth={3} />
      default: return <Info size={16} color={color} strokeWidth={3} />
    }
  }

  const getToastBorderColor = (type: "success" | "error" | "info" | "warning", isDark: boolean) => {
    return isDark
      ? (type === "success" ? "rgba(74, 222, 128, 0.25)" : type === "error" ? "rgba(248, 113, 113, 0.25)" : type === "warning" ? "rgba(251, 191, 36, 0.25)" : "rgba(96, 165, 250, 0.25)")
      : (type === "success" ? "rgba(22, 163, 74, 0.25)" : type === "error" ? "rgba(220, 38, 38, 0.25)" : type === "warning" ? "rgba(217, 119, 6, 0.25)" : "rgba(37, 99, 235, 0.25)")
  }

  const renderToast = () => {
    if (!toast.visible) return null
    return (
      <Animated.View
        style={[
          styles.toastContainer,
          isDark ? styles.toastDark : styles.toastLight,
          {
            transform: [{ translateX: toastTranslateX }],
            opacity: toastOpacity,
            borderColor: getToastBorderColor(toast.type, isDark)
          }
        ]}
      >
        <View style={styles.toastIconContainer}>
          {getToastIcon(toast.type, isDark)}
        </View>
        <View className="flex-1 ml-2">
          <Text className="text-[11px] font-black text-slate-900 dark:text-white">{toast.title}</Text>
          <Text className="text-[9px] text-slate-500 dark:text-slate-400 font-medium mt-0.5" numberOfLines={2}>
            {toast.message}
          </Text>
        </View>
      </Animated.View>
    )
  }

  const getPaymentStatusBadge = (status: string) => {
    const isPaid = status === "paid" || status === "success" || status === "completed"
    if (isPaid) {
      return (
        <View className="px-2.5 py-1 rounded border capitalize bg-success/10 border-success/30">
          <Text className="text-[9px] font-black uppercase text-success">paid</Text>
        </View>
      )
    }
    if (status === "submitted") {
      return (
        <View className="px-2.5 py-1 rounded border capitalize bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30">
          <Text className="text-[9px] font-black uppercase text-purple-600 dark:text-purple-400">submitted</Text>
        </View>
      )
    }
    if (status === "late") {
      return (
        <View className="px-2.5 py-1 rounded border capitalize bg-destructive/10 border-destructive/30">
          <Text className="text-[9px] font-black uppercase text-destructive">late</Text>
        </View>
      )
    }
    return (
      <View className="px-2.5 py-1 rounded border capitalize bg-amber-500/10 border-amber-500/30">
        <Text className="text-[9px] font-black uppercase text-amber-500">pending</Text>
      </View>
    )
  }

  const getCompactStatusBadge = (status: string) => {
    const isPaid = status === "paid" || status === "success" || status === "completed"
    if (isPaid) {
      return (
        <View className="px-1.5 py-0.5 rounded border border-success/30 bg-success/10 ml-2">
          <Text className="text-[7px] font-black uppercase text-success">paid</Text>
        </View>
      )
    }
    if (status === "submitted") {
      return (
        <View className="px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 ml-2">
          <Text className="text-[7px] font-black uppercase text-purple-600 dark:text-purple-400">review</Text>
        </View>
      )
    }
    if (status === "late") {
      return (
        <View className="px-1.5 py-0.5 rounded border border-destructive/30 bg-destructive/10 ml-2">
          <Text className="text-[7px] font-black uppercase text-destructive">late</Text>
        </View>
      )
    }
    return (
      <View className="px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 ml-2">
        <Text className="text-[7px] font-black uppercase text-amber-500">pending</Text>
      </View>
    )
  }

  // Dynamic header greeting and date
  const headerGreeting = useMemo(() => {
    const hours = new Date().getHours()
    if (hours < 12) return "Good Morning"
    if (hours < 17) return "Good Afternoon"
    return "Good Evening"
  }, [])

  const headerDateStr = useMemo(() => {
    return new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    })
  }, [])

  // Character-based expected/collected revenue bar helper
  const getCharProgressBar = (pct: number) => {
    const totalChars = 10
    const filledChars = Math.round((Math.max(0, Math.min(100, pct)) / 100) * totalChars)
    const emptyChars = totalChars - filledChars
    return "█".repeat(filledChars) + "░".repeat(emptyChars)
  }

  if (dataLoading && !hasLoadedOnce.current) {
    return (
      <SafeAreaView key="dashboard-loading" className="flex-1 bg-background dark:bg-background-dark" edges={["top"]}>
        <View className="px-6 pt-4 pb-6 flex-row justify-between items-center">
          <View className="gap-2">
            <View className="h-7 w-28 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
            <View className="h-4 w-48 bg-muted/15 dark:bg-muted-dark/15 rounded-lg" />
          </View>
          <View className="flex-row gap-2">
            <View className="h-10 w-10 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-6 pb-6 flex-row flex-wrap justify-between">
            {[1, 2, 3, 4].map((i) => (
              <View
                key={i}
                className="w-[48%] h-28 bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-3xl mb-4 shadow-sm opacity-65 gap-2"
              >
                <View className="flex-row justify-between items-center">
                  <View className="h-8 w-8 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
                  <View className="h-3 w-14 bg-muted/15 dark:bg-muted-dark/15 rounded-md" />
                </View>
                <View className="h-6 w-20 bg-muted/25 dark:bg-muted-dark/25 rounded-md" />
                <View className="h-3 w-24 bg-muted/10 dark:bg-muted-dark/10 rounded-md" />
              </View>
            ))}
          </View>

          <View className="px-6 gap-6">
            <View className="h-56 w-full bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-5 shadow-sm opacity-60" />
            <View className="h-56 w-full bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-5 shadow-sm opacity-60" />
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView key="dashboard-loaded" className="flex-1 bg-background dark:bg-background-dark" edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={isDark ? "#0091ff" : "#0071df"} />
        }
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-4 flex-row justify-between items-center">
          <View>
            <Text className="text-xl font-black text-foreground dark:text-foreground-dark tracking-tight">
              {headerGreeting}
            </Text>
            <Text className="text-[11px] text-muted dark:text-muted-dark font-bold uppercase tracking-wider mt-0.5">
              {headerDateStr}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity 
              onPress={() => router.push("/settings")}
              className="h-9 w-9 border border-border dark:border-border-dark rounded-xl items-center justify-center bg-card dark:bg-card-dark"
            >
              <Settings size={16} color={isDark ? "#0091ff" : "#0071df"} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Date Filters Chips */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
          className="flex-grow-0 flex-shrink-0"
        >
          {["Today", "This Week", "This Month", "Last Month", "Custom Range"].map((filter) => {
            const active = selectedFilter === filter
            return (
              <TouchableOpacity
                key={filter}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  if (filter === "Custom Range") {
                    setCustomRangePickerVisible(true)
                  } else {
                    setSelectedFilter(filter)
                  }
                }}
                className={`px-4 py-1.5 rounded-full mr-2 border ${
                  active 
                    ? "bg-primary border-primary" 
                    : "bg-card dark:bg-card-dark border-border dark:border-border-dark"
                }`}
              >
                <Text className={`text-[10px] font-black uppercase tracking-wider ${active ? "text-white" : "text-muted"}`}>
                  {filter}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Selected custom range label */}
        {selectedFilter === "Custom Range" && customStartDate && customEndDate && (
          <View className="px-6 pb-4 flex-row justify-between items-center">
            <Text className="text-[10px] text-primary font-bold uppercase tracking-widest">
              Range: {new Date(customStartDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} - {new Date(customEndDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </Text>
            <TouchableOpacity 
              onPress={() => setCustomRangePickerVisible(true)}
              className="px-2 py-1 bg-primary/10 rounded-lg border border-primary/20"
            >
              <Text className="text-[8px] font-black text-primary uppercase">Edit Range</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Priority Summary Cards Grid */}
        <View className="px-6 pb-4 flex-row flex-wrap justify-between">
          {/* Card 1: Rent Due */}
          <View className="w-[48%] bg-card dark:bg-card-dark border border-border dark:border-border-dark p-3.5 rounded-2xl mb-3 shadow-sm">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[9px] font-bold text-muted dark:text-muted-dark uppercase tracking-wider">Expected Rent</Text>
              <View className="p-1 bg-primary/10 rounded-lg">
                <IndianRupee size={12} color={isDark ? "#0091ff" : "#0071df"} />
              </View>
            </View>
            <Text className="text-[16px] font-black text-foreground dark:text-foreground-dark">
              ₹{rentDueInRange.amount.toLocaleString()}
            </Text>
            <Text className="text-[9px] text-muted dark:text-muted-dark font-medium mt-0.5">
              {rentDueInRange.count} tenants due
            </Text>
          </View>

          {/* Card 2: Overdue Payments */}
          <TouchableOpacity 
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              router.push({ pathname: "/payments", params: { status: "late" } })
            }}
            className="w-[48%] bg-card dark:bg-card-dark border border-border dark:border-border-dark p-3.5 rounded-2xl mb-3 shadow-sm relative overflow-hidden"
          >
            <View className="absolute top-0 left-0 right-0 h-[2px] bg-destructive" />
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[9px] font-bold text-muted dark:text-muted-dark uppercase tracking-wider">Overdue</Text>
              <View className="p-1 bg-destructive/10 rounded-lg">
                <AlertTriangle size={12} color="#ef4444" />
              </View>
            </View>
            <Text className="text-[16px] font-black text-destructive">
              ₹{overduePayments.amount.toLocaleString()}
            </Text>
            <Text className="text-[9px] text-muted dark:text-muted-dark font-medium mt-0.5">
              {overduePayments.count} defaulters
            </Text>
          </TouchableOpacity>

          {/* Card 3: Vacant Beds */}
          <TouchableOpacity 
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              router.push({ pathname: "/rooms", params: { sort: "vacant_first" } })
            }}
            className="w-[48%] bg-card dark:bg-card-dark border border-border dark:border-border-dark p-3.5 rounded-2xl shadow-sm relative overflow-hidden"
          >
            <View className="absolute top-0 left-0 right-0 h-[2px] bg-success" />
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[9px] font-bold text-muted dark:text-muted-dark uppercase tracking-wider">Vacant Beds</Text>
              <View className="p-1 bg-success/10 rounded-lg">
                <Users size={12} color="#10b981" />
              </View>
            </View>
            <Text className="text-[16px] font-black text-success">
              {bedStats.vacant}
            </Text>
            <Text className="text-[9px] text-muted dark:text-muted-dark font-medium mt-0.5">
              out of {bedStats.total} beds
            </Text>
          </TouchableOpacity>

          {/* Card 4: Complaints Pending */}
          <TouchableOpacity 
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              router.push("/complaints")
            }}
            className="w-[48%] bg-card dark:bg-card-dark border border-border dark:border-border-dark p-3.5 rounded-2xl shadow-sm relative overflow-hidden"
          >
            <View className="absolute top-0 left-0 right-0 h-[2px] bg-amber-500" />
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[9px] font-bold text-muted dark:text-muted-dark uppercase tracking-wider">Complaints</Text>
              <View className="p-1 bg-amber-500/10 rounded-lg">
                <Inbox size={12} color="#f59e0b" />
              </View>
            </View>
            <Text className="text-[16px] font-black text-amber-500">
              {pendingComplaintsCount}
            </Text>
            <Text className="text-[9px] text-muted dark:text-muted-dark font-medium mt-0.5">
              Under Working
            </Text>
          </TouchableOpacity>
        </View>

        {/* Revenue Performance Overview */}
        <View className="px-6 mb-4">
          <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-2xl shadow-sm">
            <Text className="text-[10px] font-black text-foreground dark:text-foreground-dark uppercase tracking-wider mb-2.5">Revenue Performance</Text>
            
            <View className="flex-row justify-between items-end mb-2">
              <View>
                <Text className="text-[9px] text-muted dark:text-muted-dark font-bold uppercase tracking-wider">Collected</Text>
                <Text className="text-xl font-black text-foreground dark:text-foreground-dark">₹{revenueOverview.collected.toLocaleString()}</Text>
              </View>
              <View className="items-end">
                <Text className="text-xs font-black text-primary">{revenueOverview.percent}%</Text>
                <Text className="text-[9px] font-mono text-muted dark:text-muted-dark mt-0.5">{getCharProgressBar(revenueOverview.percent)}</Text>
              </View>
            </View>

            <View className="h-2 bg-muted/10 dark:bg-muted-dark/20 rounded-full overflow-hidden flex-row mb-3">
              <View className="bg-primary h-full rounded-full" style={{ width: `${Math.min(100, revenueOverview.percent)}%` }} />
            </View>

            <View className="flex-row justify-between pt-2 border-t border-border/20 dark:border-border-dark/20">
              <View>
                <Text className="text-[8px] text-muted dark:text-muted-dark font-bold uppercase tracking-wider">Expected</Text>
                <Text className="text-xs font-extrabold text-foreground dark:text-foreground-dark">₹{revenueOverview.expected.toLocaleString()}</Text>
              </View>
              <View className="items-end">
                <Text className="text-[8px] text-muted dark:text-muted-dark font-bold uppercase tracking-wider">Pending</Text>
                <Text className="text-xs font-extrabold text-amber-500">₹{revenueOverview.pending.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Today's Actionable Tasks */}
        <View className="px-6 mb-4">
          <Text className="text-[10px] font-black text-foreground dark:text-foreground-dark uppercase tracking-widest mb-2">{tasksHeading}</Text>
          
          {followUpPayments.length === 0 && maintenanceTasks.length === 0 && moveOutTasks.length === 0 && checkInTasks.length === 0 ? (
            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-2xl items-center justify-center">
              <Text className="text-xs text-muted dark:text-muted-dark font-semibold text-center">All caught up! No tasks pending for this period. 🎉</Text>
            </View>
          ) : (
            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-2xl gap-4">
              
              {/* Follow-up Payments */}
              {followUpPayments.length > 0 && (
                <View>
                  <Text className="text-[9px] font-black text-destructive uppercase tracking-widest mb-1.5">Follow-Up Payments ({followUpPayments.length})</Text>
                  <View className="gap-2">
                    {followUpPayments.slice(0, 3).map((item) => (
                      <TouchableOpacity 
                        key={`task-pay-${item.id}`}
                        onPress={() => {
                          setSelectedPayment(item.payment)
                          setPaymentDetailModalVisible(true)
                        }}
                        className="flex-row justify-between items-center py-2 border-b border-border/10 dark:border-border-dark/10"
                      >
                        <View className="flex-row items-center flex-1 pr-2">
                          <View className="h-1.5 w-1.5 rounded-full bg-destructive mr-2" />
                          <View className="flex-1">
                            <View className="flex-row items-center flex-wrap">
                              <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">{item.tenantName}</Text>
                              {getCompactStatusBadge(item.payment.status)}
                            </View>
                            <Text className="text-[8px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                              Room {item.roomNumber} • Due <Text className="text-slate-900 dark:text-white font-black">{item.dueDate}</Text>
                            </Text>
                          </View>
                        </View>
                        <Text className="text-xs font-extrabold text-foreground dark:text-foreground-dark">₹{item.amount.toLocaleString()}</Text>
                      </TouchableOpacity>
                    ))}
                    {followUpPayments.length > 3 && (
                      <Text className="text-[8px] text-muted dark:text-muted-dark italic mt-1">+ {followUpPayments.length - 3} more payments pending</Text>
                    )}
                  </View>
                </View>
              )}

              {/* Maintenance */}
              {maintenanceTasks.length > 0 && (
                <View>
                  <Text className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1.5">Maintenance Issues ({maintenanceTasks.length})</Text>
                  <View className="gap-2">
                    {maintenanceTasks.slice(0, 3).map((item) => (
                      <TouchableOpacity 
                        key={`task-maint-${item.id}`}
                        onPress={() => {
                          setSelectedComplaint(item.complaint)
                          setUpdatedStatus(item.complaint.status)
                          setOwnerResponseText(item.complaint.owner_response || "")
                          setComplaintDetailModalVisible(true)
                        }}
                        className="flex-row justify-between items-center py-2 border-b border-border/10 dark:border-border-dark/10"
                      >
                        <View className="flex-row items-center flex-1 pr-2">
                          <View className="h-1.5 w-1.5 rounded-full bg-amber-500 mr-2" />
                          <View className="flex-1">
                            <Text className="text-xs font-bold text-foreground dark:text-foreground-dark" numberOfLines={1}>{item.message}</Text>
                            <Text className="text-[8px] text-muted dark:text-muted-dark font-medium mt-0.5">Room {item.roomNumber}</Text>
                          </View>
                        </View>
                        <ChevronRight size={10} color="#9ca3af" />
                      </TouchableOpacity>
                    ))}
                    {maintenanceTasks.length > 3 && (
                      <Text className="text-[8px] text-muted dark:text-muted-dark italic mt-1">+ {maintenanceTasks.length - 3} more issues under working</Text>
                    )}
                  </View>
                </View>
              )}

              {/* Check-ins */}
              {checkInTasks.length > 0 && (
                <View>
                  <Text className="text-[9px] font-black text-success uppercase tracking-widest mb-1.5">Check-Ins ({checkInTasks.length})</Text>
                  <View className="gap-2">
                    {checkInTasks.map((item) => (
                      <TouchableOpacity 
                        key={`task-checkin-${item.id}`}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          router.push({ pathname: "/tenants", params: { search: item.name } })
                        }}
                        className="flex-row justify-between items-center py-2 border-b border-border/10 dark:border-border-dark/10 active:opacity-85"
                      >
                        <View className="flex-row items-center flex-1 pr-2">
                          <View className="h-1.5 w-1.5 rounded-full bg-success mr-2" />
                          <View className="flex-1">
                            <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">{item.name}</Text>
                            <Text className="text-[8px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                              Room {item.roomNumber} • Join Date <Text className="text-slate-900 dark:text-white font-black">{item.joinDate}</Text>
                            </Text>
                          </View>
                        </View>
                        <ChevronRight size={10} color="#9ca3af" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Move-outs */}
              {moveOutTasks.length > 0 && (
                <View>
                  <Text className="text-[9px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-1.5">Move-Outs ({moveOutTasks.length})</Text>
                  <View className="gap-2">
                    {moveOutTasks.map((item) => (
                      <TouchableOpacity 
                        key={`task-moveout-${item.id}`}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          router.push({ pathname: "/tenants", params: { search: item.name } })
                        }}
                        className="flex-row justify-between items-center py-2 border-b border-border/10 dark:border-border-dark/10 active:opacity-85"
                      >
                        <View className="flex-row items-center flex-1 pr-2">
                          <View className="h-1.5 w-1.5 rounded-full bg-purple-600 mr-2" />
                          <View className="flex-1">
                            <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">{item.name}</Text>
                            <Text className="text-[8px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                              Room {item.roomNumber} • Exit Date <Text className="text-slate-900 dark:text-white font-black">{item.exitDate}</Text>
                            </Text>
                          </View>
                        </View>
                        <View className="flex-row items-center gap-1.5">
                          <Text className="text-xs font-bold text-purple-600 dark:text-purple-400">Refund: ₹{item.deposit.toLocaleString()}</Text>
                          <ChevronRight size={10} color="#9ca3af" />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

            </View>
          )}
        </View>

        {/* Recent Activity Section */}
        <View className="px-6 mb-4">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-[10px] font-black text-foreground dark:text-foreground-dark uppercase tracking-widest">
              Recent Activity
            </Text>
            {filteredRecentActivity.length > 0 && (
              <TouchableOpacity 
                onPress={handleClearAll}
                className="flex-row items-center bg-destructive/10 px-2.5 py-1 rounded-lg active:scale-95"
              >
                <Text className="text-[9px] font-black text-destructive mr-1 uppercase">
                  Clear All
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {filteredRecentActivity.length === 0 ? (
            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-6 rounded-2xl items-center justify-center h-24">
              <Text className="text-xs text-muted dark:text-muted-dark font-medium text-center">
                No recent activity requiring action
              </Text>
            </View>
          ) : (
            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-2xl">
              {filteredRecentActivity.map((item, index) => (
                <View key={item.id}>
                  <View
                    className={`flex-row items-center justify-between py-2.5 border-border/10 dark:border-border-dark/10 ${
                      index === filteredRecentActivity.length - 1 ? "border-b-0" : "border-b"
                    }`}
                  >
                    <TouchableOpacity 
                      onPress={() => handleOpenActivityModal(item)}
                      className="flex-row items-center flex-1 pr-3"
                    >
                      <View className={`h-8 w-8 rounded-full items-center justify-center mr-3 ${
                        item.type === "complaint" 
                          ? "bg-destructive/10" 
                          : "bg-warning/10"
                      }`}>
                        {item.type === "complaint" ? (
                          <Inbox size={14} color="#ef4444" />
                        ) : (
                          <Clock size={14} color="#f59e0b" />
                        )}
                      </View>
                      
                      <View className="flex-1 pr-1">
                        {item.type === "complaint" ? (
                          <Text className="text-xs font-bold text-foreground dark:text-foreground-dark" numberOfLines={2}>
                            {item.action}
                          </Text>
                        ) : (
                          <>
                            <Text className="text-xs font-bold text-foreground dark:text-foreground-dark" numberOfLines={1}>
                              {item.tenant}
                            </Text>
                            <Text className="text-[10px] text-muted dark:text-muted-dark font-medium mt-0.5" numberOfLines={1}>
                              {item.action}
                            </Text>
                          </>
                        )}
                      </View>
                    </TouchableOpacity>

                    <View className="flex-row items-center gap-3">
                      <View className="items-end">
                        {item.amount && (
                          <Text className="text-xs font-extrabold text-foreground dark:text-foreground-dark">
                            {item.amount}
                          </Text>
                        )}
                        <Text className="text-[8px] text-muted dark:text-muted-dark font-semibold mt-0.5">
                          {item.time}
                        </Text>
                      </View>
                      
                      <TouchableOpacity 
                        onPress={() => handleDeleteActivityItem(item.id)}
                        className="h-6 w-6 bg-muted/10 dark:bg-muted-dark/20 rounded-full items-center justify-center active:scale-95"
                      >
                        <X size={10} color={isDark ? "#f87171" : "#dc2626"} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Occupancy Rate & Beds Overview */}
        <View className="px-6 mb-4">
          <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-2xl shadow-sm">
            <Text className="text-[10px] font-black text-foreground dark:text-foreground-dark uppercase tracking-wider mb-2.5">Occupancy Rate</Text>
            
            <View className="flex-row justify-between items-end mb-2">
              <View>
                <Text className="text-[9px] text-muted dark:text-muted-dark font-bold uppercase tracking-wider">Occupied Beds</Text>
                <Text className="text-xl font-black text-foreground dark:text-foreground-dark">{bedStats.occupied} / {bedStats.total}</Text>
              </View>
              <View className="items-end">
                <Text className="text-xs font-black text-success">
                  {bedStats.total > 0 ? Math.round((bedStats.occupied / bedStats.total) * 100) : 0}%
                </Text>
                <Text className="text-[9px] font-mono text-muted dark:text-muted-dark mt-0.5 font-bold">
                  {getCharProgressBar(bedStats.total > 0 ? Math.round((bedStats.occupied / bedStats.total) * 100) : 0)}
                </Text>
              </View>
            </View>

            <View className="h-2 bg-muted/10 dark:bg-muted-dark/20 rounded-full overflow-hidden flex-row">
              <View className="bg-success h-full rounded-full" style={{ width: `${bedStats.total > 0 ? (bedStats.occupied / bedStats.total) * 100 : 0}%` }} />
            </View>

            {upcomingVacancies.length > 0 && (
              <View className="mt-3 pt-3 border-t border-border/10 dark:border-border-dark/10">
                <Text className="text-[8px] font-black text-muted dark:text-muted-dark uppercase tracking-wider mb-2">Upcoming Vacating Beds</Text>
                <View className="gap-2">
                  {upcomingVacancies.map((vacancy, idx) => (
                    <TouchableOpacity 
                      key={`vacancy-${idx}`} 
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        router.push({ pathname: "/rooms", params: { status: "notice_period" } })
                      }}
                      className="flex-row justify-between items-center py-2 px-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-border/5 active:opacity-90"
                    >
                      <View className="flex-row items-center flex-1 pr-2">
                        <View className="h-1.5 w-1.5 rounded-full bg-purple-600 dark:bg-purple-400 mr-2" />
                        <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark flex-1" numberOfLines={1}>
                          Room {vacancy.roomNumber} • {vacancy.tenantName}
                        </Text>
                      </View>
                      <Text className="text-[10px] font-bold text-purple-600 dark:text-purple-400">
                        Vacating {new Date(vacancy.exitDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Rent Collection History Chart */}
        <View className="px-6 mb-4">
          <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-2xl shadow-sm">
            <Text className="text-[10px] font-black text-foreground dark:text-foreground-dark uppercase tracking-wider mb-4">Rent Collection History</Text>
            
            {collectionTrendData.every(d => d.value === 0) ? (
              <View className="h-40 items-center justify-center">
                <Text className="text-xs text-muted dark:text-muted-dark font-semibold">No recent collections</Text>
              </View>
            ) : (
              <View style={{ overflow: 'visible', zIndex: 10 }} className="align-center items-center">
                <BarChart
                  data={collectionTrendData}
                  barWidth={18}
                  spacing={12}
                  roundedTop
                  roundedBottom
                  hideRules
                  yAxisThickness={0}
                  xAxisThickness={0}
                  yAxisTextStyle={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: 8 }}
                  xAxisLabelTextStyle={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: 9, fontWeight: "bold" }}
                  noOfSections={4}
                  initialSpacing={10}
                  endSpacing={25}
                  height={130}
                  isAnimated
                  frontColor="#0091ff"
                />
              </View>
            )}
          </View>
        </View>

        {/* Payment Status Breakdown */}
        <View className="px-6 mb-4">
          <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-2xl shadow-sm">
            <Text className="text-[10px] font-black text-foreground dark:text-foreground-dark uppercase tracking-wider mb-3">Billing Status Breakdown</Text>
            
            {paymentStatusOverview.total === 0 ? (
              <View className="h-10 items-center justify-center">
                <Text className="text-xs text-muted dark:text-muted-dark font-semibold">No records in this range</Text>
              </View>
            ) : (
              <View>
                <View className="h-2 bg-muted/10 dark:bg-muted-dark/20 rounded-full overflow-hidden flex-row mb-4">
                  {paymentStatusOverview.paidPct > 0 && (
                    <View className="bg-success h-full" style={{ width: `${paymentStatusOverview.paidPct}%` }} />
                  )}
                  {paymentStatusOverview.pendingPct > 0 && (
                    <View className="bg-amber-500 h-full" style={{ width: `${paymentStatusOverview.pendingPct}%` }} />
                  )}
                  {paymentStatusOverview.latePct > 0 && (
                    <View className="bg-destructive h-full" style={{ width: `${paymentStatusOverview.latePct}%` }} />
                  )}
                </View>
                
                <View className="flex-row justify-around">
                  <View className="items-center">
                    <View className="flex-row items-center gap-1">
                      <View className="h-1.5 w-1.5 rounded-full bg-success" />
                      <Text className="text-[8px] text-muted dark:text-muted-dark font-bold uppercase">Paid</Text>
                    </View>
                    <Text className="text-[11px] font-black text-foreground dark:text-foreground-dark">{paymentStatusOverview.paidPct}% ({paymentStatusOverview.paid})</Text>
                  </View>

                  <View className="items-center">
                    <View className="flex-row items-center gap-1">
                      <View className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      <Text className="text-[8px] text-muted dark:text-muted-dark font-bold uppercase">Pending</Text>
                    </View>
                    <Text className="text-[11px] font-black text-foreground dark:text-foreground-dark">{paymentStatusOverview.pendingPct}% ({paymentStatusOverview.pending})</Text>
                  </View>

                  <View className="items-center">
                    <View className="flex-row items-center gap-1">
                      <View className="h-1.5 w-1.5 rounded-full bg-destructive" />
                      <Text className="text-[8px] text-muted dark:text-muted-dark font-bold uppercase">Late</Text>
                    </View>
                    <Text className="text-[11px] font-black text-foreground dark:text-foreground-dark">{paymentStatusOverview.latePct}% ({paymentStatusOverview.late})</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Upcoming Events Summary Box */}
        <View className="px-6 mb-4">
          <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-2xl shadow-sm">
            <Text className="text-[10px] font-black text-foreground dark:text-foreground-dark uppercase tracking-wider mb-2.5">Upcoming Events Summary</Text>
            <View className="flex-row justify-between">
              <TouchableOpacity
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  router.push({ pathname: "/tenants", params: { status: "pending_move_in" } })
                }}
                className="flex-1 bg-success/5 border border-success/15 p-3 rounded-xl mr-2 items-center active:opacity-85"
              >
                <Text className="text-base font-black text-success">{upcomingEventsSummary.checkIns}</Text>
                <Text className="text-[8px] text-muted dark:text-muted-dark font-bold uppercase tracking-wider mt-0.5">Move-Ins Scheduled</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  router.push({ pathname: "/tenants", params: { status: "notice_period" } })
                }}
                className="flex-1 bg-purple-500/5 border border-purple-500/15 p-3 rounded-xl ml-2 items-center active:opacity-85"
              >
                <Text className="text-base font-black text-purple-600 dark:text-purple-400">{upcomingEventsSummary.checkOuts}</Text>
                <Text className="text-[8px] text-muted dark:text-muted-dark font-bold uppercase tracking-wider mt-0.5">Move-Outs Scheduled</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* High-priority Top Defaulters */}
        <View className="px-6 mb-4">
          <Text className="text-[10px] font-black text-foreground dark:text-foreground-dark uppercase tracking-widest mb-2">Top Defaulters</Text>
          
          {topDefaulters.length === 0 ? (
            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-2xl items-center justify-center">
              <Text className="text-xs text-muted dark:text-muted-dark font-semibold text-center">No outstanding defaults! Excellent. 💸</Text>
            </View>
          ) : (
            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-2xl gap-3">
              {topDefaulters.map((item, index) => (
                <TouchableOpacity 
                  key={`defaulter-${item.tenantId}`} 
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    router.push({ pathname: "/payments", params: { search: item.name } })
                  }}
                  className={`flex-row justify-between items-center py-2 ${
                    index === topDefaulters.length - 1 ? "" : "border-b border-border/10 dark:border-border-dark/10"
                  }`}
                >
                  <View className="flex-row items-center flex-1 pr-2">
                    <Text className="font-black text-xs text-muted dark:text-muted-dark mr-3">{index + 1}</Text>
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">{item.name}</Text>
                      <Text className="text-[9px] text-muted dark:text-muted-dark font-medium mt-0.5">
                        {item.daysOverdue > 0 
                          ? `Room ${item.roomNumber} • ${item.daysOverdue} day${item.daysOverdue > 1 ? "s" : ""} overdue` 
                          : `Room ${item.roomNumber} • Rent pending`}
                      </Text>
                    </View>
                  </View>
                  <Text className={`text-xs font-extrabold ${item.hasLate ? "text-destructive" : "text-amber-500"}`}>₹{item.totalAmount.toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

      </ScrollView>

      {/* Custom Range Selection Modal */}
      <Modal
        visible={customRangePickerVisible}
        transparent
        animationType="none"
        onRequestClose={() => setCustomRangePickerVisible(false)}
      >
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setCustomRangePickerVisible(false)}
          className="flex-1 bg-black/60 justify-center items-center p-6"
        >
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-5 shadow-2xl"
          >
            <Text className="text-base font-black text-foreground dark:text-foreground-dark mb-4">
              Select Custom Range
            </Text>
            
            <View className="gap-4">
              <ThemeDatePicker
                label="Start Date"
                value={customStartDate}
                onChange={(date) => setCustomStartDate(date)}
              />
              <ThemeDatePicker
                label="End Date"
                value={customEndDate}
                onChange={(date) => setCustomEndDate(date)}
              />
            </View>

            <View className="flex-row gap-3 mt-6">
              <TouchableOpacity
                onPress={() => setCustomRangePickerVisible(false)}
                className="flex-1 border border-border rounded-xl h-10 items-center justify-center active:scale-95"
              >
                <Text className="text-muted font-bold text-xs">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!customStartDate || !customEndDate) {
                    showToast("Error", "Please select both start and end dates.", "error")
                    return
                  }
                  if (new Date(customStartDate) > new Date(customEndDate)) {
                    showToast("Error", "Start date cannot be after end date.", "error")
                    return
                  }
                  setSelectedFilter("Custom Range")
                  setCustomRangePickerVisible(false)
                }}
                className="flex-1 bg-primary rounded-xl h-10 items-center justify-center active:scale-95"
              >
                <Text className="text-white font-black text-xs">Apply Range</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Payment Details Drawer Modal */}
      <Modal
        animationType="none"
        transparent={true}
        visible={paymentDetailModalVisible}
        onRequestClose={() => setPaymentDetailModalVisible(false)}
      >
        <View className="flex-1 justify-end">
          {/* Backdrop Overlay */}
          <TouchableOpacity 
            activeOpacity={1}
            onPress={() => setPaymentDetailModalVisible(false)}
            className="absolute inset-0 bg-black/60"
          />
          
          <View 
            className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[96%] border-t border-border dark:border-border-dark px-6 pt-6 flex-col" 
            style={{ paddingBottom: Platform.OS === "ios" ? Math.max(insets.bottom - 10, 8) : 8 }}
          >
            {selectedPayment && (
              <View className="flex-col max-h-full">
                {/* Header */}
                <View className="flex-row justify-between items-start mb-5">
                  <View className="flex-1 pr-2">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-xs font-extrabold text-muted uppercase tracking-wider">Transaction Record</Text>
                      {getPaymentStatusBadge(selectedPayment.status)}
                    </View>
                    <Text className="text-2xl font-black text-foreground dark:text-foreground-dark mt-1">
                      ₹{selectedPayment.total_amount.toLocaleString()}
                    </Text>
                  </View>
                  
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => setPaymentDetailModalVisible(false)}
                      className="h-10 w-10 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
                    >
                      <X size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Main Scroll Content */}
                <ScrollView 
                  showsVerticalScrollIndicator={false} 
                  contentContainerStyle={{ gap: 16, paddingBottom: 16 }} 
                  className="flex-shrink flex-grow-0 mb-4"
                >
                  {/* Timeline Tracker */}
                  <View className="bg-muted/10 border border-border dark:border-border-dark p-4 rounded-3xl">
                    <Text className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-3">Billing Status Timeline</Text>
                    
                    {/* Step 1 */}
                    <View className="flex-row items-start">
                      <View className="items-center mr-3">
                        <View className="h-5 w-5 bg-success rounded-full items-center justify-center z-10">
                          <Check size={10} color="#ffffff" strokeWidth={3} />
                        </View>
                        <View className="h-8 w-[2px] bg-muted/30" />
                      </View>
                      <View>
                        <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Invoice Generated</Text>
                        <Text className="text-[10px] text-muted font-medium mt-0.5">Due date {selectedPayment.due_date}</Text>
                      </View>
                    </View>

                    {/* Step 2 */}
                    <View className="flex-row items-start">
                      <View className="items-center mr-3">
                        <View className={`h-5 w-5 rounded-full items-center justify-center z-10 ${
                          selectedPayment.status === "submitted" || selectedPayment.status === "paid" || selectedPayment.status === "success" || selectedPayment.status === "completed"
                            ? "bg-success"
                            : "bg-muted/20"
                        }`}>
                          <Check 
                            size={10} 
                            color={
                              selectedPayment.status === "submitted" || selectedPayment.status === "paid" || selectedPayment.status === "success" || selectedPayment.status === "completed"
                                ? "#ffffff"
                                : "#9ca3af"
                            } 
                            strokeWidth={3} 
                          />
                        </View>
                        <View className="h-8 w-[2px] bg-muted/30" />
                      </View>
                      <View>
                        <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Payment Submitted</Text>
                        <Text className="text-[10px] text-muted font-medium mt-0.5">
                          {selectedPayment.status === "submitted" 
                            ? "Payment under review" 
                            : (selectedPayment.status === "paid" || selectedPayment.status === "success" || selectedPayment.status === "completed"
                              ? "Payment verified"
                              : "Awaiting resident submission")}
                        </Text>
                      </View>
                    </View>
 
                    {/* Step 3 */}
                    <View className="flex-row items-start">
                      <View className="items-center mr-3">
                        <View className={`h-5 w-5 rounded-full items-center justify-center z-10 ${
                          selectedPayment.status === "paid" || selectedPayment.status === "success" || selectedPayment.status === "completed"
                            ? "bg-success"
                            : "bg-muted/20"
                        }`}>
                          {selectedPayment.status === "paid" || selectedPayment.status === "success" || selectedPayment.status === "completed" ? (
                            <Check size={10} color="#ffffff" strokeWidth={3} />
                          ) : (
                            <ShieldCheck size={10} color="#9ca3af" />
                          )}
                        </View>
                      </View>
                      <View>
                        <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Audit & Verified</Text>
                        <Text className="text-[10px] text-muted font-medium mt-0.5">
                          {selectedPayment.status === "paid" || selectedPayment.status === "success" || selectedPayment.status === "completed"
                            ? `Approved at ${selectedPayment.verified_at ? new Date(selectedPayment.verified_at).toLocaleDateString("en-IN") : "date"}`
                            : "Awaiting owner verification"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Breakdown Split Box */}
                  <View className="bg-muted/10 border border-border dark:border-border-dark p-4 rounded-3xl gap-2.5">
                    <Text className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-1">Fee Breakdown</Text>
                    
                    <View className="flex-row justify-between items-center">
                      <Text className="text-xs text-muted font-medium">Base Rent</Text>
                      <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">₹{selectedPayment.rent_amount.toLocaleString()}</Text>
                    </View>

                    {(selectedPayment.extra_charges ?? 0) > 0 && (
                      <View className="flex-row justify-between items-center">
                        <Text className="text-xs text-destructive font-medium flex-row items-center">
                          <AlertTriangle size={10} color="#ef4444" /> Extra Charges
                        </Text>
                        <Text className="text-sm font-bold text-destructive">+ ₹{(selectedPayment.extra_charges ?? 0).toLocaleString()}</Text>
                      </View>
                    )}

                    <View className="border-t border-border dark:border-border-dark pt-2.5 flex-row justify-between items-center">
                      <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Total Rent Amount</Text>
                      <Text className="text-sm font-black text-foreground dark:text-foreground-dark">₹{selectedPayment.total_amount.toLocaleString()}</Text>
                    </View>
                  </View>

                  {/* Verification & Screenshot Proof Section */}
                  {selectedPayment.screenshot_path && (
                    <View className="bg-purple-500/5 border border-purple-500/10 p-4 rounded-3xl gap-3">
                      <Text className="text-[10px] font-extrabold uppercase tracking-widest text-purple-600 dark:text-purple-400">Payment Verification Proof</Text>
                      
                      {loadingImage ? (
                        <View className="h-44 bg-muted/20 rounded-2xl items-center justify-center">
                          <ActivityIndicator size="small" color="#8b5cf6" />
                        </View>
                      ) : signedScreenshotUrl ? (
                        <TouchableOpacity 
                          onPress={handleToggleFullscreenImage}
                          className="h-44 rounded-2xl overflow-hidden border border-purple-500/20 relative group bg-black"
                        >
                          <Image 
                            source={{ uri: signedScreenshotUrl }} 
                            className="w-full h-full object-cover opacity-90"
                          />
                          <View className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-active:opacity-100">
                            <Maximize2 size={20} color="#ffffff" />
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <View className="h-44 bg-muted/20 rounded-2xl items-center justify-center">
                          <Info size={20} color="#9ca3af" />
                          <Text className="text-xs text-muted mt-2">Could not retrieve verification media</Text>
                        </View>
                      )}

                      {/* Display UTR copy block */}
                      {selectedPayment.utr_number && (
                        <View className="mt-1 border-t border-purple-500/10 pt-3 gap-1">
                          <View className="flex-row justify-between items-center">
                            <Text className="text-[11px] font-bold text-muted">UTR / Transaction Reference</Text>
                            <TouchableOpacity 
                              onPress={() => {
                                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                                Clipboard.setString(selectedPayment.utr_number || "")
                                showToast("UTR Copied", "Transaction reference has been copied.", "success")
                              }}
                              className="bg-purple-500/10 px-2.5 py-1 rounded-lg flex-row items-center gap-1.5 active:scale-95"
                            >
                              <Text className="font-mono text-xs font-black text-purple-600 dark:text-purple-400">
                                {selectedPayment.utr_number}
                              </Text>
                              <Copy size={10} color={isDark ? "#a78bfa" : "#7c3aed"} />
                            </TouchableOpacity>
                          </View>
                          <Text className="text-[8px] text-muted text-right italic font-medium">Tap UTR code to copy</Text>
                        </View>
                      )}

                      {/* Display payment verification code */}
                      <View className="flex-row justify-between items-center mt-1 border-t border-purple-500/10 pt-3">
                        <Text className="text-[11px] font-bold text-muted">Verification Code (Txn Ref)</Text>
                        <Text className="font-mono text-xs font-black text-purple-600 dark:text-purple-400">
                          {selectedPayment.payment_code || "—"}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Rejection Notes Area */}
                  {rejectingMode && (
                    <View className="bg-destructive/5 border border-destructive/10 p-4 rounded-3xl gap-3">
                      <Text className="text-[10px] font-extrabold uppercase tracking-widest text-destructive">Rejection Feedback Notes</Text>
                      <TextInput
                        value={rejectNotes}
                        onChangeText={setRejectNotes}
                        placeholder="E.g. Screenshot blurry or UTR is incorrect..."
                        placeholderTextColor="#9ca3af"
                        multiline
                        numberOfLines={3}
                        className="border border-destructive/20 rounded-xl px-3 py-2 text-sm text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark min-h-[60px] text-left"
                      />
                      <View className="flex-row gap-2 justify-end">
                        <TouchableOpacity 
                          onPress={() => setRejectingMode(false)}
                          className="px-3 py-1.5 rounded-lg border border-border"
                        >
                          <Text className="text-xs font-bold text-muted">Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          onPress={() => handleRejectPayment(selectedPayment)}
                          className="px-3 py-1.5 rounded-lg bg-destructive"
                        >
                          <Text className="text-xs font-bold text-white">Confirm Rejection</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Basic Details List */}
                  <View className="gap-3 px-2 pt-1">
                    <View className="flex-row justify-between py-1.5 border-b border-border/20 dark:border-border-dark/20">
                      <Text className="text-xs text-muted font-bold">Occupant Name</Text>
                      <Text className="text-xs font-black text-foreground dark:text-foreground-dark">{selectedPayment.tenants_table?.name || "Occupant"}</Text>
                    </View>
                    
                    <View className="flex-row justify-between py-1.5 border-b border-border/20 dark:border-border-dark/20">
                      <Text className="text-xs text-muted font-bold">Room Reference</Text>
                      <Text className="text-xs font-black text-foreground dark:text-foreground-dark">Room {selectedPayment.tenants_table?.rooms_table?.room_number || "—"}</Text>
                    </View>

                    <View className="flex-row justify-between py-1.5 border-b border-border/20 dark:border-border-dark/20">
                      <Text className="text-xs text-muted font-bold">Billing Month</Text>
                      <Text className="text-xs font-black text-foreground dark:text-foreground-dark">
                        {new Date(2000, selectedPayment.month - 1).toLocaleString("en-US", { month: "long" })} {selectedPayment.year}
                      </Text>
                    </View>

                    {selectedPayment.payment_method && (
                      <View className="flex-row justify-between py-1.5 border-b border-border/20 dark:border-border-dark/20">
                        <Text className="text-xs text-muted font-bold">Payment Method</Text>
                        <Text className="text-xs font-black text-foreground dark:text-foreground-dark">{selectedPayment.payment_method}</Text>
                      </View>
                    )}
                  </View>
                </ScrollView>

                {/* Primary Actions Footer */}
                <View className="flex-row gap-3 border-t border-border/40 pt-4 flex-wrap pb-0">
                  {/* Delete Button */}
                  <TouchableOpacity
                    onPress={() => handleDeletePayment(selectedPayment.id)}
                    className="h-12 w-12 border border-destructive/20 bg-destructive/5 rounded-xl items-center justify-center active:scale-95"
                  >
                    <Trash2 size={18} color="#ef4444" />
                  </TouchableOpacity>

                  {/* WhatsApp Reminder Button */}
                  {(selectedPayment.status === "pending" || selectedPayment.status === "late") && (
                    <TouchableOpacity
                      onPress={() => handleWhatsAppReminder(selectedPayment)}
                      className="h-12 w-12 border border-success/20 bg-success/5 rounded-xl items-center justify-center active:scale-95"
                    >
                      <MessageCircle size={18} color="#10b981" />
                    </TouchableOpacity>
                  )}

                  {/* Submitted State Approval Verification Controls */}
                  {selectedPayment.status === "submitted" && !rejectingMode ? (
                    <>
                      <TouchableOpacity
                        onPress={() => setRejectingMode(true)}
                        className="flex-1 border border-destructive/20 bg-destructive/5 rounded-xl h-12 items-center justify-center active:scale-95"
                      >
                        <Text className="text-destructive font-black text-sm">Reject</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        onPress={() => handleApprovePayment(selectedPayment)}
                        className="flex-1 bg-success rounded-xl h-12 items-center justify-center active:scale-95"
                      >
                        <Text className="text-white font-black text-sm">Approve</Text>
                      </TouchableOpacity>
                    </>
                  ) : selectedPayment.status !== "paid" && selectedPayment.status !== "success" && selectedPayment.status !== "completed" ? (
                    <TouchableOpacity
                      onPress={() => handleMarkAsPaid(selectedPayment)}
                      className="flex-1 bg-success rounded-xl h-12 items-center justify-center active:scale-95 shadow-md shadow-success/20"
                    >
                      <Text className="text-white font-black text-sm">Mark as Paid</Text>
                    </TouchableOpacity>
                  ) : (
                    <View className="flex-1 bg-success/10 border border-success/30 rounded-xl h-12 flex-row items-center justify-center">
                      <Check size={16} color="#10b981" strokeWidth={3} className="mr-1.5" />
                      <Text className="text-success font-black text-sm">Rent Fully Settled</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
          {paymentDetailModalVisible && renderToast()}
        </View>
      </Modal>

      {/* Screenshot Fullscreen Zoom View Modal */}
      {imageFullScreen && signedScreenshotUrl && (
        <Modal
          animationType="none"
          transparent={true}
          visible={imageFullScreen}
          onRequestClose={handleToggleFullscreenImage}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={handleToggleFullscreenImage}
            className="flex-1 bg-black/95 items-center justify-center p-4"
          >
            <TouchableOpacity 
              activeOpacity={1}
              onPress={() => {}}
              style={[
                { width: "100%", maxWidth: "100%", maxHeight: "80%" },
                imageAspectRatio ? { aspectRatio: imageAspectRatio } : { height: "80%" }
              ]}
              className="relative items-center justify-center"
            >
              <Image 
                source={{ uri: signedScreenshotUrl }} 
                className="w-full h-full rounded-xl"
                resizeMode="contain"
              />
              <TouchableOpacity 
                onPress={handleToggleFullscreenImage}
                className="absolute top-4 right-4 h-10 w-10 bg-black/60 rounded-full items-center justify-center border border-white/20"
              >
                <X size={20} color="#ffffff" />
              </TouchableOpacity>

              {/* Bottom overlay with transaction details */}
              {detailsCollapsed ? (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setDetailsCollapsed(false)
                  }}
                  className="absolute bottom-4 right-4 h-12 w-12 bg-black/80 rounded-full items-center justify-center border border-white/20 shadow-2xl"
                >
                  <Eye size={20} color="#ffffff" />
                </TouchableOpacity>
              ) : (
                <View className="absolute bottom-4 left-4 right-4 gap-1">
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      setDetailsCollapsed(true)
                    }}
                    className="bg-black/85 border border-white/10 rounded-2xl p-4 gap-2.5 shadow-2xl"
                  >
                    {selectedPayment?.utr_number && (
                      <View className="flex-row justify-between items-center">
                        <Text className="text-[10px] font-extrabold text-white/50 uppercase tracking-wider">UTR Number</Text>
                        <Text className="font-mono text-xs font-black text-purple-400">
                          {selectedPayment.utr_number}
                        </Text>
                      </View>
                    )}
                    <View className="flex-row justify-between items-center border-t border-white/5 pt-2">
                      <Text className="text-[10px] font-extrabold text-white/50 uppercase tracking-wider">Verification Code</Text>
                      <Text className="font-mono text-xs font-black text-purple-400">
                        {selectedPayment?.payment_code || "—"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <Text className="text-[8px] text-white/40 text-right italic font-medium pr-2">
                    Tap details to hide
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Complaint Detail Modal Overlay */}
      <Modal
        visible={complaintDetailModalVisible}
        transparent={true}
        animationType="none"
        onRequestClose={() => setComplaintDetailModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <TouchableOpacity 
            activeOpacity={1}
            onPress={() => setComplaintDetailModalVisible(false)}
            className="absolute inset-0"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%", maxWidth: 448, marginLeft: "auto", marginRight: "auto" }}
          >
            <View className="bg-card dark:bg-card-dark border-t border-slate-200 dark:border-slate-800 rounded-t-[32px] p-6 shadow-2xl">
              {/* Header */}
              <View className="flex-row justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800/60">
                <View className="flex-row items-center gap-2">
                  <View className="h-6 w-6 bg-red-500/10 rounded-md flex items-center justify-center">
                    <Info size={14} color="#ef4444" />
                  </View>
                  <Text className="text-sm font-black text-slate-900 dark:text-white">Review Complaint</Text>
                </View>
                <TouchableOpacity 
                  className="h-8 w-8 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center"
                  style={{ opacity: 1 }}
                  onPress={() => setComplaintDetailModalVisible(false)}
                >
                  <X size={14} color={isDark ? "#cbd5e1" : "#475569"} />
                </TouchableOpacity>
              </View>

              {/* Message Details */}
              <ScrollView className="max-h-[160px] mb-5 bg-slate-50 dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-850 rounded-2xl">
                <Text className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-semibold text-left">
                  {selectedComplaint?.complaint_message}
                </Text>
              </ScrollView>

              {/* Status Selector */}
              <View className="mb-5">
                <Text className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mb-2.5">
                  Update Resolution Status
                </Text>
                <View className="flex-row bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-800 rounded-2xl">
                  {["Under Working", "Resolved", "Ignored"].map((st) => {
                    const active = updatedStatus === st
                    return (
                      <TouchableOpacity
                        key={st}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          setUpdatedStatus(st)
                        }}
                        style={[
                          active && {
                            backgroundColor: isDark ? "#1e293b" : "#ffffff",
                            borderColor: isDark ? "#334155" : "#e2e8f0",
                            shadowColor: isDark ? "#000000" : "#64748b",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.1,
                            shadowRadius: 2,
                            elevation: 2,
                          }
                        ]}
                        className="flex-1 py-2 rounded-xl items-center border border-transparent"
                      >
                        <Text 
                          className="text-[10px] font-black"
                          style={{
                            color: active 
                              ? (isDark ? "#ffffff" : "#0f172a") 
                              : (isDark ? "#64748b" : "#94a3b8")
                          }}
                        >
                          {st === "Under Working" ? "Working" : st}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              {/* Owner Response Input */}
              <View className="mb-6">
                <Text className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mb-2">
                  Owner Response / Action Reply
                </Text>
                <TextInput
                  placeholder="e.g. maintenance team scheduled for tomorrow morning..."
                  placeholderTextColor={isDark ? "#475569" : "#94a3b8"}
                  value={ownerResponseText}
                  onChangeText={setOwnerResponseText}
                  multiline
                  numberOfLines={3}
                  className="bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 min-h-[72px] font-semibold text-left"
                />
              </View>

              {/* Actions */}
              <View className="flex-row gap-2 mt-2">
                <TouchableOpacity 
                  className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 py-3.5 rounded-xl items-center"
                  onPress={() => setComplaintDetailModalVisible(false)}
                  disabled={isSavingDetails}
                >
                  <Text className="text-xs font-black text-slate-700 dark:text-slate-300">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  className="flex-1 bg-red-600 py-3.5 rounded-xl items-center flex-row justify-center gap-1.5"
                  onPress={handleSaveComplaintDetails}
                  disabled={isSavingDetails}
                >
                  {isSavingDetails ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Check size={14} color="#ffffff" strokeWidth={3} />
                      <Text className="text-xs font-black text-white">Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
          {complaintDetailModalVisible && renderToast()}
        </View>
      </Modal>

      {/* Confirm Delete Record Modal */}
      <ConfirmModal
        visible={deleteConfirmVisible}
        title="Delete Record"
        message="Are you sure you want to permanently delete this transaction ledger row? This action is irreversible."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={confirmDeletePayment}
        onCancel={() => {
          setDeleteConfirmVisible(false)
          setDeletingPaymentId(null)
        }}
        icon={<Trash2 size={24} color="#ef4444" />}
      />

      {/* Toast Notification Container */}
      {renderToast()}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 9999,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
  toastLight: {
    backgroundColor: "#ffffff",
    shadowColor: "#64748b",
    shadowOpacity: 0.1,
  },
  toastDark: {
    backgroundColor: "#0f172a",
    shadowColor: "#000000",
    shadowOpacity: 0.4,
  },
  toastIconContainer: {
    height: 28,
    width: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(100,116,139,0.08)"
  }
})
