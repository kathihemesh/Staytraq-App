"use client"

// Mirrors mobile app/src/app/auth/callback.tsx.
// Completes the Google OAuth PKCE exchange and delegates onward navigation
// to `router` + the AuthProvider redirect effect.

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, AlertCircle, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"
import { createClient } from "@/lib/supabase/client"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [statusMessage, setStatusMessage] = useState("Completing sign-in...")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let isActive = true

    const completeSignIn = async () => {
      try {
        // 1. If a session already exists, skip the exchange and let the
        //    AuthProvider finalize the onboarding-aware redirect.
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          if (isActive) router.replace("/")
          return
        }

        // 2. No session: an authorization code must be present to proceed.
        const code = new URLSearchParams(window.location.search).get("code")
        if (!code) {
          if (isActive) router.replace("/login")
          return
        }

        // 3. Exchange the authorization code for a Supabase session.
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          // The exchange failed; re-check in case a session was established
          // concurrently (e.g. via the auth state listener).
          const { data: { session: recheckSession } } = await supabase.auth.getSession()
          if (!recheckSession) {
            if (isActive) {
              setErrorMessage("We couldn't complete your sign-in. Please try again.")
            }
            router.replace("/login")
            return
          }
        }

        // Session established (either by the exchange or the recheck).
        if (isActive) setStatusMessage("Setting up your account...")
      } catch {
        if (isActive) {
          setErrorMessage("We couldn't complete your sign-in. Please try again.")
        }
        router.replace("/login")
      }
    }

    void completeSignIn()

    return () => {
      isActive = false
    }
  }, [router])

  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-8">
        <Link href="/login" className="flex items-center gap-2 rounded-md focus-visible:outline-none">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-primary">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">Staytraq</span>
        </Link>
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <Card className="w-full max-w-[420px] border-border/50 shadow-lg">
          <CardHeader className="space-y-2 text-center">
            {errorMessage ? (
              <>
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">Sign-in failed</CardTitle>
                <CardDescription className="text-sm text-muted-foreground text-balance">
                  {errorMessage}
                </CardDescription>
              </>
            ) : (
              <>
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">Almost there</CardTitle>
                <CardDescription className="text-sm text-muted-foreground text-balance">
                  {statusMessage}
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {errorMessage ? (
              <p className="text-center text-sm text-muted-foreground">
                Redirecting you to the{" "}
                <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
                  login page
                </Link>
                .
              </p>
            ) : (
              <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Please wait</span>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-muted-foreground">
        <p>Staytraq v1.0.0</p>
      </footer>
    </div>
  )
}
