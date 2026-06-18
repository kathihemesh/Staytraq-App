"use client"

import Link from "next/link"
import { CheckCircle2, ArrowRight, Building, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"

export default function VerifiedPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-8">
        <Link href="/login" className="flex items-center gap-2 rounded-md focus-visible:outline-none">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-primary">
            <Building className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">Staytraq</span>
        </Link>
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <Card className="w-full max-w-[440px] border-border/50 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader className="space-y-2 text-center pb-6">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 shadow-lg shadow-success/5">
              <CheckCircle2 className="h-8 w-8 text-success animate-bounce" />
            </div>
            <CardTitle className="text-3xl font-extrabold tracking-tight">Email Verified!</CardTitle>
            <CardDescription className="text-base text-muted-foreground text-balance">
              Your email address has been successfully verified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-2xl border border-border/80 bg-muted/20 px-4 py-4 text-center">
              <p className="text-sm text-muted-foreground leading-relaxed">
                You can now close this browser tab and return to the Staytraq mobile application to sign in to your owner dashboard.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {/* Primary Mobile App Deep Link CTA */}
              <Button
                asChild
                className="h-12 w-full font-bold transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
              >
                <a href="staytraq://login">
                  <Smartphone className="h-4 w-4" />
                  Open Staytraq App
                </a>
              </Button>

              {/* Secondary Web Login Link */}
              <Button
                variant="outline"
                asChild
                className="h-11 w-full font-medium"
              >
                <Link href="/login" className="flex items-center justify-center gap-1">
                  Continue to Web Portal
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
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
