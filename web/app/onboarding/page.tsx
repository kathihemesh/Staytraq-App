"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { createClient } from "@/lib/supabase/client"


import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"
import { Loader2, AlertCircle, Building, User, MapPin } from "lucide-react"
import { toast } from "sonner"
import { runWithNetworkRetry } from "@/lib/networkRetry"

export default function OnboardingPage() {
  const supabase = createClient()
  const { user, isOnboarded, isOnboardingKnown, isLoading: isAuthLoading, checkOnboardingStatus, logout } = useAuth()
  const router = useRouter()

  const [fullName, setFullName] = useState("")
  const [pgName, setPgName] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [statusCheckInFlight, setStatusCheckInFlight] = useState(false)

  // Wait for hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  // If a logged-in user navigates directly to /onboarding, we may not yet know their onboarding status.
  // Proactively resolve it to avoid an infinite loader.
  useEffect(() => {
    if (!mounted) return
    if (isAuthLoading) return
    if (!user?.id) return
    if (isOnboardingKnown) return

    let cancelled = false
    setStatusCheckInFlight(true)
    checkOnboardingStatus(user.id)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStatusCheckInFlight(false)
      })

    return () => {
      cancelled = true
    }
  }, [mounted, isAuthLoading, user?.id, isOnboardingKnown, checkOnboardingStatus])

  // If somehow they get here while onboarded, handle redirect gracefully.
  // The AuthProvider normally handles this, but as an extra measure:
  useEffect(() => {
    if (!isAuthLoading && isOnboardingKnown && isOnboarded) {
      router.replace("/")
    }
  }, [isOnboarded, isOnboardingKnown, isAuthLoading, router])

  const isValid = fullName.trim().length > 0 && 
                  pgName.trim().length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    setIsSubmitting(true)
    setError(null)

    try {
      const { error: rpcError } = await runWithNetworkRetry(async () => {
        return await supabase.rpc("onboard_new_owner", {
          p_full_name: fullName.trim(),
          p_pg_name: pgName.trim(),
          p_address: address.trim(),
          p_city: city.trim(),
        })
      })

      if (rpcError) throw rpcError

      // Refresh onboarding status globally
      if (user?.id) {
        await checkOnboardingStatus(user.id)
      }

      toast.success("Setup complete. Welcome to Staytraq!")
      router.push("/")
    } catch (err: any) {
      console.error("Onboarding error:", err)
      setError(err?.message || "Something went wrong. Please try again.")
      setIsSubmitting(false)
    }
  }

  // Loading / redirect states
  if (!mounted || isAuthLoading) {
    return (
      <div className="flex bg-background min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user?.id) {
    return (
      <div className="flex bg-background min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  if (!isOnboardingKnown || statusCheckInFlight) {
    return (
      <div className="flex bg-background min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking your account...</p>
        </div>
      </div>
    )
  }

  if (isOnboarded) {
    return (
      <div className="flex bg-background min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-primary">
            <Building className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">Staytraq</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[440px] animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="border-border/50 shadow-xl">
            <CardHeader className="space-y-2 text-center pb-6">
              <CardTitle className="text-3xl font-bold tracking-tight">Set up your PG</CardTitle>
              <CardDescription className="text-base">
                Tell us a bit about your property to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-in fade-in-0 duration-200">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                      Owner Info
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <User className="h-4 w-4" />
                      </div>
                      <Input
                        id="fullName"
                        placeholder="Your Full Name"
                        className="pl-10 h-11 bg-muted/50 focus:bg-background transition-colors"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div className="pt-2 space-y-4">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                      PG Details
                    </Label>
                    
                    <div className="space-y-3">
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          <Building className="h-4 w-4" />
                        </div>
                        <Input
                          id="pgName"
                          placeholder="PG / Property Name"
                          className="pl-10 h-11 bg-muted/50 focus:bg-background transition-colors"
                          value={pgName}
                          onChange={(e) => setPgName(e.target.value)}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <Input
                          id="address"
                          placeholder="Complete Address (Optional)"
                          className="pl-10 h-11 bg-muted/50 focus:bg-background transition-colors"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div className="relative">
                        <Input
                          id="city"
                          placeholder="City (Optional)"
                          className="h-11 bg-muted/50 focus:bg-background transition-colors"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 text-sm font-medium mt-6 transition-all hover:scale-[1.02]"
                  disabled={!isValid || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    "Complete Setup"
                  )}
                </Button>
              </form>

              {/* Back to Login */}
              <div className="text-center mt-6">
                <button
                  type="button"
                  onClick={async () => {
                    setIsSubmitting(true)
                    try {
                      await logout()
                    } catch (err) {
                      console.error("Logout error:", err)
                    } finally {
                      setIsSubmitting(false)
                    }
                  }}
                  disabled={isSubmitting}
                  className="text-sm font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm cursor-pointer disabled:opacity-50"
                >
                  Back to Login
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
