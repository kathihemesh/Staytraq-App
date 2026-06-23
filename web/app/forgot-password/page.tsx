"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle, Loader2, CheckCircle2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { validateForgotEmail } from "@/lib/auth/validation"
import { AUTH_MESSAGES } from "@/lib/auth/messages"

export default function ForgotPasswordPage() {
  const { isLoading } = useAuth()
  const supabase = createClient()

  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSendResetLink = async () => {
    const validationError = validateForgotEmail(email)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // 1. Check registration in auth.users via RPC
      const { data: exists, error: fetchError } = await supabase.rpc("check_user_exists", {
        p_email: email.trim(),
        p_phone: null,
      })

      if (fetchError) {
        setError(AUTH_MESSAGES.serverConnectionError)
        setIsSubmitting(false)
        return
      }

      if (!exists) {
        setError(AUTH_MESSAGES.emailNotRegistered)
        setIsSubmitting(false)
        return
      }

      // 2. Send reset link
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (resetError) {
        setError(resetError.message)
        setIsSubmitting(false)
        return
      }

      setIsSuccess(true)
    } catch {
      setError(AUTH_MESSAGES.serverConnectionError)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-muted/30 animate-in fade-in-0 duration-200">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 sm:px-8">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-9 w-9 rounded-md bg-muted animate-pulse" />
        </header>

        {/* Main Content */}
        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
          <Card className="w-full max-w-[420px] border-border/50 shadow-lg">
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto mb-2 h-12 w-12 rounded-xl bg-muted animate-pulse" />
              <div className="mx-auto h-6 w-36 rounded bg-muted animate-pulse" />
              <div className="mx-auto h-4 w-64 rounded bg-muted animate-pulse" />
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Input Skeleton */}
              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                <div className="h-11 w-full rounded-md bg-muted/60 animate-pulse" />
              </div>

              {/* Submit Button Skeleton */}
              <div className="h-11 w-full rounded-md bg-muted animate-pulse mt-4" />

              {/* Footer Text Skeleton */}
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

  // Show success state
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
            <CardHeader className="space-y-1 px-4 pt-6 text-center sm:px-6">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 sm:h-12 sm:w-12">
                <CheckCircle2 className="h-5 w-5 text-success sm:h-6 sm:w-6" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Check Your Email</CardTitle>
              <CardDescription className="text-balance text-muted-foreground">
                Password reset link sent to your email.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 px-4 pb-6 sm:px-6">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 sm:px-4">
                <p className="text-center text-sm text-muted-foreground">
                  {"We've sent a password reset link to "}
                  <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>
              <Button asChild variant="outline" className="h-11 w-full font-medium">
                <Link href="/login">Back to Login</Link>
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
              <Mail className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Forgot Password?</CardTitle>
            <CardDescription className="text-balance text-muted-foreground">
              Enter your email address to receive a reset link.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-in fade-in-0 duration-200">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  className="h-11"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isSubmitting) {
                      handleSendResetLink()
                    }
                  }}
                />
              </div>
              <Button
                className="w-full h-11 font-medium"
                onClick={handleSendResetLink}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : "Send Reset Link"}
              </Button>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/login"
                className="font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Back to Login
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
