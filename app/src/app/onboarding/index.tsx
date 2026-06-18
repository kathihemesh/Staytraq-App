import { useState, useEffect } from "react"
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform } from "react-native"
import { useRouter } from "expo-router"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import { User, Building, MapPin, ChevronRight, ChevronLeft, Check } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"

export default function OnboardingScreen() {
  const { user, isOnboarded, isOnboardingKnown, isLoading: isAuthLoading, checkOnboardingStatus, logout } = useAuth()
  const { isDark } = useTheme()
  const router = useRouter()

  const fullNameInput = useKeyboardAwareInput()
  const pgNameInput = useKeyboardAwareInput()
  const addressInput = useKeyboardAwareInput()
  const cityInput = useKeyboardAwareInput()

  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState("")
  const [pgName, setPgName] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ fullName?: string; pgName?: string }>({})

  // Redirect if they are somehow already onboarded
  useEffect(() => {
    if (!isAuthLoading && isOnboardingKnown && isOnboarded) {
      router.replace("/(tabs)")
    }
  }, [isOnboarded, isOnboardingKnown, isAuthLoading])

  const handleNext = () => {
    if (step === 1) {
      if (!fullName.trim()) {
        setErrors({ fullName: "Full name is required" })
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        return
      }
      setErrors({})
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      setError(null)
      setStep(2)
    }
  }

  const handleBack = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setError(null)
    setErrors({})
    setStep(1)
  }

  const isValid = fullName.trim().length > 0 && 
                  pgName.trim().length > 0

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      setStep(1)
      setErrors({ fullName: "Full name is required" })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }
    if (!pgName.trim()) {
      setErrors({ pgName: "PG name is required" })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    setIsSubmitting(true)
    setError(null)
    setErrors({})
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

    try {
      const { error: rpcError } = await supabase.rpc("onboard_new_owner", {
        p_full_name: fullName.trim(),
        p_pg_name: pgName.trim(),
        p_address: address.trim(),
        p_city: city.trim(),
      })

      if (rpcError) throw rpcError

      // Refresh onboarding status globally
      if (user?.id) {
        await checkOnboardingStatus(user.id)
      }
      
      // Auto routing is triggered by the AuthProvider
    } catch (err: any) {
      console.error("Onboarding error:", err)
      setError(err?.message || "Something went wrong. Please try again.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setIsSubmitting(true)
    try {
      await logout()
    } catch (err) {
      console.error("Logout error:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isAuthLoading || !user?.id || !isOnboardingKnown) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark items-center justify-center">
        <ActivityIndicator size="large" color={isDark ? "#0091ff" : "#0071df"} />
        <Text className="text-sm text-muted dark:text-muted-dark mt-3">Loading setup...</Text>
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
            <View className="h-16 w-16 bg-primary rounded-2xl items-center justify-center shadow-lg shadow-primary/30 mb-4">
              <Building size={32} color="#ffffff" />
            </View>
            <Text className="text-3xl font-bold text-foreground dark:text-foreground-dark tracking-tight">
              Staytraq Setup
            </Text>
            <Text className="text-sm text-muted dark:text-muted-dark mt-2 text-center">
              Let's set up your property profile
            </Text>
          </View>

          {/* Stepper indicator */}
          <View className="flex-row justify-center items-center mb-8 gap-2">
            <View className={`h-2.5 rounded-full ${step === 1 ? "w-8 bg-primary" : "w-2.5 bg-border dark:bg-border-dark"}`} />
            <View className={`h-2.5 rounded-full ${step === 2 ? "w-8 bg-primary" : "w-2.5 bg-border dark:bg-border-dark"}`} />
          </View>

          {/* Card */}
          <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-6 rounded-3xl shadow-sm">
            {error && (
              <View className="bg-destructive/10 border border-destructive/20 p-3 rounded-xl mb-4">
                <Text className="text-destructive text-sm font-medium">{error}</Text>
              </View>
            )}

            {step === 1 ? (
              <View className="space-y-4">
                <View className="mb-4">
                  <Text className="text-xl font-semibold text-foreground dark:text-foreground-dark">
                    Tell us about yourself
                  </Text>
                  <Text className="text-sm text-muted dark:text-muted-dark mt-1">
                    Please enter your full name as the property owner
                  </Text>
                </View>

                <View>
                  <Text className="text-xs font-semibold text-muted dark:text-muted-dark uppercase tracking-wider mb-2">
                    Your Full Name
                  </Text>
                  <View 
                    className="flex-row items-center border rounded-xl px-3 bg-background dark:bg-background-dark h-12"
                    style={{ borderColor: errors.fullName ? "#ef4444" : (isDark ? "#262936" : "#e5e7eb") }}
                  >
                    <User size={20} color="#9ca3af" className="mr-3" />
                    <TextInput
                      ref={fullNameInput.ref}
                      onFocus={fullNameInput.onFocus}
                      value={fullName}
                      onChangeText={(txt) => {
                        setFullName(txt)
                        if (txt.trim().length > 0) {
                          setErrors(prev => ({ ...prev, fullName: undefined }))
                        }
                      }}
                      placeholder="e.g. John Doe"
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="words"
                      autoCorrect={false}
                      className="flex-1 text-base text-foreground dark:text-foreground-dark h-full"
                    />
                  </View>
                  {errors.fullName && (
                    <Text className="text-xs text-destructive mt-1.5 font-semibold">
                      {errors.fullName}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  onPress={handleNext}
                  className="bg-primary rounded-xl h-11 mt-6 items-center flex-row justify-center shadow-lg shadow-primary/20"
                >
                  <Text className="text-white text-base font-bold mr-2">Continue</Text>
                  <ChevronRight size={18} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View className="space-y-4">
                <View className="mb-4">
                  <Text className="text-xl font-semibold text-foreground dark:text-foreground-dark">
                    Property Details
                  </Text>
                  <Text className="text-sm text-muted dark:text-muted-dark mt-1">
                    Describe your paying guest (PG) house
                  </Text>
                </View>

                {/* PG Name */}
                <View>
                  <Text className="text-xs font-semibold text-muted dark:text-muted-dark uppercase tracking-wider mb-2">
                    Property / PG Name
                  </Text>
                  <View 
                    className="flex-row items-center border rounded-xl px-3 bg-background dark:bg-background-dark h-12"
                    style={{ borderColor: errors.pgName ? "#ef4444" : (isDark ? "#262936" : "#e5e7eb") }}
                  >
                    <Building size={20} color="#9ca3af" className="mr-3" />
                    <TextInput
                      ref={pgNameInput.ref}
                      onFocus={pgNameInput.onFocus}
                      value={pgName}
                      onChangeText={(txt) => {
                        setPgName(txt)
                        if (txt.trim().length > 0) {
                          setErrors(prev => ({ ...prev, pgName: undefined }))
                        }
                      }}
                      placeholder="e.g. Royal Nest PG"
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="words"
                      autoCorrect={false}
                      className="flex-1 text-base text-foreground dark:text-foreground-dark h-full"
                    />
                  </View>
                  {errors.pgName && (
                    <Text className="text-xs text-destructive mt-1.5 font-semibold">
                      {errors.pgName}
                    </Text>
                  )}
                </View>

                {/* Address */}
                <View className="mt-2">
                  <Text className="text-xs font-semibold text-muted dark:text-muted-dark uppercase tracking-wider mb-2">
                    Complete Address (Optional)
                  </Text>
                  <View className="flex-row items-center border border-border dark:border-border-dark rounded-xl px-3 bg-background dark:bg-background-dark h-12">
                    <MapPin size={20} color="#9ca3af" className="mr-3" />
                    <TextInput
                      ref={addressInput.ref}
                      onFocus={addressInput.onFocus}
                      value={address}
                      onChangeText={setAddress}
                      placeholder="e.g. Flat 302, Sector 15 (Optional)"
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="sentences"
                      className="flex-1 text-base text-foreground dark:text-foreground-dark h-full"
                    />
                  </View>
                </View>

                {/* City */}
                <View className="mt-2">
                  <Text className="text-xs font-semibold text-muted dark:text-muted-dark uppercase tracking-wider mb-2">
                    City (Optional)
                  </Text>
                  <View className="flex-row items-center border border-border dark:border-border-dark rounded-xl px-3 bg-background dark:bg-background-dark h-12">
                    <MapPin size={20} color="#9ca3af" className="mr-3" />
                    <TextInput
                      ref={cityInput.ref}
                      onFocus={cityInput.onFocus}
                      value={city}
                      onChangeText={setCity}
                      placeholder="e.g. Bangalore (Optional)"
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="words"
                      className="flex-1 text-base text-foreground dark:text-foreground-dark h-full"
                    />
                  </View>
                </View>

                {/* Actions */}
                <View className="flex-row gap-3 mt-6">
                  <TouchableOpacity
                    onPress={handleBack}
                    disabled={isSubmitting}
                    className="flex-1 border border-border dark:border-border-dark rounded-xl h-11 items-center flex-row justify-center"
                  >
                    <ChevronLeft size={18} color="#9ca3af" className="mr-2" />
                    <Text className="text-muted dark:text-muted-dark text-base font-bold">Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={!isValid || isSubmitting}
                    className="flex-1 bg-primary rounded-xl h-11 items-center flex-row justify-center shadow-lg shadow-primary/20"
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <>
                        <Text className="text-white text-base font-bold mr-2">Finish</Text>
                        <Check size={18} color="#ffffff" />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Footer Back to Login option */}
          <View className="flex-row justify-center mt-6">
            <TouchableOpacity onPress={handleLogout} disabled={isSubmitting} className="active:opacity-60">
              <Text className="text-primary dark:text-primary-foreground/90 font-bold text-sm">
                Back to Login
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareScrollView>
    )
  }
