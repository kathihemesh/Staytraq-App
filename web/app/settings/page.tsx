"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Building2, Bell, CreditCard, User, Shield, Save, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)

  // Payment Settings State
  const [rentDueDay, setRentDueDay] = useState(1)
  const [gracePeriodDays, setGracePeriodDays] = useState(3)
  const [lateFee, setLateFee] = useState(0)
  
  // UPI Settings State
  const [upiId, setUpiId] = useState("")
  const [upiName, setUpiName] = useState("")
  const [paymentInstructions, setPaymentInstructions] = useState("")
  const [screenshotRequired, setScreenshotRequired] = useState(true)
  const [utrRequired, setUtrRequired] = useState(true)

  // Notification Settings State (Mocked for now as per original)
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [smsNotifications, setSmsNotifications] = useState(false)
  const [autoReminders, setAutoReminders] = useState(true)

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserId(user.id)

      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('owner_id', user.id)
        .single()

      if (error && error.code === 'PGRST116') {
        // No settings found, auto-seed defaults
        const { error: insertError } = await supabase
          .from('settings')
          .insert({ owner_id: user.id })
        
        if (!insertError) {
          // Keep defaults
          return
        }
      } else if (data) {
        setRentDueDay(data.rent_due_day || 1)
        setGracePeriodDays(data.grace_period_days || 3)
        setLateFee(data.late_fee_per_day || 0)
        setUpiId(data.upi_id || "")
        setUpiName(data.upi_name || "")
        setPaymentInstructions(data.payment_instructions || "")
        setScreenshotRequired(data.screenshot_required ?? true)
        setUtrRequired(data.utr_required ?? true)
      }
    } catch (error) {
      console.error("Error fetching settings:", error)
      toast.error("Failed to load settings")
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async () => {
    if (!userId) return

    try {
      setIsSaving(true)
      
      const { error } = await supabase
        .from('settings')
        .update({
          rent_due_day: rentDueDay,
          grace_period_days: gracePeriodDays,
          late_fee_per_day: lateFee,
          upi_id: upiId,
          upi_name: upiName,
          payment_instructions: paymentInstructions,
          screenshot_required: screenshotRequired,
          utr_required: utrRequired
        })
        .eq('owner_id', userId)

      if (error) throw error

      toast.success("Settings saved successfully")
    } catch (error) {
      console.error("Error saving settings:", error)
      toast.error("Failed to save settings")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout title="Settings">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Settings">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Payment Settings */}
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Payment Settings</CardTitle>
                <CardDescription className="mt-0.5">
                  Configure default payment options and UPI details for online payments
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="defaultDueDate" className="text-sm font-medium">Default Due Day</Label>
                <Input 
                  id="defaultDueDate" 
                  type="number" 
                  min="1" 
                  max="31" 
                  value={rentDueDay} 
                  onChange={(e) => setRentDueDay(parseInt(e.target.value) || 1)} 
                  className="bg-muted/50 focus:bg-background" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gracePeriod" className="text-sm font-medium">Grace Period (days)</Label>
                <Input 
                  id="gracePeriod" 
                  type="number" 
                  min="0"
                  value={gracePeriodDays} 
                  onChange={(e) => setGracePeriodDays(parseInt(e.target.value) || 0)} 
                  className="bg-muted/50 focus:bg-background" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lateFee" className="text-sm font-medium">Late Payment Fee</Label>
                <Input 
                  id="lateFee" 
                  type="number" 
                  min="0"
                  value={lateFee} 
                  onChange={(e) => setLateFee(parseInt(e.target.value) || 0)} 
                  className="bg-muted/50 focus:bg-background" 
                />
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">UPI Payment Details (For Public Links)</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="upiId" className="text-sm font-medium">UPI ID / VPA</Label>
                  <Input 
                    id="upiId" 
                    placeholder="e.g., yourname@bank" 
                    value={upiId} 
                    onChange={(e) => setUpiId(e.target.value)} 
                    className="bg-muted/50 focus:bg-background" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upiName" className="text-sm font-medium">Payee Name</Label>
                  <Input 
                    id="upiName" 
                    placeholder="e.g., Rajesh Kumar" 
                    value={upiName} 
                    onChange={(e) => setUpiName(e.target.value)} 
                    className="bg-muted/50 focus:bg-background" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentInstructions" className="text-sm font-medium">Payment Instructions</Label>
                <Textarea
                  id="paymentInstructions"
                  placeholder="Any special instructions for the tenant when paying..."
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  className="min-h-[80px] resize-none bg-muted/50 focus:bg-background"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Verification Requirements</h3>
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Require Payment Screenshot</Label>
                  <p className="text-sm text-muted-foreground">
                    Tenants must upload a screenshot of the payment receipt
                  </p>
                </div>
                <Switch
                  checked={screenshotRequired}
                  onCheckedChange={setScreenshotRequired}
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Require UTR/Reference Number</Label>
                  <p className="text-sm text-muted-foreground">
                    Tenants must provide the transaction reference number
                  </p>
                </div>
                <Switch
                  checked={utrRequired}
                  onCheckedChange={setUtrRequired}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings (Mocked) */}
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Notifications</CardTitle>
                <CardDescription className="mt-0.5">
                  Manage how you receive notifications
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-0">
            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive email alerts for payments and updates
                </p>
              </div>
              <Switch
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">SMS Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Get SMS alerts for important updates
                </p>
              </div>
              <Switch
                checked={smsNotifications}
                onCheckedChange={setSmsNotifications}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Automatic Reminders</Label>
                <p className="text-sm text-muted-foreground">
                  Send automatic payment reminders to tenants
                </p>
              </div>
              <Switch
                checked={autoReminders}
                onCheckedChange={setAutoReminders}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:justify-end">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => fetchSettings()} disabled={isSaving}>Cancel</Button>
          <Button size="lg" className="w-full sm:w-auto" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </div>
    </DashboardLayout>
  )
}

