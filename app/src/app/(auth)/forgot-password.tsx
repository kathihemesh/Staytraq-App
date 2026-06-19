import { useState } from "react"
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform, Image } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/context/auth"
import { Mail, ChevronRight, AlertTriangle, CheckCircle2 } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"

export default function ForgotPasswordScreen() {
  const { authReady, isLoading: isAuthLoading } = useAuth()
  const router = useRouter()
  const { isDark } = useTheme()
  
  const emailInput = useKeyboardAwareInput()

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
  
  const [email, setEmail] = useState("")
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const validateEmail = (emailStr: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(emailStr)
  }

  const handleSendResetLink = async () => {
    setError(null)

    if (!email.trim() || !validateEmail(email)) {
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
          p_email: email.trim(),
          p_phone: null
        })

      if (fetchError) throw new Error("Server connection error. Please try again.")

      if (!exists) {
        setError("This email is not registered.")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setLoading(false)
        return
      }

      // 2. Send password reset link
      const redirectTo =
        Platform.OS === "web"
          ? `${window.location.origin}/reset-password`
          : "staytraq://reset-password"

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      })
      
      if (resetError) throw resetError
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setIsSuccess(true)
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
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
              <Text className="font-bold text-primary">{email}</Text>. 
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
              Enter your email address to receive a password reset link.
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

            {/* Email Input */}
            <View className="gap-4">
              <View>
                <Text className="text-xs font-bold text-foreground/70 dark:text-foreground-dark/70 uppercase tracking-wider mb-2">
                  Email Address
                </Text>
                <View 
                  className="flex-row items-center border rounded-xl px-3 bg-background dark:bg-background-dark h-12"
                  style={{ borderColor: isDark ? "#262936" : "#e5e7eb" }}
                >
                  <Mail size={18} color="#9ca3af" className="mr-3" />
                  <TextInput
                    ref={emailInput.ref}
                    onFocus={emailInput.onFocus}
                    value={email}
                    onChangeText={(val) => {
                      setEmail(val)
                      setError(null)
                    }}
                    placeholder="name@example.com"
                    placeholderTextColor="#9ca3af"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 text-base text-foreground dark:text-foreground-dark font-medium h-full"
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleSendResetLink}
                disabled={loading}
                className="bg-primary rounded-xl py-3.5 mt-6 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Text className="text-white text-base font-bold mr-2">Send Reset Link</Text>
                    <ChevronRight size={18} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>
            </View>
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
