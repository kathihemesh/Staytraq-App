import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Platform } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import { FlashList } from "@shopify/flash-list"
import { Check, X, Search, Bell, AlertTriangle, Clock, CalendarDays, ShieldAlert, CheckCircle2, MessageSquare, Send, RefreshCw, Smartphone } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated"
import useTheme from "@/hooks/use-theme"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"

type ReminderStatus = "overdue" | "due_today" | "due_week" | "upcoming" | "paid"

interface ReminderTenant {
  id: number
  name: string
  phone: string
  room: string
  roomId: number
  floor: number
  amount: number
  dueDate: Date
  status: ReminderStatus
}

const messageTemplates = {
  friendly: "Hi {name}, this is a friendly reminder that your rent of ₹{amount} for {room} is due on {dueDate}. Please make the payment at your earliest convenience. Thank you!",
  firm: "Dear {name}, your rent payment of ₹{amount} for {room} is now due. Please clear the payment immediately to avoid any inconvenience. Contact us if you have any questions.",
  final: "URGENT: {name}, your rent of ₹{amount} for {room} is overdue. Immediate payment is required. Please settle this at once to avoid further action.",
  custom: "",
}

const statusConfig = {
  overdue: {
    label: "Overdue",
    colors: "bg-destructive/10 text-destructive border-destructive/20",
    bgMuted: "bg-destructive/5",
    colorHex: "#ef4444"
  },
  due_today: {
    label: "Due Today",
    colors: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    bgMuted: "bg-orange-500/5",
    colorHex: "#ea580c"
  },
  due_week: {
    label: "This Week",
    colors: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    bgMuted: "bg-amber-500/5",
    colorHex: "#d97706"
  },
  upcoming: {
    label: "Upcoming",
    colors: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    bgMuted: "bg-blue-500/5",
    colorHex: "#2563eb"
  },
  paid: {
    label: "Paid",
    colors: "bg-success/10 text-success border-success/20",
    bgMuted: "bg-success/5",
    colorHex: "#10b981"
  },
}

export default function RemindersScreen() {
  const { user, session } = useAuth()
  const { isDark } = useTheme()
  const router = useRouter()

  const searchInput = useKeyboardAwareInput()
  const customMessageInput = useKeyboardAwareInput()

  const [tenants, setTenants] = useState<ReminderTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState<ReminderStatus | "all">("all")
  
  // Selection
  const [selectedTenants, setSelectedTenants] = useState<number[]>([])
  
  // Composer drawer/panel state
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [messageType, setMessageType] = useState<"friendly" | "firm" | "final" | "custom">("friendly")
  const [customMessage, setCustomMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [sendResult, setSendResult] = useState<{
    type: "success" | "partial" | "error"
    title: string
    message: string
  } | null>(null)

  const textareaRef = useRef<TextInput>(null)
  const sendResultTimeoutRef = useRef<any>(null)

  // Fetch active tenants and payments
  const fetchReminderData = useCallback(async (silent = false) => {
    if (!user?.id) return
    try {
      if (!silent) {
        if (tenants.length === 0) setLoading(true)
        else setIsRefreshing(true)
      }
      setError(null)

      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()

      // 1. Fetch active tenants with room details
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

      // 2. Fetch payments to check current month collections
      const { data: paymentsData, error: paymentsErr } = await supabase
        .from("payments")
        .select("tenant_id, status, payment_date, created_at, billing_month")
        .eq("owner_id", user.id)

      if (paymentsErr) throw paymentsErr

      // Match paid payments for the current month
      const monthsList = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
      const currentMonthName = monthsList[currentMonth]

      const paidTenantIds = new Set<number>()
      paymentsData?.forEach((p) => {
        if (p.status === "paid" && p.tenant_id) {
          const dateStr = p.payment_date || p.created_at
          const pDate = dateStr ? new Date(dateStr) : null
          const matchesDate = pDate && pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear
          const matchesBillingMonth = p.billing_month && (
            p.billing_month.includes(currentMonthName) && p.billing_month.includes(String(currentYear))
          )
          if (matchesDate || matchesBillingMonth) {
            paidTenantIds.add(p.tenant_id)
          }
        }
      })

      const result: ReminderTenant[] = []

      for (const t of tenantsData || []) {
        const room = (t as any).rooms_table
        const rentDueDay = t.rent_due_day ?? 1
        const dueDate = new Date(currentYear, currentMonth, rentDueDay)
        const isPaid = paidTenantIds.has(t.id)

        // Compute status based on due date and payment state
        let status: ReminderStatus = "paid"
        if (isPaid) {
          status = "paid"
        } else {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
          const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

          if (diffDays < 0) status = "overdue"
          else if (diffDays === 0) status = "due_today"
          else if (diffDays <= 7) status = "due_week"
          else if (diffDays <= 10) status = "upcoming"
          else status = "paid" // shown as paid/no action if it's > 10 days away
        }

        result.push({
          id: t.id,
          name: t.name || "Unknown Occupant",
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
      console.error("Error fetching reminder tenants:", err)
      setError(err?.message || "Failed to fetch rent reminder information.")
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [user?.id, tenants.length])

  useEffect(() => {
    void fetchReminderData()
  }, [fetchReminderData])

  useEffect(() => {
    return () => {
      if (sendResultTimeoutRef.current) {
        clearTimeout(sendResultTimeoutRef.current)
      }
    }
  }, [])

  const onRefresh = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void fetchReminderData()
  }, [fetchReminderData])

  // Stats calculation
  const stats = useMemo(() => {
    return {
      overdue: tenants.filter((t) => t.status === "overdue").length,
      due_week: tenants.filter((t) => t.status === "due_today" || t.status === "due_week").length,
      paid: tenants.filter((t) => t.status === "paid").length,
    }
  }, [tenants])

  // Filter and Search list
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.room.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesFilter = activeFilter === "all" || t.status === activeFilter
      return matchesSearch && matchesFilter
    })
  }, [tenants, searchTerm, activeFilter])

  // Selection handlers
  const toggleTenant = useCallback((id: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSelectedTenants((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }, [])

  const toggleSelectAll = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const selectables = filteredTenants.filter(t => t.status !== "paid")
    if (selectedTenants.length === selectables.length) {
      setSelectedTenants([])
    } else {
      setSelectedTenants(selectables.map((t) => t.id))
    }
  }, [selectedTenants, filteredTenants])

  // Interpolated message preview helper
  const getInterpolatedMessage = useCallback((tenant: ReminderTenant) => {
    if (!tenant) return ""
    const template = messageType === "custom" ? customMessage : messageTemplates[messageType]
    return template
      .replace("{name}", tenant.name.split(" ")[0])
      .replace("{amount}", tenant.amount.toLocaleString())
      .replace("{room}", `Room ${tenant.room}`)
      .replace("{dueDate}", tenant.dueDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" }))
  }, [messageType, customMessage])

  // Send request via Next.js REST API
  const handleSendReminders = async () => {
    if (selectedTenants.length === 0) return
    setIsSending(true)
    setSendResult(null)
    
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      const targetTenants = tenants.filter(t => selectedTenants.includes(t.id))
      const interpolatedMessage = getInterpolatedMessage(targetTenants[0])

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000"
      
      const response = await fetch(`${apiUrl}/api/send-reminder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          tenantIds: selectedTenants,
          message: interpolatedMessage,
        }),
      })

      const responseData = await response.json()

      if (!response.ok) {
        throw new Error(responseData.error || "Failed to trigger server reminders")
      }

      const totalSent = responseData.sent || 0
      const totalFailed = responseData.failed || 0

      if (totalFailed === 0) {
        setSendResult({
          type: "success",
          title: "Reminders Sent Successfully!",
          message: `Successfully processed and sent ${totalSent} reminders via server Twilio channel.`,
        })
        setSelectedTenants([])
        setIsComposerOpen(false)
      } else if (totalSent > 0) {
        setSendResult({
          type: "partial",
          title: "Partial Reminder Success",
          message: `Sent ${totalSent} reminders, but ${totalFailed} collections failed. Please check client mobile numbers.`,
        })
        setIsComposerOpen(false)
      } else {
        throw new Error("All notification deliveries failed. Please check your server Twilio/WhatsApp balance.")
      }

      // Auto clear alert
      if (sendResultTimeoutRef.current) {
        clearTimeout(sendResultTimeoutRef.current)
      }
      sendResultTimeoutRef.current = setTimeout(() => {
        setSendResult(null)
      }, 6000)

      void fetchReminderData(true)
    } catch (err: any) {
      console.error(err)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setSendResult({
        type: "error",
        title: "Reminder Dispatch Failed",
        message: err.message || "An unexpected error occurred during dispatch.",
      })
    } finally {
      setIsSending(false)
    }
  }

  const selectedTenantsData = useMemo(() => {
    return tenants.filter((t) => selectedTenants.includes(t.id))
  }, [tenants, selectedTenants])

  const previewTarget = selectedTenantsData[0] || filteredTenants.find(t => t.status !== "paid") || tenants[0]

  if (loading && tenants.length === 0) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark items-center justify-center">
        <ActivityIndicator size="large" color={isDark ? "#0091ff" : "#0071df"} />
        <Text className="text-sm text-muted dark:text-muted-dark mt-3 font-semibold">Scanning unpaid rentals...</Text>
      </View>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="px-6 pt-4 pb-4 border-b border-border/40 dark:border-border-dark/40 flex-row justify-between items-center bg-card dark:bg-card-dark">
        <View className="flex-row items-center">
          <TouchableOpacity 
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              router.back()
            }}
            className="h-9 w-9 border border-border dark:border-border-dark bg-background dark:bg-background-dark rounded-xl items-center justify-center mr-3"
          >
            <X size={18} color="#9ca3af" />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-black text-foreground dark:text-foreground-dark tracking-tight">
              Rent Reminders
            </Text>
            <Text className="text-xs text-muted dark:text-muted-dark font-medium mt-0.5">
              Send rent notifications via server Twilio
            </Text>
          </View>
        </View>
        <TouchableOpacity 
          onPress={onRefresh}
          className="h-9 w-9 border border-border dark:border-border-dark rounded-xl items-center justify-center bg-background dark:bg-background-dark"
        >
          <RefreshCw size={15} color={isDark ? "#0091ff" : "#0071df"} />
        </TouchableOpacity>
      </View>

      {/* Main content split */}
      <KeyboardAwareScrollView 
        className="flex-1"
        showsVerticalScrollIndicator={false}
      >
          {/* Send status overlay alert */}
          {sendResult && (
            <Animated.View 
              entering={FadeIn}
              exiting={FadeOut}
              className={`mx-6 mt-4 p-4 rounded-2xl border flex-row items-start ${
                sendResult.type === "success"
                  ? "bg-success/10 border-success/20 text-success"
                  : sendResult.type === "partial"
                    ? "bg-warning/10 border-warning/20 text-warning"
                    : "bg-destructive/10 border-destructive/20 text-destructive"
              }`}
            >
              <View className="mr-3 mt-0.5">
                {sendResult.type === "success" ? (
                  <CheckCircle2 size={20} color="#10b981" />
                ) : sendResult.type === "partial" ? (
                  <Clock size={20} color="#ea580c" />
                ) : (
                  <ShieldAlert size={20} color="#ef4444" />
                )}
              </View>
              <View className="flex-1">
                <Text className={`font-bold text-sm ${
                  sendResult.type === "success" ? "text-success" : sendResult.type === "partial" ? "text-amber-700" : "text-destructive"
                }`}>
                  {sendResult.title}
                </Text>
                <Text className="text-xs text-muted dark:text-muted-dark mt-1 leading-4">
                  {sendResult.message}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSendResult(null)} className="ml-2">
                <X size={16} color="#9ca3af" />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Quick status filter counts */}
          <View className="px-6 pt-4 pb-3 flex-row flex-wrap gap-2">
            {[
              { id: "all", label: "All Tenants", count: tenants.length, activeStyle: "bg-primary border-primary text-white", inactiveStyle: "bg-card dark:bg-card-dark text-muted border-border dark:border-border-dark" },
              { id: "overdue", label: "Overdue", count: stats.overdue, activeStyle: "bg-destructive border-destructive text-white", inactiveStyle: "bg-card dark:bg-card-dark text-destructive border-destructive/20" },
              { id: "due_week", label: "Due Soon", count: stats.due_week, activeStyle: "bg-amber-500 border-amber-500 text-white", inactiveStyle: "bg-card dark:bg-card-dark text-amber-600 border-amber-500/20" },
              { id: "paid", label: "Paid", count: stats.paid, activeStyle: "bg-success border-success text-white", inactiveStyle: "bg-card dark:bg-card-dark text-success border-success/20" }
            ].map((pill) => {
              const isSelected = activeFilter === pill.id || (pill.id === "due_week" && activeFilter === "due_today")
              return (
                <TouchableOpacity
                  key={`${pill.id}-${isSelected}`}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setActiveFilter(pill.id as any)
                  }}
                  className={`px-4 py-2 rounded-full border text-xs font-semibold flex-row items-center ${
                    isSelected ? pill.activeStyle : pill.inactiveStyle
                  }`}
                >
                  <Text className={`font-bold mr-1.5 ${isSelected ? "text-white" : ""}`}>
                    {pill.label}
                  </Text>
                  <View className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isSelected ? "bg-white/20 text-white" : "bg-muted/10 text-muted"
                  }`}>
                    <Text className={`text-[10px] font-black ${isSelected ? "text-white" : ""}`}>{pill.count}</Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Search inputs */}
          <View className="px-6 mb-4">
            <View className="flex-row items-center border border-border dark:border-border-dark bg-card dark:bg-card-dark rounded-2xl px-4 py-2 shadow-sm">
              <Search size={16} color="#9ca3af" className="mr-2" />
              <TextInput
                ref={searchInput.ref}
                onFocus={searchInput.onFocus}
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder="Search occupants, rooms..."
                placeholderTextColor="#9ca3af"
                className="flex-1 text-sm text-foreground dark:text-foreground-dark py-1"
              />
              {searchTerm.length > 0 && (
                <TouchableOpacity onPress={() => setSearchTerm("")}>
                  <X size={16} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Checklist header */}
          <View className="px-6 py-2.5 flex-row justify-between items-center border-b border-border/20">
            <Text className="text-xs font-black uppercase text-muted tracking-wider">
              Tenant List ({filteredTenants.length} displayed)
            </Text>
            {filteredTenants.some(t => t.status !== "paid") && (
              <TouchableOpacity onPress={toggleSelectAll} className="bg-primary/5 border border-primary/20 px-3 py-1 rounded-lg">
                <Text className="text-xs font-bold text-primary">
                  {selectedTenants.length === filteredTenants.filter(t => t.status !== "paid").length ? "Deselect All" : "Select Unpaid"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* List content */}
          {filteredTenants.length === 0 ? (
            <View className="py-12 items-center justify-center">
              <CheckCircle2 size={40} color="#10b981" />
              <Text className="text-sm font-semibold text-muted dark:text-muted-dark mt-3 text-center">
                All tenants match current filter!
              </Text>
            </View>
          ) : (
            <View className="px-6 py-2 min-h-[300px]">
              <FlashList
                data={filteredTenants}
                scrollEnabled={false}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => {
                  const isSelected = selectedTenants.includes(item.id)
                  const isPaid = item.status === "paid"
                  const conf = statusConfig[item.status]
                  
                  return (
                    <TouchableOpacity
                      onPress={() => !isPaid && toggleTenant(item.id)}
                      disabled={isPaid}
                      className={`flex-row items-center border p-3 rounded-2xl mb-2.5 ${
                        isSelected 
                          ? `border-primary bg-primary/5`
                          : isPaid 
                            ? "border-border/30 bg-card/40 opacity-60" 
                            : "border-border dark:border-border-dark bg-card dark:bg-card-dark"
                      }`}
                    >
                      {/* Selection Box */}
                      <View className="mr-3">
                        <View className={`h-6 w-6 rounded-lg border items-center justify-center ${
                          isSelected 
                            ? "bg-primary border-primary" 
                            : isPaid 
                              ? "bg-border/20 border-border/30" 
                              : "border-border dark:border-border-dark bg-background dark:bg-background-dark"
                        }`}>
                          {isSelected && <Check size={14} color="#ffffff" strokeWidth={3} />}
                        </View>
                      </View>

                      {/* Details */}
                      <View className="flex-1 pr-2">
                        <View className="flex-row items-center">
                          <Text className="text-sm font-bold text-foreground dark:text-foreground-dark mr-2" numberOfLines={1}>
                            {item.name}
                          </Text>
                          <View className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${conf.colors}`}>
                            <Text className={`text-[8px] font-black uppercase`} style={{ color: conf.colorHex }}>{conf.label}</Text>
                          </View>
                        </View>
                        <Text className="text-xs text-muted mt-1">
                          Room {item.room} · Due {item.dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </Text>
                      </View>

                      {/* Right Rent */}
                      <View className="items-end">
                        <Text className="text-sm font-extrabold text-foreground dark:text-foreground-dark">
                          ₹{item.amount.toLocaleString()}
                        </Text>
                        <Text className="text-[10px] text-muted font-medium mt-0.5">Rent Due</Text>
                      </View>
                    </TouchableOpacity>
                  )
                }}
              />
            </View>
          )}
        </KeyboardAwareScrollView>

      {/* Floating Bottom Compose Selector Bar */}
      {selectedTenants.length > 0 && !isComposerOpen && (
        <Animated.View 
          entering={SlideInDown}
          exiting={SlideOutDown}
          className="absolute bottom-0 left-0 right-0 p-4 bg-card dark:bg-card-dark border-t border-border dark:border-border-dark rounded-t-3xl shadow-xl flex-row items-center justify-between z-20"
        >
          <View>
            <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
              {selectedTenants.length} Tenant{selectedTenants.length > 1 ? "s" : ""} selected
            </Text>
            <TouchableOpacity onPress={() => setSelectedTenants([])} className="mt-0.5">
              <Text className="text-xs text-primary font-semibold">Clear selection</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              setIsComposerOpen(true)
            }}
            className="bg-primary flex-row items-center px-5 py-3 rounded-xl shadow-lg shadow-primary/20"
          >
            <MessageSquare size={16} color="#ffffff" className="mr-2" />
            <Text className="text-white font-bold text-sm">Compose Reminder</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {isComposerOpen && (
        <View className="absolute inset-0 z-30">
          <Animated.View 
            entering={SlideInDown}
            exiting={SlideOutDown}
            className="flex-1 bg-black/50 justify-end"
          >
            {/* Modal dismissal backdrop tap */}
            <TouchableOpacity className="absolute inset-0" onPress={() => setIsComposerOpen(false)} />
            
            <View className="bg-card dark:bg-card-dark rounded-t-[32px] p-6 max-h-[85%] border-t border-border dark:border-border-dark flex-1">
              <View className="flex-row justify-between items-center mb-5">
                <View>
                  <Text className="text-lg font-black text-foreground dark:text-foreground-dark">Compose Message</Text>
                  <Text className="text-xs text-muted mt-0.5">Recipients: {selectedTenants.length} tenants</Text>
                </View>
                <TouchableOpacity 
                  onPress={() => setIsComposerOpen(false)}
                  className="h-8 w-8 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
                >
                  <X size={16} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 30 }}
              >
              {/* Template pills */}
              <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Message Tone</Text>
              <View className="flex-row space-x-2 mb-4 flex-wrap gap-y-2">
                {[
                  { id: "friendly", label: "Friendly" },
                  { id: "firm", label: "Firm" },
                  { id: "final", label: "Final" },
                  { id: "custom", label: "Custom" }
                ].map((tone) => (
                  <TouchableOpacity
                    key={`${tone.id}-${messageType === tone.id}`}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      setMessageType(tone.id as any)
                    }}
                    className={`px-4 py-2 rounded-xl border ${
                      messageType === tone.id
                        ? "bg-primary border-primary text-white"
                        : "bg-background dark:bg-background-dark border-border dark:border-border-dark text-muted"
                    }`}
                  >
                    <Text className={`text-xs font-bold ${messageType === tone.id ? "text-white" : "text-muted"}`}>
                      {tone.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Custom input */}
              {messageType === "custom" && (
                <Animated.View entering={FadeIn} className="mb-4">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Variables tags available:</Text>
                  <View className="flex-row flex-wrap gap-1.5 mb-2.5">
                    {["{name}", "{amount}", "{room}", "{dueDate}"].map((token) => (
                      <TouchableOpacity
                        key={token}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          setCustomMessage(prev => prev + " " + token)
                        }}
                        className="bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg"
                      >
                        <Text className="text-[10px] font-bold font-mono text-primary">{token}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    ref={customMessageInput.ref}
                    onFocus={customMessageInput.onFocus}
                    value={customMessage}
                    onChangeText={setCustomMessage}
                    multiline
                    placeholder="Type custom notification body... (e.g. Dear {name}, please clear rent ₹{amount} for {room})"
                    placeholderTextColor="#9ca3af"
                    className="border border-border dark:border-border-dark rounded-2xl px-3.5 py-3 text-sm text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark h-24 text-start"
                  />
                </Animated.View>
              )}

              {/* WhatsApp Bubble Preview */}
              {previewTarget && (
                <View className="mb-6">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">WhatsApp Preview</Text>
                  <View className="bg-[#EFEAE2] p-4 rounded-2xl relative overflow-hidden border border-border/40">
                    <View 
                      className="bg-[#D9FDD3] rounded-2xl rounded-tr-sm p-3 text-[13px] leading-relaxed max-w-[85%] self-end shadow-sm border border-[#c1f0b9]"
                    >
                      <Text className="text-xs text-[#111B21] font-sans leading-5">
                        {getInterpolatedMessage(previewTarget) || "Please input your notification message..."}
                      </Text>
                      <View className="flex-row items-center justify-end mt-1.5 opacity-60">
                        <Text className="text-[9px] text-slate-500 mr-1">
                          {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </Text>
                        <Check size={10} color="#53bdeb" strokeWidth={3} />
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* Action Buttons */}
              <View className="flex-row space-x-3">
                <TouchableOpacity
                  onPress={() => setIsComposerOpen(false)}
                  className="flex-1 border border-border dark:border-border-dark bg-background dark:bg-background-dark rounded-xl h-12 items-center justify-center"
                >
                  <Text className="text-muted font-bold">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSendReminders}
                  disabled={isSending || (messageType === "custom" && !customMessage.trim())}
                  className={`flex-[2] rounded-xl h-12 items-center justify-center flex-row shadow-lg ${
                    isSending || (messageType === "custom" && !customMessage.trim())
                      ? "bg-slate-200"
                      : "bg-[#25D366] shadow-[#25D366]/20"
                  }`}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Send size={15} color="#ffffff" className="mr-2" />
                      <Text className="text-white font-bold text-sm">Send Server WhatsApp</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              </KeyboardAwareScrollView>
            </View>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  )
}
