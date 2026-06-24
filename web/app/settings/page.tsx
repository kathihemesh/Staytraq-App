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
import { Building2, Bell, CreditCard, User, Shield, Save, Loader2, Bot, Smartphone, Trash2, Wifi, WifiOff, QrCode, AlertCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)

  // Chatbot settings state
  const [chatbotStatusLoading, setChatbotStatusLoading] = useState(true)
  const [instanceExists, setInstanceExists] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("not_created")
  const [chatbotPhoneNumber, setChatbotPhoneNumber] = useState<string | null>(null)
  const [qrCodeData, setQrCodeData] = useState<string | null>(null)
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true)
  const [isProcessingChatbot, setIsProcessingChatbot] = useState(false)

  const fetchChatbotStatus = useCallback(async (silent = false) => {
    try {
      if (!silent) setChatbotStatusLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Load pg_owners data for auto_reply_enabled
      const { data: ownerData } = await supabase
        .from("pg_owners")
        .select("auto_reply_enabled")
        .eq("id", session.user.id)
        .single()

      if (ownerData) {
        setAutoReplyEnabled(ownerData.auto_reply_enabled ?? true)
      }

      const chatbotApiUrl = process.env.NEXT_PUBLIC_CHATBOT_API_URL || "http://localhost:8000"
      const res = await fetch(`${chatbotApiUrl}/api/v1/chatbot/status`, {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })
      if (res.ok) {
        const statusData = await res.json()
        setInstanceExists(statusData.exists)
        setConnectionStatus(statusData.connectionStatus)
        setChatbotPhoneNumber(statusData.phoneNumber)
        setQrCodeData(statusData.qrCode)
      }
    } catch (err) {
      console.error("Failed to load chatbot status:", err)
    } finally {
      if (!silent) setChatbotStatusLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchChatbotStatus()
  }, [fetchChatbotStatus])

  // Polling for QR Code scanning / connection status
  useEffect(() => {
    if (connectionStatus !== "connected" && instanceExists) {
      const interval = setInterval(() => {
        fetchChatbotStatus(true)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [connectionStatus, instanceExists, fetchChatbotStatus])

  const handleCreateChatbot = async () => {
    try {
      setIsProcessingChatbot(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const chatbotApiUrl = process.env.NEXT_PUBLIC_CHATBOT_API_URL || "http://localhost:8000"
      const res = await fetch(`${chatbotApiUrl}/api/v1/chatbot/create`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        setInstanceExists(true)
        setConnectionStatus("disconnected")
        setQrCodeData(data.qrCode)
        toast.success("Instance created successfully. Scan the QR code to pair.")
      } else {
        const err = await res.json()
        toast.error(err.detail || "Failed to create chatbot instance")
      }
    } catch (err) {
      console.error("Error creating chatbot:", err)
      toast.error("Failed to create chatbot instance")
    } finally {
      setIsProcessingChatbot(false)
    }
  }

  const handleDeleteChatbot = async () => {
    try {
      setIsProcessingChatbot(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const chatbotApiUrl = process.env.NEXT_PUBLIC_CHATBOT_API_URL || "http://localhost:8000"
      const res = await fetch(`${chatbotApiUrl}/api/v1/chatbot/delete`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })
      if (res.ok) {
        setInstanceExists(false)
        setConnectionStatus("not_created")
        setChatbotPhoneNumber(null)
        setQrCodeData(null)
        toast.success("Chatbot instance deleted successfully.")
      } else {
        toast.error("Failed to delete chatbot instance.")
      }
    } catch (err) {
      console.error("Error deleting chatbot:", err)
      toast.error("Failed to delete chatbot instance.")
    } finally {
      setIsProcessingChatbot(false)
    }
  }

  const handleToggleAutoReply = async (checked: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setAutoReplyEnabled(checked)

      const { error } = await supabase
        .from("pg_owners")
        .update({ auto_reply_enabled: checked })
        .eq("id", user.id)

      if (error) throw error
      toast.success(checked ? "AI Auto-replies enabled" : "AI Auto-replies disabled")
    } catch (err) {
      console.error("Error toggling auto reply:", err)
      toast.error("Failed to save auto-reply settings")
      setAutoReplyEnabled(!checked) // rollback
    }
  }

  // Payment Settings State
  const [rentDueDay, setRentDueDay] = useState(1)
  const [gracePeriodDays, setGracePeriodDays] = useState(3)
  const [defaultDepositFees, setDefaultDepositFees] = useState(0)
  const [refundDeposit, setRefundDeposit] = useState(0)
  
  // UPI Settings State
  const [upiId, setUpiId] = useState("")
  const [upiName, setUpiName] = useState("")
  const [paymentInstructions, setPaymentInstructions] = useState("")
  const [isMerchant, setIsMerchant] = useState(false)

  const handleDepositFeesChange = (val: number) => {
    setDefaultDepositFees(val)
    if (!isNaN(val)) {
      setRefundDeposit(Math.round(val * 0.5))
    } else {
      setRefundDeposit(0)
    }
  }

  // Notification Settings State (Mocked for now as per original)
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [smsNotifications, setSmsNotifications] = useState(false)
  const [autoReminders, setAutoReminders] = useState(true)

  const detectMerchantUpi = (vpa: string): boolean => {
    if (!vpa) return false
    const lower = vpa.trim().toLowerCase()
    const merchantHandles = [
      "okbiz", "okbizaxis", "okbizsbi", "okbizicici", "okbizhdfc",
      "merchant", "business", "store", "shop", "paytmmerchant", 
      "hdfcmerchant", "icicimerchant", "axismap", "okhdfcbank",
      "vyapar"
    ]
    const parts = lower.split("@")
    if (parts.length === 2) {
      const handle = parts[1]
      if (merchantHandles.some(mh => handle.startsWith(mh))) return true
    }
    return (
      lower.includes("merchant") || lower.includes("biz") ||
      lower.includes("business") || lower.includes("store") ||
      lower.includes("shop") || lower.includes("vyapar")
    )
  }

  const handleUpiIdChange = (val: string) => {
    setUpiId(val)
    setIsMerchant(detectMerchantUpi(val))
  }

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
        setDefaultDepositFees(data.default_deposit_fees || 0)
        setRefundDeposit(data.refund_deposit || 0)
        setUpiId(data.upi_id || "")
        setUpiName(data.upi_name || "")
        setPaymentInstructions(data.payment_instructions || "")
        setIsMerchant(data.is_merchant ?? false)
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
          default_deposit_fees: defaultDepositFees,
          refund_deposit: refundDeposit,
          upi_id: upiId,
          upi_name: upiName,
          payment_instructions: paymentInstructions,
          is_merchant: isMerchant
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
            <div className="grid gap-4 sm:grid-cols-4">
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
                <Label htmlFor="defaultDepositFees" className="text-sm font-medium">Default Deposit Fees</Label>
                <Input 
                  id="defaultDepositFees" 
                  type="number" 
                  min="0"
                  value={defaultDepositFees} 
                  onChange={(e) => handleDepositFeesChange(parseInt(e.target.value) || 0)} 
                  className="bg-muted/50 focus:bg-background" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="refundDeposit" className="text-sm font-medium">Refund Deposit</Label>
                <Input 
                  id="refundDeposit" 
                  type="number" 
                  min="0"
                  value={refundDeposit} 
                  onChange={(e) => setRefundDeposit(parseInt(e.target.value) || 0)} 
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
                    onChange={(e) => handleUpiIdChange(e.target.value)} 
                    className="bg-muted/50 focus:bg-background" 
                  />
                  <div className="flex items-center space-x-2 pt-1">
                    <Switch
                      id="isMerchant"
                      checked={isMerchant}
                      onCheckedChange={setIsMerchant}
                    />
                    <Label htmlFor="isMerchant" className="text-xs font-normal text-muted-foreground cursor-pointer">
                      This is a verified business merchant account (enable transaction tracking)
                    </Label>
                  </div>
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


          </CardContent>
        </Card>

        {/* WhatsApp Chatbot Settings */}
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">WhatsApp Chatbot Assistant</CardTitle>
                <CardDescription className="mt-0.5">
                  Automate tenant replies and complaints via WhatsApp integration
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {chatbotStatusLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Checking chatbot status...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. Connection Status Banner */}
                <div className="flex flex-col gap-4 rounded-xl border border-muted bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${
                          connectionStatus === "connected"
                            ? "bg-green-500 animate-pulse"
                            : connectionStatus === "connecting"
                            ? "bg-yellow-500 animate-pulse"
                            : "bg-red-500"
                        }`} />
                        <span className="text-sm font-bold capitalize">
                          {connectionStatus === "not_created" ? "Not Configured" : connectionStatus}
                        </span>
                      </div>
                      {chatbotPhoneNumber && (
                        <span className="text-xs text-muted-foreground">
                          ({chatbotPhoneNumber})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-normal">
                      {connectionStatus === "connected"
                        ? "Your chatbot assistant is online and responding to messages."
                        : connectionStatus === "disconnected"
                        ? "Instance exists but is not connected. Scan the QR code to pair WhatsApp."
                        : connectionStatus === "connecting"
                        ? "Initializing connection. Please wait..."
                        : "Create an instance to start using the WhatsApp chatbot."}
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    {connectionStatus === "not_created" && (
                      <Button 
                        type="button" 
                        size="sm"
                        disabled={isProcessingChatbot}
                        onClick={handleCreateChatbot}
                      >
                        {isProcessingChatbot && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Chatbot
                      </Button>
                    )}
                    {instanceExists && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        className="text-destructive border-destructive hover:bg-destructive/10"
                        disabled={isProcessingChatbot}
                        onClick={handleDeleteChatbot}
                      >
                        {isProcessingChatbot && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Delete Chatbot
                      </Button>
                    )}
                  </div>
                </div>

                {/* 2. QR Code Pairing Section (If Disconnected) */}
                {connectionStatus === "disconnected" && qrCodeData && (
                  <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-6 text-center">
                    <div className="flex items-center gap-2">
                      <QrCode className="h-5 w-5 text-primary" />
                      <span className="text-sm font-bold">Scan to Pair WhatsApp</span>
                    </div>
                    <div className="relative rounded-lg border bg-white p-3 shadow-inner">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={qrCodeData} 
                        alt="WhatsApp Pairing QR Code" 
                        className="h-48 w-48 object-contain"
                      />
                    </div>
                    <div className="max-w-xs space-y-1">
                      <p className="text-xs font-semibold">Instructions:</p>
                      <p className="text-[11px] text-muted-foreground leading-normal">
                        1. Open WhatsApp on your mobile phone.<br />
                        2. Tap Menu or Settings &gt; Linked Devices.<br />
                        3. Tap Link a Device and point your phone to this screen.
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. Toggles Section (If Connected) */}
                {connectionStatus === "connected" && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold">AI Auto-Replies</Label>
                        <p className="text-xs text-muted-foreground leading-normal max-w-lg">
                          Let the AI Chatbot reply automatically to tenant queries, payment checks, and customer complaints.
                        </p>
                      </div>
                      <Switch
                        checked={autoReplyEnabled}
                        onCheckedChange={handleToggleAutoReply}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
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

