import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyAadhaar, classifyPan, type IdentityType, type VerificationOutcome } from '@/lib/identity/verify'
import { acceptBack } from '@/lib/identity/portal'

// Private bucket holding encrypted identity document images. Path layout is
// {owner_id}/{tenant_id}/{front|back}.{ext} (Req 18.1).
const IDENTITY_BUCKET = 'identity_documents'

// Derive a safe file extension from an uploaded image's name, falling back to
// jpg when the client supplies a name without one.
function fileExtension(file: File): string {
  const parts = file.name.split('.')
  const ext = parts.length > 1 ? parts.pop() : undefined
  const clean = (ext || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return clean.length > 0 ? clean : 'jpg'
}

// POST: receives the tenant's identity submission for the public verification
// portal. The portal runs tesseract.js OCR on the uploaded images client-side
// and posts the extracted text alongside the image files. This route is the
// authoritative verifier: it re-runs the pure classification rules over the
// supplied text and, only on a fully-passing submission, writes the encrypted
// images to the private identity_documents bucket and persists the identity
// type, image references, and identity code in a single update. Any storage or
// encryption failure rejects the whole submission with no partial object and no
// status/reference change (Reqs 7.3, 9.5, 10.6, 12.1, 12.2, 12.3, 12.4, 18.1,
// 18.2).
//
// Request contract (multipart/form-data):
//   identity_type : "Aadhaar" | "PAN"            (required)
//   consent       : "true"                        (required — mandatory consent)
//   front_text    : string  OCR text of front image (required)
//   back_text     : string  OCR text of back image  (Aadhaar only)
//   front_image   : File    front document image    (required)
//   back_image    : File    back document image      (Aadhaar only)
//
// Response (200): { success: true, status: "Verified" | "In_Progress", reasons: string[] }
// On a guarded failure (storage/encryption) the route returns a 5xx error and
// makes no status/reference change so the portal may retry (Req 12.5).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Verification token is required' }, { status: 400 })
    }

    const formData = await request.formData()
    const identityType = (formData.get('identity_type') as string | null)?.trim() as
      | IdentityType
      | null
      | undefined
    const consent = (formData.get('consent') as string | null) === 'true'
    const frontText = (formData.get('front_text') as string | null) ?? ''
    const backText = (formData.get('back_text') as string | null) ?? ''
    const frontImage = formData.get('front_image') as File | null
    const backImage = formData.get('back_image') as File | null

    // Validate the selected identity type (only Aadhaar / PAN are accepted).
    if (identityType !== 'Aadhaar' && identityType !== 'PAN') {
      return NextResponse.json(
        { error: 'A valid identity type (Aadhaar or PAN) is required' },
        { status: 400 }
      )
    }

    // Consent is mandatory; the server enforces it even though the portal also
    // gates the submit button (Req 11.2, 11.5).
    if (!consent) {
      return NextResponse.json({ error: 'Consent is required to submit identity documents' }, { status: 400 })
    }

    const hasFront = !!frontImage && frontImage.size > 0
    const hasBack = !!backImage && backImage.size > 0

    // Reject a back image submitted without a completed front image (Req 7.3).
    // `acceptBack` returns false when the front has not completed; in that case a
    // supplied back image must not be stored.
    if (hasBack && !acceptBack({ type: identityType, frontCompleted: hasFront, backUploaded: hasBack })) {
      return NextResponse.json(
        { error: 'The front image must be uploaded before the back image.' },
        { status: 400 }
      )
    }

    // Enforce the document images required by the selected type (Req 11.6).
    if (!hasFront) {
      return NextResponse.json({ error: 'A front document image is required' }, { status: 400 })
    }
    if (identityType === 'Aadhaar' && !hasBack) {
      return NextResponse.json({ error: 'A back document image is required for Aadhaar' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Resolve the single tenant bound to this verification token. The partial
    // unique index guarantees at most one match (Req 4.2).
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

    // A tenant that has already verified does not resubmit (Req 4.3).
    if (tenant.verification_status === 'Verified') {
      return NextResponse.json({ error: 'This identity has already been verified' }, { status: 409 })
    }

    // Run the authoritative pure classification over the extracted OCR text.
    const outcome: VerificationOutcome =
      identityType === 'Aadhaar'
        ? classifyAadhaar(frontText, backText, tenant.name || '')
        : classifyPan(frontText, tenant.name || '')

    // On anything short of a fully-passing submission, store nothing — no images,
    // no identity code, no type, no references — and only record the in-progress
    // status (Reqs 9.7, 9.8, 9.9, 10.4, 10.5, 12.2). The portal uses the returned
    // reasons to show the failure details (Reqs 9.6, 10.7).
    if (outcome.status !== 'Verified') {
      const { error: progressErr } = await supabase
        .from('tenants_table')
        .update({ verification_status: 'In_Progress' })
        .eq('id', tenant.id)

      if (progressErr) {
        console.error('[identity-verify/submit] Error updating In_Progress status:', JSON.stringify(progressErr))
        return NextResponse.json({ error: 'Failed to record submission' }, { status: 500 })
      }

      return NextResponse.json({ success: true, status: 'In_Progress', reasons: outcome.reasons })
    }

    // ---- Full success: write encrypted images, then persist atomically ----
    //
    // Upload the document images to the private bucket. The whole submission is
    // rejected on any storage failure, leaving no partial object and no
    // status/reference change. We track successfully uploaded paths so that a
    // later failure (a second image or the DB write) can roll the storage back
    // before returning, guaranteeing no orphaned/partial object (Reqs 12.4,
    // 18.2).
    const uploadedPaths: string[] = []

    const uploadImage = async (
      image: File,
      side: 'front' | 'back'
    ): Promise<{ path: string } | { error: string }> => {
      const path = `${tenant.owner_id}/${tenant.id}/${side}.${fileExtension(image)}`
      const { error: uploadError } = await supabase.storage
        .from(IDENTITY_BUCKET)
        .upload(path, image, {
          cacheControl: '3600',
          contentType: image.type || 'image/jpeg',
          upsert: true,
        })

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
        if (removeErr) {
          console.error('[identity-verify/submit] Error rolling back uploaded images:', JSON.stringify(removeErr))
        }
      }
    }

    const frontResult = await uploadImage(frontImage as File, 'front')
    if ('error' in frontResult) {
      await rollbackStorage()
      return NextResponse.json({ error: 'Failed to store the submitted document' }, { status: 500 })
    }

    let backPath: string | null = null
    if (identityType === 'Aadhaar') {
      const backResult = await uploadImage(backImage as File, 'back')
      if ('error' in backResult) {
        // No partial object: remove the front image we just stored.
        await rollbackStorage()
        return NextResponse.json({ error: 'Failed to store the submitted document' }, { status: 500 })
      }
      backPath = backResult.path
    }

    // Persist the identity type, image references, identity code, and Verified
    // status in a single update so the record is never left partially written
    // (Reqs 12.1, 12.3). If this write fails, roll back the stored images so no
    // orphaned object remains and the status is unchanged (Req 12.4).
    const updatePayload: Record<string, unknown> = {
      identity_type: identityType,
      id_front_path: frontResult.path,
      id_back_path: backPath,
      verification_status: 'Verified',
      aadhaar_number: identityType === 'Aadhaar' ? outcome.code : null,
      pan_code: identityType === 'PAN' ? outcome.code : null,
    }

    const { error: updateError } = await supabase
      .from('tenants_table')
      .update(updatePayload)
      .eq('id', tenant.id)

    if (updateError) {
      console.error('[identity-verify/submit] Error persisting verified submission:', JSON.stringify(updateError))
      await rollbackStorage()
      return NextResponse.json({ error: 'Failed to record submission' }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: 'Verified', reasons: [] })
  } catch (error) {
    console.error('[identity-verify/submit] POST unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
