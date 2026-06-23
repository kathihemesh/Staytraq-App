"use client"

import { useState } from "react"
import Link from "next/link"
import { Eye, EyeOff, AlertCircle, Loader2, CheckCircle2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { AUTH_MESSAGES } from "@/lib/auth/messages"
import { validateSignupForm } from "@/lib/auth/validation"

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}

export default function SignupPage() {
  const { isLoading, signInWithGoogle } = useAuth()
  const supabase = createClient()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<{ identifier?: string; password?: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const errors = validateSignupForm(email, password)
    if (Object.keys(errors).length > 0) {
      setValidationError(errors)
      return
    }

    setValidationError({})
    setIsSubmitting(true)
    try {
      // 1. Check if the email is already registered in auth.users via RPC.
      const { data: exists, error: fetchError } = await supabase.rpc("check_user_exists", {
        p_email: email.trim(),
        p_phone: null,
      })

      if (fetchError) {
        setError(AUTH_MESSAGES.serverCheckError)
        setIsSubmitting(false)
        return
      }

      if (exists) {
        setError(AUTH_MESSAGES.emailAlreadyRegistered)
        setIsSubmitting(false)
        return
      }

      // 2. Create the account with an email verification redirect target.
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/verified`,
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        setIsSubmitting(false)
        return
      }

      setIsSuccess(true)
    } catch {
      setError(AUTH_MESSAGES.unexpected)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setGoogleLoading(true)

    const result = await signInWithGoogle()

    if (!result.success) {
      setError(result.error || AUTH_MESSAGES.googleInitFailed)
      setGoogleLoading(false)
    }
    // On success the browser performs a full-page redirect; no need to reset state.
  }

  if (isLoading) {
    return (
      <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-muted/30 animate-in fade-in-0 duration-200">
        <header className="flex items-center justify-between px-6 py-4 sm:px-8">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-9 w-9 rounded-md bg-muted animate-pulse" />
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
          <Card className="w-full max-w-[420px] border-border/50 shadow-lg">
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto mb-2 h-12 w-12 rounded-xl bg-muted animate-pulse" />
              <div className="mx-auto h-6 w-36 rounded bg-muted animate-pulse" />
              <div className="mx-auto h-4 w-64 rounded bg-muted animate-pulse" />
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                <div className="h-11 w-full rounded-md bg-muted/60 animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                <div className="h-11 w-full rounded-md bg-muted/60 animate-pulse" />
              </div>
              <div className="h-11 w-full rounded-md bg-muted animate-pulse mt-4" />
              <div className="pt-2 text-center">
                <div className="mx-auto h-4 w-48 rounded bg-muted animate-pulse" />
              </div>
            </CardContent>
          </Card>
        </main>

        <footer className="py-4 text-center">
          <div className="mx-auto h-3 w-24 rounded bg-muted animate-pulse" />
        </footer>
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-muted/30">
        <header className="flex items-center justify-between px-6 py-4 sm:px-8">
          <Link href="/login" className="flex items-center gap-2 rounded-md focus-visible:outline-none">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
              <img src="/logo.png" alt="Staytraq Logo" className="h-full w-full object-cover" />
            </div>
            <span className="text-sm font-semibold text-foreground">Staytraq</span>
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
          <Card className="w-full max-w-[420px] border-border/50 shadow-lg">
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-success/10">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Check Your Email</CardTitle>
              <CardDescription className="text-balance text-muted-foreground">
                We&apos;ve sent a confirmation link to your email.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                <p className="text-center text-sm text-muted-foreground">
                  A verification email has been sent to{" "}
                  <span className="font-medium text-foreground">{email}</span>. Please click the link
                  in the email to confirm your account.
                </p>
              </div>
              <Button
                variant="default"
                className="h-11 w-full font-medium"
                onClick={() => (window.location.href = "/login")}
              >
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </main>

        <footer className="py-4 text-center text-xs text-muted-foreground">
          <p>Staytraq v1.0.0</p>
        </footer>
      </div>
    )
  }

  const isBusy = isSubmitting || googleLoading

  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-muted/30">
      <header className="flex items-center justify-between px-6 py-4 sm:px-8">
        <Link href="/login" className="flex items-center gap-2 rounded-md focus-visible:outline-none">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
            <img src="/logo.png" alt="Staytraq Logo" className="h-full w-full object-cover" />
          </div>
          <span className="text-sm font-semibold text-foreground">Staytraq</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <Card className="w-full max-w-[420px] border-border/50 shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <UserPlus className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Create an Account</CardTitle>
            <CardDescription className="text-balance text-muted-foreground">
              Join Staytraq to manage your PG properties efficiently.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-in fade-in-0 duration-200">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="font-medium">{error}</p>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleEmailSignUp}>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  className={`h-11 ${validationError.identifier ? "border-destructive" : ""}`}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError(null)
                    setValidationError((prev) => ({ ...prev, identifier: undefined }))
                  }}
                />
                {validationError.identifier && (
                  <p className="text-sm text-destructive">{validationError.identifier}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                    className={`h-11 pr-10 ${validationError.password ? "border-destructive" : ""}`}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setError(null)
                      setValidationError((prev) => ({ ...prev, password: undefined }))
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {validationError.password && (
                  <p className="text-xs text-destructive">{validationError.password}</p>
                )}
              </div>

              <Button type="submit" className="h-11 w-full font-medium" disabled={isBusy}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Sign Up"
                )}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full font-medium"
              onClick={handleGoogleSignIn}
              disabled={isBusy}
            >
              {googleLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <GoogleIcon className="mr-2" />
                  Continue with Google
                </>
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {"Already have an account? "}
              <Link
                href="/login"
                className="font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Sign In
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>

      <footer className="py-4 text-center text-xs text-muted-foreground">
        <p>Staytraq v1.0.0</p>
      </footer>
    </div>
  )
}
