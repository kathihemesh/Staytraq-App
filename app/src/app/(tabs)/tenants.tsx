import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Modal, TextInput, Linking, Alert, Platform, useWindowDimensions, KeyboardAvoidingView, Image, StyleSheet, Clipboard, Animated as RNAnimated } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { useLocalSearchParams, router, useFocusEffect } from "expo-router"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import { scheduleAfterInteractions } from "@/lib/focus-fetch-scheduler"
import { deriveIdentityRequestFlag, maskIdentityCode, selectDisplayCode } from "@/lib/identity/verify"
import { popupStatusPresentation, shouldShowIgnoreButton, applyIgnore, viewerHasSlideControl } from "@/lib/identity/popup"
import { ensureVerificationToken, buildVerificationLink } from "@/lib/identity/token"
import { normalizeWhatsAppNumber, sendIdentityRequest } from "@/lib/identity/message"
import { Plus, X, Search, Phone, Mail, Calendar, CreditCard, ChevronRight, User, Hotel, Edit3, Trash2, Camera, Upload, Check, AlertTriangle, Info, Maximize2, Copy, Clock, ShieldCheck, LogOut, DollarSign, Lock, Eye, EyeOff } from "lucide-react-native"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Path } from "react-native-svg"
import * as Haptics from "expo-haptics"
import Constants from "expo-constants"

const getFallbackApiUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri || (Constants.manifest as any)?.debuggerHost
  if (hostUri) {
    const ip = hostUri.split(":")[0]
    if (ip) {
      return `http://${ip}:3000`
    }
  }
  return "http://10.0.2.2:3000"
}

const getChatbotApiUrl = () => {
  if (process.env.EXPO_PUBLIC_CHATBOT_API_URL) {
    return process.env.EXPO_PUBLIC_CHATBOT_API_URL
  }
  return "https://144.91.79.198.sslip.io"
}

// Base path of the public tenant identity verification portal. The portal lives
// on the web app at /identity-verify/[token], mirroring the pay-link host.
const IDENTITY_PORTAL_BASE = "https://staytraq.vercel.app/identity-verify"
import useTheme from "@/hooks/use-theme"
import { FlashList } from "@shopify/flash-list"
import { KeyboardAwareScrollView, useKeyboardAwareInput, useKeyboardHeight } from "@/components/ui/keyboard-aware-scroll-view"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import ThemeDatePicker from "@/components/ui/theme-date-picker"
import { InlineSelect } from "@/components/ui/inline-select"
import * as ImagePicker from "expo-image-picker"
import * as FileSystem from "expo-file-system/legacy"

type Tenant = {
  id: number
  name: string | null
  mobile_number: string | null
  email: string | null
  join_date: string | null
  exit_date: string | null
  deposit_amount: number | null
  deposit_refund_amount: number | null
  extra_charges: number | null
  notes: string | null
  rent_due_day: number | null
  room_id: number | null
  status: "active" | "pending_move_in" | "notice_period" | "move_out"
  pg_id: number | null
  id_documents?: any
  identity_request_flag?: boolean | null
  ignore_identity_flag?: boolean | null
  verification_status?: "Not_Started" | "In_Progress" | "Verified" | "Ignored" | null
  identity_type?: "Aadhaar" | "PAN" | null
  aadhaar_number?: string | null
  pan_code?: string | null
  id_front_path?: string | null
  id_back_path?: string | null
  deleted_at?: string | null
  pending_deposit_deduction?: number | null
  deduction_payment_id?: number | null
  original_payment_amount?: number | null
  deduction_target_month?: number | null
  deduction_target_year?: number | null
  rooms_table?: {
    id: number
    room_number: string
    rent_amount: number
  } | null
}

type RoomOption = {
  id: number
  room_number: string
  occupied_beds: number
  total_beds: number
  rent_amount: number
}

function decodeBase64(base64: string): ArrayBuffer {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup = new Uint8Array(256)
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i
  }
  
  let bufferLength = base64.length * 0.75
  const len = base64.length
  
  if (base64[len - 1] === '=') {
    bufferLength--
    if (base64[len - 2] === '=') {
      bufferLength--
    }
  }

  const bytes = new Uint8Array(bufferLength)
  let p = 0

  for (let i = 0; i < len; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)]
    const encoded2 = lookup[base64.charCodeAt(i + 1)]
    const encoded3 = lookup[base64.charCodeAt(i + 2)]
    const encoded4 = lookup[base64.charCodeAt(i + 3)]

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4)
    if (p < bufferLength) {
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2)
    }
    if (p < bufferLength) {
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63)
    }
  }

  return bytes.buffer
}

const WhatsAppIcon = ({ size = 20, color = "#25D366" }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.455L0 24zm6.59-4.846c1.66.986 3.298 1.448 5.355 1.449 5.483 0 9.944-4.461 9.947-9.948.002-2.656-1.03-5.153-2.906-7.03-1.876-1.874-4.373-2.907-7.028-2.907-5.488 0-9.95 4.462-9.953 9.95-.001 2.01.52 3.568 1.485 5.105L1.87 20.352l4.777-1.198zM17.472 14.382c-.3-.149-1.777-.876-2.047-.975-.27-.099-.467-.149-.662.149-.195.3-.755.95-.925 1.149-.17.199-.34.225-.64.075-.3-.149-1.266-.467-2.41-1.487-.89-.794-1.49-1.77-1.665-2.07-.175-.3-.019-.461.13-.61.135-.133.3-.349.45-.523.15-.174.2-.3.3-.499.1-.199.05-.374-.025-.524-.075-.15-.662-1.597-.907-2.193-.238-.574-.48-.496-.662-.505-.171-.007-.368-.008-.567-.008-.199 0-.523.075-.797.374-.275.3-1.05 1.024-1.05 2.5 0 1.475 1.075 2.9 1.225 3.1.15.199 2.113 3.227 5.12 4.526.715.309 1.273.493 1.71.632.719.229 1.373.197 1.892.119.579-.088 1.777-.726 2.027-1.427.25-.7 2.5-1.426 2.5-1.426.25-.099.199-.199.15-.349z" />
  </Svg>
)

export default function TenantsScreen() {
  const { isDark } = useTheme()
  const { user } = useAuth()
  const { tenant: tenantParam, status: statusParam, search: searchParam } = useLocalSearchParams<{ tenant?: string; status?: string; search?: string }>()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardHeight()
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const fetchInProgressRef = useRef(false)
  const hasLoadedOnce = useRef(false)
  const statusSyncRunningRef = useRef(false)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [pgId, setPgId] = useState<number | null>(null)

  const nameInput = useKeyboardAwareInput()
  const mobileInput = useKeyboardAwareInput()
  const emailInput = useKeyboardAwareInput()
  const joinDateInput = useKeyboardAwareInput()
  const rentDueDayInput = useKeyboardAwareInput()
  const depositInput = useKeyboardAwareInput()
  const extraChargesInput = useKeyboardAwareInput()
  const notesInput = useKeyboardAwareInput()

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Modal / Drawer state
  const [formModalVisible, setFormModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmModalVisible, setConfirmModalVisible] = useState(false)
  const [tenantToDelete, setTenantToDelete] = useState<{ id: number; roomId: number | null } | null>(null)

  // Move Out flow states
  const [moveOutModalVisible, setMoveOutModalVisible] = useState(false)
  const [moveOutDate, setMoveOutDate] = useState("")
  const [depositRefundAmount, setDepositRefundAmount] = useState("")
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [isSettlingDues, setIsSettlingDues] = useState(false)
  // Deposit deduction states
  const [deductionMode, setDeductionMode] = useState(false)
  const [selectedDeductionPayment, setSelectedDeductionPayment] = useState<any | null>(null)
  const [upcomingPayments, setUpcomingPayments] = useState<any[]>([])
  const [deductionLocked, setDeductionLocked] = useState(false)

  // WhatsApp Invite & Deposit Modal States
  const [whatsappInviteModalVisible, setWhatsappInviteModalVisible] = useState(false)
  const [justAddedTenant, setJustAddedTenant] = useState<Tenant | null>(null)
  const [createDepositPayment, setCreateDepositPayment] = useState(false)
  const [customInviteMessage, setCustomInviteMessage] = useState("")
  const [ownerSettings, setOwnerSettings] = useState<any>(null)
  const [portalToken, setPortalToken] = useState<string>("")
  const [pgName, setPgName] = useState<string>("")
  const [chatbotEnabled, setChatbotEnabled] = useState(false)

  // Form fields
  const [name, setName] = useState("")
  const [mobileNumber, setMobileNumber] = useState("")
  const [email, setEmail] = useState("")
  const [joinDate, setJoinDate] = useState("")
  const [rentDueDay, setRentDueDay] = useState("5")
  const [depositAmount, setDepositAmount] = useState("10000")
  const [extraCharges, setExtraCharges] = useState("0")
  const [selectedRoomId, setSelectedRoomId] = useState<string>("")
  const [tenantStatus, setTenantStatus] = useState<Tenant["status"]>("active")
  const [notes, setNotes] = useState("")

  // Room Search and Identity Docs States
  const [roomSearchQuery, setRoomSearchQuery] = useState("")
  const [idDocs, setIdDocs] = useState<{
    type: string
    uri?: string
    url?: string
    name: string
    mimeType: string
    isNew?: boolean
  }[]>([])
  const [selectedIdType, setSelectedIdType] = useState("")
  // Identity verification request (chatbot-enabled owners): "Request identity from tenant" checkbox
  const [requestIdentityFromTenant, setRequestIdentityFromTenant] = useState(false)
  // Deposit payment request (chatbot-enabled owners): "Create deposit payment record & send reminder"
  // checkbox, shown directly below the identity checkbox in the add-tenant form.
  const [requestDepositPayment, setRequestDepositPayment] = useState(false)
  // WhatsApp invite (chatbot-enabled owners): "Include WhatsApp group invite link"
  // checkbox. When checked (and an invite link is configured), the onboarding
  // message also invites the tenant to join the owner's WhatsApp group.
  const [includeWhatsappInvite, setIncludeWhatsappInvite] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  // Document Viewer and Signed URL States
  const [detailDocUrls, setDetailDocUrls] = useState<Record<string, string>>({})
  const [viewerVisible, setViewerVisible] = useState(false)
  const [viewerImageUri, setViewerImageUri] = useState<string | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerTitle, setViewerTitle] = useState("")

  // Identity section: masked code reveal toggle (reset each time the popup opens)
  const [revealIdentityCode, setRevealIdentityCode] = useState(false)
  // Identity section: "Ignore identity" action confirmation (distinct from the delete flow)
  const [ignoreConfirmVisible, setIgnoreConfirmVisible] = useState(false)
  const [isIgnoringIdentity, setIsIgnoringIdentity] = useState(false)
  // Manual identity document management (owner-side): upload on the tenant's
  // behalf, delete stored documents completely, or re-request via daily reminders.
  const [isManualUploading, setIsManualUploading] = useState(false)
  const [isDeletingIdentity, setIsDeletingIdentity] = useState(false)
  const [isRequestingIdentityAgain, setIsRequestingIdentityAgain] = useState(false)
  // When set to the selected tenant's id, the identity section shows the
  // post-delete "Request again" / "Upload" choices instead of the normal view.
  const [identityResetTenantId, setIdentityResetTenantId] = useState<number | null>(null)

  // Identity document viewer (front/back) — kept separate from the staytraq_docs viewer
  // above so the two viewers never collide. Reads signed URLs from the private
  // `identity_documents` bucket (Reqs 17.1–17.6, 18.3, 18.4).
  const [idViewerVisible, setIdViewerVisible] = useState(false)
  const [idViewerSide, setIdViewerSide] = useState<"front" | "back">("front")
  const [idViewerLoading, setIdViewerLoading] = useState(false)
  const [idFrontUrl, setIdFrontUrl] = useState<string | null>(null)
  const [idBackUrl, setIdBackUrl] = useState<string | null>(null)
  const [idFrontError, setIdFrontError] = useState(false)
  const [idBackError, setIdBackError] = useState(false)

  // Payment History, Tab, and Room Reassignment States
  const [activeTab, setActiveTab] = useState<"details" | "history">("details")
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedPaymentDetail, setSelectedPaymentDetail] = useState<any | null>(null)
  const [paymentDetailVisible, setPaymentDetailVisible] = useState(false)
  const [changeRoomModalVisible, setChangeRoomModalVisible] = useState(false)
  const [roomChangeSearchQuery, setRoomChangeSearchQuery] = useState("")
  const [changeRoomSelectedRoomId, setChangeRoomSelectedRoomId] = useState<number | null>(null)
  const [changeRoomSwapTenantId, setChangeRoomSwapTenantId] = useState<number | null>(null)
  const [isUpdatingRoom, setIsUpdatingRoom] = useState(false)
  const [signedScreenshotUrl, setSignedScreenshotUrl] = useState<string | null>(null)
  const [loadingScreenshot, setLoadingScreenshot] = useState(false)
  const [selectedPaymentPortalToken, setSelectedPaymentPortalToken] = useState<string | null>(null)
  const [rejectingMode, setRejectingMode] = useState(false)
  const [rejectNotes, setRejectNotes] = useState("")
  const [deletePaymentConfirmVisible, setDeletePaymentConfirmVisible] = useState(false)
  const [deletePaymentId, setDeletePaymentId] = useState<number | null>(null)
  const [markPaidModalVisible, setMarkPaidModalVisible] = useState(false)
  const [markingPaidPaymentId, setMarkingPaidPaymentId] = useState<number | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"UPI" | "Cash">("UPI")
  const [paymentMethodDropdownOpen, setPaymentMethodDropdownOpen] = useState(false)
  const [isSendingWhatsAppTenant, setIsSendingWhatsAppTenant] = useState(false)
  const [isSendingWhatsAppPayment, setIsSendingWhatsAppPayment] = useState(false)

  useEffect(() => {
    if (!changeRoomModalVisible) {
      setChangeRoomSelectedRoomId(null)
      setChangeRoomSwapTenantId(null)
      setRoomChangeSearchQuery("")
    }
  }, [changeRoomModalVisible])

  useEffect(() => {
    if (!paymentDetailVisible) {
      setRejectingMode(false)
      setRejectNotes("")
    }
  }, [paymentDetailVisible, selectedPaymentDetail])

  useEffect(() => {
    if (!selectedPaymentDetail) {
      setSelectedPaymentPortalToken(null)
      return
    }

    const fetchPortalTokenForPayment = async () => {
      try {
        const ownerId = selectedPaymentDetail.owner_id || user?.id
        if (!ownerId) return

        const { data, error } = await supabase
          .from("monthly_payment_links")
          .select("portal_token")
          .eq("owner_id", ownerId)
          .eq("month", selectedPaymentDetail.month)
          .eq("year", selectedPaymentDetail.year)
          .single()

        if (error && error.code !== "PGRST116") {
          console.error("Error fetching portal token for selected payment detail:", error)
          return
        }

        if (data?.portal_token) {
          setSelectedPaymentPortalToken(data.portal_token)
        } else {
          const newToken = Math.random().toString(36).substring(2, 14)
          const { data: upsertData, error: upsertError } = await supabase
            .from("monthly_payment_links")
            .upsert({
              owner_id: ownerId,
              month: selectedPaymentDetail.month,
              year: selectedPaymentDetail.year,
              portal_token: newToken
            }, { onConflict: "owner_id,month,year" })
            .select("portal_token")
            .single()

          if (upsertError) {
            console.error("Error generating portal token for selected payment detail:", upsertError)
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
  }, [selectedPaymentDetail, user])

  // Custom Toast State
  const [toast, setToast] = useState<{
    visible: boolean
    title: string
    message: string
    type: "success" | "error" | "info" | "warning"
  }>({
    visible: false,
    title: "",
    message: "",
    type: "success",
  })
  const toastTranslateX = useRef(new RNAnimated.Value(300)).current
  const toastOpacity = useRef(new RNAnimated.Value(0)).current
  const toastTimeoutRef = useRef<any>(null)

  const showToast = useCallback((title: string, message: string, type: "success" | "error" | "info" | "warning" = "success") => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }

    setToast({ visible: true, title, message, type })

    toastTranslateX.setValue(300)
    toastOpacity.setValue(0)

    RNAnimated.parallel([
      RNAnimated.spring(toastTranslateX, {
        toValue: 0,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }),
      RNAnimated.timing(toastOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      })
    ]).start()

    toastTimeoutRef.current = setTimeout(() => {
      RNAnimated.parallel([
        RNAnimated.timing(toastTranslateX, {
          toValue: 300,
          duration: 250,
          useNativeDriver: true,
        }),
        RNAnimated.timing(toastOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        })
      ]).start(() => {
        setToast((prev) => ({ ...prev, visible: false }))
      })
    }, 2000)
  }, [toastTranslateX, toastOpacity])

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
      <RNAnimated.View
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
      </RNAnimated.View>
    )
  }

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    // Prevent concurrent calls (realtime feedback loop guard)
    if (fetchInProgressRef.current) return
    fetchInProgressRef.current = true

    try {
      if (!isRefresh) setLoading(true)

      const currentMonth = new Date().getMonth() + 1
      const currentYear = new Date().getFullYear()

      // Fetch pg_details, tenants, settings, monthly_payment_links, and pg_owners in parallel
      const [pgResult, tenantsResult, settingsResult, linkResult, ownerResult] = await Promise.all([
        supabase
          .from("pg_details")
          .select("id, pg_name")
          .eq("owner_id", user.id)
          .maybeSingle(),
        supabase
          .from("tenants_table")
          .select("*, rooms_table(id, room_number, rent_amount)")
          .eq("owner_id", user.id)
          .is("deleted_at", null)
          .order("name", { ascending: true }),
        supabase
          .from("settings")
          .select("whatsapp_invite_link, upi_id, upi_name, rent_due_day, refund_deposit, default_deposit_fees")
          .eq("owner_id", user.id)
          .maybeSingle(),
        supabase
          .from("monthly_payment_links")
          .select("portal_token")
          .eq("owner_id", user.id)
          .eq("month", currentMonth)
          .eq("year", currentYear)
          .maybeSingle(),
        supabase
          .from("pg_owners")
          .select("chatbot_enabled")
          .eq("id", user.id)
          .single()
      ])

      const pgDetails = pgResult.data
      if (!pgDetails) {
        setLoading(false)
        fetchInProgressRef.current = false
        return
      }
      setPgId(pgDetails.id)
      setPgName(pgDetails.pg_name || "")
      setTenants(tenantsResult.data || [])
      setOwnerSettings(settingsResult.data || null)

      if (ownerResult.error && ownerResult.error.code !== "PGRST116") throw ownerResult.error
      setChatbotEnabled(!!ownerResult.data?.chatbot_enabled)

      // Fetch rooms once we have pgDetails.id
      const { data: roomsData, error: roomsErr } = await supabase
        .from("rooms_table")
        .select("id, room_number, occupied_beds, total_beds, rent_amount")
        .eq("pg_id", pgDetails.id)
        .order("room_number", { ascending: true })

      if (roomsErr) throw roomsErr
      setRooms(roomsData || [])

      // Generate or retrieve portal token
      let activeToken = linkResult.data?.portal_token
      if (!activeToken && user.id) {
        activeToken = Math.random().toString(36).substring(2, 14)
        void (async () => {
          try {
            await supabase
              .from("monthly_payment_links")
              .upsert({
                owner_id: user.id,
                month: currentMonth,
                year: currentYear,
                portal_token: activeToken
              }, { onConflict: "owner_id,month,year" })
          } catch (tokenErr) {
            console.error("Error generating monthly payment link:", tokenErr)
          }
        })()
      }
      setPortalToken(activeToken || "")
      hasLoadedOnce.current = true

      // Trigger background status sync asynchronously
      if (!statusSyncRunningRef.current) {
        statusSyncRunningRef.current = true
        void (async () => {
          try {
            const todayStr = new Date().toISOString().split("T")[0]
            let hasChanges = false

            // Auto-activate pending move-in tenants
            const { data: activated } = await supabase
              .from("tenants_table")
              .update({ status: "active" })
              .eq("owner_id", user.id)
              .eq("status", "pending_move_in")
              .lte("join_date", todayStr)
              .select("id")

            if (activated && activated.length > 0) {
              hasChanges = true
            }

            // Fetch notice-period tenants whose exit date has arrived or passed
            const { data: noticeTenants } = await supabase
              .from("tenants_table")
              .select("id, room_id")
              .eq("owner_id", user.id)
              .eq("status", "notice_period")
              .lte("exit_date", todayStr)

            if (noticeTenants && noticeTenants.length > 0) {
              hasChanges = true
              for (const tenant of noticeTenants) {
                await supabase
                  .from("tenants_table")
                  .update({ status: "move_out", room_id: null })
                  .eq("id", tenant.id)

                if (tenant.room_id) {
                  const { data: roomData } = await supabase
                    .from("rooms_table")
                    .select("occupied_beds")
                    .eq("id", tenant.room_id)
                    .single()

                  if (roomData) {
                    await supabase
                      .from("rooms_table")
                      .update({ occupied_beds: Math.max(roomData.occupied_beds - 1, 0) })
                      .eq("id", tenant.room_id)
                  }
                }
              }
            }

            if (hasChanges) {
              void fetchData(true)
            }
          } catch (syncErr) {
            console.error("Error syncing tenant statuses in background:", syncErr)
          } finally {
            statusSyncRunningRef.current = false
          }
        })()
      }
    } catch (err) {
      console.error("Error fetching tenants:", err)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
      fetchInProgressRef.current = false
    }
  }, [user?.id])

  const buildWelcomeMessage = useCallback((tenant: Tenant, includeDeposit: boolean) => {
    let msg = `Hello ${tenant.name || "Occupant"}! Welcome to ${pgName ? pgName : "our PG"}.`
    if (ownerSettings?.whatsapp_invite_link) {
      msg += ` Please join our WhatsApp group using this link: ${ownerSettings.whatsapp_invite_link}`
    }
    if (includeDeposit && tenant.deposit_amount && tenant.deposit_amount > 0) {
      const portalUrl = `https://staytraq.vercel.app/pay/${portalToken}`
      msg += `\n\nAdditionally, please process your security deposit fee of ₹${tenant.deposit_amount} via our secure payment portal: ${portalUrl}`
    }
    return msg
  }, [ownerSettings?.whatsapp_invite_link, portalToken, pgName])

  const createSecurityDepositPayment = async (tenant: Tenant) => {
    if (!user?.id || !tenant.deposit_amount || tenant.deposit_amount <= 0) return null

    const currentMonth = new Date().getMonth() + 1
    const currentYear = new Date().getFullYear()
    const { data, error } = await supabase
      .from("payments")
      .insert({
        tenant_id: tenant.id,
        owner_id: user.id,
        month: currentMonth,
        year: currentYear,
        rent_amount: tenant.deposit_amount,
        extra_charges: 0,
        total_amount: tenant.deposit_amount,
        due_date: tenant.join_date || new Date().toISOString().split("T")[0],
        status: "pending",
        reminder_sent: false,
        verification_notes: "Security Deposit Fee"
      })
      .select("id")
      .single()

    if (error) throw error
    return data?.id ?? null
  }

  // Ensure the tenant has a persisted, unique per-tenant payment-portal token
  // (mirrors web/lib/payments/token.ts). This backs a unique payment link that
  // skips the grouped portal's phone-number verification and shows the tenant's
  // dues directly. Returns null on persistent failure.
  const ensurePaymentPortalToken = async (tenantId: number): Promise<string | null> => {
    const db = supabase as any
    const { data: existingRow, error: readErr } = await db
      .from("tenants_table")
      .select("payment_portal_token")
      .eq("id", tenantId)
      .maybeSingle()
    if (readErr) return null
    if (existingRow?.payment_portal_token) return existingRow.payment_portal_token as string

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    const gen = () => {
      let out = ""
      for (let i = 0; i < 22; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
      return out
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = gen()
      const { data, error } = await db
        .from("tenants_table")
        .update({ payment_portal_token: candidate })
        .is("payment_portal_token", null)
        .eq("id", tenantId)
        .select("payment_portal_token")
        .maybeSingle()
      if (error) {
        if (error.code === "23505") continue // unique collision — retry
        return null
      }
      if (data?.payment_portal_token) return data.payment_portal_token as string
      // Row not updated — token set concurrently; re-read.
      const { data: cur } = await db
        .from("tenants_table")
        .select("payment_portal_token")
        .eq("id", tenantId)
        .maybeSingle()
      return (cur?.payment_portal_token as string | undefined) ?? null
    }
    return null
  }

  // Build ONE tailored onboarding message covering exactly the intents the owner
  // selected (identity verification, security deposit, WhatsApp group invite).
  // A single greeting is used; when more than one intent is present they are
  // enumerated as a numbered checklist, otherwise the single item is written as
  // a short paragraph. Returns "" when no intent applies.
  const buildOnboardingMessage = (
    tenant: Tenant,
    opts: { identityLink?: string | null; includeDeposit?: boolean; depositPayUrl?: string | null; whatsappInviteLink?: string | null },
  ) => {
    const tenantName = (tenant.name || "").trim() || "Tenant"
    const pg = pgName ? pgName : "our PG"

    const items: string[] = []
    if (opts.identityLink) {
      items.push(
        `*Identity verification*\n` +
        `Your property owner has requested that you verify your identity. Please open this secure link to upload your identity document (encrypted and visible only to your property owner):\n${opts.identityLink}`
      )
    }
    if (opts.includeDeposit && tenant.deposit_amount && tenant.deposit_amount > 0) {
      // Per-tenant payment link (no phone-number verification). Fall back to the
      // grouped owner portal link only if a per-tenant token could not be created.
      const payUrl = opts.depositPayUrl || `https://staytraq.vercel.app/pay/${portalToken}`
      items.push(
        `*Security deposit payment*\n` +
        `A security deposit fee of ₹${tenant.deposit_amount} has been added to your account. Please pay it using this secure payment link:\n${payUrl}`
      )
    }
    if (opts.whatsappInviteLink) {
      items.push(
        `*Join our WhatsApp group*\n` +
        `Stay updated with announcements by joining our community group:\n${opts.whatsappInviteLink}`
      )
    }

    if (items.length === 0) return ""

    const greeting = `Hi ${tenantName},\n\nWelcome to ${pg}! 🎉`

    if (items.length === 1) {
      return `${greeting}\n\n${items[0]}\n\nThank you!`
    }

    const numbered = items.map((it, i) => `${i + 1}. ${it}`).join("\n\n")
    return (
      `${greeting}\n\n` +
      `Please complete the following to finish your onboarding:\n\n` +
      `${numbered}\n\n` +
      `Thank you!`
    )
  }

  const markIdentityMessageFailed = async (tenantId: number) => {
    try {
      await supabase
        .from("tenants_table")
        .update({ identity_msg_failed: true })
        .eq("id", tenantId)
    } catch {
      // Best-effort failure recording.
    }
  }

  const sendChatbotNotice = async (tenant: Tenant, message: string, sessionToken: string) => {
    const phone = normalizeWhatsAppNumber(tenant.mobile_number)
    if (!phone) return false

    const chatbotApiUrl = getChatbotApiUrl()
    const response = await fetch(`${chatbotApiUrl}/api/v1/send-whatsapp-notice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
        "bypass-tunnel-reminder": "true"
      },
      body: JSON.stringify({ phone, message })
    })

    return response.ok
  }

  // Drive the chatbot-enabled onboarding notices for a newly added tenant based
  // on the add-tenant form checkboxes (identity verification, deposit payment
  // record, WhatsApp invite link). All selected intents are delivered in a
  // SINGLE tailored message with one greeting — never separate welcome messages.
  // The deposit payment record (when requested with a positive amount) is always
  // created first so the message links to a real ledger entry. Identity-only
  // sends reuse the dedicated retrying sender for delivery reliability.
  const handleChatbotOnboardingNotices = async (
    tenant: Tenant,
    wantsIdentity: boolean,
    wantsDeposit: boolean,
    wantsInvite: boolean,
  ) => {
    // 1. Create the deposit payment record first (when requested).
    let depositPaymentId: number | null = null
    let depositPayUrl: string | null = null
    if (wantsDeposit) {
      try {
        depositPaymentId = await createSecurityDepositPayment(tenant)
      } catch (err) {
        console.error("Failed to create security deposit payment record:", err)
        showToast("Deposit Record Failed", "Couldn't create the deposit payment record.", "error")
      }
      // Per-tenant payment link (skips the grouped phone-number verification).
      const payToken = await ensurePaymentPortalToken(tenant.id)
      if (payToken) depositPayUrl = `https://staytraq.vercel.app/pay/${payToken}`
    }

    // 2. Identity-only: reuse the dedicated retrying identity sender.
    if (wantsIdentity && !wantsDeposit && !wantsInvite) {
      void requestTenantIdentity({
        id: tenant.id,
        name: tenant.name,
        mobile_number: tenant.mobile_number,
      })
      return
    }

    // 3. Resolve the identity link (when identity is one of several intents).
    let identityLink: string | null = null
    if (wantsIdentity) {
      const token = await ensureVerificationToken(supabase, tenant.id)
      if (token) {
        identityLink = buildVerificationLink(IDENTITY_PORTAL_BASE, token)
      } else {
        // Token generation failed — record it and drop the identity item rather
        // than blocking the rest of the message.
        await markIdentityMessageFailed(tenant.id)
      }
    }

    const whatsappInviteLink = wantsInvite ? (ownerSettings?.whatsapp_invite_link || null) : null

    // 4. Build the single tailored message; nothing to send if no item applies.
    const message = buildOnboardingMessage(tenant, {
      identityLink,
      includeDeposit: wantsDeposit,
      depositPayUrl,
      whatsappInviteLink,
    })
    if (!message) return

    const { data: sessionData } = await supabase.auth.getSession()
    const sessionToken = sessionData?.session?.access_token
    if (!sessionToken) {
      if (identityLink) await markIdentityMessageFailed(tenant.id)
      return
    }

    const sent = await sendChatbotNotice(tenant, message, sessionToken)
    if (!sent) {
      if (identityLink) await markIdentityMessageFailed(tenant.id)
      return
    }

    // 5. On success, mark the deposit reminder as sent.
    if (depositPaymentId) {
      await supabase.from("payments").update({ reminder_sent: true }).eq("id", depositPaymentId)
    }
  }

  const handleSendInvite = async () => {
    if (!justAddedTenant) return
    setIsSaving(true)
    try {
      // 1. Create deposit payment record if checked
      if (createDepositPayment && justAddedTenant.deposit_amount && justAddedTenant.deposit_amount > 0) {
        const currentMonth = new Date().getMonth() + 1
        const currentYear = new Date().getFullYear()
        
        const { error: payErr } = await supabase
          .from("payments")
          .insert({
            tenant_id: justAddedTenant.id,
            owner_id: user!.id,
            month: currentMonth,
            year: currentYear,
            rent_amount: justAddedTenant.deposit_amount,
            extra_charges: 0,
            total_amount: justAddedTenant.deposit_amount,
            due_date: justAddedTenant.join_date || new Date().toISOString().split("T")[0],
            status: "pending",
            verification_notes: "Security Deposit Fee"
          })
          
        if (payErr) throw payErr
      }

      // 2. Open WhatsApp Web/App
      const rawMobile = justAddedTenant.mobile_number || ""
      const cleanMobile = rawMobile.replace(/\D/g, "")
      
      let formattedPhone = cleanMobile
      if (cleanMobile.length === 10) {
        formattedPhone = `91${cleanMobile}`
      }
      
      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(customInviteMessage)}`
      
      setWhatsappInviteModalVisible(false)
      showToast("Invite Sent", "Redirecting to WhatsApp...", "success")
      
      try {
        await Linking.openURL(whatsappUrl)
      } catch (err) {
        Alert.alert("WhatsApp Error", "Could not open WhatsApp. Please ensure it is installed.")
      }
      
      setJustAddedTenant(null)
      setCustomInviteMessage("")
    } catch (err: any) {
      console.error("Error creating deposit invoice or redirecting:", err)
      Alert.alert("Error", err?.message || "Failed to process invitation")
    } finally {
      setIsSaving(false)
    }
  }

  const onRefresh = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setIsRefreshing(true)
    void fetchData(true)
  }, [fetchData])

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        // Defer the on-focus fetch past the navigation transition / first interactive
        // paint (Change A); cached/skeleton content renders first, then the load runs
        // once per focus and is cancelled on blur-before-run (no drop, no duplicate).
        const handle = scheduleAfterInteractions(() => {
          void fetchData(hasLoadedOnce.current)
        })
        return () => handle.cancel()
      }
    }, [user?.id, fetchData])
  )

  // Realtime subscription
  useEffect(() => {
    if (!pgId || !user?.id) return

    const channel = supabase
      .channel(`tenants_realtime_${pgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenants_table", filter: `owner_id=eq.${user.id}` },
        () => {
          void fetchData(true)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [pgId, user?.id, fetchData])

  const handleCallTenant = async (mobile: string | null) => {
    if (!mobile) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const telUrl = `tel:${mobile}`
    try {
      await Linking.openURL(telUrl)
    } catch (error) {
      Alert.alert(
        "Call Not Supported",
        `Calling is not available on this device/browser. Number: ${mobile}`
      )
    }
  }

  const openDetailSheet = async (tenant: Tenant) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSelectedTenant(tenant)
    setDetailModalVisible(true)
    setDetailDocUrls({})
    setActiveTab("details")
    setRevealIdentityCode(false)
    // Reset the identity document viewer so a previously opened tenant's
    // signed URLs / error state never leak into this tenant's view.
    setIdViewerVisible(false)
    setIdViewerSide("front")
    setIdViewerLoading(false)
    setIdFrontUrl(null)
    setIdBackUrl(null)
    setIdFrontError(false)
    setIdBackError(false)
    setPaymentHistory([])
    setHistoryLoading(true)

    const docs = (tenant.id_documents as any[]) || []
    if (docs.length > 0) {
      const urls: Record<string, string> = {}
      for (const doc of docs) {
        try {
          const { data, error } = await supabase.storage
            .from("staytraq_docs")
            .createSignedUrl(doc.url, 3600)
          if (!error && data?.signedUrl) {
            urls[doc.url] = data.signedUrl
          }
        } catch (err) {
          console.error("Failed to load thumbnail signed URL", err)
        }
      }
      setDetailDocUrls(urls)
    }

    try {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
      
      if (!error && data) {
        setPaymentHistory(data)
      }
    } catch (err) {
      console.error("Failed to load payment history:", err)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleChangeRoom = async (newRoomId: number, swapTenantId: number | null = null) => {
    if (!selectedTenant) return
    try {
      setIsUpdatingRoom(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const oldRoomId = selectedTenant.room_id

      if (swapTenantId) {
        // Swap scenario
        // Step 1: Update swap tenant to selected tenant's old room
        const { error: swapErr } = await supabase
          .from("tenants_table")
          .update({ room_id: oldRoomId })
          .eq("id", swapTenantId)
        if (swapErr) throw swapErr

        // Step 2: Update selected tenant to new room
        const { error: tenantErr } = await supabase
          .from("tenants_table")
          .update({ room_id: newRoomId })
          .eq("id", selectedTenant.id)
        if (tenantErr) throw tenantErr

        showToast("Rooms Swapped", `Successfully swapped rooms between ${selectedTenant.name} and the selected occupant.`, "success")
      } else {
        // Normal move scenario
        const { error: tenantErr } = await supabase
          .from("tenants_table")
          .update({ room_id: newRoomId })
          .eq("id", selectedTenant.id)
        if (tenantErr) throw tenantErr

        // Adjust occupied beds on rooms
        if (newRoomId !== oldRoomId) {
          // Increment new room
          const newRoom = rooms.find(r => r.id === newRoomId)
          if (newRoom) {
            await supabase
              .from("rooms_table")
              .update({ occupied_beds: Math.min(newRoom.occupied_beds + 1, newRoom.total_beds) })
              .eq("id", newRoomId)
          }
          // Decrement old room
          if (oldRoomId) {
            const oldRoom = rooms.find(r => r.id === oldRoomId)
            if (oldRoom) {
              await supabase
                .from("rooms_table")
                .update({ occupied_beds: Math.max(oldRoom.occupied_beds - 1, 0) })
                .eq("id", oldRoomId)
            }
          }
        }

        showToast("Room Changed", `${selectedTenant.name} has been reassigned successfully.`, "success")
      }

      setChangeRoomModalVisible(false)
      setChangeRoomSelectedRoomId(null)
      setChangeRoomSwapTenantId(null)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      
      // Re-fetch everything and update selected tenant details
      await fetchData()
      
      const { data: refreshedTenant, error: fetchErr } = await supabase
        .from("tenants_table")
        .select("*, rooms_table(id, room_number, rent_amount)")
        .eq("id", selectedTenant.id)
        .single()
      
      if (!fetchErr && refreshedTenant) {
        setSelectedTenant(refreshedTenant)
      }
    } catch (err: any) {
      console.error(err)
      Alert.alert("Error", err.message || "Could not change room.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setIsUpdatingRoom(false)
    }
  }

  useEffect(() => {
    if (!tenantParam || loading || tenants.length === 0) return
    const id = Number(tenantParam)
    if (!Number.isFinite(id)) return
    const match = tenants.find((t) => t.id === id)
    if (match) {
      setStatusFilter("all")
      setSearchQuery("")
      openDetailSheet(match)
      router.setParams({ tenant: undefined })
    }
  }, [tenantParam, loading, tenants])

  useEffect(() => {
    if (statusParam) {
      setStatusFilter(statusParam)
      router.setParams({ status: undefined })
    }
  }, [statusParam])

  useEffect(() => {
    if (searchParam) {
      setSearchQuery(searchParam)
      if (!statusParam) {
        setStatusFilter("all")
      }
      router.setParams({ search: undefined })
    }
  }, [searchParam, statusParam])

  const openAddModal = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditingTenant(null)
    setName("")
    setMobileNumber("")
    setEmail("")
    setJoinDate(new Date().toISOString().split("T")[0])
    setRentDueDay((ownerSettings?.rent_due_day || 5).toString())
    setDepositAmount((ownerSettings?.default_deposit_fees ?? 10000).toString())
    setExtraCharges("0")
    setSelectedRoomId("")
    setTenantStatus("active")
    setNotes("")
    setRoomSearchQuery("")
    setSelectedIdType("")
    setRequestIdentityFromTenant(false)
    setCreateDepositPayment(false)
    setRequestDepositPayment(false)
    setIncludeWhatsappInvite(false)
    setIdDocs([])
    setIsSaving(false)
    setOpenDropdown(null)
    setError(null)
    setFormModalVisible(true)
  }

  const openEditModal = (tenant: Tenant) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditingTenant(tenant)
    setName(tenant.name || "")
    setMobileNumber(tenant.mobile_number || "")
    setEmail(tenant.email || "")
    setJoinDate(tenant.join_date || "")
    setRentDueDay((tenant.rent_due_day || 5).toString())
    setDepositAmount((tenant.deposit_amount || 0).toString())
    setExtraCharges((tenant.extra_charges || 0).toString())
    setSelectedRoomId(tenant.room_id ? tenant.room_id.toString() : "")
    setTenantStatus(tenant.status)
    setNotes(tenant.notes || "")
    setRoomSearchQuery("")
    setSelectedIdType("")
    setRequestIdentityFromTenant(false)
    setRequestDepositPayment(false)
    setIncludeWhatsappInvite(false)
    
    // Clear/initialize documents instantly so modal opens without lag
    const docs = (tenant.id_documents as any[]) || []
    const initialDocs = docs.map((d) => ({
      type: d.type,
      url: d.url,
      uri: undefined as string | undefined,
      name: d.url.split("/").pop() || "document.jpg",
      mimeType: "image/jpeg",
    }))
    setIdDocs(initialDocs)
    
    setIsSaving(false)
    setOpenDropdown(null)
    setError(null)
    setFormModalVisible(true) // Open edit form overlay immediately

    // Fetch signed URLs asynchronously in the background
    if (docs.length > 0) {
      void (async () => {
        const mappedDocs = []
        for (const d of docs) {
          let signedUrl = ""
          try {
            const { data, error } = await supabase.storage
              .from("staytraq_docs")
              .createSignedUrl(d.url, 3600)
            if (!error && data?.signedUrl) {
              signedUrl = data.signedUrl
            }
          } catch (err) {
            console.error("Failed to load edit signed URL", err)
          }
          mappedDocs.push({
            type: d.type,
            url: d.url,
            uri: signedUrl || undefined,
            name: d.url.split("/").pop() || "document.jpg",
            mimeType: "image/jpeg",
          })
        }
        setIdDocs(mappedDocs)
      })()
    }
  }

  const handleQuickSettleDues = async () => {
    if (!selectedTenant) return
    try {
      setIsSettlingDues(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      const unpaidIds = paymentHistory
        .filter(p => p.status === "pending" || p.status === "late" || p.status === "submitted")
        .map(p => p.id)

      if (unpaidIds.length === 0) return

      const now = new Date().toISOString()
      
      // Update in payments table
      const { error } = await supabase
        .from("payments")
        .update({
          status: "paid",
          paid_at: now,
          verified_at: now,
          payment_method: "Cash"
        })
        .in("id", unpaidIds)

      if (error) throw error

      // Insert audit logs
      for (const payId of unpaidIds) {
        await supabase.from("payment_audit_log").insert({
          payment_id: payId,
          owner_id: user!.id,
          action: "proof_approved",
          old_status: "pending",
          new_status: "paid",
          notes: "Outstanding dues settled during checkout/move-out flow"
        })
      }

      showToast("Dues Settled", `All unpaid dues have been marked as paid successfully.`, "success")
      
      // Update local state
      setPaymentHistory(prev =>
        prev.map(p => unpaidIds.includes(p.id) ? { ...p, status: "paid", paid_at: now, verified_at: now, payment_method: "Cash" } : p)
      )
      
      // Recalculate refund input to default to full security deposit since dues are cleared
      setDepositRefundAmount((selectedTenant.deposit_amount || 0).toString())

    } catch (err: any) {
      console.error("Failed to settle dues:", err)
      Alert.alert("Error", err.message || "Failed to settle outstanding dues.")
    } finally {
      setIsSettlingDues(false)
    }
  }

  // Compute upcoming rent payment records between today and the move-out date
  const computeUpcomingPayments = useCallback(() => {
    if (!selectedTenant || !moveOutDate) return
    const rentDueDay = selectedTenant.rent_due_day
    if (!rentDueDay) return

    const today = new Date()
    const exitDate = new Date(moveOutDate)
    const upcoming: any[] = []

    // Start from next month's due date
    let current = new Date(today.getFullYear(), today.getMonth(), rentDueDay)
    if (current <= today) {
      current.setMonth(current.getMonth() + 1)
    }

    while (current <= exitDate) {
      const month = current.getMonth() + 1
      const year = current.getFullYear()

      // Check if this record already exists in paymentHistory
      const exists = paymentHistory.some(
        p => p.month === month && p.year === year
      )

      if (!exists) {
        const rentAmount = selectedTenant.rooms_table?.rent_amount || 0
        const extraChargesAmt = selectedTenant.extra_charges || 0
        upcoming.push({
          id: null, // Not yet created — marker for upcoming
          month,
          year,
          rent_amount: rentAmount,
          extra_charges: extraChargesAmt,
          total_amount: rentAmount + extraChargesAmt,
          due_date: current.toISOString().split("T")[0],
          status: "upcoming",
          isUpcoming: true,
        })
      }

      current.setMonth(current.getMonth() + 1)
    }

    setUpcomingPayments(upcoming)
  }, [selectedTenant, moveOutDate, paymentHistory])

  const handleConfirmMoveOut = async () => {
    if (!selectedTenant || !user?.id) return
    try {
      setIsCheckingOut(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      const todayStr = new Date().toISOString().split("T")[0]
      const status: Tenant["status"] = moveOutDate > todayStr ? "notice_period" : "move_out"
      const refundAmt = parseFloat(depositRefundAmount) || 0

      // Build tenant update payload
      const tenantUpdate: any = {
        status,
        exit_date: moveOutDate,
        deposit_refund_amount: refundAmt,
        room_id: status === "move_out" ? null : selectedTenant.room_id,
      }

      // Handle deposit deduction
      if (selectedDeductionPayment && refundAmt > 0 && !deductionLocked) {
        const previousDeductionPaymentId = selectedTenant.deduction_payment_id
        const previousOriginalAmount = selectedTenant.original_payment_amount

        // 1. Restore previous deduction if switching to a different payment
        if (previousDeductionPaymentId && previousOriginalAmount !== null && previousDeductionPaymentId !== selectedDeductionPayment.id) {
          await supabase
            .from("payments")
            .update({
              rent_amount: previousOriginalAmount,
              total_amount: previousOriginalAmount + (paymentHistory.find(p => p.id === previousDeductionPaymentId)?.extra_charges || 0),
              verification_notes: null,
            })
            .eq("id", previousDeductionPaymentId)

          await supabase.from("payment_audit_log").insert({
            payment_id: previousDeductionPaymentId,
            owner_id: user.id,
            action: "deposit_deduction_reversed",
            notes: `Deposit deduction reversed. Amount restored to ₹${previousOriginalAmount}`,
          })
        }

        // 2. Apply deduction to the selected payment
        if (selectedDeductionPayment.id) {
          // Existing payment record — update directly
          const originalRent = selectedDeductionPayment.rent_amount
          const originalTotal = selectedDeductionPayment.total_amount
          const newRent = Math.max(originalRent - refundAmt, 0)
          const newTotal = Math.max(originalTotal - refundAmt, 0)

          await supabase
            .from("payments")
            .update({
              rent_amount: newRent,
              total_amount: newTotal,
              verification_notes: `₹${refundAmt} deducted from deposit refund`,
            })
            .eq("id", selectedDeductionPayment.id)

          await supabase.from("payment_audit_log").insert({
            payment_id: selectedDeductionPayment.id,
            owner_id: user.id,
            action: "deposit_deduction",
            notes: `₹${refundAmt} deducted from deposit. Original: ₹${originalTotal}, New: ₹${newTotal}`,
          })

          // Save deduction tracking on tenant
          tenantUpdate.deduction_payment_id = selectedDeductionPayment.id
          tenantUpdate.original_payment_amount = originalRent
          tenantUpdate.pending_deposit_deduction = null
          tenantUpdate.deduction_target_month = null
          tenantUpdate.deduction_target_year = null
        } else {
          // Upcoming payment (not yet created) — store pending deduction for edge function
          tenantUpdate.pending_deposit_deduction = refundAmt
          tenantUpdate.deduction_target_month = selectedDeductionPayment.month
          tenantUpdate.deduction_target_year = selectedDeductionPayment.year
          tenantUpdate.deduction_payment_id = null
          tenantUpdate.original_payment_amount = null
        }
      } else if (!selectedDeductionPayment && !deductionLocked) {
        // No deduction selected — clear any previous tracking
        tenantUpdate.deduction_payment_id = null
        tenantUpdate.original_payment_amount = null
        tenantUpdate.pending_deposit_deduction = null
        tenantUpdate.deduction_target_month = null
        tenantUpdate.deduction_target_year = null
      }

      // Update tenant record
      const { error: tenantErr } = await supabase
        .from("tenants_table")
        .update(tenantUpdate)
        .eq("id", selectedTenant.id)

      if (tenantErr) throw tenantErr

      // If they are checking out immediately (status === 'move_out') and were in a room, vacate the room bed
      if (status === "move_out" && selectedTenant.room_id) {
        const { data: roomData } = await supabase
          .from("rooms_table")
          .select("occupied_beds")
          .eq("id", selectedTenant.room_id)
          .single()

        if (roomData) {
          await supabase
            .from("rooms_table")
            .update({ occupied_beds: Math.max(roomData.occupied_beds - 1, 0) })
            .eq("id", selectedTenant.room_id)
        }
      }

      setMoveOutModalVisible(false)
      setDetailModalVisible(false)
      setDeductionMode(false)
      setSelectedDeductionPayment(null)
      
      if (status === "notice_period") {
        showToast("Notice Period Scheduled", `${selectedTenant.name} is now in notice period.`, "success")
      } else {
        showToast("Move Out Completed", `${selectedTenant.name} has been successfully checked out.`, "success")
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      void fetchData()
    } catch (err: any) {
      console.error("Checkout error:", err)
      Alert.alert("Error", err.message || "Could not complete checkout.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setIsCheckingOut(false)
    }
  }

  const rentDueDayOptions = useMemo(() => {
    return Array.from({ length: 28 }, (_, i) => {
      const day = i + 1
      const suffix = day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"
      return {
        value: String(day),
        shortLabel: `${day}${suffix}`,
        listLabel: `${day}${suffix} of every month`,
      }
    })
  }, [])

  const getDocPreviewUri = (doc: any) => {
    if (doc.uri) return doc.uri
    if (doc.url) {
      return supabase.storage.from("staytraq_docs").getPublicUrl(doc.url).data.publicUrl
    }
    return null
  }

  const pickIdImage = async (useCamera: boolean) => {
    if (!selectedIdType) {
      Alert.alert("Required", "Please select an ID type first.")
      return
    }

    try {
      let result
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert("Permission Denied", "Camera permission is required to take photos.")
          return
        }
        result = await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          quality: 0.8,
        })
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert("Permission Denied", "Photo library permission is required to choose images.")
          return
        }
        result = await ImagePicker.launchImageLibraryAsync({
          allowsEditing: false,
          quality: 0.8,
        })
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0]
        const docName = asset.fileName || `doc_${Date.now()}.jpg`
        const mimeType = asset.mimeType || "image/jpeg"
        
        setIdDocs((prev) => [
          ...prev,
          {
            type: selectedIdType,
            uri: asset.uri,
            name: docName,
            mimeType,
            isNew: true,
          },
        ])
        setSelectedIdType("") // Reset type picker
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
    } catch (err) {
      console.error("Image pick error:", err)
      Alert.alert("Error", "Failed to select document image.")
    }
  }

  const requestTenantIdentity = async (tenant: { id: number; name: string | null; mobile_number: string | null }) => {
    try {
      // Ensure a persisted, unique verification token before any link is built (Req 2.1, 2.2, 2.6).
      const token = await ensureVerificationToken(supabase, tenant.id)
      if (!token) {
        // Token generation/persistence failed: record the failure and do not
        // construct or send a link (Req 2.6). The flag stays true.
        try {
          await supabase
            .from("tenants_table")
            .update({ identity_msg_failed: true })
            .eq("id", tenant.id)
        } catch {
          // Best-effort failure recording.
        }
        return
      }

      // Build the verification link (Req 2.4) and send it over WhatsApp (Req 3.1).
      const link = buildVerificationLink(IDENTITY_PORTAL_BASE, token)
      const { data: sessionData } = await supabase.auth.getSession()
      const sessionToken = sessionData?.session?.access_token
      if (!sessionToken) {
        try {
          await supabase
            .from("tenants_table")
            .update({ identity_msg_failed: true })
            .eq("id", tenant.id)
        } catch {
          // Best-effort failure recording.
        }
        return
      }

      // Pass the supabase client as deps.db so delivery failures are recorded
      // (no mobile / unsendable / all attempts failed). The flag is never cleared here.
      await sendIdentityRequest(
        { id: tenant.id, name: tenant.name, mobile_number: tenant.mobile_number },
        link,
        sessionToken,
        { db: supabase, pgName }
      )
    } catch (e) {
      console.error("Identity request failed:", e)
    }
  }

  const handleSaveTenant = async () => {
    if (!user?.id || !pgId) return

    if (!name.trim()) {
      setError("Name is required")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    if (!selectedRoomId) {
      setError("Room assignment is required")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    if (isSaving) return

    try {
      setIsSaving(true)
      setError(null)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      let postSaveToastTitle: string | null = null
      let postSaveToastMessage: string | null = null
      let postSaveToastType: "success" | "error" | "info" | "warning" = "success"
      
      const targetRoomId = selectedRoomId ? parseInt(selectedRoomId, 10) : null
      let oldRoomId: number | null = null
      if (editingTenant) {
        oldRoomId = editingTenant.room_id
      }

      // 1. Capacity check
      if (targetRoomId && targetRoomId !== oldRoomId) {
        const { data: roomCheck, error: roomCheckErr } = await supabase
          .from("rooms_table")
          .select("total_beds, occupied_beds")
          .eq("id", targetRoomId)
          .single()
        if (roomCheckErr) throw roomCheckErr
        const available = (roomCheck.total_beds || 0) - (roomCheck.occupied_beds || 0)
        if (available <= 0) {
          setError("This room has no available beds. Please select another room.")
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          setIsSaving(false)
          return
        }
      }

      // 2. Upload ID documents to Supabase Storage
      const uploadedDocs = []
      for (const doc of idDocs) {
        if (!doc.isNew) {
          uploadedDocs.push({
            type: doc.type,
            url: doc.url
          })
          continue
        }

        try {
          const fileExt = doc.name.split('.').pop() || 'jpg'
          const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
          
          const base64 = await FileSystem.readAsStringAsync(doc.uri!, {
            encoding: 'base64',
          })
          const arrayBuffer = decodeBase64(base64)

          const { error: uploadError } = await supabase.storage
            .from('staytraq_docs')
            .upload(fileName, arrayBuffer, {
              contentType: doc.mimeType || 'image/jpeg',
              upsert: true
            })
            
          if (uploadError) throw uploadError
          
          uploadedDocs.push({
            type: doc.type,
            url: fileName
          })
        } catch (e: any) {
          console.error("Upload error:", e)
          setError(`Failed to upload ID document (${doc.type}): ${e.message}`)
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          setIsSaving(false)
          return
        }
      }

      const todayStr = new Date().toISOString().split("T")[0]
      const calculatedStatus: Tenant["status"] = (joinDate && joinDate > todayStr) ? "pending_move_in" : "active"
      const finalStatus: Tenant["status"] = editingTenant 
        ? ((editingTenant.status === "active" || editingTenant.status === "pending_move_in") ? calculatedStatus : editingTenant.status)
        : calculatedStatus

      const tenantPayload = {
        name: name.trim(),
        mobile_number: mobileNumber.trim() || null,
        email: email.trim() || null,
        join_date: joinDate || null,
        rent_due_day: parseInt(rentDueDay, 10) || 5,
        deposit_amount: parseInt(depositAmount, 10) || 0,
        extra_charges: parseInt(extraCharges, 10) || 0,
        room_id: targetRoomId,
        status: finalStatus,
        notes: notes.trim() || null,
        owner_id: user.id,
        pg_id: pgId,
        id_documents: uploadedDocs
      }

      if (editingTenant) {
        // Update tenant
        const { error: editErr } = await supabase
          .from("tenants_table")
          .update(tenantPayload)
          .eq("id", editingTenant.id)

        if (editErr) throw editErr
      } else {
        // Insert tenant
        const identityRequestFlag = deriveIdentityRequestFlag(chatbotEnabled, requestIdentityFromTenant)
        const insertPayload = {
          ...tenantPayload,
          identity_request_flag: identityRequestFlag,
          ignore_identity_flag: false,
          verification_status: "Not_Started",
        }

        const { data: insertedData, error: insertErr } = await supabase
          .from("tenants_table")
          .insert(insertPayload)
          .select()
          .single()

        // Req 1.9: on insert failure, no partial record is created (single insert
        // is atomic), retain the owner's entered form values (do not reset/close
        // the form), show an error message, and do not proceed.
        if (insertErr || !insertedData) {
          console.error(insertErr)
          setError("Tenant creation failed. Please try again.")
          showToast(
            "Tenant Creation Failed",
            "We couldn't create the tenant. Your details have been kept—please try again.",
            "error"
          )
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          setIsSaving(false)
          return
        }

        // On success, drive onboarding notices. Chatbot-enabled owners use the
        // in-form checkboxes (identity / deposit) and receive a consolidated
        // message with no follow-up popup. Non-chatbot owners keep the manual
        // WhatsApp invite popup.
        if (insertedData) {
          setJustAddedTenant(insertedData)

          if (chatbotEnabled) {
            const wantsIdentity = identityRequestFlag
            const wantsDeposit =
              requestDepositPayment &&
              !!insertedData.deposit_amount &&
              insertedData.deposit_amount > 0
            const wantsInvite = includeWhatsappInvite && !!ownerSettings?.whatsapp_invite_link

            // Run without awaiting so the form closes promptly; delivery/record
            // failures are surfaced via toast / recorded on the tenant.
            void handleChatbotOnboardingNotices(insertedData, wantsIdentity, wantsDeposit, wantsInvite)
          } else {
            // Non-chatbot owners: manual WhatsApp invite popup (unchanged).
            setCreateDepositPayment(insertedData.deposit_amount ? insertedData.deposit_amount > 0 : false)

            // Generate message text dynamically
            let msg = `Hello ${insertedData.name || "Occupant"}! Welcome to ${pgName ? pgName : "our PG"}.`
            if (ownerSettings?.whatsapp_invite_link) {
              msg += ` Please join our WhatsApp group using this link: ${ownerSettings.whatsapp_invite_link}`
            }
            if (insertedData.deposit_amount && insertedData.deposit_amount > 0) {
              const portalUrl = `https://staytraq.vercel.app/pay/${portalToken}`
              msg += `\n\nAdditionally, please process your security deposit fee of ₹${insertedData.deposit_amount} via our secure payment portal: ${portalUrl}`
            }
            setCustomInviteMessage(msg)
            setWhatsappInviteModalVisible(true)
          }
        }
      }

      // Update occupied beds on the rooms if room assignment changed
      if (targetRoomId !== oldRoomId) {
        // Increment new room occupied beds
        if (targetRoomId) {
          const matchedRoom = rooms.find(r => r.id === targetRoomId)
          if (matchedRoom) {
            await supabase
              .from("rooms_table")
              .update({ occupied_beds: Math.min(matchedRoom.occupied_beds + 1, matchedRoom.total_beds) })
              .eq("id", targetRoomId)
          }
        }
        // Decrement old room occupied beds
        if (oldRoomId) {
          const matchedRoom = rooms.find(r => r.id === oldRoomId)
          if (matchedRoom) {
            await supabase
              .from("rooms_table")
              .update({ occupied_beds: Math.max(matchedRoom.occupied_beds - 1, 0) })
              .eq("id", oldRoomId)
          }
        }
      }

      setFormModalVisible(false)
      if (editingTenant) {
        setDetailModalVisible(false)
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      if (editingTenant) {
        showToast("Profile Updated", `Profile for ${name} has been successfully updated.`, "success")
      } else {
        showToast("Occupant Added", `Occupant ${name} has been successfully added to directory.`, "success")
      }
      void fetchData()
    } catch (err: any) {
      console.error(err)
      setError(err?.message || "An error occurred while saving the tenant")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setIsSaving(false)
    }
  }

  const requestDeleteTenant = (tenantId: number, roomId: number | null) => {
    setTenantToDelete({ id: tenantId, roomId })
    setConfirmModalVisible(true)
  }

  const confirmDeleteTenant = async () => {
    if (!tenantToDelete) return
    setConfirmModalVisible(false)
    await handleDeleteTenant(tenantToDelete.id, tenantToDelete.roomId)
    setTenantToDelete(null)
  }

  // Document viewer (Req 17): opens a viewer initially showing the FRONT image
  // and fetches owner-scoped signed URLs for the stored identity images from the
  // private `identity_documents` bucket (Reqs 17.1, 17.2, 18.3, 18.4). The viewer
  // is independent of the staytraq_docs viewer so opening/closing it leaves the
  // identity section unchanged (Req 17.5). Per-side error state lets one image
  // show an inline placeholder while the other still displays (Req 17.6).
  const openIdentityViewer = async (tenant: Tenant) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    const frontPath = typeof tenant.id_front_path === "string" ? tenant.id_front_path.trim() : ""
    const backPath = typeof tenant.id_back_path === "string" ? tenant.id_back_path.trim() : ""

    // Always start on the front image (Req 17.2).
    setIdViewerSide("front")
    setIdFrontUrl(null)
    setIdBackUrl(null)
    setIdFrontError(false)
    setIdBackError(false)
    setIdViewerLoading(true)
    setIdViewerVisible(true)

    const signOne = async (path: string): Promise<{ url: string | null; error: boolean }> => {
      if (!path) return { url: null, error: false }
      try {
        const { data, error } = await supabase.storage
          .from("identity_documents")
          .createSignedUrl(path, 3600)
        if (!error && data?.signedUrl) {
          return { url: data.signedUrl, error: false }
        }
        return { url: null, error: true }
      } catch (err) {
        console.error("Error creating identity document signed URL:", err)
        return { url: null, error: true }
      }
    }

    const [front, back] = await Promise.all([signOne(frontPath), signOne(backPath)])
    // A path that exists but could not be signed is surfaced as a load error so
    // the other side can still display (Req 17.6).
    setIdFrontUrl(front.url)
    setIdFrontError(front.error)
    setIdBackUrl(back.url)
    setIdBackError(back.error)
    setIdViewerLoading(false)
  }

  // "Ignore identity" action (Req 15): stops daily identity reminders for one
  // tenant. Persists ignore_identity_flag=true and sets verification_status to
  // "Ignored" when not Verified, scoped to the selected tenant only. On failure
  // the previous flag/status are retained (no local mutation) and an error toast
  // is shown.
  const confirmIgnoreIdentity = async () => {
    setIgnoreConfirmVisible(false)
    if (!selectedTenant) return

    const target = selectedTenant
    const prevState = {
      identity_request_flag: !!target.identity_request_flag,
      verification_status: target.verification_status || "Not_Started",
      ignore_identity_flag: !!target.ignore_identity_flag,
    }
    const nextState = applyIgnore(prevState)

    setIsIgnoringIdentity(true)
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const { error: updateError } = await supabase
        .from("tenants_table")
        .update({
          ignore_identity_flag: nextState.ignore_identity_flag,
          verification_status: nextState.verification_status,
        })
        .eq("id", target.id)

      if (updateError) throw updateError

      // Persisted: reflect the change locally on the selected tenant and the list.
      setSelectedTenant((prev) =>
        prev && prev.id === target.id
          ? { ...prev, ignore_identity_flag: nextState.ignore_identity_flag, verification_status: nextState.verification_status }
          : prev
      )
      setTenants((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? { ...t, ignore_identity_flag: nextState.ignore_identity_flag, verification_status: nextState.verification_status }
            : t
        )
      )
      showToast("Reminders stopped", "Identity reminders stopped for this occupant.", "success")
    } catch (err) {
      // Retain previous flag/status: do not mutate local state (Req 15.6).
      console.error("Error ignoring tenant identity:", err)
      showToast("Action failed", "Could not stop identity reminders. Please try again.", "error")
    } finally {
      setIsIgnoringIdentity(false)
    }
  }

  // Manual identity upload (owner uploads document image(s) on the tenant's
  // behalf). Stores up to two images (front, optional back) in the private
  // `identity_documents` bucket at {owner_id}/{tenant_id}/{side}.jpg and marks
  // the tenant Verified. Reflects the change on the selected tenant + list.
  const handleManualIdentityUpload = async (tenant: Tenant) => {
    if (isManualUploading || !user?.id) return
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Photo library permission is required to choose images.")
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 2,
      })
      if (result.canceled || !result.assets || result.assets.length === 0) return

      setIsManualUploading(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      const assets = result.assets.slice(0, 2)
      const sides: ("front" | "back")[] = ["front", "back"]
      let frontPath: string | null = null
      let backPath: string | null = null

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i]
        const side = sides[i]
        const path = `${user.id}/${tenant.id}/${side}.jpg`
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" })
        const arrayBuffer = decodeBase64(base64)
        const { error: uploadError } = await supabase.storage
          .from("identity_documents")
          .upload(path, arrayBuffer, { contentType: asset.mimeType || "image/jpeg", upsert: true })
        if (uploadError) throw uploadError
        if (side === "front") frontPath = path
        else backPath = path
      }

      const update: Partial<Tenant> = {
        id_front_path: frontPath,
        id_back_path: backPath,
        verification_status: "Verified",
      }
      const { error: updErr } = await supabase
        .from("tenants_table")
        .update(update as never)
        .eq("id", tenant.id)
      if (updErr) throw updErr

      setSelectedTenant((prev) => (prev && prev.id === tenant.id ? { ...prev, ...update } : prev))
      setTenants((prev) => prev.map((t) => (t.id === tenant.id ? { ...t, ...update } : t)))
      setIdentityResetTenantId((prev) => (prev === tenant.id ? null : prev))
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      showToast("Documents Uploaded", "Identity documents saved and marked verified.", "success")
    } catch (e: any) {
      console.error("Manual identity upload failed:", e)
      Alert.alert("Upload Failed", e?.message || "Could not upload identity documents.")
    } finally {
      setIsManualUploading(false)
    }
  }

  // Delete the tenant's stored identity documents completely: removes the bucket
  // objects and clears the stored paths/code, resetting verification so the owner
  // can choose to request again (daily) or upload manually.
  const handleDeleteIdentityDocs = async (tenant: Tenant) => {
    if (isDeletingIdentity) return
    setIsDeletingIdentity(true)
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      const paths: string[] = []
      if (typeof tenant.id_front_path === "string" && tenant.id_front_path.trim()) paths.push(tenant.id_front_path)
      if (typeof tenant.id_back_path === "string" && tenant.id_back_path.trim()) paths.push(tenant.id_back_path)
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from("identity_documents").remove(paths)
        // Best-effort: a storage removal failure should not block clearing the record.
        if (rmErr) console.error("Error removing identity documents:", rmErr)
      }

      const update: Partial<Tenant> = {
        id_front_path: null,
        id_back_path: null,
        identity_type: null,
        aadhaar_number: null,
        pan_code: null,
        verification_status: "Not_Started",
        identity_request_flag: false,
        ignore_identity_flag: false,
      }
      const { error: updErr } = await supabase
        .from("tenants_table")
        .update(update as never)
        .eq("id", tenant.id)
      if (updErr) throw updErr

      setSelectedTenant((prev) => (prev && prev.id === tenant.id ? { ...prev, ...update } : prev))
      setTenants((prev) => prev.map((t) => (t.id === tenant.id ? { ...t, ...update } : t)))
      setIdentityResetTenantId(tenant.id)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      showToast("Documents Deleted", "Identity documents removed. Choose to request again or upload.", "success")
    } catch (e: any) {
      console.error("Delete identity docs failed:", e)
      Alert.alert("Delete Failed", e?.message || "Could not delete identity documents.")
    } finally {
      setIsDeletingIdentity(false)
    }
  }

  // Re-enable daily identity requests for a tenant and send one immediately.
  const handleRequestIdentityAgain = async (tenant: Tenant) => {
    if (isRequestingIdentityAgain) return
    setIsRequestingIdentityAgain(true)
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const update: Partial<Tenant> = {
        identity_request_flag: true,
        ignore_identity_flag: false,
        verification_status: "Not_Started",
      }
      const { error: updErr } = await supabase
        .from("tenants_table")
        .update(update as never)
        .eq("id", tenant.id)
      if (updErr) throw updErr

      setSelectedTenant((prev) => (prev && prev.id === tenant.id ? { ...prev, ...update } : prev))
      setTenants((prev) => prev.map((t) => (t.id === tenant.id ? { ...t, ...update } : t)))
      setIdentityResetTenantId((prev) => (prev === tenant.id ? null : prev))
      // Send a request now; daily reminders resume via the request flag.
      void requestTenantIdentity({ id: tenant.id, name: tenant.name, mobile_number: tenant.mobile_number })
      showToast("Identity Requested", "A verification request was sent; daily reminders resumed.", "success")
    } catch (e: any) {
      console.error("Request identity again failed:", e)
      Alert.alert("Error", e?.message || "Could not request identity again.")
    } finally {
      setIsRequestingIdentityAgain(false)
    }
  }

  const handleDeleteTenant = async (tenantId: number, roomId: number | null) => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      
      // Soft delete: Mark tenant as deleted instead of removing from database
      const { error: softDeleteErr } = await (supabase as any)
        .from("tenants_table")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", tenantId)

      if (softDeleteErr) throw softDeleteErr

      // Decrement room occupied beds if tenant was assigned to a room
      if (roomId) {
        const matchedRoom = rooms.find(r => r.id === roomId)
        if (matchedRoom) {
          await supabase
            .from("rooms_table")
            .update({ occupied_beds: Math.max(matchedRoom.occupied_beds - 1, 0) })
            .eq("id", roomId)
        }
      }

      setDetailModalVisible(false)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      showToast("Occupant Deleted", "Occupant has been removed from your directory. All payment records are preserved.", "success")
      void fetchData()
    } catch (err: any) {
      console.error(err)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert("Deletion Error", err.message || "Failed to delete occupant.")
    }
  }

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

  const getWhatsAppMessage = (payment: any, portalTokenStr: string) => {
    const tenantName = selectedTenant?.name || "Tenant"
    const amount = (payment.rent_amount || 0) + (payment.extra_charges || 0)
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
    if (!selectedPaymentDetail) return
    
    if (!selectedPaymentPortalToken) {
      showToast("Generating link...", "Payment portal link is being fetched/created. Please try again.", "info")
      return
    }

    const phone = selectedTenant?.mobile_number
    if (!phone) {
      Alert.alert("Missing Phone Number", "This tenant does not have a registered mobile number.")
      return
    }

    const formattedPhone = formatWhatsAppNumber(phone)
    const message = getWhatsAppMessage(selectedPaymentDetail, selectedPaymentPortalToken)

    setIsSendingWhatsAppPayment(true)
    try {
      if (chatbotEnabled) {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        const token = currentSession?.access_token
        if (!token) {
          throw new Error("User session not found. Please log in again.")
        }
        
        const chatbotApiUrl = getChatbotApiUrl()
        
        console.log("[WhatsApp Reminder Debug - Tenants] Initiating direct send:")
        console.log("  - URL:", `${chatbotApiUrl}/api/v1/send-whatsapp-notice`)
        console.log("  - Phone:", formattedPhone)
        console.log("  - Token present:", !!token)
        
        const response = await fetch(`${chatbotApiUrl}/api/v1/send-whatsapp-notice`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "bypass-tunnel-reminder": "true"
          },
          body: JSON.stringify({
            phone: formattedPhone,
            message: message
          })
        })
        
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.detail || "Failed to send message via chatbot server.")
        }
        
        showToast("Success", "Reminder sent successfully via WhatsApp.", "success")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } else {
        const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
        await Linking.openURL(url)
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      }
    } catch (err: any) {
      console.error("[WhatsApp Reminder Debug - Tenants] Error details:", err)
      Alert.alert("Error", err.message || "Could not generate reminder link or open WhatsApp.")
    } finally {
      setIsSendingWhatsAppPayment(false)
    }
  }

  const handleDirectWhatsAppChat = async (phone: string | null | undefined, tenantName: string) => {
    if (!phone) {
      Alert.alert("Missing Phone Number", "This tenant does not have a registered mobile number.")
      return
    }

    const formattedPhone = formatWhatsAppNumber(phone)
    const message = `Hi ${tenantName}, hope you are doing well! This is a message from the property management team regarding your tenancy. Please let us know if you have any questions or need assistance.`

    setIsSendingWhatsAppTenant(true)
    try {
      if (chatbotEnabled) {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        const token = currentSession?.access_token
        if (!token) {
          throw new Error("User session not found. Please log in again.")
        }

        const chatbotApiUrl = getChatbotApiUrl()

        console.log("[WhatsApp Direct Chat Debug - Tenants] Initiating direct send:")
        console.log("  - URL:", `${chatbotApiUrl}/api/v1/send-whatsapp-notice`)
        console.log("  - Phone:", formattedPhone)
        console.log("  - Token present:", !!token)

        const response = await fetch(`${chatbotApiUrl}/api/v1/send-whatsapp-notice`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "bypass-tunnel-reminder": "true"
          },
          body: JSON.stringify({
            phone: formattedPhone,
            message: message
          })
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.detail || "Failed to send message via chatbot server.")
        }

        showToast("Success", "Message sent successfully via WhatsApp.", "success")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } else {
        const url = `https://wa.me/${formattedPhone}`
        await Linking.openURL(url)
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      }
    } catch (err: any) {
      console.error("[WhatsApp Direct Chat Debug - Tenants] Error details:", err)
      Alert.alert("Error", err.message || "Could not send message or open WhatsApp.")
    } finally {
      setIsSendingWhatsAppTenant(false)
    }
  }

  const requestDeletePayment = (paymentId: number) => {
    setDeletePaymentId(paymentId)
    setDeletePaymentConfirmVisible(true)
  }

  const confirmDeletePayment = async () => {
    if (!deletePaymentId) return
    await handleDeletePayment(deletePaymentId)
    setDeletePaymentConfirmVisible(false)
    setDeletePaymentId(null)
  }

  const handleDeletePayment = async (paymentId: number) => {
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      const { error } = await supabase
        .from("payments")
        .delete()
        .eq("id", paymentId)

      if (error) throw error
      setPaymentDetailVisible(false)
      showToast("Deleted Successfully", "The billing record has been permanently deleted.", "success")
      
      if (selectedTenant) {
        const { data, error: fetchErr } = await supabase
          .from("payments")
          .select("*")
          .eq("tenant_id", selectedTenant.id)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
        if (!fetchErr && data) {
          setPaymentHistory(data)
        }
      }
    } catch (err) {
      console.error("Error deleting payment record:", err)
      showToast("Database Error", "Failed to delete the selected billing row.", "error")
    }
  }

  const handleApprovePayment = async (payment: any) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    const now = new Date().toISOString()

    setPaymentHistory((prev) =>
      prev.map((p) => (p.id === payment.id ? { ...p, status: "paid" as const, paid_at: now, verified_at: now } : p))
    )
    setSelectedPaymentDetail((prev: any) =>
      prev ? { ...prev, status: "paid" as const, paid_at: now, verified_at: now } : null
    )

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
        notes: "Approved via Mobile Verification Panel (Tenants)"
      })

      showToast("Payment Approved", "The payment proof has been approved.", "success")
    } catch (err) {
      console.error("Approve payment error:", err)
      showToast("Database Error", "Failed to approve payment record.", "error")
      if (selectedTenant) {
        const { data } = await supabase
          .from("payments")
          .select("*")
          .eq("tenant_id", selectedTenant.id)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
        if (data) setPaymentHistory(data)
      }
    }
  }

  const handleRejectPayment = async (payment: any) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    
    setPaymentHistory((prev) =>
      prev.map((p) => (p.id === payment.id ? { ...p, status: "pending" as const, verification_notes: rejectNotes } : p))
    )
    setSelectedPaymentDetail((prev: any) =>
      prev ? { ...prev, status: "pending" as const, verification_notes: rejectNotes } : null
    )

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
        notes: rejectNotes || "Rejected via Mobile Verification Panel (Tenants)"
      })

      setRejectingMode(false)
      const currentRejectionReason = rejectNotes || ""
      setRejectNotes("")
      showToast("Payment Rejected", "The payment proof has been rejected.", "warning")

      if (chatbotEnabled) {
        void supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
          const token = currentSession?.access_token
          if (token) {
            const chatbotApiUrl = getChatbotApiUrl()
            void fetch(`${chatbotApiUrl}/api/v1/send-payment-rejection`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({
                payment_id: payment.id,
                rejection_reason: currentRejectionReason
              })
            }).catch(err => {
              console.error("Failed to send rejection notice via chatbot API:", err)
            })
          }
        })
      }
    } catch (err) {
      console.error("Reject payment error:", err)
      showToast("Database Error", "Failed to reject payment record.", "error")
      if (selectedTenant) {
        const { data } = await supabase
          .from("payments")
          .select("*")
          .eq("tenant_id", selectedTenant.id)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
        if (data) setPaymentHistory(data)
      }
    }
  }

  const handleMarkAsPaid = (paymentId: number) => {
    setMarkingPaidPaymentId(paymentId)
    setSelectedPaymentMethod("UPI")
    setPaymentMethodDropdownOpen(false)
    setMarkPaidModalVisible(true)
  }

  const confirmMarkPaid = async (paymentId: number, method: "UPI" | "Cash") => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setMarkPaidModalVisible(false)
    setMarkingPaidPaymentId(null)
    
    setPaymentHistory((prev) =>
      prev.map((p) =>
        p.id === paymentId
          ? { ...p, status: "paid" as const, paid_at: new Date().toISOString(), payment_method: method }
          : p
      )
    )
    setSelectedPaymentDetail((prev: any) =>
      prev && prev.id === paymentId
        ? { ...prev, status: "paid" as const, paid_at: new Date().toISOString(), payment_method: method }
        : prev
    )

    try {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from("payments")
        .update({
          status: "paid",
          paid_at: now,
          verified_at: now,
          payment_method: method
        })
        .eq("id", paymentId)

      if (error) throw error

      await supabase.from("payment_audit_log").insert({
        payment_id: paymentId,
        owner_id: user!.id,
        action: "proof_approved",
        old_status: "pending",
        new_status: "paid",
        notes: `Marked paid manually by owner via ${method} (Tenants)`
      })

      showToast("Payment Confirmed", `Rent marked as paid via ${method} successfully.`, "success")
    } catch (err) {
      console.error("Failed manual verification updates:", err)
      showToast("Server Error", "Could not synchronize payment status.", "error")
      if (selectedTenant) {
        const { data } = await supabase
          .from("payments")
          .select("*")
          .eq("tenant_id", selectedTenant.id)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
        if (data) setPaymentHistory(data)
      }
    }
  }

  // Filter available rooms
  const availableRooms = useMemo(() => {
    return rooms.filter((room) => {
      // Show room if beds available OR if it's the current room of editing tenant
      const hasAvailableBeds = room.occupied_beds < room.total_beds
      const isCurrentTenantRoom = editingTenant?.room_id === room.id
      return hasAvailableBeds || isCurrentTenantRoom
    })
  }, [rooms, editingTenant])

  // Filtered tenants (exclude move_out from main list unless specifically filtered)
  const filteredTenants = tenants.filter((tenant) => {
    const nameMatch = (tenant.name || "").toLowerCase().includes(searchQuery.toLowerCase())
    const phoneMatch = (tenant.mobile_number || "").includes(searchQuery)
    
    // Status filtering logic
    let statusMatch = false
    if (statusFilter === "all") {
      // "All" shows active, pending_move_in, and notice_period only (not move_out)
      statusMatch = tenant.status !== "move_out"
    } else if (statusFilter === "move_out") {
      // "Move Out" shows only moved-out tenants
      statusMatch = tenant.status === "move_out"
    } else {
      // Specific status filter
      statusMatch = tenant.status === statusFilter
    }
    
    return (nameMatch || phoneMatch) && statusMatch
  })

  if (loading && tenants.length === 0) {
    return (
      <SafeAreaView key="tenants-loading" className="flex-1 bg-background dark:bg-background-dark" edges={["top"]}>
        {/* Header Skeleton */}
        <View className="px-6 pt-4 pb-3 flex-row justify-between items-center">
          <View className="gap-2">
            <View className="h-7 w-32 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
            <View className="h-4 w-56 bg-muted/15 dark:bg-muted-dark/15 rounded-lg" />
          </View>
          <View className="h-10 w-10 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
        </View>

        {/* Search Input Skeleton */}
        <View className="px-6 mb-4">
          <View className="h-12 bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-2xl" />
        </View>

        {/* Filter Tabs Skeleton */}
        <View className="h-12 mb-2 px-6 flex-row items-center gap-2">
          <View className="h-8 w-16 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
          <View className="h-8 w-20 bg-muted/15 dark:bg-muted-dark/15 rounded-xl" />
          <View className="h-8 w-24 bg-muted/15 dark:bg-muted-dark/15 rounded-xl" />
          <View className="h-8 w-24 bg-muted/15 dark:bg-muted-dark/15 rounded-xl" />
        </View>

        {/* Skeleton Directory Cards */}
        <View className="flex-1 px-6">
          <ScrollView showsVerticalScrollIndicator={false}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <View
                key={i}
                className="flex-row items-center bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-3xl mb-3 shadow-sm justify-between opacity-60"
              >
                <View className="flex-row items-center flex-1 pr-4">
                  {/* Circle avatar skeleton */}
                  <View className="h-11 w-11 bg-muted/20 dark:bg-muted-dark/20 rounded-full mr-3.5" />

                  <View className="flex-1 gap-2">
                    <View className="flex-row items-center">
                      {/* Name skeleton */}
                      <View className="h-4 w-28 bg-muted/25 dark:bg-muted-dark/25 rounded-md mr-2" />
                      {/* Status badge skeleton */}
                      <View className="h-3.5 w-14 bg-muted/20 dark:bg-muted-dark/20 rounded-md" />
                    </View>

                    <View className="flex-row items-center gap-4">
                      {/* Room skeleton */}
                      <View className="h-3 w-16 bg-muted/15 dark:bg-muted-dark/15 rounded-md" />
                      {/* Phone skeleton */}
                      <View className="h-3 w-24 bg-muted/15 dark:bg-muted-dark/15 rounded-md" />
                    </View>
                  </View>
                </View>
                {/* Chevron skeleton */}
                <View className="h-4 w-4 rounded-full bg-muted/20 dark:bg-muted-dark/20" />
              </View>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView key="tenants-loaded" className="flex-1 bg-background dark:bg-background-dark" edges={["top"]}>
      {/* Header */}
      <View className="px-6 pt-4 pb-3 flex-row justify-between items-center">
        <View>
          <Text className="text-2xl font-black text-foreground dark:text-foreground-dark tracking-tight">
            Tenants
          </Text>
          <Text className="text-sm text-muted dark:text-muted-dark font-medium mt-1">
            Manage occupants directory ({filteredTenants.length} people)
          </Text>
        </View>
        <TouchableOpacity
          onPress={openAddModal}
          className="h-10 w-10 bg-primary rounded-xl items-center justify-center shadow-lg shadow-primary/20"
        >
          <Plus size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View className="px-6 mb-4">
        <View className="flex-row items-center border border-border dark:border-border-dark bg-card dark:bg-card-dark rounded-2xl px-4 py-1.5 shadow-sm">
          <View className="mr-3">
            <Search size={16} color="#9ca3af" />
          </View>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name or mobile..."
            placeholderTextColor="#9ca3af"
            className="flex-1 text-sm text-foreground dark:text-foreground-dark py-0.5"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View className="h-12 mb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, alignItems: "center" }}
        >
          {["all", "active", "pending_move_in", "notice_period", "move_out"].map((status) => (
            <TouchableOpacity
              key={`${status}-${statusFilter === status}`}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setStatusFilter(status)
              }}
              className={`px-5 py-2 rounded-xl mr-2 border capitalize ${
                statusFilter === status
                  ? "bg-primary border-primary"
                  : "bg-card dark:bg-card-dark border-border dark:border-border-dark"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  statusFilter === status ? "text-white" : "text-muted dark:text-muted-dark"
                }`}
              >
                {status.replace(/_/g, " ")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Tenant Directory */}
      {filteredTenants.length === 0 ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 48 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={isDark ? "#0091ff" : "#0071df"} />}
        >
          <User size={48} color="#9ca3af" />
          <Text className="text-sm font-semibold text-muted dark:text-muted-dark mt-4 text-center">
            No tenants found
          </Text>
          <Text className="text-xs text-muted/60 dark:text-muted-dark/60 mt-2 text-center">
            Pull down to refresh
          </Text>
        </ScrollView>
      ) : (
        <View className="flex-1 px-6">
          <FlashList
            data={filteredTenants}
            keyExtractor={(item) => `${item.id}-${item.status}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={isDark ? "#0091ff" : "#0071df"} />}
            renderItem={({ item }) => {
              let badgeBgBorder = "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30"
              let badgeTextColor = "text-emerald-600 dark:text-emerald-400"
              if (item.status === "notice_period") {
                badgeBgBorder = "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30"
                badgeTextColor = "text-amber-600 dark:text-amber-400"
              } else if (item.status === "move_out") {
                badgeBgBorder = "bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30"
                badgeTextColor = "text-rose-600 dark:text-rose-400"
              } else if (item.status === "pending_move_in") {
                badgeBgBorder = "bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30"
                badgeTextColor = "text-sky-600 dark:text-sky-400"
              }

              return (
                <TouchableOpacity
                  onPress={() => openDetailSheet(item)}
                  className="flex-row items-center bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-3xl mb-3 shadow-sm justify-between"
                >
                  <View className="flex-row items-center flex-1 pr-4">
                    {/* Circle avatar */}
                    <View className="h-11 w-11 bg-primary/10 rounded-full items-center justify-center mr-3.5">
                      <User size={20} color={isDark ? "#0091ff" : "#0071df"} />
                    </View>

                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-base font-bold text-foreground dark:text-foreground-dark flex-shrink" numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View className={`px-2 py-0.5 rounded-md border ${badgeBgBorder} flex-shrink-0`}>
                          <Text className={`text-[8px] font-black uppercase ${badgeTextColor}`}>
                            {item.status.replace(/_/g, " ")}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row items-center mt-1 gap-4">
                        <View className="flex-row items-center">
                          <View className="mr-1">
                            <Hotel size={12} color="#9ca3af" />
                          </View>
                          <Text className="text-xs text-muted dark:text-muted-dark font-medium">
                            Room {item.rooms_table?.room_number || "Unassigned"}
                          </Text>
                        </View>
                        {item.mobile_number && (
                          <View className="flex-row items-center">
                            <View className="mr-1">
                              <Phone size={12} color="#9ca3af" />
                            </View>
                            <Text className="text-xs text-muted dark:text-muted-dark font-medium">
                              {item.mobile_number}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  <ChevronRight size={18} color="#9ca3af" />
                </TouchableOpacity>
              )
            }}
          />
        </View>
      )}

      {/* Drawer 1: Tenant Detail Sheet */}
      <Modal
        animationType="none"
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

          <View className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[92%] border-t border-border dark:border-border-dark">
            {selectedTenant && (
              <View className="p-6 flex-col max-h-full">
                {/* Header */}
                <View className="flex-row justify-between items-start mb-5">
                  <View className="flex-row items-center flex-1 mr-2">
                    <View className="h-14 w-14 bg-primary/10 rounded-full items-center justify-center mr-4">
                      <User size={28} color={isDark ? "#0091ff" : "#0071df"} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-xl font-black text-foreground dark:text-foreground-dark truncate">
                        {selectedTenant.name}
                      </Text>
                      <View className="flex-row items-center mt-1 flex-wrap gap-1.5">
                        <View className="px-2 py-0.5 rounded-md bg-primary/10">
                          <Text className="text-[9px] font-black text-primary uppercase">
                            Room {selectedTenant.rooms_table?.room_number || "N/A"}
                          </Text>
                        </View>
                        {(() => {
                          let badgeBgBorder = "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30"
                          let badgeTextColor = "text-emerald-600 dark:text-emerald-400"
                          if (selectedTenant.status === "notice_period") {
                            badgeBgBorder = "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30"
                            badgeTextColor = "text-amber-600 dark:text-amber-400"
                          } else if (selectedTenant.status === "move_out") {
                            badgeBgBorder = "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30"
                            badgeTextColor = "text-rose-600 dark:text-rose-400"
                          } else if (selectedTenant.status === "pending_move_in") {
                            badgeBgBorder = "bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30"
                            badgeTextColor = "text-sky-600 dark:text-sky-400"
                          }
                          return (
                            <View className={`px-2 py-0.5 rounded-md border capitalize ${badgeBgBorder}`}>
                              <Text className={`text-[8px] font-black uppercase ${badgeTextColor}`}>
                                {selectedTenant.status.replace(/_/g, " ")}
                              </Text>
                            </View>
                          )
                        })()}
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDetailModalVisible(false)}
                    className="h-10 w-10 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
                  >
                    <X size={20} color="#9ca3af" />
                  </TouchableOpacity>
                </View>

                {/* Tab Segment Controller */}
                <View className="flex-row bg-background dark:bg-background-dark p-1 rounded-2xl border border-border/60 dark:border-border-dark/60 mb-5">
                  <TouchableOpacity
                    key={`tab-details-${activeTab === "details"}`}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      setActiveTab("details")
                    }}
                    className={`flex-1 py-2 rounded-xl items-center justify-center ${activeTab === "details" ? "bg-card dark:bg-card-dark shadow-sm" : ""}`}
                  >
                    <Text className={`text-xs font-black ${activeTab === "details" ? "text-primary" : "text-muted"}`}>Details & ID</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    key={`tab-history-${activeTab === "history"}`}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      setActiveTab("history")
                    }}
                    className={`flex-1 py-2 rounded-xl items-center justify-center ${activeTab === "history" ? "bg-card dark:bg-card-dark shadow-sm" : ""}`}
                  >
                    <Text className={`text-xs font-black ${activeTab === "history" ? "text-primary" : "text-muted"}`}>Payment History</Text>
                  </TouchableOpacity>
                </View>

                {activeTab === "details" ? (
                  /* Details List */
                  <ScrollView 
                    showsVerticalScrollIndicator={false} 
                    contentContainerStyle={{ gap: 16 }} 
                    className="flex-shrink flex-grow-0 mb-6"
                  >
                    {/* Notice Period / Pending Move In Warning Notes */}
                    {selectedTenant.status !== "move_out" && (selectedTenant.status === "notice_period" || selectedTenant.status === "pending_move_in") && (
                      <View className={`rounded-2xl p-3 mb-2 flex-row items-center gap-2 border ${
                        selectedTenant.status === "pending_move_in"
                          ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-900/40"
                          : "bg-purple-50 dark:bg-purple-950/30 border-purple-200/80 dark:border-purple-900/40"
                      }`}>
                        <Info size={14} color={selectedTenant.status === "pending_move_in" ? "#10b981" : "#8b5cf6"} />
                        <Text className="text-[10px] font-bold text-foreground dark:text-foreground-dark flex-1">
                          {selectedTenant.status === "pending_move_in"
                            ? `Joining on ${selectedTenant.join_date ? new Date(selectedTenant.join_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}`
                            : `Moving out on ${selectedTenant.exit_date ? new Date(selectedTenant.exit_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}`
                          }
                        </Text>
                      </View>
                    )}
                    {/* Room Assignment Highlighted Card - Only show for active/pending/notice_period tenants */}
                    {selectedTenant.status !== "move_out" && (
                      <View className="rounded-3xl mb-1 overflow-hidden relative border border-primary/20">
                        <LinearGradient
                          colors={isDark ? ["rgba(0, 145, 255, 0.15)", "rgba(0, 71, 223, 0.05)"] : ["rgba(0, 145, 255, 0.08)", "rgba(0, 71, 223, 0.03)"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                        />
                        <View className="p-4 flex-row justify-between items-center">
                          <View className="flex-row items-center flex-1 mr-3">
                            <View className="h-10 w-10 bg-primary/20 rounded-full items-center justify-center mr-3">
                              <Hotel size={18} color={isDark ? "#0091ff" : "#0071df"} />
                            </View>
                            <View className="flex-1">
                              <Text className="text-[10px] font-black text-primary uppercase tracking-wider">Assigned Room</Text>
                              <Text className="text-base font-extrabold text-foreground dark:text-foreground-dark mt-0.5">
                                Room {selectedTenant.rooms_table?.room_number || "Unassigned"}
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                              setRoomChangeSearchQuery("")
                              setChangeRoomModalVisible(true)
                            }}
                            className="bg-primary px-4 py-2.5 rounded-xl shadow-lg shadow-primary/20 active:scale-95"
                          >
                            <Text className="text-xs font-bold text-white">Change Room</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                    {/* Phone */}
                    {selectedTenant.mobile_number && (
                      <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                        <View className="flex-row items-center">
                          <View className="mr-3">
                            <Phone size={16} color="#9ca3af" />
                          </View>
                          <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Phone Number</Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          <TouchableOpacity onPress={() => handleCallTenant(selectedTenant.mobile_number)} className="flex-row items-center bg-primary/10 px-3 py-1.5 rounded-xl active:scale-95">
                            <Text className="text-xs font-black text-primary mr-1.5">{selectedTenant.mobile_number}</Text>
                            <Phone size={12} color={isDark ? "#0091ff" : "#0071df"} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                              Clipboard.setString(selectedTenant.mobile_number || "")
                              showToast("Copied", "Phone number copied to clipboard.", "success")
                            }}
                            className="bg-primary/10 p-2 rounded-xl active:scale-95 items-center justify-center animate-none"
                          >
                            <Copy size={12} color={isDark ? "#0091ff" : "#0071df"} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* Email */}
                    {selectedTenant.email && (
                      <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                        <View className="flex-row items-center">
                          <View className="mr-3">
                            <Mail size={16} color="#9ca3af" />
                          </View>
                          <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Email Address</Text>
                        </View>
                        <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">{selectedTenant.email}</Text>
                      </View>
                    )}

                    {/* Join Date */}
                    <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                      <View className="flex-row items-center">
                        <View className="mr-3">
                          <Calendar size={16} color="#9ca3af" />
                        </View>
                        <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Joining Date</Text>
                      </View>
                      <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                        {selectedTenant.join_date || "Not set"}
                      </Text>
                    </View>

                    {/* Monthly Rent Due Date */}
                    <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                      <View className="flex-row items-center">
                        <View className="mr-3">
                          <Calendar size={16} color="#9ca3af" />
                        </View>
                        <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Rent Due Day</Text>
                      </View>
                      <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                        Every {selectedTenant.rent_due_day || 5}th of month
                      </Text>
                    </View>

                    {/* Room Rent */}
                    {selectedTenant.rooms_table && (
                      <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                        <View className="flex-row items-center">
                          <View className="mr-3">
                            <CreditCard size={16} color="#9ca3af" />
                          </View>
                          <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Room Rent</Text>
                        </View>
                        <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                          ₹{(selectedTenant.rooms_table.rent_amount || 0).toLocaleString()} / month
                        </Text>
                      </View>
                    )}

                    {/* Deposit Amount */}
                    <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                      <View className="flex-row items-center">
                        <View className="mr-3">
                          <CreditCard size={16} color="#9ca3af" />
                        </View>
                        <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Security Deposit</Text>
                      </View>
                      <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                        ₹{(selectedTenant.deposit_amount || 0).toLocaleString()}
                      </Text>
                    </View>

                    {/* Extra Charges */}
                    <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                      <View className="flex-row items-center">
                        <View className="mr-3">
                          <CreditCard size={16} color="#9ca3af" />
                        </View>
                        <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Extra Charges</Text>
                      </View>
                      <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                        ₹{(selectedTenant.extra_charges || 0).toLocaleString()}
                      </Text>
                    </View>

                    {/* Notes */}
                    {selectedTenant.notes && (
                      <View className="py-3">
                        <Text className="text-sm font-semibold text-muted dark:text-muted-dark mb-1.5">Tenant Notes</Text>
                        <View className="bg-background dark:bg-background-dark p-3.5 rounded-2xl border border-border/60 dark:border-border-dark/60">
                          <Text className="text-sm text-foreground dark:text-foreground-dark leading-5">{selectedTenant.notes}</Text>
                        </View>
                      </View>
                    )}

                    {/* Identity Verification (chatbot-requested identity) */}
                    {(() => {
                      const statusPresentation = popupStatusPresentation({
                        identity_request_flag: !!selectedTenant.identity_request_flag,
                        verification_status: selectedTenant.verification_status || "Not_Started",
                        ignore_identity_flag: !!selectedTenant.ignore_identity_flag,
                      })
                      const displayCode = selectDisplayCode({
                        aadhaar_number: selectedTenant.aadhaar_number,
                        pan_code: selectedTenant.pan_code,
                      })

                      // At least one stored identity document image (Req 17.1).
                      const hasFrontImage = typeof selectedTenant.id_front_path === "string" && selectedTenant.id_front_path.trim().length > 0
                      const hasBackImage = typeof selectedTenant.id_back_path === "string" && selectedTenant.id_back_path.trim().length > 0
                      const hasStoredImage = hasFrontImage || hasBackImage

                      // Nothing to show: no requested-identity status, no stored code, no stored
                      // images, and not in the post-delete chooser state.
                      if (
                        statusPresentation === "none" &&
                        !displayCode &&
                        !hasStoredImage &&
                        identityResetTenantId !== selectedTenant.id
                      ) {
                        return null
                      }

                      const progressMeta = (() => {
                        switch (statusPresentation) {
                          case "in_progress":
                            return {
                              text: "Identity verification document gathering in progress",
                              color: isDark ? "#fbbf24" : "#d97706",
                              icon: <Clock size={14} color={isDark ? "#fbbf24" : "#d97706"} />,
                            }
                          case "verified":
                            return {
                              text: "Identity verified",
                              color: isDark ? "#4ade80" : "#16a34a",
                              icon: <ShieldCheck size={14} color={isDark ? "#4ade80" : "#16a34a"} />,
                            }
                          case "reminders_stopped":
                            return {
                              text: "Identity reminders stopped",
                              color: isDark ? "#9ca3af" : "#6b7280",
                              icon: <Info size={14} color={isDark ? "#9ca3af" : "#6b7280"} />,
                            }
                          default:
                            return null
                        }
                      })()

                      return (
                        <View className="py-3 border-b border-border/40 dark:border-border-dark/40">
                          <Text className="text-sm font-semibold text-muted dark:text-muted-dark mb-2.5">Identity Verification</Text>

                          {/* Progress / status indication (Req 14.1, 14.2, 14.3) */}
                          {progressMeta && (
                            <View className="flex-row items-center gap-2 mb-3">
                              {progressMeta.icon}
                              <Text className="text-xs font-bold flex-1" style={{ color: progressMeta.color }}>
                                {progressMeta.text}
                              </Text>
                            </View>
                          )}

                          {/* Masked identity code with Eye reveal toggle (Req 16) */}
                          {displayCode && (
                            <View className="bg-background dark:bg-background-dark p-3.5 rounded-2xl border border-border/60 dark:border-border-dark/60">
                              <View className="flex-row items-center justify-between">
                                <View className="flex-1 mr-3">
                                  <Text className="text-[10px] font-black text-muted uppercase tracking-wider mb-1">
                                    {displayCode.type} Number
                                  </Text>
                                  <Text className="text-sm font-bold text-foreground dark:text-foreground-dark tracking-wide">
                                    {maskIdentityCode(displayCode.value)}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  onPress={() => {
                                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                    setRevealIdentityCode((prev) => !prev)
                                  }}
                                  className="h-9 w-9 bg-primary/10 rounded-xl items-center justify-center active:scale-95"
                                  accessibilityLabel={revealIdentityCode ? "Hide identity number" : "Reveal identity number"}
                                >
                                  {revealIdentityCode ? (
                                    <EyeOff size={16} color={isDark ? "#0091ff" : "#0071df"} />
                                  ) : (
                                    <Eye size={16} color={isDark ? "#0091ff" : "#0071df"} />
                                  )}
                                </TouchableOpacity>
                              </View>

                              {/* Full value shown below the masked value only while revealed (Req 16.3, 16.4) */}
                              {revealIdentityCode && (
                                <View className="mt-2.5 pt-2.5 border-t border-border/40 dark:border-border-dark/40">
                                  <Text className="text-[10px] font-black text-muted uppercase tracking-wider mb-1">Full Number</Text>
                                  <Text className="text-sm font-extrabold text-primary tracking-wide">
                                    {displayCode.value}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}

                          {identityResetTenantId === selectedTenant.id ? (
                            /* Post-delete: owner chooses how to collect identity again (Req: request again / upload) */
                            <View className="mt-3 gap-2.5">
                              <Text className="text-xs text-muted dark:text-muted-dark">
                                Documents deleted. Choose how to collect identity again:
                              </Text>
                              <TouchableOpacity
                                onPress={() => handleRequestIdentityAgain(selectedTenant)}
                                disabled={isRequestingIdentityAgain}
                                className="flex-row items-center justify-center gap-2 py-2.5 px-3 rounded-2xl border border-primary/40 bg-primary/10 active:scale-95"
                                style={{ opacity: isRequestingIdentityAgain ? 0.6 : 1 }}
                                accessibilityLabel="Request identity again"
                                accessibilityRole="button"
                              >
                                {isRequestingIdentityAgain ? (
                                  <ActivityIndicator size="small" color={isDark ? "#0091ff" : "#0071df"} />
                                ) : (
                                  <Clock size={14} color={isDark ? "#0091ff" : "#0071df"} />
                                )}
                                <Text className="text-xs font-bold text-primary">Request again (daily)</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleManualIdentityUpload(selectedTenant)}
                                disabled={isManualUploading}
                                className="flex-row items-center justify-center gap-2 py-2.5 px-3 rounded-2xl border border-border/60 dark:border-border-dark/60 bg-background dark:bg-background-dark active:scale-95"
                                style={{ opacity: isManualUploading ? 0.6 : 1 }}
                                accessibilityLabel="Upload identity documents manually"
                                accessibilityRole="button"
                              >
                                {isManualUploading ? (
                                  <ActivityIndicator size="small" color={isDark ? "#9ca3af" : "#6b7280"} />
                                ) : (
                                  <Upload size={14} color={isDark ? "#9ca3af" : "#6b7280"} />
                                )}
                                <Text className="text-xs font-bold text-muted dark:text-muted-dark">Upload manually</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <>
                              {/* Manual upload (owner uploads on the tenant's behalf) while collection
                                  is in progress — placed right above the Ignore button. */}
                              {statusPresentation === "in_progress" && (
                                <TouchableOpacity
                                  onPress={() => handleManualIdentityUpload(selectedTenant)}
                                  disabled={isManualUploading}
                                  className="flex-row items-center justify-center gap-2 mt-3 py-2.5 px-3 rounded-2xl border border-primary/40 bg-primary/10 active:scale-95"
                                  style={{ opacity: isManualUploading ? 0.6 : 1 }}
                                  accessibilityLabel="Upload identity documents manually"
                                  accessibilityRole="button"
                                >
                                  {isManualUploading ? (
                                    <ActivityIndicator size="small" color={isDark ? "#0091ff" : "#0071df"} />
                                  ) : (
                                    <Upload size={14} color={isDark ? "#0091ff" : "#0071df"} />
                                  )}
                                  <Text className="text-xs font-bold text-primary">Upload documents manually</Text>
                                </TouchableOpacity>
                              )}

                              {/* "Ignore identity" action — shown only when reminders can still be stopped (Req 15.1, 15.4, 15.5) */}
                              {shouldShowIgnoreButton({
                                identity_request_flag: !!selectedTenant.identity_request_flag,
                                verification_status: selectedTenant.verification_status || "Not_Started",
                                ignore_identity_flag: !!selectedTenant.ignore_identity_flag,
                              }) && (
                                <TouchableOpacity
                                  onPress={() => {
                                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                    setIgnoreConfirmVisible(true)
                                  }}
                                  disabled={isIgnoringIdentity}
                                  className="flex-row items-center justify-center gap-2 mt-3 py-2.5 px-3 rounded-2xl border border-border/60 dark:border-border-dark/60 bg-background dark:bg-background-dark active:scale-95"
                                  style={{ opacity: isIgnoringIdentity ? 0.6 : 1 }}
                                  accessibilityLabel="Ignore identity"
                                  accessibilityRole="button"
                                >
                                  {isIgnoringIdentity ? (
                                    <ActivityIndicator size="small" color={isDark ? "#9ca3af" : "#6b7280"} />
                                  ) : (
                                    <X size={14} color={isDark ? "#9ca3af" : "#6b7280"} />
                                  )}
                                  <Text className="text-xs font-bold text-muted dark:text-muted-dark">
                                    Ignore identity
                                  </Text>
                                </TouchableOpacity>
                              )}

                              {/* "Show documents" — shown when ≥1 stored identity image exists (Req 17.1) */}
                              {hasStoredImage && (
                                <TouchableOpacity
                                  onPress={() => openIdentityViewer(selectedTenant)}
                                  className="flex-row items-center justify-center gap-2 mt-3 py-2.5 px-3 rounded-2xl border border-primary/40 bg-primary/10 active:scale-95"
                                  accessibilityLabel="Show documents"
                                  accessibilityRole="button"
                                >
                                  <Maximize2 size={14} color={isDark ? "#0091ff" : "#0071df"} />
                                  <Text className="text-xs font-bold text-primary">
                                    Show documents
                                  </Text>
                                </TouchableOpacity>
                              )}

                              {/* "Delete documents" — remove the stored identity images completely */}
                              {hasStoredImage && (
                                <TouchableOpacity
                                  onPress={() => {
                                    Alert.alert(
                                      "Delete Identity Documents",
                                      "This permanently removes the stored identity documents and resets verification. Continue?",
                                      [
                                        { text: "Cancel", style: "cancel" },
                                        { text: "Delete", style: "destructive", onPress: () => handleDeleteIdentityDocs(selectedTenant) },
                                      ]
                                    )
                                  }}
                                  disabled={isDeletingIdentity}
                                  className="flex-row items-center justify-center gap-2 mt-3 py-2.5 px-3 rounded-2xl border border-red-500/40 bg-red-500/10 active:scale-95"
                                  style={{ opacity: isDeletingIdentity ? 0.6 : 1 }}
                                  accessibilityLabel="Delete documents"
                                  accessibilityRole="button"
                                >
                                  {isDeletingIdentity ? (
                                    <ActivityIndicator size="small" color="#ef4444" />
                                  ) : (
                                    <Trash2 size={14} color="#ef4444" />
                                  )}
                                  <Text className="text-xs font-bold text-red-500">
                                    Delete documents
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </>
                          )}
                        </View>
                      )
                    })()}

                    {/* Identity Documents */}
                    {selectedTenant.id_documents && (selectedTenant.id_documents as any[]).length > 0 && (
                      <View className="py-3">
                        <Text className="text-sm font-semibold text-muted dark:text-muted-dark mb-2.5">Identity Documents</Text>
                        <View className="gap-2.5">
                          {(selectedTenant.id_documents as any[]).map((doc, idx) => {
                            const previewUri = detailDocUrls[doc.url] || supabase.storage.from("staytraq_docs").getPublicUrl(doc.url).data.publicUrl
                            return (
                              <TouchableOpacity
                                key={idx}
                                onPress={async () => {
                                  let uri = detailDocUrls[doc.url]
                                  if (!uri) {
                                    setViewerLoading(true)
                                    setViewerTitle(doc.type || "Document Preview")
                                    setViewerVisible(true)
                                    try {
                                      const { data, error } = await supabase.storage
                                        .from("staytraq_docs")
                                        .createSignedUrl(doc.url, 3600)
                                      if (!error && data?.signedUrl) {
                                        uri = data.signedUrl
                                        setDetailDocUrls(prev => ({ ...prev, [doc.url]: data.signedUrl }))
                                        setViewerImageUri(data.signedUrl)
                                      } else {
                                        Alert.alert("Error", "Could not fetch secure URL for this document.")
                                        setViewerVisible(false)
                                      }
                                    } catch (err) {
                                      console.error("Error creating signed URL:", err)
                                      Alert.alert("Error", "Could not fetch secure URL for this document.")
                                      setViewerVisible(false)
                                    } finally {
                                      setViewerLoading(false)
                                    }
                                  } else {
                                    setViewerTitle(doc.type || "Document Preview")
                                    setViewerImageUri(uri)
                                    setViewerLoading(false)
                                    setViewerVisible(true)
                                  }
                                }}
                                className="flex-row items-center border border-border dark:border-border-dark p-2.5 rounded-xl bg-background dark:bg-background-dark active:bg-muted/10"
                              >
                                <Image 
                                  source={{ uri: previewUri }} 
                                  className="w-10 h-10 rounded-lg bg-muted object-cover mr-3" 
                                />
                                <View className="flex-1 min-w-0 mr-2">
                                  <Text className="text-xs font-bold text-foreground dark:text-foreground-dark truncate">
                                    {doc.type}
                                  </Text>
                                  <Text className="text-[10px] text-muted truncate mt-0.5">
                                    Tap to view document
                                  </Text>
                                </View>
                                <ChevronRight size={16} color="#9ca3af" />
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                      </View>
                    )}
                  </ScrollView>
                ) : (
                  /* Payment History List */
                  <ScrollView 
                    showsVerticalScrollIndicator={false} 
                    contentContainerStyle={{ gap: 10 }} 
                    className="flex-shrink flex-grow-0 mb-6"
                  >
                    {historyLoading ? (
                      <View className="py-12 items-center justify-center">
                        <ActivityIndicator size="small" color={isDark ? "#0091ff" : "#0071df"} />
                      </View>
                    ) : paymentHistory.length === 0 ? (
                      <View className="py-12 items-center justify-center">
                        <CreditCard size={36} color="#9ca3af" />
                        <Text className="text-sm text-muted mt-2 font-medium">No payment history available.</Text>
                      </View>
                    ) : (
                      <View className="gap-2.5">
                        {paymentHistory.map((payment) => {
                          const total = (payment.rent_amount || 0) + (payment.extra_charges || 0)
                          const months = [
                            "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
                          ]
                          const monthStr = months[payment.month] || "Month"
                          
                          let badgeBgBorder = "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30"
                          let badgeTextColor = "text-emerald-600 dark:text-emerald-400"
                          if (payment.status === "late") {
                            badgeBgBorder = "bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30"
                            badgeTextColor = "text-rose-600 dark:text-rose-400"
                          } else if (payment.status === "pending") {
                            badgeBgBorder = "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30"
                            badgeTextColor = "text-amber-600 dark:text-amber-400"
                          } else if (payment.status === "submitted") {
                            badgeBgBorder = "bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30"
                            badgeTextColor = "text-purple-600 dark:text-purple-400"
                          }

                          return (
                            <TouchableOpacity
                              key={payment.id}
                              onPress={async () => {
                                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                setSelectedPaymentDetail(payment)
                                setPaymentDetailVisible(true)
                                setSignedScreenshotUrl(null)
                                
                                if (payment.screenshot_path) {
                                  setLoadingScreenshot(true)
                                  try {
                                    const { data, error } = await supabase.storage
                                      .from("payment_screenshots")
                                      .createSignedUrl(payment.screenshot_path, 3600)
                                    if (!error && data?.signedUrl) {
                                      setSignedScreenshotUrl(data.signedUrl)
                                    }
                                  } catch (err) {
                                    console.error("Failed to load receipt signed URL", err)
                                  } finally {
                                    setLoadingScreenshot(false)
                                  }
                                }
                              }}
                              className="flex-row items-center border border-border dark:border-border-dark p-3.5 rounded-2xl bg-background dark:bg-background-dark active:bg-muted/10 justify-between"
                            >
                              <View className="flex-1 min-w-0 mr-3">
                                <View className="flex-row items-center flex-wrap">
                                  <Text className="text-sm font-extrabold text-foreground dark:text-foreground-dark mr-2">
                                    {monthStr} {payment.year}
                                  </Text>
                                  <View className={`px-2 py-0.5 rounded-md border ${badgeBgBorder}`}>
                                    <Text className={`text-[8px] font-black uppercase ${badgeTextColor}`}>{payment.status}</Text>
                                  </View>
                                </View>
                                <Text className="text-[10px] text-muted mt-1">
                                  {payment.status === "paid" ? `Paid on ${payment.paid_at || "—"}` : `Due by ${payment.due_date || "—"}`}
                                </Text>
                              </View>
                              <View className="flex-row items-center">
                                <Text className="text-sm font-black text-foreground dark:text-foreground-dark mr-2">
                                  ₹{total.toLocaleString()}
                                </Text>
                                <ChevronRight size={16} color="#9ca3af" />
                              </View>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    )}
                  </ScrollView>
                )}

                {/* Primary Actions */}
                <View className="flex-row gap-2.5 pt-3 border-t border-border/40 dark:border-border-dark/40 pb-4">
                  {selectedTenant.status === "move_out" ? (
                    // Moved Out Tenant: WhatsApp + Delete (No Edit Profile)
                    <>
                      <TouchableOpacity
                        onPress={() => {
                          const phone = selectedTenant?.mobile_number
                          const tenantName = selectedTenant?.name || "Tenant"
                          void handleDirectWhatsAppChat(phone, tenantName)
                        }}
                        disabled={isSendingWhatsAppTenant}
                        className={`h-12 w-12 border rounded-xl items-center justify-center active:scale-95 ${
                          isSendingWhatsAppTenant 
                            ? "border-slate-300 bg-slate-100 dark:bg-slate-800 opacity-60" 
                            : "border-success/20 bg-success/5"
                        }`}
                      >
                        {isSendingWhatsAppTenant ? (
                          <ActivityIndicator size="small" color="#10b981" />
                        ) : (
                          <WhatsAppIcon size={20} color="#10b981" />
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => requestDeleteTenant(selectedTenant.id, selectedTenant.room_id)}
                        className="flex-1 bg-destructive rounded-xl h-12 items-center justify-center flex-row shadow-lg shadow-destructive/20 active:scale-95"
                      >
                        <View className="mr-1.5">
                          <Trash2 size={18} color="#ffffff" />
                        </View>
                        <Text className="text-white text-sm font-bold">Delete Record</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    // Standard Tenant: WhatsApp + Move Out + Edit Profile
                    <>
                      <TouchableOpacity
                        onPress={() => {
                          const phone = selectedTenant?.mobile_number
                          const tenantName = selectedTenant?.name || "Tenant"
                          void handleDirectWhatsAppChat(phone, tenantName)
                        }}
                        disabled={isSendingWhatsAppTenant}
                        className={`h-12 w-12 border rounded-xl items-center justify-center active:scale-95 ${
                          isSendingWhatsAppTenant 
                            ? "border-slate-300 bg-slate-100 dark:bg-slate-800 opacity-60" 
                            : "border-success/20 bg-success/5"
                        }`}
                      >
                        {isSendingWhatsAppTenant ? (
                          <ActivityIndicator size="small" color="#10b981" />
                        ) : (
                          <WhatsAppIcon size={20} color="#10b981" />
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          // Pre-fill with saved values for notice_period tenants
                          if (selectedTenant.status === "notice_period" && selectedTenant.exit_date) {
                            setMoveOutDate(selectedTenant.exit_date)
                            setDepositRefundAmount(
                              (selectedTenant.deposit_refund_amount ?? Math.floor((selectedTenant.deposit_amount || 0) * 0.5)).toString()
                            )
                          } else {
                            setMoveOutDate(new Date().toISOString().split("T")[0])
                            const fiftyPercent = Math.floor((selectedTenant.deposit_amount || 0) * 0.5)
                            setDepositRefundAmount(fiftyPercent.toString())
                          }

                          // Check if previous deduction was applied and if that payment is now paid
                          if (selectedTenant.deduction_payment_id) {
                            const deductedPayment = paymentHistory.find(p => p.id === selectedTenant.deduction_payment_id)
                            if (deductedPayment && deductedPayment.status === "paid") {
                              // Previously deducted payment is paid — lock deduction
                              setDeductionLocked(true)
                              setSelectedDeductionPayment(deductedPayment)
                              setDeductionMode(true)
                            } else if (deductedPayment) {
                              // Still unpaid — allow editing
                              setDeductionLocked(false)
                              setSelectedDeductionPayment(deductedPayment)
                              setDeductionMode(true)
                            } else {
                              setDeductionLocked(false)
                              setSelectedDeductionPayment(null)
                              setDeductionMode(false)
                            }
                          } else {
                            setDeductionLocked(false)
                            setSelectedDeductionPayment(null)
                            setDeductionMode(false)
                          }
                          setUpcomingPayments([])
                          setMoveOutModalVisible(true)
                        }}
                        className="flex-1 border border-primary/20 bg-primary/5 rounded-xl h-12 items-center justify-center flex-row active:scale-95"
                      >
                        <View className="mr-1.5">
                          <LogOut size={18} color={isDark ? "#0091ff" : "#0071df"} />
                        </View>
                        <Text className="text-primary text-sm font-extrabold">Move Out</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => openEditModal(selectedTenant)}
                        className="flex-1 bg-primary rounded-xl h-12 items-center justify-center flex-row shadow-lg shadow-primary/20 active:scale-95"
                      >
                        <View className="mr-1.5">
                          <Edit3 size={18} color="#ffffff" />
                        </View>
                        <Text className="text-white text-sm font-bold">Edit Profile</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            )}
          </View>
          {detailModalVisible && renderToast()}
        </View>
      </Modal>

      <Modal
        animationType="none"
        transparent={true}
        visible={formModalVisible}
        onRequestClose={() => setFormModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={0}
            className="w-full bg-card dark:bg-card-dark rounded-t-[36px] border-t border-border dark:border-border-dark overflow-hidden"
          >
            {(() => {
              const sheetMax = Math.min(
                height * 0.92,
                keyboardHeight > 0 ? height - keyboardHeight - insets.top : height * 0.85
              )
              return (
                <View
                  style={{ 
                    maxHeight: sheetMax,
                    paddingBottom: Math.max(24, insets.bottom)
                  }}
                  className="p-6"
                >
            {/* Header */}
            <View className="flex-row justify-between items-center mb-6">
              <View>
                <Text className="text-xl font-black text-foreground dark:text-foreground-dark">
                  {editingTenant ? `Edit ${editingTenant.name}` : "Add Occupant"}
                </Text>
                <Text className="text-xs text-muted mt-0.5 font-medium">Configure tenant profile</Text>
              </View>
              <TouchableOpacity
                onPress={() => setFormModalVisible(false)}
                className="h-10 w-10 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
              >
                <X size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {error && (
              <View className="bg-destructive/10 border border-destructive/20 p-3 rounded-xl mb-4">
                <Text className="text-destructive text-sm font-medium">{error}</Text>
              </View>
            )}

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} disableKeyboardPadding={true} contentContainerStyle={{ gap: 16, paddingBottom: 24 }} className="mb-6">
              {/* Full Name */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Tenant Name</Text>
                <TextInput
                  ref={nameInput.ref}
                  onFocus={nameInput.onFocus}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Alice Smith"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                />
              </View>

              {/* Mobile Number */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Mobile Number</Text>
                <TextInput
                  ref={mobileInput.ref}
                  onFocus={mobileInput.onFocus}
                  value={mobileNumber}
                  onChangeText={setMobileNumber}
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholder="10-digit number"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                />
              </View>

              {/* Email */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Email Address</Text>
                <TextInput
                  ref={emailInput.ref}
                  onFocus={emailInput.onFocus}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="e.g. alice@example.com"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                />
              </View>

              {/* Grid: Join Date & Rent Due Day */}
              <View className="flex-row gap-3 z-50" style={{ overflow: 'visible' }}>
                <View className="flex-1">
                  <ThemeDatePicker
                    value={joinDate}
                    onChange={setJoinDate}
                    label="Join Date"
                    placeholder="YYYY-MM-DD"
                  />
                </View>

                <View className="flex-1" style={{ overflow: 'visible', zIndex: 100 }}>
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Rent Due Day</Text>
                  <InlineSelect
                    options={rentDueDayOptions}
                    value={rentDueDay}
                    onChange={setRentDueDay}
                    defaultTriggerLabel="Select Day..."
                    isDark={isDark}
                    accent="neutral"
                    overlay={true}
                    open={openDropdown === "rent-due-day"}
                    onOpenChange={(o) => {
                      void Haptics.selectionAsync()
                      setOpenDropdown(o ? "rent-due-day" : null)
                    }}
                  />
                </View>
              </View>

              {/* Room Assignment (Search and Selected Chip) */}
              <View className="z-40">
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Room Assignment</Text>
                
                {selectedRoomId ? (() => {
                  const selectedRoom = rooms.find(r => r.id.toString() === selectedRoomId)
                  return (
                    <View className="border border-primary bg-primary/5 rounded-xl p-3 flex-row justify-between items-center">
                      <View className="flex-row items-center">
                        <Hotel size={18} className="text-primary mr-2" />
                        <View>
                          <Text className="text-sm font-extrabold text-foreground dark:text-foreground-dark">
                            Room {selectedRoom?.room_number || "—"}
                          </Text>
                          <Text className="text-xs text-muted mt-0.5">
                            {selectedRoom ? `${selectedRoom.occupied_beds}/${selectedRoom.total_beds} beds occupied · Rent: ₹${selectedRoom.rent_amount.toLocaleString()}` : ""}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedRoomId("")
                          setRoomSearchQuery("")
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        }}
                        className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center"
                      >
                        <X size={14} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  )
                })() : (
                  <View className="relative">
                    <View className="flex-row items-center border border-border dark:border-border-dark bg-background dark:bg-background-dark rounded-xl px-3 py-2.5 shadow-sm">
                      <Search size={16} color="#9ca3af" className="mr-2" />
                      <TextInput
                        value={roomSearchQuery}
                        onChangeText={setRoomSearchQuery}
                        placeholder="Search room by number..."
                        placeholderTextColor="#9ca3af"
                        className="flex-1 text-sm text-foreground dark:text-foreground-dark py-0.5"
                      />
                      {roomSearchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setRoomSearchQuery("")}>
                          <X size={16} color="#9ca3af" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Room Search Results Dropdown */}
                    {roomSearchQuery.length > 0 && (() => {
                      const query = roomSearchQuery.toLowerCase()
                      const filtered = availableRooms.filter(r => 
                        r.room_number.toLowerCase().includes(query)
                      )

                      return (
                        <View className="border border-border dark:border-border-dark bg-card dark:bg-card-dark rounded-xl overflow-hidden mt-1 max-h-40 z-50 shadow-lg">
                          <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                            {filtered.length === 0 ? (
                              <View className="p-3">
                                <Text className="text-xs text-muted text-center font-medium">No vacant rooms match your search</Text>
                              </View>
                            ) : (
                              filtered.map((room) => (
                                <TouchableOpacity
                                  key={room.id}
                                  onPress={() => {
                                    setSelectedRoomId(room.id.toString())
                                    setRoomSearchQuery("")
                                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                    // Focus deposit input to prevent keyboard from closing and guide user
                                    setTimeout(() => {
                                      depositInput.ref.current?.focus()
                                    }, 50)
                                  }}
                                  className="px-4 py-3 border-b border-border/40 dark:border-border-dark/40 flex-row justify-between items-center active:bg-muted/10"
                                >
                                  <View>
                                    <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">
                                      Room {room.room_number}
                                    </Text>
                                    <Text className="text-[10px] text-muted mt-0.5">
                                      {room.occupied_beds}/{room.total_beds} beds occupied · Rent: ₹{room.rent_amount.toLocaleString()}
                                    </Text>
                                  </View>
                                  <Plus size={14} color={isDark ? "#0091ff" : "#0071df"} />
                                </TouchableOpacity>
                              ))
                            )}
                          </ScrollView>
                        </View>
                      )
                    })()}
                  </View>
                )}
              </View>

              {/* Grid: Deposit & Extra Charges */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Deposit (₹)</Text>
                  <TextInput
                    ref={depositInput.ref}
                    onFocus={depositInput.onFocus}
                    value={depositAmount}
                    onChangeText={setDepositAmount}
                    keyboardType="numeric"
                    placeholder="10000"
                    placeholderTextColor="#9ca3af"
                    className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                  />
                </View>

                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Extra Charges (₹)</Text>
                  <TextInput
                    ref={extraChargesInput.ref}
                    onFocus={extraChargesInput.onFocus}
                    value={extraCharges}
                    onChangeText={setExtraCharges}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                    className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                  />
                </View>
              </View>

              {/* Identity Documents / Identity Request */}
              <View className="z-30">
                {chatbotEnabled ? (
                  <>
                    <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Reminders</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setRequestIdentityFromTenant((v) => !v)
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      }}
                      activeOpacity={0.7}
                      className="flex-row items-center gap-3 border border-border dark:border-border-dark p-3.5 rounded-xl bg-background dark:bg-background-dark"
                    >
                      <View className={`h-6 w-6 rounded-md border-2 items-center justify-center ${requestIdentityFromTenant ? "bg-primary border-primary" : "border-border dark:border-border-dark"}`}>
                        {requestIdentityFromTenant && <Check size={14} color="#ffffff" strokeWidth={3} />}
                      </View>
                      <Text className="flex-1 text-sm font-semibold text-foreground dark:text-foreground-dark">Request identity from tenant</Text>
                    </TouchableOpacity>

                    {(() => {
                      const depositValue = parseInt(depositAmount, 10) || 0
                      const depositDisabled = depositValue <= 0
                      return (
                        <TouchableOpacity
                          onPress={() => {
                            if (depositDisabled) return
                            setRequestDepositPayment((v) => !v)
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          }}
                          activeOpacity={depositDisabled ? 1 : 0.7}
                          className={`flex-row items-center gap-3 border border-border dark:border-border-dark p-3.5 rounded-xl bg-background dark:bg-background-dark mt-2.5 ${depositDisabled ? "opacity-50" : ""}`}
                        >
                          <View className={`h-6 w-6 rounded-md border-2 items-center justify-center ${requestDepositPayment && !depositDisabled ? "bg-primary border-primary" : "border-border dark:border-border-dark"}`}>
                            {requestDepositPayment && !depositDisabled && <Check size={14} color="#ffffff" strokeWidth={3} />}
                          </View>
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">Create deposit payment record & send reminder</Text>
                            <Text className="text-xs text-muted dark:text-muted-dark mt-0.5">
                              {depositDisabled
                                ? "Enter a deposit amount above to enable this."
                                : `Adds a pending deposit fee of ₹${depositValue} and sends a payment reminder.`}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      )
                    })()}

                    {(() => {
                      const inviteLink = ownerSettings?.whatsapp_invite_link
                      const inviteDisabled = !inviteLink
                      return (
                        <TouchableOpacity
                          onPress={() => {
                            if (inviteDisabled) return
                            setIncludeWhatsappInvite((v) => !v)
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          }}
                          activeOpacity={inviteDisabled ? 1 : 0.7}
                          className={`flex-row items-center gap-3 border border-border dark:border-border-dark p-3.5 rounded-xl bg-background dark:bg-background-dark mt-2.5 ${inviteDisabled ? "opacity-50" : ""}`}
                        >
                          <View className={`h-6 w-6 rounded-md border-2 items-center justify-center ${includeWhatsappInvite && !inviteDisabled ? "bg-primary border-primary" : "border-border dark:border-border-dark"}`}>
                            {includeWhatsappInvite && !inviteDisabled && <Check size={14} color="#ffffff" strokeWidth={3} />}
                          </View>
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">Include WhatsApp group invite link</Text>
                            <Text className="text-xs text-muted dark:text-muted-dark mt-0.5">
                              {inviteDisabled
                                ? "Set a WhatsApp invite link in Settings to enable this."
                                : "Invites the tenant to join your WhatsApp group."}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      )
                    })()}
                  </>
                ) : (
                  <>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Identity Documents (Max 2)</Text>
                
                {/* Document Previews */}
                {idDocs.length > 0 && (
                  <View className="gap-2.5 mb-3">
                    {idDocs.map((doc, idx) => {
                      const previewUri = getDocPreviewUri(doc)
                      return (
                        <View key={idx} className="flex-row items-center border border-border dark:border-border-dark p-2.5 rounded-xl bg-background dark:bg-background-dark">
                          {previewUri ? (
                            <Image 
                              source={{ uri: previewUri }} 
                              className="w-10 h-10 rounded-lg bg-muted object-cover mr-3" 
                            />
                          ) : (
                            <View className="w-10 h-10 rounded-lg bg-muted items-center justify-center mr-3">
                              <User size={16} color="#9ca3af" />
                            </View>
                          )}
                          <View className="flex-1 min-w-0 mr-2">
                            <Text className="text-xs font-bold text-foreground dark:text-foreground-dark truncate">
                              {doc.type}
                            </Text>
                            <Text className="text-[10px] text-muted truncate mt-0.5">
                              {doc.name}
                            </Text>
                          </View>
                          {doc.type === "Driving License" ? (
                            <View className="flex-row items-center gap-1 px-2 h-8 rounded-full bg-muted/10">
                              <Lock size={12} color="#9ca3af" />
                              <Text className="text-[9px] font-bold text-muted uppercase tracking-wider">Read-only</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              onPress={() => {
                                setIdDocs((prev) => prev.filter((_, i) => i !== idx))
                                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                              }}
                              className="h-8 w-8 items-center justify-center active:bg-muted/10 rounded-full"
                            >
                              <Trash2 size={16} color="#ef4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                      )
                    })}
                  </View>
                )}

                {/* Doc Picker & Upload Trigger */}
                {idDocs.length < 2 && (
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <InlineSelect
                        options={[
                          { value: "Aadhaar Card", shortLabel: "Aadhaar Card" },
                          { value: "PAN Card", shortLabel: "PAN Card" }
                        ].filter(opt => !idDocs.some(d => d.type === opt.value))}
                        value={selectedIdType}
                        onChange={setSelectedIdType}
                        defaultTriggerLabel="Select ID Type..."
                        isDark={isDark}
                        accent="neutral"
                        overlay={false}
                        open={openDropdown === "id-type"}
                        onOpenChange={(o) => {
                          void Haptics.selectionAsync()
                          setOpenDropdown(o ? "id-type" : null)
                        }}
                      />
                    </View>
                    
                    <View className="flex-row gap-1.5 shrink-0">
                      <TouchableOpacity
                        onPress={() => pickIdImage(true)}
                        disabled={!selectedIdType}
                        className={`h-11 px-3.5 rounded-xl border border-border dark:border-border-dark bg-background dark:bg-background-dark items-center justify-center active:scale-95 ${
                          !selectedIdType ? "opacity-40" : ""
                        }`}
                      >
                        <Camera size={18} color={isDark ? "#e2e8f0" : "#475569"} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => pickIdImage(false)}
                        disabled={!selectedIdType}
                        className={`h-11 px-3.5 rounded-xl border border-border dark:border-border-dark bg-background dark:bg-background-dark items-center justify-center active:scale-95 ${
                          !selectedIdType ? "opacity-40" : ""
                        }`}
                      >
                        <Upload size={18} color={isDark ? "#e2e8f0" : "#475569"} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                  </>
                )}
              </View>

              {/* Notes */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Custom Notes</Text>
                <TextInput
                  ref={notesInput.ref}
                  onFocus={notesInput.onFocus}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Office address, emergency contact, ID card ref..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={2}
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark h-20 text-left"
                />
              </View>
            </KeyboardAwareScrollView>

            {/* Actions */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setFormModalVisible(false)}
                className="flex-1 border border-border dark:border-border-dark rounded-xl py-3.5 items-center justify-center bg-background dark:bg-background-dark"
              >
                <Text className="text-muted dark:text-muted-dark text-sm font-bold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveTenant}
                disabled={isSaving}
                className={`flex-1 bg-primary rounded-xl py-3.5 items-center justify-center shadow-lg shadow-primary/20 ${
                  isSaving ? "opacity-50" : ""
                }`}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white text-sm font-bold">Save Occupant</Text>
                )}
              </TouchableOpacity>
            </View>
                </View>
              )
            })()}
          </KeyboardAvoidingView>
          {formModalVisible && renderToast()}
        </View>
      </Modal>

      {/* Document Viewer Modal */}
      <Modal
        animationType="none"
        transparent={true}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
      >
        <SafeAreaView className="flex-1 bg-black justify-center items-center" edges={[]}>
          {/* Backdrop Touch (Tapping empty black area closes the modal) */}
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={() => setViewerVisible(false)}
            className="absolute inset-0 bg-black justify-center items-center"
          >
            {/* Header overlay */}
            <SafeAreaView className="absolute top-0 left-0 right-0 z-50 flex-row justify-between items-center px-6 py-4 bg-black/60 border-b border-white/5" edges={["top"]}>
              <Text className="text-white text-base font-extrabold tracking-tight">{viewerTitle}</Text>
              <TouchableOpacity
                onPress={() => setViewerVisible(false)}
                className="h-10 w-10 bg-white/10 rounded-full items-center justify-center border border-white/10"
              >
                <X size={20} color="#ffffff" />
              </TouchableOpacity>
            </SafeAreaView>

            {/* Loading Indicator */}
            {viewerLoading && (
              <View className="absolute items-center justify-center z-10">
                <ActivityIndicator size="large" color="#ffffff" />
                <Text className="text-white text-xs mt-3 opacity-60 font-medium">Retrieving document securely...</Text>
              </View>
            )}

            {/* Image Wrapper (Tapping the image does NOT close the modal) */}
            <TouchableOpacity 
              activeOpacity={1} 
              className="w-full h-[80%] items-center justify-center"
            >
              {viewerImageUri && !viewerLoading && (
                <Image
                  source={{ uri: viewerImageUri }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="contain"
                />
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* Identity Document Viewer Modal (front/back) — Req 17 */}
      <Modal
        animationType="none"
        transparent={true}
        visible={idViewerVisible}
        onRequestClose={() => setIdViewerVisible(false)}
      >
        <SafeAreaView className="flex-1 bg-black justify-center items-center" edges={[]}>
          {/* Backdrop (tap empty area to close — retains the identity section, Req 17.5) */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setIdViewerVisible(false)}
            className="absolute inset-0 bg-black justify-center items-center"
          >
            {/* Header overlay */}
            <SafeAreaView className="absolute top-0 left-0 right-0 z-50 flex-row justify-between items-center px-6 py-4 bg-black/60 border-b border-white/5" edges={["top"]}>
              <Text className="text-white text-base font-extrabold tracking-tight">
                {idViewerSide === "front" ? "Identity — Front" : "Identity — Back"}
              </Text>
              <TouchableOpacity
                onPress={() => setIdViewerVisible(false)}
                className="h-10 w-10 bg-white/10 rounded-full items-center justify-center border border-white/10"
                accessibilityLabel="Close document viewer"
              >
                <X size={20} color="#ffffff" />
              </TouchableOpacity>
            </SafeAreaView>

            {/* Loading Indicator */}
            {idViewerLoading && (
              <View className="absolute items-center justify-center z-10">
                <ActivityIndicator size="large" color="#ffffff" />
                <Text className="text-white text-xs mt-3 opacity-60 font-medium">Retrieving document securely...</Text>
              </View>
            )}

            {/* Image / error placeholder (tap does not close) */}
            <TouchableOpacity
              activeOpacity={1}
              className="w-full h-[80%] items-center justify-center px-6"
            >
              {!idViewerLoading && (() => {
                const currentUrl = idViewerSide === "front" ? idFrontUrl : idBackUrl
                const currentError = idViewerSide === "front" ? idFrontError : idBackError

                // Inline error placeholder for an image that failed to load
                // (signing failed or the image source errored) (Req 17.6).
                if (currentError || !currentUrl) {
                  return (
                    <View className="items-center justify-center">
                      <View className="h-16 w-16 rounded-full bg-white/10 items-center justify-center border border-white/10 mb-4">
                        <AlertTriangle size={28} color="#f87171" />
                      </View>
                      <Text className="text-white text-sm font-bold mb-1">Image unavailable</Text>
                      <Text className="text-white/60 text-xs text-center">
                        This {idViewerSide} document could not be loaded.
                      </Text>
                    </View>
                  )
                }

                return (
                  <Image
                    source={{ uri: currentUrl }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="contain"
                    onError={() => {
                      if (idViewerSide === "front") {
                        setIdFrontError(true)
                      } else {
                        setIdBackError(true)
                      }
                    }}
                  />
                )
              })()}
            </TouchableOpacity>

            {/* Slide control — only when BOTH images exist (Reqs 17.3, 17.4) */}
            {selectedTenant && viewerHasSlideControl(selectedTenant.id_front_path, selectedTenant.id_back_path) && (
              <TouchableOpacity activeOpacity={1} className="absolute bottom-12 self-center">
                <View className="flex-row bg-white/10 rounded-full p-1 border border-white/10">
                  <TouchableOpacity
                    onPress={() => setIdViewerSide("front")}
                    className={`px-6 py-2.5 rounded-full ${idViewerSide === "front" ? "bg-white" : ""}`}
                    accessibilityLabel="Show front image"
                    accessibilityRole="button"
                  >
                    <Text className={`text-xs font-extrabold ${idViewerSide === "front" ? "text-black" : "text-white"}`}>
                      Front
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setIdViewerSide("back")}
                    className={`px-6 py-2.5 rounded-full ${idViewerSide === "back" ? "bg-white" : ""}`}
                    accessibilityLabel="Show back image"
                    accessibilityRole="button"
                  >
                    <Text className={`text-xs font-extrabold ${idViewerSide === "back" ? "text-black" : "text-white"}`}>
                      Back
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* Confirm Delete Tenant Modal */}
      <ConfirmModal
        visible={confirmModalVisible}
        title="Delete Occupant"
        message="Are you sure you want to delete this occupant from the directory? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={confirmDeleteTenant}
        onCancel={() => {
          setConfirmModalVisible(false)
          setTenantToDelete(null)
        }}
        icon={<Trash2 size={24} color="#ef4444" />}
      />

      {/* Confirm Ignore Identity Modal (distinct from the delete flow) */}
      <ConfirmModal
        visible={ignoreConfirmVisible}
        title="Ignore Identity"
        message="Stop sending daily identity verification reminders to this occupant? You can still view any documents they have already submitted."
        confirmText="Ignore"
        cancelText="Cancel"
        isDestructive={false}
        onConfirm={confirmIgnoreIdentity}
        onCancel={() => setIgnoreConfirmVisible(false)}
        icon={<Info size={24} color="#208aef" />}
      />

      {/* Move Out Flow Modal */}
      <Modal
        animationType="none"
        transparent={true}
        visible={moveOutModalVisible}
        onRequestClose={() => setMoveOutModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={0}
            className="w-full bg-card dark:bg-card-dark rounded-t-[36px] border-t border-border dark:border-border-dark overflow-hidden"
          >
            {selectedTenant && (() => {
              const unpaidPayments = paymentHistory.filter(
                p => p.status === "pending" || p.status === "late" || p.status === "submitted"
              )
              const unpaidTotal = unpaidPayments.reduce((acc, curr) => acc + (curr.rent_amount || 0) + (curr.extra_charges || 0), 0)
              
              return (
                <View 
                  style={{ paddingBottom: Math.max(24, insets.bottom) }}
                  className="p-6"
                >
                  {/* Header */}
                  <View className="flex-row justify-between items-center mb-6">
                    <View>
                      <Text className="text-xl font-black text-foreground dark:text-foreground-dark">
                        Schedule Move Out
                      </Text>
                      <Text className="text-xs text-muted mt-0.5 font-medium">Configure move out details for {selectedTenant.name}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setMoveOutModalVisible(false)}
                      className="h-10 w-10 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
                    >
                      <X size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 24 }} className="mb-6 max-h-[480px]">
                    {/* Date Picker */}
                    <ThemeDatePicker
                      value={moveOutDate}
                      onChange={(date) => {
                        setMoveOutDate(date)
                        // Only auto-set refund for fresh move-outs (not already in notice_period)
                        if (selectedTenant.status !== "notice_period" && !deductionLocked) {
                          const todayStr = new Date().toISOString().split("T")[0]
                          if (date > todayStr) {
                            const fiftyPercent = Math.floor((selectedTenant.deposit_amount || 0) * 0.5)
                            setDepositRefundAmount(fiftyPercent.toString())
                          } else {
                            if (unpaidTotal > 0) {
                              const calculated = Math.max((selectedTenant.deposit_amount || 0) - unpaidTotal, 0)
                              setDepositRefundAmount(calculated.toString())
                            } else {
                              const fiftyPercent = Math.floor((selectedTenant.deposit_amount || 0) * 0.5)
                              setDepositRefundAmount(fiftyPercent.toString())
                            }
                          }
                        }
                      }}
                      label="Move Out Date"
                      placeholder="YYYY-MM-DD"
                    />

                    {/* Unresolved Dues Warning + Deduction UI */}
                    {(() => {
                      const allDeductiblePayments = [
                        ...unpaidPayments,
                        ...upcomingPayments,
                      ]
                      const refundAmt = parseFloat(depositRefundAmount) || 0

                      return allDeductiblePayments.length > 0 || deductionMode ? (
                        <View className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-3xl gap-3">
                          <View className="flex-row items-center gap-2">
                            <AlertTriangle size={18} color="#f59e0b" />
                            <Text className="text-sm font-extrabold text-amber-600 dark:text-amber-400">
                              {deductionLocked ? "Deposit Deduction Applied" : "Unresolved Dues Detected"}
                            </Text>
                          </View>

                          {deductionLocked ? (
                            <View className="flex-row items-center gap-2 bg-amber-500/10 p-3 rounded-xl">
                              <Lock size={14} color="#f59e0b" />
                              <Text className="text-xs text-amber-600 dark:text-amber-400 font-medium flex-1">
                                The previously deducted payment has been paid. Deduction settings are locked.
                              </Text>
                            </View>
                          ) : (
                            <>
                              <Text className="text-xs text-muted dark:text-muted-dark leading-relaxed">
                                This occupant has <Text className="font-bold text-foreground dark:text-foreground-dark">{unpaidPayments.length} unpaid billing record{unpaidPayments.length !== 1 ? "s" : ""}</Text> totaling <Text className="font-bold text-foreground dark:text-foreground-dark">₹{unpaidTotal.toLocaleString()}</Text>.
                              </Text>

                              <View className="flex-row gap-2 mt-1">
                                <TouchableOpacity
                                  onPress={handleQuickSettleDues}
                                  disabled={isSettlingDues}
                                  className="bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 rounded-xl flex-1 items-center justify-center active:scale-95"
                                >
                                  {isSettlingDues ? (
                                    <ActivityIndicator size="small" color="#f59e0b" />
                                  ) : (
                                    <Text className="text-amber-600 dark:text-amber-400 text-xs font-bold">
                                      Settle Dues (Cash)
                                    </Text>
                                  )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                  onPress={() => {
                                    const newMode = !deductionMode
                                    setDeductionMode(newMode)
                                    if (newMode) {
                                      computeUpcomingPayments()
                                    }
                                  }}
                                  className={`border px-4 py-2.5 rounded-xl flex-1 items-center justify-center active:scale-95 ${
                                    deductionMode
                                      ? "bg-primary/20 border-primary/40"
                                      : "bg-primary/10 border-primary/20"
                                  }`}
                                >
                                  <Text className="text-primary text-xs font-bold">
                                    {deductionMode ? "Hide Records" : "Deduct from Deposit"}
                                  </Text>
                                </TouchableOpacity>
                              </View>

                              {/* Selectable Payment Records */}
                              {deductionMode && (
                                <View className="mt-2 gap-2">
                                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider">
                                    Select a record to deduct ₹{refundAmt.toLocaleString()} from
                                  </Text>
                                  {allDeductiblePayments.map((payment, index) => {
                                    const isSelected = selectedDeductionPayment &&
                                      (payment.id
                                        ? payment.id === selectedDeductionPayment.id
                                        : payment.month === selectedDeductionPayment.month && payment.year === selectedDeductionPayment.year && payment.isUpcoming)
                                    const deductedTotal = Math.max(payment.total_amount - refundAmt, 0)
                                    const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                                    const label = payment.isUpcoming
                                      ? `Upcoming — ${monthNames[payment.month]} ${payment.year}`
                                      : `${payment.status === "late" ? "Late" : payment.status === "submitted" ? "Submitted" : "Pending"} — ${monthNames[payment.month]} ${payment.year}`

                                    return (
                                      <TouchableOpacity
                                        key={payment.id || `upcoming-${payment.month}-${payment.year}`}
                                        onPress={() => {
                                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                          setSelectedDeductionPayment(payment)
                                        }}
                                        className={`flex-row items-center p-3 rounded-xl border ${
                                          isSelected
                                            ? "border-primary/40 bg-primary/10"
                                            : "border-border/40 dark:border-border-dark/40 bg-background/50 dark:bg-background-dark/50"
                                        }`}
                                      >
                                        {/* Radio indicator */}
                                        <View className={`h-5 w-5 rounded-full border-2 mr-3 items-center justify-center ${
                                          isSelected ? "border-primary" : "border-muted/30"
                                        }`}>
                                          {isSelected && (
                                            <View className="h-2.5 w-2.5 rounded-full bg-primary" />
                                          )}
                                        </View>

                                        {/* Payment info */}
                                        <View className="flex-1">
                                          <View className="flex-row items-center gap-1.5">
                                            {payment.isUpcoming && (
                                              <Clock size={12} color={isDark ? "#0091ff" : "#0071df"} />
                                            )}
                                            <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">
                                              {label}
                                            </Text>
                                          </View>
                                          {payment.isUpcoming && (
                                            <Text className="text-[10px] text-muted mt-0.5">Due: {payment.due_date}</Text>
                                          )}
                                        </View>

                                        {/* Price */}
                                        <View className="items-end">
                                          {isSelected && refundAmt > 0 ? (
                                            <>
                                              <Text className="text-xs text-muted line-through">
                                                ₹{payment.total_amount.toLocaleString()}
                                              </Text>
                                              <Text className="text-sm font-extrabold text-primary">
                                                ₹{deductedTotal.toLocaleString()}
                                              </Text>
                                            </>
                                          ) : (
                                            <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                                              ₹{payment.total_amount.toLocaleString()}
                                            </Text>
                                          )}
                                        </View>
                                      </TouchableOpacity>
                                    )
                                  })}

                                  {allDeductiblePayments.length === 0 && (
                                    <Text className="text-xs text-muted text-center py-3">
                                      No payment records available for deduction.
                                    </Text>
                                  )}
                                </View>
                              )}
                            </>
                          )}
                        </View>
                      ) : null
                    })()}

                    {/* Refund Amount Input */}
                    <View>
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-[10px] font-bold text-muted uppercase tracking-wider">Refund Amount (₹)</Text>
                        <Text className="text-[10px] font-bold text-muted uppercase tracking-wider">
                          Deposit: ₹{(selectedTenant.deposit_amount || 0).toLocaleString()}
                        </Text>
                      </View>
                      <TextInput
                        value={depositRefundAmount}
                        onChangeText={setDepositRefundAmount}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#9ca3af"
                        editable={!deductionLocked}
                        className={`border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark ${
                          deductionLocked ? "opacity-50" : ""
                        }`}
                      />
                      <Text className="text-[10px] text-muted italic mt-1.5 leading-relaxed">
                        {deductionLocked
                          ? "Refund amount is locked because the deducted payment has been paid."
                          : "Specify how much of the security deposit should be returned to the occupant upon checkout."}
                      </Text>
                    </View>
                  </ScrollView>

                  {/* Actions */}
                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      onPress={() => setMoveOutModalVisible(false)}
                      className="flex-1 border border-border dark:border-border-dark rounded-xl py-3.5 items-center justify-center bg-background dark:bg-background-dark"
                    >
                      <Text className="text-muted dark:text-muted-dark text-sm font-bold">Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleConfirmMoveOut}
                      disabled={isCheckingOut}
                      className={`flex-1 bg-primary rounded-xl py-3.5 items-center justify-center shadow-lg shadow-primary/20 ${
                        isCheckingOut ? "opacity-50" : ""
                      }`}
                    >
                      {isCheckingOut ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text className="text-white text-sm font-bold">Confirm Move Out</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })()}
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Drawer 1.5: Payment Detail Sheet */}
      <Modal
        animationType="none"
        transparent={true}
        statusBarTranslucent={true}
        navigationBarTranslucent={true}
        visible={paymentDetailVisible}
        onRequestClose={() => setPaymentDetailVisible(false)}
      >
        <View className="flex-1 justify-end">
          {/* Backdrop Overlay */}
          <TouchableOpacity 
            activeOpacity={1}
            onPress={() => setPaymentDetailVisible(false)}
            className="absolute inset-0 bg-black/60"
          />
          {/* Bottom edge fill to cover nav bar gap */}
          <View className="absolute bottom-0 left-0 right-0 h-12 bg-card dark:bg-card-dark" />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={0}
            className="w-full"
          >
            <View 
              className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[96%] border-t border-border dark:border-border-dark px-6 pt-6 flex-col" 
              style={{ paddingBottom: Platform.OS === "ios" ? Math.max(insets.bottom, 4) : 4 }}
            >
            {selectedPaymentDetail && (() => {
              const payment = selectedPaymentDetail
              const total = (payment.rent_amount || 0) + (payment.extra_charges || 0)
              const months = [
                "", "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
              ]
              const monthStr = months[payment.month] || "Month"
              
              let badgeColor = "bg-success/10 text-success"
              if (payment.status === "late") badgeColor = "bg-destructive/10 text-destructive"
              if (payment.status === "pending") badgeColor = "bg-warning/10 text-warning"
              if (payment.status === "submitted") badgeColor = "bg-primary/10 text-primary"

              return (
                <View className="flex-col max-h-full">
                  {/* Header */}
                  <View className="flex-row justify-between items-start mb-5">
                    <View className="flex-1 pr-2">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-xs font-extrabold text-muted uppercase tracking-wider">Transaction Record</Text>
                        <View className={`px-2 py-0.5 rounded border capitalize ${
                          payment.status === "paid" 
                            ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30" 
                            : payment.status === "late" 
                              ? "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30" 
                              : payment.status === "submitted"
                                ? "bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30"
                                : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30"
                        }`}>
                          <Text className={`text-[9px] font-black uppercase ${
                            payment.status === "paid" 
                              ? "text-emerald-600 dark:text-emerald-400" 
                              : payment.status === "late" 
                                ? "text-rose-600 dark:text-rose-400" 
                                : payment.status === "submitted"
                                  ? "text-purple-600 dark:text-purple-400"
                                  : "text-amber-600 dark:text-amber-400"
                          }`}>{payment.status}</Text>
                        </View>
                      </View>
                      <Text className="text-2xl font-black text-foreground dark:text-foreground-dark mt-1">
                        ₹{total.toLocaleString()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setPaymentDetailVisible(false)}
                      className="h-10 w-10 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
                    >
                      <X size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView 
                    showsVerticalScrollIndicator={false} 
                    contentContainerStyle={{ gap: 14, paddingBottom: 24 }} 
                    className="flex-shrink flex-grow-0 mb-2"
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
                          <View className={`h-8 w-[2px] ${payment.status === "paid" ? "bg-success" : "bg-muted/30"}`} />
                        </View>
                        <View>
                          <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Invoice Generated</Text>
                          <Text className="text-[10px] text-muted font-medium mt-0.5">Due date {payment.due_date}</Text>
                        </View>
                      </View>

                      {/* Step 2 */}
                      <View className="flex-row items-start">
                        <View className="items-center mr-3">
                          <View className={`h-5 w-5 rounded-full items-center justify-center z-10 ${
                            (payment.status === "submitted" || payment.status === "paid") ? "bg-success" : "bg-muted/20"
                          }`}>
                            {(payment.status === "submitted" || payment.status === "paid") ? (
                              <Check size={10} color="#ffffff" strokeWidth={3} />
                            ) : (
                              <Clock size={10} color="#9ca3af" />
                            )}
                          </View>
                          <View className={`h-8 w-[2px] ${payment.verified_at ? "bg-success" : "bg-muted/30"}`} />
                        </View>
                        <View>
                          <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Payment Submitted</Text>
                          <Text className="text-[10px] text-muted font-medium mt-0.5">
                            {payment.status === "paid" && payment.paid_at 
                              ? `Received ${new Date(payment.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` 
                              : "Payment under review"}
                          </Text>
                        </View>
                      </View>

                      {/* Step 3 */}
                      <View className="flex-row items-start">
                        <View className="items-center mr-3">
                          <View className={`h-5 w-5 rounded-full items-center justify-center z-10 ${
                            payment.verified_at ? "bg-success" : "bg-muted/20"
                          }`}>
                            <ShieldCheck size={10} color={payment.verified_at ? "#ffffff" : "#9ca3af"} />
                          </View>
                        </View>
                        <View>
                          <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Audit & Verified</Text>
                          <Text className="text-[10px] text-muted font-medium mt-0.5">
                            {payment.verified_at ? "Ledger record verified" : "Awaiting verification"}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {/* Breakdown Split Box */}
                    <View className="bg-muted/10 border border-border dark:border-border-dark p-4 rounded-3xl gap-2.5">
                      <Text className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-1">Fee Breakdown</Text>
                      
                      <View className="flex-row justify-between items-center">
                        <Text className="text-xs text-muted font-medium">Base Rent</Text>
                        <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">₹{payment.rent_amount.toLocaleString()}</Text>
                      </View>

                      {(payment.extra_charges ?? 0) > 0 && (
                        <View className="flex-row justify-between items-center">
                          <Text className="text-xs text-destructive font-medium flex-row items-center">
                            <AlertTriangle size={10} color="#ef4444" /> Extra Charges
                          </Text>
                          <Text className="text-sm font-bold text-destructive">+ ₹{(payment.extra_charges ?? 0).toLocaleString()}</Text>
                        </View>
                      )}

                      <View className="border-t border-border dark:border-border-dark pt-2.5 flex-row justify-between items-center">
                        <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Total Rent Amount</Text>
                        <Text className="text-sm font-black text-foreground dark:text-foreground-dark">₹{total.toLocaleString()}</Text>
                      </View>
                    </View>

                    {/* Verification & Screenshot Proof Section */}
                    {payment.screenshot_path && (
                      <View className="bg-purple-500/5 border border-purple-500/10 p-4 rounded-3xl gap-3">
                        <Text className="text-[10px] font-extrabold uppercase tracking-widest text-purple-600 dark:text-purple-400">Payment Verification Proof</Text>
                        
                        {loadingScreenshot ? (
                          <View className="h-44 bg-muted/20 rounded-2xl items-center justify-center">
                            <ActivityIndicator size="small" color="#8b5cf6" />
                          </View>
                        ) : signedScreenshotUrl ? (
                          <TouchableOpacity 
                            onPress={() => {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                              setViewerTitle(`Receipt: ${monthStr} ${payment.year}`)
                              setViewerImageUri(signedScreenshotUrl)
                              setViewerLoading(false)
                              setViewerVisible(true)
                            }}
                            className="h-44 rounded-2xl overflow-hidden border border-purple-500/20 relative group bg-black"
                          >
                            <Image 
                              source={{ uri: signedScreenshotUrl }} 
                              className="w-full h-full object-cover opacity-90"
                            />
                            <View className="absolute inset-0 bg-black/40 flex items-center justify-center">
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
                        {payment.utr_number && (
                          <View className="mt-1 border-t border-purple-500/10 pt-3 gap-1">
                            <View className="flex-row justify-between items-center">
                              <Text className="text-[11px] font-bold text-muted">UTR / Transaction Code</Text>
                              <TouchableOpacity 
                                onPress={() => {
                                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                                  Clipboard.setString(payment.utr_number || "")
                                  showToast("UTR Copied", "Transaction reference has been copied.", "success")
                                }}
                                className="bg-purple-500/10 px-2.5 py-1 rounded-lg flex-row items-center gap-1.5 active:scale-95"
                              >
                                <Text className="font-mono text-xs font-black text-purple-600 dark:text-purple-400">
                                  {payment.utr_number}
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
                            {payment.payment_code || "—"}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Rejection Notes Area */}
                    {rejectingMode && (
                      <View className="bg-destructive/5 border border-destructive/10 p-4 rounded-3xl gap-3 mb-3">
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
                            onPress={() => handleRejectPayment(payment)}
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
                        <Text className="text-xs font-black text-foreground dark:text-foreground-dark">{selectedTenant?.name || "Occupant"}</Text>
                      </View>
                      
                      <View className="flex-row justify-between py-1.5 border-b border-border/20 dark:border-border-dark/20">
                        <Text className="text-xs text-muted font-bold">Room Reference</Text>
                        <Text className="text-xs font-black text-foreground dark:text-foreground-dark">Room {selectedTenant?.rooms_table?.room_number || "—"}</Text>
                      </View>

                      <View className="flex-row justify-between py-1.5 border-b border-border/20 dark:border-border-dark/20">
                        <Text className="text-xs text-muted font-bold">Billing Month</Text>
                        <Text className="text-xs font-black text-foreground dark:text-foreground-dark">{monthStr} {payment.year}</Text>
                      </View>

                      <View className="flex-row justify-between py-1.5 border-b border-border/20 dark:border-border-dark/20">
                        <Text className="text-xs text-muted font-bold">Due Date</Text>
                        <Text className="text-xs font-black text-foreground dark:text-foreground-dark">{payment.due_date || "—"}</Text>
                      </View>

                      {payment.status === "paid" && (
                        <>
                          <View className="flex-row justify-between py-1.5 border-b border-border/20 dark:border-border-dark/20">
                            <Text className="text-xs text-muted font-bold">Paid At</Text>
                            <Text className="text-xs font-black text-foreground dark:text-foreground-dark">{payment.paid_at || "—"}</Text>
                          </View>
                          <View className="flex-row justify-between py-1.5 border-b border-border/20 dark:border-border-dark/20">
                            <Text className="text-xs text-muted font-bold">Payment Method</Text>
                            <Text className="text-xs font-black text-foreground dark:text-foreground-dark capitalize">{payment.payment_method || "—"}</Text>
                          </View>
                        </>
                      )}

                      {payment.verification_notes && (
                        <View className="py-1.5">
                          <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Rejection Feedback Notes</Text>
                          <Text className="text-xs text-foreground dark:text-foreground-dark font-medium leading-4 bg-muted/10 p-3.5 rounded-xl border border-border dark:border-border-dark">
                            {payment.verification_notes}
                          </Text>
                        </View>
                      )}
                    </View>
                  </ScrollView>

                  {/* Primary Actions Drawer Footer */}
                  <View className="flex-row gap-3 border-t border-border/40 pt-2 flex-wrap pb-0">
                    {/* Delete Button */}
                    <TouchableOpacity
                      onPress={() => requestDeletePayment(payment.id)}
                      className="h-12 w-12 border border-destructive/20 bg-destructive/5 rounded-xl items-center justify-center active:scale-95"
                    >
                      <Trash2 size={18} color="#ef4444" />
                    </TouchableOpacity>

                    {/* WhatsApp Reminder Button */}
                    {(payment.status === "pending" || payment.status === "late") && (
                      <TouchableOpacity
                        onPress={handleWhatsAppReminder}
                        disabled={isSendingWhatsAppPayment}
                        className={`h-12 w-12 border rounded-xl items-center justify-center active:scale-95 ${
                          isSendingWhatsAppPayment 
                            ? "border-slate-300 bg-slate-100 dark:bg-slate-800 opacity-60" 
                            : "border-success/20 bg-success/5"
                        }`}
                      >
                        {isSendingWhatsAppPayment ? (
                          <ActivityIndicator size="small" color="#10b981" />
                        ) : (
                          <WhatsAppIcon size={18} color="#10b981" />
                        )}
                      </TouchableOpacity>
                    )}

                    {/* Submitted State Approval Verification Controls */}
                    {payment.status === "submitted" && !rejectingMode ? (
                      <>
                        <TouchableOpacity
                          onPress={() => setRejectingMode(true)}
                          className="flex-1 border border-destructive/20 bg-destructive/5 rounded-xl h-12 items-center justify-center active:scale-95"
                        >
                          <Text className="text-destructive font-black text-sm">Reject</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          onPress={() => handleApprovePayment(payment)}
                          className="flex-1 bg-success rounded-xl h-12 items-center justify-center active:scale-95"
                        >
                          <Text className="text-white font-black text-sm">Approve</Text>
                        </TouchableOpacity>
                      </>
                    ) : payment.status !== "paid" ? (
                      <TouchableOpacity
                        onPress={() => handleMarkAsPaid(payment.id)}
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
              )
            })()}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal 2: Change Room Modal */}
      <Modal
        animationType="none"
        transparent={true}
        visible={changeRoomModalVisible}
        onRequestClose={() => setChangeRoomModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[80%] border-t border-border dark:border-border-dark p-6">
            
            {changeRoomSelectedRoomId === null ? (
              <>
                <View className="flex-row justify-between items-center mb-6">
                  <View>
                    <Text className="text-lg font-black text-foreground dark:text-foreground-dark">Reassign Room</Text>
                    <Text className="text-xs text-muted mt-0.5 font-medium">Reassign occupant to another room</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setChangeRoomModalVisible(false)}
                    className="h-10 w-10 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
                  >
                    <X size={20} color="#9ca3af" />
                  </TouchableOpacity>
                </View>

                {/* Room Search Input */}
                <View className="flex-row items-center border border-border dark:border-border-dark bg-background dark:bg-background-dark rounded-xl px-3 py-2.5 shadow-sm mb-4">
                  <Search size={16} color="#9ca3af" className="mr-2" />
                  <TextInput
                    value={roomChangeSearchQuery}
                    onChangeText={setRoomChangeSearchQuery}
                    placeholder="Search rooms..."
                    placeholderTextColor="#9ca3af"
                    className="flex-1 text-sm text-foreground dark:text-foreground-dark py-0.5"
                  />
                  {roomChangeSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setRoomChangeSearchQuery("")}>
                      <X size={16} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* List of Sorted Rooms */}
                <ScrollView showsVerticalScrollIndicator={false} className="mb-6">
                  {(() => {
                    const query = roomChangeSearchQuery.toLowerCase()
                    const filtered = rooms
                      .filter(r => 
                        r.room_number.toLowerCase().includes(query) && r.id !== selectedTenant?.room_id
                      )
                      .sort((a, b) => {
                        const availA = (a.total_beds || 0) - (a.occupied_beds || 0)
                        const availB = (b.total_beds || 0) - (b.occupied_beds || 0)
                        return availB - availA // vacant (high) to full (low/0)
                      })

                    if (filtered.length === 0) {
                      return (
                        <View className="py-8 items-center justify-center">
                          <Hotel size={32} color="#9ca3af" />
                          <Text className="text-xs text-muted text-center font-medium mt-2">No rooms matched your query</Text>
                        </View>
                      )
                    }

                    return filtered.map((room) => {
                      const available = (room.total_beds || 0) - (room.occupied_beds || 0)
                      const isFull = available <= 0

                      return (
                        <TouchableOpacity
                          key={room.id}
                          onPress={() => {
                            if (isFull) {
                              setChangeRoomSelectedRoomId(room.id)
                            } else {
                              handleChangeRoom(room.id, null)
                            }
                          }}
                          disabled={isUpdatingRoom}
                          className="px-4 py-3.5 border-b border-border/40 dark:border-border-dark/40 flex-row justify-between items-center active:bg-muted/10 rounded-xl mb-2 bg-background/50 dark:bg-background-dark/30"
                        >
                          <View className="flex-1 pr-2">
                            <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                              Room {room.room_number}
                            </Text>
                            <Text className="text-xs text-muted mt-0.5 font-medium">
                              {room.occupied_beds}/{room.total_beds} beds occupied · Rent: ₹{room.rent_amount.toLocaleString()}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            {isFull ? (
                              <View className="bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20">
                                <Text className="text-[10px] font-bold text-red-500 uppercase">Swap Required</Text>
                              </View>
                            ) : (
                              <Text className="text-xs font-semibold text-green-500">{available} vacant</Text>
                            )}
                            <ChevronRight size={16} color="#9ca3af" />
                          </View>
                        </TouchableOpacity>
                      )
                    })
                  })()}
                </ScrollView>

                <TouchableOpacity
                  onPress={() => setChangeRoomModalVisible(false)}
                  className="w-full border border-border dark:border-border-dark rounded-xl py-3.5 items-center justify-center bg-background dark:bg-background-dark mb-4"
                >
                  <Text className="text-muted dark:text-muted-dark text-sm font-bold">Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {(() => {
                  const targetRoom = rooms.find(r => r.id === changeRoomSelectedRoomId)
                  const swapCandidates = tenants.filter(t => t.room_id === changeRoomSelectedRoomId && t.status !== "move_out")

                  return (
                    <>
                      <View className="flex-row justify-between items-center mb-6">
                        <View className="flex-1 pr-2">
                          <Text className="text-lg font-black text-foreground dark:text-foreground-dark">Swap Bed</Text>
                          <Text className="text-xs text-muted mt-0.5 font-medium">
                            Select occupant in Room {targetRoom?.room_number} to swap with
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            setChangeRoomSelectedRoomId(null);
                            setChangeRoomSwapTenantId(null);
                          }}
                          className="h-10 w-10 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
                        >
                          <X size={20} color="#9ca3af" />
                        </TouchableOpacity>
                      </View>

                      <View className="flex-row items-center bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3.5 mb-4 gap-2">
                        <AlertTriangle size={18} color="#d97706" />
                        <Text className="text-xs font-bold text-amber-700 dark:text-amber-500 flex-1 leading-4">
                          Room {targetRoom?.room_number} is full. Swapping will move the selected occupant to Room {selectedTenant?.rooms_table?.room_number}.
                        </Text>
                      </View>

                      <ScrollView showsVerticalScrollIndicator={false} className="mb-6">
                        {swapCandidates.length === 0 ? (
                          <View className="py-8 items-center justify-center">
                            <User size={32} color="#9ca3af" />
                            <Text className="text-xs text-muted text-center font-medium mt-2">No active occupants in this room</Text>
                          </View>
                        ) : (
                          swapCandidates.map((candidate) => {
                            const isSelected = changeRoomSwapTenantId === candidate.id
                            const initials = (candidate.name || "Tenant")
                              .split(" ")
                              .map(n => n[0])
                              .join("")
                              .substring(0, 2)
                              .toUpperCase()

                            return (
                              <TouchableOpacity
                                key={candidate.id}
                                onPress={() => setChangeRoomSwapTenantId(candidate.id)}
                                className={`px-4 py-3.5 border rounded-xl mb-2 flex-row justify-between items-center ${
                                  isSelected 
                                    ? "border-primary bg-primary/5 dark:bg-primary/10" 
                                    : "border-border/40 bg-background/50 dark:bg-background-dark/30"
                                }`}
                              >
                                <View className="flex-row items-center flex-1 pr-3">
                                  <View className="h-9 w-9 bg-primary/10 rounded-full items-center justify-center mr-3">
                                    <Text className="text-primary font-bold text-xs">{initials}</Text>
                                  </View>
                                  <View className="flex-1">
                                    <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                                      {candidate.name}
                                    </Text>
                                    <Text className="text-xs text-muted mt-0.5 font-medium">
                                      {candidate.mobile_number || "No phone"}
                                    </Text>
                                  </View>
                                </View>
                                <View className={`h-5 w-5 rounded-full border items-center justify-center ${
                                  isSelected ? "border-primary bg-primary" : "border-border"
                                }`}>
                                  {isSelected && <Check size={12} color="#ffffff" strokeWidth={3} />}
                                </View>
                              </TouchableOpacity>
                            )
                          })
                        )}
                      </ScrollView>

                      <View className="flex-row gap-3">
                        <TouchableOpacity
                          onPress={() => {
                            setChangeRoomSelectedRoomId(null);
                            setChangeRoomSwapTenantId(null);
                          }}
                          className="flex-1 border border-border dark:border-border-dark rounded-xl py-3.5 items-center justify-center bg-background dark:bg-background-dark"
                        >
                          <Text className="text-muted dark:text-muted-dark text-sm font-bold">Back</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            if (changeRoomSelectedRoomId) {
                              handleChangeRoom(changeRoomSelectedRoomId, changeRoomSwapTenantId);
                            }
                          }}
                          disabled={!changeRoomSwapTenantId || isUpdatingRoom}
                          className={`flex-1 rounded-xl py-3.5 items-center justify-center ${
                            changeRoomSwapTenantId && !isUpdatingRoom 
                              ? "bg-primary" 
                              : "bg-muted/20 border border-border/20 opacity-55"
                          }`}
                        >
                          <Text className={changeRoomSwapTenantId && !isUpdatingRoom ? "text-white text-sm font-bold" : "text-muted text-sm font-bold"}>
                            {isUpdatingRoom ? "Processing..." : "Confirm Swap"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )
                })()}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Payment Delete Confirmation Modal */}
      <Modal
        animationType="none"
        transparent={true}
        visible={deletePaymentConfirmVisible}
        onRequestClose={() => setDeletePaymentConfirmVisible(false)}
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
                onPress={() => setDeletePaymentConfirmVisible(false)}
                className="flex-1 border border-border dark:border-border-dark rounded-xl h-11 items-center justify-center active:scale-95 bg-background dark:bg-background-dark"
              >
                <Text className="text-muted dark:text-muted-dark font-bold text-sm">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={confirmDeletePayment}
                className="flex-1 bg-red-500 rounded-xl h-11 items-center justify-center active:scale-95 shadow-md shadow-red-500/20"
              >
                <Text className="text-white font-bold text-sm">Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Method Picker Modal */}
      <Modal
        visible={markPaidModalVisible}
        transparent
        animationType="none"
        onRequestClose={() => setMarkPaidModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center p-6">
          <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl w-full max-w-sm p-6 shadow-2xl relative">
            
            {/* Title & Message */}
            <Text className="text-[17px] font-black text-foreground dark:text-foreground-dark mb-2 mt-2 text-center">
              Confirm Payment
            </Text>
            <Text className="text-xs text-muted dark:text-muted-dark font-bold mb-5 text-center leading-relaxed">
              Select the payment method used by the occupant to clear this bill.
            </Text>

            {/* Dropdown Selector */}
            <View style={{ zIndex: 100 }} className="mb-6 relative w-full">
              <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Payment Method</Text>
              
              <TouchableOpacity
                onPress={() => setPaymentMethodDropdownOpen(!paymentMethodDropdownOpen)}
                className="w-full flex-row justify-between items-center bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-xl px-4 py-3.5"
                activeOpacity={0.8}
              >
                <Text className="text-xs font-black text-foreground dark:text-foreground-dark">{selectedPaymentMethod}</Text>
                <ChevronRight 
                  size={16} 
                  color={isDark ? "#94a3b8" : "#64748b"} 
                  style={{ transform: [{ rotate: paymentMethodDropdownOpen ? "90deg" : "0deg" }] }} 
                />
              </TouchableOpacity>

              {paymentMethodDropdownOpen && (
                <View className="w-full border border-border dark:border-border-dark bg-card dark:bg-card-dark rounded-xl mt-1.5 overflow-hidden shadow-lg absolute top-[62px] left-0 right-0 z-50">
                  {["UPI", "Cash"].map((method) => (
                    <TouchableOpacity
                      key={method}
                      onPress={() => {
                        setSelectedPaymentMethod(method as "UPI" | "Cash")
                        setPaymentMethodDropdownOpen(false)
                      }}
                      className="w-full px-4 py-3 border-b border-border/20 dark:border-border-dark/20 last:border-b-0 flex-row justify-between items-center active:bg-muted/10"
                    >
                      <Text className={`text-xs font-bold ${selectedPaymentMethod === method ? "text-primary font-black" : "text-foreground dark:text-foreground-dark"}`}>{method}</Text>
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
                className="flex-1 border border-border dark:border-border-dark rounded-xl h-11 items-center justify-center active:scale-95 bg-background dark:bg-background-dark"
              >
                <Text className="text-muted dark:text-muted-dark font-bold text-sm">Cancel</Text>
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
        </View>
      </Modal>

      {/* WhatsApp Invite Drawer/Modal */}
      <Modal
        animationType="none"
        transparent={true}
        visible={whatsappInviteModalVisible}
        onRequestClose={() => {
          setWhatsappInviteModalVisible(false)
          setJustAddedTenant(null)
        }}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[85%] border-t border-border dark:border-border-dark p-6">
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-lg font-black text-foreground dark:text-foreground-dark">WhatsApp Invite & Deposit</Text>
              <TouchableOpacity onPress={() => {
                setWhatsappInviteModalVisible(false)
                setJustAddedTenant(null)
              }}>
                <X size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <View className="gap-5">
                <Text className="text-sm font-semibold text-muted dark:text-muted-dark leading-5">
                  Occupant <Text className="font-extrabold text-foreground dark:text-foreground-dark">{justAddedTenant?.name}</Text> has been added. You can now invite them to join your WhatsApp group and optionally request the security deposit.
                </Text>

                {/* Edit Message Preview */}
                <View className="gap-2">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider">Invite Message Preview</Text>
                  <TextInput
                    value={customInviteMessage}
                    onChangeText={setCustomInviteMessage}
                    multiline
                    numberOfLines={6}
                    className="border border-border dark:border-border-dark rounded-2xl p-4 text-sm leading-5 text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark min-h-[140px] font-medium"
                  />
                </View>

                {/* Deposit Option Checkbox (Highlighted) */}
                {justAddedTenant?.deposit_amount && justAddedTenant.deposit_amount > 0 ? (
                  <TouchableOpacity
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      const nextVal = !createDepositPayment
                      setCreateDepositPayment(nextVal)
                      if (justAddedTenant) {
                        setCustomInviteMessage(buildWelcomeMessage(justAddedTenant, nextVal))
                      }
                    }}
                    activeOpacity={0.8}
                    className="border border-primary/20 dark:border-primary/20 rounded-2xl p-4 bg-primary/5 flex-row items-center gap-3 active:scale-[0.98]"
                  >
                    <View
                      className={`w-6 h-6 border-2 rounded-md items-center justify-center ${
                        createDepositPayment 
                          ? "bg-primary border-primary" 
                          : "border-muted dark:border-muted-dark bg-white dark:bg-neutral-900"
                      }`}
                    >
                      {createDepositPayment && <Check size={14} color="#ffffff" strokeWidth={3} />}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">Create Deposit Invoice</Text>
                      <Text className="text-xs text-muted dark:text-muted-dark mt-0.5">
                        Adds a pending deposit fee of ₹{justAddedTenant.deposit_amount} to their ledger and includes the payment link in the welcome invite message.
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View className="border border-border/40 dark:border-border-dark/40 rounded-2xl p-4 bg-muted/5 flex-row items-center gap-3">
                    <View className="h-6 w-6 rounded-md bg-muted/10 items-center justify-center">
                      <Info size={14} color="#9ca3af" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-muted">Deposit Record Disabled</Text>
                      <Text className="text-xs text-muted/80 dark:text-muted-dark/80 mt-0.5">
                        No security deposit amount was specified for this occupant.
                      </Text>
                    </View>
                  </View>
                )}

                {/* Action Buttons */}
                <View className="gap-3 pt-2">
                  <TouchableOpacity
                    onPress={handleSendInvite}
                    disabled={isSaving}
                    className="w-full bg-primary rounded-xl h-12 flex-row items-center justify-center active:scale-95 shadow-md shadow-primary/20"
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <WhatsAppIcon size={18} color="#ffffff" />
                        <Text className="text-white font-bold text-sm ml-2">Send via WhatsApp</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setWhatsappInviteModalVisible(false)
                      setJustAddedTenant(null)
                    }}
                    className="w-full border border-border dark:border-border-dark rounded-xl h-12 flex-row items-center justify-center bg-card dark:bg-card-dark active:scale-95"
                  >
                    <Text className="text-muted font-bold text-sm">Skip & Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Toast Notification Overlay */}
      {!(detailModalVisible || formModalVisible || confirmModalVisible || changeRoomModalVisible || paymentDetailVisible || deletePaymentConfirmVisible || markPaidModalVisible || whatsappInviteModalVisible) && renderToast()}
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
