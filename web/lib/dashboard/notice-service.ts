// Feature: web-dashboard-parity (Task 11.2)
//
// Thin notice-service client that reuses the *exact* mobile WhatsApp notice path
// (Owner clarification 1 / Req 11.1, 11.2, 11.6, 11.7). No new backend is built:
//
//   - when the Owner's `chatbot_enabled` flag is true, a notice is delivered by
//     POSTing to the chatbot backend `…/api/v1/send-whatsapp-notice` endpoint with
//     a bearer token taken from the Supabase session, mirroring
//     `app/src/app/(tabs)/index.tsx`;
//   - otherwise, the same message is opened through a `wa.me` deep link.
//
// Auth, phone normalization, and message construction are copied from the mobile
// dashboard so web and mobile produce identical notices. Each per-recipient send
// is bounded by a 30s timeout: when it elapses the recipient is recorded as failed
// and the run continues (Req 11.7). The pure tally/aggregation of a completed bulk
// run is delegated to `summarizeBulkRun` in `home-compute.ts` (Req 11.2).

import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { ensurePaymentPortalToken } from "@/lib/payments/token"
import {
  coerceNumber,
  resolveTenantName,
  summarizeBulkRun,
  type BulkNoticeRun,
  type NoticeResult,
} from "@/lib/dashboard/home-compute"

export type { NoticeResult, BulkNoticeRun } from "@/lib/dashboard/home-compute"

/** The browser Supabase client type (session/bearer token + portal-link queries). */
type BrowserSupabase = ReturnType<typeof createClient>

// ---------------------------------------------------------------------------
// Context & recipient shapes
// ---------------------------------------------------------------------------

/**
 * Everything the notice-service needs to deliver a notice, supplied by the
 * dashboard page from `useDashboardHome`/auth state.
 *
 *  - `ownerId`        — the authenticated Owner's id; scopes the portal-link query.
 *  - `supabase`       — the browser Supabase client used for the session bearer
 *                       token (`auth.getSession()`) and the `monthly_payment_links`
 *                       lookup/upsert, exactly like the mobile path.
 *  - `chatbotEnabled` — when true the chatbot backend is used, otherwise the
 *                       `wa.me` deep-link fallback (Owner clarification 1).
 *  - `chatbotApiUrl`  — optional override of the chatbot base URL; defaults to
 *                       `NEXT_PUBLIC_CHATBOT_API_URL`.
 *  - `now`            — injectable "current" instant (testability; unused by the
 *                       message body but kept for parity/future use).
 */
export interface NoticeContext {
  ownerId: string
  supabase: BrowserSupabase
  chatbotEnabled: boolean
  chatbotApiUrl?: string
  now?: Date
}

/**
 * A single notice recipient. Carries exactly the payment-derived fields the
 * mobile message construction reads (`amount`, `month`, `year`, `due_date`,
 * `status`) plus the tenant identity and phone.
 */
export interface NoticeRecipient {
  tenantId: number
  tenantName: string | null
  phone: string | null
  amount: number | string | null
  month: number
  year: number
  dueDate: string | null
  /** `late` selects the overdue message wording; any other value is a due reminder. */
  status: string
}

// ---------------------------------------------------------------------------
// Constants (parity with the mobile notice path)
// ---------------------------------------------------------------------------

/** Per-recipient send timeout; on elapse the recipient is marked failed (Req 11.7). */
export const NOTICE_TIMEOUT_MS = 30_000

/**
 * Delay inserted between consecutive bulk sends so WhatsApp does not flag the
 * sender for rapid-fire messaging.
 */
export const BULK_SEND_DELAY_MS = 3_500

/** Tenant-facing payment portal base, identical to the mobile dashboard. */
const PAYMENT_PORTAL_BASE = "https://staytraq.vercel.app/pay"

/** Fallback chatbot base URL when no env/override is provided. */
const DEFAULT_CHATBOT_API_URL = "https://144.91.79.198.sslip.io"

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

// ---------------------------------------------------------------------------
// Internal helpers (mirrored from app/src/app/(tabs)/index.tsx)
// ---------------------------------------------------------------------------

/** Resolve the chatbot backend base URL (override → env → localhost fallback). */
function resolveChatbotApiUrl(ctx: NoticeContext): string {
  return ctx.chatbotApiUrl ?? process.env.NEXT_PUBLIC_CHATBOT_API_URL ?? DEFAULT_CHATBOT_API_URL
}

/**
 * Normalize a phone number to digits and prefix the India country code for bare
 * 10-digit numbers, identical to the mobile `cleanPhone` logic. Returns an empty
 * string when no digits are present.
 */
function normalizePhone(phone: string | null | undefined): string {
  if (typeof phone !== "string") return ""
  let cleanPhone = phone.replace(/[^0-9]/g, "")
  if (cleanPhone.length === 10) {
    cleanPhone = "91" + cleanPhone
  }
  return cleanPhone
}

/** Format a due date the same way the mobile dashboard does (en-IN, short month). */
function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return "—"
  const d = new Date(dueDate)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

/** Build the WhatsApp notice body, identical wording to the mobile dashboard. */
function buildNoticeMessage(recipient: NoticeRecipient, portalToken: string): string {
  const tenantName = resolveTenantName(recipient.tenantName)
  const amount = coerceNumber(recipient.amount)
  const monthName = MONTH_NAMES[recipient.month - 1] ?? "Current Month"
  const { year } = recipient
  const formattedDueDate = formatDueDate(recipient.dueDate)
  const paymentLink = `${PAYMENT_PORTAL_BASE}/${portalToken}`

  const isLate = typeof recipient.status === "string" && recipient.status.trim().toLowerCase() === "late"
  return isLate
    ? `Hi ${tenantName},\n\nThis is a reminder that your rent payment of ₹${amount} for ${monthName} ${year} was due on ${formattedDueDate} and is currently overdue.\n\nPlease clear the outstanding amount as soon as possible and submit the payment proof here: ${paymentLink}\n\nIf you have already paid, please ignore this message. Thank you!`
    : `Hi ${tenantName},\n\nThis is a friendly reminder that your rent payment of ₹${amount} for ${monthName} ${year} is due on ${formattedDueDate}.\n\nYou can view your invoice and submit the payment proof directly here: ${paymentLink}\n\nThank you!`
}

/** Open a `wa.me` deep link in a new tab; returns whether the tab opened. */
function openDeepLink(url: string): boolean {
  if (typeof window === "undefined" || typeof window.open !== "function") {
    throw new Error("WhatsApp deep link cannot be opened in this environment.")
  }
  const opened = window.open(url, "_blank")
  return opened !== null
}

/**
 * Attempt to deliver a single notice, throwing on any failure. Uses the chatbot
 * backend when `chatbot_enabled`, otherwise the `wa.me` deep-link fallback. The
 * `signal` aborts the in-flight chatbot request when the caller's timeout fires.
 */
async function attemptDelivery(
  ctx: NoticeContext,
  recipient: NoticeRecipient,
  signal: AbortSignal,
): Promise<boolean> {
  const phone = normalizePhone(recipient.phone)
  if (!phone) throw new Error("Missing recipient phone number.")

  // Unique per-tenant payment link (skips the removed grouped phone-verification
  // portal and shows only this tenant's dues).
  const portalToken = await ensurePaymentPortalToken(
    ctx.supabase as unknown as SupabaseClient,
    recipient.tenantId,
  )
  if (!portalToken) throw new Error("Could not generate the tenant payment link.")
  const message = buildNoticeMessage(recipient, portalToken)

  if (ctx.chatbotEnabled) {
    const {
      data: { session },
    } = await ctx.supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error("User session not found. Please log in again.")

    const chatbotApiUrl = resolveChatbotApiUrl(ctx)
    const response = await fetch(`${chatbotApiUrl}/api/v1/send-whatsapp-notice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "bypass-tunnel-reminder": "true",
      },
      body: JSON.stringify({ phone, message }),
      signal,
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({} as { detail?: string }))
      throw new Error(errData?.detail || "Failed to send message via chatbot server.")
    }
    return true
  }

  // Fallback: open the WhatsApp deep link with the prefilled message.
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
  return openDeepLink(url)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a single rent notice for one recipient, reusing the mobile notice path.
 *
 * Resolves to a {@link NoticeResult}: `ok` is `true` only when the notice was
 * delivered (chatbot 2xx) or the deep link opened. Any error — or the send not
 * completing within {@link NOTICE_TIMEOUT_MS} (Req 11.7) — resolves to `ok: false`
 * rather than rejecting, so a caller iterating recipients always continues.
 */
export async function sendSingleNotice(
  ctx: NoticeContext,
  recipient: NoticeRecipient,
): Promise<NoticeResult> {
  const tenantName = resolveTenantName(recipient.tenantName)
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(false)
    }, NOTICE_TIMEOUT_MS)
  })

  try {
    const ok = await Promise.race([
      attemptDelivery(ctx, recipient, controller.signal).catch(() => false),
      timeout,
    ])
    return { tenantId: recipient.tenantId, tenantName, ok }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Send notices to each targeted recipient sequentially and return the conserved
 * tally (Req 11.2). Every recipient is attempted; a per-recipient 30s timeout
 * marks that recipient failed and the run continues to the next (Req 11.7). The
 * `{ total, succeeded, failed, failures }` summary is produced by the pure
 * {@link summarizeBulkRun} so `succeeded + failed === total` always holds.
 */
export async function sendBulkNotices(
  ctx: NoticeContext,
  recipients: readonly NoticeRecipient[],
): Promise<BulkNoticeRun> {
  const outcomes: NoticeResult[] = []
  for (let i = 0; i < recipients.length; i++) {
    // Throttle bulk sends (3.5s gap) to avoid WhatsApp flagging the sender.
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, BULK_SEND_DELAY_MS))
    }
    // Awaited one-at-a-time so each recipient gets its own 30s timeout window.
    outcomes.push(await sendSingleNotice(ctx, recipients[i]))
  }
  return summarizeBulkRun(outcomes)
}
