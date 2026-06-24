import { useState, useEffect, useCallback, useRef } from "react"
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Platform, LayoutAnimation, UIManager, Image } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import { scheduleAfterInteractions } from "@/lib/focus-fetch-scheduler"
import useTheme from "@/hooks/use-theme"
import { Settings, User, LogOut, Sun, Moon, Check, Save, Calendar, AlertTriangle, RefreshCw, CreditCard, Link, Bot, Smartphone, Trash2, QrCode } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import Animated, { FadeIn } from "react-native-reanimated"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"
import { ConfirmModal } from "@/components/ui/confirm-modal"

export default function SettingsScreen() {
  const { user, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true)
    }
  }, [])

  const rentDueDayInput = useKeyboardAwareInput()
  const defaultDepositFeesInput = useKeyboardAwareInput()
  const refundDepositInput = useKeyboardAwareInput()
  const upiIdInput = useKeyboardAwareInput()
  const upiNameInput = useKeyboardAwareInput()
  const whatsappInviteLinkInput = useKeyboardAwareInput()
  const paymentInstructionsInput = useKeyboardAwareInput()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [confirmModalVisible, setConfirmModalVisible] = useState(false)

  // Settings values
  const [rentDueDay, setRentDueDay] = useState("5")
  const [defaultDepositFees, setDefaultDepositFees] = useState("0")
  const [refundDeposit, setRefundDeposit] = useState("0")
  const [upiId, setUpiId] = useState("")
  const [upiName, setUpiName] = useState("")
  const [whatsappInviteLink, setWhatsappInviteLink] = useState("")
  const [paymentInstructions, setPaymentInstructions] = useState("")
  const [isMerchant, setIsMerchant] = useState(false)
  const [settingsId, setSettingsId] = useState<number | null>(null)

  // Chatbot settings state
  const [chatbotStatusLoading, setChatbotStatusLoading] = useState(true)
  const [instanceExists, setInstanceExists] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("not_created")
  const [chatbotPhoneNumber, setChatbotPhoneNumber] = useState<string | null>(null)
  const [qrCodeData, setQrCodeData] = useState<string | null>(null)
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true)
  const [chatbotEnabled, setChatbotEnabled] = useState(false)
  const [isProcessingChatbot, setIsProcessingChatbot] = useState(false)
  
  const successTimeoutRef = useRef<any>(null)

  const getChatbotApiUrl = () => {
    if (process.env.EXPO_PUBLIC_CHATBOT_API_URL) {
      return process.env.EXPO_PUBLIC_CHATBOT_API_URL
    }
    return "https://staytraq.vercel.app/api/chatbot-proxy"
  }

  const detectMerchantUpi = (vpa: string): boolean => {
    if (!vpa) return false
    const lower = vpa.trim().toLowerCase()
    const merchantHandles = [
      "okbiz", "okbizaxis", "okbizsbi", "okbizicici", "okbizhdfc",
      "merchant", "business", "store", "shop", "paytmmerchant", 
      "hdfcmerchant", "icicimerchant", "axismap", "okhdfcbank",
      "vyapar"
    ]
    const parts = lower.split("@")
    if (parts.length === 2) {
      const handle = parts[1]
      if (merchantHandles.some(mh => handle.startsWith(mh))) return true
    }
    return (
      lower.includes("merchant") || lower.includes("biz") ||
      lower.includes("business") || lower.includes("store") ||
      lower.includes("shop") || lower.includes("vyapar")
    )
  }

  const handleUpiIdChange = (val: string) => {
    setUpiId(val)
    setIsMerchant(detectMerchantUpi(val))
  }

  const handleDepositFeesChange = (val: string) => {
    setDefaultDepositFees(val)
    const num = parseFloat(val)
    if (!isNaN(num)) {
      setRefundDeposit(String(Math.round(num * 0.5)))
    } else {
      setRefundDeposit("")
    }
  }

  const fetchChatbotStatus = useCallback(async (silent = false) => {
    try {
      if (!silent) setChatbotStatusLoading(true)
      
      const sessionRes = await supabase.auth.getSession()
      const session = sessionRes.data.session
      if (!session) return

      // Load pg_owners data for auto_reply_enabled
      const { data: ownerData } = await supabase
        .from("pg_owners")
        .select("auto_reply_enabled, chatbot_enabled")
        .eq("id", session.user.id)
        .maybeSingle()

      if (ownerData) {
        setAutoReplyEnabled(ownerData.auto_reply_enabled ?? true)
        setChatbotEnabled(ownerData.chatbot_enabled ?? false)
      }

      const chatbotApiUrl = getChatbotApiUrl()
      const res = await fetch(`${chatbotApiUrl}/api/v1/chatbot/status`, {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })
      if (res.ok) {
        const statusData = await res.json()
        setInstanceExists(statusData.exists)
        setConnectionStatus(statusData.connectionStatus)
        setChatbotPhoneNumber(statusData.phoneNumber)
        setQrCodeData(statusData.qrCode)
      }
    } catch (err) {
      console.error("Failed to load chatbot status on mobile settings:", err)
    } finally {
      if (!silent) setChatbotStatusLoading(false)
    }
  }, [])

  // Polling for QR Code scanning / connection status
  useEffect(() => {
    fetchChatbotStatus()
  }, [fetchChatbotStatus])

  useEffect(() => {
    if (connectionStatus !== "connected" && instanceExists) {
      const interval = setInterval(() => {
        fetchChatbotStatus(true)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [connectionStatus, instanceExists, fetchChatbotStatus])

  const handleCreateChatbot = async () => {
    try {
      setIsProcessingChatbot(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setError(null)
      
      const sessionRes = await supabase.auth.getSession()
      const session = sessionRes.data.session
      if (!session) return

      const chatbotApiUrl = getChatbotApiUrl()
      const res = await fetch(`${chatbotApiUrl}/api/v1/chatbot/create`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        setInstanceExists(true)
        setConnectionStatus("disconnected")
        setQrCodeData(data.qrCode)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setError("Failed to create chatbot instance on server.")
      }
    } catch (err) {
      console.error("Error creating chatbot:", err)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Error calling chatbot creation API.")
    } finally {
      setIsProcessingChatbot(false)
    }
  }

  const handleDeleteChatbot = async () => {
    try {
      setIsProcessingChatbot(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      setError(null)
      
      const sessionRes = await supabase.auth.getSession()
      const session = sessionRes.data.session
      if (!session) return

      const chatbotApiUrl = getChatbotApiUrl()
      const res = await fetch(`${chatbotApiUrl}/api/v1/chatbot/delete`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })
      if (res.ok) {
        setInstanceExists(false)
        setConnectionStatus("not_created")
        setChatbotPhoneNumber(null)
        setQrCodeData(null)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setError("Failed to delete chatbot instance.")
      }
    } catch (err) {
      console.error("Error deleting chatbot:", err)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Error calling chatbot deletion API.")
    } finally {
      setIsProcessingChatbot(false)
    }
  }

  const handleToggleAutoReply = async (value: boolean) => {
    try {
      if (!user?.id) return
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setError(null)
      
      setAutoReplyEnabled(value)

      const { error } = await supabase
        .from("pg_owners")
        .update({ auto_reply_enabled: value })
        .eq("id", user.id)

      if (error) throw error
    } catch (err) {
      console.error("Error toggling auto-reply:", err)
      setAutoReplyEnabled(!value) // rollback
      setError("Failed to update auto-reply settings.")
    }
  }

  // Fetch settings from database
  const fetchSettings = useCallback(async (silent = false) => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    try {
      if (!silent) setLoading(true)
      setError(null)

      const [settingsRes, ownerRes] = await Promise.all([
        supabase
          .from("settings")
          .select("*")
          .eq("owner_id", user.id)
          .maybeSingle(),
        supabase
          .from("pg_owners")
          .select("auto_reply_enabled, chatbot_enabled")
          .eq("id", user.id)
          .maybeSingle()
      ])

      if (settingsRes.error) throw settingsRes.error
      if (ownerRes.error) throw ownerRes.error

      const data = settingsRes.data
      const ownerData = ownerRes.data

      if (ownerData) {
        setAutoReplyEnabled(ownerData.auto_reply_enabled ?? true)
        setChatbotEnabled(ownerData.chatbot_enabled ?? false)
      }

      if (data) {
        setSettingsId(data.id)
        setRentDueDay(String(data.rent_due_day ?? 5))
        setDefaultDepositFees(String(data.default_deposit_fees ?? 0))
        setRefundDeposit(String(data.refund_deposit ?? 0))
        setUpiId(data.upi_id ?? "")
        setUpiName(data.upi_name ?? "")
        setWhatsappInviteLink(data.whatsapp_invite_link ?? "")
        setPaymentInstructions(data.payment_instructions ?? "")
        setIsMerchant(data.is_merchant ?? false)
      } else {
        setRentDueDay("5")
        setDefaultDepositFees("0")
        setRefundDeposit("0")
        setUpiId("")
        setUpiName("")
        setWhatsappInviteLink("")
        setPaymentInstructions("")
        setIsMerchant(false)
      }
    } catch (err: any) {
      console.error("Error fetching settings:", err)
      setError("Failed to fetch settings from server.")
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    // Defer the initial settings load past the navigation transition / first interactive
    // paint (Change A) so it does not block the destination's first paint; the load runs
    // once and is cancelled on unmount-before-run (no drop, no duplicate).
    const handle = scheduleAfterInteractions(() => {
      void fetchSettings()
    })
    return () => handle.cancel()
  }, [fetchSettings])

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  // Save settings to database
  const handleSaveSettings = async () => {
    if (!user?.id) return
    
    // Validation
    const dueDayNum = parseInt(rentDueDay, 10)
    const depositFeesNum = parseInt(defaultDepositFees, 10)
    const refundDepositNum = parseInt(refundDeposit, 10)

    if (isNaN(dueDayNum) || dueDayNum < 1 || dueDayNum > 31) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Rent due day must be a valid day number between 1 and 31.")
      return
    }

    if (isNaN(depositFeesNum) || depositFeesNum < 0) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Default deposit fees must be a valid positive amount.")
      return
    }

    if (isNaN(refundDepositNum) || refundDepositNum < 0) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Refund deposit must be a valid positive amount.")
      return
    }

    // Validate UPI ID if provided
    if (upiId.trim() && !upiId.includes("@")) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Please enter a valid UPI ID (must contain '@').")
      return
    }

    // Validate WhatsApp Link if provided
    if (whatsappInviteLink.trim() && !whatsappInviteLink.includes("whatsapp.com") && !whatsappInviteLink.startsWith("http")) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Please enter a valid WhatsApp invite link.")
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      const payload = {
        rent_due_day: dueDayNum,
        default_deposit_fees: depositFeesNum,
        refund_deposit: refundDepositNum,
        owner_id: user.id,
        upi_id: upiId.trim() || null,
        upi_name: upiName.trim() || null,
        whatsapp_invite_link: whatsappInviteLink.trim() || null,
        payment_instructions: paymentInstructions.trim() || null,
        is_merchant: isMerchant,
      }

      if (settingsId) {
        const { error } = await supabase
          .from("settings")
          .update(payload)
          .eq("id", settingsId)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from("settings")
          .insert(payload)
          .select("id")
          .single()

        if (error) throw error
        if (data) setSettingsId(data.id)
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
      setSuccess(true)
      
      successTimeoutRef.current = setTimeout(() => {
        setSuccess(false)
      }, 3000)
    } catch (err: any) {
      console.error("Error saving settings:", err)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError(err?.message || "Failed to update configurations.")
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    setConfirmModalVisible(true)
  }

  const confirmLogout = async () => {
    setConfirmModalVisible(false)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    await logout()
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark" edges={["top"]}>
        <View className="px-6 pt-4 pb-3 flex-row justify-between items-center border-b border-border/40 dark:border-border-dark/40 bg-card dark:bg-card-dark">
          <View className="gap-2">
            <View className="h-7 w-28 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
            <View className="h-4 w-56 bg-muted/15 dark:bg-muted-dark/15 rounded-lg" />
          </View>
          <View className="h-10 w-10 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
        </View>

        <View className="px-6 mt-6 gap-6">
          <View>
            <View className="h-4 w-36 bg-muted/15 dark:bg-muted-dark/15 rounded-md mb-3" />
            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-5 shadow-sm gap-5">
              <View>
                <View className="h-3.5 w-24 bg-muted/15 dark:bg-muted-dark/15 rounded-md mb-2" />
                <View className="h-11 w-full bg-muted/10 dark:bg-muted-dark/10 rounded-xl" />
              </View>
              <View>
                <View className="h-3.5 w-24 bg-muted/15 dark:bg-muted-dark/15 rounded-md mb-2" />
                <View className="h-11 w-full bg-muted/10 dark:bg-muted-dark/10 rounded-xl" />
              </View>
              <View>
                <View className="h-3.5 w-32 bg-muted/15 dark:bg-muted-dark/15 rounded-md mb-2" />
                <View className="h-11 w-full bg-muted/10 dark:bg-muted-dark/10 rounded-xl" />
              </View>
              <View className="h-12 w-full bg-muted/20 dark:bg-muted-dark/20 rounded-xl mt-2" />
            </View>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark" edges={["top"]}>
      {/* Header */}
      <View className="px-6 pt-4 pb-3 flex-row justify-between items-center border-b border-border/40 dark:border-border-dark/40 bg-card dark:bg-card-dark">
        <View>
          <Text className="text-2xl font-black text-foreground dark:text-foreground-dark tracking-tight">
            Settings
          </Text>
          <Text className="text-sm text-muted dark:text-muted-dark font-medium mt-1">
            Staytraq estate rules & configuration
          </Text>
        </View>
        <TouchableOpacity 
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            void fetchSettings()
          }}
          className="h-10 w-10 border border-border dark:border-border-dark rounded-xl items-center justify-center bg-card dark:bg-card-dark"
        >
          <RefreshCw size={18} color={isDark ? "#0091ff" : "#0071df"} />
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
          {error && (
            <View className="mx-6 mt-4 bg-destructive/10 border border-destructive/20 p-4 rounded-2xl flex-row items-center">
              <View className="mr-3">
                <AlertTriangle size={18} color="#ef4444" />
              </View>
              <Text className="text-destructive text-xs font-semibold flex-1 leading-4">{error}</Text>
            </View>
          )}

          {success && (
            <Animated.View 
              entering={FadeIn}
              className="mx-6 mt-4 bg-success/10 border border-success/20 p-4 rounded-2xl flex-row items-center"
            >
              <View className="mr-3">
                <Check size={18} color="#10b981" />
              </View>
              <Text className="text-success text-xs font-bold flex-1">Settings updated successfully!</Text>
            </Animated.View>
          )}

          {/* Section 1: Rental Policy Rules */}
          <View className="px-6 mt-6">
            <View className="flex-row items-center mb-3">
              <View className="mr-2">
                <Settings size={18} color={isDark ? "#0091ff" : "#0071df"} />
              </View>
              <Text className="text-sm font-bold text-muted uppercase tracking-wider">Rental Policy Rules</Text>
            </View>

            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-5 shadow-sm gap-4">
              
              {/* Due Date Row */}
              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center">
                    <View className="mr-2">
                      <Calendar size={16} color="#9ca3af" />
                    </View>
                    <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">Rent Due Day</Text>
                  </View>
                  <Text className="text-xs text-muted font-semibold">Every Month</Text>
                </View>
                <TextInput
                  ref={rentDueDayInput.ref}
                  onFocus={rentDueDayInput.onFocus}
                  value={rentDueDay}
                  onChangeText={setRentDueDay}
                  keyboardType="numeric"
                  placeholder="e.g. 5"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark font-semibold"
                />
                <Text className="text-[10px] text-muted mt-1.5 leading-4">
                  The standard day of the month when rent is generated (typically the 5th).
                </Text>
              </View>

              {/* Default Deposit Fees */}
              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">Default Deposit Fees</Text>
                  <Text className="text-xs text-muted font-semibold">Rupees (₹)</Text>
                </View>
                <TextInput
                  ref={defaultDepositFeesInput.ref}
                  onFocus={defaultDepositFeesInput.onFocus}
                  value={defaultDepositFees}
                  onChangeText={handleDepositFeesChange}
                  keyboardType="numeric"
                  placeholder="e.g. 10000"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark font-semibold"
                />
                <Text className="text-[10px] text-muted mt-1.5 leading-4">
                  Standard security deposit applied automatically to new tenants.
                </Text>
              </View>

              {/* Refund Deposit */}
              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">Refund Deposit</Text>
                  <Text className="text-xs text-muted font-semibold">Rupees (₹)</Text>
                </View>
                <TextInput
                  ref={refundDepositInput.ref}
                  onFocus={refundDepositInput.onFocus}
                  value={refundDeposit}
                  onChangeText={setRefundDeposit}
                  keyboardType="numeric"
                  placeholder="e.g. 5000"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark font-semibold"
                />
                <Text className="text-[10px] text-muted mt-1.5 leading-4">
                  Expected refund deposit amount auto-filled during move out checklist (defaults to 50% of deposit fees).
                </Text>
              </View>

            </View>
          </View>

          {/* Section 2: UPI & Payment Settings */}
          <View className="px-6 mt-6">
            <View className="flex-row items-center mb-3">
              <View className="mr-2">
                <CreditCard size={18} color={isDark ? "#0091ff" : "#0071df"} />
              </View>
              <Text className="text-sm font-bold text-muted uppercase tracking-wider">UPI & Payment Settings</Text>
            </View>

            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-5 shadow-sm gap-4">
              <View>
                <Text className="text-sm font-bold text-foreground dark:text-foreground-dark mb-2">UPI ID</Text>
                <TextInput
                  ref={upiIdInput.ref}
                  onFocus={upiIdInput.onFocus}
                  value={upiId}
                  onChangeText={handleUpiIdChange}
                  placeholder="e.g. owner@upi"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark font-semibold"
                />
                
                <View className="flex-row justify-between items-center mt-2.5 bg-muted/5 dark:bg-muted-dark/5 p-3 rounded-2xl border border-border/10 dark:border-border-dark/10">
                  <View className="flex-1 mr-4">
                    <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Verified Merchant Account</Text>
                    <Text className="text-[9px] text-muted mt-0.5 leading-3.5">Enable Transaction Reference tracking for business accounts.</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      setIsMerchant(!isMerchant)
                    }}
                    className={`w-12 h-7 rounded-full p-1 flex-row items-center ${
                      isMerchant ? "bg-primary justify-end" : "bg-slate-200 dark:bg-slate-800 justify-start"
                    }`}
                  >
                    <View className="w-5 h-5 rounded-full bg-white shadow-sm" />
                  </TouchableOpacity>
                </View>

                <Text className="text-[10px] text-muted mt-1.5 leading-4">
                  Your primary UPI ID where occupants will send their rent payments.
                </Text>
              </View>

              <View>
                <Text className="text-sm font-bold text-foreground dark:text-foreground-dark mb-2">UPI Payee Name</Text>
                <TextInput
                  ref={upiNameInput.ref}
                  onFocus={upiNameInput.onFocus}
                  value={upiName}
                  onChangeText={setUpiName}
                  placeholder="e.g. John Doe"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark font-semibold"
                />
                <Text className="text-[10px] text-muted mt-1.5 leading-4">
                  The official name associated with your UPI ID.
                </Text>
              </View>

              <View>
                <Text className="text-sm font-bold text-foreground dark:text-foreground-dark mb-2">Payment Instructions</Text>
                <TextInput
                  ref={paymentInstructionsInput.ref}
                  onFocus={paymentInstructionsInput.onFocus}
                  value={paymentInstructions}
                  onChangeText={setPaymentInstructions}
                  placeholder="e.g. Please send payment screenshot and verify UTR."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={2}
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark font-semibold min-h-[60px]"
                />
                <Text className="text-[10px] text-muted mt-1.5 leading-4">
                  Custom messages shown on the tenant payment portal.
                </Text>
              </View>
            </View>
          </View>

          {/* Section 3: WhatsApp Integration Settings */}
          <View className="px-6 mt-6">
            <View className="flex-row items-center mb-3">
              <View className="mr-2">
                <Link size={18} color={isDark ? "#0091ff" : "#0071df"} />
              </View>
              <Text className="text-sm font-bold text-muted uppercase tracking-wider">WhatsApp Integration</Text>
            </View>

            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-5 shadow-sm gap-4">
              {/* Part A: Group Invite Link */}
              <View>
                <Text className="text-sm font-bold text-foreground dark:text-foreground-dark mb-2">WhatsApp Group Invite Link</Text>
                <TextInput
                  ref={whatsappInviteLinkInput.ref}
                  onFocus={whatsappInviteLinkInput.onFocus}
                  value={whatsappInviteLink}
                  onChangeText={setWhatsappInviteLink}
                  placeholder="e.g. https://chat.whatsapp.com/..."
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  keyboardType="url"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark font-semibold"
                />
                <Text className="text-[10px] text-muted mt-1.5 leading-4">
                  Group invite link shared with new occupants right after adding them.
                </Text>
              </View>

              <View className="border-t border-border/60 dark:border-border-dark/60 my-2" />

              {/* Part B: Chatbot Setup */}
              <View>
                <View className="flex-row items-center mb-3">
                  <View className="mr-2">
                    <Bot size={18} color={isDark ? "#0091ff" : "#0071df"} />
                  </View>
                  <Text className="text-base font-bold text-foreground dark:text-foreground-dark">WhatsApp Chatbot Assistant</Text>
                </View>

                {chatbotStatusLoading ? (
                  <View className="py-6 items-center justify-center">
                    <ActivityIndicator size="small" color={isDark ? "#0091ff" : "#0071df"} />
                    <Text className="text-xs text-muted dark:text-muted-dark mt-2 font-semibold">Checking connection status...</Text>
                  </View>
                ) : (
                  <View className="gap-4">
                    {/* Status Banner */}
                    <View className="bg-background dark:bg-background-dark/50 border border-border dark:border-border-dark p-4 rounded-2xl gap-3">
                      <View className="flex-row justify-between items-center">
                        <View className="flex-row items-center">
                          <View className={`h-2.5 w-2.5 rounded-full mr-2 ${
                            connectionStatus === "connected"
                              ? "bg-success"
                              : connectionStatus === "connecting"
                              ? "bg-warning"
                              : "bg-destructive"
                          }`} />
                          <Text className="text-sm font-bold text-foreground dark:text-foreground-dark capitalize">
                            {connectionStatus === "not_created" ? "Not Configured" : connectionStatus}
                          </Text>
                        </View>
                        {chatbotPhoneNumber && (
                          <Text className="text-xs text-muted dark:text-muted-dark font-mono font-semibold">
                            {chatbotPhoneNumber}
                          </Text>
                        )}
                      </View>

                      <Text className="text-xs text-muted leading-4">
                        {connectionStatus === "connected"
                          ? "Your chatbot assistant is online and automatically replying to tenant messages."
                          : connectionStatus === "disconnected"
                          ? "Instance created but not paired. Scan the QR code to pair WhatsApp."
                          : connectionStatus === "connecting"
                          ? "Connecting to Evolution API, please wait..."
                          : "Connect your WhatsApp number to automate communications."}
                      </Text>

                      <View className="flex-row gap-2 mt-1">
                        {connectionStatus === "not_created" && (
                          <TouchableOpacity
                            disabled={isProcessingChatbot}
                            onPress={handleCreateChatbot}
                            className="bg-primary px-4 py-2 rounded-xl flex-row items-center justify-center flex-1"
                          >
                            {isProcessingChatbot ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <Text className="text-white text-xs font-bold">Create Chatbot</Text>
                            )}
                          </TouchableOpacity>
                        )}
                        {instanceExists && (
                          <TouchableOpacity
                            disabled={isProcessingChatbot}
                            onPress={handleDeleteChatbot}
                            className="border border-destructive/20 bg-destructive/5 px-4 py-2 rounded-xl flex-row items-center justify-center flex-1"
                          >
                            {isProcessingChatbot ? (
                              <ActivityIndicator size="small" color="#ef4444" />
                            ) : (
                              <Text className="text-destructive text-xs font-bold">Delete Chatbot</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* QR Code Section with detailed 5 steps */}
                    {connectionStatus === "disconnected" && qrCodeData && (
                      <View className="border border-dashed border-border dark:border-border-dark p-5 rounded-2xl items-center gap-3">
                        <View className="flex-row items-center">
                          <View className="mr-1.5">
                            <QrCode size={16} color={isDark ? "#0091ff" : "#0071df"} />
                          </View>
                          <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">Scan to Pair WhatsApp</Text>
                        </View>
                        
                        <View className="border border-border/40 p-2.5 bg-white rounded-xl shadow-inner">
                          <Image 
                            source={{ uri: qrCodeData }} 
                            style={{ width: 180, height: 180 }}
                            resizeMode="contain"
                          />
                        </View>

                        <View className="w-full bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-border/50 gap-1.5 mt-2">
                          <Text className="text-xs font-bold text-foreground dark:text-foreground-dark mb-1">How to connect your WhatsApp:</Text>
                          <Text className="text-[11px] text-muted dark:text-muted-dark leading-relaxed">
                            1. Open <Text className="font-semibold text-foreground dark:text-foreground-dark">WhatsApp</Text> on your phone.
                          </Text>
                          <Text className="text-[11px] text-muted dark:text-muted-dark leading-relaxed">
                            2. Tap the <Text className="font-semibold text-foreground dark:text-foreground-dark">Menu</Text> icon (top right three dots on Android) or <Text className="font-semibold text-foreground dark:text-foreground-dark">Settings</Text> (bottom right gear on iOS).
                          </Text>
                          <Text className="text-[11px] text-muted dark:text-muted-dark leading-relaxed">
                            3. Select <Text className="font-semibold text-foreground dark:text-foreground-dark">Linked Devices</Text>.
                          </Text>
                          <Text className="text-[11px] text-muted dark:text-muted-dark leading-relaxed">
                            4. Tap the <Text className="font-semibold text-foreground dark:text-foreground-dark">Link a Device</Text> button.
                          </Text>
                          <Text className="text-[11px] text-muted dark:text-muted-dark leading-relaxed">
                            5. Point your phone's camera at this screen to scan the QR code and pair.
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Auto Reply Switch */}
                    {connectionStatus === "connected" && (
                      <View className="flex-row justify-between items-center py-1">
                        <View className="flex-1 mr-4">
                          <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">AI Auto-Replies</Text>
                          <Text className="text-[10px] text-muted leading-4 mt-0.5">
                            Automatically respond to occupant rent queries and complaints.
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => handleToggleAutoReply(!autoReplyEnabled)}
                          className={`w-12 h-7 rounded-full p-0.5 flex-row items-center ${
                            autoReplyEnabled ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"
                          }`}
                        >
                          {autoReplyEnabled ? (
                            <>
                              <View className="flex-1" />
                              <View className="w-6 h-6 rounded-full bg-white shadow-sm" />
                            </>
                          ) : (
                            <>
                              <View className="w-6 h-6 rounded-full bg-white shadow-sm" />
                              <View className="flex-1" />
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Unified Save Configuration Button */}
          <View className="px-6 mt-6">
            <TouchableOpacity
              key={`save-btn-${saving}`}
              onPress={handleSaveSettings}
              disabled={saving}
              className={`bg-primary rounded-xl h-12 flex-row items-center justify-center shadow-lg ${
                saving ? "bg-primary/70" : "shadow-primary/20"
              }`}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <View className="mr-2">
                    <Save size={16} color="#ffffff" />
                  </View>
                  <Text className="text-white text-base font-bold">Save Configurations</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Section 2: Preferences (Appearance) */}
          <View className="px-6 mt-6">
            <View className="flex-row items-center mb-3">
              <View className="mr-2">
                <Sun size={18} color={isDark ? "#0091ff" : "#0071df"} />
              </View>
              <Text className="text-sm font-bold text-muted uppercase tracking-wider">App Appearance</Text>
            </View>

            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-5 shadow-sm">
              <View className="flex-row justify-between items-center">
                <View className="flex-row items-center">
                  {isDark ? (
                    <View className="mr-2.5">
                      <Moon size={18} color="#a78bfa" />
                    </View>
                  ) : (
                    <View className="mr-2.5">
                      <Sun size={18} color="#eab308" />
                    </View>
                  )}
                  <View>
                    <Text className="text-base font-bold text-foreground dark:text-foreground-dark">Dark Theme</Text>
                    <Text className="text-xs text-muted mt-0.5 font-medium">Use high-contrast dark theme styles</Text>
                  </View>
                </View>

                <TouchableOpacity
                  key={`theme-toggle-${isDark}`}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    
                    LayoutAnimation.configureNext({
                      duration: 400,
                      create: {
                        type: LayoutAnimation.Types.easeInEaseOut,
                        property: LayoutAnimation.Properties.opacity,
                      },
                      update: {
                        type: LayoutAnimation.Types.easeInEaseOut,
                      },
                    })
                    
                    toggleTheme()
                  }}
                  className={`w-14 h-8 rounded-full p-1 flex-row items-center justify-between ${
                    isDark ? "bg-primary" : "bg-slate-200"
                  }`}
                >
                  {isDark ? (
                    <>
                      <View className="flex-1" />
                      <View className="w-6 h-6 rounded-full bg-white shadow-sm" />
                    </>
                  ) : (
                    <>
                      <View className="w-6 h-6 rounded-full bg-white shadow-sm" />
                      <View className="flex-1" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Section 3: Owner Account Details */}
          <View className="px-6 mt-6">
            <View className="flex-row items-center mb-3">
              <View className="mr-2">
                <User size={18} color={isDark ? "#0091ff" : "#0071df"} />
              </View>
              <Text className="text-sm font-bold text-muted uppercase tracking-wider">Landlord Account</Text>
            </View>

            <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-5 shadow-sm gap-4">
              <View className="flex-row justify-between py-1 border-b border-border/40 dark:border-border-dark/40 pb-3">
                <Text className="text-sm font-bold text-muted">Account ID</Text>
                <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark font-mono text-right" numberOfLines={1}>
                  {user?.id?.substring(0, 12)}...
                </Text>
              </View>

              {user?.email && (
                <View className="flex-row justify-between py-1 border-b border-border/40 dark:border-border-dark/40 pb-3">
                  <Text className="text-sm font-bold text-muted">Email Address</Text>
                  <Text className="text-sm font-bold text-foreground dark:text-foreground-dark text-right">{user.email}</Text>
                </View>
              )}

              {user?.phone && (
                <View className="flex-row justify-between py-1 border-b border-border/40 dark:border-border-dark/40 pb-3">
                  <Text className="text-sm font-bold text-muted">Mobile Number</Text>
                  <Text className="text-sm font-bold text-foreground dark:text-foreground-dark text-right">{user.phone}</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleLogout}
                className="border border-destructive/20 bg-destructive/5 rounded-xl h-12 flex-row items-center justify-center mt-2"
              >
                <View className="mr-2">
                  <LogOut size={16} color="#ef4444" />
                </View>
                <Text className="text-destructive text-base font-bold">Secure Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="items-center mt-8 px-6">
            <Text className="text-[10px] font-black uppercase text-muted tracking-widest text-center">
              Staytraq Mobile App v1.0.0
            </Text>
            <Text className="text-[9px] font-medium text-muted/60 text-center mt-1">
              Optimized with TanStack Query & Supabase Realtime persistence.
            </Text>
          </View>
        </KeyboardAwareScrollView>

      <ConfirmModal
        visible={confirmModalVisible}
        title="Confirm Logout"
        message="Are you sure you want to securely log out of Staytraq?"
        confirmText="Log Out"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={confirmLogout}
        onCancel={() => setConfirmModalVisible(false)}
        icon={<LogOut size={24} color="#ef4444" />}
      />
    </SafeAreaView>
  )
}
