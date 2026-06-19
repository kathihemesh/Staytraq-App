import { useEffect, useState } from "react"
import { View, Text, ActivityIndicator, Image } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/context/auth"

export default function AuthCallbackScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  const router = useRouter()
  const [statusText, setStatusText] = useState("Completing sign-in...")
  const [errorText, setErrorText] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function handleCallback() {
      // 1. Check if we already have an active session on mount
      const { data: { session: initialSession } } = await supabase.auth.getSession()
      if (initialSession && active) {
        console.log("[Callback Screen] Session already active on mount. Waiting for router to redirect...")
        return
      }

      if (!code) {
        console.log("[Callback Screen] No code parameter found, routing to login...")
        if (active) router.replace("/(auth)/login")
        return
      }

      try {
        console.log("[Callback Screen] Exchanging code for session...")
        setStatusText("Verifying authorization...")
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
          console.warn("[Callback Screen] exchangeCodeForSession failed, checking if session was established in background:", error.message)
          
          // Re-check session in case the background listener processed it first
          const { data: { session: secondSession } } = await supabase.auth.getSession()
          if (secondSession && active) {
            console.log("[Callback Screen] Active session found. Bypassing error since sign-in succeeded in background.")
            return
          }

          if (active) {
            setErrorText("Authentication failed: " + error.message)
            setTimeout(() => {
              if (active) router.replace("/(auth)/login")
            }, 3000)
          }
          return
        }

        console.log("[Callback Screen] Code exchange success. Waiting for AuthProvider to propagate state and redirect...")
        setStatusText("Setting up your account...")
      } catch (err: any) {
        console.error("[Callback Screen] Exception during callback processing:", err)
        
        // Re-check session in case of a false alarm exception
        const { data: { session: finalSession } } = await supabase.auth.getSession()
        if (finalSession && active) {
          console.log("[Callback Screen] Active session found despite exception. Letting router redirect...")
          return
        }

        if (active) {
          setErrorText("An unexpected error occurred during sign-in.")
          setTimeout(() => {
            if (active) router.replace("/(auth)/login")
          }, 3000)
        }
      }
    }

    handleCallback()

    return () => {
      active = false
    }
  }, [code])

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark justify-center items-center px-6">
      <View className="items-center">
        <Image
          source={require("../../../assets/images/staytraqlogo.png")}
          style={{ width: 80, height: 80, borderRadius: 20, overflow: "hidden" }}
          className="mb-8"
          resizeMode="contain"
        />
        
        {errorText ? (
          <View className="items-center">
            <Text className="text-red-500 font-semibold text-lg text-center mb-2">
              Sign-In Failed
            </Text>
            <Text className="text-muted dark:text-muted-dark text-sm text-center max-w-xs">
              {errorText}
            </Text>
            <Text className="text-muted dark:text-muted-dark text-xs text-center mt-4 opacity-70">
              Redirecting you to login screen...
            </Text>
          </View>
        ) : (
          <View className="items-center">
            <ActivityIndicator size="large" color="#6366f1" className="mb-4" />
            <Text className="text-foreground dark:text-foreground-dark font-medium text-base text-center">
              {statusText}
            </Text>
            <Text className="text-muted dark:text-muted-dark text-xs text-center mt-2 opacity-80">
              Please do not close the app
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}
