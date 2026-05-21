import { useState, useEffect, useCallback, useRef } from "react"
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import useTheme from "@/hooks/use-theme"
import { Settings, User, LogOut, Sun, Moon, Check, Save, Calendar, Clock, AlertTriangle, RefreshCw } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import Animated, { FadeIn } from "react-native-reanimated"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"

export default function SettingsScreen() {
  const { user, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()

  const rentDueDayInput = useKeyboardAwareInput()
  const gracePeriodDaysInput = useKeyboardAwareInput()
  const lateFeePerDayInput = useKeyboardAwareInput()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Settings values
  const [rentDueDay, setRentDueDay] = useState("5")
  const [gracePeriodDays, setGracePeriodDays] = useState("3")
  const [lateFeePerDay, setLateFeePerDay] = useState("100")
  const [settingsId, setSettingsId] = useState<number | null>(null)
  
  const successTimeoutRef = useRef<any>(null)

  // Fetch settings from database
  const fetchSettings = useCallback(async (silent = false) => {
    if (!user?.id) return
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
        setGracePeriodDays(String(data.grace_period_days ?? 3))
        setLateFeePerDay(String(data.late_fee_per_day ?? 100))
      } else {
        // No settings found, prepare to insert defaults on first save
        setRentDueDay("5")
        setGracePeriodDays("3")
        setLateFeePerDay("100")
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
    const graceNum = parseInt(gracePeriodDays, 10)
    const lateFeeNum = parseInt(lateFeePerDay, 10)

    if (isNaN(dueDayNum) || dueDayNum < 1 || dueDayNum > 31) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Rent due day must be a valid day number between 1 and 31.")
      return
    }

    if (isNaN(graceNum) || graceNum < 0 || graceNum > 30) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Grace period must be a valid number of days between 0 and 30.")
      return
    }

    if (isNaN(lateFeeNum) || lateFeeNum < 0) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError("Late fee per day must be a valid positive amount.")
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      const payload = {
        rent_due_day: dueDayNum,
        grace_period_days: graceNum,
        late_fee_per_day: lateFeeNum,
        owner_id: user.id,
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
    Alert.alert(
      "Confirm Logout",
      "Are you sure you want to securely log out of Staytraq?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Log Out", 
          style: "destructive",
          onPress: async () => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
            await logout()
          }
        }
      ]
    )
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark items-center justify-center">
        <ActivityIndicator size="large" color={isDark ? "#0091ff" : "#0071df"} />
        <Text className="text-sm text-muted dark:text-muted-dark mt-3 font-semibold">Reading preferences...</Text>
      </View>
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
        contentContainerStyle={{ paddingBottom: 40 }}
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

              {/* Grace Period Row */}
              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center">
                    <View className="mr-2">
                      <Clock size={16} color="#9ca3af" />
                    </View>
                    <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">Grace Period</Text>
                  </View>
                  <Text className="text-xs text-muted font-semibold">Days</Text>
                </View>
                <TextInput
                  ref={gracePeriodDaysInput.ref}
                  onFocus={gracePeriodDaysInput.onFocus}
                  value={gracePeriodDays}
                  onChangeText={setGracePeriodDays}
                  keyboardType="numeric"
                  placeholder="e.g. 3"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark font-semibold"
                />
                <Text className="text-[10px] text-muted mt-1.5 leading-4">
                  Additional days allowed to tenants to process rent after the due date before late fees accumulate.
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

              {/* Save Button */}
              <TouchableOpacity
                onPress={handleSaveSettings}
                disabled={saving}
                className={`bg-primary rounded-xl h-12 flex-row items-center justify-center mt-3 shadow-lg ${
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
                    <Text className="text-white text-base font-bold">Save Rent Policies</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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
    </SafeAreaView>
  )
}
