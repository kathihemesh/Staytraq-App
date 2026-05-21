'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, AlertCircle, Clock, Upload, ChevronRight, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type PaymentState = 'loading' | 'invalid' | 'pending' | 'submitted' | 'paid'

interface PaymentData {
  payment: {
    id: number
    amount: number
    status: 'pending' | 'late' | 'submitted' | 'paid'
    due_date: string
    month: number
    year: number
    tenant_name: string
    room_number: string
    verification_notes?: string | null
  }
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
  
  // Form state
  const [utrNumber, setUtrNumber] = useState('')
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function fetchPayment() {
      try {
        const res = await fetch(`/api/pay/${token}`)
        if (!res.ok) {
          if (res.status === 404) {
            setState('invalid')
          } else {
            throw new Error('Failed to load payment')
          }
          return
        }

        const json = await res.json()
        setData(json)
        
        // Map backend status to page state
        if (json.payment.status === 'paid') {
          setState('paid')
        } else if (json.payment.status === 'submitted') {
          setState('submitted')
        } else {
          setState('pending') // covers 'pending' and 'late'
        }
      } catch (error) {
        console.error(error)
        setState('invalid')
      }
    }

    if (token) {
      fetchPayment()
    }
  }, [token])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be under 5MB')
      return
    }

    // Validate type
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Only images or PDF allowed')
      return
    }

    setScreenshotFile(file)
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setScreenshotPreview(url)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!data) return

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
      if (utrNumber) formData.append('utr_number', utrNumber)
      if (screenshotFile) formData.append('screenshot', screenshotFile)

      const res = await fetch(`/api/pay/${token}/submit`, {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to submit payment')
      }

      toast.success('Payment submitted successfully!')
      setState('submitted')
      
      // Update local data status
      setData(prev => prev ? {
        ...prev,
        payment: { ...prev.payment, status: 'submitted' }
      } : null)

    } catch (error: any) {
      console.error('Submission error:', error)
      toast.error(error.message || 'An error occurred during submission')
    } finally {
      setIsSubmitting(false)
    }
  }

  // UPI QR Code payload formatting
  const generateUpiString = () => {
    if (!data?.settings) return ''
    const { upi_id, upi_name } = data.settings
    const { amount } = data.payment
    // Formats properly as UPI intent URI
    return `upi://pay?pa=${encodeURIComponent(upi_id)}&pn=${encodeURIComponent(upi_name || 'Owner')}&am=${amount}&cu=INR`
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden relative">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md z-10">
        {/* Logo/Brand Area */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">Staytraq</h1>
          <p className="text-sm text-neutral-400">Rent Payment Portal</p>
        </div>

        <AnimatePresence mode="wait">
          {state === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center justify-center p-12 bg-neutral-900/50 border border-neutral-800 rounded-xl backdrop-blur-sm"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-neutral-400 font-medium">Loading payment details...</p>
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
                    This payment link is no longer valid. Please contact your property owner for a new link.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {state === 'pending' && data && (
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
                        {months[data.payment.month - 1]} {data.payment.year}
                      </CardDescription>
                    </div>
                    {data.payment.status === 'late' && (
                      <Badge variant="destructive" className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20">
                        Overdue
                      </Badge>
                    )}
                  </div>
                  
                  <div className="pt-4 flex items-end gap-2">
                    <span className="text-4xl font-bold tracking-tight text-white">₹{data.payment.amount}</span>
                  </div>
                </CardHeader>
                
                <CardContent className="py-4 space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Tenant</span>
                    <span className="font-medium text-white">{data.payment.tenant_name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Room</span>
                    <span className="font-medium text-white">{data.payment.room_number}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Due Date</span>
                    <span className="font-medium text-white">{new Date(data.payment.due_date).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Rejection Note if exists */}
              {data.payment.verification_notes && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex gap-3"
                >
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-red-500 mb-1">Previous Payment Rejected</h4>
                    <p className="text-sm text-red-400/90">{data.payment.verification_notes}</p>
                  </div>
                </motion.div>
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
                    <CardDescription>Scan with any UPI app (GPay, PhonePe, Paytm)</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center">
                    <div className="bg-white p-4 rounded-xl shadow-inner mb-6">
                      <QRCodeSVG 
                        value={generateUpiString()} 
                        size={200}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    
                    <div className="w-full text-center space-y-1 mb-6">
                      <p className="text-sm text-neutral-400">Paying to</p>
                      <p className="font-medium text-white text-lg">{data.settings.upi_name || 'Owner'}</p>
                      <p className="text-sm text-neutral-500 font-mono">{data.settings.upi_id}</p>
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
              <form onSubmit={handleSubmit} className="space-y-6">
                <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-lg">Submit Proof</CardTitle>
                    <CardDescription>Upload screenshot and UTR after paying</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* UTR Input */}
                    {(data.settings?.utr_required || !data.settings?.utr_required) && (
                      <div className="space-y-2">
                        <Label htmlFor="utr" className="text-neutral-300">
                          UTR / Reference Number {data.settings?.utr_required && <span className="text-red-500">*</span>}
                        </Label>
                        <Input
                          id="utr"
                          value={utrNumber}
                          onChange={(e) => setUtrNumber(e.target.value)}
                          placeholder="e.g. 312345678901"
                          className="bg-neutral-950 border-neutral-800 text-white placeholder:text-neutral-600 focus-visible:ring-primary"
                          required={data.settings?.utr_required}
                        />
                      </div>
                    )}

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
                          <div className="h-12 w-12 rounded bg-neutral-900 flex items-center justify-center overflow-hidden shrink-0 border border-neutral-800">
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
                  </CardContent>
                  <CardFooter className="bg-neutral-900/40 border-t border-neutral-800 pt-6">
                    <Button 
                      type="submit" 
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-lg shadow-primary/20"
                      disabled={isSubmitting || (data.settings?.screenshot_required && !screenshotFile) || (data.settings?.utr_required && !utrNumber)}
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
                  </CardFooter>
                </Card>
              </form>
            </motion.div>
          )}

          {state === 'submitted' && (
            <motion.div
              key="submitted"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
                <CardContent className="pt-8 pb-8 flex flex-col items-center">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="h-20 w-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-6 border border-amber-500/20"
                  >
                    <Clock className="h-10 w-10 text-amber-500" />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-white mb-2">Under Review</h2>
                  <p className="text-neutral-400 text-center max-w-sm mb-6">
                    Your payment details have been submitted. The owner will review and confirm your payment soon.
                  </p>
                  
                  <div className="w-full bg-neutral-950/50 border border-neutral-800 rounded-xl p-4 text-left">
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-neutral-500">Amount Paid</span>
                      <span className="font-medium text-white">₹{data?.payment.amount}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-500">Status</span>
                      <Badge variant="outline" className="text-amber-500 border-amber-500/20 bg-amber-500/10">Verification Pending</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {state === 'paid' && (
            <motion.div
              key="paid"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-green-500" />
                <CardContent className="pt-8 pb-8 flex flex-col items-center">
                  <motion.div 
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="h-20 w-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20"
                  >
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-white mb-2">Payment Confirmed</h2>
                  <p className="text-neutral-400 text-center max-w-sm mb-6">
                    Your rent payment has been successfully verified by the owner. Thank you!
                  </p>
                  
                  <div className="w-full bg-neutral-950/50 border border-neutral-800 rounded-xl p-4 text-left">
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-neutral-500">Amount Paid</span>
                      <span className="font-medium text-white">₹{data?.payment.amount}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-500">Status</span>
                      <Badge variant="outline" className="text-green-500 border-green-500/20 bg-green-500/10">Paid</Badge>
                    </div>
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
    </div>
  )
}
