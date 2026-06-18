'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, AlertCircle, Clock, Upload, X, Image as ImageIcon, Loader2, KeyRound, Phone, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type PaymentState = 'loading' | 'invalid' | 'verify_identity' | 'no_dues' | 'select_invoice' | 'pending' | 'submitted' | 'paid'

interface PaymentData {
  portalMonth?: number
  portalYear?: number
  pgName?: string | null
  tenant: {
    name: string
    room_number: string
    payment_code: string
  }
  payments: {
    id: number
    amount: number
    status: 'pending' | 'late' | 'submitted' | 'paid'
    due_date: string
    month: number
    year: number
    verification_notes?: string | null
    payment_code?: string
  }[]
  settings: {
    upi_id: string
    upi_name: string
    payment_instructions: string
    screenshot_required: boolean
    utr_required: boolean
  } | null
}

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default function TenantPaymentPage() {
  const params = useParams()
  const token = params.token as string

  const [state, setState] = useState<PaymentState>('loading')
  const [data, setData] = useState<PaymentData | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<PaymentData['payments'][0] | null>(null)
  
  // Verification state
  const [mobileNumber, setMobileNumber] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  // Form state
  const [utrNumber, setUtrNumber] = useState('')
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [showScreenshotModal, setShowScreenshotModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1. Initial Load: Check if portal token is valid
  useEffect(() => {
    async function validatePortal() {
      try {
        const res = await fetch(`/api/pay/${token}`)
        if (!res.ok) {
          setState('invalid')
          return
        }

        const json = await res.json()
        setData({
          portalMonth: json.month,
          portalYear: json.year,
          pgName: json.pg_name,
          tenant: { name: '', room_number: '', payment_code: '' },
          payments: [],
          settings: json.settings
        })
        setState('verify_identity')
      } catch (error) {
        console.error(error)
        setState('invalid')
      }
    }

    if (token) {
      validatePortal()
    }
  }, [token])

  // 2. Identity Verification Lookup by Mobile Number
  const handleVerifyIdentity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mobileNumber.trim()) {
      toast.error('Mobile number is required')
      return
    }

    setIsVerifying(true)
    try {
      const res = await fetch(`/api/pay/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile_number: mobileNumber })
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Failed to verify identity')
      }

      const json = await res.json()
      
      // Update tenant invoice data
      setData(prev => ({
        portalMonth: prev?.portalMonth,
        portalYear: prev?.portalYear,
        pgName: prev?.pgName,
        tenant: json.tenant,
        payments: json.payments,
        settings: prev?.settings || null
      }))

      if (!json.payments || json.payments.length === 0) {
        setSelectedPayment(null)
        setState('no_dues')
      } else if (json.payments.length === 1) {
        const singlePay = json.payments[0]
        setSelectedPayment(singlePay)
        if (singlePay.status === 'paid') {
          setState('paid')
        } else if (singlePay.status === 'submitted') {
          setState('submitted')
        } else {
          setState('pending')
        }
      } else {
        setSelectedPayment(null)
        setState('select_invoice')
      }
    } catch (error: any) {
      console.error(error)
      toast.error(error.message || 'No registered occupant found with this number.')
    } finally {
      setIsVerifying(false)
    }
  }

  const scanScreenshotForUtr = async (file: File) => {
    setIsScanning(true)
    const scanToastId = toast.loading('Scanning screenshot for UTR...')
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      const ret = await worker.recognize(file)
      await worker.terminate()
      
      const text = ret.data.text
      
      // Match all 12-digit numbers
      const matches = text.match(/\b\d{12}\b/g) || []
      
      let bestCandidate = ''
      let highestScore = -1

      for (const num of matches) {
        // Ignore obvious Indian mobile numbers prefixed with 91 (e.g. 917989610495)
        if (/^91[6-9]\d{9}$/.test(num)) {
          continue;
        }

        let score = 0

        // UPI UTRs in India usually start with 3 (2023), 4 (2024), 5 (2025), 6 (2026), 7 (2027), etc.
        if (/^[3-7]/.test(num)) {
          score += 10
        }

        // Look for contextual keywords near the number
        const lowerText = text.toLowerCase()
        const numIndex = lowerText.indexOf(num)
        if (numIndex !== -1) {
          const windowStart = Math.max(0, numIndex - 60)
          const textBefore = lowerText.substring(windowStart, numIndex)
          if (/utr|ref|upi|txn|transaction|reference|no|id/.test(textBefore)) {
            score += 20
          }
        }

        if (score > highestScore) {
          highestScore = score
          bestCandidate = num
        }
      }

      if (bestCandidate) {
        setUtrNumber(bestCandidate)
        toast.success(`UTR auto-filled: ${bestCandidate}`, { id: scanToastId })
      } else {
        toast.info('Could not auto-detect UTR. Please enter it manually.', { id: scanToastId, duration: 4000 })
      }
    } catch (err) {
      console.error('OCR Error:', err)
      toast.error('Failed to parse image for UTR. Please enter manually.', { id: scanToastId })
    } finally {
      setIsScanning(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be under 5MB')
      return
    }

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Only images or PDF allowed')
      return
    }

    setScreenshotFile(file)
    
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setScreenshotPreview(url)
      scanScreenshotForUtr(file)
    } else {
      setScreenshotPreview(null)
    }
  }

  const handleRemoveFile = () => {
    setScreenshotFile(null)
    setScreenshotPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data || !selectedPayment) return

    const { settings } = data
    if (settings?.utr_required && !utrNumber) {
      toast.error('UTR/Reference Number is required')
      return
    }

    if (settings?.screenshot_required && !screenshotFile) {
      toast.error('Payment screenshot is required')
      return
    }

    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('payment_id', selectedPayment.id.toString())
      if (utrNumber) formData.append('utr', utrNumber)
      if (screenshotFile) formData.append('screenshot', screenshotFile)

      const res = await fetch(`/api/pay/${token}/submit`, {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to submit payment proof')
      }

      toast.success('Payment submitted successfully!')
      
      const updatedPayments = data.payments.map(p => 
        p.id === selectedPayment.id ? { ...p, status: 'submitted' as const } : p
      )
      setData(prev => prev ? { ...prev, payments: updatedPayments } : null)
      setSelectedPayment(prev => prev ? { ...prev, status: 'submitted' as const } : null)
      setState('submitted')

    } catch (error: any) {
      console.error('Submission error:', error)
      toast.error(error.message || 'An error occurred during submission')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Generates unique prefilled QR string using payment_code
  const generateUpiString = () => {
    if (!data?.settings || !selectedPayment || !data?.tenant) return ''
    const { upi_id, upi_name } = data.settings
    const { amount } = selectedPayment
    const payCode = selectedPayment.payment_code || 'PAY-XXXXXX'
    
    // Unique txn reference and note to identify payment
    const txnRef = payCode
    const note = payCode

    return `upi://pay?pa=${encodeURIComponent(upi_id)}&pn=${encodeURIComponent(upi_name || 'Owner')}&am=${amount}&tr=${encodeURIComponent(txnRef)}&tn=${encodeURIComponent(note)}&cu=INR`
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden relative">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md z-10">
        {/* Logo/Brand Area */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">{data?.pgName || 'Staytraq'}</h1>
          <p className="text-sm text-neutral-400">Secure Payment Portal</p>
        </div>

        <AnimatePresence mode="wait">
          {state === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center justify-center p-12 bg-neutral-900/50 border border-neutral-800 rounded-2xl backdrop-blur-sm"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-neutral-400 font-medium">Validating portal link...</p>
            </motion.div>
          )}

          {state === 'invalid' && (
            <motion.div
              key="invalid"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card className="bg-neutral-900/50 border-neutral-800 backdrop-blur-xl">
                <CardContent className="pt-6 flex flex-col items-center text-center">
                  <div className="h-16 w-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="h-8 w-8 text-red-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-2">Invalid or Expired Link</h2>
                  <p className="text-neutral-400 text-sm">
                    This payment link is no longer valid. Please contact your property owner for a new payment link.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {state === 'verify_identity' && (
            <motion.div
              key="verify_identity"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <form onSubmit={handleVerifyIdentity}>
                <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-blue-500" />
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-1">
                      <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center">
                        <KeyRound className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-white text-lg">Tenant Verification</CardTitle>
                    </div>
                    <CardDescription className="text-neutral-400">
                      Enter your registered mobile number to fetch your active invoice and QR code for {data?.pgName ? `${data.pgName} ` : ''}for {data?.portalMonth ? months[data.portalMonth - 1] : ''} {data?.portalYear || ''}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="mobile" className="text-neutral-300">Registered Mobile Number</Label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Phone className="h-4 w-4 text-neutral-500" />
                        </div>
                        <Input
                          id="mobile"
                          type="tel"
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value)}
                          placeholder="e.g. 9876543210"
                          className="pl-10 bg-neutral-950 border-neutral-800 text-white placeholder:text-neutral-600 focus-visible:ring-primary"
                          required
                          disabled={isVerifying}
                        />
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      type="submit" 
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                      disabled={isVerifying}
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Finding Profile...
                        </>
                      ) : (
                        'Verify & Proceed'
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </form>
            </motion.div>
          )}

          {state === 'no_dues' && data && (
            <motion.div
              key="no_dues"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl">
                <CardContent className="pt-8 pb-8 flex flex-col items-center text-center">
                  <div className="h-16 w-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4 border border-green-500/20">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">No Active Dues</h2>
                  <p className="text-neutral-400 text-sm max-w-xs">
                    Hey <span className="font-semibold text-white">{data.tenant.name}</span>, you currently do not have any pending invoices for verification.
                  </p>
                  
                  <div className="w-full bg-neutral-950/50 border border-neutral-800 rounded-xl p-4 text-left mt-6">
                    <div className="flex justify-between items-center text-xs mb-2">
                      <span className="text-neutral-500">Occupant</span>
                      <span className="font-semibold text-neutral-300">{data.tenant.name}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-neutral-500">Room</span>
                      <span className="font-semibold text-neutral-300">Room {data.tenant.room_number}</span>
                    </div>
                  </div>

                  <Button 
                    variant="ghost" 
                    className="mt-6 text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1.5"
                    onClick={() => setState('verify_identity')}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Verification
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {state === 'select_invoice' && data && (
            <motion.div
              key="select_invoice"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl overflow-hidden relative shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-blue-500" />
                <CardHeader>
                  <CardTitle className="text-white text-lg">Invoices for {data.tenant.name}</CardTitle>
                  <CardDescription className="text-neutral-400">
                    Room {data.tenant.room_number} • Select an invoice below to verify or pay.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pb-6">
                  {data.payments.map((p) => {
                    let badgeStyle = "bg-neutral-800 text-neutral-400 border-neutral-700"
                    let statusLabel: string = p.status
                    if (p.status === 'paid') {
                      badgeStyle = "bg-green-500/10 text-green-500 border-green-500/20"
                      statusLabel = "Paid"
                    } else if (p.status === 'submitted') {
                      badgeStyle = "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      statusLabel = "Under Review"
                    } else if (p.status === 'late') {
                      badgeStyle = "bg-red-500/10 text-red-500 border-red-500/20"
                      statusLabel = "Overdue"
                    } else {
                      badgeStyle = "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      statusLabel = "Pending"
                    }

                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPayment(p)
                          if (p.status === 'paid') {
                            setState('paid')
                          } else if (p.status === 'submitted') {
                            setState('submitted')
                          } else {
                            setState('pending')
                          }
                        }}
                        className="w-full flex items-center justify-between p-4 bg-neutral-950/40 border border-neutral-800 hover:border-neutral-700 rounded-xl transition-all hover:bg-neutral-900/40 text-left"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white text-sm">₹{p.amount}</span>
                            <Badge variant="outline" className={`text-[10px] py-0 px-2 font-bold uppercase ${badgeStyle}`}>
                              {statusLabel}
                            </Badge>
                          </div>
                          <p className="text-xs text-neutral-300 mt-1.5 font-medium">
                            Billing Month: {months[p.month - 1]} {p.year}
                          </p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            Due: {new Date(p.due_date).toLocaleDateString()} • Code: {p.payment_code || 'PAY-XXXXXX'}
                          </p>
                        </div>
                        <span className="text-primary text-xs font-bold hover:underline">Select &rarr;</span>
                      </button>
                    )
                  })}
                </CardContent>
                <CardFooter className="bg-neutral-900/40 border-t border-neutral-800 pt-6">
                  <Button 
                    variant="ghost" 
                    className="text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1.5 w-full justify-center"
                    onClick={() => setState('verify_identity')}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Verification
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {state === 'pending' && data && selectedPayment && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Payment Info Card */}
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl overflow-hidden relative shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-blue-500" />
                <CardHeader className="pb-4 border-b border-neutral-800">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <CardTitle className="text-xl text-white">Rent Invoice</CardTitle>
                      <CardDescription className="text-neutral-400">
                        {months[selectedPayment.month - 1]} {selectedPayment.year}
                      </CardDescription>
                    </div>
                    {selectedPayment.status === 'late' && (
                      <Badge variant="destructive" className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20">
                        Overdue
                      </Badge>
                    )}
                  </div>
                  
                  <div className="pt-4 flex items-end justify-between">
                    <span className="text-4xl font-bold tracking-tight text-white">₹{selectedPayment.amount}</span>
                    <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5">
                      Code: {selectedPayment.payment_code || 'PAY-XXXXXX'}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="py-4 space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Tenant</span>
                    <span className="font-semibold text-white">{data.tenant.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Room</span>
                    <span className="font-semibold text-white">Room {data.tenant.room_number}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Due Date</span>
                    <span className="font-semibold text-white">{new Date(selectedPayment.due_date).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Rejection Note if exists */}
              {selectedPayment.verification_notes && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-red-500 mb-1">Previous Payment Rejected</h4>
                    <p className="text-sm text-red-400/90">{selectedPayment.verification_notes}</p>
                  </div>
                </div>
              )}

              {/* Payment Methods */}
              {!data.settings?.upi_id ? (
                <Card className="bg-neutral-900/50 border-neutral-800">
                  <CardContent className="pt-6 text-center text-neutral-400">
                    UPI payments are not configured by the owner. Please pay manually.
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-lg">Pay via UPI</CardTitle>
                    <CardDescription>Tap the QR code to pay using any UPI app, or scan it</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center">
                    <a 
                      href={generateUpiString()}
                      className="bg-white p-4 rounded-xl shadow-inner mb-4 cursor-pointer block hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-transparent hover:border-primary/50 relative group"
                      title="Tap to pay via UPI app"
                    >
                      <QRCodeSVG 
                        value={generateUpiString()} 
                        size={200}
                        level="M"
                        includeMargin={false}
                      />
                    </a>

                    <span className="text-xs text-primary mb-6 animate-pulse flex items-center gap-1.5 font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block animate-ping"></span>
                      Tap or scan the QR code to pay
                    </span>
                    
                    <div className="w-full text-center space-y-1 mb-6">
                      <p className="text-sm text-neutral-400">Paying to</p>
                      <p className="font-semibold text-white text-lg">{data.settings.upi_name || 'Owner'}</p>
                      <p className="text-sm text-neutral-500 font-mono">{data.settings.upi_id}</p>
                      <p className="text-[10px] text-neutral-500 bg-neutral-950 py-1 px-3 rounded-full inline-block mt-2">
                        Prefilled transaction details will appear on scan
                      </p>
                    </div>

                    {data.settings.payment_instructions && (
                      <div className="w-full bg-neutral-950/50 rounded-lg p-4 border border-neutral-800">
                        <p className="text-sm text-neutral-300 text-center">
                          "{data.settings.payment_instructions}"
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Upload Proof Section */}
              <form onSubmit={handleSubmitProof} className="space-y-6">
                <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-lg">Submit Proof</CardTitle>
                    <CardDescription>Upload screenshot and UTR after paying</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Screenshot Upload */}
                    <div className="space-y-2">
                      <Label className="text-neutral-300">
                        Payment Screenshot {data.settings?.screenshot_required && <span className="text-red-500">*</span>}
                      </Label>
                      
                      {!screenshotFile ? (
                        <div 
                          className="border-2 border-dashed border-neutral-800 rounded-xl p-8 hover:bg-neutral-800/50 transition-colors text-center cursor-pointer relative group"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <div className="flex flex-col items-center gap-2">
                            <div className="h-10 w-10 rounded-full bg-neutral-900 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Upload className="h-5 w-5 text-neutral-400" />
                            </div>
                            <div className="text-sm font-medium text-neutral-300">Click to upload</div>
                            <div className="text-xs text-neutral-500">PNG, JPG, PDF up to 5MB</div>
                          </div>
                          <input 
                            type="file" 
                            className="hidden" 
                            ref={fileInputRef}
                            accept="image/*,application/pdf"
                            onChange={handleFileChange}
                          />
                        </div>
                      ) : (
                        <div className="relative border border-neutral-800 rounded-xl p-4 bg-neutral-950/50 flex items-center gap-4">
                          <div 
                            className={`h-12 w-12 rounded bg-neutral-900 flex items-center justify-center overflow-hidden shrink-0 border border-neutral-800 ${screenshotPreview ? 'cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all' : ''}`}
                            onClick={() => screenshotPreview && setShowScreenshotModal(true)}
                            title={screenshotPreview ? "Click to view full image" : ""}
                          >
                            {screenshotPreview ? (
                              <img src={screenshotPreview} alt="Preview" className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-neutral-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{screenshotFile.name}</p>
                            <p className="text-xs text-neutral-500">{(screenshotFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-neutral-400 hover:text-white hover:bg-neutral-800 shrink-0"
                            onClick={handleRemoveFile}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* UTR Input */}
                    {(data.settings?.utr_required || !data.settings?.utr_required) && (
                      <div className="space-y-2">
                        <Label htmlFor="utr" className="text-neutral-300">
                          UTR / Reference Number {data.settings?.utr_required && <span className="text-red-500">*</span>}
                        </Label>
                        <div className="relative">
                          <Input
                            id="utr"
                            value={utrNumber}
                            onChange={(e) => setUtrNumber(e.target.value)}
                            placeholder={isScanning ? "Scanning screenshot..." : "e.g. 312345678901"}
                            className="bg-neutral-950 border-neutral-800 text-white placeholder:text-neutral-600 focus-visible:ring-primary pr-10"
                            required={data.settings?.utr_required}
                            disabled={isScanning}
                          />
                          {isScanning && (
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="bg-neutral-900/40 border-t border-neutral-800 pt-6 flex flex-col gap-4">
                    <Button 
                      type="submit" 
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-lg shadow-primary/20"
                      disabled={isSubmitting || isScanning || (data.settings?.screenshot_required && !screenshotFile) || (data.settings?.utr_required && !utrNumber)}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Submit Verification'
                      )}
                    </Button>
                    
                    <div className="flex w-full gap-3 justify-between">
                      {data.payments.length > 1 && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          className="text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1.5"
                          onClick={() => {
                            setSelectedPayment(null)
                            setState('select_invoice')
                          }}
                        >
                          <ArrowLeft className="h-3.5 w-3.5" /> Back to Invoices
                        </Button>
                      )}
                      <Button 
                        type="button" 
                        variant="ghost" 
                        className="text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1.5 w-auto"
                        onClick={() => setState('verify_identity')}
                      >
                        Use another profile
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              </form>
            </motion.div>
          )}

          {state === 'submitted' && data && selectedPayment && (
            <motion.div
              key="submitted"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
                <CardContent className="pt-8 pb-8 flex flex-col items-center">
                  <div className="h-20 w-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-6 border border-amber-500/20">
                    <Clock className="h-10 w-10 text-amber-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Under Review</h2>
                  <p className="text-neutral-400 text-center max-w-sm mb-6">
                    Hey <span className="font-semibold text-white">{data.tenant.name}</span>, your payment details have been submitted. The owner will verify your payment soon.
                  </p>
                  
                  <div className="w-full bg-neutral-950/50 border border-neutral-800 rounded-xl p-4 text-left">
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-neutral-500">Amount Paid</span>
                      <span className="font-semibold text-white">₹{selectedPayment.amount}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-500">Status</span>
                      <Badge variant="outline" className="text-amber-500 border-amber-500/20 bg-amber-500/10">Verification Pending</Badge>
                    </div>
                  </div>

                  <div className="flex gap-4 mt-6">
                    {data.payments.length > 1 && (
                      <Button 
                        variant="ghost" 
                        className="text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1.5"
                        onClick={() => {
                          setSelectedPayment(null)
                          setState('select_invoice')
                        }}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to Invoices
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      className="text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1.5"
                      onClick={() => setState('verify_identity')}
                    >
                      Exit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {state === 'paid' && data && selectedPayment && (
            <motion.div
              key="paid"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-green-500" />
                <CardContent className="pt-8 pb-8 flex flex-col items-center">
                  <div className="h-20 w-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Payment Confirmed</h2>
                  <p className="text-neutral-400 text-center max-w-sm mb-6">
                    Hey <span className="font-semibold text-white">{data.tenant.name}</span>, your rent payment has been verified. Thank you!
                  </p>
                  
                  <div className="w-full bg-neutral-950/50 border border-neutral-800 rounded-xl p-4 text-left">
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-neutral-500">Amount Paid</span>
                      <span className="font-semibold text-white">₹{selectedPayment.amount}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-500">Status</span>
                      <Badge variant="outline" className="text-green-500 border-green-500/20 bg-green-500/10">Paid</Badge>
                    </div>
                  </div>

                  <div className="flex gap-4 mt-6">
                    {data.payments.length > 1 && (
                      <Button 
                        variant="ghost" 
                        className="text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1.5"
                        onClick={() => {
                          setSelectedPayment(null)
                          setState('select_invoice')
                        }}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to Invoices
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      className="text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1.5"
                      onClick={() => setState('verify_identity')}
                    >
                      Exit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Footer info */}
        <div className="mt-8 text-center">
          <p className="text-xs text-neutral-600 flex items-center justify-center gap-1">
            Secure payment verification by <span className="font-semibold text-neutral-500">Staytraq</span>
          </p>
        </div>
      </div>

      {/* Full Screenshot Modal */}
      <AnimatePresence>
        {showScreenshotModal && screenshotPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowScreenshotModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-hidden relative flex flex-col shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header / Close button */}
              <div className="flex justify-between items-center p-4 border-b border-neutral-800 shrink-0">
                <h3 className="font-semibold text-white text-sm truncate">Payment Screenshot</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full"
                  onClick={() => setShowScreenshotModal(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Image container */}
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-neutral-950">
                <img
                  src={screenshotPreview}
                  alt="Payment Screenshot Full"
                  className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
