'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Loader2, Phone, ArrowLeft, MessageSquare, ShieldCheck, PenTool } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

type SubmissionState = 'loading' | 'invalid' | 'verify_identity' | 'write_complaint' | 'submitted'

interface PortalData {
  ownerName: string
  pgName: string | null
}

export default function TenantComplaintPage() {
  const params = useParams()
  const token = params.token as string

  const [state, setState] = useState<SubmissionState>('loading')
  const [data, setData] = useState<PortalData | null>(null)
  
  // Verification state
  const [mobileNumber, setMobileNumber] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  // Form state
  const [complaintMessage, setComplaintMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pastComplaints, setPastComplaints] = useState<any[]>([])

  // 1. Initial Load: Check if complaint portal token is valid
  useEffect(() => {
    async function validatePortal() {
      try {
        const res = await fetch(`/api/complaint-submit/${token}`)
        if (!res.ok) {
          setState('invalid')
          return
        }

        const json = await res.json()
        setData({
          ownerName: json.owner_name,
          pgName: json.pg_name
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
      const res = await fetch(`/api/complaint-submit/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile_number: mobileNumber })
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Failed to verify identity')
      }

      const json = await res.json()
      setPastComplaints(json.complaints || [])
      toast.success('Identity verified! You may now submit a complaint.')
      setState('write_complaint')
    } catch (error: any) {
      console.error(error)
      toast.error(error.message || 'No registered occupant found with this number.')
    } finally {
      setIsVerifying(false)
    }
  }

  // 3. Submit Complaint Form
  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!complaintMessage.trim()) {
      toast.error('Complaint message cannot be empty')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/complaint-submit/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile_number: mobileNumber,
          complaint_message: complaintMessage
        })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to submit complaint')
      }

      toast.success('Complaint submitted successfully')
      setState('submitted')
    } catch (error: any) {
      console.error('Submission error:', error)
      toast.error(error.message || 'An error occurred during submission')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden relative">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md z-10">
        {/* Logo/Brand Area */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">Staytraq</h1>
          <p className="text-sm text-neutral-400">Anonymous Complaint Box</p>
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
              <Loader2 className="h-8 w-8 animate-spin text-red-500 mb-4" />
              <p className="text-neutral-400 font-medium">Validating complaint link...</p>
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
                    This complaint submission link is no longer valid. Please contact your property owner for a new link.
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
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-amber-500" />
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-1">
                      <div className="h-8 w-8 bg-red-500/10 rounded-lg flex items-center justify-center">
                        <Phone className="h-4 w-4 text-red-500" />
                      </div>
                      <CardTitle className="text-white text-lg">Occupant Verification</CardTitle>
                    </div>
                    <CardDescription className="text-neutral-400">
                      {data?.pgName ? `Verify your membership at ${data.pgName} to submit a complaint.` : `Verify your mobile number to submit a complaint.`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Privacy Notice Card */}
                    <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4 flex gap-3 mb-2">
                      <ShieldCheck className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-red-400 mb-1">Your privacy is protected.</h4>
                        <p className="text-[11px] text-neutral-400 leading-relaxed">
                          None of your personal information (name, phone number) will be shown to the PG owner. Complaints are submitted anonymously.
                        </p>
                      </div>
                    </div>

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
                          className="pl-10 bg-neutral-950 border-neutral-800 text-white placeholder:text-neutral-600 focus-visible:ring-red-500"
                          required
                          disabled={isVerifying}
                        />
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      type="submit" 
                      className="w-full bg-red-600 hover:bg-red-500 text-white font-medium shadow-md shadow-red-900/20"
                      disabled={isVerifying}
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
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

          {state === 'write_complaint' && (
            <motion.div
              key="write_complaint"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <form onSubmit={handleSubmitComplaint}>
                <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-amber-500" />
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-red-500/10 rounded-lg flex items-center justify-center">
                        <MessageSquare className="h-4 w-4 text-red-500" />
                      </div>
                      <CardTitle className="text-white text-lg">Submit Complaint</CardTitle>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {/* Privacy Notice Card */}
                    <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 flex gap-3">
                      <ShieldCheck className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-red-400 mb-1">Your privacy is protected.</h4>
                        <p className="text-[11px] text-neutral-400 leading-relaxed">
                          None of your personal information (name, phone number) will be shown to the PG owner. Complaints are submitted anonymously.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="complaint" className="text-neutral-300">Complaint Details</Label>
                      <Textarea
                        id="complaint"
                        value={complaintMessage}
                        onChange={(e) => setComplaintMessage(e.target.value)}
                        placeholder="Please describe the issue in detail..."
                        className="min-h-[120px] bg-neutral-950 border-neutral-800 text-white placeholder:text-neutral-600 focus-visible:ring-red-500"
                        maxLength={500}
                        required
                        disabled={isSubmitting}
                      />
                      <div className="text-right text-[10px] text-neutral-500 font-medium">
                        {complaintMessage.length} / 500 characters
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="bg-neutral-900/40 border-t border-neutral-800 pt-6 flex flex-col gap-4">
                    <Button 
                      type="submit" 
                      className="w-full bg-red-600 hover:bg-red-500 text-white font-medium shadow-lg shadow-red-900/20"
                      disabled={isSubmitting || !complaintMessage.trim()}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Submit Complaint'
                      )}
                    </Button>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      className="text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1.5 w-auto"
                      onClick={() => setState('verify_identity')}
                      disabled={isSubmitting}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Verify another number
                    </Button>
                  </CardFooter>
                </Card>
              </form>

              {/* Previous Complaints List */}
              {pastComplaints.length > 0 && (
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5 backdrop-blur-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-neutral-850 pb-2.5">
                    <ShieldCheck className="h-4 w-4 text-neutral-400 font-black" />
                    <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider">Your Previous Complaints</h3>
                  </div>
                  <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                    {pastComplaints.map((c) => (
                      <div key={c.id} className="bg-neutral-950 border border-neutral-900 rounded-xl p-3.5 space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] text-neutral-500 font-semibold">
                            {new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            c.status === 'Resolved' 
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                              : c.status === 'Ignored'
                              ? 'bg-neutral-800 border-neutral-700 text-neutral-400'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          }`}>
                            {c.status}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-300 leading-relaxed font-medium">
                          {c.complaint_message}
                        </p>
                        {c.owner_response && (
                          <div className="bg-neutral-900/60 border border-neutral-800/40 rounded-lg p-2.5 mt-2 flex gap-2">
                            <MessageSquare className="h-3.5 w-3.5 text-neutral-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="text-[9px] text-neutral-500 font-extrabold uppercase tracking-wide">Reply from Owner</span>
                              <p className="text-[11px] text-neutral-300 font-medium leading-relaxed mt-0.5">
                                {c.owner_response}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                <div className="absolute top-0 left-0 w-full h-1 bg-green-500" />
                <CardContent className="pt-8 pb-8 flex flex-col items-center">
                  <div className="h-20 w-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Complaint Submitted</h2>
                  <p className="text-neutral-400 text-center max-w-sm mb-6 text-sm">
                    Thank you. Your complaint has been submitted anonymously. The owner has been notified and will review the issue.
                  </p>
                  
                  <div className="w-full bg-neutral-950/50 border border-neutral-800 rounded-xl p-4 text-left">
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-neutral-500">Destination</span>
                      <span className="font-semibold text-white">{data?.pgName || data?.ownerName || 'PG Office'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-500">Privacy Status</span>
                      <span className="font-semibold text-green-400 flex items-center gap-1">
                        <ShieldCheck className="h-4 w-4" /> Anonymous
                      </span>
                    </div>
                  </div>

                  <Button 
                    variant="ghost" 
                    className="mt-6 text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1.5"
                    onClick={() => {
                      setComplaintMessage('')
                      setState('verify_identity')
                    }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Submit another complaint
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Footer info */}
        <div className="mt-8 text-center">
          <p className="text-xs text-neutral-600 flex items-center justify-center gap-1">
            Secure anonymous portal powered by <span className="font-semibold text-neutral-500">Staytraq</span>
          </p>
        </div>
      </div>
    </div>
  )
}
