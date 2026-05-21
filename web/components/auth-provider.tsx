"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"


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

// Public routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/reset-password", "/forgot-password", "/signup"]

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>("unknown")
  const [authReady, setAuthReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const userIdRef = useRef<string | null>(null)
  const logoutInFlightRef = useRef(false)
  const router = useRouter()
  const pathname = usePathname()

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
      // Keep existing state (or unknown) on transient errors to avoid redirect flapping.
      return false
    }
  }, [])

  // Check authentication status on mount and listen for auth changes
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
      } catch {
        // Error getting session
      } finally {
        setAuthReady(true)
      }
      setIsLoading(false)
    }
    
    checkAuth()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        const prevSession = sessionRef.current
        const prevUserId = userIdRef.current

        // If focus/token refresh yields a transient null session, do NOT clear local auth state.
        // Only clear on an explicit SIGNED_OUT event, or when getSession confirms null.
        if (!newSession && event !== "SIGNED_OUT") {
          return
        }

        const nextUserId = newSession?.user?.id ?? null

        sessionRef.current = newSession ?? null
        userIdRef.current = nextUserId

        // Only update authenticated flags on real session transitions.
        if (event === "SIGNED_OUT") {
          setSession(null)
          setUser(null)
          setIsAuthenticated(false)
          setOnboardingStatus("unknown")
          router.replace("/login")
          return
        }

        // SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED with a valid session:
        if (newSession) {
          setSession(newSession)
          setUser(newSession.user)
          setIsAuthenticated(true)

          // Only reset onboarding when the user actually changes.
          if (prevUserId !== nextUserId) {
            setOnboardingStatus("unknown")
          }

          // Re-check onboarding in background.
          // Avoid blocking UI: no global isLoading flip.
          void checkOnboardingStatus(newSession.user.id)
        } else if (prevSession) {
          // Should not happen due to early return above, but keep state stable.
          setSession(prevSession)
          setUser(prevSession.user)
          setIsAuthenticated(true)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [router, checkOnboardingStatus])

  // Note: We intentionally avoid refetch-on-focus (`visibilitychange`) here.
  // Data freshness is handled via Supabase Realtime subscriptions (Rooms/Dashboard),
  // and auth changes are handled via `onAuthStateChange`.

  // Redirect based on auth status
  useEffect(() => {
    // Wait for the initial auth check to complete; otherwise redirects can flap on refresh/focus.
    if (!authReady || isLoading) return

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname) || pathname.startsWith("/pay/")
    const isOnboardingKnown = onboardingStatus !== "unknown"
    const isOnboarded = onboardingStatus === "onboarded"

    if (!isAuthenticated && !isPublicRoute) {
      // Redirect to login if not authenticated and trying to access protected route
      router.push("/login")
    } else if (isAuthenticated) {
      // Avoid redirecting until we know onboarding status to prevent flicker.
      if (!isOnboardingKnown) return

      if (!isOnboarded && !["/onboarding", "/signup", "/forgot-password", "/reset-password"].includes(pathname)) {
        // If authenticated but not onboarded, redirect to onboarding 
        router.push("/onboarding")
      } else if (isOnboarded && (pathname === "/login" || pathname === "/signup" || pathname === "/onboarding")) {
        // If authenticated and onboarded, redirect from public/onboarding routes to dashboard
        router.push("/")
      }
    }
  }, [isAuthenticated, onboardingStatus, authReady, isLoading, pathname, router])

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

      // State + redirects are handled centrally by onAuthStateChange + redirect effect.
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
      // Some environments can intermittently hang on network sign-out.
      // Make logout idempotent + bounded so UI never spins forever.
      await Promise.race([
        // Prefer local sign-out to immediately clear persisted session.
        // (Fallback to default behavior if options aren't supported.)
        (supabase.auth.signOut as any)({ scope: "local" }),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ])
    } catch {
      // Ignore and still clear local state below.
    } finally {
      clearLocalAuth()
      router.replace("/login")
      logoutInFlightRef.current = false
    }
  }, [router])

  const isOnboardingKnown = onboardingStatus !== "unknown"
  const isOnboarded = onboardingStatus === "onboarded"

  return (
    <AuthContext.Provider value={{ isAuthenticated, isOnboarded, isOnboardingKnown, authReady, isLoading, user, session, login, logout, checkOnboardingStatus }}>
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
