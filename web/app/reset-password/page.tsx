"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, Eye, EyeOff, AlertCircle, Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"


import { ThemeToggle } from "@/components/theme-toggle"

export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<{ password?: string; confirmPassword?: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null)
  const [isCheckingToken, setIsCheckingToken] = useState(true)

  // Check if the reset token is valid on mount
  useEffect(() => {
    const checkResetToken = async () => {
      try {
        // 1. Check URL Fragment for recovery token first
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get("access_token")
        const type = hashParams.get("type")
        
        // 2. Get the current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        // Scenario A: URL has recovery metadata
        if (type === "recovery" && accessToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: hashParams.get("refresh_token") || "",
          })
          
          if (setSessionError) {
            setIsValidToken(false)
            setError("This password reset link is invalid or has expired.")
          } else {
            setIsValidToken(true)
          }
        } 
        // Scenario B: User has a session (either via recovery link or fresh OTP verification)
        else if (session) {
          setIsValidToken(true)
        }
        // Scenario C: No session and no recovery token in URL
        else if (!session && !accessToken) {
          setIsValidToken(false)
          setError("Access denied. Please use the reset link sent to your email.")
        }
        // Scenario D: Catch-all for session errors
        else if (sessionError) {
          setIsValidToken(false)
          setError("Session error. Please try requesting a new reset link.")
        }
        else {
          // Check if the existing session is a recovery session
          // (Sometimes setSession was already called or persisted)
          if (session) {
            setIsValidToken(true)
          } else {
            setIsValidToken(false)
            setError("Invalid access. Please use the reset link provided in your email.")
          }
        }
      } catch (err) {
        console.error("Error in checkResetToken:", err)
        setIsValidToken(false)
        setError("An unexpected error occurred while verifying your reset link.")
      }
      setIsCheckingToken(false)
    }

    checkResetToken()
  }, [router])

  const validatePassword = (password: string): string | null => {
    if (!password.trim()) {
      return "Password is required"
    }
    if (password.length < 8) {
      return "Password must be at least 8 characters"
    }
    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter"
    }
    if (!/[a-z]/.test(password)) {
      return "Password must contain at least one lowercase letter"
    }
    if (!/[0-9]/.test(password)) {
      return "Password must contain at least one number"
    }
    return null
  }

  const validateForm = () => {
    const errors: { password?: string; confirmPassword?: string } = {}
    
    const passwordError = validatePassword(password)
    if (passwordError) {
      errors.password = passwordError
    }
    
    if (!confirmPassword.trim()) {
      errors.confirmPassword = "Please confirm your password"
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match"
    }
    
    setValidationError(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    if (!validateForm()) {
      return
    }
    
    setIsSubmitting(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) {
        setError(updateError.message || "Failed to update password. Please try again.")
        setIsSubmitting(false)
        return
      }

      // Sign out after password update to force re-login
      await supabase.auth.signOut()
      setIsSuccess(true)
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push("/login")
      }, 2000)
    } catch {
      setError("An unexpected error occurred. Please try again.")
    }
    
    setIsSubmitting(false)
  }

  // Show loading state while checking token
  if (isCheckingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying reset link...</p>
        </div>
      </div>
    )
  }

  // Show invalid token state
  if (isValidToken === false) {
    return (
      <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-muted/30">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-4 sm:px-6 md:px-8">
          <Link 
            href="/login" 
            className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
              <img src="/logo.png" alt="Staytraq Logo" className="h-full w-full object-cover" />
            </div>
            <span className="text-sm font-semibold text-foreground">Staytraq</span>
          </Link>

          <ThemeToggle />
        </header>

        {/* Main Content */}
        <main className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
          <Card className="w-full max-w-[420px] border-border/50 shadow-lg">
            <CardHeader className="space-y-1 px-4 pt-6 text-center sm:px-6">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 sm:h-12 sm:w-12">
                <AlertCircle className="h-5 w-5 text-destructive sm:h-6 sm:w-6" />
              </div>
              <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
                Invalid Reset Link
              </CardTitle>
              <CardDescription className="text-balance text-sm text-muted-foreground">
                This password reset link is invalid or has expired. Please request a new reset link.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-4 pb-6 sm:px-6">
              <Button 
                className="h-11 w-full font-medium transition-all duration-200 hover:shadow-md active:scale-[0.98]"
                onClick={() => router.push("/login")}
              >
                Back to Login
              </Button>
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

  // Show success state
  if (isSuccess) {
    return (
      <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-muted/30">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-4 sm:px-6 md:px-8">
          <Link 
            href="/login" 
            className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
            <img src="/logo.png" alt="Staytraq Logo" className="h-full w-full object-cover" />
          </div>
            <span className="text-sm font-semibold text-foreground">Staytraq</span>
          </Link>

          <ThemeToggle />
        </header>

        {/* Main Content */}
        <main className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
          <Card className="w-full max-w-[420px] border-border/50 shadow-lg">
            <CardHeader className="space-y-1 px-4 pt-6 text-center sm:px-6">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 sm:h-12 sm:w-12">
                <CheckCircle2 className="h-5 w-5 text-success sm:h-6 sm:w-6" />
              </div>
              <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
                Password Updated
              </CardTitle>
              <CardDescription className="text-balance text-sm text-muted-foreground">
                Password updated successfully. Redirecting to login...
              </CardDescription>
            </CardHeader>

            <CardContent className="px-4 pb-6 sm:px-6">
              <Button 
                className="h-11 w-full font-medium transition-all duration-200 hover:shadow-md active:scale-[0.98]"
                onClick={() => router.push("/login")}
              >
                Return to Login
              </Button>
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

  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4 sm:px-6 md:px-8">
        <Link 
          href="/login" 
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
            <img src="/logo.png" alt="Staytraq Logo" className="h-full w-full object-cover" />
          </div>
          <span className="text-sm font-semibold text-foreground">Staytraq</span>
        </Link>

        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
        <Card className="w-full max-w-[420px] border-border/50 shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl overflow-hidden">
              <img src="/logo.png" alt="Staytraq Logo" className="h-full w-full object-cover" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
              Reset Your Password
            </CardTitle>
            <CardDescription className="text-balance text-sm text-muted-foreground">
              Enter a new password to regain access to your account.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 px-4 pb-6 sm:space-y-6 sm:px-6">
            {/* Error Alert */}
            {error && (
              <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-in fade-in-0 slide-in-from-top-1 duration-200">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="font-medium">{error}</p>
              </div>
            )}

            {/* Form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              {/* New Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your new password"
                    autoComplete="new-password"
                    className={`h-11 pr-10 ${validationError.password ? "border-destructive" : ""}`}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setError(null)
                      setValidationError((prev) => ({ ...prev, password: undefined }))
                    }}
                    aria-describedby={validationError.password ? "password-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {validationError.password ? (
                  <p id="password-error" className="text-sm text-destructive">
                    {validationError.password}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Must be at least 8 characters with uppercase, lowercase, and number
                  </p>
                )}
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your new password"
                    autoComplete="new-password"
                    className={`h-11 pr-10 ${validationError.confirmPassword ? "border-destructive" : ""}`}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      setError(null)
                      setValidationError((prev) => ({ ...prev, confirmPassword: undefined }))
                    }}
                    aria-describedby={validationError.confirmPassword ? "confirmPassword-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {validationError.confirmPassword && (
                  <p id="confirmPassword-error" className="text-sm text-destructive">
                    {validationError.confirmPassword}
                  </p>
                )}
              </div>

              {/* Update Password Button */}
              <Button 
                type="submit" 
                className="h-11 w-full font-medium transition-all duration-200 hover:shadow-md active:scale-[0.98]"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating password...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>

            {/* Footer Text */}
            <p className="text-center text-sm text-muted-foreground">
              {"Remember your password? "}
              <Link
                href="/login"
                className="font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              >
                Back to Login
              </Link>
            </p>
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
