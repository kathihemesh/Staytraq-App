"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import { AUTH_MESSAGES } from "@/lib/auth/messages"
import {
  decideAuthRedirect,
  PUBLIC_ROUTES,
  PUBLIC_ROUTE_PREFIXES,
  type OnboardingStatus as RedirectOnboardingStatus,
} from "@/lib/auth/redirect"


import type { User, Session } from "@supabase/supabase-js"

type OnboardingStatus = RedirectOnboardingStatus

interface AuthContextType {
  isAuthenticated: boolean
  isOnboarded: boolean
  isOnboardingKnown: boolean
  authReady: boolean
  isLoading: boolean
  user: User | null
  session: Session | null
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  checkOnboardingStatus: (userId: string) => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Public route helpers (including `/auth/callback`) are sourced from the pure
// redirect helper so the provider and helper stay in lockstep.
function isPublicRoute(normalizedPath: string): boolean {
  return (
    (PUBLIC_ROUTES as readonly string[]).includes(normalizedPath) ||
    (PUBLIC_ROUTE_PREFIXES as readonly string[]).some((prefix) => normalizedPath.startsWith(prefix))
  )
}

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

        if (event === "PASSWORD_RECOVERY") {
          setSession(newSession)
          setUser(newSession?.user ?? null)
          setIsAuthenticated(true)
          router.replace("/reset-password")
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

  // Redirect to reset-password if landing on another page with recovery hash/query
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash
      const search = window.location.search
      const hasRecovery = hash.includes("type=recovery") || search.includes("type=recovery")
      
      if (hasRecovery && !window.location.pathname.startsWith("/reset-password")) {
        router.replace(`/reset-password${hash}${search}`)
      }
    }
  }, [pathname, router])

  // Redirect based on auth status
  useEffect(() => {
    // Wait for the initial auth check to complete; otherwise redirects can flap on refresh/focus.
    if (!authReady || isLoading) return

    const target = decideAuthRedirect({
      isAuthenticated,
      onboardingStatus,
      pathname,
    })

    if (target && target !== pathname) {
      router.push(target)
    }
  }, [isAuthenticated, onboardingStatus, authReady, isLoading, pathname, router])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        return { success: false, error: AUTH_MESSAGES.invalidCredentials }
      }

      // State + redirects are handled centrally by onAuthStateChange + redirect effect.
      return { success: true }
    } catch {
      return { success: false, error: AUTH_MESSAGES.unexpected }
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        // Surface the verbatim Supabase error message.
        return { success: false, error: error.message }
      }

      if (!data?.url) {
        return { success: false, error: AUTH_MESSAGES.googleInitFailed }
      }

      return { success: true }
    } catch {
      return { success: false, error: AUTH_MESSAGES.unexpected }
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

  if (!authReady) {
    const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname

    if (isPublicRoute(normalizedPath)) {
      return (
        <AuthContext.Provider value={{ isAuthenticated, isOnboarded, isOnboardingKnown, authReady, isLoading, user, session, login, signInWithGoogle, logout, checkOnboardingStatus }}>
          {children}
        </AuthContext.Provider>
      )
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isOnboarded, isOnboardingKnown, authReady, isLoading, user, session, login, signInWithGoogle, logout, checkOnboardingStatus }}>
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
