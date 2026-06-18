import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react"
import { router, usePathname } from "expo-router"
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
      const fetchPromise = supabase
        .from("pg_owners")
        .select("is_onboarded")
        .eq("id", userId)
        .maybeSingle()

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Onboarding check timeout")), 3500)
      )

      const response = await Promise.race([fetchPromise, timeoutPromise]) as any
      const onboarded = !!response?.data?.is_onboarded
      setOnboardingStatus(onboarded ? "onboarded" : "not_onboarded")
      return onboarded
    } catch (error) {
      console.error("Onboarding status check failed/timed out:", error)
      // Set status to not_onboarded as safe fallback on errors so app doesn't freeze
      setOnboardingStatus("not_onboarded")
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
          // Verify if user still exists and token is valid
          const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
          if (currentUser && !userError) {
            sessionRef.current = currentSession
            userIdRef.current = currentUser.id
            setSession(currentSession)
            setUser(currentUser)
            setIsAuthenticated(true)
            await checkOnboardingStatus(currentUser.id)
          } else {
            // User deleted or session invalid, force clear auth
            await supabase.auth.signOut({ scope: "local" })
            sessionRef.current = null
            userIdRef.current = null
            setSession(null)
            setUser(null)
            setIsAuthenticated(false)
            setOnboardingStatus("unknown")
          }
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

  const pathname = usePathname()

  // Central Router redirection logic.
  // Use global router here to avoid depending on a navigation hook context
  // inside a provider that can render before navigator context is available.
  useEffect(() => {
    if (!authReady || isLoading) return
    const isOnboardingKnown = onboardingStatus !== "unknown"
    const isOnboarded = onboardingStatus === "onboarded"

    const isAuthRoute = pathname.includes("login") || pathname.includes("signup") || pathname.includes("forgot-password") || pathname.includes("reset-password")
    const isOnboardingRoute = pathname.includes("onboarding")

    if (!isAuthenticated) {
      // If not authenticated, only redirect to login if we are not already on an auth screen
      if (!isAuthRoute) {
        router.replace("/(auth)/login")
      }
    } else {
      // User is authenticated
      if (!isOnboardingKnown) return // Wait for onboarding status fetching to prevent screen flicker

      // Do not redirect if they are in the middle of signup or resetting password
      if (pathname.includes("signup") || pathname.includes("reset-password")) {
        return
      }

      if (!isOnboarded) {
        if (!isOnboardingRoute) {
          router.replace("/onboarding")
        }
      } else {
        if (isAuthRoute || isOnboardingRoute || pathname === "/") {
          router.replace("/(tabs)")
        }
      }
    }
  }, [isAuthenticated, onboardingStatus, authReady, isLoading, pathname])

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
