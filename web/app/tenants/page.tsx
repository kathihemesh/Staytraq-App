"use client"

// Web Tenants page — full parity with the mobile Tenants screen
// (app/src/app/(tabs)/tenants.tsx). Replicates: tenant directory with search +
// status-chip filters and live counts, add/edit tenant (with chatbot-only
// onboarding reminders), delete (soft-delete + free bed), a tenant detail panel
// with Details and Payment History tabs, identity verification management
// (request/ignore/manual-upload/delete/view documents), per-payment record
// detail (mark paid / approve / reject / delete / WhatsApp reminder), move-out
// flow with deposit deduction, and change-room (with swap).
//
// Business-logic divergences from mobile (documented):
//  - WhatsApp messages are sent through the web Twilio endpoint
//    `POST /api/send-reminder { tenantIds, message }` instead of the Evolution
//    chatbot API the mobile app calls directly.
//  - Payment approve/reject reuse `POST /api/payments/[id]/verify`; "Mark as
//    Paid" performs a direct update (the verify route has no payment_method).
//  - Image pickers use `<input type="file">` instead of expo-image-picker;
//    haptics/Linking/FlashList have no web equivalents and are dropped.
//
// Many tenant/payment columns are not in the generated Supabase types, so the
// client is cast to `any` for those selects/updates and results are mapped via
// `as unknown as T`.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Plus,
  X,
  Search,
  Phone,
  Mail,
  Calendar as CalendarIcon,
  CreditCard,
  ChevronRight,
  User,
  Hotel,
  Edit3,
  Trash2,
  Upload,
  Check,
  AlertTriangle,
  Info,
  Maximize2,
  Copy,
  Clock,
  ShieldCheck,
  LogOut,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
} from "lucide-react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth-provider"
import { dashboardToast } from "@/lib/dashboard/toast"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IDENTITY_PORTAL_BASE = "https://staytraq.vercel.app/identity-verify"
const PAYMENT_PORTAL_BASE = "https://staytraq.vercel.app/pay"

const STATUS_CHIPS = ["all", "active", "pending_move_in", "notice_period", "move_out"] as const

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const MONTH_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TenantStatus = "active" | "pending_move_in" | "notice_period" | "move_out"
type VerificationStatus = "Not_Started" | "In_Progress" | "Verified" | "Ignored"

interface Tenant {
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
  status: TenantStatus
  pg_id: number | null
  identity_request_flag?: boolean | null
  ignore_identity_flag?: boolean | null
  verification_status?: VerificationStatus | null
  identity_type?: "Aadhaar" | "PAN" | null
  aadhaar_number?: string | null
  pan_code?: string | null
  id_front_path?: string | null
  id_back_path?: string | null
  verification_token?: string | null
  payment_portal_token?: string | null
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

interface RoomOption {
  id: number
  room_number: string
  occupied_beds: number
  total_beds: number
  rent_amount: number
}

interface Payment {
  id: number | null
  tenant_id?: number
  owner_id?: string
  month: number
  year: number
  rent_amount: number
  extra_charges: number
  total_amount: number
  due_date: string
  status: string
  paid_at?: string | null
  verified_at?: string | null
  verification_notes?: string | null
  screenshot_path?: string | null
  utr_number?: string | null
  payment_code?: string | null
  payment_method?: string | null
  is_deposit?: boolean
  reminder_sent?: boolean
  isUpcoming?: boolean
}

interface OwnerSettings {
  whatsapp_invite_link?: string | null
  upi_id?: string | null
  upi_name?: string | null
  rent_due_day?: number | null
  refund_deposit?: number | null
  default_deposit_fees?: number | null
}

// ---------------------------------------------------------------------------
// Pure helpers (inlined equivalents of the mobile @/lib/identity/* helpers)
// ---------------------------------------------------------------------------

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

function newToken(length = 22): string {
  let out = ""
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)]
  }
  return out
}

function buildVerificationLink(base: string, token: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base
  return `${trimmed}/${token}`
}

/** chatbot owners only: an identity request is made when the box was ticked. */
function deriveIdentityRequestFlag(chatbotEnabled: boolean, requested: boolean): boolean {
  return chatbotEnabled === true && requested === true
}

/** Mask all but the last 4 visible characters of an identity code. */
function maskIdentityCode(value: string | null | undefined): string {
  const v = (value || "").trim()
  if (!v) return ""
  const digits = v.replace(/\s+/g, "")
  if (digits.length <= 4) return digits
  const last4 = digits.slice(-4)
  const masked = "•".repeat(Math.max(digits.length - 4, 0))
  // Group in 4s for readability (mirrors the mobile Aadhaar presentation).
  return `${masked} ${last4}`.replace(/(.{4})/g, "$1 ").trim()
}

function selectDisplayCode(t: { aadhaar_number?: string | null; pan_code?: string | null }):
  | { type: "Aadhaar" | "PAN"; value: string }
  | null {
  if (t.aadhaar_number && t.aadhaar_number.trim()) return { type: "Aadhaar", value: t.aadhaar_number.trim() }
  if (t.pan_code && t.pan_code.trim()) return { type: "PAN", value: t.pan_code.trim() }
  return null
}

type IdentityState = {
  identity_request_flag: boolean
  verification_status: VerificationStatus
  ignore_identity_flag: boolean
}

type PopupPresentation = "none" | "in_progress" | "verified" | "reminders_stopped"

function popupStatusPresentation(s: IdentityState): PopupPresentation {
  if (s.verification_status === "Verified") return "verified"
  if (s.ignore_identity_flag || s.verification_status === "Ignored") return "reminders_stopped"
  if (s.identity_request_flag && (s.verification_status === "In_Progress" || s.verification_status === "Not_Started")) {
    return "in_progress"
  }
  return "none"
}

function shouldShowIgnoreButton(s: IdentityState): boolean {
  return s.identity_request_flag === true && s.verification_status !== "Verified" && s.ignore_identity_flag === false
}

function applyIgnore(s: IdentityState): IdentityState {
  return {
    identity_request_flag: s.identity_request_flag,
    ignore_identity_flag: true,
    verification_status: s.verification_status === "Verified" ? "Verified" : "Ignored",
  }
}

function viewerHasSlideControl(front?: string | null, back?: string | null): boolean {
  return !!(front && front.trim()) && !!(back && back.trim())
}

function formatDateFriendly(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function statusLabel(status: string): string {
  if (status === "all") return "All"
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "notice_period":
      return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
    case "move_out":
      return "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400"
    case "pending_move_in":
      return "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-400"
    default:
      return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
  }
}

function paymentBadgeClass(status: string): string {
  switch (status) {
    case "paid":
      return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
    case "late":
      return "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400"
    case "submitted":
      return "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-400"
    case "upcoming":
      return "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-400"
    default:
      return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
  }
}

function formatWhatsAppNumber(phone: string | null | undefined): string {
  if (!phone) return ""
  const cleaned = phone.replace(/\D/g, "")
  if (cleaned.length === 10) return `91${cleaned}`
  return cleaned
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TenantsPageInner() {
  const { user, session } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [pgId, setPgId] = useState<number | null>(null)
  const [pgName, setPgName] = useState("")
  const [pgMissing, setPgMissing] = useState(false)
  const [ownerSettings, setOwnerSettings] = useState<OwnerSettings | null>(null)
  const [chatbotEnabled, setChatbotEnabled] = useState(false)
  const hasLoadedOnce = useRef(false)
  const fetchInProgressRef = useRef(false)
  const statusSyncRunningRef = useRef(false)
  const appliedParamsRef = useRef(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Detail panel
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [activeTab, setActiveTab] = useState<"details" | "history">("details")
  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Add / Edit form
  const [formOpen, setFormOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [name, setName] = useState("")
  const [mobileNumber, setMobileNumber] = useState("")
  const [email, setEmail] = useState("")
  const [joinDate, setJoinDate] = useState("")
  const [rentDueDay, setRentDueDay] = useState("5")
  const [depositAmount, setDepositAmount] = useState("10000")
  const [extraCharges, setExtraCharges] = useState("0")
  const [selectedRoomId, setSelectedRoomId] = useState("")
  const [notes, setNotes] = useState("")
  const [roomSearchQuery, setRoomSearchQuery] = useState("")
  const [requestIdentityFromTenant, setRequestIdentityFromTenant] = useState(false)
  const [requestDepositPayment, setRequestDepositPayment] = useState(false)
  const [includeWhatsappInvite, setIncludeWhatsappInvite] = useState(false)

  // Delete tenant
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [tenantToDelete, setTenantToDelete] = useState<{ id: number; roomId: number | null } | null>(null)

  // WhatsApp invite (non-chatbot owners) after add
  const [inviteOpen, setInviteOpen] = useState(false)
  const [justAddedTenant, setJustAddedTenant] = useState<Tenant | null>(null)
  const [createDepositPayment, setCreateDepositPayment] = useState(false)
  const [customInviteMessage, setCustomInviteMessage] = useState("")
  const [invitePayUrl, setInvitePayUrl] = useState<string | null>(null)
  const [isSendingInvite, setIsSendingInvite] = useState(false)

  // Move out flow
  const [moveOutOpen, setMoveOutOpen] = useState(false)
  const [moveOutDate, setMoveOutDate] = useState("")
  const [depositRefundAmount, setDepositRefundAmount] = useState("")
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [isSettlingDues, setIsSettlingDues] = useState(false)
  const [deductionMode, setDeductionMode] = useState(false)
  const [selectedDeductionPayment, setSelectedDeductionPayment] = useState<Payment | null>(null)
  const [upcomingPayments, setUpcomingPayments] = useState<Payment[]>([])
  const [deductionLocked, setDeductionLocked] = useState(false)

  // Change room
  const [changeRoomOpen, setChangeRoomOpen] = useState(false)
  const [roomChangeSearchQuery, setRoomChangeSearchQuery] = useState("")
  const [changeRoomSelectedRoomId, setChangeRoomSelectedRoomId] = useState<number | null>(null)
  const [changeRoomSwapTenantId, setChangeRoomSwapTenantId] = useState<number | null>(null)
  const [isUpdatingRoom, setIsUpdatingRoom] = useState(false)

  // Identity management
  const [revealIdentityCode, setRevealIdentityCode] = useState(false)
  const [ignoreConfirmOpen, setIgnoreConfirmOpen] = useState(false)
  const [isIgnoringIdentity, setIsIgnoringIdentity] = useState(false)
  const [isManualUploading, setIsManualUploading] = useState(false)
  const [isDeletingIdentity, setIsDeletingIdentity] = useState(false)
  const [isRequestingIdentityAgain, setIsRequestingIdentityAgain] = useState(false)
  const [identityResetTenantId, setIdentityResetTenantId] = useState<number | null>(null)
  const [deleteIdentityConfirmOpen, setDeleteIdentityConfirmOpen] = useState(false)
  const [manualUploadOpen, setManualUploadOpen] = useState(false)
  const [manualUploadType, setManualUploadType] = useState<"" | "Aadhaar" | "PAN">("")
  const [manualFront, setManualFront] = useState<File | null>(null)
  const [manualBack, setManualBack] = useState<File | null>(null)
  const [manualFrontPreview, setManualFrontPreview] = useState<string | null>(null)
  const [manualBackPreview, setManualBackPreview] = useState<string | null>(null)

  // Identity document viewer (front/back)
  const [idViewerOpen, setIdViewerOpen] = useState(false)
  const [idViewerSide, setIdViewerSide] = useState<"front" | "back">("front")
  const [idViewerLoading, setIdViewerLoading] = useState(false)
  const [idFrontUrl, setIdFrontUrl] = useState<string | null>(null)
  const [idBackUrl, setIdBackUrl] = useState<string | null>(null)

  // Payment record detail
  const [paymentDetailOpen, setPaymentDetailOpen] = useState(false)
  const [selectedPaymentDetail, setSelectedPaymentDetail] = useState<Payment | null>(null)
  const [signedScreenshotUrl, setSignedScreenshotUrl] = useState<string | null>(null)
  const [loadingScreenshot, setLoadingScreenshot] = useState(false)
  const [rejectingMode, setRejectingMode] = useState(false)
  const [rejectNotes, setRejectNotes] = useState("")
  const [isSendingWhatsAppPayment, setIsSendingWhatsAppPayment] = useState(false)
  const [isSendingWhatsAppTenant, setIsSendingWhatsAppTenant] = useState(false)
  const [deletePaymentConfirmOpen, setDeletePaymentConfirmOpen] = useState(false)
  const [deletePaymentId, setDeletePaymentId] = useState<number | null>(null)
  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [markingPaidPaymentId, setMarkingPaidPaymentId] = useState<number | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"UPI" | "Cash">("UPI")

  // Fullscreen image viewer (payment screenshot / documents)
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null)

  const db = supabase as any

  // ----- Data fetch ---------------------------------------------------------

  const fetchData = useCallback(
    async (silent = false) => {
      if (!user?.id) {
        setLoading(false)
        return
      }
      if (fetchInProgressRef.current) return
      fetchInProgressRef.current = true
      try {
        if (!silent && !hasLoadedOnce.current) setLoading(true)

        const [pgResult, tenantsResult, settingsResult, ownerResult] = await Promise.all([
          db.from("pg_details").select("id, pg_name").eq("owner_id", user.id).maybeSingle(),
          db
            .from("tenants_table")
            .select("*, rooms_table(id, room_number, rent_amount)")
            .eq("owner_id", user.id)
            .is("deleted_at", null)
            .order("name", { ascending: true }),
          db
            .from("settings")
            .select("whatsapp_invite_link, upi_id, upi_name, rent_due_day, refund_deposit, default_deposit_fees")
            .eq("owner_id", user.id)
            .maybeSingle(),
          db.from("pg_owners").select("chatbot_enabled").eq("id", user.id).single(),
        ])

        const pgDetails = pgResult.data
        if (!pgDetails) {
          setPgMissing(true)
          setLoading(false)
          fetchInProgressRef.current = false
          return
        }
        setPgMissing(false)
        setPgId(pgDetails.id)
        setPgName(pgDetails.pg_name || "")
        setTenants((tenantsResult.data || []) as unknown as Tenant[])
        setOwnerSettings((settingsResult.data || null) as OwnerSettings | null)
        setChatbotEnabled(!!ownerResult.data?.chatbot_enabled)

        const { data: roomsData } = await db
          .from("rooms_table")
          .select("id, room_number, occupied_beds, total_beds, rent_amount")
          .eq("pg_id", pgDetails.id)
          .order("room_number", { ascending: true })
        setRooms((roomsData || []) as unknown as RoomOption[])

        hasLoadedOnce.current = true

        // Background status sync (mirrors mobile): auto-activate pending move-ins
        // and convert past-due notice_period tenants to move_out (freeing beds).
        if (!statusSyncRunningRef.current) {
          statusSyncRunningRef.current = true
          void (async () => {
            try {
              const todayStr = new Date().toISOString().split("T")[0]
              let hasChanges = false

              const { data: activated } = await db
                .from("tenants_table")
                .update({ status: "active" })
                .eq("owner_id", user.id)
                .eq("status", "pending_move_in")
                .lte("join_date", todayStr)
                .select("id")
              if (activated && activated.length > 0) hasChanges = true

              const { data: noticeTenants } = await db
                .from("tenants_table")
                .select("id, room_id")
                .eq("owner_id", user.id)
                .eq("status", "notice_period")
                .lte("exit_date", todayStr)

              if (noticeTenants && noticeTenants.length > 0) {
                hasChanges = true
                for (const t of noticeTenants) {
                  await db.from("tenants_table").update({ status: "move_out", room_id: null }).eq("id", t.id)
                  if (t.room_id) {
                    const { data: roomData } = await db
                      .from("rooms_table")
                      .select("occupied_beds")
                      .eq("id", t.room_id)
                      .single()
                    if (roomData) {
                      await db
                        .from("rooms_table")
                        .update({ occupied_beds: Math.max(roomData.occupied_beds - 1, 0) })
                        .eq("id", t.room_id)
                    }
                  }
                }
              }
              if (hasChanges) void fetchData(true)
            } catch (syncErr) {
              console.error("Error syncing tenant statuses:", syncErr)
            } finally {
              statusSyncRunningRef.current = false
            }
          })()
        }
      } catch (err) {
        console.error("Error fetching tenants:", err)
        dashboardToast.error("Failed to load tenants.")
      } finally {
        setLoading(false)
        fetchInProgressRef.current = false
      }
    },
    [user?.id, db],
  )

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // Realtime subscription on tenants_table for this owner.
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`tenants_realtime_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenants_table", filter: `owner_id=eq.${user.id}` },
        () => {
          void fetchData(true)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, supabase, fetchData])

  // ----- WhatsApp via Twilio /api/send-reminder -----------------------------

  const sendWhatsApp = useCallback(
    async (tenantId: number, message: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/send-reminder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ tenantIds: [tenantId], message }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || "Failed to send message")
        }
        const data = await res.json()
        return (data?.sent ?? 0) > 0
      } catch (err) {
        console.error("send-reminder error:", err)
        return false
      }
    },
    [session?.access_token],
  )

  // ----- Token helpers (persist unique tokens, retry on collision) ----------

  const ensureVerificationToken = useCallback(
    async (tenantId: number): Promise<string | null> => {
      const { data: existing, error: readErr } = await db
        .from("tenants_table")
        .select("verification_token")
        .eq("id", tenantId)
        .maybeSingle()
      if (readErr) return null
      if (existing?.verification_token) return existing.verification_token as string
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = newToken()
        const { data, error } = await db
          .from("tenants_table")
          .update({ verification_token: candidate })
          .is("verification_token", null)
          .eq("id", tenantId)
          .select("verification_token")
          .maybeSingle()
        if (error) {
          if (error.code === "23505") continue
          return null
        }
        if (data?.verification_token) return data.verification_token as string
        const { data: cur } = await db
          .from("tenants_table")
          .select("verification_token")
          .eq("id", tenantId)
          .maybeSingle()
        return (cur?.verification_token as string | undefined) ?? null
      }
      return null
    },
    [db],
  )

  const ensurePaymentPortalToken = useCallback(
    async (tenantId: number): Promise<string | null> => {
      const { data: existing, error: readErr } = await db
        .from("tenants_table")
        .select("payment_portal_token")
        .eq("id", tenantId)
        .maybeSingle()
      if (readErr) return null
      if (existing?.payment_portal_token) return existing.payment_portal_token as string
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = newToken()
        const { data, error } = await db
          .from("tenants_table")
          .update({ payment_portal_token: candidate })
          .is("payment_portal_token", null)
          .eq("id", tenantId)
          .select("payment_portal_token")
          .maybeSingle()
        if (error) {
          if (error.code === "23505") continue
          return null
        }
        if (data?.payment_portal_token) return data.payment_portal_token as string
        const { data: cur } = await db
          .from("tenants_table")
          .select("payment_portal_token")
          .eq("id", tenantId)
          .maybeSingle()
        return (cur?.payment_portal_token as string | undefined) ?? null
      }
      return null
    },
    [db],
  )

  // ----- Message builders ---------------------------------------------------

  const buildWelcomeMessage = useCallback(
    (tenant: Tenant, includeDeposit: boolean, payUrl?: string | null) => {
      let msg = `Hello ${tenant.name || "Occupant"}! Welcome to ${pgName || "our PG"}.`
      if (ownerSettings?.whatsapp_invite_link) {
        msg += ` Please join our WhatsApp group using this link: ${ownerSettings.whatsapp_invite_link}`
      }
      if (includeDeposit && tenant.deposit_amount && tenant.deposit_amount > 0 && payUrl) {
        msg += `\n\nAdditionally, please process your security deposit fee of ₹${tenant.deposit_amount} via your secure payment portal: ${payUrl}`
      }
      return msg
    },
    [ownerSettings?.whatsapp_invite_link, pgName],
  )

  const buildOnboardingMessage = useCallback(
    (
      tenant: Tenant,
      opts: { identityLink?: string | null; includeDeposit?: boolean; depositPayUrl?: string | null; whatsappInviteLink?: string | null },
    ) => {
      const tenantName = (tenant.name || "").trim() || "Tenant"
      const pg = pgName || "our PG"
      const items: string[] = []
      if (opts.identityLink) {
        items.push(
          `*Identity verification*\n` +
            `Your property owner has requested that you verify your identity. Please open this secure link to upload your identity document (encrypted and visible only to your property owner):\n${opts.identityLink}`,
        )
      }
      // Only include the deposit line when a unique per-tenant pay link exists.
      if (opts.includeDeposit && tenant.deposit_amount && tenant.deposit_amount > 0 && opts.depositPayUrl) {
        items.push(
          `*Security deposit payment*\n` +
            `A security deposit fee of ₹${tenant.deposit_amount} has been added to your account. Please pay it using this secure payment link:\n${opts.depositPayUrl}`,
        )
      }
      if (opts.whatsappInviteLink) {
        items.push(
          `*Join our WhatsApp group*\n` +
            `Stay updated with announcements by joining our community group:\n${opts.whatsappInviteLink}`,
        )
      }
      if (items.length === 0) return ""
      const greeting = `Hi ${tenantName},\n\nWelcome to ${pg}! 🎉`
      if (items.length === 1) return `${greeting}\n\n${items[0]}\n\nThank you!`
      const numbered = items.map((it, i) => `${i + 1}. ${it}`).join("\n\n")
      return `${greeting}\n\nPlease complete the following to finish your onboarding:\n\n${numbered}\n\nThank you!`
    },
    [pgName],
  )

  const getPaymentWhatsAppMessage = useCallback(
    (payment: Payment, tokenStr: string) => {
      const tenantName = selectedTenant?.name || "Tenant"
      const amount = (payment.rent_amount || 0) + (payment.extra_charges || 0)
      const monthName = MONTH_NAMES[payment.month - 1] || "Current Month"
      const year = payment.year
      const formattedDueDate = formatDateFriendly(payment.due_date)
      const paymentLink = `${PAYMENT_PORTAL_BASE}/${tokenStr}`
      if (payment.status === "late") {
        return `Hi ${tenantName},\n\nThis is a reminder that your rent payment of ₹${amount} for ${monthName} ${year} was due on ${formattedDueDate} and is currently overdue.\n\nPlease clear the outstanding amount as soon as possible and submit the payment proof here: ${paymentLink}\n\nIf you have already paid, please ignore this message. Thank you!`
      }
      return `Hi ${tenantName},\n\nThis is a friendly reminder that your rent payment of ₹${amount} for ${monthName} ${year} is due on ${formattedDueDate}.\n\nYou can view your invoice and submit the payment proof directly here: ${paymentLink}\n\nThank you!`
    },
    [selectedTenant?.name],
  )

  // ----- Deposit payment record creation ------------------------------------

  const createSecurityDepositPayment = useCallback(
    async (tenant: Tenant): Promise<number | null> => {
      if (!user?.id || !tenant.deposit_amount || tenant.deposit_amount <= 0) return null
      const currentMonth = new Date().getMonth() + 1
      const currentYear = new Date().getFullYear()
      const { data, error } = await db
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
          is_deposit: true,
        })
        .select("id")
        .single()
      if (error) throw error
      return data?.id ?? null
    },
    [user?.id, db],
  )

  // Drive chatbot-enabled onboarding: create deposit record, build a single
  // tailored message, send via Twilio /api/send-reminder.
  const handleChatbotOnboardingNotices = useCallback(
    async (tenant: Tenant, wantsIdentity: boolean, wantsDeposit: boolean, wantsInvite: boolean) => {
      let depositPaymentId: number | null = null
      let depositPayUrl: string | null = null
      if (wantsDeposit) {
        try {
          depositPaymentId = await createSecurityDepositPayment(tenant)
        } catch (err) {
          console.error("Failed to create deposit payment record:", err)
          dashboardToast.error("Couldn't create the deposit payment record.")
        }
        const payToken = await ensurePaymentPortalToken(tenant.id)
        if (payToken) depositPayUrl = `${PAYMENT_PORTAL_BASE}/${payToken}`
      }

      let identityLink: string | null = null
      if (wantsIdentity) {
        const token = await ensureVerificationToken(tenant.id)
        if (token) identityLink = buildVerificationLink(IDENTITY_PORTAL_BASE, token)
      }

      const whatsappInviteLink = wantsInvite ? ownerSettings?.whatsapp_invite_link || null : null

      const message = buildOnboardingMessage(tenant, {
        identityLink,
        includeDeposit: wantsDeposit,
        depositPayUrl,
        whatsappInviteLink,
      })
      if (!message) return

      const sent = await sendWhatsApp(tenant.id, message)
      if (sent && depositPaymentId) {
        await db.from("payments").update({ reminder_sent: true }).eq("id", depositPaymentId)
      }
      if (sent) dashboardToast.success("Onboarding message sent", { description: "WhatsApp message delivered." })
      else dashboardToast.warning("Message not sent", { description: "Couldn't deliver the WhatsApp message." })
    },
    [createSecurityDepositPayment, ensurePaymentPortalToken, ensureVerificationToken, ownerSettings?.whatsapp_invite_link, buildOnboardingMessage, sendWhatsApp, db],
  )

  // Send a single identity verification request immediately (request again flow).
  const requestTenantIdentity = useCallback(
    async (tenant: { id: number; name: string | null; mobile_number: string | null }) => {
      try {
        const token = await ensureVerificationToken(tenant.id)
        if (!token) return
        const link = buildVerificationLink(IDENTITY_PORTAL_BASE, token)
        const tenantName = (tenant.name || "").trim() || "Tenant"
        const pg = pgName || "your PG"
        const message =
          `Hi ${tenantName},\n\n` +
          `Your property owner has requested that you verify your identity for ${pg}.\n\n` +
          `Please open the secure link below to upload your identity document. ` +
          `Your documents are encrypted and visible only to your property owner:\n${link}\n\nThank you!`
        await sendWhatsApp(tenant.id, message)
      } catch (e) {
        console.error("Identity request failed:", e)
      }
    },
    [ensureVerificationToken, pgName, sendWhatsApp],
  )

  // ----- Detail panel -------------------------------------------------------

  const openDetail = useCallback(
    async (tenant: Tenant) => {
      setSelectedTenant(tenant)
      setDetailOpen(true)
      setActiveTab("details")
      setRevealIdentityCode(false)
      setIdViewerOpen(false)
      setIdViewerSide("front")
      setIdFrontUrl(null)
      setIdBackUrl(null)
      setPaymentHistory([])
      setHistoryLoading(true)
      try {
        const { data, error } = await db
          .from("payments")
          .select("*")
          .eq("tenant_id", tenant.id)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
        if (!error && data) setPaymentHistory(data as unknown as Payment[])
      } catch (err) {
        console.error("Failed to load payment history:", err)
      } finally {
        setHistoryLoading(false)
      }
    },
    [db],
  )

  // ----- URL params (?tenant=&status=&search=) ------------------------------
  useEffect(() => {
    if (appliedParamsRef.current) return
    if (loading) return
    const statusParam = searchParams.get("status")
    const searchParam = searchParams.get("search")
    const tenantParam = searchParams.get("tenant")
    if (statusParam) setStatusFilter(statusParam)
    if (searchParam) {
      setSearchQuery(searchParam)
      if (!statusParam) setStatusFilter("all")
    }
    if (tenantParam && tenants.length > 0) {
      const id = Number(tenantParam)
      const match = tenants.find((t) => t.id === id)
      if (match) {
        setStatusFilter("all")
        setSearchQuery("")
        void openDetail(match)
      }
    }
    if (statusParam || searchParam || (tenantParam && tenants.length > 0)) {
      appliedParamsRef.current = true
    }
  }, [loading, tenants, searchParams, openDetail])

  // ----- Add / Edit ---------------------------------------------------------

  const openAddModal = () => {
    setEditingTenant(null)
    setName("")
    setMobileNumber("")
    setEmail("")
    setJoinDate(new Date().toISOString().split("T")[0])
    setRentDueDay((ownerSettings?.rent_due_day || 5).toString())
    setDepositAmount((ownerSettings?.default_deposit_fees ?? 10000).toString())
    setExtraCharges("0")
    setSelectedRoomId("")
    setNotes("")
    setRoomSearchQuery("")
    setRequestIdentityFromTenant(false)
    setRequestDepositPayment(false)
    setIncludeWhatsappInvite(false)
    setFormError(null)
    setIsSaving(false)
    setFormOpen(true)
  }

  const openEditModal = (tenant: Tenant) => {
    setEditingTenant(tenant)
    setName(tenant.name || "")
    setMobileNumber(tenant.mobile_number || "")
    setEmail(tenant.email || "")
    setJoinDate(tenant.join_date || "")
    setRentDueDay((tenant.rent_due_day || 5).toString())
    setDepositAmount((tenant.deposit_amount || 0).toString())
    setExtraCharges((tenant.extra_charges || 0).toString())
    setSelectedRoomId(tenant.room_id ? tenant.room_id.toString() : "")
    setNotes(tenant.notes || "")
    setRoomSearchQuery("")
    setRequestIdentityFromTenant(false)
    setRequestDepositPayment(false)
    setIncludeWhatsappInvite(false)
    setFormError(null)
    setIsSaving(false)
    setFormOpen(true)
  }

  const availableRooms = useMemo(() => {
    return rooms.filter((room) => {
      const hasAvailableBeds = room.occupied_beds < room.total_beds
      const isCurrentTenantRoom = editingTenant?.room_id === room.id
      return hasAvailableBeds || isCurrentTenantRoom
    })
  }, [rooms, editingTenant])

  const handleSaveTenant = async () => {
    if (!user?.id || !pgId) return
    if (!name.trim()) {
      setFormError("Name is required")
      return
    }
    if (!selectedRoomId) {
      setFormError("Room assignment is required")
      return
    }
    if (isSaving) return
    try {
      setIsSaving(true)
      setFormError(null)

      const targetRoomId = selectedRoomId ? parseInt(selectedRoomId, 10) : null
      const oldRoomId = editingTenant ? editingTenant.room_id : null

      // Capacity check when assigning to a different room.
      if (targetRoomId && targetRoomId !== oldRoomId) {
        const { data: roomCheck, error: roomCheckErr } = await db
          .from("rooms_table")
          .select("total_beds, occupied_beds")
          .eq("id", targetRoomId)
          .single()
        if (roomCheckErr) throw roomCheckErr
        const available = (roomCheck.total_beds || 0) - (roomCheck.occupied_beds || 0)
        if (available <= 0) {
          setFormError("This room has no available beds. Please select another room.")
          setIsSaving(false)
          return
        }
      }

      const todayStr = new Date().toISOString().split("T")[0]
      const calculatedStatus: TenantStatus = joinDate && joinDate > todayStr ? "pending_move_in" : "active"
      const finalStatus: TenantStatus = editingTenant
        ? editingTenant.status === "active" || editingTenant.status === "pending_move_in"
          ? calculatedStatus
          : editingTenant.status
        : calculatedStatus

      const tenantPayload: Record<string, unknown> = {
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
      }

      if (editingTenant) {
        const { error: editErr } = await db.from("tenants_table").update(tenantPayload).eq("id", editingTenant.id)
        if (editErr) throw editErr
      } else {
        const identityRequestFlag = deriveIdentityRequestFlag(chatbotEnabled, requestIdentityFromTenant)
        const insertPayload = {
          ...tenantPayload,
          identity_request_flag: identityRequestFlag,
          ignore_identity_flag: false,
          verification_status: "Not_Started",
        }
        const { data: insertedData, error: insertErr } = await db
          .from("tenants_table")
          .insert(insertPayload)
          .select()
          .single()
        if (insertErr || !insertedData) {
          console.error(insertErr)
          setFormError("Tenant creation failed. Please try again.")
          dashboardToast.error("Tenant Creation Failed", {
            description: "We couldn't create the tenant. Your details have been kept—please try again.",
          })
          setIsSaving(false)
          return
        }

        const inserted = insertedData as unknown as Tenant
        setJustAddedTenant(inserted)
        if (chatbotEnabled) {
          const wantsIdentity = identityRequestFlag
          const wantsDeposit = requestDepositPayment && !!inserted.deposit_amount && inserted.deposit_amount > 0
          const wantsInvite = includeWhatsappInvite && !!ownerSettings?.whatsapp_invite_link
          void handleChatbotOnboardingNotices(inserted, wantsIdentity, wantsDeposit, wantsInvite)
        } else {
          const wantsDeposit = inserted.deposit_amount ? inserted.deposit_amount > 0 : false
          // Resolve a unique per-tenant pay link up front so the preview + send use it.
          let payUrl: string | null = null
          if (wantsDeposit) {
            const payToken = await ensurePaymentPortalToken(inserted.id)
            if (payToken) payUrl = `${PAYMENT_PORTAL_BASE}/${payToken}`
          }
          setInvitePayUrl(payUrl)
          setCreateDepositPayment(wantsDeposit)
          setCustomInviteMessage(buildWelcomeMessage(inserted, wantsDeposit, payUrl))
          setInviteOpen(true)
        }
      }

      // Adjust occupied beds when the room assignment changed.
      if (targetRoomId !== oldRoomId) {
        if (targetRoomId) {
          const matchedRoom = rooms.find((r) => r.id === targetRoomId)
          if (matchedRoom) {
            await db
              .from("rooms_table")
              .update({ occupied_beds: Math.min(matchedRoom.occupied_beds + 1, matchedRoom.total_beds) })
              .eq("id", targetRoomId)
          }
        }
        if (oldRoomId) {
          const matchedRoom = rooms.find((r) => r.id === oldRoomId)
          if (matchedRoom) {
            await db
              .from("rooms_table")
              .update({ occupied_beds: Math.max(matchedRoom.occupied_beds - 1, 0) })
              .eq("id", oldRoomId)
          }
        }
      }

      setFormOpen(false)
      if (editingTenant) {
        setDetailOpen(false)
        dashboardToast.success("Profile Updated", { description: `Profile for ${name} has been updated.` })
      } else {
        dashboardToast.success("Occupant Added", { description: `${name} has been added to your directory.` })
      }
      void fetchData(true)
    } catch (err) {
      console.error(err)
      setFormError((err as Error)?.message || "An error occurred while saving the tenant")
    } finally {
      setIsSaving(false)
    }
  }

  // Non-chatbot invite send (after add): optionally create deposit, send message.
  const handleSendInvite = async () => {
    if (!justAddedTenant || !user?.id) return
    setIsSendingInvite(true)
    try {
      if (createDepositPayment && justAddedTenant.deposit_amount && justAddedTenant.deposit_amount > 0) {
        const currentMonth = new Date().getMonth() + 1
        const currentYear = new Date().getFullYear()
        const { error: payErr } = await db.from("payments").insert({
          tenant_id: justAddedTenant.id,
          owner_id: user.id,
          month: currentMonth,
          year: currentYear,
          rent_amount: justAddedTenant.deposit_amount,
          extra_charges: 0,
          total_amount: justAddedTenant.deposit_amount,
          due_date: justAddedTenant.join_date || new Date().toISOString().split("T")[0],
          status: "pending",
          is_deposit: true,
        })
        if (payErr) throw payErr
      }
      const sent = await sendWhatsApp(justAddedTenant.id, customInviteMessage)
      setInviteOpen(false)
      if (sent) dashboardToast.success("Invite Sent", { description: "WhatsApp message delivered." })
      else dashboardToast.warning("Invite not sent", { description: "Couldn't deliver the WhatsApp message." })
      setJustAddedTenant(null)
      setCustomInviteMessage("")
      void fetchData(true)
    } catch (err) {
      console.error("Error sending invite:", err)
      dashboardToast.error((err as Error)?.message || "Failed to process invitation")
    } finally {
      setIsSendingInvite(false)
    }
  }

  // ----- Delete tenant ------------------------------------------------------

  const confirmDeleteTenant = async () => {
    if (!tenantToDelete) return
    setDeleteOpen(false)
    try {
      const { error: softDeleteErr } = await db
        .from("tenants_table")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", tenantToDelete.id)
      if (softDeleteErr) throw softDeleteErr
      if (tenantToDelete.roomId) {
        const matchedRoom = rooms.find((r) => r.id === tenantToDelete.roomId)
        if (matchedRoom) {
          await db
            .from("rooms_table")
            .update({ occupied_beds: Math.max(matchedRoom.occupied_beds - 1, 0) })
            .eq("id", tenantToDelete.roomId)
        }
      }
      setDetailOpen(false)
      dashboardToast.success("Occupant Deleted", {
        description: "Removed from your directory. All payment records are preserved.",
      })
      void fetchData(true)
    } catch (err) {
      console.error(err)
      dashboardToast.error((err as Error)?.message || "Failed to delete occupant.")
    } finally {
      setTenantToDelete(null)
    }
  }

  // ----- Change room (with optional swap) -----------------------------------

  const handleChangeRoom = async (newRoomId: number, swapTenantId: number | null = null) => {
    if (!selectedTenant) return
    try {
      setIsUpdatingRoom(true)
      const oldRoomId = selectedTenant.room_id
      if (swapTenantId) {
        const { error: swapErr } = await db.from("tenants_table").update({ room_id: oldRoomId }).eq("id", swapTenantId)
        if (swapErr) throw swapErr
        const { error: tenantErr } = await db.from("tenants_table").update({ room_id: newRoomId }).eq("id", selectedTenant.id)
        if (tenantErr) throw tenantErr
        dashboardToast.success("Rooms Swapped", { description: `Swapped rooms for ${selectedTenant.name}.` })
      } else {
        const { error: tenantErr } = await db.from("tenants_table").update({ room_id: newRoomId }).eq("id", selectedTenant.id)
        if (tenantErr) throw tenantErr
        if (newRoomId !== oldRoomId) {
          const newRoom = rooms.find((r) => r.id === newRoomId)
          if (newRoom) {
            await db
              .from("rooms_table")
              .update({ occupied_beds: Math.min(newRoom.occupied_beds + 1, newRoom.total_beds) })
              .eq("id", newRoomId)
          }
          if (oldRoomId) {
            const oldRoom = rooms.find((r) => r.id === oldRoomId)
            if (oldRoom) {
              await db
                .from("rooms_table")
                .update({ occupied_beds: Math.max(oldRoom.occupied_beds - 1, 0) })
                .eq("id", oldRoomId)
            }
          }
        }
        dashboardToast.success("Room Changed", { description: `${selectedTenant.name} has been reassigned.` })
      }
      setChangeRoomOpen(false)
      setChangeRoomSelectedRoomId(null)
      setChangeRoomSwapTenantId(null)
      await fetchData(true)
      const { data: refreshed } = await db
        .from("tenants_table")
        .select("*, rooms_table(id, room_number, rent_amount)")
        .eq("id", selectedTenant.id)
        .single()
      if (refreshed) setSelectedTenant(refreshed as unknown as Tenant)
    } catch (err) {
      console.error(err)
      dashboardToast.error((err as Error)?.message || "Could not change room.")
    } finally {
      setIsUpdatingRoom(false)
    }
  }

  // ----- Move out flow ------------------------------------------------------

  const computeUpcomingPayments = useCallback(() => {
    if (!selectedTenant || !moveOutDate) return
    const dueDay = selectedTenant.rent_due_day
    if (!dueDay) return
    const today = new Date()
    const exitDate = new Date(moveOutDate)
    const upcoming: Payment[] = []
    // Build a month's due date, clamping the day to that month's last day so
    // 29/30/31 due days don't roll into the next month (e.g. Feb -> 28/29).
    const dueOnCursor = (cursor: number) => {
      const y = Math.floor(cursor / 12)
      const mIndex = ((cursor % 12) + 12) % 12
      const days = new Date(y, mIndex + 1, 0).getDate()
      return new Date(y, mIndex, Math.min(dueDay, days))
    }
    let cursor = today.getFullYear() * 12 + today.getMonth()
    let current = dueOnCursor(cursor)
    if (current <= today) {
      cursor += 1
      current = dueOnCursor(cursor)
    }
    while (current <= exitDate) {
      const month = (((cursor % 12) + 12) % 12) + 1
      const year = Math.floor(cursor / 12)
      const exists = paymentHistory.some((p) => p.month === month && p.year === year)
      if (!exists) {
        const rentAmount = selectedTenant.rooms_table?.rent_amount || 0
        const extraChargesAmt = selectedTenant.extra_charges || 0
        upcoming.push({
          id: null,
          month,
          year,
          rent_amount: rentAmount,
          extra_charges: extraChargesAmt,
          total_amount: Math.max(rentAmount + extraChargesAmt, 0),
          due_date: current.toISOString().split("T")[0],
          status: "upcoming",
          isUpcoming: true,
        })
      }
      cursor += 1
      current = dueOnCursor(cursor)
    }
    setUpcomingPayments(upcoming)
  }, [selectedTenant, moveOutDate, paymentHistory])

  const handleQuickSettleDues = async () => {
    if (!selectedTenant) return
    try {
      setIsSettlingDues(true)
      const unpaidIds = paymentHistory
        .filter((p) => p.status === "pending" || p.status === "late" || p.status === "submitted")
        .map((p) => p.id)
        .filter((id): id is number => id != null)
      if (unpaidIds.length === 0) return
      const now = new Date().toISOString()
      const { error } = await db
        .from("payments")
        .update({ status: "paid", paid_at: now, verified_at: now, payment_method: "Cash" })
        .in("id", unpaidIds)
      if (error) throw error
      for (const payId of unpaidIds) {
        await db.from("payment_audit_log").insert({
          payment_id: payId,
          owner_id: user!.id,
          action: "proof_approved",
          old_status: "pending",
          new_status: "paid",
          notes: "Outstanding dues settled during checkout/move-out flow",
        })
      }
      dashboardToast.success("Dues Settled", { description: "All unpaid dues marked as paid." })
      setPaymentHistory((prev) =>
        prev.map((p) =>
          p.id != null && unpaidIds.includes(p.id)
            ? { ...p, status: "paid", paid_at: now, verified_at: now, payment_method: "Cash" }
            : p,
        ),
      )
      setDepositRefundAmount((selectedTenant.deposit_amount || 0).toString())
    } catch (err) {
      console.error("Failed to settle dues:", err)
      dashboardToast.error((err as Error)?.message || "Failed to settle outstanding dues.")
    } finally {
      setIsSettlingDues(false)
    }
  }

  const openMoveOut = () => {
    if (!selectedTenant) return
    if (selectedTenant.status === "notice_period" && selectedTenant.exit_date) {
      setMoveOutDate(selectedTenant.exit_date)
      setDepositRefundAmount(
        (selectedTenant.deposit_refund_amount ?? Math.floor((selectedTenant.deposit_amount || 0) * 0.5)).toString(),
      )
    } else {
      setMoveOutDate(new Date().toISOString().split("T")[0])
      setDepositRefundAmount(Math.floor((selectedTenant.deposit_amount || 0) * 0.5).toString())
    }
    if (selectedTenant.deduction_payment_id) {
      const deductedPayment = paymentHistory.find((p) => p.id === selectedTenant.deduction_payment_id)
      if (deductedPayment && deductedPayment.status === "paid") {
        setDeductionLocked(true)
        setSelectedDeductionPayment(deductedPayment)
        setDeductionMode(true)
      } else if (deductedPayment) {
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
    setMoveOutOpen(true)
  }

  const handleConfirmMoveOut = async () => {
    if (!selectedTenant || !user?.id) return
    try {
      setIsCheckingOut(true)
      const todayStr = new Date().toISOString().split("T")[0]
      const status: TenantStatus = moveOutDate > todayStr ? "notice_period" : "move_out"
      const refundAmt = parseFloat(depositRefundAmount) || 0

      const tenantUpdate: Record<string, unknown> = {
        status,
        exit_date: moveOutDate,
        deposit_refund_amount: refundAmt,
        room_id: status === "move_out" ? null : selectedTenant.room_id,
      }

      if (selectedDeductionPayment && refundAmt > 0 && !deductionLocked) {
        const previousDeductionPaymentId = selectedTenant.deduction_payment_id
        const previousOriginalAmount = selectedTenant.original_payment_amount
        if (
          previousDeductionPaymentId &&
          previousOriginalAmount != null &&
          previousDeductionPaymentId !== selectedDeductionPayment.id
        ) {
          await db
            .from("payments")
            .update({
              rent_amount: previousOriginalAmount,
              total_amount:
                previousOriginalAmount +
                (paymentHistory.find((p) => p.id === previousDeductionPaymentId)?.extra_charges || 0),
              verification_notes: null,
            })
            .eq("id", previousDeductionPaymentId)
          await db.from("payment_audit_log").insert({
            payment_id: previousDeductionPaymentId,
            owner_id: user.id,
            action: "deposit_deduction_reversed",
            notes: `Deposit deduction reversed. Amount restored to ₹${previousOriginalAmount}`,
          })
        }

        if (selectedDeductionPayment.id) {
          const originalRent = selectedDeductionPayment.rent_amount
          const originalTotal = selectedDeductionPayment.total_amount
          const newRent = Math.max(originalRent - refundAmt, 0)
          const newTotal = Math.max(originalTotal - refundAmt, 0)
          await db
            .from("payments")
            .update({
              rent_amount: newRent,
              total_amount: newTotal,
              verification_notes: `₹${refundAmt} deducted from deposit refund`,
            })
            .eq("id", selectedDeductionPayment.id)
          await db.from("payment_audit_log").insert({
            payment_id: selectedDeductionPayment.id,
            owner_id: user.id,
            action: "deposit_deduction",
            notes: `₹${refundAmt} deducted from deposit. Original: ₹${originalTotal}, New: ₹${newTotal}`,
          })
          tenantUpdate.deduction_payment_id = selectedDeductionPayment.id
          tenantUpdate.original_payment_amount = originalRent
          tenantUpdate.pending_deposit_deduction = null
          tenantUpdate.deduction_target_month = null
          tenantUpdate.deduction_target_year = null
        } else {
          tenantUpdate.pending_deposit_deduction = refundAmt
          tenantUpdate.deduction_target_month = selectedDeductionPayment.month
          tenantUpdate.deduction_target_year = selectedDeductionPayment.year
          tenantUpdate.deduction_payment_id = null
          tenantUpdate.original_payment_amount = null
        }
      } else if (!selectedDeductionPayment && !deductionLocked) {
        tenantUpdate.deduction_payment_id = null
        tenantUpdate.original_payment_amount = null
        tenantUpdate.pending_deposit_deduction = null
        tenantUpdate.deduction_target_month = null
        tenantUpdate.deduction_target_year = null
      }

      const { error: tenantErr } = await db.from("tenants_table").update(tenantUpdate).eq("id", selectedTenant.id)
      if (tenantErr) throw tenantErr

      if (status === "move_out" && selectedTenant.room_id) {
        const { data: roomData } = await db
          .from("rooms_table")
          .select("occupied_beds")
          .eq("id", selectedTenant.room_id)
          .single()
        if (roomData) {
          await db
            .from("rooms_table")
            .update({ occupied_beds: Math.max(roomData.occupied_beds - 1, 0) })
            .eq("id", selectedTenant.room_id)
        }
      }

      setMoveOutOpen(false)
      setDetailOpen(false)
      setDeductionMode(false)
      setSelectedDeductionPayment(null)
      if (status === "notice_period") {
        dashboardToast.success("Notice Period Scheduled", { description: `${selectedTenant.name} is now in notice period.` })
      } else {
        dashboardToast.success("Move Out Completed", { description: `${selectedTenant.name} has been checked out.` })
      }
      void fetchData(true)
    } catch (err) {
      console.error("Checkout error:", err)
      dashboardToast.error((err as Error)?.message || "Could not complete checkout.")
    } finally {
      setIsCheckingOut(false)
    }
  }

  // ----- Identity management -------------------------------------------------

  const confirmIgnoreIdentity = async () => {
    setIgnoreConfirmOpen(false)
    if (!selectedTenant) return
    const target = selectedTenant
    const nextState = applyIgnore({
      identity_request_flag: !!target.identity_request_flag,
      verification_status: (target.verification_status || "Not_Started") as VerificationStatus,
      ignore_identity_flag: !!target.ignore_identity_flag,
    })
    setIsIgnoringIdentity(true)
    try {
      const { error } = await db
        .from("tenants_table")
        .update({ ignore_identity_flag: nextState.ignore_identity_flag, verification_status: nextState.verification_status })
        .eq("id", target.id)
      if (error) throw error
      setSelectedTenant((prev) =>
        prev && prev.id === target.id
          ? { ...prev, ignore_identity_flag: nextState.ignore_identity_flag, verification_status: nextState.verification_status }
          : prev,
      )
      setTenants((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? { ...t, ignore_identity_flag: nextState.ignore_identity_flag, verification_status: nextState.verification_status }
            : t,
        ),
      )
      dashboardToast.success("Reminders stopped", { description: "Identity reminders stopped for this occupant." })
    } catch (err) {
      console.error("Error ignoring tenant identity:", err)
      dashboardToast.error("Could not stop identity reminders. Please try again.")
    } finally {
      setIsIgnoringIdentity(false)
    }
  }

  const openManualUploadModal = (tenant: Tenant) => {
    setSelectedTenant(tenant)
    setManualUploadType("")
    setManualFront(null)
    setManualBack(null)
    setManualFrontPreview(null)
    setManualBackPreview(null)
    setManualUploadOpen(true)
  }

  const submitManualUpload = async () => {
    const tenant = selectedTenant
    if (!tenant || !user?.id || isManualUploading) return
    if (manualUploadType !== "Aadhaar" && manualUploadType !== "PAN") {
      dashboardToast.info("Select a type", { description: "Choose Aadhaar or PAN first." })
      return
    }
    if (!manualFront) {
      dashboardToast.info("Front required", { description: "Please upload the front image." })
      return
    }
    if (manualUploadType === "Aadhaar" && !manualBack) {
      dashboardToast.info("Back required", { description: "Please upload the back image for Aadhaar." })
      return
    }
    setIsManualUploading(true)
    try {
      const uploadOne = async (file: File, side: "front" | "back") => {
        const path = `${user.id}/${tenant.id}/${side}.jpg`
        const { error: uploadError } = await supabase.storage
          .from("identity_documents")
          .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true })
        if (uploadError) throw uploadError
        return path
      }
      const frontPath = await uploadOne(manualFront, "front")
      let backPath: string | null = null
      if (manualUploadType === "Aadhaar" && manualBack) backPath = await uploadOne(manualBack, "back")

      const update: Partial<Tenant> = {
        identity_type: manualUploadType,
        id_front_path: frontPath,
        id_back_path: backPath,
        verification_status: "Verified",
      }
      const { error: updErr } = await db.from("tenants_table").update(update).eq("id", tenant.id)
      if (updErr) throw updErr
      setSelectedTenant((prev) => (prev && prev.id === tenant.id ? { ...prev, ...update } : prev))
      setTenants((prev) => prev.map((t) => (t.id === tenant.id ? { ...t, ...update } : t)))
      setIdentityResetTenantId((prev) => (prev === tenant.id ? null : prev))
      setManualUploadOpen(false)
      dashboardToast.success("Documents Uploaded", { description: "Identity documents saved and marked verified." })
    } catch (e) {
      console.error("Manual identity upload failed:", e)
      dashboardToast.error((e as Error)?.message || "Could not upload identity documents.")
    } finally {
      setIsManualUploading(false)
    }
  }

  const handleDeleteIdentityDocs = async (tenant: Tenant) => {
    if (isDeletingIdentity) return
    setIsDeletingIdentity(true)
    try {
      const paths: string[] = []
      if (tenant.id_front_path?.trim()) paths.push(tenant.id_front_path)
      if (tenant.id_back_path?.trim()) paths.push(tenant.id_back_path)
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from("identity_documents").remove(paths)
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
      const { error: updErr } = await db.from("tenants_table").update(update).eq("id", tenant.id)
      if (updErr) throw updErr
      setSelectedTenant((prev) => (prev && prev.id === tenant.id ? { ...prev, ...update } : prev))
      setTenants((prev) => prev.map((t) => (t.id === tenant.id ? { ...t, ...update } : t)))
      setIdentityResetTenantId(tenant.id)
      dashboardToast.success("Documents Deleted", { description: "Choose to request again or upload." })
    } catch (e) {
      console.error("Delete identity docs failed:", e)
      dashboardToast.error((e as Error)?.message || "Could not delete identity documents.")
    } finally {
      setIsDeletingIdentity(false)
    }
  }

  const handleRequestIdentityAgain = async (tenant: Tenant) => {
    if (isRequestingIdentityAgain) return
    setIsRequestingIdentityAgain(true)
    try {
      const update: Partial<Tenant> = {
        identity_request_flag: true,
        ignore_identity_flag: false,
        verification_status: "Not_Started",
      }
      const { error: updErr } = await db.from("tenants_table").update(update).eq("id", tenant.id)
      if (updErr) throw updErr
      setSelectedTenant((prev) => (prev && prev.id === tenant.id ? { ...prev, ...update } : prev))
      setTenants((prev) => prev.map((t) => (t.id === tenant.id ? { ...t, ...update } : t)))
      setIdentityResetTenantId((prev) => (prev === tenant.id ? null : prev))
      void requestTenantIdentity({ id: tenant.id, name: tenant.name, mobile_number: tenant.mobile_number })
      dashboardToast.success("Identity Requested", { description: "A verification request was sent; daily reminders resumed." })
    } catch (e) {
      console.error("Request identity again failed:", e)
      dashboardToast.error((e as Error)?.message || "Could not request identity again.")
    } finally {
      setIsRequestingIdentityAgain(false)
    }
  }

  const openIdentityViewer = async (tenant: Tenant) => {
    const frontPath = tenant.id_front_path?.trim() || ""
    const backPath = tenant.id_back_path?.trim() || ""
    setIdViewerSide("front")
    setIdFrontUrl(null)
    setIdBackUrl(null)
    setIdViewerLoading(true)
    setIdViewerOpen(true)
    const signOne = async (path: string): Promise<string | null> => {
      if (!path) return null
      try {
        const { data, error } = await supabase.storage.from("identity_documents").createSignedUrl(path, 3600)
        if (!error && data?.signedUrl) return data.signedUrl
        return null
      } catch (err) {
        console.error("Error creating identity document signed URL:", err)
        return null
      }
    }
    const [front, back] = await Promise.all([signOne(frontPath), signOne(backPath)])
    setIdFrontUrl(front)
    setIdBackUrl(back)
    setIdViewerLoading(false)
  }

  // ----- Payment record actions ---------------------------------------------

  const openPaymentDetail = async (payment: Payment) => {
    setSelectedPaymentDetail(payment)
    setPaymentDetailOpen(true)
    setRejectingMode(false)
    setRejectNotes("")
    setSignedScreenshotUrl(null)
    if (payment.screenshot_path && payment.id != null) {
      setLoadingScreenshot(true)
      try {
        const res = await fetch(`/api/payments/${payment.id}/screenshot`)
        if (res.ok) {
          const data = await res.json()
          if (data?.url) setSignedScreenshotUrl(data.url)
        }
      } catch (err) {
        console.error("Failed to load receipt:", err)
      } finally {
        setLoadingScreenshot(false)
      }
    }
  }

  const refreshPaymentHistory = async () => {
    if (!selectedTenant) return
    const { data, error } = await db
      .from("payments")
      .select("*")
      .eq("tenant_id", selectedTenant.id)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
    if (!error && data) setPaymentHistory(data as unknown as Payment[])
  }

  const handleApprovePayment = async (payment: Payment) => {
    if (payment.id == null) return
    const now = new Date().toISOString()
    setPaymentHistory((prev) => prev.map((p) => (p.id === payment.id ? { ...p, status: "paid", paid_at: now, verified_at: now } : p)))
    setSelectedPaymentDetail((prev) => (prev ? { ...prev, status: "paid", paid_at: now, verified_at: now } : null))
    try {
      const res = await fetch(`/api/payments/${payment.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      if (!res.ok) throw new Error("approve failed")
      dashboardToast.success("Payment Approved", { description: "The payment proof has been approved." })
    } catch (err) {
      console.error("Approve payment error:", err)
      dashboardToast.error("Failed to approve payment record.")
      void refreshPaymentHistory()
    }
  }

  const handleRejectPayment = async (payment: Payment) => {
    if (payment.id == null) return
    const notes = rejectNotes
    setPaymentHistory((prev) => prev.map((p) => (p.id === payment.id ? { ...p, status: "pending", verification_notes: notes } : p)))
    setSelectedPaymentDetail((prev) => (prev ? { ...prev, status: "pending", verification_notes: notes } : null))
    setRejectingMode(false)
    setRejectNotes("")
    try {
      const res = await fetch(`/api/payments/${payment.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", notes }),
      })
      if (!res.ok) throw new Error("reject failed")
      dashboardToast.warning("Payment Rejected", { description: "The payment proof has been rejected." })
    } catch (err) {
      console.error("Reject payment error:", err)
      dashboardToast.error("Failed to reject payment record.")
      void refreshPaymentHistory()
    }
  }

  const confirmMarkPaid = async (paymentId: number, method: "UPI" | "Cash") => {
    setMarkPaidOpen(false)
    setMarkingPaidPaymentId(null)
    const now = new Date().toISOString()
    setPaymentHistory((prev) =>
      prev.map((p) => (p.id === paymentId ? { ...p, status: "paid", paid_at: now, payment_method: method } : p)),
    )
    setSelectedPaymentDetail((prev) => (prev && prev.id === paymentId ? { ...prev, status: "paid", paid_at: now, payment_method: method } : prev))
    try {
      const { error } = await db
        .from("payments")
        .update({ status: "paid", paid_at: now, verified_at: now, payment_method: method })
        .eq("id", paymentId)
      if (error) throw error
      await db.from("payment_audit_log").insert({
        payment_id: paymentId,
        owner_id: user!.id,
        action: "proof_approved",
        old_status: "pending",
        new_status: "paid",
        notes: `Marked paid manually by owner via ${method} (Tenants)`,
      })
      dashboardToast.success("Payment Confirmed", { description: `Rent marked as paid via ${method}.` })
    } catch (err) {
      console.error("Failed manual verification updates:", err)
      dashboardToast.error("Could not synchronize payment status.")
      void refreshPaymentHistory()
    }
  }

  const confirmDeletePayment = async () => {
    if (deletePaymentId == null) return
    const paymentId = deletePaymentId
    setDeletePaymentConfirmOpen(false)
    setDeletePaymentId(null)
    try {
      const { error } = await db.from("payments").delete().eq("id", paymentId)
      if (error) throw error
      setPaymentDetailOpen(false)
      dashboardToast.success("Deleted Successfully", { description: "The billing record has been permanently deleted." })
      void refreshPaymentHistory()
    } catch (err) {
      console.error("Error deleting payment record:", err)
      dashboardToast.error("Failed to delete the selected billing row.")
    }
  }

  const handleWhatsAppReminder = async () => {
    if (!selectedPaymentDetail || !selectedTenant) return
    if (!selectedTenant.mobile_number) {
      dashboardToast.error("Missing Phone Number", { description: "This tenant has no registered mobile number." })
      return
    }
    setIsSendingWhatsAppPayment(true)
    try {
      // Unique per-tenant payment link (no grouped phone-number verification).
      const token = await ensurePaymentPortalToken(selectedTenant.id)
      if (!token) {
        dashboardToast.error("Couldn't create link", { description: "Failed to generate the tenant payment link." })
        return
      }
      const message = getPaymentWhatsAppMessage(selectedPaymentDetail, token)
      const sent = await sendWhatsApp(selectedTenant.id, message)
      if (sent) dashboardToast.success("Reminder Sent", { description: "Reminder sent via WhatsApp." })
      else dashboardToast.warning("Not sent", { description: "Couldn't deliver the WhatsApp reminder." })
    } finally {
      setIsSendingWhatsAppPayment(false)
    }
  }

  const handleDirectWhatsAppChat = async (tenant: Tenant) => {
    if (!tenant.mobile_number) {
      dashboardToast.error("Missing Phone Number", { description: "This tenant has no registered mobile number." })
      return
    }
    const message = `Hi ${tenant.name || "Tenant"}, hope you are doing well! This is a message from the property management team regarding your tenancy. Please let us know if you have any questions or need assistance.`
    setIsSendingWhatsAppTenant(true)
    try {
      const sent = await sendWhatsApp(tenant.id, message)
      if (sent) dashboardToast.success("Message Sent", { description: "Message sent via WhatsApp." })
      else dashboardToast.warning("Not sent", { description: "Couldn't deliver the WhatsApp message." })
    } finally {
      setIsSendingWhatsAppTenant(false)
    }
  }

  // ----- Derived data --------------------------------------------------------

  const counts = useMemo(() => {
    return {
      all: tenants.filter((t) => t.status !== "move_out").length,
      active: tenants.filter((t) => t.status === "active").length,
      pending_move_in: tenants.filter((t) => t.status === "pending_move_in").length,
      notice_period: tenants.filter((t) => t.status === "notice_period").length,
      move_out: tenants.filter((t) => t.status === "move_out").length,
    } as Record<string, number>
  }, [tenants])

  const filteredTenants = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return tenants.filter((tenant) => {
      const nameMatch = (tenant.name || "").toLowerCase().includes(q)
      const phoneMatch = (tenant.mobile_number || "").includes(searchQuery)
      const emailMatch = (tenant.email || "").toLowerCase().includes(q)
      const roomMatch = (tenant.rooms_table?.room_number || "").toLowerCase().includes(q)
      let statusMatch = false
      if (statusFilter === "all") statusMatch = tenant.status !== "move_out"
      else if (statusFilter === "move_out") statusMatch = tenant.status === "move_out"
      else statusMatch = tenant.status === statusFilter
      return (nameMatch || phoneMatch || emailMatch || roomMatch) && statusMatch
    })
  }, [tenants, searchQuery, statusFilter])

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      dashboardToast.success("Copied", { description: `${label} copied to clipboard.` })
    } catch {
      dashboardToast.error("Couldn't copy to clipboard.")
    }
  }

  const rentDueDayOptions = useMemo(
    () =>
      Array.from({ length: 31 }, (_, i) => {
        const day = i + 1
        const suffix = day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"
        return { value: String(day), label: `${day}${suffix} of every month` }
      }),
    [],
  )

  const selectedFormRoom = rooms.find((r) => r.id.toString() === selectedRoomId)
  const depositValue = parseInt(depositAmount, 10) || 0

  return (
    <DashboardLayout title="Tenants">
      <div className="flex flex-col gap-6">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <div className="hidden sm:block">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Tenants</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage occupants directory ({filteredTenants.length} people)
            </p>
          </div>
          <Button onClick={openAddModal} className="ml-auto gap-2" disabled={pgMissing}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Occupant</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>

        {pgMissing ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-4 pt-6">
              <h2 className="text-lg font-semibold text-foreground">Complete onboarding to manage tenants</h2>
              <p className="text-sm text-muted-foreground">
                We couldn&apos;t find your PG details. Please complete onboarding first, then you can add tenants.
              </p>
              <Button asChild>
                <Link href="/onboarding">Go to onboarding</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, mobile, email or room…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Status chips */}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
              {STATUS_CHIPS.map((chip) => {
                const active = statusFilter === chip
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setStatusFilter(chip)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>{statusLabel(chip)}</span>
                    <span
                      className={cn(
                        "min-w-[18px] rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                        active ? "bg-white/20" : "bg-muted",
                      )}
                    >
                      {counts[chip] ?? 0}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* List */}
            {loading && tenants.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading tenants…</p>
              </div>
            ) : filteredTenants.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/40">
                  <User className="h-6 w-6 text-muted-foreground" />
                </span>
                <p className="text-sm font-semibold text-foreground">No tenants found</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {searchQuery ? "No tenants match your query." : "Add your first occupant to get started."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredTenants.map((item) => (
                  <button
                    key={`${item.id}-${item.status}`}
                    type="button"
                    onClick={() => void openDetail(item)}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-foreground">{item.name}</span>
                        <Badge variant="outline" className={cn("shrink-0 text-[9px] uppercase", statusBadgeClass(item.status))}>
                          {statusLabel(item.status)}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Hotel className="h-3 w-3" />
                          Room {item.rooms_table?.room_number || "Unassigned"}
                        </span>
                        {item.mobile_number && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {item.mobile_number}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ===================== Tenant Detail Sheet ===================== */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          {selectedTenant && (
            <>
              <SheetHeader className="border-b border-border p-5">
                <div className="flex items-center gap-3 pr-8">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="truncate text-lg">{selectedTenant.name}</SheetTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[10px] text-primary">
                        Room {selectedTenant.rooms_table?.room_number || "N/A"}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px] uppercase", statusBadgeClass(selectedTenant.status))}>
                        {statusLabel(selectedTenant.status)}
                      </Badge>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "details" | "history")} className="flex min-h-0 flex-1 flex-col">
                <div className="px-5 pt-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="details">Details &amp; ID</TabsTrigger>
                    <TabsTrigger value="history">Payment History</TabsTrigger>
                  </TabsList>
                </div>

                {/* ---------------- Details tab ---------------- */}
                <TabsContent value="details" className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
                  <div className="flex flex-col gap-3 py-1">
                    {/* Notice / pending banners */}
                    {(selectedTenant.status === "notice_period" || selectedTenant.status === "pending_move_in") && (
                      <div
                        className={cn(
                          "flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold",
                          selectedTenant.status === "pending_move_in"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
                            : "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-950/30 dark:text-purple-400",
                        )}
                      >
                        <Info className="h-4 w-4 shrink-0" />
                        <span>
                          {selectedTenant.status === "pending_move_in"
                            ? `Joining on ${formatDateFriendly(selectedTenant.join_date)}`
                            : `Moving out on ${formatDateFriendly(selectedTenant.exit_date)}`}
                        </span>
                      </div>
                    )}

                    {/* Room assignment card */}
                    {selectedTenant.status !== "move_out" && (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                            <Hotel className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Assigned Room</p>
                            <p className="truncate text-base font-bold text-foreground">
                              Room {selectedTenant.rooms_table?.room_number || "Unassigned"}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            setRoomChangeSearchQuery("")
                            setChangeRoomSelectedRoomId(null)
                            setChangeRoomSwapTenantId(null)
                            setChangeRoomOpen(true)
                          }}
                        >
                          Change Room
                        </Button>
                      </div>
                    )}

                    {/* Contact + financial rows */}
                    {selectedTenant.mobile_number && (
                      <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone Number">
                        <div className="flex items-center gap-2">
                          <a href={`tel:${selectedTenant.mobile_number}`} className="text-sm font-bold text-primary">
                            {selectedTenant.mobile_number}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(selectedTenant.mobile_number || "", "Phone number")}
                            className="rounded-md bg-primary/10 p-1.5 text-primary hover:bg-primary/20"
                            aria-label="Copy phone number"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </DetailRow>
                    )}
                    {selectedTenant.email && (
                      <DetailRow icon={<Mail className="h-4 w-4" />} label="Email Address">
                        <span className="text-sm font-semibold text-foreground">{selectedTenant.email}</span>
                      </DetailRow>
                    )}
                    <DetailRow icon={<CalendarIcon className="h-4 w-4" />} label="Joining Date">
                      <span className="text-sm font-semibold text-foreground">{selectedTenant.join_date || "Not set"}</span>
                    </DetailRow>
                    <DetailRow icon={<CalendarIcon className="h-4 w-4" />} label="Rent Due Day">
                      <span className="text-sm font-semibold text-foreground">Every {selectedTenant.rent_due_day || 5}th of month</span>
                    </DetailRow>
                    {selectedTenant.rooms_table && (
                      <DetailRow icon={<CreditCard className="h-4 w-4" />} label="Room Rent">
                        <span className="text-sm font-semibold text-foreground">
                          ₹{(selectedTenant.rooms_table.rent_amount || 0).toLocaleString()} / month
                        </span>
                      </DetailRow>
                    )}
                    <DetailRow icon={<CreditCard className="h-4 w-4" />} label="Security Deposit">
                      <span className="text-sm font-semibold text-foreground">₹{(selectedTenant.deposit_amount || 0).toLocaleString()}</span>
                    </DetailRow>
                    <DetailRow icon={<CreditCard className="h-4 w-4" />} label={(selectedTenant.extra_charges || 0) < 0 ? "Discount" : "Extra Charges"}>
                      {(() => {
                        const ec = selectedTenant.extra_charges || 0
                        return (
                          <span className={cn("text-sm font-semibold", ec < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                            {ec < 0 ? "− " : ""}₹{Math.abs(ec).toLocaleString()}
                          </span>
                        )
                      })()}
                    </DetailRow>
                    {selectedTenant.notes && (
                      <div className="py-1">
                        <p className="mb-1.5 text-sm font-semibold text-muted-foreground">Tenant Notes</p>
                        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
                          {selectedTenant.notes}
                        </div>
                      </div>
                    )}

                    {/* Identity verification section */}
                    {renderIdentitySection()}
                  </div>
                </TabsContent>

                {/* ---------------- Payment History tab ---------------- */}
                <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : paymentHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                      <CreditCard className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No payment history available.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5 py-1">
                      {paymentHistory.map((payment) => {
                        const total = (payment.rent_amount || 0) + (payment.extra_charges || 0)
                        return (
                          <button
                            key={payment.id ?? `${payment.month}-${payment.year}`}
                            type="button"
                            onClick={() => void openPaymentDetail(payment)}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:bg-muted/40"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-foreground">
                                  {MONTH_SHORT[payment.month] || "Month"} {payment.year}
                                </span>
                                {payment.is_deposit && (
                                  <Badge variant="outline" className="border-sky-300 bg-sky-50 text-[9px] text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-400">
                                    Deposit
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">Due {formatDateFriendly(payment.due_date)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-foreground">₹{total.toLocaleString()}</span>
                              <Badge variant="outline" className={cn("text-[9px] capitalize", paymentBadgeClass(payment.status))}>
                                {payment.status}
                              </Badge>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Footer actions */}
              <div className="flex flex-wrap gap-2 border-t border-border p-4">
                {selectedTenant.status === "move_out" ? (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                      disabled={isSendingWhatsAppTenant}
                      onClick={() => void handleDirectWhatsAppChat(selectedTenant)}
                      aria-label="WhatsApp tenant"
                    >
                      {isSendingWhatsAppTenant ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 gap-2"
                      onClick={() => {
                        setTenantToDelete({ id: selectedTenant.id, roomId: selectedTenant.room_id })
                        setDeleteOpen(true)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Record
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                      disabled={isSendingWhatsAppTenant}
                      onClick={() => void handleDirectWhatsAppChat(selectedTenant)}
                      aria-label="WhatsApp tenant"
                    >
                      {isSendingWhatsAppTenant ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2 border-primary/30 text-primary hover:bg-primary/10" onClick={openMoveOut}>
                      <LogOut className="h-4 w-4" />
                      Move Out
                    </Button>
                    <Button className="flex-1 gap-2" onClick={() => openEditModal(selectedTenant)}>
                      <Edit3 className="h-4 w-4" />
                      Edit Profile
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ===================== Add / Edit Tenant Dialog ===================== */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTenant ? `Edit ${editingTenant.name}` : "Add Occupant"}</DialogTitle>
            <DialogDescription>Configure the tenant profile and room assignment.</DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="tenant-name">Tenant Name</Label>
              <Input id="tenant-name" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alice Smith" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="tenant-mobile">Mobile Number</Label>
                <Input
                  id="tenant-mobile"
                  className="mt-1"
                  value={mobileNumber}
                  inputMode="tel"
                  maxLength={10}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="10-digit number"
                />
              </div>
              <div>
                <Label htmlFor="tenant-email">Email Address</Label>
                <Input id="tenant-email" className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alice@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="tenant-join">Join Date</Label>
                <Input id="tenant-join" className="mt-1" type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tenant-due">Rent Due Day</Label>
                <Select value={rentDueDay} onValueChange={setRentDueDay}>
                  <SelectTrigger id="tenant-due" className="mt-1 w-full">
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {rentDueDayOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Room assignment */}
            <div>
              <Label>Room Assignment</Label>
              {selectedFormRoom ? (
                <div className="mt-1 flex items-center justify-between rounded-lg border border-primary bg-primary/5 p-3">
                  <div className="flex items-center gap-2">
                    <Hotel className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-bold text-foreground">Room {selectedFormRoom.room_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedFormRoom.occupied_beds}/{selectedFormRoom.total_beds} beds occupied · ₹{selectedFormRoom.rent_amount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRoomId("")
                      setRoomSearchQuery("")
                    }}
                    className="rounded-full bg-muted p-1.5 text-destructive hover:bg-muted/70"
                    aria-label="Clear room"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={roomSearchQuery}
                    onChange={(e) => setRoomSearchQuery(e.target.value)}
                    placeholder="Search room by number…"
                  />
                  {roomSearchQuery.length > 0 && (
                    <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-border bg-card shadow-sm">
                      {(() => {
                        const q = roomSearchQuery.toLowerCase()
                        const filtered = availableRooms.filter((r) => r.room_number.toLowerCase().includes(q))
                        if (filtered.length === 0) {
                          return <p className="p-3 text-center text-xs text-muted-foreground">No vacant rooms match your search</p>
                        }
                        return filtered.map((room) => (
                          <button
                            key={room.id}
                            type="button"
                            onClick={() => {
                              setSelectedRoomId(room.id.toString())
                              setRoomSearchQuery("")
                            }}
                            className="flex w-full items-center justify-between border-b border-border/50 px-4 py-3 text-left last:border-0 hover:bg-muted/40"
                          >
                            <div>
                              <p className="text-xs font-bold text-foreground">Room {room.room_number}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {room.occupied_beds}/{room.total_beds} beds occupied · ₹{room.rent_amount.toLocaleString()}
                              </p>
                            </div>
                            <Plus className="h-4 w-4 text-primary" />
                          </button>
                        ))
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="tenant-deposit">Deposit (₹)</Label>
                <Input id="tenant-deposit" className="mt-1" inputMode="numeric" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value.replace(/\D/g, ""))} placeholder="10000" />
              </div>
              <div>
                <Label htmlFor="tenant-extra">Extra Charges / Discount (₹)</Label>
                <Input id="tenant-extra" className="mt-1" inputMode="text" value={extraCharges} onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9-]/g, "")
                  const sign = cleaned.startsWith("-") ? "-" : ""
                  setExtraCharges(sign + cleaned.replace(/-/g, ""))
                }} placeholder="0" />
                <p className="mt-1 text-[11px] text-muted-foreground">Use a negative value (e.g. -500) to apply a discount.</p>
              </div>
            </div>

            {/* Reminders (chatbot owners only, add-only) */}
            {chatbotEnabled && !editingTenant && (
              <div className="flex flex-col gap-2.5">
                <Label>Reminders</Label>
                <label className="flex items-start gap-3 rounded-lg border border-border bg-card p-3.5">
                  <Checkbox
                    checked={requestIdentityFromTenant}
                    onCheckedChange={(c) => setRequestIdentityFromTenant(!!c)}
                    className="mt-0.5"
                  />
                  <span className="text-sm font-semibold text-foreground">Request identity from tenant</span>
                </label>
                <label
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border bg-card p-3.5",
                    depositValue <= 0 && "opacity-50",
                  )}
                >
                  <Checkbox
                    checked={requestDepositPayment && depositValue > 0}
                    disabled={depositValue <= 0}
                    onCheckedChange={(c) => setRequestDepositPayment(!!c)}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-foreground">Create deposit payment record &amp; send reminder</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {depositValue <= 0
                        ? "Enter a deposit amount above to enable this."
                        : `Adds a pending deposit fee of ₹${depositValue} and sends a payment reminder.`}
                    </span>
                  </span>
                </label>
                <label
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border bg-card p-3.5",
                    !ownerSettings?.whatsapp_invite_link && "opacity-50",
                  )}
                >
                  <Checkbox
                    checked={includeWhatsappInvite && !!ownerSettings?.whatsapp_invite_link}
                    disabled={!ownerSettings?.whatsapp_invite_link}
                    onCheckedChange={(c) => setIncludeWhatsappInvite(!!c)}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-foreground">Include WhatsApp group invite link</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {!ownerSettings?.whatsapp_invite_link
                        ? "Set a WhatsApp invite link in Settings to enable this."
                        : "Invites the tenant to join your WhatsApp group."}
                    </span>
                  </span>
                </label>
              </div>
            )}

            <div>
              <Label htmlFor="tenant-notes">Custom Notes</Label>
              <Textarea
                id="tenant-notes"
                className="mt-1 min-h-20 resize-none"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Office address, emergency contact, ID card ref…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setFormOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleSaveTenant} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : editingTenant ? (
                "Save Changes"
              ) : (
                "Save Occupant"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Move Out Dialog ===================== */}
      <Dialog open={moveOutOpen} onOpenChange={setMoveOutOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule Move Out</DialogTitle>
            <DialogDescription>Configure move out details for {selectedTenant?.name}.</DialogDescription>
          </DialogHeader>

          {selectedTenant &&
            (() => {
              const unpaidPayments = paymentHistory.filter(
                (p) => p.status === "pending" || p.status === "late" || p.status === "submitted",
              )
              const unpaidTotal = unpaidPayments.reduce((acc, c) => acc + (c.rent_amount || 0) + (c.extra_charges || 0), 0)
              const allDeductiblePayments = [...unpaidPayments, ...upcomingPayments]
              const refundAmt = parseFloat(depositRefundAmount) || 0

              return (
                <div className="flex flex-col gap-4">
                  <div>
                    <Label htmlFor="moveout-date">Move Out Date</Label>
                    <Input
                      id="moveout-date"
                      className="mt-1"
                      type="date"
                      value={moveOutDate}
                      onChange={(e) => {
                        const date = e.target.value
                        setMoveOutDate(date)
                        if (selectedTenant.status !== "notice_period" && !deductionLocked) {
                          const todayStr = new Date().toISOString().split("T")[0]
                          if (date > todayStr) {
                            setDepositRefundAmount(Math.floor((selectedTenant.deposit_amount || 0) * 0.5).toString())
                          } else if (unpaidTotal > 0) {
                            setDepositRefundAmount(Math.max((selectedTenant.deposit_amount || 0) - unpaidTotal, 0).toString())
                          } else {
                            setDepositRefundAmount(Math.floor((selectedTenant.deposit_amount || 0) * 0.5).toString())
                          }
                        }
                      }}
                    />
                  </div>

                  {(allDeductiblePayments.length > 0 || deductionMode) && (
                    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                          {deductionLocked ? "Deposit Deduction Applied" : "Unresolved Dues Detected"}
                        </span>
                      </div>

                      {deductionLocked ? (
                        <p className="rounded-lg bg-amber-500/10 p-3 text-xs font-medium text-amber-600 dark:text-amber-400">
                          The previously deducted payment has been paid. Deduction settings are locked.
                        </p>
                      ) : (
                        <>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            This occupant has{" "}
                            <span className="font-bold text-foreground">
                              {unpaidPayments.length} unpaid billing record{unpaidPayments.length !== 1 ? "s" : ""}
                            </span>{" "}
                            totaling <span className="font-bold text-foreground">₹{unpaidTotal.toLocaleString()}</span>.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                              disabled={isSettlingDues}
                              onClick={handleQuickSettleDues}
                            >
                              {isSettlingDues ? <Loader2 className="h-4 w-4 animate-spin" /> : "Settle Dues (Cash)"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 border-primary/30 text-primary hover:bg-primary/10"
                              onClick={() => {
                                const newMode = !deductionMode
                                setDeductionMode(newMode)
                                if (newMode) computeUpcomingPayments()
                              }}
                            >
                              {deductionMode ? "Hide Records" : "Deduct from Deposit"}
                            </Button>
                          </div>

                          {deductionMode && (
                            <div className="flex flex-col gap-2">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Select a record to deduct ₹{refundAmt.toLocaleString()} from
                              </p>
                              {allDeductiblePayments.length === 0 ? (
                                <p className="py-3 text-center text-xs text-muted-foreground">No payment records available for deduction.</p>
                              ) : (
                                allDeductiblePayments.map((payment) => {
                                  const isSelected =
                                    !!selectedDeductionPayment &&
                                    (payment.id
                                      ? payment.id === selectedDeductionPayment.id
                                      : payment.month === selectedDeductionPayment.month &&
                                        payment.year === selectedDeductionPayment.year &&
                                        payment.isUpcoming)
                                  const deductedTotal = Math.max(payment.total_amount - refundAmt, 0)
                                  const label = payment.isUpcoming
                                    ? `Upcoming — ${MONTH_SHORT[payment.month]} ${payment.year}`
                                    : `${payment.status === "late" ? "Late" : payment.status === "submitted" ? "Submitted" : "Pending"} — ${MONTH_SHORT[payment.month]} ${payment.year}`
                                  return (
                                    <button
                                      key={payment.id || `upcoming-${payment.month}-${payment.year}`}
                                      type="button"
                                      onClick={() => setSelectedDeductionPayment(payment)}
                                      className={cn(
                                        "flex items-center gap-3 rounded-lg border p-3 text-left",
                                        isSelected ? "border-primary/40 bg-primary/10" : "border-border bg-card",
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                                          isSelected ? "border-primary" : "border-muted-foreground/30",
                                        )}
                                      >
                                        {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                          {payment.isUpcoming && <Clock className="h-3 w-3 text-primary" />}
                                          {label}
                                        </span>
                                        {payment.isUpcoming && <p className="mt-0.5 text-[10px] text-muted-foreground">Due: {payment.due_date}</p>}
                                      </div>
                                      <div className="text-right">
                                        {isSelected && refundAmt > 0 ? (
                                          <>
                                            <p className="text-xs text-muted-foreground line-through">₹{payment.total_amount.toLocaleString()}</p>
                                            <p className="text-sm font-bold text-primary">₹{deductedTotal.toLocaleString()}</p>
                                          </>
                                        ) : (
                                          <p className="text-sm font-bold text-foreground">₹{payment.total_amount.toLocaleString()}</p>
                                        )}
                                      </div>
                                    </button>
                                  )
                                })
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="moveout-refund">Refund Amount (₹)</Label>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Deposit: ₹{(selectedTenant.deposit_amount || 0).toLocaleString()}
                      </span>
                    </div>
                    <Input
                      id="moveout-refund"
                      className="mt-1"
                      inputMode="numeric"
                      value={depositRefundAmount}
                      disabled={deductionLocked}
                      onChange={(e) => setDepositRefundAmount(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="0"
                    />
                    <p className="mt-1.5 text-[10px] italic leading-relaxed text-muted-foreground">
                      {deductionLocked
                        ? "Refund amount is locked because the deducted payment has been paid."
                        : "Specify how much of the security deposit should be returned upon checkout."}
                    </p>
                  </div>
                </div>
              )
            })()}

          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setMoveOutOpen(false)} disabled={isCheckingOut}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleConfirmMoveOut} disabled={isCheckingOut}>
              {isCheckingOut ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                "Confirm Move Out"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Change Room Dialog ===================== */}
      <Dialog open={changeRoomOpen} onOpenChange={setChangeRoomOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-lg">
          {changeRoomSelectedRoomId === null ? (
            <>
              <DialogHeader>
                <DialogTitle>Reassign Room</DialogTitle>
                <DialogDescription>Reassign occupant to another room.</DialogDescription>
              </DialogHeader>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={roomChangeSearchQuery} onChange={(e) => setRoomChangeSearchQuery(e.target.value)} placeholder="Search rooms…" />
              </div>
              <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                {(() => {
                  const q = roomChangeSearchQuery.toLowerCase()
                  const filtered = rooms
                    .filter((r) => r.room_number.toLowerCase().includes(q) && r.id !== selectedTenant?.room_id)
                    .sort((a, b) => b.total_beds - b.occupied_beds - (a.total_beds - a.occupied_beds))
                  if (filtered.length === 0) {
                    return (
                      <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <Hotel className="h-7 w-7 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">No rooms matched your query</p>
                      </div>
                    )
                  }
                  return filtered.map((room) => {
                    const available = (room.total_beds || 0) - (room.occupied_beds || 0)
                    const isFull = available <= 0
                    return (
                      <button
                        key={room.id}
                        type="button"
                        disabled={isUpdatingRoom}
                        onClick={() => {
                          if (isFull) setChangeRoomSelectedRoomId(room.id)
                          else void handleChangeRoom(room.id, null)
                        }}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3.5 text-left hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground">Room {room.room_number}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {room.occupied_beds}/{room.total_beds} beds occupied · ₹{room.rent_amount.toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {isFull ? (
                            <Badge variant="outline" className="border-rose-300 bg-rose-50 text-[10px] text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
                              Swap Required
                            </Badge>
                          ) : (
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{available} vacant</span>
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    )
                  })
                })()}
              </div>
              <DialogFooter>
                <Button variant="outline" className="w-full" onClick={() => setChangeRoomOpen(false)}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          ) : (
            (() => {
              const targetRoom = rooms.find((r) => r.id === changeRoomSelectedRoomId)
              const swapCandidates = tenants.filter((t) => t.room_id === changeRoomSelectedRoomId && t.status !== "move_out")
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>Swap Bed</DialogTitle>
                    <DialogDescription>
                      Select an occupant in Room {targetRoom?.room_number} to swap with.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-xs font-semibold leading-4 text-amber-700 dark:text-amber-500">
                      Room {targetRoom?.room_number} is full. Swapping will move the selected occupant to Room{" "}
                      {selectedTenant?.rooms_table?.room_number}.
                    </p>
                  </div>
                  <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                    {swapCandidates.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <User className="h-7 w-7 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">No active occupants in this room</p>
                      </div>
                    ) : (
                      swapCandidates.map((candidate) => {
                        const isSelected = changeRoomSwapTenantId === candidate.id
                        const initials = (candidate.name || "Tenant").split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => setChangeRoomSwapTenantId(candidate.id)}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-lg border p-3.5 text-left",
                              isSelected ? "border-primary bg-primary/5" : "border-border bg-card",
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {initials}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-foreground">{candidate.name}</p>
                                <p className="text-xs text-muted-foreground">{candidate.mobile_number || "No phone"}</p>
                              </div>
                            </div>
                            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border", isSelected ? "border-primary bg-primary" : "border-border")}>
                              {isSelected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        setChangeRoomSelectedRoomId(null)
                        setChangeRoomSwapTenantId(null)
                      }}
                    >
                      Back
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      disabled={!changeRoomSwapTenantId || isUpdatingRoom}
                      onClick={() => {
                        if (changeRoomSelectedRoomId) void handleChangeRoom(changeRoomSelectedRoomId, changeRoomSwapTenantId)
                      }}
                    >
                      {isUpdatingRoom ? "Processing…" : "Confirm Swap"}
                    </Button>
                  </DialogFooter>
                </>
              )
            })()
          )}
        </DialogContent>
      </Dialog>

      {/* ===================== Payment Record Detail Dialog ===================== */}
      <Dialog open={paymentDetailOpen} onOpenChange={setPaymentDetailOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-lg">
          {selectedPaymentDetail &&
            (() => {
              const payment = selectedPaymentDetail
              const total = (payment.rent_amount || 0) + (payment.extra_charges || 0)
              const monthStr = MONTH_SHORT[payment.month] || "Month"
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>
                      {monthStr} {payment.year} — ₹{total.toLocaleString()}
                    </DialogTitle>
                    <DialogDescription>Billing record details and verification.</DialogDescription>
                  </DialogHeader>

                  <div className="flex flex-col gap-4">
                    {/* Timeline */}
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Billing Status Timeline</p>
                      <TimelineStep done label="Invoice Generated" sub={`Due date ${payment.due_date}`} connector={payment.status === "paid"} />
                      <TimelineStep
                        done={payment.status === "submitted" || payment.status === "paid"}
                        label="Payment Submitted"
                        sub={payment.status === "paid" && payment.paid_at ? `Received ${formatDateFriendly(payment.paid_at)}` : "Payment under review"}
                        connector={!!payment.verified_at}
                      />
                      <TimelineStep
                        done={!!payment.verified_at}
                        label="Audit & Verified"
                        sub={payment.verified_at ? "Ledger record verified" : "Awaiting verification"}
                        last
                      />
                    </div>

                    {/* Breakdown */}
                    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/30 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fee Breakdown</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Base Rent</span>
                        <span className="font-bold text-foreground">₹{(payment.rent_amount || 0).toLocaleString()}</span>
                      </div>
                      {(payment.extra_charges ?? 0) !== 0 && (() => {
                        const ec = payment.extra_charges ?? 0
                        const isDiscount = ec < 0
                        return (
                          <div className="flex items-center justify-between text-sm">
                            <span className={cn("flex items-center gap-1", isDiscount ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                              <AlertTriangle className="h-3 w-3" /> {isDiscount ? "Discount" : "Extra Charges"}
                            </span>
                            <span className={cn("font-bold", isDiscount ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                              {isDiscount ? "− " : "+ "}₹{Math.abs(ec).toLocaleString()}
                            </span>
                          </div>
                        )
                      })()}
                      <div className="flex items-center justify-between border-t border-border pt-2.5">
                        <span className="text-sm font-bold text-foreground">Total Rent Amount</span>
                        <span className="text-sm font-black text-foreground">₹{total.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Screenshot proof */}
                    {payment.screenshot_path && (
                      <div className="flex flex-col gap-3 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400">Payment Verification Proof</p>
                        {loadingScreenshot ? (
                          <div className="flex h-44 items-center justify-center rounded-lg bg-muted/40">
                            <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
                          </div>
                        ) : signedScreenshotUrl ? (
                          <button
                            type="button"
                            onClick={() => setViewerImageUrl(signedScreenshotUrl)}
                            className="relative h-44 overflow-hidden rounded-lg border border-purple-500/20 bg-black"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={signedScreenshotUrl} alt="Payment proof" className="h-full w-full object-cover opacity-90" />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <Maximize2 className="h-5 w-5 text-white" />
                            </span>
                          </button>
                        ) : (
                          <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-lg bg-muted/40">
                            <Info className="h-5 w-5 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Could not retrieve verification media</p>
                          </div>
                        )}
                        {payment.utr_number && (
                          <div className="flex items-center justify-between border-t border-purple-500/10 pt-3">
                            <span className="text-[11px] font-bold text-muted-foreground">UTR / Transaction Code</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(payment.utr_number || "", "UTR")}
                              className="flex items-center gap-1.5 rounded-md bg-purple-500/10 px-2.5 py-1 text-xs font-bold text-purple-600 dark:text-purple-400"
                            >
                              <span className="font-mono">{payment.utr_number}</span>
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center justify-between border-t border-purple-500/10 pt-3">
                          <span className="text-[11px] font-bold text-muted-foreground">Verification Code (Txn Ref)</span>
                          <span className="font-mono text-xs font-bold text-purple-600 dark:text-purple-400">{payment.payment_code || "—"}</span>
                        </div>
                      </div>
                    )}

                    {/* Rejection notes */}
                    {rejectingMode && (
                      <div className="flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-destructive">Rejection Feedback Notes</p>
                        <Textarea
                          value={rejectNotes}
                          onChange={(e) => setRejectNotes(e.target.value)}
                          placeholder="E.g. Screenshot blurry or UTR is incorrect…"
                          className="min-h-16 resize-none border-destructive/20"
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setRejectingMode(false)}>
                            Cancel
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => void handleRejectPayment(payment)}>
                            Confirm Rejection
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Basic details */}
                    <div className="flex flex-col gap-3">
                      <DetailMiniRow label="Occupant Name" value={selectedTenant?.name || "Occupant"} />
                      <DetailMiniRow label="Room Reference" value={`Room ${selectedTenant?.rooms_table?.room_number || "—"}`} />
                      <DetailMiniRow label="Billing Month" value={`${monthStr} ${payment.year}`} />
                      <DetailMiniRow label="Due Date" value={payment.due_date || "—"} />
                      {payment.status === "paid" && (
                        <>
                          <DetailMiniRow label="Paid At" value={payment.paid_at ? formatDateFriendly(payment.paid_at) : "—"} />
                          <DetailMiniRow label="Payment Method" value={payment.payment_method || "—"} />
                        </>
                      )}
                      {payment.verification_notes && (
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rejection Feedback Notes</p>
                          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-4 text-foreground">{payment.verification_notes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-destructive/20 text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (payment.id != null) {
                          setDeletePaymentId(payment.id)
                          setDeletePaymentConfirmOpen(true)
                        }
                      }}
                      aria-label="Delete payment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {(payment.status === "pending" || payment.status === "late") && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                        disabled={isSendingWhatsAppPayment}
                        onClick={handleWhatsAppReminder}
                        aria-label="Send WhatsApp reminder"
                      >
                        {isSendingWhatsAppPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                      </Button>
                    )}
                    {payment.status === "submitted" && !rejectingMode ? (
                      <>
                        <Button variant="outline" className="flex-1 border-destructive/20 text-destructive hover:bg-destructive/10" onClick={() => setRejectingMode(true)}>
                          Reject
                        </Button>
                        <Button
                          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => void handleApprovePayment(payment)}
                        >
                          Approve
                        </Button>
                      </>
                    ) : payment.status !== "paid" ? (
                      <Button
                        className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => {
                          if (payment.id != null) {
                            setMarkingPaidPaymentId(payment.id)
                            setSelectedPaymentMethod("UPI")
                            setMarkPaidOpen(true)
                          }
                        }}
                      >
                        Mark as Paid
                      </Button>
                    ) : (
                      <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        <Check className="h-4 w-4" strokeWidth={3} />
                        Rent Fully Settled
                      </div>
                    )}
                  </div>
                </>
              )
            })()}
        </DialogContent>
      </Dialog>

      {/* ===================== Mark Paid Dialog ===================== */}
      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>Select the payment method used by the occupant to clear this bill.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="mark-paid-method">Payment Method</Label>
            <Select value={selectedPaymentMethod} onValueChange={(v) => setSelectedPaymentMethod(v as "UPI" | "Cash")}>
              <SelectTrigger id="mark-paid-method" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setMarkPaidOpen(false)}>
              Cancel
            </Button>
            <Button
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
              onClick={() => {
                if (markingPaidPaymentId != null) void confirmMarkPaid(markingPaidPaymentId, selectedPaymentMethod)
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Manual Identity Upload Dialog ===================== */}
      <Dialog open={manualUploadOpen} onOpenChange={setManualUploadOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Identity</DialogTitle>
            <DialogDescription>{selectedTenant?.name || "Occupant"} — manual upload, no verification.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div>
              <Label>Identity Type</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {([
                  { type: "Aadhaar" as const, label: "Aadhaar", desc: "Front & back", icon: ShieldCheck },
                  { type: "PAN" as const, label: "PAN", desc: "Front only", icon: CreditCard },
                ]).map((opt) => {
                  const Icon = opt.icon
                  const active = manualUploadType === opt.type
                  return (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => {
                        setManualUploadType(opt.type)
                        setManualBack(null)
                        setManualBackPreview(null)
                      }}
                      className={cn(
                        "rounded-xl border p-4 text-left",
                        active ? "border-primary bg-primary/10" : "border-border bg-card",
                      )}
                    >
                      <span className={cn("mb-2 flex h-9 w-9 items-center justify-center rounded-lg", active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <p className={cn("text-sm font-bold", active ? "text-primary" : "text-foreground")}>{opt.label}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{opt.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {manualUploadType !== "" && (
              <div className="flex flex-col gap-3">
                <ImageUploadSlot
                  label="Front Image"
                  preview={manualFrontPreview}
                  onSelect={(file) => {
                    setManualFront(file)
                    setManualFrontPreview(file ? URL.createObjectURL(file) : null)
                  }}
                />
                {manualUploadType === "Aadhaar" && (
                  <ImageUploadSlot
                    label="Back Image"
                    preview={manualBackPreview}
                    onSelect={(file) => {
                      setManualBack(file)
                      setManualBackPreview(file ? URL.createObjectURL(file) : null)
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setManualUploadOpen(false)} disabled={isManualUploading}>
              Cancel
            </Button>
            <Button
              className="w-full gap-2 sm:w-auto"
              onClick={submitManualUpload}
              disabled={isManualUploading || manualUploadType === ""}
            >
              {isManualUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" strokeWidth={3} />
                  Save Documents
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Identity Document Viewer (front/back) ===================== */}
      <Dialog open={idViewerOpen} onOpenChange={setIdViewerOpen}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Identity document — {idViewerSide}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="flex min-h-[40dvh] w-full items-center justify-center">
              {idViewerLoading ? (
                <Loader2 className="h-7 w-7 animate-spin text-white" />
              ) : (() => {
                const currentUrl = idViewerSide === "front" ? idFrontUrl : idBackUrl
                if (!currentUrl) {
                  return (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Info className="h-6 w-6 text-white/70" />
                      <p className="text-sm font-bold text-white">Image unavailable</p>
                      <p className="text-xs text-white/60">This {idViewerSide} document could not be loaded.</p>
                    </div>
                  )
                }
                // eslint-disable-next-line @next/next/no-img-element
                return <img src={currentUrl} alt={`Identity ${idViewerSide}`} className="max-h-[80dvh] w-full rounded-lg object-contain" />
              })()}
            </div>
            {selectedTenant && viewerHasSlideControl(selectedTenant.id_front_path, selectedTenant.id_back_path) && (
              <div className="flex rounded-full border border-white/10 bg-white/10 p-1">
                {(["front", "back"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setIdViewerSide(side)}
                    className={cn(
                      "rounded-full px-6 py-2 text-xs font-bold capitalize",
                      idViewerSide === side ? "bg-white text-black" : "text-white",
                    )}
                  >
                    {side}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===================== Fullscreen Image Viewer ===================== */}
      <Dialog open={viewerImageUrl != null} onOpenChange={(open) => !open && setViewerImageUrl(null)}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Image preview</DialogTitle>
          </DialogHeader>
          {viewerImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewerImageUrl} alt="Preview" className="max-h-[85dvh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>

      {/* ===================== WhatsApp Invite & Deposit Dialog ===================== */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open)
          if (!open) setJustAddedTenant(null)
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>WhatsApp Invite &amp; Deposit</DialogTitle>
            <DialogDescription>
              Occupant <span className="font-bold text-foreground">{justAddedTenant?.name}</span> has been added.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="invite-message">Invite Message Preview</Label>
              <Textarea
                id="invite-message"
                className="mt-1 min-h-36 resize-none"
                value={customInviteMessage}
                onChange={(e) => setCustomInviteMessage(e.target.value)}
              />
            </div>

            {justAddedTenant?.deposit_amount && justAddedTenant.deposit_amount > 0 ? (
              <label className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <Checkbox
                  checked={createDepositPayment}
                  onCheckedChange={(c) => {
                    const next = !!c
                    setCreateDepositPayment(next)
                    if (justAddedTenant) setCustomInviteMessage(buildWelcomeMessage(justAddedTenant, next, invitePayUrl))
                  }}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-foreground">Create Deposit Invoice</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Adds a pending deposit fee of ₹{justAddedTenant.deposit_amount} and includes the payment link in the message.
                  </span>
                </span>
              </label>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
                <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-muted-foreground">Deposit Record Disabled</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">No security deposit amount was specified for this occupant.</span>
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full gap-2" onClick={handleSendInvite} disabled={isSendingInvite}>
              {isSendingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Send via WhatsApp
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setInviteOpen(false)
                setJustAddedTenant(null)
              }}
            >
              Skip &amp; Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Confirmation dialogs ===================== */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Occupant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this occupant from the directory? Payment records are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTenantToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteTenant}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={ignoreConfirmOpen} onOpenChange={setIgnoreConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ignore Identity</AlertDialogTitle>
            <AlertDialogDescription>
              Stop sending daily identity verification reminders to this occupant? You can still view any documents they have already submitted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmIgnoreIdentity}>Ignore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteIdentityConfirmOpen} onOpenChange={setDeleteIdentityConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Identity Documents</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the stored identity documents and resets verification. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDeleteIdentityConfirmOpen(false)
                if (selectedTenant) void handleDeleteIdentityDocs(selectedTenant)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletePaymentConfirmOpen} onOpenChange={setDeletePaymentConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Billing Record</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the billing record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletePaymentId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeletePayment}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )

  // Hoisted helper: renders the identity verification section in the Details tab.
  function renderIdentitySection() {
    if (!selectedTenant) return null
    const t = selectedTenant
    const state: IdentityState = {
      identity_request_flag: !!t.identity_request_flag,
      verification_status: (t.verification_status || "Not_Started") as VerificationStatus,
      ignore_identity_flag: !!t.ignore_identity_flag,
    }
    const presentation = popupStatusPresentation(state)
    const displayCode = selectDisplayCode({ aadhaar_number: t.aadhaar_number, pan_code: t.pan_code })
    const hasFrontImage = !!t.id_front_path?.trim()
    const hasBackImage = !!t.id_back_path?.trim()
    const hasStoredImage = hasFrontImage || hasBackImage
    const showChooser =
      identityResetTenantId === t.id || (presentation === "none" && !displayCode && !hasStoredImage)

    const progressMeta =
      presentation === "in_progress"
        ? { text: "Identity verification document gathering in progress", cls: "text-amber-600 dark:text-amber-400", icon: <Clock className="h-3.5 w-3.5" /> }
        : presentation === "verified"
          ? { text: "Identity verified", cls: "text-emerald-600 dark:text-emerald-400", icon: <ShieldCheck className="h-3.5 w-3.5" /> }
          : presentation === "reminders_stopped"
            ? { text: "Identity reminders stopped", cls: "text-muted-foreground", icon: <Info className="h-3.5 w-3.5" /> }
            : null

    return (
      <div className="border-t border-border/60 py-3">
        <p className="mb-2.5 text-sm font-semibold text-muted-foreground">Identity Verification</p>

        {progressMeta && (
          <div className={cn("mb-3 flex items-center gap-2 text-xs font-bold", progressMeta.cls)}>
            {progressMeta.icon}
            <span>{progressMeta.text}</span>
          </div>
        )}

        {displayCode && (
          <div className="rounded-xl border border-border bg-muted/30 p-3.5">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{displayCode.type} Number</p>
                <p className="text-sm font-bold tracking-wide text-foreground">{maskIdentityCode(displayCode.value)}</p>
              </div>
              <button
                type="button"
                onClick={() => setRevealIdentityCode((p) => !p)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                aria-label={revealIdentityCode ? "Hide identity number" : "Reveal identity number"}
              >
                {revealIdentityCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {revealIdentityCode && (
              <div className="mt-2.5 border-t border-border/60 pt-2.5">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Full Number</p>
                <p className="text-sm font-extrabold tracking-wide text-primary">{displayCode.value}</p>
              </div>
            )}
          </div>
        )}

        {showChooser ? (
          <div className="mt-3 flex flex-col gap-2.5">
            <p className="text-xs text-muted-foreground">
              {identityResetTenantId === t.id
                ? "Documents deleted. Choose how to collect identity again:"
                : "Collect this tenant's identity:"}
            </p>
            {chatbotEnabled && (
              <Button
                variant="outline"
                className="justify-center gap-2 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                disabled={isRequestingIdentityAgain}
                onClick={() => void handleRequestIdentityAgain(t)}
              >
                {isRequestingIdentityAgain ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                Request identity (daily)
              </Button>
            )}
            <Button variant="outline" className="justify-center gap-2" disabled={isManualUploading} onClick={() => openManualUploadModal(t)}>
              {isManualUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload manually
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {presentation === "in_progress" && (
              <Button
                variant="outline"
                className="justify-center gap-2 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                disabled={isManualUploading}
                onClick={() => openManualUploadModal(t)}
              >
                {isManualUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload documents manually
              </Button>
            )}
            {shouldShowIgnoreButton(state) && (
              <Button variant="outline" className="justify-center gap-2" disabled={isIgnoringIdentity} onClick={() => setIgnoreConfirmOpen(true)}>
                {isIgnoringIdentity ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Ignore identity
              </Button>
            )}
            {hasStoredImage && (
              <Button
                variant="outline"
                className="justify-center gap-2 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                onClick={() => void openIdentityViewer(t)}
              >
                <Maximize2 className="h-4 w-4" />
                Show documents
              </Button>
            )}
            {hasStoredImage && (
              <Button
                variant="outline"
                className="justify-center gap-2 border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                disabled={isDeletingIdentity}
                onClick={() => setDeleteIdentityConfirmOpen(true)}
              >
                {isDeletingIdentity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete documents
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }
}

// ---------------------------------------------------------------------------
// Small presentational helpers (module scope)
// ---------------------------------------------------------------------------

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-3">
      <div className="flex items-center gap-3 text-muted-foreground">
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  )
}

function DetailMiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/30 py-1.5">
      <span className="text-xs font-bold text-muted-foreground">{label}</span>
      <span className="text-xs font-bold capitalize text-foreground">{value}</span>
    </div>
  )
}

function TimelineStep({
  done,
  label,
  sub,
  connector,
  last,
}: {
  done: boolean
  label: string
  sub: string
  connector?: boolean
  last?: boolean
}) {
  return (
    <div className="flex items-start">
      <div className="mr-3 flex flex-col items-center">
        <span
          className={cn(
            "z-10 flex h-5 w-5 items-center justify-center rounded-full",
            done ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
          )}
        >
          {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <Clock className="h-2.5 w-2.5" />}
        </span>
        {!last && <span className={cn("h-8 w-0.5", connector ? "bg-emerald-500" : "bg-muted")} />}
      </div>
      <div>
        <p className="text-xs font-bold text-foreground">{label}</p>
        <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}

function ImageUploadSlot({
  label,
  preview,
  onSelect,
}: {
  label: string
  preview: string | null
  onSelect: (file: File | null) => void
}) {
  return (
    <div>
      <Label>{label}</Label>
      <label className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-border bg-muted/30 p-0 text-center hover:bg-muted/50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="h-40 w-full object-cover" />
        ) : (
          <span className="flex h-28 w-full flex-col items-center justify-center gap-1.5">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Tap to choose {label.toLowerCase()}</span>
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        />
      </label>
      {preview && <p className="mt-1.5 text-center text-[11px] font-bold text-primary">Change {label.toLowerCase()}</p>}
    </div>
  )
}

export default function TenantsPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout title="Tenants">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DashboardLayout>
      }
    >
      <TenantsPageInner />
    </Suspense>
  )
}
