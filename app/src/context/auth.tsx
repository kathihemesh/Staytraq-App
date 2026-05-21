import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react"
import { router } from "expo-router"
import { supabase } from "@/lib/supabase"
import type { User, Session } from "@supabase/supabase-js"

type OnboardingStatus = "unknown" | "onboarded" | "not_onboarded"

interface AuthContextType {
  isAuthenticated: boolean
  isOnboarded: boolean
  isOnboardingKnown: boolean
  authReady: boolean
  isLoading: boolean
  user: User | null
  session: Session | null
  login: (identifier: string, password: string, type: "email" | "phone") => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  checkOnboardingStatus: (userId: string) => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>("unknown")
  const [authReady, setAuthReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const userIdRef = useRef<string | null>(null)
  const logoutInFlightRef = useRef(false)
  
  const checkOnboardingStatus = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("pg_owners")
        .select("is_onboarded")
        .eq("id", userId)
        .maybeSingle()
      
      const onboarded = !!data?.is_onboarded
      setOnboardingStatus(onboarded ? "onboarded" : "not_onboarded")
      return onboarded
    } catch {
      // Return false but keep state stable on transient errors
      return false
    }
  }, [])

  // Check initial session and subscribe to auth changes
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setIsLoading(true)
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (currentSession) {
          sessionRef.current = currentSession
          userIdRef.current = currentSession.user.id
          setSession(currentSession)
          setUser(currentSession.user)
          setIsAuthenticated(true)
          await checkOnboardingStatus(currentSession.user.id)
        } else {
          sessionRef.current = null
          userIdRef.current = null
          setSession(null)
          setUser(null)
          setIsAuthenticated(false)
          setOnboardingStatus("unknown")
        }
      } catch (error) {
        console.error("Auth check error:", error)
      } finally {
        setAuthReady(true)
        setIsLoading(false)
      }
    }
    
    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        // If it's a transient null session without signed out event, skip clearing
        if (!newSession && event !== "SIGNED_OUT") {
          return
        }

        const prevUserId = userIdRef.current
        const nextUserId = newSession?.user?.id ?? null

        sessionRef.current = newSession ?? null
        userIdRef.current = nextUserId

        if (event === "SIGNED_OUT") {
          setSession(null)
          setUser(null)
          setIsAuthenticated(false)
          setOnboardingStatus("unknown")
          return
        }

        if (newSession) {
          setSession(newSession)
          setUser(newSession.user)
          setIsAuthenticated(true)

          if (prevUserId !== nextUserId) {
            setOnboardingStatus("unknown")
          }

          void checkOnboardingStatus(newSession.user.id)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [checkOnboardingStatus])

  // Central Router redirection logic.
  // Use global router here to avoid depending on a navigation hook context
  // inside a provider that can render before navigator context is available.
  useEffect(() => {
    if (!authReady || isLoading) return
    const isOnboardingKnown = onboardingStatus !== "unknown"
    const isOnboarded = onboardingStatus === "onboarded"

    if (!isAuthenticated) {
      router.replace("/(auth)/login")
    } else {
      // User is authenticated
      if (!isOnboardingKnown) return // Wait for onboarding status fetching to prevent screen flicker

      if (!isOnboarded) {
        router.replace("/onboarding")
      } else {
        router.replace("/(tabs)")
      }
    }
  }, [isAuthenticated, onboardingStatus, authReady, isLoading])

  const login = useCallback(async (identifier: string, password: string, type: "email" | "phone") => {
    try {
      const { error } = await supabase.auth.signInWithPassword(
        type === "email" 
          ? { email: identifier, password } 
          : { phone: identifier.startsWith("+") ? identifier : `+91${identifier}`, password }
      )

      if (error) {
        return { success: false, error: "Invalid credentials. Please try again." }
      }

      return { success: true }
    } catch {
      return { success: false, error: "An unexpected error occurred. Please try again." }
    }
  }, [])

  const logout = useCallback(async () => {
    if (logoutInFlightRef.current) return
    logoutInFlightRef.current = true

    const clearLocalAuth = () => {
      sessionRef.current = null
      userIdRef.current = null
      setSession(null)
      setUser(null)
      setIsAuthenticated(false)
      setOnboardingStatus("unknown")
    }

    try {
      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ])
    } catch {
      // Ignore and force clear
    } finally {
      clearLocalAuth()
      router.replace("/(auth)/login")
      logoutInFlightRef.current = false
    }
  }, [])

  const isOnboardingKnown = onboardingStatus !== "unknown"
  const isOnboarded = onboardingStatus === "onboarded"

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isOnboarded,
      isOnboardingKnown,
      authReady,
      isLoading,
      user,
      session,
      login,
      logout,
      checkOnboardingStatus
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
