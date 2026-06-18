import { useState, useRef } from "react"
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform } from "react-native"
import { useRouter } from "expo-router"
import { supabase } from "@/lib/supabase"
import { Eye, EyeOff, Mail, Lock, Phone, ChevronRight, Hotel, AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"

export default function SignUpScreen() {
  const router = useRouter()
  const { isDark } = useTheme()
  const otpInputRef = useRef<TextInput>(null)

  const identifierInput = useKeyboardAwareInput()
  const passwordInput = useKeyboardAwareInput()
  const confirmPasswordInput = useKeyboardAwareInput()

  const [authType, setAuthType] = useState<"phone" | "email">("phone")
  const [step, setStep] = useState<"initial" | "otp" | "password">("initial")
  
  const [identifier, setIdentifier] = useState("") // Phone or email
  const [otp, setOtp] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [loading, setLoading] = useState(false)
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

  // --- PHONE FLOW HANDLERS ---
  const handleSendOTP = async () => {
    setError(null)
    setValidationError({})

    if (!identifier || identifier.length < 10) {
      setValidationError({ identifier: "Please enter a valid 10-digit phone number" })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    try {
      setLoading(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      // 1. Check if the mobile number is already registered in pg_owners
      const { data: existingUser, error: fetchError } = await supabase
        .from("pg_owners")
        .select("mobile_number")
        .eq("mobile_number", identifier.trim())
        .maybeSingle()

      if (fetchError) {
        throw new Error("Server error while checking registration")
      }

      if (existingUser) {
        setError("This mobile number is already registered.")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setLoading(false)
        return
      }

      // 2. Request OTP via Supabase
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: identifier.startsWith("+") ? identifier : `+91${identifier}`,
      })

      if (otpError) {
        setError(otpError.message)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setStep("otp")
        // Automatically focus the OTP input after transition
        setTimeout(() => otpInputRef.current?.focus(), 150)
      }
    } catch (err: any) {
      setError(err.message || "Failed to send OTP. Please try again.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOTP = async () => {
    setError(null)
    setValidationError({})

    if (otp.length < 6) {
      setValidationError({ otp: "Please enter a valid 6-digit OTP" })
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
        setStep("password")
      }
    } catch (err: any) {
      setError("Verification failed. Please try again.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
  }

  const handleSetPassword = async () => {
    setError(null)
    setValidationError({})

    const passVal = validatePassword(password)
    if (!passVal.isValid) {
      setValidationError({ password: `Password must contain ${passVal.errors.join(", ")}` })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    if (password !== confirmPassword) {
      setValidationError({ confirmPassword: "Passwords do not match" })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    try {
      setLoading(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) {
        setError(updateError.message)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        router.replace("/onboarding")
      }
    } catch (err) {
      setError("Failed to set password. Please try again.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
  }

  // --- EMAIL FLOW HANDLERS ---
  const handleEmailSignUp = async () => {
    setError(null)
    setValidationError({})
    const errors: Record<string, string> = {}

    if (!identifier.trim() || !validateEmail(identifier)) {
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

      // 1. Check if the email is already registered in pg_owners
      const { data: existingUser, error: fetchError } = await supabase
        .from("pg_owners")
        .select("email")
        .eq("email", identifier.trim())
        .maybeSingle()

      if (fetchError) {
        throw new Error("Server error while checking registration")
      }

      if (existingUser) {
        setError("This email is already registered.")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setLoading(false)
        return
      }

      // 2. Perform Supabase Sign Up
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: identifier.trim(),
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

  const handleTabChange = (type: "phone" | "email") => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setAuthType(type)
    setIdentifier("")
    setOtp("")
    setPassword("")
    setConfirmPassword("")
    setStep("initial")
    setError(null)
    setValidationError({})
  }

  // --- RENDER SUCCESS STATE ---
  if (isSuccess) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark justify-center px-6 py-12">
        <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-8 rounded-3xl items-center shadow-md w-full">
          <View className="h-16 w-16 bg-success/15 rounded-full items-center justify-center mb-6">
            <CheckCircle2 size={36} color="#10b981" />
          </View>
          
          <Text className="text-2xl font-extrabold text-foreground dark:text-foreground-dark text-center mb-2">
            {authType === "email" ? "Check Your Email" : "Account Created!"}
          </Text>
          
          <Text className="text-sm text-muted dark:text-muted-dark text-center mb-6 leading-relaxed">
            {authType === "email" 
              ? "We've sent a verification link to your email." 
              : "Your account has been successfully verified and set up."}
          </Text>

          <View className="rounded-2xl border border-border/60 dark:border-border-dark/60 bg-background/50 dark:bg-background-dark/50 px-4 py-3.5 w-full mb-8">
            <Text className="text-center text-sm text-foreground/80 dark:text-foreground-dark/80 font-medium">
              {authType === "email" ? (
                <>
                  A verification email has been sent to{" "}
                  <Text className="font-bold text-primary">{identifier}</Text>. 
                  Please click the link in the email to confirm your account.
                </>
              ) : (
                <>
                  You can now sign in using your phone number{" "}
                  <Text className="font-bold text-primary">+91 {identifier}</Text>.
                </>
              )}
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
      className="flex-1 bg-background dark:bg-background-dark"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View className="w-full px-6 py-12">
          {/* Header */}
          <View className="items-center mb-8">
            <View className="h-14 w-14 bg-primary rounded-2xl items-center justify-center shadow-lg shadow-primary/30 mb-4">
              <Hotel size={28} color="#ffffff" />
            </View>
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

            {/* Tab list (only shown on initial state) */}
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

            {/* Step Content */}
            {authType === "phone" ? (
              <View key="phone-register-tree" className="gap-4">
                {step === "initial" && (
                  <View key="phone-initial">
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
                          setValidationError({})
                        }}
                        placeholder="00000 00000"
                        placeholderTextColor="#9ca3af"
                        keyboardType="phone-pad"
                        className="flex-1 text-base text-foreground dark:text-foreground-dark font-medium h-full"
                      />
                    </View>
                    {validationError.identifier && (
                      <Text className="text-xs text-destructive mt-1.5 font-semibold">{validationError.identifier}</Text>
                    )}

                    <TouchableOpacity
                      onPress={handleSendOTP}
                      disabled={loading}
                      className="bg-primary rounded-xl py-3.5 mt-6 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
                    >
                      {loading ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <>
                          <Text className="text-white text-base font-bold mr-2">Send OTP</Text>
                          <ChevronRight size={18} color="#ffffff" />
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {step === "otp" && (
                  <View key="phone-otp" className="items-center">
                    <Text className="text-base font-bold text-foreground dark:text-foreground-dark text-center mb-1">
                      Enter Verification Code
                    </Text>
                    <Text className="text-xs text-muted dark:text-muted-dark text-center mb-6">
                      OTP sent to +91 {identifier}
                    </Text>

                    {/* Custom Premium OTP Row with Focus Alignment */}
                    <View className="flex-row justify-between w-full max-w-[280px] mb-4">
                      {Array.from({ length: 6 }).map((_, index) => {
                        const isFocused = otp.length === index
                        const isFilled = otp.length > index
                        return (
                          <TouchableOpacity
                            key={index}
                            activeOpacity={1}
                            onPress={() => otpInputRef.current?.focus()}
                            className="w-10 h-12 rounded-xl border-2 items-center justify-center bg-background dark:bg-background-dark"
                            style={{
                              borderColor: isFocused 
                                ? (isDark ? "#0091ff" : "#0071df")
                                : (validationError.otp ? "#ef4444" : (isDark ? "#262936" : "#e5e7eb"))
                            }}
                          >
                            <Text className="text-xl font-bold text-foreground dark:text-foreground-dark">
                              {otp[index] || ""}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>

                    {/* Hidden Native Input coordinating visual slots */}
                    <TextInput
                      ref={otpInputRef}
                      value={otp}
                      onChangeText={(val) => {
                        setOtp(val.replace(/\D/g, "").slice(0, 6))
                        setValidationError({})
                      }}
                      maxLength={6}
                      keyboardType="number-pad"
                      className="absolute w-1 h-1 opacity-0"
                      caretHidden
                    />

                    {validationError.otp && (
                      <Text className="text-xs text-destructive mt-1 font-semibold text-center mb-4">{validationError.otp}</Text>
                    )}

                    <TouchableOpacity
                      onPress={handleVerifyOTP}
                      disabled={loading}
                      className="bg-primary rounded-xl py-3.5 w-full mt-4 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
                    >
                      {loading ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <>
                          <Text className="text-white text-base font-bold mr-2">Verify OTP</Text>
                          <ChevronRight size={18} color="#ffffff" />
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        setStep("initial")
                        setOtp("")
                        setValidationError({})
                      }}
                      className="mt-5 flex-row items-center justify-center gap-1.5"
                    >
                      <ArrowLeft size={14} color={isDark ? "#0091ff" : "#0071df"} />
                      <Text className="text-xs text-primary dark:text-primary-foreground/90 font-bold">Change number</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {step === "password" && (
                  <View key="phone-password" className="gap-4">
                    {/* Create Password */}
                    <View>
                      <Text className="text-xs font-bold text-foreground/70 dark:text-foreground-dark/70 uppercase tracking-wider mb-2">
                        Create Password
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
                            setValidationError({})
                          }}
                          placeholder="Create strong password"
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

                    {/* Confirm Password */}
                    <View className="mt-2">
                      <Text className="text-xs font-bold text-foreground/70 dark:text-foreground-dark/70 uppercase tracking-wider mb-2">
                        Confirm Password
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
                            setValidationError({})
                          }}
                          placeholder="Confirm password"
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
                      onPress={handleSetPassword}
                      disabled={loading}
                      className="bg-primary rounded-xl py-3.5 w-full mt-4 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
                    >
                      {loading ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <>
                          <Text className="text-white text-base font-bold mr-2">Complete Setup</Text>
                          <ChevronRight size={18} color="#ffffff" />
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <View key="email-register-tree" className="gap-4">
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
                      ref={identifierInput.ref}
                      onFocus={identifierInput.onFocus}
                      value={identifier}
                      onChangeText={(val) => {
                        setIdentifier(val)
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

                {/* Submit Email Registration */}
                <TouchableOpacity
                  onPress={handleEmailSignUp}
                  disabled={loading}
                  className="bg-primary rounded-xl py-3.5 mt-6 items-center flex-row justify-center shadow-lg shadow-primary/20 active:scale-[0.98]"
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
    )
  }
