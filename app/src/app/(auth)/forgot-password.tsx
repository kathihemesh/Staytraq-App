import { useState, useRef } from "react"
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform, Image } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter, Link } from "expo-router"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/context/auth"
import { Mail, Phone, ChevronRight, Hotel, AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"

export default function ForgotPasswordScreen() {
  const { authReady, isLoading: isAuthLoading } = useAuth()
  const router = useRouter()
  const { isDark } = useTheme()
  const otpInputRef = useRef<TextInput>(null)
  
  const identifierInput = useKeyboardAwareInput()

  const [authType, setAuthType] = useState<"phone" | "email">("phone")
  const [step, setStep] = useState<"initial" | "otp">("initial")

  if (!authReady || isAuthLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark justify-center px-6 py-12">
        {/* Branding Header Skeleton */}
        <View className="items-center mb-8 animate-pulse">
          <View className="h-14 w-14 bg-muted/20 dark:bg-muted-dark/20 rounded-2xl mb-4" />
          <View className="h-8 w-48 bg-muted/20 dark:bg-muted-dark/20 rounded-xl mb-2" />
          <View className="h-4 w-64 bg-muted/15 dark:bg-muted-dark/15 rounded-lg mb-1" />
          <View className="h-4 w-40 bg-muted/15 dark:bg-muted-dark/15 rounded-lg" />
        </View>

        {/* Premium Card Skeleton */}
        <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-6 rounded-3xl shadow-md animate-pulse">
          {/* Tabs Skeleton */}
          <View className="flex-row bg-background dark:bg-background-dark p-1 rounded-xl mb-6 border border-border/40 dark:border-border-dark/40 gap-2">
            <View className="flex-1 h-9 bg-muted/15 dark:bg-muted-dark/15 rounded-lg" />
            <View className="flex-1 h-9 bg-muted/15 dark:bg-muted-dark/15 rounded-lg" />
          </View>

          {/* Label Skeleton */}
          <View className="h-4 w-28 bg-muted/20 dark:bg-muted-dark/20 rounded-md mb-2" />
          {/* Input Skeleton */}
          <View className="h-12 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-xl mb-4" />

          {/* Button Skeleton */}
          <View className="h-11 bg-muted/20 dark:bg-muted-dark/20 rounded-xl mt-6" />
        </View>

        {/* Footer Skeleton */}
        <View className="flex-row justify-center mt-6 animate-pulse">
          <View className="h-4 w-48 bg-muted/15 dark:bg-muted-dark/15 rounded-md" />
        </View>
      </SafeAreaView>
    )
  }
  
  const [identifier, setIdentifier] = useState("")
  const [otp, setOtp] = useState("")
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<Record<string, string>>({})
  const [isSuccess, setIsSuccess] = useState(false)

  const validateEmail = (emailStr: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(emailStr)
  }

  const handleSendOTP = async () => {
    setError(null)
    setValidationError({})

    if (!identifier || (authType === "phone" && identifier.length < 10)) {
      setError(`Please enter a valid ${authType === "phone" ? "10-digit phone number" : "email address"}`)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    if (authType === "email" && !validateEmail(identifier)) {
      setError("Please enter a valid email address")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    try {
      setLoading(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      // 1. Check registration in auth.users via RPC
      const { data: exists, error: fetchError } = await supabase
        .rpc("check_user_exists", {
          p_email: authType === "email" ? identifier.trim() : null,
          p_phone: authType === "phone" ? identifier.trim() : null
        })

      if (fetchError) throw new Error("Server connection error. Please try again.")

      if (!exists) {
        setError(`This ${authType === "email" ? "email" : "mobile number"} is not registered.`)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setLoading(false)
        return
      }

      // 2. Dispatch OTP / Reset Link
      if (authType === "email") {
        const redirectTo =
          Platform.OS === "web"
            ? `${window.location.origin}/reset-password`
            : "staytraq://reset-password"

        const { error: resetError } = await supabase.auth.resetPasswordForEmail(identifier.trim(), {
          redirectTo,
        })
        
        if (resetError) throw resetError
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setIsSuccess(true)
      } else {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          phone: identifier.startsWith("+") ? identifier : `+91${identifier}`,
        })
        
        if (otpError) throw otpError
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setStep("otp")
        setTimeout(() => otpInputRef.current?.focus(), 150)
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOTP = async () => {
    setError(null)
    setValidationError({})

    if (otp.length < 6) {
      setError("Please enter a valid 6-digit OTP")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    try {
      setLoading(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: identifier.startsWith("+") ? identifier : `+91${identifier}`,
        token: otp,
        type: "sms",
      })

      if (verifyError) {
        setError(verifyError.message)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      } else if (data.session) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        router.push("/(auth)/reset-password")
      }
    } catch (err) {
      setError("Verification failed. Please try again.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
  }

  const handleTabChange = (type: "phone" | "email") => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setAuthType(type)
    setIdentifier("")
    setOtp("")
    setStep("initial")
    setError(null)
    setValidationError({})
  }

  // --- EMAIL SUCCESS SCREEN ---
  if (isSuccess) {
    return (
      <View key="forgot-password-success" className="flex-1 bg-background dark:bg-background-dark justify-center px-6 py-12">
        <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-8 rounded-3xl items-center shadow-md w-full">
          <View className="h-16 w-16 bg-success/15 rounded-full items-center justify-center mb-6">
            <CheckCircle2 size={36} color="#10b981" />
          </View>

          <Text className="text-2xl font-extrabold text-foreground dark:text-foreground-dark text-center mb-2">
            Check Your Email
          </Text>
          
          <Text className="text-sm text-muted dark:text-muted-dark text-center mb-6 leading-relaxed">
            Password reset link sent to your email.
          </Text>

          <View className="rounded-2xl border border-border/60 dark:border-border-dark/60 bg-background/50 dark:bg-background-dark/50 px-4 py-3.5 w-full mb-8">
            <Text className="text-center text-sm text-foreground/80 dark:text-foreground-dark/80 font-medium">
              We've sent a password reset link to{" "}
              <Text className="font-bold text-primary">{identifier}</Text>. 
              Please follow the instructions in the email to configure a new password.
            </Text>
          </View>

          <TouchableOpacity 
            onPress={() => router.replace("/(auth)/login")}
            className="bg-primary rounded-xl py-3.5 items-center justify-center w-full shadow-lg shadow-primary/20"
          >
            <Text className="text-white text-base font-bold">Back to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View key="forgot-password-form" className="flex-1 bg-background dark:bg-background-dark">
      <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <View className="w-full px-6 py-10">
          {/* Header */}
          <View className="items-center mb-8">
            <Image
              source={require("../../../assets/images/staytraqlogo.png")}
              style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden" }}
              className="mb-4"
              resizeMode="contain"
            />
            <Text className="text-3xl font-extrabold text-foreground dark:text-foreground-dark tracking-tight text-center">
              Forgot Password?
            </Text>
            <Text className="text-sm text-muted dark:text-muted-dark mt-2 text-center max-w-[280px]">
              {authType === "email" 
                ? "Enter your email address to receive a reset link." 
                : "Enter your phone number to receive a verification code."}
            </Text>
          </View>

          {/* Premium Card */}
          <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-6 rounded-3xl shadow-md">
            {error && (
              <View className="flex-row items-center bg-destructive/10 border border-destructive/20 p-3.5 rounded-xl mb-5">
                <AlertTriangle size={18} color="#ef4444" className="mr-2.5 shrink-0" />
                <Text className="text-destructive text-sm font-semibold flex-1">{error}</Text>
              </View>
            )}

            {/* Dual Recovery Tabs (only on initial step) */}
            {step === "initial" && (
              <View className="flex-row bg-background dark:bg-background-dark p-1 rounded-xl mb-6 border border-border/40 dark:border-border-dark/40">
                <TouchableOpacity
                  onPress={() => handleTabChange("phone")}
                  className="flex-1 py-2.5 rounded-lg items-center flex-row justify-center gap-1.5"
                  style={
                    authType === "phone"
                      ? {
                          backgroundColor: isDark ? "#262936" : "#ffffff",
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.1,
                          shadowRadius: 1.5,
                          elevation: 1,
                        }
                      : undefined
                  }
                >
                  <Phone size={15} color={authType === "phone" ? (isDark ? "#0091ff" : "#0071df") : (isDark ? "#6b7280" : "#9ca3af")} />
                  <Text
                    className="text-sm font-bold"
                    style={{
                      color: authType === "phone"
                        ? (isDark ? "#0091ff" : "#0071df")
                        : (isDark ? "#6b7280" : "#9ca3af"),
                    }}
                  >
                    Phone
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleTabChange("email")}
                  className="flex-1 py-2.5 rounded-lg items-center flex-row justify-center gap-1.5"
                  style={
                    authType === "email"
                      ? {
                          backgroundColor: isDark ? "#262936" : "#ffffff",
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.1,
                          shadowRadius: 1.5,
                          elevation: 1,
                        }
                      : undefined
                  }
                >
                  <Mail size={15} color={authType === "email" ? (isDark ? "#0091ff" : "#0071df") : (isDark ? "#6b7280" : "#9ca3af")} />
                  <Text
                    className="text-sm font-bold"
                    style={{
                      color: authType === "email"
                        ? (isDark ? "#0091ff" : "#0071df")
                        : (isDark ? "#6b7280" : "#9ca3af"),
                    }}
                  >
                    Email
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Input steps */}
            {step === "initial" ? (
              <View key="step-initial" className="gap-4">
                <View>
                  <Text className="text-xs font-bold text-foreground/70 dark:text-foreground-dark/70 uppercase tracking-wider mb-2">
                    {authType === "phone" ? "Phone Number" : "Email Address"}
                  </Text>
                  <View 
                    className="flex-row items-center border rounded-xl px-3 bg-background dark:bg-background-dark h-12"
                    style={{ borderColor: (isDark ? "#262936" : "#e5e7eb") }}
                  >
                    {authType === "phone" ? (
                      <View className="flex-row items-center mr-2">
                        <Phone size={18} color="#9ca3af" className="mr-1.5" />
                        <Text className="text-base font-semibold text-foreground/80 dark:text-foreground-dark/80 mr-1">+91</Text>
                      </View>
                    ) : (
                      <Mail size={18} color="#9ca3af" className="mr-3" />
                    )}
                    <TextInput
                      ref={identifierInput.ref}
                      onFocus={identifierInput.onFocus}
                      value={identifier}
                      onChangeText={(val) => {
                        setIdentifier(authType === "phone" ? val.replace(/\D/g, "").slice(0, 10) : val)
                        setError(null)
                      }}
                      placeholder={authType === "phone" ? "00000 00000" : "name@example.com"}
                      placeholderTextColor="#9ca3af"
                      keyboardType={authType === "phone" ? "phone-pad" : "email-address"}
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="flex-1 text-base text-foreground dark:text-foreground-dark font-medium h-full"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleSendOTP}
                  disabled={loading}
                  className="bg-primary rounded-xl py-3.5 mt-6 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <>
                      <Text className="text-white text-base font-bold mr-2">
                        {authType === "email" ? "Send Reset Link" : "Send OTP"}
                      </Text>
                      <ChevronRight size={18} color="#ffffff" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View key="step-otp" className="items-center">
                <Text className="text-base font-bold text-foreground dark:text-foreground-dark text-center mb-1">
                  Enter Verification Code
                </Text>
                <Text className="text-xs text-muted dark:text-muted-dark text-center mb-6">
                  OTP sent to +91 {identifier}
                </Text>

                {/* Custom Premium OTP Row with Focus Alignment & Overlay Input */}
                <View className="relative w-full max-w-[280px] h-12 mb-4">
                  {/* Visual slots rendered underneath */}
                  <View className="flex-row justify-between w-full h-full" pointerEvents="none">
                    {Array.from({ length: 6 }).map((_, index) => {
                      const isFocused = otp.length === index
                      return (
                        <View
                          key={index}
                          className="w-10 h-full rounded-xl border-2 items-center justify-center bg-background dark:bg-background-dark"
                          style={{
                            borderColor: isFocused ? (isDark ? "#0091ff" : "#0071df") : (isDark ? "#262936" : "#e5e7eb")
                          }}
                        >
                          <Text className="text-xl font-bold text-foreground dark:text-foreground-dark">
                            {otp[index] || ""}
                          </Text>
                        </View>
                      )
                    })}
                  </View>

                  {/* Transparent TextInput overlaying the slots to capture touches natively */}
                  <TextInput
                    ref={otpInputRef}
                    value={otp}
                    onChangeText={(val) => {
                      setOtp(val.replace(/\D/g, "").slice(0, 6))
                      setError(null)
                    }}
                    maxLength={6}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    className="absolute inset-0 opacity-[0.01] bg-transparent text-transparent"
                    caretHidden
                  />
                </View>

                <TouchableOpacity
                  onPress={handleVerifyOTP}
                  disabled={loading}
                  className="bg-primary rounded-xl py-3.5 w-full mt-4 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <>
                      <Text className="text-white text-base font-bold mr-2">Verify & Reset</Text>
                      <ChevronRight size={18} color="#ffffff" />
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setStep("initial")
                    setOtp("")
                  }}
                  className="mt-5 flex-row items-center justify-center gap-1.5"
                >
                  <ArrowLeft size={14} color={isDark ? "#0091ff" : "#0071df"} />
                  <Text className="text-xs text-primary dark:text-primary-foreground/90 font-bold">Change number</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Footer Navigation */}
          <View className="flex-row justify-center mt-6">
            <Text className="text-muted dark:text-muted-dark">Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
              <Text className="text-primary dark:text-primary-foreground/90 font-bold">Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  )
}
