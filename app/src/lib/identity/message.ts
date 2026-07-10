import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Pure identity-request message builder + a thin retrying sender that wraps the
 * existing chatbot WhatsApp delivery path used by `app/src/app/(tabs)/tenants.tsx`
 * (`POST {CHATBOT_API_URL}/api/v1/send-whatsapp-notice`).
 *
 * This module imports no React Native APIs so it can be property-tested with
 * vitest + fast-check. All side-effecting collaborators (fetch, the Supabase
 * client, the chatbot base URL, the per-attempt timeout) are injectable.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

/** Maximum total delivery attempts per tenant (Req 3.4). */
export const MAX_SEND_ATTEMPTS = 3

/** Per-attempt timeout: a non-responding attempt is treated as failed (Req 3.3). */
export const ATTEMPT_TIMEOUT_MS = 30_000

/** Minimal shape of the tenant data the sender needs. */
export interface IdentityMessageTenant {
  id: number
  name?: string | null
  mobile_number?: string | null
}

/** Result of an attempted identity-request delivery. */
export interface SendOutcome {
  /** True only when a delivery attempt returned a success response. */
  ok: boolean
  /** Machine-readable failure cause when `ok` is false. */
  reason?: "no_mobile" | "unsendable" | "all_attempts_failed"
  /** Number of delivery attempts actually made (0 when short-circuited). */
  attempts: number
}

/** Collaborators injected for testability; all optional with production defaults. */
export interface SendIdentityRequestDeps {
  /** Supabase client used to record delivery failures (`identity_msg_failed`). */
  db?: SupabaseClient | null
  /** Fetch implementation; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /** Chatbot API base URL; defaults to {@link resolveChatbotApiUrl}. */
  chatbotApiUrl?: string
  /** Per-attempt timeout in ms; defaults to {@link ATTEMPT_TIMEOUT_MS}. */
  timeoutMs?: number
  /** Maximum total attempts; defaults to {@link MAX_SEND_ATTEMPTS}. */
  maxAttempts?: number
  /** The owner's PG name, embedded in the message in place of the brand name. */
  pgName?: string | null
  /** Active property ID to route to the correct WhatsApp instance. */
  pgId?: number | null
}

/**
 * Build the identity-request message. It always embeds the tenant name and the
 * verification link (Reqs 3.6, 13.5). When the owner's PG name is known it is
 * used in place of the generic brand name.
 */
export function buildIdentityMessage(name: string, link: string, pgName?: string | null): string {
  const tenantName = (name ?? "").trim() || "Tenant"
  const pg = (pgName ?? "").trim() || "your PG"
  return (
    `Hi ${tenantName},\n\n` +
    `Your property owner has requested that you verify your identity for ${pg}.\n\n` +
    `Please open the secure link below to upload your identity document. ` +
    `Your documents are encrypted and visible only to your property owner:\n${link}\n\n` +
    `Thank you!`
  )
}

/**
 * A message is sendable only when both a non-empty tenant name and a non-empty
 * verification link are present (Req 3.7).
 */
export function isSendableMessage(msg: { name?: string | null; link?: string | null }): boolean {
  const hasName = typeof msg.name === "string" && msg.name.trim().length > 0
  const hasLink = typeof msg.link === "string" && msg.link.trim().length > 0
  return hasName && hasLink
}

/**
 * Normalize a phone number to the `91XXXXXXXXXX` form used by the chatbot send
 * path. Mirrors `formatWhatsAppNumber` in `tenants.tsx`: a bare 10-digit number
 * is prefixed with the country code, otherwise the digits are returned as-is.
 */
export function normalizeWhatsAppNumber(phone: string | null | undefined): string {
  if (!phone) return ""
  const cleaned = phone.replace(/\D/g, "")
  if (cleaned.length === 10) {
    return `91${cleaned}`
  }
  return cleaned
}

/** Resolve the chatbot API base URL, mirroring `getChatbotApiUrl` in `tenants.tsx`. */
export function resolveChatbotApiUrl(): string {
  if (process.env.EXPO_PUBLIC_CHATBOT_API_URL) {
    return process.env.EXPO_PUBLIC_CHATBOT_API_URL
  }
  return "https://144.91.79.198.sslip.io"
}

/** Persist the delivery-failure indication for a tenant; never throws. */
async function recordDeliveryFailure(
  db: SupabaseClient | null | undefined,
  tenantId: number
): Promise<void> {
  if (!db) return
  try {
    await db.from("tenants_table").update({ identity_msg_failed: true }).eq("id", tenantId)
  } catch {
    // Recording the failure is best-effort; swallow to avoid masking the send result.
  }
}

/**
 * Perform a single delivery attempt bounded by an AbortController timeout.
 * Returns true on a success response; false on a non-success response, a thrown
 * error, or a timeout (Req 3.3).
 */
async function attemptSend(params: {
  fetchImpl: typeof fetch
  chatbotApiUrl: string
  phone: string
  message: string
  sessionToken: string
  timeoutMs: number
  pgId?: number | null
}): Promise<boolean> {
  const { fetchImpl, chatbotApiUrl, phone, message, sessionToken, timeoutMs, pgId } = params
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const url = pgId
      ? `${chatbotApiUrl}/api/v1/send-whatsapp-notice?pgId=${pgId}`
      : `${chatbotApiUrl}/api/v1/send-whatsapp-notice`
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
        "bypass-tunnel-reminder": "true"
      },
      body: JSON.stringify({ phone, message }),
      signal: controller.signal
    })
    return response.ok
  } catch {
    // Network error or aborted-due-to-timeout: attempt failed (Req 3.3).
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Send the identity-request message to a tenant, reusing the existing chatbot
 * delivery path with `91XXXXXXXXXX` normalization, a per-attempt 30s timeout, and
 * up to {@link MAX_SEND_ATTEMPTS} total attempts that stop at the first success.
 *
 * Records a delivery failure (`identity_msg_failed = true`) and returns `ok:false`
 * when the tenant has no mobile number (Req 3.2), the message is unsendable
 * (Req 3.7), or every attempt fails (Req 3.5). The Identity_Request_Flag is never
 * cleared here, so it is retained on failure.
 */
export async function sendIdentityRequest(
  tenant: IdentityMessageTenant,
  link: string,
  sessionToken: string,
  deps: SendIdentityRequestDeps = {}
): Promise<SendOutcome> {
  const {
    db = null,
    fetchImpl = fetch,
    chatbotApiUrl = resolveChatbotApiUrl(),
    timeoutMs = ATTEMPT_TIMEOUT_MS,
    maxAttempts = MAX_SEND_ATTEMPTS,
    pgName = null,
    pgId = null
  } = deps

  // No mobile number → do not attempt; record failure; keep flag (Req 3.2).
  const phone = normalizeWhatsAppNumber(tenant.mobile_number)
  if (!phone) {
    await recordDeliveryFailure(db, tenant.id)
    return { ok: false, reason: "no_mobile", attempts: 0 }
  }

  // A message missing name or link is never sent (Req 3.7).
  if (!isSendableMessage({ name: tenant.name, link })) {
    await recordDeliveryFailure(db, tenant.id)
    return { ok: false, reason: "unsendable", attempts: 0 }
  }

  const message = buildIdentityMessage(tenant.name ?? "", link, pgName)

  let attempts = 0
  for (let i = 0; i < maxAttempts; i++) {
    attempts++
    const ok = await attemptSend({
      fetchImpl,
      chatbotApiUrl,
      phone,
      message,
      sessionToken,
      timeoutMs,
      pgId
    })
    if (ok) {
      // Stop at the first success (Req 3.4).
      return { ok: true, attempts }
    }
  }

  // All attempts failed → record failure, keep flag (Req 3.5).
  await recordDeliveryFailure(db, tenant.id)
  return { ok: false, reason: "all_attempts_failed", attempts }
}
