// Feature: payment-reminders
//
// Per-tenant payment-portal token helpers. Mirrors the identity-verification
// token approach (`app/src/lib/identity/token.ts`): a unique, URL-safe token is
// persisted on `tenants_table.payment_portal_token` (partial unique index
// `tenants_payment_portal_token_key`) and embedded in a single payment link that
// skips the grouped portal's mobile-number verification and shows the tenant's
// dues directly.
//
// The daily scheduler edge function inlines equivalent logic (it cannot bundle a
// cross-directory import); this module is the source of truth for the link shape
// and the get-or-create routine used by server code.

import type { SupabaseClient } from "@supabase/supabase-js"

/** Public base for the tenant payment portal (reuses the existing /pay page). */
export const PAYMENT_PORTAL_BASE = "https://staytraq.vercel.app/pay"

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
const TOKEN_LENGTH = 22
const UNIQUE_VIOLATION = "23505"
const MAX_PERSIST_ATTEMPTS = 5

/** Build the payment link by appending the token as a single path segment. */
export function buildPaymentLink(base: string, token: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base
  return `${trimmed}/${token}`
}

/** Generate one URL-safe random token (~132 bits at length 22). */
export function newPaymentToken(rng: () => number = Math.random): string {
  let out = ""
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    const idx = Math.floor(rng() * TOKEN_ALPHABET.length)
    out += TOKEN_ALPHABET[Math.min(idx, TOKEN_ALPHABET.length - 1)]
  }
  return out
}

async function readPaymentToken(
  db: SupabaseClient,
  tenantId: number,
): Promise<string | null | undefined> {
  const { data, error } = await db
    .from("tenants_table")
    .select("payment_portal_token")
    .eq("id", tenantId)
    .maybeSingle()
  if (error) return undefined
  const token = (data as { payment_portal_token?: string | null } | null)?.payment_portal_token
  return token ?? null
}

/**
 * Ensure the tenant has a persisted, unique payment-portal token. Reuses an
 * existing token (idempotent); otherwise persists a fresh one, retrying only on
 * a unique-index collision. Returns null on persistent failure.
 */
export async function ensurePaymentPortalToken(
  db: SupabaseClient,
  tenantId: number,
): Promise<string | null> {
  const existing = await readPaymentToken(db, tenantId)
  if (existing === undefined) return null
  if (existing) return existing

  for (let attempt = 0; attempt < MAX_PERSIST_ATTEMPTS; attempt++) {
    const candidate = newPaymentToken()
    const { data, error } = await db
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

    const persisted = (data as { payment_portal_token?: string | null } | null)?.payment_portal_token
    if (persisted) return persisted

    // No row updated: token set concurrently (or row gone) — re-read.
    const current = await readPaymentToken(db, tenantId)
    if (current === undefined) return null
    if (current) return current
    return null
  }
  return null
}
