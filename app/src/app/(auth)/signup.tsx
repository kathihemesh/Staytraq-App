import { useState } from "react"
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/context/auth"
import { Eye, EyeOff, Mail, Lock, ChevronRight, AlertTriangle, CheckCircle2 } from "lucide-react-native"
import Svg, { Path } from "react-native-svg"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  )
}

export default function SignUpScreen() {
  const { authReady, isLoading: isAuthLoading, signInWithGoogle } = useAuth()
  const router = useRouter()
  const { isDark } = useTheme()

  const emailInput = useKeyboardAwareInput()
  const passwordInput = useKeyboardAwareInput()

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

          {/* Label Skeleton */}
          <View className="h-4 w-20 bg-muted/20 dark:bg-muted-dark/20 rounded-md mb-2" />
          {/* Input Skeleton */}
          <View className="h-12 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-xl mb-4" />

          {/* Button Skeleton */}
          <View className="h-11 bg-muted/20 dark:bg-muted-dark/20 rounded-xl mt-6" />

          {/* Divider Skeleton */}
          <View className="flex-row items-center my-5">
            <View className="flex-1 h-px bg-muted/15 dark:bg-muted-dark/15" />
            <View className="h-3 w-6 bg-muted/15 dark:bg-muted-dark/15 rounded mx-4" />
            <View className="flex-1 h-px bg-muted/15 dark:bg-muted-dark/15" />
          </View>

          {/* Google Button Skeleton */}
          <View className="h-11 bg-muted/15 dark:bg-muted-dark/15 rounded-xl" />
        </View>

        {/* Footer Skeleton */}
        <View className="flex-row justify-center mt-6 animate-pulse">
          <View className="h-4 w-48 bg-muted/15 dark:bg-muted-dark/15 rounded-md" />
        </View>
      </SafeAreaView>
    )
  }
  
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<Record<string, string>>({})
  const [isSuccess, setIsSuccess] = useState(false)

  const validateEmail = (emailStr: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(emailStr)
  }

  const validatePassword = (pass: string): { isValid: boolean; errors: string[] } => {
    const errors: string[] = []
    if (pass.length < 8) errors.push("at least 8 characters")
    if (!/\d/.test(pass)) errors.push("at least one number")
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) errors.push("at least one special character")
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }

  const handleEmailSignUp = async () => {
    setError(null)
    setValidationError({})
    const errors: Record<string, string> = {}

    if (!email.trim() || !validateEmail(email)) {
      errors.identifier = "Please enter a valid email address"
    }

    const passVal = validatePassword(password)
    if (!passVal.isValid) {
      errors.password = `Password must contain ${passVal.errors.join(", ")}`
    }

    if (Object.keys(errors).length > 0) {
      setValidationError(errors)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    try {
      setLoading(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      // 1. Check if the email is already registered in auth.users via RPC
      const { data: exists, error: fetchError } = await supabase
        .rpc("check_user_exists", {
          p_email: email.trim(),
          p_phone: null
        })

      if (fetchError) {
        throw new Error("Server error while checking registration")
      }

      if (exists) {
        setError("This email is already registered.")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setLoading(false)
        return
      }

      // 2. Perform Supabase Sign Up
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: "https://staytraq.vercel.app/verified",
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setIsSuccess(true)
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setValidationError({})

    try {
      setGoogleLoading(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      const result = await signInWithGoogle()

      if (!result.success && result.error) {
        setError(result.error)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      } else if (result.success) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }
    } catch (err) {
      setError("Google sign-in failed. Please try again.")
      console.error(err)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setGoogleLoading(false)
    }
  }

  // --- RENDER SUCCESS STATE ---
  if (isSuccess) {
    return (
      <View key="signup-success" className="flex-1 bg-background dark:bg-background-dark justify-center px-6 py-12">
        <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-8 rounded-3xl items-center shadow-md w-full">
          <View className="h-16 w-16 bg-success/15 rounded-full items-center justify-center mb-6">
            <CheckCircle2 size={36} color="#10b981" />
          </View>
          
          <Text className="text-2xl font-extrabold text-foreground dark:text-foreground-dark text-center mb-2">
            Check Your Email
          </Text>
          
          <Text className="text-sm text-muted dark:text-muted-dark text-center mb-6 leading-relaxed">
            We've sent a verification link to your email.
          </Text>

          <View className="rounded-2xl border border-border/60 dark:border-border-dark/60 bg-background/50 dark:bg-background-dark/50 px-4 py-3.5 w-full mb-8">
            <Text className="text-center text-sm text-foreground/80 dark:text-foreground-dark/80 font-medium">
              A verification email has been sent to{" "}
              <Text className="font-bold text-primary">{email}</Text>. 
              Please click the link in the email to confirm your account.
            </Text>
          </View>

          <TouchableOpacity 
            onPress={() => router.replace("/(auth)/login")}
            className="bg-primary rounded-xl py-3.5 items-center justify-center w-full shadow-lg shadow-primary/20"
          >
            <Text className="text-white text-base font-bold">Go to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAwareScrollView
      key="signup-form"
      className="flex-1 bg-background dark:bg-background-dark"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View className="w-full px-6 py-12">
          {/* Header */}
          <View className="items-center mb-8">
            <Image
              source={require("../../../assets/images/staytraqlogo.png")}
              style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden" }}
              className="mb-4"
              resizeMode="contain"
            />
            <Text className="text-3xl font-extrabold text-foreground dark:text-foreground-dark tracking-tight">
              Create Account
            </Text>
            <Text className="text-sm text-muted dark:text-muted-dark mt-2 text-center max-w-[280px]">
              Join Staytraq to manage your PG properties efficiently.
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

            {/* Email Registration Form */}
            <View className="gap-4">
              {/* Email Address */}
              <View>
                <Text className="text-xs font-bold text-foreground/70 dark:text-foreground-dark/70 uppercase tracking-wider mb-2">
                  Email Address
                </Text>
                <View 
                  className="flex-row items-center border rounded-xl px-3 bg-background dark:bg-background-dark h-12"
                  style={{ borderColor: validationError.identifier ? "#ef4444" : (isDark ? "#262936" : "#e5e7eb") }}
                >
                  <Mail size={18} color="#9ca3af" className="mr-3" />
                  <TextInput
                    ref={emailInput.ref}
                    onFocus={emailInput.onFocus}
                    value={email}
                    onChangeText={(val) => {
                      setEmail(val)
                      setError(null)
                      setValidationError(prev => ({ ...prev, identifier: "" }))
                    }}
                    placeholder="name@example.com"
                    placeholderTextColor="#9ca3af"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 text-base text-foreground dark:text-foreground-dark font-medium h-full"
                  />
                </View>
                {validationError.identifier && (
                  <Text className="text-xs text-destructive mt-1.5 font-semibold">{validationError.identifier}</Text>
                )}
              </View>

              {/* Password Input */}
              <View className="mt-2">
                <Text className="text-xs font-bold text-foreground/70 dark:text-foreground-dark/70 uppercase tracking-wider mb-2">
                  Password
                </Text>
                <View 
                  className="flex-row items-center border rounded-xl px-3 bg-background dark:bg-background-dark h-12"
                  style={{ borderColor: validationError.password ? "#ef4444" : (isDark ? "#262936" : "#e5e7eb") }}
                >
                  <Lock size={18} color="#9ca3af" className="mr-3" />
                  <TextInput
                    ref={passwordInput.ref}
                    onFocus={passwordInput.onFocus}
                    value={password}
                    onChangeText={(val) => {
                      setPassword(val)
                      setError(null)
                      setValidationError(prev => ({ ...prev, password: "" }))
                    }}
                    placeholder="Create a strong password"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 text-base text-foreground dark:text-foreground-dark font-medium h-full"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="pl-3">
                    {showPassword ? (
                      <EyeOff size={18} color="#9ca3af" />
                    ) : (
                      <Eye size={18} color="#9ca3af" />
                    )}
                  </TouchableOpacity>
                </View>
                {validationError.password && (
                  <Text className="text-xs text-destructive mt-1.5 font-semibold leading-relaxed">{validationError.password}</Text>
                )}
              </View>

              {/* Sign Up Button */}
              <TouchableOpacity
                onPress={handleEmailSignUp}
                disabled={loading || googleLoading}
                className="bg-primary rounded-xl py-3.5 mt-4 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
                style={{ opacity: loading || googleLoading ? 0.7 : 1 }}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Text className="text-white text-base font-bold mr-2">Sign Up</Text>
                    <ChevronRight size={18} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View className="flex-row items-center my-5">
              <View className="flex-1 h-px bg-border dark:bg-border-dark" />
              <Text className="mx-4 text-xs text-muted dark:text-muted-dark font-medium uppercase tracking-wider">or</Text>
              <View className="flex-1 h-px bg-border dark:bg-border-dark" />
            </View>

            {/* Continue with Google */}
            <TouchableOpacity
              onPress={handleGoogleSignIn}
              disabled={loading || googleLoading}
              className="flex-row items-center justify-center border rounded-xl py-3.5 active:scale-[0.98]"
              style={{
                borderColor: isDark ? "#262936" : "#dadce0",
                backgroundColor: isDark ? "#1a1d2e" : "#ffffff",
                opacity: loading || googleLoading ? 0.7 : 1,
              }}
            >
              {googleLoading ? (
                <ActivityIndicator color={isDark ? "#ffffff" : "#3c4043"} size="small" />
              ) : (
                <>
                  <View style={{ marginRight: 12 }}>
                    <GoogleIcon size={20} />
                  </View>
                  <Text
                    className="text-base font-semibold"
                    style={{ color: isDark ? "#e8eaed" : "#3c4043" }}
                  >
                    Continue with Google
                  </Text>
                </>
              )}
            </TouchableOpacity>
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
    )
  }
