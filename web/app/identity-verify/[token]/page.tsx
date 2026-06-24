'use client'

import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  BedDouble,
  CreditCard,
  Fingerprint,
  ImageUp,
  X,
  Lock,
  Check,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { roomDisplay, controlsForType, type PortalTenantContext } from '@/lib/identity/portal'
import {
  containsCI,
  extractAadhaarNumber,
  extractPanCode,
  partialNameMatch,
  type IdentityType,
} from '@/lib/identity/verify'

// Public tenant identity verification portal.
//
// Theme (dark `bg-neutral-950`, primary/blue glows, Staytraq brand header,
// shadcn `Card`, `framer-motion`) is reused from the Payment/Complaint portals
// so a side-by-side comparison shows no visible difference (Req 5).
//
// Live verification UX: OCR runs with tesseract.js the moment an image is
// uploaded (not deferred to submit). The portal shows a "Verifying…" status,
// then "Verified" with a tick on success, or a clear failure reason:
//   - missing/unreadable required markers → "Failed to identify the above ID
//     as <type>. Please try again."
//   - the tenant name not found on the document → "Tenant name does not match
//     the name on the ID."
// For Aadhaar the back-image field unlocks only once the front passes its
// checks; for PAN the single front image is verified immediately. The submit
// button posts the already-extracted OCR text + images to the authoritative
// server route, which re-verifies and stores the result.

const CONSENT_LABEL =
  'I understand and agree to submit my identity documents for verification purposes. ' +
  'Your documents will be encrypted and stored securely and will only be visible to the property owner. ' +
  'They will be automatically deleted within 15 days after you move out. ' +
  'This information is collected only to help property owners verify tenant identities ' +
  'and maintain a safe and trusted living environment.'

const IDENTITY_TYPE_OPTIONS: ReadonlyArray<{
  type: IdentityType
  label: string
  description: string
  icon: typeof Fingerprint
}> = [
  { type: 'Aadhaar', label: 'Aadhaar', description: 'Front & back of your Aadhaar card', icon: Fingerprint },
  { type: 'PAN', label: 'PAN', description: 'Front of your PAN card', icon: CreditCard },
]

// Case-insensitive markers each document type must contain.
const AADHAAR_FRONT_MARKER = 'Government of India'
const AADHAAR_BACK_MARKER = 'Unique Identification Authority of India'
const PAN_MARKER = 'Permanent Account Number Card'

type PortalState =
  | 'loading'
  | 'invalid'
  | 'load_error'
  | 'already_done'
  | 'input_ready'
  | 'submitted'

// Live per-document verification status.
//   idle       – nothing uploaded for the current step
//   reading    – OCR + checks running on the just-uploaded image
//   await_back – (Aadhaar) the front passed; the back image is now required
//   verified   – all required checks for the selected type passed
//   failed     – a check failed; `failReason` explains why
type VerifyStatus = 'idle' | 'reading' | 'await_back' | 'verified' | 'failed'

const CONTEXT_FETCH_TIMEOUT_MS = 5000

/** True only for a string with at least one non-whitespace character. */
function isReadable(text: unknown): text is string {
  return typeof text === 'string' && text.trim().length > 0
}

export default function IdentityVerifyPage() {
  const params = useParams()
  const token = params.token as string

  const [state, setState] = useState<PortalState>('loading')
  const [context, setContext] = useState<PortalTenantContext | null>(null)

  // ---- selection + uploads ----
  const [selectedType, setSelectedType] = useState<IdentityType | null>(null)
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [frontPreview, setFrontPreview] = useState<string | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [backPreview, setBackPreview] = useState<string | null>(null)

  // ---- live verification ----
  const [frontText, setFrontText] = useState('')
  const [backText, setBackText] = useState('')
  // The 12-digit Aadhaar number read from the front, kept so the back image can
  // be checked for the same number. Non-null only once the front has passed.
  const [aadhaarFrontNumber, setAadhaarFrontNumber] = useState<string | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('idle')
  const [failReason, setFailReason] = useState<string | null>(null)

  // ---- consent + submit ----
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [guardMessage, setGuardMessage] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const frontInputRef = useRef<HTMLInputElement | null>(null)
  const backInputRef = useRef<HTMLInputElement | null>(null)
  // Monotonic id so a stale OCR run (image replaced mid-OCR) can be ignored.
  const ocrRunId = useRef(0)
  // Latest object URLs for cleanup on unmount without re-running effects.
  const previewUrls = useRef<{ front: string | null; back: string | null }>({ front: null, back: null })

  const controls = controlsForType(selectedType)
  const typeLabel = selectedType ?? 'document'

  // The Aadhaar back field unlocks only once the front has passed its checks
  // (i.e. we have a confirmed front Aadhaar number). This replaces the previous
  // timer-based enable, which a cleanup effect could clear — leaving the field
  // stuck on "Preparing…".
  const backUploadEnabled = selectedType === 'Aadhaar' && aadhaarFrontNumber !== null

  const canSubmit = consent && verifyStatus === 'verified' && frontFile !== null

  // Revoke object URLs only on unmount (refs avoid the stale-timer bug that the
  // previous [frontPreview, backPreview] effect introduced).
  useEffect(() => {
    return () => {
      if (previewUrls.current.front) URL.revokeObjectURL(previewUrls.current.front)
      if (previewUrls.current.back) URL.revokeObjectURL(previewUrls.current.back)
    }
  }, [])

  const setFrontPreviewUrl = (url: string | null) => {
    if (previewUrls.current.front) URL.revokeObjectURL(previewUrls.current.front)
    previewUrls.current.front = url
    setFrontPreview(url)
  }
  const setBackPreviewUrl = (url: string | null) => {
    if (previewUrls.current.back) URL.revokeObjectURL(previewUrls.current.back)
    previewUrls.current.back = url
    setBackPreview(url)
  }

  const runOcr = async (file: File): Promise<string> => {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng')
    try {
      const ret = await worker.recognize(file)
      return ret.data.text ?? ''
    } finally {
      await worker.terminate()
    }
  }

  const failGeneric = () => {
    setFailReason(`Failed to identify the above ID as ${typeLabel}. Please try again.`)
    setVerifyStatus('failed')
  }
  const failNameMismatch = () => {
    setFailReason('Tenant name does not match the name on the ID.')
    setVerifyStatus('failed')
  }

  // Reset all upload + verification state (used on type change).
  const resetAll = () => {
    setFrontPreviewUrl(null)
    setBackPreviewUrl(null)
    setFrontFile(null)
    setBackFile(null)
    setFrontText('')
    setBackText('')
    setAadhaarFrontNumber(null)
    setVerifyStatus('idle')
    setFailReason(null)
    setGuardMessage(null)
    setSubmitError(null)
    if (frontInputRef.current) frontInputRef.current.value = ''
    if (backInputRef.current) backInputRef.current.value = ''
  }

  const handleSelectType = (type: IdentityType) => {
    setSelectedType((prev) => (prev === type ? null : type))
    resetAll()
  }

  // Front image chosen/replaced → OCR immediately and verify the front-side
  // checks for the selected type.
  const handleFrontChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedType) return
    const name = context?.name ?? ''

    // Replacing the front invalidates any back image + prior result.
    setBackPreviewUrl(null)
    setBackFile(null)
    setBackText('')
    setAadhaarFrontNumber(null)
    setSubmitError(null)
    setGuardMessage(null)
    setFailReason(null)
    setFrontFile(file)
    setFrontPreviewUrl(URL.createObjectURL(file))
    setVerifyStatus('reading')

    const runId = ++ocrRunId.current
    try {
      const text = await runOcr(file)
      if (runId !== ocrRunId.current) return // a newer upload superseded this one
      setFrontText(text)

      if (selectedType === 'PAN') {
        if (!isReadable(text) || !extractPanCode(text) || !containsCI(text, PAN_MARKER)) {
          failGeneric()
          return
        }
        if (!partialNameMatch(text, name)) {
          failNameMismatch()
          return
        }
        setVerifyStatus('verified')
        return
      }

      // Aadhaar front checks: a 12-digit number, the "Government of India"
      // marker, and the tenant name. On success the back field unlocks.
      const num = extractAadhaarNumber(text)
      if (!isReadable(text) || !num || !containsCI(text, AADHAAR_FRONT_MARKER)) {
        failGeneric()
        return
      }
      if (!partialNameMatch(text, name)) {
        failNameMismatch()
        return
      }
      setAadhaarFrontNumber(num)
      setVerifyStatus('await_back')
    } catch (err) {
      if (runId !== ocrRunId.current) return
      console.error('[identity-verify] front OCR failed:', err)
      failGeneric()
    }
  }

  // Back image chosen/replaced (Aadhaar only) → OCR and verify the back-side
  // checks against the front Aadhaar number.
  const handleBackChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const frontNum = aadhaarFrontNumber
    setBackFile(file)
    setBackPreviewUrl(URL.createObjectURL(file))
    setSubmitError(null)
    setGuardMessage(null)
    setFailReason(null)
    setVerifyStatus('reading')

    const runId = ++ocrRunId.current
    try {
      const text = await runOcr(file)
      if (runId !== ocrRunId.current) return
      setBackText(text)

      const backNum = extractAadhaarNumber(text)
      if (
        !isReadable(text) ||
        !backNum ||
        backNum !== frontNum ||
        !containsCI(text, AADHAAR_BACK_MARKER)
      ) {
        failGeneric()
        return
      }
      setVerifyStatus('verified')
    } catch (err) {
      if (runId !== ocrRunId.current) return
      console.error('[identity-verify] back OCR failed:', err)
      failGeneric()
    }
  }

  const handleRemoveFront = () => {
    setFrontPreviewUrl(null)
    setFrontFile(null)
    setFrontText('')
    setBackPreviewUrl(null)
    setBackFile(null)
    setBackText('')
    setAadhaarFrontNumber(null)
    setVerifyStatus('idle')
    setFailReason(null)
    if (frontInputRef.current) frontInputRef.current.value = ''
    if (backInputRef.current) backInputRef.current.value = ''
  }

  const handleRemoveBack = () => {
    setBackPreviewUrl(null)
    setBackFile(null)
    setBackText('')
    // Front already passed, so return to awaiting the back image.
    setVerifyStatus(aadhaarFrontNumber ? 'await_back' : 'idle')
    setFailReason(null)
    if (backInputRef.current) backInputRef.current.value = ''
  }

  // Submit posts the already-extracted OCR text + images to the authoritative
  // server route, which re-verifies and stores the result.
  const handleSubmit = async () => {
    if (submitting) return
    setGuardMessage(null)
    setSubmitError(null)

    if (!consent) {
      setGuardMessage('Please tick the consent box before submitting.')
      return
    }
    if (verifyStatus !== 'verified' || !selectedType || !frontFile) {
      setGuardMessage('Please upload a document that passes verification before submitting.')
      return
    }

    setSubmitting(true)
    try {
      const body = new FormData()
      body.set('identity_type', selectedType)
      body.set('consent', 'true')
      body.set('front_text', frontText)
      body.set('front_image', frontFile)
      if (selectedType === 'Aadhaar' && backFile) {
        body.set('back_text', backText)
        body.set('back_image', backFile)
      }

      const res = await fetch(`/api/identity-verify/${token}/submit`, { method: 'POST', body })
      if (!res.ok) {
        setSubmitError('We couldn’t submit your documents right now. Please try again.')
        return
      }
      const json = (await res.json()) as { status?: 'Verified' | 'In_Progress' }
      if (json.status === 'Verified') {
        setState('submitted')
        return
      }
      // The live check passed but the server disagreed (rare). Ask to retry.
      setSubmitError('We couldn’t confirm your documents. Please re-upload clearer photos and try again.')
    } catch (err) {
      console.error('[identity-verify] submit failed:', err)
      setSubmitError('Something went wrong while submitting. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // On mount, resolve the tenant bound to the token within a 5s bound.
  useEffect(() => {
    if (!token) {
      setState('invalid')
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONTEXT_FETCH_TIMEOUT_MS)

    async function loadContext() {
      try {
        const res = await fetch(`/api/identity-verify/${token}`, { signal: controller.signal })
        if (cancelled) return
        if (res.status === 404) {
          setState('invalid')
          return
        }
        if (!res.ok) {
          setState('load_error')
          return
        }
        const json = await res.json()
        if (cancelled) return
        if (!json?.valid) {
          setState('invalid')
          return
        }
        const ctx: PortalTenantContext = {
          name: json.name,
          room: json.room ?? null,
          alreadyVerified: json.alreadyVerified === true,
        }
        setContext(ctx)
        setState(ctx.alreadyVerified ? 'already_done' : 'input_ready')
      } catch (error) {
        if (cancelled) return
        console.error('[identity-verify] context load failed:', error)
        setState('load_error')
      } finally {
        clearTimeout(timeoutId)
      }
    }

    loadContext()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [token])

  const header = context ? roomDisplay(context) : null

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden relative">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">Staytraq</h1>
          <p className="text-sm text-neutral-400">Identity Verification Portal</p>
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
              <p className="text-neutral-400 font-medium">Validating verification link...</p>
            </motion.div>
          )}

          {state === 'invalid' && (
            <motion.div key="invalid" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <Card className="bg-neutral-900/50 border-neutral-800 backdrop-blur-xl">
                <CardContent className="pt-6 flex flex-col items-center text-center">
                  <div className="h-16 w-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="h-8 w-8 text-red-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-2">Invalid or Expired Link</h2>
                  <p className="text-neutral-400 text-sm">
                    This verification link is no longer valid. Please contact your property owner for a new link.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {state === 'load_error' && (
            <motion.div key="load_error" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <Card className="bg-neutral-900/50 border-neutral-800 backdrop-blur-xl">
                <CardContent className="pt-6 flex flex-col items-center text-center">
                  <div className="h-16 w-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="h-8 w-8 text-amber-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-2">Couldn&apos;t Load This Page</h2>
                  <p className="text-neutral-400 text-sm mb-5">
                    We couldn&apos;t load your verification details. Please check your connection and try again.
                  </p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Try again
                  </button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {state === 'already_done' && (
            <motion.div key="already_done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-green-500" />
                <CardContent className="pt-8 pb-8 flex flex-col items-center text-center">
                  <div className="h-20 w-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Already Verified</h2>
                  <p className="text-neutral-400 text-center max-w-sm text-sm">
                    {header?.name ? (
                      <>
                        Hey <span className="font-semibold text-white">{header.name}</span>, your identity has
                        already been verified. There&apos;s nothing more to submit.
                      </>
                    ) : (
                      <>Your identity has already been verified. There&apos;s nothing more to submit.</>
                    )}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {state === 'input_ready' && header && (
            <motion.div key="input_ready" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
              {/* Tenant context header */}
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-blue-500" />
                <CardHeader>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-white text-lg">Verify Your Identity</CardTitle>
                  </div>
                  <CardDescription className="text-neutral-400">
                    Confirm the details below belong to you, then upload your identity document.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="w-full bg-neutral-950/50 border border-neutral-800 rounded-xl p-4 space-y-2.5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-500">Name</span>
                      <span className="font-semibold text-white">{header.name}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-500 flex items-center gap-1.5">
                        <BedDouble className="h-3.5 w-3.5" /> Room / Bed
                      </span>
                      <span className={`font-semibold ${header.hasRoom ? 'text-white' : 'text-neutral-500 italic'}`}>
                        {header.room}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Identity-type selection */}
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-base">Select identity type</CardTitle>
                  <CardDescription className="text-neutral-400">Choose the document you&apos;d like to submit.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {IDENTITY_TYPE_OPTIONS.map((option) => {
                      const Icon = option.icon
                      const active = selectedType === option.type
                      return (
                        <button
                          key={option.type}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => handleSelectType(option.type)}
                          className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                            active
                              ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                              : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-700 hover:bg-neutral-900/60'
                          }`}
                        >
                          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${active ? 'bg-primary/20' : 'bg-neutral-800/80'}`}>
                            <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-neutral-400'}`} />
                          </div>
                          <div>
                            <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-neutral-200'}`}>{option.label}</p>
                            <p className="text-[11px] text-neutral-500 leading-snug mt-0.5">{option.description}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Upload controls + live verification */}
              {controls.front && (
                <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white text-base">Upload documents</CardTitle>
                    <CardDescription className="text-neutral-400">
                      {selectedType === 'Aadhaar'
                        ? 'Upload the front, then the back of your Aadhaar card. Each image is verified instantly.'
                        : 'Upload the front of your PAN card. It is verified instantly.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <UploadSlot
                      label="Front image"
                      preview={frontPreview}
                      onPick={() => frontInputRef.current?.click()}
                      onRemove={handleRemoveFront}
                      disabled={verifyStatus === 'reading' && !backFile}
                    />
                    <input ref={frontInputRef} type="file" accept="image/*" className="hidden" onChange={handleFrontChange} />

                    {controls.back && (
                      <>
                        <UploadSlot
                          label="Back image"
                          preview={backPreview}
                          onPick={() => backInputRef.current?.click()}
                          onRemove={handleRemoveBack}
                          disabled={!backUploadEnabled}
                          disabledHint={
                            verifyStatus === 'reading' && !aadhaarFrontNumber
                              ? 'Verifying the front image…'
                              : 'Upload a valid front image first'
                          }
                        />
                        <input ref={backInputRef} type="file" accept="image/*" className="hidden" onChange={handleBackChange} disabled={!backUploadEnabled} />
                      </>
                    )}

                    {/* Live verification status */}
                    {verifyStatus === 'reading' && (
                      <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm text-neutral-300">Verifying your document…</span>
                      </div>
                    )}
                    {verifyStatus === 'await_back' && (
                      <div className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                        <CheckCircle2 className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-blue-200">Front verified. Now upload the back of your Aadhaar.</span>
                      </div>
                    )}
                    {verifyStatus === 'verified' && (
                      <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-3">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-semibold text-green-300">Verified</span>
                      </div>
                    )}
                    {verifyStatus === 'failed' && failReason && (
                      <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                        <p className="text-sm text-red-200">{failReason}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Consent + submit — only once a type is selected */}
              {selectedType && (
                <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-2xl">
                  <CardContent className="pt-6 space-y-4">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={consent}
                      onClick={() => {
                        setConsent((c) => !c)
                        setGuardMessage(null)
                      }}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                          consent ? 'border-primary bg-primary text-white' : 'border-neutral-700 bg-neutral-950'
                        }`}
                      >
                        {consent && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="text-xs leading-relaxed text-neutral-300">{CONSENT_LABEL}</span>
                    </button>

                    {guardMessage && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                        <p className="text-xs text-amber-200">{guardMessage}</p>
                      </div>
                    )}
                    {submitError && (
                      <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                        <p className="text-xs text-red-200">{submitError}</p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting}
                      aria-disabled={!canSubmit || submitting}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                        canSubmit && !submitting
                          ? 'bg-primary text-white hover:bg-primary/90'
                          : 'cursor-not-allowed bg-neutral-800 text-neutral-500'
                      }`}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Submitting…
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4" />
                          Submit for verification
                        </>
                      )}
                    </button>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {state === 'submitted' && (
            <motion.div key="submitted" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-green-500" />
                <CardContent className="pt-8 pb-8 flex flex-col items-center">
                  <div className="h-20 w-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Identity Verified</h2>
                  <p className="text-neutral-400 text-center max-w-sm text-sm">
                    Thank you. Your identity documents have been verified and submitted successfully.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 text-center">
          <p className="text-xs text-neutral-600 flex items-center justify-center gap-1">
            Secure verification portal powered by <span className="font-semibold text-neutral-500">Staytraq</span>
          </p>
        </div>
      </div>
    </div>
  )
}

// A single image upload control with preview + remove, matching the dark theme.
// When `disabled`, the control is non-interactive and shows a lock hint.
function UploadSlot({
  label,
  preview,
  onPick,
  onRemove,
  disabled,
  disabledHint,
}: {
  label: string
  preview: string | null
  onPick: () => void
  onRemove: () => void
  disabled: boolean
  disabledHint?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-300">{label}</span>
        {preview && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] font-medium text-neutral-400 hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Remove
          </button>
        )}
      </div>

      {preview ? (
        <div className="relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={`${label} preview`} className="w-full max-h-56 object-contain" />
        </div>
      ) : (
        <button
          type="button"
          onClick={disabled ? undefined : onPick}
          disabled={disabled}
          aria-disabled={disabled}
          className={`w-full rounded-xl border border-dashed p-6 flex flex-col items-center justify-center gap-2 transition-all ${
            disabled
              ? 'border-neutral-800 bg-neutral-950/40 cursor-not-allowed opacity-60'
              : 'border-neutral-700 bg-neutral-950/60 hover:border-primary/50 hover:bg-neutral-900/60 cursor-pointer'
          }`}
        >
          {disabled ? <Lock className="h-5 w-5 text-neutral-600" /> : <ImageUp className="h-5 w-5 text-neutral-400" />}
          <span className="text-xs text-neutral-400 font-medium">
            {disabled ? disabledHint ?? 'Locked' : 'Tap to upload an image'}
          </span>
        </button>
      )}
    </div>
  )
}
