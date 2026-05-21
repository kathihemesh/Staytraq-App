"use client"

import { useState } from "react"
import Link from "next/link"
import { Building2, Eye, EyeOff, AlertCircle, Loader2, CheckCircle2, UserPlus, Phone, Mail, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"


import { ThemeToggle } from "@/components/theme-toggle"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

export default function SignupPage() {
  const supabase = createClient()
  const [showPassword, setShowPassword] = useState(false)
  const [authType, setAuthType] = useState<"phone" | "email">("phone")
  const [step, setStep] = useState<"initial" | "otp" | "password">("initial")
  
  const [identifier, setIdentifier] = useState("") // phone or email
  const [otp, setOtp] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const validatePassword = (pass: string): { isValid: boolean; errors: string[] } => {
    const errors: string[] = []
    if (pass.length < 8) errors.push("at least 8 characters")
    if (!/\d/.test(pass)) errors.push("at least one number")
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) errors.push("at least one special character")
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }

  const handleSendOTP = async () => {
    if (!identifier || identifier.length < 10) {
      setValidationError({ identifier: "Please enter a valid 10-digit phone number" })
      return
    }
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      // 1. Check if the mobile number is already registered
      const { data: existingUser, error: fetchError } = await supabase
        .from("pg_owners")
        .select("mobile_number")
        .eq("mobile_number", identifier.trim())
        .maybeSingle()

      if (fetchError) throw new Error("Server error while checking registration")

      if (existingUser) {
        setError("This mobile number is already registered.")
        setIsSubmitting(false)
        return
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: identifier.startsWith("+") ? identifier : `+91${identifier}`,
      })

      if (otpError) {
        setError(otpError.message)
      } else {
        setStep("otp")
      }
    } catch (err) {
      setError("Failed to send OTP. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyOTP = async () => {
    if (otp.length < 6) {
      setValidationError({ otp: "Please enter a valid 6-digit OTP" })
      return
    }
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: identifier.startsWith("+") ? identifier : `+91${identifier}`,
        token: otp,
        type: 'sms',
      })

      if (verifyError) {
        setError(verifyError.message)
      } else if (data.session) {
        setStep("password")
      }
    } catch (err) {
      setError("Verification failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const errors: Record<string, string> = {}

    if (!identifier.trim() || !validateEmail(identifier)) {
      errors.identifier = "Please enter a valid email address"
    }

    const passVal = validatePassword(password)
    if (!passVal.isValid) {
      errors.password = `Password must contain ${passVal.errors.join(", ")}`
    }

    if (Object.keys(errors).length > 0) {
      setValidationError(errors)
      return
    }

    setIsSubmitting(true)
    try {
      // 1. Check if the email is already registered
      const { data: existingUser, error: fetchError } = await supabase
        .from("pg_owners")
        .select("email")
        .eq("email", identifier.trim())
        .maybeSingle()

      if (fetchError) throw new Error("Server error while checking registration")

      if (existingUser) {
        setError("This email is already registered.")
        setIsSubmitting(false)
        return
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: identifier.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })

      if (signUpError) {
        setError(signUpError.message)
      } else if (data.user) {
        setIsSuccess(true)
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    const passVal = validatePassword(password)
    if (!passVal.isValid) {
      setValidationError({ password: `Password must contain ${passVal.errors.join(", ")}` })
      return
    }

    if (password !== confirmPassword) {
      setValidationError({ confirmPassword: "Passwords do not match" })
      return
    }

    setIsSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) {
        setError(updateError.message)
      } else {
        setIsSuccess(true)
      }
    } catch (err) {
      setError("Failed to set password. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
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
              <CardTitle className="text-2xl font-bold tracking-tight">
                {authType === "email" ? "Check Your Email" : "Account Created!"}
              </CardTitle>
              <CardDescription className="text-balance text-muted-foreground">
                {authType === "email" 
                  ? "We've sent a confirmation link to your email." 
                  : "Your account has been successfully verified and set up."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                <p className="text-center text-sm text-muted-foreground">
                  {authType === "email" ? (
                    <>
                      A verification email has been sent to{" "}
                      <span className="font-medium text-foreground">{identifier}</span>. 
                      Please click the link in the email to confirm your account.
                    </>
                  ) : (
                    <>
                      You can now sign in using your phone number{" "}
                      <span className="font-medium text-foreground">+91 {identifier}</span>.
                    </>
                  )}
                </p>
              </div>
              <Button 
                variant="default"
                className="h-11 w-full font-medium"
                onClick={() => window.location.href = "/login"}
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

            <Tabs 
              value={authType} 
              onValueChange={(v) => {
                setAuthType(v as "phone" | "email")
                setIdentifier("")
                setStep("initial")
                setError(null)
                setValidationError({})
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

              <div className="mt-6">
                {authType === "phone" ? (
                  <div className="space-y-4">
                    {step === "initial" && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="phone">Phone Number</Label>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                              +91
                            </div>
                            <Input
                              id="phone"
                              type="tel"
                              placeholder="00000 00000"
                              className={`h-11 pl-12 ${validationError.identifier ? "border-destructive" : ""}`}
                              value={identifier}
                              onChange={(e) => {
                                setIdentifier(e.target.value.replace(/\D/g, "").slice(0, 10))
                                setValidationError({})
                              }}
                            />
                          </div>
                          {validationError.identifier && (
                            <p className="text-sm text-destructive">{validationError.identifier}</p>
                          )}
                        </div>
                        <Button className="w-full h-11" onClick={handleSendOTP} disabled={isSubmitting}>
                          {isSubmitting ? <Loader2 className="animate-spin" /> : "Send OTP"}
                        </Button>
                      </div>
                    )}

                    {step === "otp" && (
                      <div className="space-y-4 text-center">
                        <Label>Enter Verification Code</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          OTP sent to +91 {identifier}
                        </p>
                        <div className="flex justify-center py-2">
                          <InputOTP 
                            maxLength={6} 
                            value={otp} 
                            onChange={(val) => {
                              setOtp(val)
                              setValidationError({})
                            }}
                          >
                            <InputOTPGroup>
                              {[0, 1, 2, 3, 4, 5].map((i) => (
                                <InputOTPSlot key={i} index={i} />
                              ))}
                            </InputOTPGroup>
                          </InputOTP>
                        </div>
                        {validationError.otp && (
                          <p className="text-sm text-destructive">{validationError.otp}</p>
                        )}
                        <Button className="w-full h-11" onClick={handleVerifyOTP} disabled={isSubmitting}>
                          {isSubmitting ? <Loader2 className="animate-spin" /> : "Verify OTP"}
                        </Button>
                        <button 
                          onClick={() => setStep("initial")} 
                          className="text-xs text-primary hover:underline"
                        >
                          Change number
                        </button>
                      </div>
                    )}

                    {step === "password" && (
                      <form onSubmit={handleSetPassword} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="password">Create Password</Label>
                          <div className="relative">
                            <Input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              className={`h-11 pr-10 ${validationError.password ? "border-destructive" : ""}`}
                              value={password}
                              onChange={(e) => {
                                setPassword(e.target.value)
                                setValidationError({})
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          {validationError.password && (
                            <p className="text-xs text-destructive">{validationError.password}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Confirm Password</Label>
                          <Input
                            id="confirmPassword"
                            type="password"
                            className={`h-11 ${validationError.confirmPassword ? "border-destructive" : ""}`}
                            value={confirmPassword}
                            onChange={(e) => {
                              setConfirmPassword(e.target.value)
                              setValidationError({})
                            }}
                          />
                          {validationError.confirmPassword && (
                            <p className="text-xs text-destructive">{validationError.confirmPassword}</p>
                          )}
                        </div>
                        <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
                          {isSubmitting ? <Loader2 className="animate-spin" /> : "Complete Setup"}
                        </Button>
                      </form>
                    )}
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={handleEmailSignUp}>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        className={`h-11 ${validationError.identifier ? "border-destructive" : ""}`}
                        value={identifier}
                        onChange={(e) => {
                          setIdentifier(e.target.value)
                          setError(null)
                          setValidationError((prev) => ({ ...prev, identifier: "" }))
                        }}
                      />
                      {validationError.identifier && (
                        <p className="text-sm text-destructive">{validationError.identifier}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="email-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Create a strong password"
                          className={`h-11 pr-10 ${validationError.password ? "border-destructive" : ""}`}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value)
                            setError(null)
                            setValidationError((prev) => ({ ...prev, password: "" }))
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground focus-visible:outline-none"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {validationError.password && (
                        <p className="text-xs text-destructive">{validationError.password}</p>
                      )}
                    </div>

                    <Button type="submit" className="h-11 w-full font-medium" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="animate-spin" /> : "Sign Up"}
                    </Button>
                  </form>
                )}
              </div>
            </Tabs>

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
