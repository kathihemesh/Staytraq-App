import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { IdentityType } from '@/lib/identity/verify'

// Private bucket holding the identity document images. Path layout is
// {owner_id}/{tenant_id}/{front|back}.jpg (Req 18.1).
const IDENTITY_BUCKET = 'identity_documents'

// Same OpenAI model the chatbot uses for auto-replies. Overridable via env.
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

// POST: receives the tenant's identity submission for the public verification
// portal. The portal compresses the images client-side and posts them here on
// SUBMIT (not on upload, to avoid per-image model cost). This route is the
// authoritative verifier: it asks the OpenAI vision model to confirm the image
// is a genuine document of the selected type, that it is readable, and that the
// holder name matches the tenant; the model returns the extracted ID number on
// success or a human-readable reason on failure. Only on a passing result are
// the images stored to the private `identity_documents` bucket and the identity
// type + code + references + Verified status persisted in one update. Any
// storage failure rejects the whole submission with no partial object/state.
//
// Request contract (multipart/form-data):
//   identity_type : "Aadhaar" | "PAN"   (required)
//   consent       : "true"               (required)
//   front_image   : File  (required; JPEG, compressed client-side)
//   back_image    : File  (Aadhaar only)
//
// Response (200): { success: true, status: "Verified" | "In_Progress", reason?: string }

interface VisionResult {
  pass: boolean
  idType: string | null
  idNumber: string | null
  reason: string
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer())
  const mime = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

/** Ask the OpenAI vision model to verify the document. */
async function verifyWithOpenAI(args: {
  type: IdentityType
  name: string
  images: { label: string; dataUrl: string }[]
}): Promise<VisionResult | { error: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { error: 'OPENAI_API_KEY is not configured' }

  const { type, name, images } = args
  const requirements =
    type === 'Aadhaar'
      ? 'an Indian Aadhaar card. The front must show "Government of India", a 12-digit Aadhaar number, and the holder\'s name. If a back image is provided, it must show the same 12-digit number and "Unique Identification Authority of India".'
      : 'an Indian PAN card. It must show "Permanent Account Number", a PAN code formatted as five letters, four digits, then one letter, and the holder\'s name.'
  const idShape =
    type === 'Aadhaar'
      ? 'the 12-digit Aadhaar number as digits only (no spaces)'
      : 'the 10-character PAN code in uppercase'

  const systemPrompt =
    'You are a strict identity-document verifier. You are shown image(s) of an identity ' +
    'document along with the expected document type and the tenant name. Decide whether the ' +
    'image is a genuine, fully readable document of the expected type, and whether the name on ' +
    'the document matches the tenant name (allow minor differences: transliteration, initials, ' +
    'middle names, and word ordering). Respond ONLY with a single compact JSON object, no prose.'

  const userText =
    `Expected document type: ${type} — ${requirements}\n` +
    `Tenant name to match: "${name}"\n\n` +
    'Return JSON with exactly these fields:\n' +
    '{\n' +
    `  "pass": boolean,            // true only if it is a genuine ${type}, readable, and the name matches\n` +
    '  "id_type": "Aadhaar" | "PAN" | "unknown",\n' +
    `  "id_number": string | null, // when pass is true, ${idShape}; otherwise null\n` +
    '  "reason": string            // when pass is false, one short friendly sentence the tenant can act on ' +
    '(e.g. wrong document type, blurry/unreadable, rotated, glare, or the name does not match). When pass is true, "ok".\n' +
    '}'

  const content: Array<Record<string, unknown>> = [{ type: 'text', text: userText }]
  for (const img of images) {
    content.push({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'high' } })
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[identity-verify/submit] OpenAI error', res.status, detail.slice(0, 500))
      return { error: `OpenAI request failed (${res.status})` }
    }

    const json = await res.json()
    const raw = json?.choices?.[0]?.message?.content
    if (typeof raw !== 'string') return { error: 'Empty verification response' }

    const parsed = JSON.parse(raw)
    return {
      pass: parsed?.pass === true,
      idType: typeof parsed?.id_type === 'string' ? parsed.id_type : null,
      idNumber: typeof parsed?.id_number === 'string' ? parsed.id_number : null,
      reason: typeof parsed?.reason === 'string' ? parsed.reason : '',
    }
  } catch (err) {
    console.error('[identity-verify/submit] OpenAI call/parse failed:', err)
    return { error: 'Verification service error' }
  }
}

/** Normalize the extracted code for storage: digits-only for Aadhaar, uppercase for PAN. */
function normalizeIdNumber(type: IdentityType, raw: string): string {
  return type === 'Aadhaar' ? raw.replace(/\D/g, '') : raw.replace(/\s/g, '').toUpperCase()
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Verification token is required' }, { status: 400 })
    }

    const formData = await request.formData()
    const identityType = (formData.get('identity_type') as string | null)?.trim() as IdentityType | null
    const consent = (formData.get('consent') as string | null) === 'true'
    const frontImage = formData.get('front_image') as File | null
    const backImage = formData.get('back_image') as File | null

    if (identityType !== 'Aadhaar' && identityType !== 'PAN') {
      return NextResponse.json({ error: 'A valid identity type (Aadhaar or PAN) is required' }, { status: 400 })
    }
    if (!consent) {
      return NextResponse.json({ error: 'Consent is required to submit identity documents' }, { status: 400 })
    }

    const hasFront = !!frontImage && frontImage.size > 0
    const hasBack = !!backImage && backImage.size > 0
    if (!hasFront) {
      return NextResponse.json({ error: 'A front document image is required' }, { status: 400 })
    }
    if (identityType === 'Aadhaar' && !hasBack) {
      return NextResponse.json({ error: 'A back document image is required for Aadhaar' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants_table')
      .select('id, name, owner_id, verification_status')
      .eq('verification_token', token)
      .maybeSingle()

    if (tenantError) {
      console.error('[identity-verify/submit] Error fetching tenant:', JSON.stringify(tenantError))
      return NextResponse.json({ error: 'Database error validating verification link' }, { status: 500 })
    }
    if (!tenant) {
      return NextResponse.json({ error: 'Invalid or expired verification link' }, { status: 404 })
    }
    if (tenant.verification_status === 'Verified') {
      return NextResponse.json({ error: 'This identity has already been verified' }, { status: 409 })
    }

    // ---- Verify with the OpenAI vision model ----
    const images: { label: string; dataUrl: string }[] = [
      { label: 'front', dataUrl: await fileToDataUrl(frontImage as File) },
    ]
    if (identityType === 'Aadhaar' && backImage) {
      images.push({ label: 'back', dataUrl: await fileToDataUrl(backImage) })
    }

    const result = await verifyWithOpenAI({ type: identityType, name: tenant.name || '', images })
    if ('error' in result) {
      // The verification service is unavailable; do not change state, allow retry.
      return NextResponse.json(
        { error: 'The verification service is temporarily unavailable. Please try again in a moment.' },
        { status: 502 }
      )
    }

    const idNumber = result.idNumber ? normalizeIdNumber(identityType, result.idNumber) : ''
    const idLooksValid =
      identityType === 'Aadhaar' ? /^\d{12}$/.test(idNumber) : /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(idNumber)

    // Treat a "pass" with a missing/garbled ID as a soft failure so we never
    // store an invalid code.
    if (!result.pass || !idLooksValid) {
      const reason =
        (result.reason && result.reason.trim()) ||
        `We couldn't verify the uploaded image as a valid ${identityType}. Please try again with a clear, upright photo.`
      const { error: progressErr } = await supabase
        .from('tenants_table')
        .update({ verification_status: 'In_Progress' })
        .eq('id', tenant.id)
      if (progressErr) {
        console.error('[identity-verify/submit] Error updating In_Progress status:', JSON.stringify(progressErr))
        return NextResponse.json({ error: 'Failed to record submission' }, { status: 500 })
      }
      return NextResponse.json({ success: true, status: 'In_Progress', reason })
    }

    // ---- Passed: store images, then persist atomically. ----
    const uploadedPaths: string[] = []
    const uploadImage = async (image: File, side: 'front' | 'back'): Promise<{ path: string } | { error: string }> => {
      const path = `${tenant.owner_id}/${tenant.id}/${side}.jpg`
      const { error: uploadError } = await supabase.storage
        .from(IDENTITY_BUCKET)
        .upload(path, image, { cacheControl: '3600', contentType: image.type || 'image/jpeg', upsert: true })
      if (uploadError) {
        console.error(`[identity-verify/submit] Error uploading ${side} image:`, JSON.stringify(uploadError))
        return { error: uploadError.message }
      }
      uploadedPaths.push(path)
      return { path }
    }
    const rollbackStorage = async () => {
      if (uploadedPaths.length > 0) {
        const { error: removeErr } = await supabase.storage.from(IDENTITY_BUCKET).remove(uploadedPaths)
        if (removeErr) console.error('[identity-verify/submit] Error rolling back images:', JSON.stringify(removeErr))
      }
    }

    const frontResult = await uploadImage(frontImage as File, 'front')
    if ('error' in frontResult) {
      await rollbackStorage()
      return NextResponse.json({ error: 'Failed to store the submitted document' }, { status: 500 })
    }
    let backPath: string | null = null
    if (identityType === 'Aadhaar' && backImage) {
      const backResult = await uploadImage(backImage, 'back')
      if ('error' in backResult) {
        await rollbackStorage()
        return NextResponse.json({ error: 'Failed to store the submitted document' }, { status: 500 })
      }
      backPath = backResult.path
    }

    const { error: updateError } = await supabase
      .from('tenants_table')
      .update({
        identity_type: identityType,
        id_front_path: frontResult.path,
        id_back_path: backPath,
        verification_status: 'Verified',
        aadhaar_number: identityType === 'Aadhaar' ? idNumber : null,
        pan_code: identityType === 'PAN' ? idNumber : null,
      })
      .eq('id', tenant.id)

    if (updateError) {
      console.error('[identity-verify/submit] Error persisting verified submission:', JSON.stringify(updateError))
      await rollbackStorage()
      return NextResponse.json({ error: 'Failed to record submission' }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: 'Verified' })
  } catch (error) {
    console.error('[identity-verify/submit] POST unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
