import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import twilio from "twilio"

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)
const TWILIO_WA_NUMBER = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify auth via cookies or Authorization header (for mobile)
    const authHeader = req.headers.get("authorization")
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null

    let user: any = null
    let authErr: any = null

    if (token) {
      const { data, error } = await supabase.auth.getUser(token)
      user = data?.user
      authErr = error
    } else {
      const { data, error } = await supabase.auth.getUser()
      user = data?.user
      authErr = error
    }

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { tenantIds, message }: { tenantIds: number[]; message: string } = body

    if (!tenantIds?.length || !message) {
      return NextResponse.json({ error: "tenantIds and message are required" }, { status: 400 })
    }

    // Fetch tenants to get phone numbers (scoped to this owner)
    const { data: tenants, error: fetchErr } = await supabase
      .from("tenants_table")
      .select("id, name, mobile_number")
      .eq("owner_id", user.id)
      .in("id", tenantIds)

    if (fetchErr) throw fetchErr

    const sent: number[] = []
    const failed: { id: number; reason: string }[] = []

    const now = new Date()

    for (const tenant of tenants || []) {
      if (!tenant.mobile_number) {
        failed.push({ id: tenant.id, reason: "No phone number" })
        continue
      }

      // Normalize phone: ensure it starts with +
      const phone = tenant.mobile_number.startsWith("+")
        ? tenant.mobile_number
        : `+91${tenant.mobile_number.replace(/\D/g, "")}`

      let smsStatus: "sent" | "failed" = "failed"

      try {
        await twilioClient.messages.create({
          from: TWILIO_WA_NUMBER,
          to: `whatsapp:${phone}`,
          body: message,
        })
        smsStatus = "sent"
        sent.push(tenant.id)
      } catch (twilioErr: any) {
        console.error(`Twilio error for tenant ${tenant.id}:`, twilioErr.message)
        failed.push({ id: tenant.id, reason: twilioErr.message })
      }

      // Log to reminders table regardless of success/failure
      await supabase.from("reminders").insert({
        tenant_id: tenant.id,
        owner_id: user.id,
        message,
        sent_via: "whatsapp",
        sent_at: now.toISOString(),
        status: smsStatus,
      })
    }

    return NextResponse.json({
      sent: sent.length,
      failed: failed.length,
      failedDetails: failed,
    })
  } catch (err: any) {
    console.error("send-reminder error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
