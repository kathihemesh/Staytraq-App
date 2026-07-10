import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripHtml } from '@/lib/utils/sanitize'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Portal token is required' }, { status: 400 })
    }

    const formData = await request.formData()
    const mobile_number = (formData.get('mobile_number') as string | null) || ''
    const complaint_message = (formData.get('complaint_message') as string | null) || ''
    const imageFiles = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)

    if (!mobile_number) {
      return NextResponse.json({ error: 'Registered mobile number is required' }, { status: 400 })
    }
    if (!complaint_message || !complaint_message.trim()) {
      return NextResponse.json({ error: 'Complaint message is required' }, { status: 400 })
    }

    const MAX_IMAGES = 5
    const MAX_BYTES = 5 * 1024 * 1024
    if (imageFiles.length > MAX_IMAGES) {
      return NextResponse.json({ error: `You can attach at most ${MAX_IMAGES} images.` }, { status: 400 })
    }
    for (const f of imageFiles) {
      if (f.size > MAX_BYTES) {
        return NextResponse.json({ error: 'Each image must be 5MB or smaller.' }, { status: 400 })
      }
      if (f.type && !f.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Only image files can be attached.' }, { status: 400 })
      }
    }

    const supabase = createAdminClient()

    // 1. Fetch owner record matching the complaint_token
    const { data: ownerRecord, error: ownerError } = await supabase
      .from('pg_owners')
      .select('id')
      .eq('complaint_token', token)
      .single()

    if (ownerError || !ownerRecord) {
      return NextResponse.json({ error: 'Invalid or expired complaint portal link' }, { status: 404 })
    }

    // 2. Fetch active tenants under this owner to verify identity
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants_table')
      .select('id, mobile_number, pg_id')
      .eq('owner_id', ownerRecord.id)
      .eq('status', 'active')

    if (tenantsError || !tenants) {
      console.error('[complaint-submit/submit] Error fetching tenants:', JSON.stringify(tenantsError))
      return NextResponse.json({ error: 'No active tenants found for this property' }, { status: 404 })
    }

    // Clean input mobile number
    const cleanInput = mobile_number.replace(/\D/g, '')
    if (cleanInput.length < 10) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit mobile number' }, { status: 400 })
    }

    // Look for a matching tenant
    const matchedTenant = tenants.find((t) => {
      if (!t.mobile_number) return false
      const dbClean = t.mobile_number.replace(/\D/g, '')
      return dbClean.slice(-10) === cleanInput.slice(-10)
    })

    if (!matchedTenant) {
      return NextResponse.json({ error: 'No tenant found matching this mobile number. Please check or contact the property owner.' }, { status: 404 })
    }

    // Store cleaned 10-digit phone number for uniformity
    const tenantPhoneDb = cleanInput.slice(-10)

    // 3. Enforce Rate Limiting: 3 complaints per hour per phone number
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await supabase
      .from('complaints')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_phone', tenantPhoneDb)
      .gte('created_at', oneHourAgo)

    if (countError) {
      console.error('[complaint-submit/submit] Error checking rate limit:', JSON.stringify(countError))
      return NextResponse.json({ error: 'Database error checking submission limit' }, { status: 500 })
    }

    if (count !== null && count >= 3) {
      return NextResponse.json({
        error: 'Too many requests. You have reached the limit of 3 complaints per hour. Please try again later.'
      }, { status: 429 })
    }

    // 4. Upload any attached images to the private complaint_images bucket.
    //    Path layout: {owner_id}/{folder}/{i}.{ext} (owner-scoped RLS). Uploads
    //    use the service-role admin client and bypass storage RLS.
    const uploadedPaths: string[] = []
    if (imageFiles.length > 0) {
      const folder = `${ownerRecord.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i]
        const ext = ((file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')) || 'jpg'
        const path = `${folder}/${i}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('complaint_images')
          .upload(path, file, { cacheControl: '3600', contentType: file.type || 'image/jpeg', upsert: true })
        if (uploadError) {
          console.error('[complaint-submit/submit] Error uploading image:', JSON.stringify(uploadError))
          if (uploadedPaths.length > 0) {
            await supabase.storage.from('complaint_images').remove(uploadedPaths)
          }
          return NextResponse.json({ error: 'Failed to upload complaint image' }, { status: 500 })
        }
        uploadedPaths.push(path)
      }
    }

    // 5. Insert complaint record
    const sanitizedMessage = stripHtml(complaint_message.trim())

    const { error: insertError } = await supabase
      .from('complaints')
      .insert({
        owner_id: ownerRecord.id,
        pg_id: matchedTenant.pg_id,
        tenant_phone: tenantPhoneDb,
        complaint_message: sanitizedMessage,
        status: 'Under Working',
        image_paths: uploadedPaths.length > 0 ? uploadedPaths : null
      })

    if (insertError) {
      console.error('[complaint-submit/submit] Error inserting complaint:', JSON.stringify(insertError))
      // Roll back any uploaded images so we don't leave orphaned objects.
      if (uploadedPaths.length > 0) {
        await supabase.storage.from('complaint_images').remove(uploadedPaths)
      }
      return NextResponse.json({ error: 'Failed to submit complaint' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[complaint-submit/submit] POST unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
