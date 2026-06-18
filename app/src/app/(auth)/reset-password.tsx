import { useEffect, useState } from "react"
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image } from "react-native"
import { useRouter } from "expo-router"
import { supabase } from "@/lib/supabase"
import { Lock, Eye, EyeOff, ChevronRight, Hotel, AlertTriangle, CheckCircle2 } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import * as Linking from "expo-linking"
import useTheme from "@/hooks/use-theme"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"

export default function ResetPasswordScreen() {
  const router = useRouter()
  const { isDark } = useTheme()

  const passwordInput = useKeyboardAwareInput()
  const confirmPasswordInput = useKeyboardAwareInput()

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<{ password?: string; confirmPassword?: string }>({})
  const [isSuccess, setIsSuccess] = useState(false)

  const [isValidToken, setIsValidToken] = useState<boolean | null>(null)
  const [isCheckingToken, setIsCheckingToken] = useState(true)

  // Parse URL hash parameters (Supabase sends recovery credentials inside fragment hashes)
  const parseHashParams = (urlStr: string) => {
    const hashIndex = urlStr.indexOf("#")
    if (hashIndex === -1) return {}
    const hash = urlStr.substring(hashIndex + 1)
    const params: Record<string, string> = {}
    hash.split("&").forEach((pair) => {
      const parts = pair.split("=")
      if (parts.length === 2) {
        params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1])
      }
    })
    return params
  }

  // Handle setting session from recovery token parameters
  const handleRecoverySession = async (accessToken: string, refreshToken: string) => {
    try {
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (setSessionError) {
        setIsValidToken(false)
        setError("This password reset link is invalid or has expired.")
      } else {
        setIsValidToken(true)
      }
    } catch {
      setIsValidToken(false)
      setError("Failed to establish a secure recovery session.")
    }
  }

  useEffect(() => {
    const checkResetToken = async () => {
      setIsCheckingToken(true)
      try {
        // Scenario A: Check initial launch URL for recovery parameters
        const initialUrl = await Linking.getInitialURL()
        if (initialUrl) {
          const hashParams = parseHashParams(initialUrl)
          const queryParams = Linking.parse(initialUrl).queryParams || {}
          
          const accessToken = hashParams.access_token || queryParams.access_token
          const refreshToken = hashParams.refresh_token || queryParams.refresh_token
          const type = hashParams.type || queryParams.type

          if (accessToken && type === "recovery") {
            await handleRecoverySession(accessToken as string, refreshToken as string || "")
            setIsCheckingToken(false)
            return
          }
        }

        // Scenario B: Check if there's an active verified session (e.g. freshly verified phone OTP)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (session) {
          setIsValidToken(true)
        } else if (sessionError) {
          setIsValidToken(false)
          setError("Session error. Please try requesting a new reset link.")
        } else {
          // Scenario C: Access denied
          setIsValidToken(false)
          setError("Access denied. Please use the reset link sent to your email or verify your phone.")
        }
      } catch (err) {
        setIsValidToken(false)
        setError("An unexpected error occurred while verifying your reset session.")
      } finally {
        setIsCheckingToken(false)
      }
    }

    void checkResetToken()

    // Listen for incoming deep link URLs while the app is in background/active
    const handleUrlChange = async (event: { url: string }) => {
      const hashParams = parseHashParams(event.url)
      const queryParams = Linking.parse(event.url).queryParams || {}
      
      const accessToken = hashParams.access_token || queryParams.access_token
      const refreshToken = hashParams.refresh_token || queryParams.refresh_token
      const type = hashParams.type || queryParams.type

      if (accessToken && type === "recovery") {
        setIsCheckingToken(true)
        await handleRecoverySession(accessToken as string, refreshToken as string || "")
        setIsCheckingToken(false)
      }
    }

    const subscription = Linking.addEventListener("url", handleUrlChange)
    return () => subscription.remove()
  }, [])

  // Enforce Next.js password strength validator rules
  const validatePassword = (pass: string): string | null => {
    if (!pass.trim()) {
      return "Password is required"
    }
    if (pass.length < 8) {
      return "Password must be at least 8 characters"
    }
    if (!/[A-Z]/.test(pass)) {
      return "Password must contain at least one uppercase letter"
    }
    if (!/[a-z]/.test(pass)) {
      return "Password must contain at least one lowercase letter"
    }
    if (!/[0-9]/.test(pass)) {
      return "Password must contain at least one number"
    }
    return null
  }

  const validateForm = () => {
    const errors: { password?: string; confirmPassword?: string } = {}
    
    const passwordError = validatePassword(password)
    if (passwordError) {
      errors.password = passwordError
    }
    
    if (!confirmPassword.trim()) {
      errors.confirmPassword = "Please confirm your password"
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match"
    }
    
    setValidationError(errors)
    return Object.keys(errors).length === 0
  }

  const handlePasswordUpdate = async () => {
    setError(null)
    setValidationError({})
    
    if (!validateForm()) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    try {
      setLoading(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      const { error: updateError } = await supabase.auth.updateUser({
        password: password.trim(),
      })

      if (updateError) {
        setError(updateError.message || "Failed to update password. Please try again.")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        
        // Immediately sign out to invalidate recovery session and force fresh login
        await supabase.auth.signOut()
        setIsSuccess(true)
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.replace("/(auth)/login")
        }, 2000)
      }
    } catch {
      setError("An unexpected error occurred. Please try again.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
  }

  // --- RENDER CHECKING TOKEN SCREEN ---
  if (isCheckingToken) {
    return (
      <View key="reset-checking" className="flex-1 bg-background dark:bg-background-dark justify-center items-center px-6">
        <ActivityIndicator size="large" color={isDark ? "#0091ff" : "#0071df"} />
        <Text className="text-sm font-semibold text-muted dark:text-muted-dark mt-4">
          Verifying reset session...
        </Text>
      </View>
    )
  }

  // --- RENDER INVALID TOKEN STATE ---
  if (isValidToken === false) {
    return (
      <View key="reset-invalid" className="flex-1 bg-background dark:bg-background-dark justify-center px-6 py-12">
        <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-8 rounded-3xl items-center shadow-md w-full">
          <View className="h-16 w-16 bg-destructive/15 rounded-full items-center justify-center mb-6">
            <AlertTriangle size={36} color="#ef4444" />
          </View>
          
          <Text className="text-2xl font-extrabold text-foreground dark:text-foreground-dark text-center mb-2">
            Invalid Reset Link
          </Text>
          
          <Text className="text-sm text-muted dark:text-muted-dark text-center mb-8 leading-relaxed">
            {error || "This password reset link is invalid or has expired. Please request a new reset link."}
          </Text>

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

  // --- RENDER SUCCESS REDIRECT STATE ---
  if (isSuccess) {
    return (
      <View key="reset-success" className="flex-1 bg-background dark:bg-background-dark justify-center px-6 py-12">
        <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-8 rounded-3xl items-center shadow-md w-full">
          <View className="h-16 w-16 bg-success/15 rounded-full items-center justify-center mb-6">
            <CheckCircle2 size={36} color="#10b981" />
          </View>
          
          <Text className="text-2xl font-extrabold text-foreground dark:text-foreground-dark text-center mb-2">
            Password Updated
          </Text>
          
          <Text className="text-sm text-muted dark:text-muted-dark text-center mb-8 leading-relaxed">
            Your password was updated successfully. Redirecting you to login...
          </Text>

          <TouchableOpacity 
            onPress={() => router.replace("/(auth)/login")}
            className="bg-primary rounded-xl py-3.5 items-center justify-center w-full shadow-lg shadow-primary/20"
          >
            <Text className="text-white text-base font-bold">Return to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAwareScrollView
      key="reset-form"
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
            <Text className="text-3xl font-extrabold text-foreground dark:text-foreground-dark tracking-tight text-center">
              Reset Your Password
            </Text>
            <Text className="text-sm text-muted dark:text-muted-dark mt-2 text-center max-w-[280px]">
              Enter a new password to regain access to your account.
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

            <View className="gap-4">
              {/* New Password */}
              <View>
                <Text className="text-xs font-bold text-foreground/70 dark:text-foreground-dark/70 uppercase tracking-wider mb-2">
                  New Password
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
                      setValidationError(prev => ({ ...prev, password: undefined }))
                    }}
                    placeholder="Enter your new password"
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
                {validationError.password ? (
                  <Text className="text-xs text-destructive mt-1.5 font-semibold leading-relaxed">{validationError.password}</Text>
                ) : (
                  <Text className="text-xs text-muted dark:text-muted-dark mt-1.5 font-semibold">
                    Must be at least 8 characters with uppercase, lowercase, and number.
                  </Text>
                )}
              </View>

              {/* Confirm Password */}
              <View className="mt-2">
                <Text className="text-xs font-bold text-foreground/70 dark:text-foreground-dark/70 uppercase tracking-wider mb-2">
                  Confirm New Password
                </Text>
                <View 
                  className="flex-row items-center border rounded-xl px-3 bg-background dark:bg-background-dark h-12"
                  style={{ borderColor: validationError.confirmPassword ? "#ef4444" : (isDark ? "#262936" : "#e5e7eb") }}
                >
                  <Lock size={18} color="#9ca3af" className="mr-3" />
                  <TextInput
                    ref={confirmPasswordInput.ref}
                    onFocus={confirmPasswordInput.onFocus}
                    value={confirmPassword}
                    onChangeText={(val) => {
                      setConfirmPassword(val)
                      setError(null)
                      setValidationError(prev => ({ ...prev, confirmPassword: undefined }))
                    }}
                    placeholder="Confirm your new password"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 text-base text-foreground dark:text-foreground-dark font-medium h-full"
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} className="pl-3">
                    {showConfirmPassword ? (
                      <EyeOff size={18} color="#9ca3af" />
                    ) : (
                      <Eye size={18} color="#9ca3af" />
                    )}
                  </TouchableOpacity>
                </View>
                {validationError.confirmPassword && (
                  <Text className="text-xs text-destructive mt-1.5 font-semibold">{validationError.confirmPassword}</Text>
                )}
              </View>

              <TouchableOpacity
                onPress={handlePasswordUpdate}
                disabled={loading}
                className="bg-primary rounded-xl py-3.5 mt-6 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Text className="text-white text-base font-bold mr-2">Update Password</Text>
                    <ChevronRight size={18} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
    )
  }
