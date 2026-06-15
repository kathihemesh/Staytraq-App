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
  Clipboard,
  Animated,
  StyleSheet,
  Share,
  Linking,
  useWindowDimensions,
  KeyboardAvoidingView
} from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
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
  Trash2,
  MessageSquare,
  Eye
} from "lucide-react-native"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"
import { KeyboardAwareScrollView, useKeyboardAwareInput, useKeyboardHeight } from "@/components/ui/keyboard-aware-scroll-view"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Path } from "react-native-svg"
import ThemeDatePicker from "@/components/ui/theme-date-picker"

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
  verified_by_owner?: boolean | null
  verification_notes: string | null
  payment_method: string | null
  payment_code: string | null
  tenants_table?: {
    name: string | null
    mobile_number: string | null
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

const WhatsAppIcon = ({ size = 20, color = "#25D366" }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.455L0 24zm6.59-4.846c1.66.986 3.298 1.448 5.355 1.449 5.483 0 9.944-4.461 9.947-9.948.002-2.656-1.03-5.153-2.906-7.03-1.876-1.874-4.373-2.907-7.028-2.907-5.488 0-9.95 4.462-9.953 9.95-.001 2.01.52 3.568 1.485 5.105L1.87 20.352l4.777-1.198zM17.472 14.382c-.3-.149-1.777-.876-2.047-.975-.27-.099-.467-.149-.662.149-.195.3-.755.95-.925 1.149-.17.199-.34.225-.64.075-.3-.149-1.266-.467-2.41-1.487-.89-.794-1.49-1.77-1.665-2.07-.175-.3-.019-.461.13-.61.135-.133.3-.349.45-.523.15-.174.2-.3.3-.499.1-.199.05-.374-.025-.524-.075-.15-.662-1.597-.907-2.193-.238-.574-.48-.496-.662-.505-.171-.007-.368-.008-.567-.008-.199 0-.523.075-.797.374-.275.3-1.05 1.024-1.05 2.5 0 1.475 1.075 2.9 1.225 3.1.15.199 2.113 3.227 5.12 4.526.715.309 1.273.493 1.71.632.719.229 1.373.197 1.892.119.579-.088 1.777-.726 2.027-1.427.25-.7 2.5-1.426 2.5-1.426.25-.099.199-.199.15-.349z" />
  </Svg>
)

const getMonthNumber = (monthName: string): number => {
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  const idx = months.indexOf(monthName.trim().toLowerCase());
  return idx !== -1 ? idx + 1 : new Date().getMonth() + 1;
}

export default function PaymentsScreen() {
  const { user } = useAuth()
  const { isDark } = useTheme()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardHeight()
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [payments, setPayments] = useState<Payment[]>([])
  const [occupants, setOccupants] = useState<Occupant[]>([])

  // Payment Reminder Portal States
  const [reminderModalVisible, setReminderModalVisible] = useState(false)
  const [reminderType, setReminderType] = useState<"friendly" | "firm">("friendly")
  const [portalToken, setPortalToken] = useState("")
  const [isRefreshingLink, setIsRefreshingLink] = useState(false)

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

    // Reset anim state
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

  // Custom Delete Confirm State
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false)
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null)
  
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
  const [selectedPaymentPortalToken, setSelectedPaymentPortalToken] = useState<string | null>(null)
  
  // Custom Payment Confirmation States
  const [markPaidModalVisible, setMarkPaidModalVisible] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"UPI" | "Cash">("UPI")
  const [markingPaidPaymentId, setMarkingPaidPaymentId] = useState<number | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const [formModalVisible, setFormModalVisible] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  
  const [monthPickerVisible, setMonthPickerVisible] = useState(false)
  const [imageFullScreen, setImageFullScreen] = useState(false)
  const [signedScreenshotUrl, setSignedScreenshotUrl] = useState<string | null>(null)
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null)
  const [detailsCollapsed, setDetailsCollapsed] = useState(false)
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
  const [selectedTenantIds, setSelectedTenantIds] = useState<number[]>([])
  const [tenantSearchQuery, setTenantSearchQuery] = useState("")

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
  const lastInteractionTime = useRef(0)
  const activeIndexRef = useRef(0)

  useEffect(() => {
    activeIndexRef.current = activeCardIndex
  }, [activeCardIndex])

  useEffect(() => {
    const timer = setInterval(() => {
      const timeSinceInteraction = Date.now() - lastInteractionTime.current
      if (timeSinceInteraction < 2000) {
        return
      }

      const nextIndex = (activeIndexRef.current + 1) % 4
      carouselRef.current?.scrollTo({
        x: nextIndex * CARD_WIDTH,
        animated: true,
      })
    }, 3000)

    return () => clearInterval(timer)
  }, [])

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
    if (!user?.id) {
      setLoading(false)
      return
    }
    try {
      if (!silent) {
        if (payments.length === 0) setLoading(true)
        else setIsRefreshing(true)
      }

      // 1. Fetch payments with tenant details
      const { data: payData, error: payError } = await supabase
        .from("payments")
        .select("*, tenants_table(name, mobile_number, rooms_table(room_number, rent_amount))")
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

      // 3. Fetch portal_token for the selected month and year from monthly_payment_links
      const [monthName, yearStr] = selectedMonth.split(" ")
      const monthVal = getMonthNumber(monthName)
      const yearVal = parseInt(yearStr, 10) || new Date().getFullYear()

      const { data: linkData, error: linkError } = await supabase
        .from("monthly_payment_links")
        .select("portal_token")
        .eq("owner_id", user.id)
        .eq("month", monthVal)
        .eq("year", yearVal)
        .single()

      if (linkError && linkError.code !== "PGRST116") {
        console.error("Error fetching monthly portal link:", linkError)
      }

      let activePortalToken = linkData?.portal_token
      if (!activePortalToken) {
        // Generate portal_token on the fly if it's missing/null in DB for this month
        activePortalToken = Math.random().toString(36).substring(2, 14)
        await supabase
          .from("monthly_payment_links")
          .upsert({
            owner_id: user.id,
            month: monthVal,
            year: yearVal,
            portal_token: activePortalToken
          }, { onConflict: "owner_id,month,year" })
      }
      setPortalToken(activePortalToken || "")

    } catch (err) {
      console.error("Error fetching payments records:", err)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [user?.id, payments.length, selectedMonth])

  const handleRefreshPortalLink = async () => {
    if (!user?.id) return
    setIsRefreshingLink(true)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      const [monthName, yearStr] = selectedMonth.split(" ")
      const monthVal = getMonthNumber(monthName)
      const yearVal = parseInt(yearStr, 10) || new Date().getFullYear()

      const newToken = Math.random().toString(36).substring(2, 14)
      const { error } = await supabase
        .from("monthly_payment_links")
        .upsert({
          owner_id: user.id,
          month: monthVal,
          year: yearVal,
          portal_token: newToken
        }, { onConflict: "owner_id,month,year" })

      if (error) throw error
      setPortalToken(newToken)
      showToast("Link Refreshed", `A new payment portal URL has been generated for ${selectedMonth}.`, "success")
    } catch (err) {
      console.error("Error refreshing portal link:", err)
      showToast("Error", "Failed to regenerate payment portal link. Make sure database migrations are up to date.", "error")
    } finally {
      setIsRefreshingLink(false)
    }
  }

  // Prewritten notice messages
  const portalUrl = `https://staytraq.vercel.app/pay/${portalToken}`
  const friendlyMessage = `Dear Tenant, this is a friendly reminder that rent is due soon. You can view your invoice details, scan the QR code, and submit your payment receipt securely here: ${portalUrl}\nThank you!`
  const firmMessage = `Dear Tenant, this is a formal notice that your rent payment is now due. Please clear outstanding amounts immediately and submit your verification details on our portal: ${portalUrl}`

  const currentReminderMessage = reminderType === "friendly" ? friendlyMessage : firmMessage

  const handleCopyAndShareReminder = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Clipboard.setString(currentReminderMessage)
    try {
      await Share.share({
        message: currentReminderMessage
      })
      showToast("Notice Copied", "Reminder notice copied to clipboard & share sheet opened.", "success")
    } catch (err) {
      console.error("Share error:", err)
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
    if (isDark) {
      switch (type) {
        case "success": return "rgba(74, 222, 128, 0.25)"
        case "error": return "rgba(248, 113, 113, 0.25)"
        case "warning": return "rgba(251, 191, 36, 0.25)"
        default: return "rgba(96, 165, 250, 0.25)"
      }
    } else {
      switch (type) {
        case "success": return "rgba(22, 163, 74, 0.25)"
        case "error": return "rgba(220, 38, 38, 0.25)"
        case "warning": return "rgba(217, 119, 6, 0.25)"
        default: return "rgba(37, 99, 235, 0.25)"
      }
    }
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
          <Text className="text-[11px] font-black text-foreground dark:text-foreground-dark">{toast.title}</Text>
          <Text className="text-[9px] text-muted dark:text-muted-dark font-medium mt-0.5" numberOfLines={2}>
            {toast.message}
          </Text>
        </View>
      </Animated.View>
    )
  }

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

      // Get image dimensions to determine aspect ratio
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
    if (detailModalVisible && selectedPayment?.screenshot_path) {
      void fetchScreenshotUrl(selectedPayment.screenshot_path)
    } else {
      setSignedScreenshotUrl(null)
      setImageAspectRatio(null)
      setRejectingMode(false)
      setRejectNotes("")
    }
  }, [detailModalVisible, selectedPayment])

  useEffect(() => {
    if (!selectedPayment) {
      setSelectedPaymentPortalToken(null)
      return
    }

    const fetchPortalTokenForPayment = async () => {
      try {
        const { data, error } = await supabase
          .from("monthly_payment_links")
          .select("portal_token")
          .eq("owner_id", selectedPayment.owner_id)
          .eq("month", selectedPayment.month)
          .eq("year", selectedPayment.year)
          .single()

        if (error && error.code !== "PGRST116") {
          console.error("Error fetching portal token for selected payment:", error)
          return
        }

        if (data?.portal_token) {
          setSelectedPaymentPortalToken(data.portal_token)
        } else {
          const newToken = Math.random().toString(36).substring(2, 14)
          const { data: upsertData, error: upsertError } = await supabase
            .from("monthly_payment_links")
            .upsert({
              owner_id: selectedPayment.owner_id,
              month: selectedPayment.month,
              year: selectedPayment.year,
              portal_token: newToken
            }, { onConflict: "owner_id,month,year" })
            .select("portal_token")
            .single()

          if (upsertError) {
            console.error("Error generating portal token for selected payment:", upsertError)
            setSelectedPaymentPortalToken(newToken)
          } else {
            setSelectedPaymentPortalToken(upsertData?.portal_token || newToken)
          }
        }
      } catch (err) {
        console.error("Error in fetchPortalTokenForPayment:", err)
      }
    }

    void fetchPortalTokenForPayment()
  }, [selectedPayment])

  const formatWhatsAppNumber = (phone: string | null | undefined): string => {
    if (!phone) return ""
    const cleaned = phone.replace(/\D/g, "")
    if (cleaned.length === 10) {
      return `91${cleaned}`
    }
    return cleaned
  }

  const formatDateFriendly = (dateStr: string): string => {
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    } catch {
      return dateStr
    }
  }

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  const getWhatsAppMessage = (payment: Payment, portalTokenStr: string) => {
    const tenantName = payment.tenants_table?.name || "Tenant"
    const amount = payment.total_amount
    const monthName = MONTH_NAMES[payment.month - 1] || "Current Month"
    const year = payment.year
    const formattedDueDate = formatDateFriendly(payment.due_date)
    const paymentLink = `https://staytraq.vercel.app/pay/${portalTokenStr}`

    if (payment.status === "late") {
      return `Hi ${tenantName},\n\nThis is a reminder that your rent payment of ₹${amount} for ${monthName} ${year} was due on ${formattedDueDate} and is currently overdue.\n\nPlease clear the outstanding amount as soon as possible and submit the payment proof here: ${paymentLink}\n\nIf you have already paid, please ignore this message. Thank you!`
    } else {
      return `Hi ${tenantName},\n\nThis is a friendly reminder that your rent payment of ₹${amount} for ${monthName} ${year} is due on ${formattedDueDate}.\n\nYou can view your invoice and submit the payment proof directly here: ${paymentLink}\n\nThank you!`
    }
  }

  const handleWhatsAppReminder = async () => {
    if (!selectedPayment) return
    
    if (!selectedPaymentPortalToken) {
      showToast("Generating link...", "Payment portal link is being fetched/created. Please try again.", "info")
      return
    }

    const phone = selectedPayment.tenants_table?.mobile_number
    if (!phone) {
      Alert.alert("Missing Phone Number", "This tenant does not have a registered mobile number.")
      return
    }

    const formattedPhone = formatWhatsAppNumber(phone)
    const message = getWhatsAppMessage(selectedPayment, selectedPaymentPortalToken)
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`

    try {
      await Linking.openURL(url)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } catch (err) {
      console.error("Error opening WhatsApp:", err)
      Alert.alert("Error", "Could not launch WhatsApp or open the link.")
    }
  }

  // Double-tap or maximize trigger for screenshot fullscreen zoom
  const handleToggleFullscreenImage = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setImageFullScreen(!imageFullScreen)
    if (imageFullScreen) {
      setDetailsCollapsed(false)
    }
  }

  // Complete Mark as Paid flow with custom payment method selection
  const confirmMarkPaid = async (paymentId: number, method: "UPI" | "Cash") => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    
    setMarkPaidModalVisible(false)
    setMarkingPaidId(paymentId)
    
    // Optimistic UI updates
    setPayments((prev) =>
      prev.map((p) =>
        p.id === paymentId
          ? { ...p, status: "paid" as const, paid_at: new Date().toISOString(), payment_method: method }
          : p
      )
    )
    if (selectedPayment?.id === paymentId) {
      setSelectedPayment((prev) =>
        prev ? { ...prev, status: "paid" as const, paid_at: new Date().toISOString(), payment_method: method } : null
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
            payment_method: method
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
          notes: `Marked paid manually by owner via ${method}`
        })

        showToast("Payment Confirmed", `Rent marked as paid via ${method} successfully.`, "success")
      } catch (err) {
        console.error("Failed manual verification updates:", err)
        showToast("Server Error", "Could not synchronize payment status.", "error")
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
      prev.map((p) => (p.id === payment.id ? { ...p, status: "paid" as const, paid_at: now, verified_at: now } : p))
    )

    try {
      const { error } = await (supabase as any)
        .from("payments")
        .update({
          status: "paid",
          paid_at: now,
          verified_at: now
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
      showToast("Database Error", "Failed to approve payment record.", "error")
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
      showToast("Database Error", "Failed to reject payment record.", "error")
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
    showToast("Link Copied", "Portal link copied to clipboard.", "success")
  }

  const openAddModal = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditingPayment(null)
    setFormTenantId("")
    setSelectedTenantIds([])
    setTenantSearchQuery("")
    setFormBaseRent("")
    setFormExtraCharges("")
    
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
    setSelectedTenantIds([payment.tenant_id])
    setTenantSearchQuery("")
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

    if (editingPayment) {
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
    } else {
      if (selectedTenantIds.length === 0) {
        setFormError("Select at least one tenant.")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        return
      }
      if (formBaseRent.trim() && isNaN(Number(formBaseRent))) {
        setFormError("Base rent amount must be a valid number.")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        return
      }
      if (formExtraCharges.trim() && isNaN(Number(formExtraCharges))) {
        setFormError("Extra charges must be a valid number.")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        return
      }
    }

    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      
      if (editingPayment) {
        const rentAmt = parseFloat(formBaseRent)
        const extraChargesAmt = parseFloat(formExtraCharges) || 0
        const totalAmount = rentAmt + extraChargesAmt

        let finalStatus = formStatus
        if (formStatus === "pending" || formStatus === "late") {
          const todayStr = new Date().toISOString().split("T")[0]
          finalStatus = formDueDate < todayStr ? "late" : "pending"
        }

        const payload = {
          tenant_id: parseInt(formTenantId, 10),
          rent_amount: rentAmt,
          extra_charges: extraChargesAmt,
          total_amount: totalAmount,
          month: parseInt(formMonth, 10),
          year: parseInt(formYear, 10),
          due_date: formDueDate,
          status: finalStatus,
          payment_method: formPaymentMethod.trim() || null,
          utr_number: formUtrNumber.trim() || null,
          paid_at: finalStatus === "paid" ? (formPaymentDate ? `${formPaymentDate}T12:00:00Z` : new Date().toISOString()) : null,
          owner_id: user.id
        }

        const { error } = await (supabase as any)
          .from("payments")
          .update(payload)
          .eq("id", editingPayment.id)

        if (error) throw error
      } else {
        const currentMonth = new Date().getMonth() + 1
        const currentYear = new Date().getFullYear()

        const payloads = selectedTenantIds.map((tId) => {
          const tenant = occupants.find((o) => o.id === tId)
          
          let rentAmt = parseFloat(formBaseRent)
          if (isNaN(rentAmt)) {
            rentAmt = tenant?.rooms_table?.rent_amount ?? 0
          }

          let extraChargesAmt = parseFloat(formExtraCharges)
          if (isNaN(extraChargesAmt)) {
            extraChargesAmt = tenant?.extra_charges ?? 0
          }

          const totalAmount = rentAmt + extraChargesAmt
          
          const todayStr = new Date().toISOString().split("T")[0]
          const finalStatus = formDueDate < todayStr ? "late" : "pending"

          return {
            tenant_id: tId,
            rent_amount: rentAmt,
            extra_charges: extraChargesAmt,
            total_amount: totalAmount,
            month: currentMonth,
            year: currentYear,
            due_date: formDueDate,
            status: finalStatus,
            owner_id: user.id
          }
        })

        const { error } = await (supabase as any)
          .from("payments")
          .insert(payloads)

        if (error) throw error
      }

      setFormModalVisible(false)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      if (editingPayment) {
        showToast("Record Updated", "The billing record has been successfully updated.", "success")
      } else {
        const count = selectedTenantIds.length
        showToast(
          "Records Generated",
          `Successfully created ${count} payment record${count > 1 ? "s" : ""} for the current billing period.`,
          "success"
        )
      }
      void fetchPayments(true)
    } catch (err) {
      console.error("Save payment error:", err)
      setFormError("Database operation failed. Make sure due date formats match YYYY-MM-DD.")
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
      setDetailModalVisible(false)
      setDeleteConfirmVisible(false)
      showToast("Deleted Successfully", "The billing record has been permanently deleted.", "success")
      void fetchPayments(true)
    } catch (err) {
      console.error("Error deleting payment record:", err)
      showToast("Database Error", "Failed to delete the selected billing row.", "error")
    } finally {
      setDeletingPaymentId(null)
    }
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
      <SafeAreaView key="payments-loading" className="flex-1 bg-background dark:bg-background-dark" edges={["top"]}>
        {/* Header Skeleton */}
        <View className="px-6 pt-4 pb-3 flex-row justify-between items-center">
          <View className="gap-2">
            <View className="h-7 w-32 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
            <View className="h-4 w-60 bg-muted/15 dark:bg-muted-dark/15 rounded-lg" />
          </View>
          <View className="flex-row gap-2">
            <View className="h-10 w-10 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
            <View className="h-10 w-10 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
          </View>
        </View>

        {/* Carousel Skeleton */}
        <View className="mb-4 mt-2 px-6">
          <View className="h-20 w-full bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-5 shadow-sm justify-center">
            <View className="flex-row items-center gap-4">
              <View className="h-10 w-10 bg-muted/20 dark:bg-muted-dark/20 rounded-full" />
              <View className="flex-1 gap-2">
                <View className="h-3 w-16 bg-muted/15 dark:bg-muted-dark/15 rounded-md" />
                <View className="h-5 w-24 bg-muted/25 dark:bg-muted-dark/25 rounded-md" />
              </View>
            </View>
          </View>
          {/* Dots */}
          <View className="flex-row justify-center gap-1.5 mt-3">
            <View className="h-1.5 w-5 bg-muted/30 dark:bg-muted-dark/30 rounded-full" />
            <View className="h-1.5 w-1.5 bg-muted/15 dark:bg-muted-dark/15 rounded-full" />
            <View className="h-1.5 w-1.5 bg-muted/15 dark:bg-muted-dark/15 rounded-full" />
            <View className="h-1.5 w-1.5 bg-muted/15 dark:bg-muted-dark/15 rounded-full" />
          </View>
        </View>

        {/* Search & Filter Skeleton */}
        <View className="px-6 mb-3 gap-3">
          <View className="flex-row items-center gap-2">
            <View className="h-11 flex-1 bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-2xl" />
            <View className="h-11 w-28 bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-2xl" />
          </View>
          <View className="flex-row justify-between items-center gap-2">
            <View className="h-8 w-40 bg-muted/15 dark:bg-muted-dark/15 rounded-full" />
            <View className="h-8 w-24 bg-muted/20 dark:bg-muted-dark/20 rounded-full" />
          </View>
        </View>

        {/* Ledger list items skeleton */}
        <View className="flex-1 px-6 mt-2">
          <ScrollView showsVerticalScrollIndicator={false}>
            {[1, 2, 3, 4].map((i) => (
              <View
                key={i}
                className="flex-row items-center bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-3xl mb-3 shadow-sm justify-between opacity-60"
              >
                <View className="flex-row items-center flex-1 pr-4">
                  <View className="h-11 w-11 bg-muted/20 dark:bg-muted-dark/20 rounded-full mr-3.5" />
                  <View className="flex-1 gap-2">
                    <View className="flex-row items-center">
                      <View className="h-4 w-28 bg-muted/25 dark:bg-muted-dark/25 rounded-md mr-2" />
                      <View className="h-3.5 w-14 bg-muted/20 dark:bg-muted-dark/20 rounded-md" />
                    </View>
                    <View className="flex-row items-center gap-4">
                      <View className="h-3 w-16 bg-muted/15 dark:bg-muted-dark/15 rounded-md" />
                      <View className="h-3 w-20 bg-muted/15 dark:bg-muted-dark/15 rounded-md" />
                    </View>
                  </View>
                </View>
                <View className="h-4 w-12 bg-muted/25 dark:bg-muted-dark/25 rounded-md" />
              </View>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView key="payments-loaded" className="flex-1 bg-background dark:bg-background-dark" edges={["top"]}>
      {/* Dynamic Header */}
      <View className="px-6 pt-3 pb-1.5 flex-row justify-between items-center">
        <View>
          <Text className="text-2xl font-black text-foreground dark:text-foreground-dark tracking-tight">
            Payments
          </Text>
          <Text className="text-[11px] text-muted dark:text-muted-dark font-medium mt-0.5">
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
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setReminderModalVisible(true)
            }}
            className="h-10 w-10 border border-border dark:border-border-dark rounded-xl items-center justify-center bg-card dark:bg-card-dark"
          >
            <MessageSquare size={16} color={isDark ? "#0091ff" : "#0071df"} />
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
      <View className="mb-2">
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
          onScrollBeginDrag={() => { lastInteractionTime.current = Date.now(); }}
          onScrollEndDrag={() => { lastInteractionTime.current = Date.now(); }}
          onMomentumScrollEnd={() => { lastInteractionTime.current = Date.now(); }}
        >
          {carouselData.map((card, i) => {
            const Icon = card.icon
            return (
              <View 
                key={card.title} 
                style={{ width: CARD_WIDTH }} 
                className="pr-4 py-1"
              >
                <View 
                  className={`flex-row items-center gap-3 rounded-2xl border ${card.border} px-4 py-2 h-16 shadow-sm relative overflow-hidden`}
                >
                  <LinearGradient
                    colors={card.colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                  <View className="h-8 w-8 rounded-full bg-white/20 items-center justify-center">
                    <Icon size={14} color="#ffffff" />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-[9px] font-extrabold uppercase tracking-widest ${card.text} opacity-80`}>
                      {card.title}
                    </Text>
                    <Text className="text-base font-black text-foreground dark:text-foreground-dark tracking-tight mt-0.5">
                      ₹{card.amount.toLocaleString()}
                    </Text>
                  </View>
                </View>
              </View>
            )
          })}
        </ScrollView>
        {/* Pagination Dots */}
        <View className="flex-row justify-center gap-1.5 mt-1">
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
      <View className="px-6 mb-2 gap-2">
        {/* Search & Month Filter Row */}
        <View className="flex-row items-center gap-2">
          {/* Search */}
          <View className="flex-1 flex-row items-center border border-border dark:border-border-dark bg-card dark:bg-card-dark rounded-2xl px-4 py-1.5 shadow-sm">
            <View className="mr-3">
              <Search size={16} color="#9ca3af" />
            </View>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search tenants or rooms..."
              placeholderTextColor="#9ca3af"
              className="flex-1 text-sm text-foreground dark:text-foreground-dark py-0.5"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <X size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          {/* Month selector button next to search bar */}
          <TouchableOpacity 
            onPress={() => setMonthPickerVisible(true)} 
            className="bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-2xl flex-row items-center gap-1.5 justify-center"
          >
            <Calendar size={13} color={isDark ? "#0091ff" : "#0071df"} />
            <Text className="text-[10px] font-black text-primary uppercase">
              {selectedMonth}
            </Text>
          </TouchableOpacity>
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
            keyExtractor={(item) => `${item.id}-${item.status}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 110 }}
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
                      onPress={() => {
                        setMarkingPaidPaymentId(item.id)
                        setSelectedPaymentMethod("UPI")
                        setDropdownOpen(false)
                        setMarkPaidModalVisible(true)
                      }}
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
        <View className="flex-1 justify-end">
          {/* Backdrop Overlay */}
          <TouchableOpacity 
            activeOpacity={1}
            onPress={() => setDetailModalVisible(false)}
            className="absolute inset-0 bg-black/60"
          />
          
          <View className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[92%] border-t border-border dark:border-border-dark p-6">
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
                      onPress={() => setDetailModalVisible(false)}
                      className="h-10 w-10 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
                    >
                      <X size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Main Scroll Content */}
                <ScrollView 
                  showsVerticalScrollIndicator={false} 
                  contentContainerStyle={{ gap: 16 }} 
                  className="flex-shrink flex-grow-0 max-h-[75%]"
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
                          (selectedPayment.status === "submitted" || selectedPayment.status === "paid") ? "bg-success" : "bg-muted/20"
                        }`}>
                          {(selectedPayment.status === "submitted" || selectedPayment.status === "paid") ? (
                            <Check size={10} color="#ffffff" strokeWidth={3} />
                          ) : (
                            <Clock size={10} color="#9ca3af" />
                          )}
                        </View>
                        <View className={`h-8 w-[2px] ${selectedPayment.verified_at ? "bg-success" : "bg-muted/30"}`} />
                      </View>
                      <View>
                        <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Payment Submitted</Text>
                        <Text className="text-[10px] text-muted font-medium mt-0.5">
                          {selectedPayment.status === "paid" && selectedPayment.paid_at 
                            ? `Received ${new Date(selectedPayment.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` 
                            : "Payment under review"}
                        </Text>
                      </View>
                    </View>
 
                    {/* Step 3 */}
                    <View className="flex-row items-start">
                      <View className="items-center mr-3">
                        <View className={`h-5 w-5 rounded-full items-center justify-center z-10 ${
                          selectedPayment.verified_at ? "bg-success" : "bg-muted/20"
                        }`}>
                          <ShieldCheck size={10} color={selectedPayment.verified_at ? "#ffffff" : "#9ca3af"} />
                        </View>
                      </View>
                      <View>
                        <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Audit & Verified</Text>
                        <Text className="text-[10px] text-muted font-medium mt-0.5">
                          {selectedPayment.verified_at ? "Ledger record verified" : "Awaiting verification"}
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
                            <Text className="text-[11px] font-bold text-muted">UTR / Transaction Code</Text>
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

                  {/* WhatsApp Reminder Button */}
                  {(selectedPayment.status === "pending" || selectedPayment.status === "late") && (
                    <TouchableOpacity
                      onPress={handleWhatsAppReminder}
                      className="h-12 w-12 border border-success/20 bg-success/5 rounded-xl items-center justify-center active:scale-95"
                    >
                      <WhatsAppIcon size={18} color="#10b981" />
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
                      onPress={() => {
                        setMarkingPaidPaymentId(selectedPayment.id)
                        setSelectedPaymentMethod("UPI")
                        setDropdownOpen(false)
                        setMarkPaidModalVisible(true)
                      }}
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
          {detailModalVisible && renderToast()}
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

      {/* Modal 3: Add / Edit Payment Record Form Sheet */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={formModalVisible}
        onRequestClose={() => setFormModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={0}
            className="w-full"
          >
            {(() => {
              const sheetMax = Math.min(
                height * 0.92,
                keyboardHeight > 0 ? height - keyboardHeight - insets.top : height * 0.88
              )
              return (
                <View
                  style={{ maxHeight: sheetMax }}
                  className="bg-card dark:bg-card-dark rounded-t-[36px] border-t border-border dark:border-border-dark p-6"
                >
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
                className="h-10 w-10 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
              >
                <X size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {formError && (
              <View className="bg-destructive/10 border border-destructive/20 p-3 rounded-xl mb-4">
                <Text className="text-destructive text-sm font-medium">{formError}</Text>
              </View>
            )}

            <KeyboardAwareScrollView 
              showsVerticalScrollIndicator={false} 
              disableKeyboardPadding={true}
              contentContainerStyle={{ gap: 16, paddingBottom: 36 }} 
              className="mb-6"
              keyboardShouldPersistTaps="handled"
            >
              {/* Select Occupant */}
              {editingPayment ? (
                <View>
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Occupant</Text>
                  <View className="px-3.5 py-2.5 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-xl h-11 justify-center">
                    <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                      {editingPayment.tenants_table?.name || "Occupant"} (Room {editingPayment.tenants_table?.rooms_table?.room_number || "—"})
                    </Text>
                  </View>
                </View>
              ) : (
                <View className="gap-3">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider">Assign Occupants</Text>
                  
                  {/* Search Input */}
                  <View className="flex-row items-center border border-border dark:border-border-dark bg-background dark:bg-background-dark rounded-xl px-3 h-11">
                    <View className="mr-2">
                      <Search size={16} color="#9ca3af" />
                    </View>
                    <TextInput
                      value={tenantSearchQuery}
                      onChangeText={setTenantSearchQuery}
                      placeholder="Search by name or room..."
                      placeholderTextColor="#9ca3af"
                      className="flex-1 text-sm text-foreground dark:text-foreground-dark py-1"
                    />
                    {tenantSearchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setTenantSearchQuery("")}>
                        <X size={16} color="#9ca3af" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Search Results Dropdown */}
                  {tenantSearchQuery.length > 0 && (() => {
                    const filtered = occupants.filter((occ) => {
                      const nameMatch = occ.name.toLowerCase().includes(tenantSearchQuery.toLowerCase())
                      const roomMatch = (occ.rooms_table?.room_number || "").toLowerCase().includes(tenantSearchQuery.toLowerCase())
                      return nameMatch || roomMatch
                    })

                    return (
                      <View className="border border-border dark:border-border-dark bg-background dark:bg-background-dark rounded-xl overflow-hidden max-h-40">
                        <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                          {filtered.length === 0 ? (
                            <View className="p-3">
                              <Text className="text-xs text-muted text-center font-medium">No matching active tenants found</Text>
                            </View>
                          ) : (
                            filtered.map((occ) => {
                              const isSelected = selectedTenantIds.includes(occ.id)
                              return (
                                <TouchableOpacity
                                  key={occ.id}
                                  onPress={() => {
                                    if (isSelected) {
                                      setSelectedTenantIds((prev) => prev.filter((id) => id !== occ.id))
                                    } else {
                                      setSelectedTenantIds((prev) => [...prev, occ.id])
                                    }
                                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                  }}
                                  className="px-4 py-3 border-b border-border/40 dark:border-border-dark/40 flex-row justify-between items-center active:bg-muted/10"
                                >
                                  <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">
                                    {occ.name} (Room {occ.rooms_table?.room_number || "—"})
                                  </Text>
                                  {isSelected ? (
                                    <Check size={14} color="#10b981" strokeWidth={3} />
                                  ) : (
                                    <Plus size={14} color={isDark ? "#0091ff" : "#0071df"} />
                                  )}
                                </TouchableOpacity>
                              )
                            })
                          )}
                        </ScrollView>
                      </View>
                    )
                  })()}

                  {/* Selected Tenants chips */}
                  {selectedTenantIds.length > 0 && (
                    <View className="gap-2">
                      <Text className="text-[9px] font-extrabold uppercase tracking-widest text-muted">Selected Tenants ({selectedTenantIds.length})</Text>
                      <View className="flex-row flex-wrap gap-2">
                        {selectedTenantIds.map((tId) => {
                          const tenant = occupants.find((o) => o.id === tId)
                          if (!tenant) return null
                          return (
                            <View
                              key={tId}
                              className="flex-row items-center bg-card dark:bg-card-dark border border-border dark:border-border-dark px-3 py-1.5 rounded-xl shadow-sm"
                            >
                              <Text className="text-xs font-bold text-foreground dark:text-foreground-dark mr-2.5">
                                {tenant.name}
                              </Text>
                              <View className="bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md mr-2">
                                <Text className="text-[9px] font-black text-primary uppercase">
                                  {tenant.rooms_table?.room_number || "—"}
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => {
                                  setSelectedTenantIds((prev) => prev.filter((id) => id !== tId))
                                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                }}
                                className="h-5 w-5 rounded-md bg-muted/10 items-center justify-center active:bg-muted/20"
                              >
                                <X size={10} color={isDark ? "#94a3b8" : "#64748b"} strokeWidth={3} />
                              </TouchableOpacity>
                            </View>
                          )
                        })}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Grid: Rent & Extra Charges */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                    {editingPayment ? "Base Rent Amount (₹)" : "Rent (blank for default)"}
                  </Text>
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
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                    {editingPayment ? "Extra Charges (₹)" : "Extra (blank for default)"}
                  </Text>
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

              {/* Grid: Due Date */}
              <ThemeDatePicker
                value={formDueDate}
                onChange={setFormDueDate}
                label="Rent Due Date"
                placeholder="YYYY-MM-DD"
              />

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
                    <ThemeDatePicker
                      value={formPaymentDate}
                      onChange={setFormPaymentDate}
                      label="Payment Date"
                      placeholder="YYYY-MM-DD"
                    />
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
              )
            })()}
          </KeyboardAvoidingView>
          {formModalVisible && renderToast()}
        </View>
      </Modal>

      {/* Reminder Notice Share Drawer/Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={reminderModalVisible}
        onRequestClose={() => setReminderModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[80%] border-t border-border dark:border-border-dark p-6">
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-base font-black text-foreground dark:text-foreground-dark">Tenant Payment Notice</Text>
              <TouchableOpacity onPress={() => setReminderModalVisible(false)}>
                <X size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <View className="gap-5">
              {/* Template Selectors */}
              <View className="flex-row bg-muted/10 p-1 rounded-xl border border-border dark:border-border-dark">
                <TouchableOpacity
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setReminderType("friendly")
                  }}
                  className={`flex-1 py-2.5 rounded-lg items-center justify-center ${
                    reminderType === "friendly" ? "bg-primary" : "bg-transparent"
                  }`}
                >
                  <Text className={`text-xs font-black uppercase tracking-wider ${
                    reminderType === "friendly" ? "text-white" : "text-muted"
                  }`}>
                    Friendly Reminder
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setReminderType("firm")
                  }}
                  className={`flex-1 py-2.5 rounded-lg items-center justify-center ${
                    reminderType === "firm" ? "bg-primary" : "bg-transparent"
                  }`}
                >
                  <Text className={`text-xs font-black uppercase tracking-wider ${
                    reminderType === "firm" ? "text-white" : "text-muted"
                  }`}>
                    Firm Notice
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Highlighted Portal Link */}
              <View className="gap-2">
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider">Portal Link (Click to Copy)</Text>
                <TouchableOpacity
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                    Clipboard.setString(portalUrl)
                    showToast("Link Copied", "Portal link copied to clipboard.", "success")
                  }}
                  className="border border-primary/20 dark:border-primary-dark/20 rounded-2xl p-4 bg-primary/5 flex-row items-center justify-between active:scale-[0.98]"
                >
                  <View className="flex-1 mr-2">
                    <Text numberOfLines={1} className="text-sm font-semibold text-primary dark:text-primary-dark font-mono">
                      {portalUrl}
                    </Text>
                  </View>
                  <Copy size={16} className="text-primary dark:text-primary-dark" />
                </TouchableOpacity>
              </View>

              {/* Message Box */}
              <View className="gap-2">
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider">Notice Message Preview</Text>
                <TextInput
                  value={currentReminderMessage}
                  editable={false}
                  multiline
                  className="border border-border dark:border-border-dark rounded-2xl p-4 text-sm leading-5 text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark min-h-[140px]"
                />
              </View>

              {/* Action Buttons */}
              <View className="gap-3 pt-2">
                <TouchableOpacity
                  onPress={handleCopyAndShareReminder}
                  className="w-full bg-primary rounded-xl h-12 flex-row items-center justify-center active:scale-95 shadow-md shadow-primary/20"
                >
                  <Copy size={16} color="#ffffff" className="mr-2" />
                  <Text className="text-white font-bold text-sm">Copy & Share</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleRefreshPortalLink}
                  disabled={isRefreshingLink}
                  className="w-full border border-border dark:border-border-dark rounded-xl h-12 flex-row items-center justify-center bg-card dark:bg-card-dark active:scale-95"
                >
                  {isRefreshingLink ? (
                    <ActivityIndicator size="small" color={isDark ? "#0091ff" : "#0071df"} />
                  ) : (
                    <>
                      <RefreshCw size={14} color={isDark ? "#0091ff" : "#0071df"} className="mr-2" />
                      <Text className="text-primary font-bold text-sm">Regenerate Portal Link</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {reminderModalVisible && renderToast()}
        </View>
      </Modal>

      {/* Custom Delete Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={deleteConfirmVisible}
        onRequestClose={() => setDeleteConfirmVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center p-6">
          <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <View className="h-12 w-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-4 self-center">
              <AlertTriangle size={24} color="#dc2626" />
            </View>
            <Text className="text-lg font-black text-foreground dark:text-foreground-dark text-center mb-2">
              Confirm Deletion
            </Text>
            <Text className="text-xs text-muted dark:text-muted-dark text-center mb-6 leading-5">
              Are you sure you want to permanently delete this billing ledger record? This action cannot be undone.
            </Text>
            
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setDeleteConfirmVisible(false)}
                className="flex-1 border border-border rounded-xl h-11 items-center justify-center active:scale-95"
              >
                <Text className="text-muted font-bold text-sm">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={confirmDeletePayment}
                className="flex-1 bg-red-500 rounded-xl h-11 items-center justify-center active:scale-95 shadow-md shadow-red-500/20"
              >
                <Text className="text-white font-bold text-sm">Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
          {deleteConfirmVisible && renderToast()}
        </View>
      </Modal>

      {/* Payment Method Picker Modal */}
      <Modal
        visible={markPaidModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMarkPaidModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 backdrop-blur-sm justify-center items-center p-6">
          <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative">
            
            {/* Title & Message */}
            <Text className="text-[17px] font-black text-slate-900 dark:text-white mb-2 mt-2 text-center">
              Confirm Payment
            </Text>
            <Text className="text-xs text-slate-500 dark:text-slate-400 font-bold mb-5 text-center leading-relaxed">
              Select the payment method used by the occupant to clear this bill.
            </Text>

            {/* Dropdown Selector */}
            <View style={{ zIndex: 100 }} className="mb-6 relative w-full">
              <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Payment Method</Text>
              
              <TouchableOpacity
                onPress={() => setDropdownOpen(!dropdownOpen)}
                className="w-full flex-row justify-between items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5"
                activeOpacity={0.8}
              >
                <Text className="text-xs font-black text-slate-800 dark:text-slate-200">{selectedPaymentMethod}</Text>
                <ChevronRight 
                  size={16} 
                  color={isDark ? "#94a3b8" : "#64748b"} 
                  style={{ transform: [{ rotate: dropdownOpen ? "90deg" : "0deg" }] }} 
                />
              </TouchableOpacity>

              {dropdownOpen && (
                <View className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl mt-1.5 overflow-hidden shadow-lg absolute top-[62px] left-0 right-0 z-50">
                  {["UPI", "Cash"].map((method) => (
                    <TouchableOpacity
                      key={method}
                      onPress={() => {
                        setSelectedPaymentMethod(method as "UPI" | "Cash")
                        setDropdownOpen(false)
                      }}
                      className="w-full px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0 flex-row justify-between items-center active:bg-slate-50 dark:active:bg-slate-700"
                    >
                      <Text className={`text-xs font-bold ${selectedPaymentMethod === method ? "text-primary font-black" : "text-slate-700 dark:text-slate-300"}`}>{method}</Text>
                      {selectedPaymentMethod === method && <Check size={14} color="#10b981" strokeWidth={3} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Buttons Row */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setMarkPaidModalVisible(false)}
                className="flex-1 border border-border rounded-xl h-11 items-center justify-center active:scale-95"
              >
                <Text className="text-muted font-bold text-sm">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => {
                  if (markingPaidPaymentId) {
                    void confirmMarkPaid(markingPaidPaymentId, selectedPaymentMethod)
                  }
                }}
                className="flex-1 bg-success rounded-xl h-11 items-center justify-center active:scale-95 shadow-md shadow-success/20"
              >
                <Text className="text-white font-bold text-sm">Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
          {markPaidModalVisible && renderToast()}
        </View>
      </Modal>

      {/* Toast Notification Overlay */}
      {!(reminderModalVisible || detailModalVisible || formModalVisible || deleteConfirmVisible || markPaidModalVisible) && renderToast()}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 30,
    right: 16,
    width: 280,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 99999,
  },
  toastLight: {
    backgroundColor: "#ffffff",
    shadowColor: "#000000",
  },
  toastDark: {
    backgroundColor: "#171717",
    shadowColor: "#000000",
  },
  toastIconContainer: {
    height: 28,
    width: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(128, 128, 128, 0.08)",
  }
})
