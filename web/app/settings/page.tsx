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
import { Building2, Bell, CreditCard, User, Shield, Save, Loader2, Bot, Smartphone, Trash2, Wifi, WifiOff, QrCode, AlertCircle, RefreshCw } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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
  const [isProcessingChatbot, setIsProcessingChatbot] = useState(false)
  const [pairingPhoneNumber, setPairingPhoneNumber] = useState("")
  const [pairingCode, setPairingCode] = useState("")
  const [isPairingLoading, setIsPairingLoading] = useState(false)

  const fetchChatbotStatus = useCallback(async (silent = false) => {
    try {
      if (!silent) setChatbotStatusLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return



      const chatbotApiUrl = process.env.NEXT_PUBLIC_CHATBOT_API_URL || "https://144.91.79.198.sslip.io"
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
        if (statusData.connectionStatus === "connected") {
          setPairingCode("")
        }
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

  const handleGeneratePairingCode = async () => {
    if (!pairingPhoneNumber) {
      toast.error("Please enter your phone number first.")
      return
    }

    try {
      setIsPairingLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const chatbotApiUrl = process.env.NEXT_PUBLIC_CHATBOT_API_URL || "https://144.91.79.198.sslip.io"
      const res = await fetch(`${chatbotApiUrl}/api/v1/chatbot/pairing-code`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ phoneNumber: pairingPhoneNumber })
      })
      if (res.ok) {
        const data = await res.json()
        setPairingCode(data.code)
        toast.success("Pairing code generated successfully.")
      } else {
        const err = await res.json()
        toast.error(err.detail || "Failed to generate pairing code.")
      }
    } catch (err) {
      console.error("Failed to generate pairing code:", err)
      toast.error("Failed to generate pairing code.")
    } finally {
      setIsPairingLoading(false)
    }
  }

  const handleCreateChatbot = async () => {
    try {
      setIsProcessingChatbot(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const chatbotApiUrl = process.env.NEXT_PUBLIC_CHATBOT_API_URL || "https://144.91.79.198.sslip.io"
      const res = await fetch(`${chatbotApiUrl}/api/v1/chatbot/create`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })
      if (res.ok) {
        setInstanceExists(true)
        setConnectionStatus("disconnected")
        setPairingCode("")
        setPairingPhoneNumber("")
        toast.success("Instance created successfully. Enter your phone number below to connect.")
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

      const chatbotApiUrl = process.env.NEXT_PUBLIC_CHATBOT_API_URL || "https://144.91.79.198.sslip.io"
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

        {/* WhatsApp Integration Settings */}
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">WhatsApp Integration</CardTitle>
                <CardDescription className="mt-0.5">
                  Automate tenant replies and manage chatbot settings via WhatsApp integration
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
                        ? "Instance exists but is not connected. Link with your phone number below to pair."
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

                {/* 2. Pairing Code Section (If Disconnected) */}
                {connectionStatus === "disconnected" && (
                  <div className="flex flex-col gap-5 rounded-xl border border-dashed p-6">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-primary" />
                      <span className="text-sm font-bold">Link with Phone Number instead of QR</span>
                    </div>

                    {!pairingCode ? (
                      <div className="flex flex-col gap-3 max-w-md">
                        <div className="space-y-1.5">
                          <Label htmlFor="pairingPhone" className="text-xs font-semibold">
                            Phone Number (with Country Code, e.g. 919876543210)
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="pairingPhone"
                              placeholder="e.g. 919876543210"
                              value={pairingPhoneNumber}
                              onChange={(e) => setPairingPhoneNumber(e.target.value)}
                              className="bg-muted/50 focus:bg-background"
                            />
                            <Button 
                              type="button" 
                              disabled={isPairingLoading}
                              onClick={handleGeneratePairingCode}
                            >
                              {isPairingLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Get Code
                            </Button>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-normal">
                          Enter your WhatsApp phone number with country code (without spaces or +). 
                          We will request an 8-character pairing code from the WhatsApp server.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 text-center items-center max-w-md mx-auto">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Your Pairing Code</p>
                          <div className="flex items-center justify-center gap-3">
                            <span className="text-2xl font-extrabold font-mono bg-muted py-2 px-6 rounded-lg tracking-widest border border-primary/20 text-primary shadow-sm select-all">
                              {pairingCode}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(pairingCode)
                                toast.success("Pairing code copied to clipboard!")
                              }}
                            >
                              Copy
                            </Button>
                          </div>
                        </div>

                        <div className="w-full text-left space-y-2 border-t pt-4">
                          <p className="text-xs font-bold text-foreground">How to connect your WhatsApp:</p>
                          <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1.5 leading-normal">
                            <li>Open <span className="font-semibold text-foreground">WhatsApp</span> on your mobile phone.</li>
                            <li>Tap the <span className="font-semibold text-foreground">Menu</span> icon (three dots on Android) or <span className="font-semibold text-foreground">Settings</span> (gear icon on iOS).</li>
                            <li>Select <span className="font-semibold text-foreground">Linked Devices</span> from the options.</li>
                            <li>Tap the blue <span className="font-semibold text-foreground">Link a Device</span> button (authenticate if prompted).</li>
                            <li>Tap <span className="font-semibold text-foreground text-primary">Link with phone number instead</span> at the bottom of the camera scan screen.</li>
                            <li>Enter the 8-character code shown above.</li>
                          </ol>
                        </div>

                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setPairingCode("")}
                          className="text-muted-foreground text-xs hover:text-foreground mt-1"
                        >
                          Use another phone number
                        </Button>
                      </div>
                    )}
                  </div>
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

