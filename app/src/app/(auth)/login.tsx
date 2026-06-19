import { useState } from "react"
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useAuth } from "@/context/auth"
import { Eye, EyeOff, Mail, Lock, ChevronRight, AlertTriangle } from "lucide-react-native"
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

export default function LoginScreen() {
  const { login, signInWithGoogle, authReady, isLoading: isAuthLoading } = useAuth()
  const router = useRouter()
  const { isDark } = useTheme()
  
  const emailInput = useKeyboardAwareInput()
  const passwordInput = useKeyboardAwareInput()
  
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Field validation errors
  const [validationError, setValidationError] = useState<{ email?: string; password?: string }>({})

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

          {/* Label & Forgot Password Skeleton */}
          <View className="flex-row justify-between items-center mb-2">
            <View className="h-4 w-20 bg-muted/20 dark:bg-muted-dark/20 rounded-md" />
            <View className="h-4 w-24 bg-muted/20 dark:bg-muted-dark/20 rounded-md" />
          </View>
          {/* Input Skeleton */}
          <View className="h-12 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-xl mb-6" />

          {/* Button Skeleton */}
          <View className="h-11 bg-muted/20 dark:bg-muted-dark/20 rounded-xl mt-2" />

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

  const validateForm = () => {
    const errors: { email?: string; password?: string } = {}
    
    if (!email.trim()) {
      errors.email = "Email is required"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Please enter a valid email address"
    }
    
    if (!password.trim()) {
      errors.password = "Password is required"
    }
    
    setValidationError(errors)
    return Object.keys(errors).length === 0
  }

  const handleLogin = async () => {
    setError(null)
    setValidationError({})
    
    if (!validateForm()) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    try {
      setLoading(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      const result = await login(email.trim(), password)

      if (!result.success) {
        setError(result.error || "Invalid credentials. Please try again.")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        // Redirection will be handled automatically by the AuthProvider useEffect
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.")
      console.error(err)
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

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background dark:bg-background-dark"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View className="w-full px-6 py-12">
          {/* Branding Header */}
          <View className="items-center mb-8">
            <Image
              source={require("../../../assets/images/staytraqlogo.png")}
              style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden" }}
              className="mb-4"
              resizeMode="contain"
            />
            <Text className="text-3xl font-extrabold text-foreground dark:text-foreground-dark tracking-tight">
              Welcome Back
            </Text>
            <Text className="text-sm text-muted dark:text-muted-dark mt-2 text-center max-w-[280px]">
              Sign in to manage your PG tenants, rooms, and rent payments.
            </Text>
          </View>

          {/* Premium Card */}
          <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-6 rounded-3xl shadow-md">
            {/* Global Error Display */}
            {error && (
              <View className="flex-row items-center bg-destructive/10 border border-destructive/20 p-3.5 rounded-xl mb-5">
                <AlertTriangle size={18} color="#ef4444" className="mr-2.5 shrink-0" />
                <Text className="text-destructive text-sm font-semibold flex-1">{error}</Text>
              </View>
            )}

            {/* Email Form */}
            <View className="gap-4">
              {/* Email Address Input */}
              <View>
                <Text className="text-xs font-bold text-foreground/70 dark:text-foreground-dark/70 uppercase tracking-wider mb-2">
                  Email Address
                </Text>
                <View 
                  className="flex-row items-center border rounded-xl px-3 bg-background dark:bg-background-dark h-12"
                  style={{ borderColor: validationError.email ? "#ef4444" : (isDark ? "#262936" : "#e5e7eb") }}
                >
                  <Mail size={18} color="#9ca3af" className="mr-3" />
                  <TextInput
                    ref={emailInput.ref}
                    onFocus={emailInput.onFocus}
                    value={email}
                    onChangeText={(val) => {
                      setEmail(val)
                      setError(null)
                      setValidationError(prev => ({ ...prev, email: undefined }))
                    }}
                    placeholder="name@example.com"
                    placeholderTextColor="#9ca3af"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 text-base text-foreground dark:text-foreground-dark font-medium h-full"
                  />
                </View>
                {validationError.email && (
                  <Text className="text-xs text-destructive mt-1.5 font-semibold">{validationError.email}</Text>
                )}
              </View>

              {/* Password Input */}
              <View className="mt-2">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-xs font-bold text-foreground/70 dark:text-foreground-dark/70 uppercase tracking-wider">
                    Password
                  </Text>
                  <TouchableOpacity onPress={() => router.push("/(auth)/forgot-password")}>
                    <Text className="text-xs font-semibold text-primary dark:text-primary-foreground/90">
                      Forgot Password?
                    </Text>
                  </TouchableOpacity>
                </View>
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
                      setValidationError(prev => ({ ...prev, password: undefined }))
                    }}
                    placeholder="Enter your password"
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
                  <Text className="text-xs text-destructive mt-1.5 font-semibold">{validationError.password}</Text>
                )}
              </View>

              {/* Sign In Button */}
              <TouchableOpacity
                onPress={handleLogin}
                disabled={loading || googleLoading}
                className="bg-primary rounded-xl py-3.5 mt-4 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
                style={{ opacity: loading || googleLoading ? 0.7 : 1 }}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Text className="text-white text-base font-bold mr-2">Sign In</Text>
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
            <Text className="text-muted dark:text-muted-dark">New to Staytraq? </Text>
            <TouchableOpacity onPress={() => router.push("/(auth)/signup")}>
              <Text className="text-primary dark:text-primary-foreground/90 font-bold">Register here</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareScrollView>
    )
  }
