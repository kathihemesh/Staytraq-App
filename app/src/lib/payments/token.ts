// Per-tenant payment-portal token helpers (mobile).
//
// Mirrors the web `web/lib/payments/token.ts`: a unique, URL-safe token is
// persisted on `tenants_table.payment_portal_token` (partial unique index
// `tenants_payment_portal_token_key`) and embedded in a single payment link
// that skips the grouped portal's mobile-number verification and shows the
// tenant's own dues directly.
//
// `payment_portal_token` is not present in the mobile generated Supabase types,
// so the client is cast to `any` for these reads/updates.

/** Public base for the tenant payment portal (reuses the existing /pay page). */
export const PAYMENT_PORTAL_BASE = "https://staytraq.vercel.app/pay"

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
const TOKEN_LENGTH = 22
const UNIQUE_VIOLATION = "23505"
const MAX_PERSIST_ATTEMPTS = 5

/** Build the payment link by appending the token as a single path segment. */
export function buildPaymentLink(token: string, base: string = PAYMENT_PORTAL_BASE): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base
  return `${trimmed}/${token}`
}

/** Generate one URL-safe random token (~132 bits at length 22). */
export function newPaymentToken(): string {
  let out = ""
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)]
  }
  return out
}

/**
 * Ensure the tenant has a persisted, unique payment-portal token. Reuses an
 * existing token (idempotent); otherwise persists a fresh one, retrying only on
 * a unique-index collision. Returns null on persistent failure.
 */
export async function ensurePaymentPortalToken(
  supabase: any,
  tenantId: number,
): Promise<string | null> {
  const { data: existingRow, error: readErr } = await supabase
    .from("tenants_table")
    .select("payment_portal_token")
    .eq("id", tenantId)
    .maybeSingle()
  if (readErr) return null
  if (existingRow?.payment_portal_token) return existingRow.payment_portal_token as string

  for (let attempt = 0; attempt < MAX_PERSIST_ATTEMPTS; attempt++) {
    const candidate = newPaymentToken()
    const { data, error } = await supabase
      .from("tenants_table")
      .update({ payment_portal_token: candidate })
      .is("payment_portal_token", null)
      .eq("id", tenantId)
      .select("payment_portal_token")
      .maybeSingle()
    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue
      return null
    }
    if (data?.payment_portal_token) return data.payment_portal_token as string

    // Row not updated — token set concurrently; re-read.
    const { data: cur } = await supabase
      .from("tenants_table")
      .select("payment_portal_token")
      .eq("id", tenantId)
      .maybeSingle()
    return (cur?.payment_portal_token as string | undefined) ?? null
  }
  return null
}
