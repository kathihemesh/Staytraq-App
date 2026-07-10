import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { router, usePathname } from "expo-router"
import { supabase } from "@/lib/supabase"
import * as WebBrowser from "expo-web-browser"
import * as Linking from "expo-linking"
import type { User, Session } from "@supabase/supabase-js"
import * as SecureStore from "expo-secure-store"

type OnboardingStatus = "unknown" | "onboarded" | "not_onboarded"

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
  activePg: { id: number; pg_name: string } | null
  pgsList: { id: number; pg_name: string }[]
  selectPg: (pgId: number) => Promise<void>
  refreshPgs: () => Promise<void>
  createPg: (pgName: string, address: string, city: string) => Promise<boolean>
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

  const [pgsList, setPgsList] = useState<{ id: number; pg_name: string }[]>([])
  const [activePg, setActivePg] = useState<{ id: number; pg_name: string } | null>(null)

  const refreshPgs = useCallback(async () => {
    if (!userIdRef.current) return
    try {
      const { data, error } = await supabase
        .from("pg_details")
        .select("id, pg_name")
        .eq("owner_id", userIdRef.current)
      
      if (error) throw error
      
      const list = data || []
      setPgsList(list)
      
      if (list.length > 0) {
        const savedIdStr = await SecureStore.getItemAsync("activePgId")
        const savedId = savedIdStr ? parseInt(savedIdStr, 10) : null
        
        let found = list.find(p => p.id === savedId)
        if (!found) {
          found = list[0]
        }
        setActivePg(found)
        await SecureStore.setItemAsync("activePgId", String(found.id))
      } else {
        setActivePg(null)
      }
    } catch (err) {
      console.error("Failed to refresh PGs:", err)
    }
  }, [])

  const selectPg = useCallback(async (pgId: number) => {
    const found = pgsList.find(p => p.id === pgId)
    if (found) {
      setActivePg(found)
      await SecureStore.setItemAsync("activePgId", String(pgId))
    }
  }, [pgsList])

  const createPg = useCallback(async (pgName: string, address: string, city: string) => {
    if (!userIdRef.current) return false
    try {
      // 1. Insert new property
      const { data: newPg, error: pgErr } = await supabase
        .from("pg_details")
        .insert({
          owner_id: userIdRef.current,
          pg_name: pgName.trim(),
          address: address.trim(),
          city: city.trim()
        })
        .select("id, pg_name")
        .single()
      
      if (pgErr) throw pgErr
      if (!newPg) throw new Error("Failed to insert PG details")
      
      // 2. Insert default settings for the new property
      const { error: settingsErr } = await supabase
        .from("settings")
        .insert({
          owner_id: userIdRef.current,
          pg_id: newPg.id,
          rent_due_day: 5,
          default_deposit_fees: 0,
          refund_deposit: 0
        })
      
      if (settingsErr) throw settingsErr
      
      // 3. Refresh list and set new PG as active
      const updatedList = [...pgsList, newPg]
      setPgsList(updatedList)
      setActivePg(newPg)
      await SecureStore.setItemAsync("activePgId", String(newPg.id))
      return true
    } catch (err) {
      console.error("Failed to create PG:", err)
      return false
    }
  }, [pgsList])
  
  const checkOnboardingStatus = useCallback(async (userId: string) => {
    try {
      const fetchPromise = supabase
        .from("pg_owners")
        .select("is_onboarded")
        .eq("id", userId)
        .maybeSingle()

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Onboarding check timeout")), 15000)
      )

      const response = await Promise.race([fetchPromise, timeoutPromise]) as any
      const onboarded = !!response?.data?.is_onboarded
      setOnboardingStatus(onboarded ? "onboarded" : "not_onboarded")

      if (onboarded) {
        // Fetch properties list immediately
        const { data, error } = await supabase
          .from("pg_details")
          .select("id, pg_name")
          .eq("owner_id", userId)
        
        if (!error && data) {
          setPgsList(data)
          if (data.length > 0) {
            const savedIdStr = await SecureStore.getItemAsync("activePgId")
            const savedId = savedIdStr ? parseInt(savedIdStr, 10) : null
            let found = data.find(p => p.id === savedId)
            if (!found) found = data[0]
            setActivePg(found)
            await SecureStore.setItemAsync("activePgId", String(found.id))
          } else {
            setActivePg(null)
          }
        }
      }

      return onboarded
    } catch (error) {
      console.error("Onboarding status check failed/timed out:", error)
      // Safe fallback: assume onboarded on transient network errors/timeouts so users aren't locked out
      setOnboardingStatus("onboarded")
      return true
    }
  }, [])

  // -----------------------------------------------------------------------
  // [Auth] Check initial session and subscribe to auth state changes.
  // This is unchanged from the original implementation.
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // [Router] Central redirection logic — unchanged from original.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!authReady || isLoading) return
    const isOnboardingKnown = onboardingStatus !== "unknown"
    const isOnboarded = onboardingStatus === "onboarded"

    const isAuthRoute = pathname.includes("login") || pathname.includes("signup") || pathname.includes("forgot-password") || pathname.includes("reset-password") || pathname.includes("auth/callback")
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

  // -----------------------------------------------------------------------
  // [Auth] Email + password login — unchanged from original.
  // -----------------------------------------------------------------------
  const login = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        return { success: false, error: "Invalid credentials. Please try again." }
      }

      return { success: true }
    } catch {
      return { success: false, error: "An unexpected error occurred. Please try again." }
    }
  }, [])

  // -----------------------------------------------------------------------
  // [OAuth] Google Sign-In — PKCE flow only
  //
  // 1. Build the redirect URL with Linking.createURL("auth/callback")
  // 2. Call signInWithOAuth with skipBrowserRedirect: true to get the URL
  // 3. Open it with openAuthSessionAsync; the second arg tells the browser
  //    which URL prefix to intercept as "done"
  // 4. If openAuthSessionAsync returns success, extract the "code" and call
  //    exchangeCodeForSession
  // 5. If the browser is dismissed, wait briefly and check if the persistent
  //    Linking handler already established a session
  //
  // All implicit-flow (hash fragment / setSession) logic has been removed.
  // -----------------------------------------------------------------------
  const signInWithGoogle = useCallback(async () => {
    try {
      // Build the redirect URL from the app scheme defined in app.json
      const redirectTo = Linking.createURL("auth/callback")
      console.log("[OAuth] redirectTo =", redirectTo)

      // Ask Supabase for the Google OAuth URL (PKCE challenge is embedded)
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      })

      if (error) {
        console.error("[OAuth] signInWithOAuth error:", error.message)
        return { success: false, error: error.message }
      }

      if (!data?.url) {
        console.error("[OAuth] signInWithOAuth returned no URL")
        return { success: false, error: "Failed to initiate Google sign-in." }
      }

      console.log("[OAuth] Opening auth session with URL:", data.url.substring(0, 120), "...")

      // Open the OAuth URL in an in-app browser (Chrome Custom Tab / ASWebAuth).
      // The second arg (redirectTo) tells the browser to intercept redirects
      // that start with this prefix and return them to the app.
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

      console.log("[OAuth] openAuthSessionAsync result:", JSON.stringify({
        type: result.type,
        url: result.type === "success" ? (result as any).url?.substring(0, 120) : undefined,
      }))

      // -------------------------------------------------------------------
      // Path A: openAuthSessionAsync successfully intercepted the redirect
      // -------------------------------------------------------------------
      if (result.type === "success" && (result as any).url) {
        const callbackUrl: string = (result as any).url
        console.log("[OAuth] Browser returned success — processing callback URL...")
        
        const queryIndex = callbackUrl.indexOf("?")
        if (queryIndex !== -1) {
          const queryParams = new URLSearchParams(callbackUrl.substring(queryIndex + 1))
          const code = queryParams.get("code")
          if (code) {
            console.log("[OAuth] Found code in success redirect. Exchanging...")
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
            if (exchangeError) {
              console.error("[OAuth] Exchange code failed:", exchangeError.message)
              return { success: false, error: exchangeError.message }
            }
            console.log("[OAuth] Exchange code success.")
            return { success: true }
          }
        }
        return { success: false, error: "Authentication failed. No authorization code received." }
      }

      // -------------------------------------------------------------------
      // Path B: Browser was dismissed (cancel / dismiss).
      // The persistent Linking handler (above) may have already caught the
      // deep link and established a session. Wait briefly, then check.
      // -------------------------------------------------------------------
      if (result.type === "cancel" || result.type === "dismiss") {
        console.log("[OAuth] Browser dismissed — waiting for deep link handler...")
        await new Promise((resolve) => setTimeout(resolve, 2500))
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (currentSession) {
          console.log("[OAuth] Session found after dismiss — sign-in succeeded via deep link")
          return { success: true }
        }
        console.log("[OAuth] No session after dismiss — user likely cancelled")
      }

      // User cancelled or redirect was not caught
      return { success: false }
    } catch (err: any) {
      console.error("[OAuth] signInWithGoogle threw:", err)
      return { success: false, error: err.message || "Google sign-in failed. Please try again." }
    }
  }, [])

  // -----------------------------------------------------------------------
  // [Auth] Logout — unchanged from original.
  // -----------------------------------------------------------------------
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
      setPgsList([])
      setActivePg(null)
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
      signInWithGoogle,
      logout,
      checkOnboardingStatus,
      activePg,
      pgsList,
      selectPg,
      refreshPgs,
      createPg
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
