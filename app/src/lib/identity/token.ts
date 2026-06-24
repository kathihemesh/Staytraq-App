import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Pure token generation + link construction for tenant identity verification.
 *
 * These helpers import no React Native APIs so they are unit/property-testable
 * with the owner-app `vitest` + `fast-check` runner.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

// URL-safe (base64url) alphabet: no characters that need escaping in a path
// segment, and notably no "/" so a token never splits a link into two segments.
const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

// 22 characters over a 64-symbol alphabet ≈ 132 bits of entropy, comfortably
// collision-resistant for verification tokens.
const TOKEN_LENGTH = 22

// Safety bound so an adversarial/degenerate rng cannot spin forever while
// searching for a value not already in the supplied set.
const MAX_UNIQUE_ATTEMPTS = 1000

// Number of persistence attempts before `ensureVerificationToken` gives up. Each
// attempt generates a fresh candidate, so this only matters under repeated
// unique-index collisions, which are astronomically unlikely.
const MAX_PERSIST_ATTEMPTS = 5

// Postgres unique-violation SQLSTATE, surfaced by Supabase as `error.code`.
const UNIQUE_VIOLATION = "23505"

/**
 * Generate a single URL-safe random verification token.
 *
 * @param rng Optional source of randomness in [0, 1); defaults to `Math.random`.
 *            Injectable so tests can produce deterministic candidates.
 */
export function newToken(rng: () => number = Math.random): string {
  let out = ""
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    const idx = Math.floor(rng() * TOKEN_ALPHABET.length)
    // Clamp guards against rng() returning exactly 1 (out-of-range index).
    out += TOKEN_ALPHABET[Math.min(idx, TOKEN_ALPHABET.length - 1)]
  }
  return out
}

/**
 * Produce a token guaranteed not to be present in `existing`, regenerating on
 * collision (Reqs 2.1, 2.5). Pure and deterministic given a fixed `rng`.
 */
export function pickUniqueToken(
  existing: ReadonlySet<string>,
  rng: () => number = Math.random
): string {
  let candidate = newToken(rng)
  let attempts = 0
  while (existing.has(candidate) && attempts < MAX_UNIQUE_ATTEMPTS) {
    candidate = newToken(rng)
    attempts++
  }
  return candidate
}

/**
 * Build the verification link by appending the token to the portal base path,
 * producing exactly one path segment for the token (Req 2.4). Exact inverse of
 * `parseTokenFromLink`.
 */
export function buildVerificationLink(base: string, token: string): string {
  return `${stripTrailingSlash(base)}/${token}`
}

/**
 * Recover the token from a verification link, or `null` when the link does not
 * match the expected `base` shape. Exact inverse of `buildVerificationLink` for
 * any non-empty, single-segment token (Req 2.4).
 */
export function parseTokenFromLink(base: string, link: string): string | null {
  const prefix = `${stripTrailingSlash(base)}/`
  if (!link.startsWith(prefix)) return null
  const token = link.slice(prefix.length)
  // A valid token is exactly one path segment: non-empty and slash-free.
  if (token.length === 0 || token.includes("/")) return null
  return token
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

/**
 * Ensure the tenant has a persisted, unique verification token.
 *
 * - Reuses an existing token if one is already stored (idempotent, Req 2.3).
 * - Otherwise persists a fresh token via the `tenants_verification_token_key`
 *   partial unique index, retrying with a new candidate on a unique-violation
 *   so persistence happens before any link is constructed (Reqs 2.1, 2.2, 2.5).
 * - Returns `null` on persistent failure so the caller can record the failure
 *   and avoid constructing/sending a link (Req 2.6).
 *
 * Typed against the plain `SupabaseClient` (default schema) so it stays
 * decoupled from the generated `Database` types.
 */
export async function ensureVerificationToken(
  db: SupabaseClient,
  tenantId: number
): Promise<string | null> {
  // 1. Reuse an already-persisted token without generating anything (Req 2.3).
  const existing = await readToken(db, tenantId)
  if (existing === undefined) return null // read failed
  if (existing) return existing

  // 2. Generate + persist, retrying only on a unique-index collision (Req 2.5).
  for (let attempt = 0; attempt < MAX_PERSIST_ATTEMPTS; attempt++) {
    const candidate = newToken()
    const { data, error } = await db
      .from("tenants_table")
      .update({ verification_token: candidate })
      // Only claim the token when none is set yet, so concurrent writers cannot
      // clobber each other.
      .is("verification_token", null)
      .eq("id", tenantId)
      .select("verification_token")
      .maybeSingle()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue // collided, try a new token
      return null // any other persistence error is a hard failure (Req 2.6)
    }

    const persisted = (data as { verification_token?: string | null } | null)
      ?.verification_token
    if (persisted) return persisted // persisted before any link is built (Req 2.2)

    // No row updated: a token was set concurrently (or the row vanished).
    // Re-read so a concurrently-set token is reused rather than overwritten.
    const current = await readToken(db, tenantId)
    if (current === undefined) return null
    if (current) return current
    return null // row no longer exists
  }

  return null // exhausted retries (Req 2.6)
}

/**
 * Read the tenant's current verification token.
 * Returns the token string, `null` when none is stored, or `undefined` when the
 * read itself failed.
 */
async function readToken(
  db: SupabaseClient,
  tenantId: number
): Promise<string | null | undefined> {
  const { data, error } = await db
    .from("tenants_table")
    .select("verification_token")
    .eq("id", tenantId)
    .maybeSingle()

  if (error) return undefined
  const token = (data as { verification_token?: string | null } | null)
    ?.verification_token
  return token ?? null
}
