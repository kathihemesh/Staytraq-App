'use client'

import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
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
import {
  roomDisplay,
  controlsForType,
  backEnabled,
  resetBackOnFrontChange,
  submitEnabled,
  type PortalTenantContext,
  type PortalUploadState,
} from '@/lib/identity/portal'
import type { IdentityType } from '@/lib/identity/verify'

// Public tenant identity verification portal.
//
// Task 6.1 scope: the portal state machine and the shared theme shell only. The
// theme (dark `bg-neutral-950` surface, primary/blue accent glows, the Staytraq
// brand header, shadcn `Card`, `framer-motion` transitions, `sonner` toasts) is
// reused verbatim from the Payment portal (`web/app/pay/[token]`) and the
// Complaint portal (`web/app/complaint-submit/[token]`) so a side-by-side
// comparison shows no visible difference (Req 5).
//
// Task 6.2 scope (this change): the identity-type selection and the
// front-before-back upload controls inside `input_ready`. Two type options
// (Aadhaar, PAN) are presented with none preselected and at most one selected
// at a time (Reqs 6.1, 6.5, 6.6); the visible upload controls are derived from
// `controlsForType` (Aadhaar = front+back, PAN = front only, none = nothing)
// (Reqs 6.2, 6.3, 6.4, 6.7). The back-image control stays disabled until the
// front preview is shown and is then enabled within 2 seconds (Reqs 7.1, 7.2),
// and removing/replacing the front discards the back and re-disables its
// control (Req 7.4) via `resetBackOnFrontChange`/`backEnabled`.
//
// Task 6.3 scope (this change): consent, OCR wiring, deferred check display,
// and submit inside `input_ready`. The `Consent_Checkbox` renders the exact
// required label (Req 11.1). On submit the portal runs `tesseract.js` OCR over
// the front (and, for Aadhaar, the back) image, then POSTs the extracted text +
// images to the submit route, which is the authoritative verifier. Per-check
// results are HIDDEN until OCR + verification complete; while processing a
// loading indicator is shown, then any failure reasons returned for an
// `In_Progress` result are displayed (Reqs 9.6, 10.7). Submission is gated on
// consent + the images required by the selected type via `submitEnabled`
// (Reqs 11.2, 11.3, 11.4). Attempting to submit without consent or without the
// required images is prevented with the corresponding message while preserving
// the uploaded images and consent state (Reqs 11.5, 11.6); a guarded server
// failure (storage/encryption 5xx) shows an error and allows retry without
// advancing, also preserving images/consent (Req 12.5). On a `Verified` result
// the portal transitions to the `submitted` state. Upload controls are NEVER
// rendered outside `input_ready` (Reqs 4.2, 4.3, 4.4, 4.5).

// The exact, verbatim Consent_Checkbox label text required by Req 11.1. The
// leading ☐ glyph from the requirement is rendered as a real checkbox control
// rather than literal text, so the label string below omits it.
const CONSENT_LABEL =
  'I understand and agree to submit my identity documents for verification purposes. ' +
  'Your documents will be encrypted and stored securely and will only be visible to the property owner. ' +
  'They will be automatically deleted within 15 days after you move out. ' +
  'This information is collected only to help property owners verify tenant identities ' +
  'and maintain a safe and trusted living environment.'

// The two selectable identity types presented on the portal (Req 6.1). Kept as
// data so the option list and the upload controls stay in lockstep.
const IDENTITY_TYPE_OPTIONS: ReadonlyArray<{
  type: IdentityType
  label: string
  description: string
  icon: typeof Fingerprint
}> = [
  { type: 'Aadhaar', label: 'Aadhaar', description: 'Front & back of your Aadhaar card', icon: Fingerprint },
  { type: 'PAN', label: 'PAN', description: 'Front of your PAN card', icon: CreditCard },
]

// The front preview must enable the back control "within 2 seconds" (Req 7.2).
// We use a short, well-under-2s delay so the enable transition is observable
// while comfortably satisfying the bound.
const BACK_ENABLE_DELAY_MS = 400

type PortalState =
  | 'loading' // retrieving the tenant for the token (Req 4.4)
  | 'invalid' // no tenant matches the token (Req 4.2)
  | 'load_error' // >5s, or a system/network error (Req 4.5)
  | 'already_done' // verification_status === 'Verified' (Req 4.3)
  | 'input_ready' // type selection + upload + consent + submit (Reqs 4.1, 6, 7, 11)
  | 'submitted'

// The tenant context fetch is bounded to 5 seconds; exceeding it (or any
// network/system failure) lands in the `load_error` state (Reqs 4.1, 4.5).
const CONTEXT_FETCH_TIMEOUT_MS = 5000

export default function IdentityVerifyPage() {
  const params = useParams()
  const token = params.token as string

  const [state, setState] = useState<PortalState>('loading')
  const [context, setContext] = useState<PortalTenantContext | null>(null)

  // ---- Task 6.2 upload state ----------------------------------------------
  // These variables are the foundation task 6.3 builds the consent + OCR +
  // submit flow on top of:
  //   selectedType   - the chosen IdentityType, or null when none is selected
  //   frontFile      - the raw front-image File (null until one is chosen)
  //   frontPreview   - an object URL for the front image preview (null = none)
  //   frontCompleted - true once the front preview is shown (= "upload done")
  //   backFile       - the raw back-image File (Aadhaar only; null otherwise)
  //   backPreview    - an object URL for the back image preview (null = none)
  //   backControlEnabled - true once the back control has been enabled (within
  //                        2s of the front preview); gated additionally by
  //                        `backEnabled(...)` so it can never be true without a
  //                        completed front.
  const [selectedType, setSelectedType] = useState<IdentityType | null>(null)
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [frontPreview, setFrontPreview] = useState<string | null>(null)
  const [frontCompleted, setFrontCompleted] = useState(false)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [backPreview, setBackPreview] = useState<string | null>(null)
  const [backControlEnabled, setBackControlEnabled] = useState(false)

  // ---- Task 6.3 consent + submit state ------------------------------------
  //   consent       - whether the mandatory Consent_Checkbox is selected
  //   processing     - true while OCR + verification + POST are in flight; used
  //                    to drive the deferred-result loading indicator and to
  //                    keep per-check results hidden until everything completes
  //   guardMessage   - the "consent is required" / "document upload is required"
  //                    message shown when a submit attempt is blocked (Reqs
  //                    11.5, 11.6); cleared on the next valid attempt
  //   submitError    - a guarded server-failure message (storage/encryption
  //                    5xx) that allows retry without advancing (Req 12.5)
  //   failureReasons - the per-check failure reasons for an `In_Progress`
  //                    result, shown only AFTER verification completes (Reqs
  //                    9.6, 10.7); null while none / not yet computed
  const [consent, setConsent] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [guardMessage, setGuardMessage] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [failureReasons, setFailureReasons] = useState<string[] | null>(null)

  const frontInputRef = useRef<HTMLInputElement | null>(null)
  const backInputRef = useRef<HTMLInputElement | null>(null)
  // Tracks the pending "enable back within 2s" timer so it can be cleared when
  // the front is removed/replaced before it fires.
  const backEnableTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The pure upload state the portal predicates operate on.
  const uploadState: PortalUploadState = {
    type: selectedType,
    frontCompleted,
    backUploaded: backFile !== null,
  }
  const controls = controlsForType(selectedType)
  // The back control is only ever interactive when the type requires a back
  // image AND the front is complete AND the (within-2s) enable delay elapsed.
  const isBackEnabled = backEnabled(uploadState) && backControlEnabled

  // Whether the submission action is enabled (Reqs 11.2, 11.3, 11.4): consent
  // given, a type selected, and every image required by that type uploaded.
  const canSubmit = submitEnabled(consent, selectedType, {
    front: frontFile !== null,
    back: backFile !== null,
  })

  // Revoke any object URLs and clear the pending enable timer on unmount so we
  // don't leak blob URLs or fire a timer after teardown.
  useEffect(() => {
    return () => {
      if (frontPreview) URL.revokeObjectURL(frontPreview)
      if (backPreview) URL.revokeObjectURL(backPreview)
      if (backEnableTimer.current) clearTimeout(backEnableTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontPreview, backPreview])

  // Discard the back image and return its control to the disabled state. Used
  // both when the front changes and when the type changes (Req 7.4).
  const discardBack = () => {
    if (backEnableTimer.current) {
      clearTimeout(backEnableTimer.current)
      backEnableTimer.current = null
    }
    setBackControlEnabled(false)
    setBackPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setBackFile(null)
    if (backInputRef.current) backInputRef.current.value = ''
  }

  // Clear the front image and everything that depends on it.
  const discardFront = () => {
    setFrontPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setFrontFile(null)
    setFrontCompleted(false)
    if (frontInputRef.current) frontInputRef.current.value = ''
  }

  // Selecting / changing the identity type. Enforces "at most one selected"
  // (single-valued state) and resets uploads so controls only ever reflect the
  // currently selected type (Reqs 6.6, 6.7). Clicking the active type again
  // clears the selection back to "none" (Req 6.5).
  const handleSelectType = (type: IdentityType) => {
    if (type === selectedType) {
      setSelectedType(null)
    } else {
      setSelectedType(type)
    }
    // Any type change invalidates previously uploaded, type-specific images.
    discardBack()
    discardFront()
  }

  // The front image was chosen (or replaced). Generate a preview, mark the
  // front complete, and — because the front changed — discard any back image
  // and re-disable the back control before enabling it within 2s (Reqs 7.2,
  // 7.4) using `resetBackOnFrontChange` semantics.
  const handleFrontChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Replacing the front resets the back (Req 7.4).
    discardBack()

    setFrontPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setFrontFile(file)
    setFrontCompleted(true)

    // Mirror the reset in the pure model for clarity/traceability.
    resetBackOnFrontChange(uploadState)

    // Enable the back control within 2 seconds of showing the front preview
    // (Req 7.2). Only relevant when the selected type requires a back image.
    if (backEnableTimer.current) clearTimeout(backEnableTimer.current)
    if (controlsForType(selectedType).back) {
      backEnableTimer.current = setTimeout(() => {
        setBackControlEnabled(true)
      }, BACK_ENABLE_DELAY_MS)
    }
  }

  // The back image was chosen. Only reachable while the back control is
  // enabled (front complete), so no extra ordering guard is needed here.
  const handleBackChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBackPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setBackFile(file)
  }

  // Remove the front image explicitly: clears the front and discards the back
  // (Req 7.4).
  const handleRemoveFront = () => {
    discardFront()
    discardBack()
  }

  const handleRemoveBack = () => {
    discardBack()
  }

  // Run tesseract.js OCR over a single image and return the extracted text.
  // Reuses the same dynamic import + worker lifecycle the Payment portal uses
  // (`web/app/pay/[token]`) so OCR behavior stays consistent across portals.
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

  // Submit handler. Enforces the consent + required-image guards (Reqs 11.5,
  // 11.6), runs OCR client-side, posts the extracted text + images to the
  // authoritative submit route, and applies the deferred-result display:
  // per-check results stay hidden until the response arrives (Reqs 9.6, 10.7),
  // then `Verified` advances to `submitted` while `In_Progress` shows the
  // returned failure reasons. A guarded 5xx failure shows a retryable error and
  // does not advance (Req 12.5). Uploaded images and consent are preserved
  // across every blocked / failed path.
  const handleSubmit = async () => {
    if (processing) return

    // Clear any prior messages so a fresh attempt starts clean.
    setGuardMessage(null)
    setSubmitError(null)
    setFailureReasons(null)

    // Guard: consent is mandatory (Req 11.5). Preserve images + consent state.
    if (!consent) {
      setGuardMessage('Consent is required before you can submit.')
      return
    }

    // Guard: the images required by the selected type must all be present
    // (Req 11.6). `canSubmit` also covers a missing type selection.
    if (!canSubmit) {
      setGuardMessage('Please upload the required document image(s) before submitting.')
      return
    }

    // `canSubmit` guarantees a non-null type and the required front image here.
    const type = selectedType as IdentityType
    if (!frontFile) {
      setGuardMessage('Please upload the required document image(s) before submitting.')
      return
    }

    setProcessing(true)
    try {
      // ---- OCR: extract text from the uploaded images (hidden until done) ----
      const frontText = await runOcr(frontFile)
      const backText = type === 'Aadhaar' && backFile ? await runOcr(backFile) : ''

      // ---- POST the submission (multipart/form-data) ----
      const body = new FormData()
      body.set('identity_type', type)
      body.set('consent', 'true')
      body.set('front_text', frontText)
      body.set('front_image', frontFile)
      if (type === 'Aadhaar' && backFile) {
        body.set('back_text', backText)
        body.set('back_image', backFile)
      }

      const res = await fetch(`/api/identity-verify/${token}/submit`, {
        method: 'POST',
        body,
      })

      // A guarded server failure (storage/encryption 5xx, or any non-OK) shows a
      // retryable error and does NOT advance; images + consent are preserved
      // (Req 12.5).
      if (!res.ok) {
        setSubmitError(
          'We couldn’t submit your documents right now. Please try again.'
        )
        return
      }

      const json = (await res.json()) as {
        success?: boolean
        status?: 'Verified' | 'In_Progress'
        reasons?: string[]
      }

      if (json.status === 'Verified') {
        // Full success → completion state (Req 12.1).
        setState('submitted')
        return
      }

      // In_Progress: surface the per-check failure reasons now that all checks
      // have completed (Reqs 9.6, 10.7). Keep the tenant on the input form with
      // their images + consent intact so they can re-capture and retry.
      setFailureReasons(
        Array.isArray(json.reasons) && json.reasons.length > 0
          ? json.reasons
          : ['We could not verify your documents. Please check the images and try again.']
      )
    } catch (error) {
      console.error('[identity-verify] submit failed:', error)
      setSubmitError(
        'Something went wrong while submitting. Please check your connection and try again.'
      )
    } finally {
      setProcessing(false)
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
    // Abort the request once the 5s bound elapses -> load_error (Req 4.5).
    const timeoutId = setTimeout(() => controller.abort(), CONTEXT_FETCH_TIMEOUT_MS)

    async function loadContext() {
      try {
        const res = await fetch(`/api/identity-verify/${token}`, {
          signal: controller.signal,
        })

        if (cancelled) return

        // A 404 (or any explicit not-valid response) means the link does not
        // resolve to a tenant -> invalid (Req 4.2).
        if (res.status === 404) {
          setState('invalid')
          return
        }

        // Any other non-OK response is a system error -> load_error (Req 4.5).
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

        // A Verified tenant gets the already-complete state with no upload
        // controls (Req 4.3); otherwise the portal is ready for input (Req 4.1).
        setState(ctx.alreadyVerified ? 'already_done' : 'input_ready')
      } catch (error) {
        if (cancelled) return
        // AbortError (timeout) and network errors both surface as load_error so
        // the tenant is told the page could not be loaded (Req 4.5).
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
      {/* Background glow effects (matches the Payment portal accent treatment) */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Logo/Brand Area */}
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
                    This verification link is no longer valid. Please contact your property owner for a new link.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {state === 'load_error' && (
            <motion.div
              key="load_error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
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
            <motion.div
              key="already_done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
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
            <motion.div
              key="input_ready"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Tenant context header (Reqs 4.1, 4.6) */}
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
                    Confirm the details below belong to you, then submit your identity documents.
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
                      <span
                        className={`font-semibold ${header.hasRoom ? 'text-white' : 'text-neutral-500 italic'}`}
                      >
                        {header.room}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ---- Identity-type selection (Reqs 6.1, 6.5, 6.6) ---- */}
              <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-base">Select identity type</CardTitle>
                  <CardDescription className="text-neutral-400">
                    Choose the document you&apos;d like to submit.
                  </CardDescription>
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
                          <div
                            className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                              active ? 'bg-primary/20' : 'bg-neutral-800/80'
                            }`}
                          >
                            <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-neutral-400'}`} />
                          </div>
                          <div>
                            <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-neutral-200'}`}>
                              {option.label}
                            </p>
                            <p className="text-[11px] text-neutral-500 leading-snug mt-0.5">
                              {option.description}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* ---- Upload controls, shown only for the selected type ----
                  When no type is selected, `controls.front` is false and no
                  upload controls render at all (Req 6.2). */}
              {controls.front && (
                <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white text-base">Upload documents</CardTitle>
                    <CardDescription className="text-neutral-400">
                      {selectedType === 'Aadhaar'
                        ? 'Upload the front, then the back of your Aadhaar card.'
                        : 'Upload the front of your PAN card.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Front image upload (Req 6.3, 6.4) */}
                    <UploadSlot
                      label="Front image"
                      preview={frontPreview}
                      onPick={() => frontInputRef.current?.click()}
                      onRemove={handleRemoveFront}
                      disabled={false}
                    />
                    <input
                      ref={frontInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFrontChange}
                    />

                    {/* Back image upload (Aadhaar only). Disabled until the
                        front preview is shown, then enabled within 2s
                        (Reqs 7.1, 7.2). */}
                    {controls.back && (
                      <>
                        <UploadSlot
                          label="Back image"
                          preview={backPreview}
                          onPick={() => backInputRef.current?.click()}
                          onRemove={handleRemoveBack}
                          disabled={!isBackEnabled}
                          disabledHint={
                            frontCompleted ? 'Preparing…' : 'Upload the front image first'
                          }
                        />
                        <input
                          ref={backInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleBackChange}
                          disabled={!isBackEnabled}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ---- Consent + submit (Reqs 11.1–11.6, 9.6, 10.7, 12.x) ----
                  Only rendered once a type is selected (so its required images
                  can be reasoned about); consent itself is independent of the
                  uploaded images. */}
              {selectedType && (
                <Card className="bg-neutral-900/60 border-neutral-800 backdrop-blur-xl shadow-2xl">
                  <CardContent className="pt-6 space-y-4">
                    {/* Consent_Checkbox with the EXACT required label (Req 11.1).
                        The leading ☐ is rendered as a real checkbox control. */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={consent}
                      onClick={() => {
                        setConsent((c) => !c)
                        // A consent change clears a stale "consent required"
                        // guard so the tenant gets immediate feedback.
                        setGuardMessage(null)
                      }}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                          consent
                            ? 'border-primary bg-primary text-white'
                            : 'border-neutral-700 bg-neutral-950'
                        }`}
                      >
                        {consent && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="text-xs leading-relaxed text-neutral-300">
                        {CONSENT_LABEL}
                      </span>
                    </button>

                    {/* Deferred check display: while processing show only a
                        loading indicator (no per-check results) — Reqs 9.6, 10.7. */}
                    {processing && (
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm text-neutral-300">
                          Verifying your documents…
                        </span>
                      </div>
                    )}

                    {/* Guard messages for blocked submit attempts (Reqs 11.5, 11.6). */}
                    {guardMessage && !processing && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                        <p className="text-xs text-amber-200">{guardMessage}</p>
                      </div>
                    )}

                    {/* Retryable guarded server failure (Req 12.5). */}
                    {submitError && !processing && (
                      <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                        <p className="text-xs text-red-200">{submitError}</p>
                      </div>
                    )}

                    {/* Per-check failure reasons for an In_Progress result —
                        shown only AFTER verification completes (Reqs 9.6, 10.7). */}
                    {failureReasons && !processing && (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
                          <p className="text-xs font-semibold text-red-200">
                            We couldn’t verify your documents
                          </p>
                        </div>
                        <ul className="space-y-1 pl-6">
                          {failureReasons.map((reason, i) => (
                            <li
                              key={i}
                              className="list-disc text-xs leading-relaxed text-red-200/90"
                            >
                              {reason}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 pl-6 text-[11px] text-neutral-400">
                          Please re-capture clearer images and submit again.
                        </p>
                      </div>
                    )}

                    {/* Submit. The button reflects the enabled state visually
                        (Reqs 11.2–11.4) but stays clickable so a blocked attempt
                        can surface the guard message (Reqs 11.5, 11.6). */}
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={processing}
                      aria-disabled={!canSubmit || processing}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                        canSubmit && !processing
                          ? 'bg-primary text-white hover:bg-primary/90'
                          : 'cursor-not-allowed bg-neutral-800 text-neutral-500'
                      }`}
                    >
                      {processing ? (
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
                  <h2 className="text-2xl font-bold text-white mb-2">Documents Submitted</h2>
                  <p className="text-neutral-400 text-center max-w-sm text-sm">
                    Thank you. Your identity documents have been submitted for verification.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer info */}
        <div className="mt-8 text-center">
          <p className="text-xs text-neutral-600 flex items-center justify-center gap-1">
            Secure verification portal powered by{' '}
            <span className="font-semibold text-neutral-500">Staytraq</span>
          </p>
        </div>
      </div>
    </div>
  )
}

// A single image upload control with preview + remove, matching the portal's
// dark theme. When `disabled`, the control is non-interactive and shows a lock
// hint (used for the back image before the front completes — Req 7.1).
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
        // Showing a preview indicates the upload completed (Req 7.2).
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
          {disabled ? (
            <Lock className="h-5 w-5 text-neutral-600" />
          ) : (
            <ImageUp className="h-5 w-5 text-neutral-400" />
          )}
          <span className="text-xs text-neutral-400 font-medium">
            {disabled ? disabledHint ?? 'Locked' : 'Tap to upload an image'}
          </span>
        </button>
      )}
    </div>
  )
}
