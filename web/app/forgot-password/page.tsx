"use client"

import { useState } from "react"
import Link from "next/link"
import { Building2, AlertCircle, Loader2, CheckCircle2, Mail, Phone, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"


import { ThemeToggle } from "@/components/theme-toggle"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { useRouter } from "next/navigation"

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [authType, setAuthType] = useState<"phone" | "email">("phone")
  const [step, setStep] = useState<"initial" | "otp">("initial")
  const [identifier, setIdentifier] = useState("")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleSendOTP = async () => {
    if (!identifier || (authType === "phone" && identifier.length < 10)) {
      setError(`Please enter a valid ${authType === "phone" ? "10-digit phone number" : "email address"}`)
      return
    }

    if (authType === "email" && !validateEmail(identifier)) {
      setError("Please enter a valid email address")
      return
    }
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      // 1. Check registration in pg_owners
      const { data, error: fetchError } = await supabase
        .from("pg_owners")
        .select(authType === "email" ? "email" : "mobile_number")
        .eq(authType === "email" ? "email" : "mobile_number", identifier.trim())
        .maybeSingle()

      if (fetchError) throw new Error("Server error")

      if (!data) {
        setError(`This ${authType === "email" ? "email" : "mobile number"} is not registered.`)
        setIsSubmitting(false)
        return
      }

      // 2. Send Reset Link/OTP
      if (authType === "email") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(identifier.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (resetError) throw resetError
        setIsSuccess(true)
      } else {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          phone: identifier.startsWith("+") ? identifier : `+91${identifier}`,
        })
        if (otpError) throw otpError
        setStep("otp")
      }
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyOTP = async () => {
    if (otp.length < 6) {
      setError("Please enter a valid 6-digit OTP")
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
        // Redirection to reset-password
        router.push("/reset-password")
      }
    } catch (err: any) {
      setError("Verification failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Show success state for Email
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
                  <span className="font-medium text-foreground">{identifier}</span>
                </p>
              </div>
              <Button 
                variant="outline"
                className="h-11 w-full font-medium"
                onClick={() => window.location.href = "/login"}
              >
                Back to Login
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
              {authType === "email" ? <Mail className="h-6 w-6 text-primary-foreground" /> : <Phone className="h-6 w-6 text-primary-foreground" />}
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Forgot Password?</CardTitle>
            <CardDescription className="text-balance text-muted-foreground">
              {authType === "email" 
                ? "Enter your email address to receive a reset link." 
                : "Enter your phone number to receive a verification code."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (step === "initial" || step === "otp") && (
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
              }} 
              className="w-full"
            >
              {step === "initial" && (
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
              )}

              <div className="mt-6">
                {step === "initial" ? (
                  <div className="space-y-4">
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
                          className={`h-11 ${authType === "phone" ? "pl-12" : ""}`}
                          value={identifier}
                          onChange={(e) => {
                            const value = e.target.value
                            setIdentifier(authType === "phone" ? value.replace(/\D/g, "").slice(0, 10) : value)
                            setError(null)
                          }}
                        />
                      </div>
                    </div>
                    <Button className="w-full h-11 font-medium" onClick={handleSendOTP} disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="animate-spin" /> : authType === "email" ? "Send Reset Link" : "Send OTP"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6 text-center">
                    <div className="space-y-2">
                      <Label>Enter Verification Code</Label>
                      <p className="text-xs text-muted-foreground">
                        OTP sent to +91 {identifier}
                      </p>
                      <div className="flex justify-center py-4">
                        <InputOTP 
                          maxLength={6} 
                          value={otp} 
                          onChange={(val) => {
                            setOtp(val)
                            setError(null)
                          }}
                        >
                          <InputOTPGroup>
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                              <InputOTPSlot key={i} index={i} />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                    </div>
                    <Button className="w-full h-11 font-medium" onClick={handleVerifyOTP} disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="animate-spin" /> : "Verify & Reset"}
                    </Button>
                    <button 
                      onClick={() => setStep("initial")} 
                      className="text-xs text-primary hover:underline"
                    >
                      Change number
                    </button>
                  </div>
                )}
              </div>
            </Tabs>

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
