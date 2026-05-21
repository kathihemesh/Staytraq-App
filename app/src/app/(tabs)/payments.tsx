import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { 
  View, 
  Text, 
  FlatList,
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  Modal, 
  TextInput, 
  RefreshControl,
  Image,
  Dimensions,
  Platform,
  Alert,
  Clipboard
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import { 
  Search, 
  Calendar, 
  User, 
  Clock, 
  Check, 
  X, 
  ShieldCheck, 
  CreditCard, 
  RefreshCw, 
  AlertTriangle, 
  Plus, 
  ChevronRight, 
  ArrowUpDown, 
  Maximize2, 
  ExternalLink,
  Copy,
  Info,
  Edit2,
  Trash2
} from "lucide-react-native"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"
import { LinearGradient } from "expo-linear-gradient"

// Match database schema accurately
type Payment = {
  id: number
  tenant_id: number
  owner_id: string
  month: number
  year: number
  rent_amount: number
  extra_charges: number | null
  total_amount: number
  due_date: string
  status: "paid" | "pending" | "late" | "submitted"
  paid_at: string | null
  reminder_sent: boolean | null
  created_at: string
  payment_token: string
  screenshot_path: string | null
  utr_number: string | null
  submitted_at: string | null
  verified_at: string | null
  verified_by_owner: boolean | null
  verification_notes: string | null
  payment_method: string | null
  tenants_table?: {
    name: string | null
    rooms_table?: {
      room_number: string
      rent_amount: number
    } | null
  } | null
}

type Occupant = {
  id: number
  name: string
  rooms_table?: {
    room_number: string
    rent_amount: number
  } | null
  extra_charges?: number | null
}

const { width } = Dimensions.get("window")
const CARD_WIDTH = width - 48

export default function PaymentsScreen() {
  const { user } = useAuth()
  const { isDark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [payments, setPayments] = useState<Payment[]>([])
  const [occupants, setOccupants] = useState<Occupant[]>([])
  
  // Filtering, Search, & Sorting
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date()
    const monthStr = d.toLocaleString("en-US", { month: "long" })
    const yearStr = d.getFullYear()
    return `${monthStr} ${yearStr}`
  })
  const [sortField, setSortField] = useState<"amount" | "dueDate">("dueDate")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  // Modals & Bottom Sheets state
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  
  const [formModalVisible, setFormModalVisible] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  
  const [monthPickerVisible, setMonthPickerVisible] = useState(false)
  const [imageFullScreen, setImageFullScreen] = useState(false)
  const [signedScreenshotUrl, setSignedScreenshotUrl] = useState<string | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const [rejectingMode, setRejectingMode] = useState(false)
  const [rejectNotes, setRejectNotes] = useState("")

  // Form Fields
  const [formTenantId, setFormTenantId] = useState("")
  const [formBaseRent, setFormBaseRent] = useState("")
  const [formExtraCharges, setFormExtraCharges] = useState("")
  const [formMonth, setFormMonth] = useState("")
  const [formYear, setFormYear] = useState("")
  const [formDueDate, setFormDueDate] = useState("")
  const [formStatus, setFormStatus] = useState<Payment["status"]>("pending")
  const [formPaymentMethod, setFormPaymentMethod] = useState("")
  const [formUtrNumber, setFormUtrNumber] = useState("")
  const [formPaymentDate, setFormPaymentDate] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  // Keyboard Scroll Registers
  const rentInput = useKeyboardAwareInput()
  const extraInput = useKeyboardAwareInput()
  const monthInput = useKeyboardAwareInput()
  const yearInput = useKeyboardAwareInput()
  const dateInput = useKeyboardAwareInput()
  const utrInput = useKeyboardAwareInput()
  const methodInput = useKeyboardAwareInput()
  const payDateInput = useKeyboardAwareInput()

  // Confetti/green flash feedback state
  const [markingPaidId, setMarkingPaidId] = useState<number | null>(null)
  const [activeCardIndex, setActiveCardIndex] = useState(0)

  // Carousel auto-slide properties
  const carouselRef = useRef<ScrollView>(null)

  // Generate 6 months list dynamically
  const filterMonths = useMemo(() => {
    const list: string[] = []
    const d = new Date()
    for (let i = 0; i < 6; i++) {
      list.push(`${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`)
      d.setMonth(d.getMonth() - 1)
    }
    return list
  }, [])

  const fetchPayments = useCallback(async (silent = false) => {
    if (!user?.id) return
    try {
      if (!silent) {
        if (payments.length === 0) setLoading(true)
        else setIsRefreshing(true)
      }

      // 1. Fetch payments with tenant details
      const { data: payData, error: payError } = await supabase
        .from("payments")
        .select("*, tenants_table(name, rooms_table(room_number, rent_amount))")
        .eq("owner_id", user.id)
        .order("due_date", { ascending: false })

      if (payError) throw payError
      setPayments((payData || []) as any)

      // 2. Fetch active occupants for selection
      const { data: tenantData, error: tenantError } = await supabase
        .from("tenants_table")
        .select("id, name, extra_charges, rooms_table(room_number, rent_amount)")
        .eq("owner_id", user.id)
        .eq("status", "active")
        .order("name", { ascending: true })

      if (tenantError) throw tenantError
      setOccupants((tenantData || []) as any)

    } catch (err) {
      console.error("Error fetching payments records:", err)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [user?.id, payments.length])

  useEffect(() => {
    void fetchPayments()
  }, [fetchPayments])

  // Realtime updates
  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`payments_ledger_realtime_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `owner_id=eq.${user.id}` },
        () => {
          void fetchPayments(true)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, fetchPayments])

  const onRefresh = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void fetchPayments()
  }, [fetchPayments])

  // Generate signed URL for payment proof screenshots
  const fetchScreenshotUrl = async (path: string | null) => {
    if (!path) return
    setLoadingImage(true)
    try {
      const { data, error } = await supabase.storage
        .from("payment_screenshots")
        .createSignedUrl(path, 3600)

      if (error) throw error
      setSignedScreenshotUrl(data.signedUrl)
    } catch (err) {
      console.error("Error generating signed screenshot URL:", err)
      setSignedScreenshotUrl(null)
    } finally {
      setLoadingImage(false)
    }
  }

  useEffect(() => {
    if (detailModalVisible && selectedPayment?.screenshot_path) {
      void fetchScreenshotUrl(selectedPayment.screenshot_path)
    } else {
      setSignedScreenshotUrl(null)
      setRejectingMode(false)
      setRejectNotes("")
    }
  }, [detailModalVisible, selectedPayment])

  // Double-tap or maximize trigger for screenshot fullscreen zoom
  const handleToggleFullscreenImage = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setImageFullScreen(!imageFullScreen)
  }

  // Complete Mark as Paid flow with immediate haptic response
  const handleMarkPaid = async (paymentId: number, name: string, roomNum: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    
    // Optimistic UI updates
    setMarkingPaidId(paymentId)
    setPayments((prev) =>
      prev.map((p) =>
        p.id === paymentId
          ? { ...p, status: "paid" as const, paid_at: new Date().toISOString() }
          : p
      )
    )
    if (selectedPayment?.id === paymentId) {
      setSelectedPayment((prev) =>
        prev ? { ...prev, status: "paid" as const, paid_at: new Date().toISOString() } : null
      )
    }

    // Green flash delay before updating DB
    setTimeout(async () => {
      try {
        const now = new Date().toISOString()
        const { error } = await (supabase as any)
          .from("payments")
          .update({
            status: "paid",
            paid_at: now,
            verified_at: now,
            verified_by_owner: true
          })
          .eq("id", paymentId)

        if (error) throw error

        // Insert to audit log
        await (supabase as any).from("payment_audit_log").insert({
          payment_id: paymentId,
          owner_id: user!.id,
          action: "proof_approved",
          old_status: "pending",
          new_status: "paid",
          notes: "Marked paid manually by owner"
        })

      } catch (err) {
        console.error("Failed manual verification updates:", err)
        Alert.alert("Server Error", "Could not synchronize payment status.")
        void fetchPayments(true)
      } finally {
        setMarkingPaidId(null)
        setDetailModalVisible(false)
      }
    }, 600)
  }

  // Replicate Web Approve Logic
  const handleApprovePayment = async (payment: Payment) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    const now = new Date().toISOString()

    // Optimistic Update
    setPayments((prev) =>
      prev.map((p) => (p.id === payment.id ? { ...p, status: "paid" as const, paid_at: now, verified_at: now, verified_by_owner: true } : p))
    )

    try {
      const { error } = await (supabase as any)
        .from("payments")
        .update({
          status: "paid",
          paid_at: now,
          verified_at: now,
          verified_by_owner: true
        })
        .eq("id", payment.id)

      if (error) throw error

      await (supabase as any).from("payment_audit_log").insert({
        payment_id: payment.id,
        owner_id: user!.id,
        action: "proof_approved",
        old_status: payment.status,
        new_status: "paid",
        notes: "Approved via Mobile Verification Panel"
      })

      setDetailModalVisible(false)
      void fetchPayments(true)
    } catch (err) {
      console.error("Approve payment error:", err)
      Alert.alert("Database Error", "Failed to approve payment record.")
      void fetchPayments(true)
    }
  }

  // Replicate Web Reject Logic
  const handleRejectPayment = async (payment: Payment) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    
    // Optimistic update (return to pending)
    setPayments((prev) =>
      prev.map((p) => (p.id === payment.id ? { ...p, status: "pending" as const, verification_notes: rejectNotes } : p))
    )

    try {
      const { error } = await (supabase as any)
        .from("payments")
        .update({
          status: "pending",
          verified_at: new Date().toISOString(),
          verification_notes: rejectNotes || null,
          screenshot_path: null, // Clear screenshot proof on rejection so tenant can re-upload
          utr_number: null      // Clear UTR code so tenant can submit new proof
        })
        .eq("id", payment.id)

      if (error) throw error

      await (supabase as any).from("payment_audit_log").insert({
        payment_id: payment.id,
        owner_id: user!.id,
        action: "proof_rejected",
        old_status: payment.status,
        new_status: "pending",
        notes: rejectNotes || "Rejected via Mobile Verification Panel"
      })

      setDetailModalVisible(false)
      void fetchPayments(true)
    } catch (err) {
      console.error("Reject payment error:", err)
      Alert.alert("Database Error", "Failed to reject payment record.")
      void fetchPayments(true)
    }
  }

  // Toggle sort field or direction
  const handleToggleSort = (field: "amount" | "dueDate") => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  // Copy payment link to clipboard
  const handleCopyPaymentLink = (token: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const url = `https://staytraq.vercel.app/pay/${token}` // Standard web tenant portal url
    Clipboard.setString(url)
    Alert.alert("Link Copied", "A dynamic tenant billing portal URL is copied to clipboard.")
  }

  // Custom picker selection pre-filling occupants details
  const handleSelectOccupant = (tenantId: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setFormTenantId(tenantId.toString())
    
    const tenant = occupants.find((o) => o.id === tenantId)
    if (tenant) {
      const baseRentVal = tenant.rooms_table?.rent_amount ?? 0
      const extraVal = tenant.extra_charges ?? 0
      setFormBaseRent(baseRentVal.toString())
      setFormExtraCharges(extraVal.toString())
    }
  }

  const openAddModal = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditingPayment(null)
    setFormTenantId("")
    setFormBaseRent("")
    setFormExtraCharges("0")
    
    const d = new Date()
    setFormMonth((d.getMonth() + 1).toString())
    setFormYear(d.getFullYear().toString())
    setFormDueDate(new Date(d.getFullYear(), d.getMonth(), 5).toISOString().split("T")[0])
    
    setFormStatus("pending")
    setFormPaymentMethod("UPI")
    setFormUtrNumber("")
    setFormPaymentDate("")
    setFormError(null)
    setFormModalVisible(true)
  }

  const openEditModal = (payment: Payment) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditingPayment(payment)
    setFormTenantId(payment.tenant_id.toString())
    setFormBaseRent(payment.rent_amount.toString())
    setFormExtraCharges((payment.extra_charges ?? 0).toString())
    setFormMonth(payment.month.toString())
    setFormYear(payment.year.toString())
    setFormDueDate(payment.due_date)
    setFormStatus(payment.status)
    setFormPaymentMethod(payment.payment_method || "")
    setFormUtrNumber(payment.utr_number || "")
    setFormPaymentDate(payment.paid_at ? payment.paid_at.split("T")[0] : "")
    setFormError(null)
    
    setDetailModalVisible(false)
    setFormModalVisible(true)
  }

  const handleSavePayment = async () => {
    if (!user?.id) return

    if (!formTenantId) {
      setFormError("Occupant assignment is required.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    if (!formBaseRent.trim() || isNaN(Number(formBaseRent))) {
      setFormError("Base rent amount must be a valid number.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      
      const rentAmt = parseFloat(formBaseRent)
      const extraChargesAmt = parseFloat(formExtraCharges) || 0
      const totalAmount = rentAmt + extraChargesAmt

      const payload = {
        tenant_id: parseInt(formTenantId, 10),
        rent_amount: rentAmt,
        extra_charges: extraChargesAmt,
        total_amount: totalAmount,
        month: parseInt(formMonth, 10),
        year: parseInt(formYear, 10),
        due_date: formDueDate,
        status: formStatus,
        payment_method: formPaymentMethod.trim() || null,
        utr_number: formUtrNumber.trim() || null,
        paid_at: formStatus === "paid" ? (formPaymentDate ? `${formPaymentDate}T12:00:00Z` : new Date().toISOString()) : null,
        owner_id: user.id
      }

      if (editingPayment) {
        const { error } = await (supabase as any)
          .from("payments")
          .update(payload)
          .eq("id", editingPayment.id)

        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from("payments")
          .insert(payload)

        if (error) throw error
      }

      setFormModalVisible(false)
      void fetchPayments(true)
    } catch (err) {
      console.error("Save payment error:", err)
      setFormError("Database operation failed. Make sure due date formats match YYYY-MM-DD.")
    }
  }

  const handleDeletePayment = async (paymentId: number) => {
    Alert.alert(
      "Confirm Deletion",
      "Are you sure you want to permanently delete this billing ledger record?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
              const { error } = await supabase
                .from("payments")
                .delete()
                .eq("id", paymentId)

              if (error) throw error
              setDetailModalVisible(false)
              void fetchPayments(true)
            } catch (err) {
              console.error("Error deleting payment record:", err)
              Alert.alert("Database Error", "Failed to delete the selected billing row.")
            }
          }
        }
      ]
    )
  }

  // Filter & Sort Logic matching usePaymentFilters hook
  const filteredPayments = useMemo(() => {
    return payments
      .filter((p) => {
        // 1. Month-Year Filtering
        const monthName = new Date(2000, p.month - 1).toLocaleString("en-US", { month: "long" })
        const matchesMonth = `${monthName} ${p.year}` === selectedMonth

        // 2. Search query matching
        const tenantName = p.tenants_table?.name || ""
        const roomNum = p.tenants_table?.rooms_table?.room_number || ""
        const matchesSearch =
          tenantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          roomNum.toLowerCase().includes(searchQuery.toLowerCase())

        // 3. Status filter matching
        const matchesStatus = statusFilter === "all" || p.status === statusFilter

        return matchesMonth && matchesSearch && matchesStatus
      })
      .sort((a, b) => {
        let comparison = 0
        if (sortField === "amount") {
          comparison = a.total_amount - b.total_amount
        } else {
          comparison = new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        }
        return sortDirection === "asc" ? comparison : -comparison
      })
  }, [payments, selectedMonth, searchQuery, statusFilter, sortField, sortDirection])

  // Totals calculations matching web app
  const currentMonthPayments = useMemo(() => {
    return payments.filter((p) => {
      const monthName = new Date(2000, p.month - 1).toLocaleString("en-US", { month: "long" })
      return `${monthName} ${p.year}` === selectedMonth
    })
  }, [payments, selectedMonth])

  const totalCollected = useMemo(() => {
    return currentMonthPayments
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.total_amount, 0)
  }, [currentMonthPayments])

  const totalPending = useMemo(() => {
    return currentMonthPayments
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + p.total_amount, 0)
  }, [currentMonthPayments])

  const totalLate = useMemo(() => {
    return currentMonthPayments
      .filter((p) => p.status === "late")
      .reduce((sum, p) => sum + p.total_amount, 0)
  }, [currentMonthPayments])

  const totalSubmitted = useMemo(() => {
    return currentMonthPayments
      .filter((p) => p.status === "submitted")
      .reduce((sum, p) => sum + p.total_amount, 0)
  }, [currentMonthPayments])

  const carouselData: {
    title: string
    amount: number
    text: string
    border: string
    bg: string[]
    icon: React.ComponentType<{ size?: number; color?: string }>
    colors: readonly [string, string]
  }[] = [
    {
      title: "Collected",
      amount: totalCollected,
      text: "text-emerald-700 dark:text-emerald-400",
      border: "border-emerald-300 dark:border-emerald-500/40",
      bg: ["bg-emerald-50 dark:bg-emerald-500/10"],
      icon: CreditCard,
      colors: isDark ? ["#064e3b", "#022c22"] as const : ["#ecfdf5", "#d1fae5"] as const
    },
    {
      title: "Pending",
      amount: totalPending,
      text: "text-amber-700 dark:text-amber-400",
      border: "border-amber-300 dark:border-amber-500/40",
      bg: ["bg-amber-50 dark:bg-amber-500/10"],
      icon: Clock,
      colors: isDark ? ["#78350f", "#451a03"] as const : ["#fffbeb", "#fef3c7"] as const
    },
    {
      title: "Late Dues",
      amount: totalLate,
      text: "text-red-700 dark:text-red-400",
      border: "border-red-300 dark:border-red-500/40",
      bg: ["bg-red-50 dark:bg-red-500/10"],
      icon: AlertTriangle,
      colors: isDark ? ["#7f1d1d", "#450a0a"] as const : ["#fef2f2", "#fee2e2"] as const
    },
    {
      title: "Under Review",
      amount: totalSubmitted,
      text: "text-purple-700 dark:text-purple-400",
      border: "border-purple-300 dark:border-purple-500/40",
      bg: ["bg-purple-50 dark:bg-purple-500/10"],
      icon: ShieldCheck,
      colors: isDark ? ["#581c87", "#3b0764"] as const : ["#faf5ff", "#f3e8ff"] as const
    }
  ]

  const handleCarouselScroll = (e: any) => {
    const contentOffsetX = e.nativeEvent.contentOffset.x
    const index = Math.round(contentOffsetX / CARD_WIDTH)
    if (index !== activeCardIndex && index >= 0 && index < 4) {
      setActiveCardIndex(index)
    }
  }

  const openDetailSheet = (payment: Payment) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSelectedPayment(payment)
    setDetailModalVisible(true)
  }

  if (loading && payments.length === 0) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark items-center justify-center">
        <ActivityIndicator size="large" color={isDark ? "#0091ff" : "#0071df"} />
        <Text className="text-sm text-muted dark:text-muted-dark mt-3">Fetching transaction ledger...</Text>
      </View>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark" edges={["top"]}>
      {/* Dynamic Header */}
      <View className="px-6 pt-4 pb-3 flex-row justify-between items-center">
        <View>
          <View className="flex-row items-center gap-2">
            <Text className="text-2xl font-black text-foreground dark:text-foreground-dark tracking-tight">
              Payments
            </Text>
            <TouchableOpacity 
              onPress={() => setMonthPickerVisible(true)} 
              className="bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md"
            >
              <Text className="text-[10px] font-black text-primary uppercase">
                {selectedMonth}
              </Text>
            </TouchableOpacity>
          </View>
          <Text className="text-xs text-muted dark:text-muted-dark font-medium mt-1">
            Rental billing & verification ledger
          </Text>
        </View>
        
        <View className="flex-row gap-2">
          <TouchableOpacity 
            onPress={openAddModal}
            className="h-10 w-10 border border-primary/20 rounded-xl items-center justify-center bg-primary"
          >
            <Plus size={18} color="#ffffff" strokeWidth={3} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={onRefresh}
            className="h-10 w-10 border border-border dark:border-border-dark rounded-xl items-center justify-center bg-card dark:bg-card-dark"
          >
            <RefreshCw size={16} color={isDark ? "#0091ff" : "#0071df"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Metric Snap Carousel */}
      <View className="mb-4">
        <ScrollView
          ref={carouselRef}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH}
          snapToAlignment="center"
          onScroll={handleCarouselScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: 24 }}
        >
          {carouselData.map((card, i) => {
            const Icon = card.icon
            return (
              <View 
                key={card.title} 
                style={{ width: CARD_WIDTH }} 
                className="pr-4 py-1"
              >
                <LinearGradient
                  colors={card.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  className={`flex-row items-center gap-4 rounded-3xl border ${card.border} px-5 py-4 h-20 shadow-sm`}
                >
                  <View className="h-10 w-10 rounded-full bg-white/20 items-center justify-center">
                    <Icon size={18} color="#ffffff" />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-[10px] font-extrabold uppercase tracking-widest ${card.text} opacity-80`}>
                      {card.title}
                    </Text>
                    <Text className="text-xl font-black text-foreground dark:text-foreground-dark tracking-tight mt-0.5">
                      ₹{card.amount.toLocaleString()}
                    </Text>
                  </View>
                </LinearGradient>
              </View>
            )
          })}
        </ScrollView>
        {/* Pagination Dots */}
        <View className="flex-row justify-center gap-1.5 mt-2">
          {carouselData.map((_, i) => (
            <View
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeCardIndex ? "w-5 bg-primary" : "w-1.5 bg-muted/40"
              }`}
            />
          ))}
        </View>
      </View>

      {/* Filters & Search controls */}
      <View className="px-6 mb-3 gap-3">
        {/* Search */}
        <View className="flex-row items-center border border-border dark:border-border-dark bg-card dark:bg-card-dark rounded-2xl px-4 py-2 shadow-sm">
          <View className="mr-3">
            <Search size={16} color="#9ca3af" />
          </View>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search tenants or rooms..."
            placeholderTextColor="#9ca3af"
            className="flex-1 text-base text-foreground dark:text-foreground-dark h-9"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>

        {/* Row 2: Status & Sort */}
        <View className="flex-row justify-between items-center">
          {/* Status Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-row mr-4 flex-1"
            contentContainerStyle={{ alignItems: "center" }}
          >
            {["all", "paid", "pending", "late", "submitted"].map((status) => {
              let badgeStyle = "bg-card dark:bg-card-dark border-border dark:border-border-dark text-muted"
              if (statusFilter === status) {
                if (status === "all") badgeStyle = "bg-primary border-primary text-white"
                else if (status === "paid") badgeStyle = "bg-success border-success text-white"
                else if (status === "pending") badgeStyle = "bg-warning border-warning text-white"
                else if (status === "late") badgeStyle = "bg-destructive border-destructive text-white"
                else if (status === "submitted") badgeStyle = "bg-purple-500 border-purple-500 text-white"
              }
              return (
                <TouchableOpacity
                  key={`${status}-${statusFilter === status}`}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setStatusFilter(status)
                  }}
                  className={`px-3 py-1 border rounded-full mr-1.5 capitalize ${badgeStyle}`}
                >
                  <Text className={`text-[11px] font-bold ${statusFilter === status ? "text-white" : "text-muted"}`}>
                    {status}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {/* Sort Button */}
          <TouchableOpacity
            onPress={() => handleToggleSort(sortField === "amount" ? "dueDate" : "amount")}
            className="flex-row items-center border border-border dark:border-border-dark bg-card dark:bg-card-dark px-3 py-1.5 rounded-full shadow-sm"
          >
            <Text className="text-[11px] font-bold text-muted mr-1.5">
              {sortField === "amount" ? "Amount" : "Due Date"}
            </Text>
            <ArrowUpDown size={12} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Ledger Records */}
      {filteredPayments.length === 0 ? (
        <View className="flex-1 items-center justify-center px-12">
          <CreditCard size={48} color="#9ca3af" />
          <Text className="text-sm font-semibold text-muted dark:text-muted-dark mt-4 text-center">
            No transaction records found matching active criteria
          </Text>
        </View>
      ) : (
        <View className="flex-1 px-6">
          <FlatList
            data={filteredPayments}
            keyExtractor={(item) => String(item.id)}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={isDark ? "#0091ff" : "#0071df"} />
            }
            renderItem={({ item }) => {
              const isPaid = item.status === "paid"
              const isSubmitted = item.status === "submitted"
              const isLate = item.status === "late"
              const isMarkingPaid = markingPaidId === item.id

              let textBadgeColor = "text-warning bg-warning/10"
              let accentColor = "bg-warning"
              let textAmountColor = "text-warning"
              
              if (isPaid) {
                textBadgeColor = "text-success bg-success/10"
                accentColor = "bg-success"
                textAmountColor = "text-success"
              } else if (isLate) {
                textBadgeColor = "text-destructive bg-destructive/10"
                accentColor = "bg-destructive"
                textAmountColor = "text-destructive"
              } else if (isSubmitted) {
                textBadgeColor = "text-purple-500 bg-purple-500/10"
                accentColor = "bg-purple-500"
                textAmountColor = "text-purple-500"
              }

              const formattedDue = new Date(item.due_date).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short"
              })

              return (
                <TouchableOpacity
                  onPress={() => openDetailSheet(item)}
                  className={`bg-card dark:bg-card-dark border p-4 rounded-3xl mb-3 shadow-sm flex-row items-center justify-between overflow-hidden relative ${
                    isMarkingPaid ? "bg-success/15 border-success" : "border-border dark:border-border-dark"
                  }`}
                >
                  {/* Web accent color stripe */}
                  <View className={`absolute left-0 top-0 bottom-0 w-[4px] ${accentColor}`} />
                  
                  <View className="flex-row items-center flex-1 pr-3 pl-1">
                    {/* Mark paid checkbox */}
                    <TouchableOpacity
                      onPress={() => handleMarkPaid(item.id, item.tenants_table?.name || "", item.tenants_table?.rooms_table?.room_number || "")}
                      disabled={isPaid || isMarkingPaid}
                      className={`h-7 w-7 rounded-full border items-center justify-center mr-3.5 ${
                        isPaid 
                          ? "bg-success/10 border-success/30" 
                          : "border-border dark:border-border-dark bg-background dark:bg-background-dark active:scale-95"
                      }`}
                    >
                      {isPaid && <Check size={14} color="#10b981" strokeWidth={3} />}
                    </TouchableOpacity>

                    {/* Content text */}
                    <View className="flex-1">
                      <View className="flex-row items-center flex-wrap gap-1.5">
                        <Text className="text-base font-bold text-foreground dark:text-foreground-dark mr-1" numberOfLines={1}>
                          {item.tenants_table?.name || "Occupant"}
                        </Text>
                        <View className={`px-1.5 py-0.5 rounded ${textBadgeColor}`}>
                          <Text className="text-[8px] font-black uppercase">
                            {item.status}
                          </Text>
                        </View>
                      </View>
                      <View className="flex-row items-center mt-1 gap-2.5">
                        <Text className="text-xs text-muted font-bold">
                          Room {item.tenants_table?.rooms_table?.room_number || "—"}
                        </Text>
                        <Text className="text-xs text-muted font-medium">
                          Due {formattedDue}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Amount right block */}
                  <View className="items-end">
                    <Text className={`text-base font-extrabold ${textAmountColor}`}>
                      ₹{item.total_amount.toLocaleString()}
                    </Text>
                    <View className="flex-row items-center mt-1">
                      <Text className="text-[9px] font-semibold text-muted">
                        {item.payment_method || "Pending"}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            }}
          />
        </View>
      )}

      {/* Custom Bottom-Sheet Month Picker */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={monthPickerVisible}
        onRequestClose={() => setMonthPickerVisible(false)}
      >
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setMonthPickerVisible(false)}
          className="flex-1 bg-black/50 justify-end"
        >
          <View className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[50%] border-t border-border dark:border-border-dark p-6">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-base font-black text-foreground dark:text-foreground-dark">Select Billing Month</Text>
              <TouchableOpacity onPress={() => setMonthPickerVisible(false)}>
                <X size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {filterMonths.map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setSelectedMonth(m)
                    setMonthPickerVisible(false)
                  }}
                  className={`py-3.5 border-b border-border/40 dark:border-border-dark/40 flex-row justify-between items-center ${
                    selectedMonth === m ? "bg-primary/5 px-2.5 rounded-xl" : ""
                  }`}
                >
                  <Text className={`text-sm font-bold ${selectedMonth === m ? "text-primary" : "text-foreground dark:text-foreground-dark"}`}>
                    {m}
                  </Text>
                  {selectedMonth === m && <Check size={16} color={isDark ? "#0091ff" : "#0071df"} strokeWidth={3} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Drawer: Replicated Detail Sheet */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={detailModalVisible}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[88%] border-t border-border dark:border-border-dark p-6">
            {selectedPayment && (
              <View className="gap-5">
                {/* Header */}
                <View className="flex-row justify-between items-start">
                  <View>
                    <View className="flex-row items-center gap-2">
                      <Text className="text-xs font-extrabold text-muted uppercase tracking-wider">Transaction Record</Text>
                      <View className={`px-2 py-0.5 rounded capitalize ${
                        selectedPayment.status === "paid" 
                          ? "bg-success/10 text-success" 
                          : selectedPayment.status === "late" 
                            ? "bg-destructive/10 text-destructive" 
                            : selectedPayment.status === "submitted"
                              ? "bg-purple-500/10 text-purple-500"
                              : "bg-warning/10 text-warning"
                      }`}>
                        <Text className="text-[9px] font-black uppercase">{selectedPayment.status}</Text>
                      </View>
                    </View>
                    <Text className="text-2xl font-black text-foreground dark:text-foreground-dark mt-1">
                      ₹{selectedPayment.total_amount.toLocaleString()}
                    </Text>
                  </View>
                  
                  <View className="flex-row gap-2">
                    <TouchableOpacity 
                      onPress={() => openEditModal(selectedPayment)}
                      className="h-8 w-8 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
                    >
                      <Edit2 size={14} color="#9ca3af" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      onPress={() => setDetailModalVisible(false)}
                      className="h-8 w-8 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
                    >
                      <X size={14} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Main Scroll Content */}
                <ScrollView 
                  showsVerticalScrollIndicator={false} 
                  contentContainerStyle={{ gap: 16 }} 
                  className="max-h-[65%]"
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
                        <View className={`h-8 w-[2px] ${selectedPayment.status === "paid" ? "bg-success" : "bg-muted/30"}`} />
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
                          selectedPayment.status === "paid" ? "bg-success" : "bg-muted/20"
                        }`}>
                          {selectedPayment.status === "paid" ? (
                            <Check size={10} color="#ffffff" strokeWidth={3} />
                          ) : (
                            <Clock size={10} color="#9ca3af" />
                          )}
                        </View>
                        <View className={`h-8 w-[2px] ${selectedPayment.verified_by_owner ? "bg-success" : "bg-muted/30"}`} />
                      </View>
                      <View>
                        <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Payment Settled</Text>
                        <Text className="text-[10px] text-muted font-medium mt-0.5">
                          {selectedPayment.paid_at 
                            ? `Received ${new Date(selectedPayment.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` 
                            : "Awaiting settlement"}
                        </Text>
                      </View>
                    </View>

                    {/* Step 3 */}
                    <View className="flex-row items-start">
                      <View className="items-center mr-3">
                        <View className={`h-5 w-5 rounded-full items-center justify-center z-10 ${
                          selectedPayment.verified_by_owner ? "bg-success" : "bg-muted/20"
                        }`}>
                          <ShieldCheck size={10} color={selectedPayment.verified_by_owner ? "#ffffff" : "#9ca3af"} />
                        </View>
                      </View>
                      <View>
                        <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Audit & Verified</Text>
                        <Text className="text-[10px] text-muted font-medium mt-0.5">
                          {selectedPayment.verified_by_owner ? "Ledger record verified" : "Awaiting verification"}
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

                      {selectedPayment.utr_number && (
                        <View className="flex-row justify-between items-center mt-1 border-t border-purple-500/10 pt-3">
                          <Text className="text-[11px] font-bold text-muted">UTR / Transaction Code</Text>
                          <Text className="font-mono text-xs font-black text-purple-600 dark:text-purple-400">{selectedPayment.utr_number}</Text>
                        </View>
                      )}
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
                        className="border border-destructive/20 rounded-xl px-3 py-2 text-sm text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark min-h-[60px]"
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
                      <Text className="text-xs text-muted font-bold">Billing month</Text>
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

                    {selectedPayment.verification_notes && (
                      <View className="py-1.5">
                        <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Rejection Feedback Notes</Text>
                        <Text className="text-xs text-foreground dark:text-foreground-dark font-medium leading-4 bg-muted/10 p-3.5 rounded-xl border border-border dark:border-border-dark">
                          {selectedPayment.verification_notes}
                        </Text>
                      </View>
                    )}
                  </View>
                </ScrollView>

                {/* Primary Actions Drawer Footer */}
                <View className="flex-row gap-3 pb-6 border-t border-border/40 pt-4 flex-wrap">
                  {/* Delete Button */}
                  <TouchableOpacity
                    onPress={() => handleDeletePayment(selectedPayment.id)}
                    className="h-12 w-12 border border-destructive/20 bg-destructive/5 rounded-xl items-center justify-center active:scale-95"
                  >
                    <Trash2 size={18} color="#ef4444" />
                  </TouchableOpacity>

                  {/* Copy Portal Link */}
                  {selectedPayment.payment_token && (
                    <TouchableOpacity
                      onPress={() => handleCopyPaymentLink(selectedPayment.payment_token)}
                      className="h-12 w-12 border border-primary/20 bg-primary/5 rounded-xl items-center justify-center active:scale-95"
                    >
                      <Copy size={18} color={isDark ? "#0091ff" : "#0071df"} />
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
                  ) : selectedPayment.status !== "paid" ? (
                    <TouchableOpacity
                      onPress={() => handleMarkPaid(selectedPayment.id, selectedPayment.tenants_table?.name || "", selectedPayment.tenants_table?.rooms_table?.room_number || "")}
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
        </View>
      </Modal>

      {/* Screenshot Fullscreen Zoom View Modal */}
      {imageFullScreen && signedScreenshotUrl && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={imageFullScreen}
          onRequestClose={handleToggleFullscreenImage}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={handleToggleFullscreenImage}
            className="flex-1 bg-black/95 items-center justify-center p-4"
          >
            <View className="relative w-full h-[80%] items-center justify-center">
              <Image 
                source={{ uri: signedScreenshotUrl }} 
                className="w-full h-full object-contain rounded-xl"
              />
              <TouchableOpacity 
                onPress={handleToggleFullscreenImage}
                className="absolute top-4 right-4 h-10 w-10 bg-black/60 rounded-full items-center justify-center border border-white/20"
              >
                <X size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Modal 3: Add / Edit Payment Record Form Sheet */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={formModalVisible}
        onRequestClose={() => setFormModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[88%] border-t border-border dark:border-border-dark p-6">
            {/* Form Header */}
            <View className="flex-row justify-between items-center mb-5">
              <View>
                <Text className="text-xl font-black text-foreground dark:text-foreground-dark">
                  {editingPayment ? "Edit Billing Record" : "Add Payment Record"}
                </Text>
                <Text className="text-xs text-muted mt-0.5 font-semibold">Configure payment particulars</Text>
              </View>
              <TouchableOpacity
                onPress={() => setFormModalVisible(false)}
                className="h-8 w-8 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
              >
                <X size={16} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {formError && (
              <View className="bg-destructive/10 border border-destructive/20 p-3 rounded-xl mb-4">
                <Text className="text-destructive text-sm font-medium">{formError}</Text>
              </View>
            )}

            <KeyboardAwareScrollView 
              showsVerticalScrollIndicator={false} 
              contentContainerStyle={{ gap: 16, paddingBottom: 36 }} 
              className="mb-6"
            >
              {/* Select Occupant */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Assign Occupant</Text>
                {occupants.length === 0 ? (
                  <Text className="text-xs text-destructive font-semibold">No active tenants found. Add an occupant profile first!</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
                    {occupants.map((occ) => (
                      <TouchableOpacity
                        key={occ.id}
                        onPress={() => handleSelectOccupant(occ.id)}
                        className={`px-4 py-2.5 rounded-xl mr-2 border ${
                          formTenantId === occ.id.toString()
                            ? "bg-primary/10 border-primary"
                            : "bg-background dark:bg-background-dark border-border dark:border-border-dark"
                        }`}
                      >
                        <Text className={`text-xs font-extrabold ${formTenantId === occ.id.toString() ? "text-primary" : "text-muted"}`}>
                          {occ.name} (Room {occ.rooms_table?.room_number || "—"})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* Grid: Rent & Extra Charges */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Base Rent Amount (₹)</Text>
                  <TextInput
                    ref={rentInput.ref}
                    onFocus={rentInput.onFocus}
                    value={formBaseRent}
                    onChangeText={setFormBaseRent}
                    keyboardType="numeric"
                    placeholder="e.g. 8000"
                    placeholderTextColor="#9ca3af"
                    className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark h-11"
                  />
                </View>

                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Extra Charges (₹)</Text>
                  <TextInput
                    ref={extraInput.ref}
                    onFocus={extraInput.onFocus}
                    value={formExtraCharges}
                    onChangeText={setFormExtraCharges}
                    keyboardType="numeric"
                    placeholder="e.g. 500"
                    placeholderTextColor="#9ca3af"
                    className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark h-11"
                  />
                </View>
              </View>

              {/* Grid: Billing month & year */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Billing Month (1-12)</Text>
                  <TextInput
                    ref={monthInput.ref}
                    onFocus={monthInput.onFocus}
                    value={formMonth}
                    onChangeText={setFormMonth}
                    keyboardType="numeric"
                    placeholder="5"
                    placeholderTextColor="#9ca3af"
                    className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark h-11"
                  />
                </View>

                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Billing Year (YYYY)</Text>
                  <TextInput
                    ref={yearInput.ref}
                    onFocus={yearInput.onFocus}
                    value={formYear}
                    onChangeText={setFormYear}
                    keyboardType="numeric"
                    placeholder="2026"
                    placeholderTextColor="#9ca3af"
                    className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark h-11"
                  />
                </View>
              </View>

              {/* Grid: Due Date */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Rent Due Date</Text>
                <TextInput
                  ref={dateInput.ref}
                  onFocus={dateInput.onFocus}
                  value={formDueDate}
                  onChangeText={setFormDueDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark h-11"
                />
              </View>

              {/* Payment Status Picker */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Payment Status</Text>
                <View className="flex-row bg-background dark:bg-background-dark p-1 rounded-xl border border-border/50 dark:border-border-dark/50 flex-wrap">
                  {["pending", "paid", "late", "submitted"].map((st) => (
                    <TouchableOpacity
                      key={st}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        setFormStatus(st as Payment["status"])
                      }}
                      className={`flex-1 min-w-[70px] py-2 rounded-lg items-center justify-center ${
                        formStatus === st
                          ? "bg-primary"
                          : "bg-transparent"
                      }`}
                    >
                      <Text className={`text-[11px] font-bold capitalize ${
                        formStatus === st ? "text-white" : "text-muted"
                      }`}>
                        {st}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Conditional parameters when paid or submitted */}
              {(formStatus === "paid" || formStatus === "submitted") && (
                <View className="gap-4 border-t border-border dark:border-border-dark pt-4">
                  {/* UTR reference */}
                  <View>
                    <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">UTR Transaction reference ID</Text>
                    <TextInput
                      ref={utrInput.ref}
                      onFocus={utrInput.onFocus}
                      value={formUtrNumber}
                      onChangeText={setFormUtrNumber}
                      placeholder="e.g. UTR123456789"
                      placeholderTextColor="#9ca3af"
                      className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark h-11"
                    />
                  </View>

                  {/* Payment Method */}
                  <View>
                    <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Payment Channel Method</Text>
                    <TextInput
                      ref={methodInput.ref}
                      onFocus={methodInput.onFocus}
                      value={formPaymentMethod}
                      onChangeText={setFormPaymentMethod}
                      placeholder="e.g. UPI, Cash, Bank Transfer"
                      placeholderTextColor="#9ca3af"
                      className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark h-11"
                    />
                  </View>

                  {/* Paid Date */}
                  {formStatus === "paid" && (
                    <View>
                      <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Payment Date</Text>
                      <TextInput
                        ref={payDateInput.ref}
                        onFocus={payDateInput.onFocus}
                        value={formPaymentDate}
                        onChangeText={setFormPaymentDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#9ca3af"
                        className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark h-11"
                      />
                    </View>
                  )}
                </View>
              )}
            </KeyboardAwareScrollView>

            {/* Save Buttons */}
            <View className="flex-row gap-3 pb-6 border-t border-border/40 pt-4">
              <TouchableOpacity
                onPress={() => setFormModalVisible(false)}
                className="flex-1 border border-border rounded-xl h-12 items-center justify-center active:scale-95"
              >
                <Text className="text-muted font-bold text-sm">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={handleSavePayment}
                className="flex-1 bg-primary rounded-xl h-12 items-center justify-center active:scale-95 shadow-md shadow-primary/20"
              >
                <Text className="text-white font-bold text-sm">Save Transaction</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
