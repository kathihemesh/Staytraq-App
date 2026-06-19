import { useState, useEffect, useCallback, useRef } from "react"
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform, LayoutAnimation, UIManager } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import useTheme from "@/hooks/use-theme"
import { Settings, User, LogOut, Sun, Moon, Check, Save, Calendar, AlertTriangle, RefreshCw, CreditCard, Link } from "lucide-react-native"
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
  const lateFeePerDayInput = useKeyboardAwareInput()
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
  const [lateFeePerDay, setLateFeePerDay] = useState("100")
  const [upiId, setUpiId] = useState("")
  const [upiName, setUpiName] = useState("")
  const [whatsappInviteLink, setWhatsappInviteLink] = useState("")
  const [screenshotRequired, setScreenshotRequired] = useState(true)
  const [utrRequired, setUtrRequired] = useState(true)
  const [paymentInstructions, setPaymentInstructions] = useState("")
  const [isMerchant, setIsMerchant] = useState(false)
  const [settingsId, setSettingsId] = useState<number | null>(null)
  
  const successTimeoutRef = useRef<any>(null)

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

  // Fetch settings from database
  const fetchSettings = useCallback(async (silent = false) => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    try {
      if (!silent) setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setSettingsId(data.id)
        setRentDueDay(String(data.rent_due_day ?? 5))
        setLateFeePerDay(String(data.late_fee_per_day ?? 100))
        setUpiId(data.upi_id ?? "")
        setUpiName(data.upi_name ?? "")
        setWhatsappInviteLink(data.whatsapp_invite_link ?? "")
        setScreenshotRequired(data.screenshot_required ?? true)
        setUtrRequired(data.utr_required ?? true)
        setPaymentInstructions(data.payment_instructions ?? "")
        setIsMerchant(data.is_merchant ?? false)
      } else {
        // No settings found, prepare to insert defaults on first save
        setRentDueDay("5")
        setLateFeePerDay("100")
        setUpiId("")
        setUpiName("")
        setWhatsappInviteLink("")
        setScreenshotRequired(true)
        setUtrRequired(true)
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
    void fetchSettings()
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
    const lateFeeNum = parseInt(lateFeePerDay, 10)

    if (isNaN(dueDayNum) || dueDayNum < 1 || dueDayNum > 31) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Rent due day must be a valid day number between 1 and 31.")
      return
    }

    if (isNaN(lateFeeNum) || lateFeeNum < 0) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Late fee per day must be a valid positive amount.")
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
        late_fee_per_day: lateFeeNum,
        owner_id: user.id,
        upi_id: upiId.trim() || null,
        upi_name: upiName.trim() || null,
        whatsapp_invite_link: whatsappInviteLink.trim() || null,
        screenshot_required: screenshotRequired,
        utr_required: utrRequired,
        payment_instructions: paymentInstructions.trim() || null,
        is_merchant: isMerchant,
      }

      if (settingsId) {
        // Update existing row
        const { error } = await supabase
          .from("settings")
          .update(payload)
          .eq("id", settingsId)

        if (error) throw error
      } else {
        // Insert new row
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
      
      // Clear success indicator after 3 seconds
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

  // Logout trigger
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
        {/* Header Skeleton */}
        <View className="px-6 pt-4 pb-3 flex-row justify-between items-center border-b border-border/40 dark:border-border-dark/40 bg-card dark:bg-card-dark">
          <View className="gap-2">
            <View className="h-7 w-28 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
            <View className="h-4 w-56 bg-muted/15 dark:bg-muted-dark/15 rounded-lg" />
          </View>
          <View className="h-10 w-10 bg-muted/20 dark:bg-muted-dark/20 rounded-xl" />
        </View>

        <View className="px-6 mt-6 gap-6">
          {/* Section 1 Skeleton */}
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

          {/* Section 2 Skeleton */}
          <View>
            <View className="h-4 w-32 bg-muted/15 dark:bg-muted-dark/15 rounded-md mb-3" />
            <View className="h-16 w-full bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl" />
          </View>

          {/* Section 3 Skeleton */}
          <View>
            <View className="h-4 w-36 bg-muted/15 dark:bg-muted-dark/15 rounded-md mb-3" />
            <View className="h-24 w-full bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl" />
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
          {/* Status Alerts */}
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

          {/* Section 1: Billing & Rent System Configurations */}
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
                  The standard day of the month when rent is considered expected and generated (typically the 5th).
                </Text>
              </View>

              {/* Late Fee per day Row */}
              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center">
                    <View className="mr-2">
                      <AlertTriangle size={16} color="#9ca3af" />
                    </View>
                    <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">Late Fee per Day</Text>
                  </View>
                  <Text className="text-xs text-muted font-semibold">Rupees (₹)</Text>
                </View>
                <TextInput
                  ref={lateFeePerDayInput.ref}
                  onFocus={lateFeePerDayInput.onFocus}
                  value={lateFeePerDay}
                  onChangeText={setLateFeePerDay}
                  keyboardType="numeric"
                  placeholder="e.g. 100"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark font-semibold"
                />
                <Text className="text-[10px] text-muted mt-1.5 leading-4">
                  Daily penalty amount applied to rent invoices once the grace period expires.
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
              {/* UPI ID Row */}
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
                
                {/* Verified Merchant Switch */}
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
                  Your primary VPA/UPI ID where occupants will send their rent payments.
                </Text>
              </View>

              {/* UPI Name Row */}
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

              {/* Payment Instructions Row */}
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
                  Custom messages shown on the tenant payment portal (e.g., bank details or specific steps).
                </Text>
              </View>

              {/* Toggle Switches */}
              <View className="border-t border-border/40 dark:border-border-dark/40 pt-4 gap-4">
                {/* Screenshot Required Toggle */}
                <View className="flex-row justify-between items-center">
                  <View className="flex-1 mr-4">
                    <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">Require Screenshot</Text>
                    <Text className="text-[10px] text-muted mt-0.5 leading-4">Occupants must upload a transaction screenshot on the portal.</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      setScreenshotRequired(!screenshotRequired)
                    }}
                    className={`w-12 h-7 rounded-full p-1 flex-row items-center justify-end ${
                      screenshotRequired ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"
                    }`}
                  >
                    <View className="w-5 h-5 rounded-full bg-white shadow-sm" />
                  </TouchableOpacity>
                </View>

                {/* UTR Required Toggle */}
                <View className="flex-row justify-between items-center">
                  <View className="flex-1 mr-4">
                    <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">Require UTR Number</Text>
                    <Text className="text-[10px] text-muted mt-0.5 leading-4">Occupants must type their 12-digit transaction UTR reference code.</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      setUtrRequired(!utrRequired)
                    }}
                    className={`w-12 h-7 rounded-full p-1 flex-row items-center justify-start ${
                      utrRequired ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"
                    }`}
                  >
                    {utrRequired ? (
                      <>
                        <View className="flex-1" />
                        <View className="w-5 h-5 rounded-full bg-white shadow-sm" />
                      </>
                    ) : (
                      <>
                        <View className="w-5 h-5 rounded-full bg-white shadow-sm" />
                        <View className="flex-1" />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
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
                  Group invite link that will be shared with new occupants right after you add them.
                </Text>
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

          {/* Section 2: Preferences (Dark Mode toggles) */}
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

                {/* Custom toggler */}
                <TouchableOpacity
                  key={`theme-toggle-${isDark}`}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    
                    // Smooth native layout animation on toggling theme
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
              {/* Account details read-only fields */}
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

              {/* Log out */}
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

          {/* Footer branding details */}
          <View className="items-center mt-8 px-6">
            <Text className="text-[10px] font-black uppercase text-muted tracking-widest text-center">
              Staytraq Mobile App v1.0.0
            </Text>
            <Text className="text-[9px] font-medium text-muted/60 text-center mt-1">
              Optimized with TanStack Query & Supabase Realtime persistence.
            </Text>
          </View>
        </KeyboardAwareScrollView>

      {/* Confirm Logout Modal */}
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
