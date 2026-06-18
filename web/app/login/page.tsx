"use client"

import { useState } from "react"
import Link from "next/link"
import { Building2, Eye, EyeOff, AlertCircle, Loader2, Phone, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/components/auth-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [authType, setAuthType] = useState<"phone" | "email">("phone")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<{ identifier?: string; password?: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { login, isLoading, isAuthenticated, isOnboardingKnown } = useAuth()

  const validateForm = () => {
    const errors: { identifier?: string; password?: string } = {}
    
    if (!identifier.trim()) {
      errors.identifier = `${authType === "email" ? "Email" : "Phone number"} is required`
    } else if (authType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      errors.identifier = "Please enter a valid email address"
    } else if (authType === "phone" && !/^\d{10}$/.test(identifier.replace(/\D/g, ""))) {
      errors.identifier = "Please enter a valid 10-digit phone number"
    }
    
    if (!password.trim()) {
      errors.password = "Password is required"
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

    const result = await login(identifier, password, authType)
    
    if (!result.success) {
      setError(result.error || "Invalid credentials. Please try again.")
      setIsSubmitting(false)
    }
  }
// ... (rest of the component remains similar, but using authType for labels)


  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-muted/30 animate-in fade-in-0 duration-200">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-4 sm:px-6 md:px-8">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-9 w-9 rounded-md bg-muted animate-pulse" />
        </header>

        {/* Main Content */}
        <main className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
          <Card className="w-full max-w-[420px] border-border/50 shadow-lg">
            <CardHeader className="space-y-1 px-4 pt-6 text-center sm:px-6">
              <div className="mx-auto mb-2 h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-muted animate-pulse" />
              <div className="mx-auto h-6 w-32 rounded bg-muted animate-pulse" />
              <div className="mx-auto h-4 w-64 rounded bg-muted animate-pulse" />
            </CardHeader>

            <CardContent className="space-y-5 px-4 pb-6 sm:space-y-6 sm:px-6">
              <div className="h-10 w-full rounded-lg bg-muted/60 animate-pulse" />

              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                <div className="h-11 w-full rounded-md bg-muted/60 animate-pulse" />
              </div>

              <div className="space-y-2">
                <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                <div className="h-11 w-full rounded-md bg-muted/60 animate-pulse" />
                <div className="flex justify-end pt-1">
                  <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                </div>
              </div>

              <div className="h-11 w-full rounded-md bg-muted animate-pulse mt-6" />

              <div className="space-y-2 pt-2">
                <div className="mx-auto h-4 w-40 rounded bg-muted animate-pulse" />
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

  // Prevent login form flicker during sign-in redirects.
  // Once authenticated, the AuthProvider will redirect to onboarding/dashboard.
  if (isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {isOnboardingKnown ? "Redirecting..." : "Signing you in..."}
          </p>
        </div>
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
          <CardHeader className="space-y-1 px-4 pt-6 text-center sm:px-6">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary sm:h-12 sm:w-12">
              <Building2 className="h-5 w-5 text-primary-foreground sm:h-6 sm:w-6" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
              Welcome Back
            </CardTitle>
            <CardDescription className="text-balance text-sm text-muted-foreground">
              Sign in to manage your PG tenants, rooms, and rent payments.
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
              <Tabs 
                value={authType} 
                onValueChange={(v) => {
                  setAuthType(v as "phone" | "email")
                  setIdentifier("")
                  setValidationError({})
                  setError(null)
                }} 
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="phone" className="gap-2">
                    <Phone className="h-4 w-4" />
                    Phone
                  </TabsTrigger>
                  <TabsTrigger value="email" className="gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </TabsTrigger>
                </TabsList>

                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="identifier">
                      {authType === "phone" ? "Phone Number" : "Email Address"}
                    </Label>
                    <div className="relative">
                      {authType === "phone" && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                          +91
                        </div>
                      )}
                      <Input
                        id="identifier"
                        type={authType === "email" ? "email" : "tel"}
                        placeholder={authType === "email" ? "name@example.com" : "00000 00000"}
                        className={`h-11 ${validationError.identifier ? "border-destructive" : ""} ${authType === "phone" ? "pl-12" : ""}`}
                        value={identifier}
                        onChange={(e) => {
                          const value = e.target.value
                          setIdentifier(authType === "phone" ? value.replace(/\D/g, "").slice(0, 10) : value)
                          setError(null)
                          setValidationError((prev) => ({ ...prev, identifier: undefined }))
                        }}
                      />
                    </div>
                    {validationError.identifier && (
                      <p className="text-sm text-destructive">
                        {validationError.identifier}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        autoComplete="current-password"
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
                      <p className="text-sm text-destructive">
                        {validationError.password}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <Link
                        href="/forgot-password"
                        className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        Forgot Password?
                      </Link>
                    </div>
                  </div>
                </div>
              </Tabs>

              <Button 
                type="submit" 
                className="h-11 w-full font-medium transition-all duration-200 hover:shadow-md"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            {/* Footer Text */}
            <div className="space-y-2">
              <p className="text-center text-sm text-muted-foreground">
                {"Need help? "}
                <button
                  type="button"
                  className="font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                >
                  Contact support
                </button>
              </p>
              <p className="text-center text-sm text-muted-foreground">
                {"New to Staytraq? "}
                <Link
                  href="/signup"
                  className="font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                >
                  Register here
                </Link>
              </p>
            </div>
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
