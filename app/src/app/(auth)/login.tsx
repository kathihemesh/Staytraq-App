import { useState } from "react"
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image } from "react-native"
import { useRouter } from "expo-router"
import { useAuth } from "@/context/auth"
import { Eye, EyeOff, Mail, Phone, Lock, ChevronRight, Hotel, AlertTriangle } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"

export default function LoginScreen() {
  const { login } = useAuth()
  const router = useRouter()
  const { isDark } = useTheme()
  
  const identifierInput = useKeyboardAwareInput()
  const passwordInput = useKeyboardAwareInput()
  
  // Web parity: Default to Phone tab
  const [loginType, setLoginType] = useState<"email" | "phone">("phone")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Field validation errors matching web
  const [validationError, setValidationError] = useState<{ identifier?: string; password?: string }>({})

  const validateForm = () => {
    const errors: { identifier?: string; password?: string } = {}
    
    if (!identifier.trim()) {
      errors.identifier = `${loginType === "email" ? "Email" : "Phone number"} is required`
    } else if (loginType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      errors.identifier = "Please enter a valid email address"
    } else if (loginType === "phone" && !/^\d{10}$/.test(identifier.replace(/\D/g, ""))) {
      errors.identifier = "Please enter a valid 10-digit phone number"
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

      const result = await login(identifier.trim(), password, loginType)

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

  const toggleLoginType = (type: "email" | "phone") => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setLoginType(type)
    setIdentifier("")
    setError(null)
    setValidationError({})
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background dark:bg-background-dark"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View className="w-full px-6 py-12">
          {/* Web-parity Branding Header */}
          <View className="items-center mb-8">
            <View className="h-14 w-14 bg-primary rounded-2xl items-center justify-center shadow-lg shadow-primary/30 mb-4">
              <Hotel size={28} color="#ffffff" />
            </View>
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

            {/* Login Type Tabs */}
            <View className="flex-row bg-background dark:bg-background-dark p-1 rounded-xl mb-6 border border-border/40 dark:border-border-dark/40">
              <TouchableOpacity
                onPress={() => toggleLoginType("phone")}
                className="flex-1 py-2.5 rounded-lg items-center flex-row justify-center gap-1.5"
                style={
                  loginType === "phone"
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
                <Phone size={15} color={loginType === "phone" ? (isDark ? "#0091ff" : "#0071df") : (isDark ? "#6b7280" : "#9ca3af")} />
                <Text
                  className="text-sm font-bold"
                  style={{
                    color: loginType === "phone"
                      ? (isDark ? "#0091ff" : "#0071df")
                      : (isDark ? "#6b7280" : "#9ca3af"),
                  }}
                >
                  Phone
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => toggleLoginType("email")}
                className="flex-1 py-2.5 rounded-lg items-center flex-row justify-center gap-1.5"
                style={
                  loginType === "email"
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
                <Mail size={15} color={loginType === "email" ? (isDark ? "#0091ff" : "#0071df") : (isDark ? "#6b7280" : "#9ca3af")} />
                <Text
                  className="text-sm font-bold"
                  style={{
                    color: loginType === "email"
                      ? (isDark ? "#0091ff" : "#0071df")
                      : (isDark ? "#6b7280" : "#9ca3af"),
                  }}
                >
                  Email
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inputs - Isolated Form Trees to prevent layout shifting */}
            {loginType === "phone" ? (
              <View key="phone-form" className="gap-4">
                {/* Mobile Number Input */}
                <View>
                  <Text className="text-xs font-bold text-foreground/70 dark:text-foreground-dark/70 uppercase tracking-wider mb-2">
                    Phone Number
                  </Text>
                  <View 
                    className="flex-row items-center border rounded-xl px-3 bg-background dark:bg-background-dark h-12"
                    style={{ borderColor: validationError.identifier ? "#ef4444" : (isDark ? "#262936" : "#e5e7eb") }}
                  >
                    <View className="flex-row items-center mr-2">
                      <Phone size={18} color="#9ca3af" className="mr-1.5" />
                      <Text className="text-base font-semibold text-foreground/80 dark:text-foreground-dark/80 mr-1">+91</Text>
                    </View>
                    <TextInput
                      ref={identifierInput.ref}
                      onFocus={identifierInput.onFocus}
                      value={identifier}
                      onChangeText={(val) => {
                        setIdentifier(val.replace(/\D/g, "").slice(0, 10))
                        setError(null)
                        setValidationError(prev => ({ ...prev, identifier: undefined }))
                      }}
                      placeholder="00000 00000"
                      placeholderTextColor="#9ca3af"
                      keyboardType="phone-pad"
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

                {/* Action Button */}
                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={loading}
                  className="bg-primary rounded-xl py-3.5 mt-6 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
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
            ) : (
              <View key="email-form" className="gap-4">
                {/* Email Address Input */}
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
                      ref={identifierInput.ref}
                      onFocus={identifierInput.onFocus}
                      value={identifier}
                      onChangeText={(val) => {
                        setIdentifier(val)
                        setError(null)
                        setValidationError(prev => ({ ...prev, identifier: undefined }))
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

                {/* Action Button */}
                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={loading}
                  className="bg-primary rounded-xl py-3.5 mt-6 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
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
            )}
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
