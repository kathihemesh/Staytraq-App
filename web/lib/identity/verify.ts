// Feature: tenant-identity-verification
//
// Pure, framework-free verification logic for the public verification portal and
// the submit API route. Every function here operates on already-extracted OCR
// text (never raw images) and imports nothing from React, Next, or Supabase, so
// the whole module is fully unit- and property-testable.
//
// Task 4.1 added the case-insensitive text helper, the partial name match, and
// the Aadhaar / PAN extractors. Task 4.3 adds the type-specific classification
// and status functions (`classifyAadhaar`, `classifyPan`, `classifyStatus`)
// that combine those primitives into a `VerificationOutcome`.

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** The kind of identity document a tenant submits. */
export type IdentityType = "Aadhaar" | "PAN"

/** The outcome of a single verification check. */
export type CheckResult = { ok: true } | { ok: false; reason: string }

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Case-insensitive substring test (Reqs 9.2, 9.4, 10.2).
 *
 * Returns true when `phrase` appears anywhere in `text`, ignoring case. A
 * non-string `text` never contains anything. An empty `phrase` is the empty
 * substring and is therefore contained in any string (matching native
 * `String.prototype.includes("")` semantics); callers pass concrete, non-empty
 * phrases such as "Government of India".
 */
export function containsCI(text: string, phrase: string): boolean {
  if (typeof text !== "string" || typeof phrase !== "string") return false
  return text.toLowerCase().includes(phrase.toLowerCase())
}

/**
 * Determine whether the text extracted from a document front image produces a
 * Partial_Name_Match with the tenant name (Reqs 8.2, 8.3, 8.4, 8.5).
 *
 * A match exists when at least one whitespace-delimited token of the tenant
 * name appears (case-insensitively) as a substring of the extracted text.
 * Empty or whitespace-only `extractedText` or `tenantName` never matches: an
 * empty extracted text has nothing to match against, and an empty tenant name
 * yields no tokens to look for.
 */
export function partialNameMatch(extractedText: string, tenantName: string): boolean {
  if (typeof extractedText !== "string" || typeof tenantName !== "string") return false

  const haystack = extractedText.toLowerCase()
  if (haystack.trim().length === 0) return false

  const tokens = tenantName
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0)

  if (tokens.length === 0) return false

  return tokens.some((token) => haystack.includes(token))
}

// ---------------------------------------------------------------------------
// Identity-code extractors
// ---------------------------------------------------------------------------

/** Matches a maximal run of exactly 12 digits (an Aadhaar_Number). */
const AADHAAR_NUMBER_PATTERN = /(?<!\d)\d{12}(?!\d)/

/** Matches a PAN_Code: five capitals, four digits, one capital. */
const PAN_CODE_PATTERN = /[A-Z]{5}[0-9]{4}[A-Z]/

/**
 * Extract the first 12-digit Aadhaar_Number from the extracted text (Reqs 9.1,
 * 9.3). Returns the first run of exactly 12 consecutive digits — a run that is
 * part of a longer digit sequence is not treated as an Aadhaar_Number — or
 * `null` when no such run is present.
 */
export function extractAadhaarNumber(text: string): string | null {
  if (typeof text !== "string") return null
  const match = AADHAAR_NUMBER_PATTERN.exec(text)
  return match ? match[0] : null
}

/**
 * Extract the first PAN_Code matching `[A-Z]{5}[0-9]{4}[A-Z]` from the extracted
 * text (Reqs 10.1, 10.2). Returns the matched code, or `null` when no match is
 * present. The match is case-sensitive: a PAN_Code is printed in capitals.
 */
export function extractPanCode(text: string): string | null {
  if (typeof text !== "string") return null
  const match = PAN_CODE_PATTERN.exec(text)
  return match ? match[0] : null
}

// ---------------------------------------------------------------------------
// Classification & status
// ---------------------------------------------------------------------------

/**
 * The result of classifying a complete document submission (Reqs 12.1, 12.2).
 *
 * A `Verified` outcome carries the identity type and the exact extracted code
 * to persist; an `In_Progress` outcome carries the human-readable reasons for
 * every check that did not pass and never carries a code (nothing is stored on
 * any failure, including unreadable text).
 */
export type VerificationOutcome =
  | { status: "Verified"; identityType: IdentityType; code: string }
  | { status: "In_Progress"; reasons: string[] }

/** True when `text` is a string with at least one non-whitespace character. */
function isReadable(text: unknown): text is string {
  return typeof text === "string" && text.trim().length > 0
}

const ok = (): CheckResult => ({ ok: true })
const fail = (reason: string): CheckResult => ({ ok: false, reason })

/**
 * Collapse a set of individual check results into a verification status (Reqs
 * 12.1, 12.2). The submission is `Verified` only when every check passed;
 * otherwise it is `In_Progress` and carries the reason for each failed check in
 * the order the checks were evaluated. An empty check set passes vacuously, but
 * callers always supply the checks defined for the selected identity type.
 */
export function classifyStatus(
  checkResults: CheckResult[]
): { status: "Verified" } | { status: "In_Progress"; reasons: string[] } {
  const reasons = checkResults
    .filter((result): result is { ok: false; reason: string } => !result.ok)
    .map((result) => result.reason)

  if (reasons.length === 0) return { status: "Verified" }
  return { status: "In_Progress", reasons }
}

/**
 * Classify an Aadhaar submission from the OCR text of its front and back images
 * (Reqs 9.5, 9.7, 9.8, 9.9, 12.1, 12.2).
 *
 * The front must contain a 12-digit Aadhaar_Number, the text "Government of
 * India" (case-insensitive), and produce a Partial_Name_Match with `name`. The
 * back must contain the same 12-digit number found on the front and the text
 * "Unique Identification Authority of India" (case-insensitive). Unreadable
 * text on either side is a text-extraction failure for that image and the
 * affected content checks are not attempted. Only when every check passes is
 * the outcome `Verified`, carrying the exact front Aadhaar_Number to store;
 * otherwise the outcome is `In_Progress` with the failed-check reasons and no
 * code is stored.
 */
export function classifyAadhaar(frontText: string, backText: string, name: string): VerificationOutcome {
  const checks: CheckResult[] = []
  let frontNumber: string | null = null

  if (!isReadable(frontText)) {
    checks.push(fail("Could not read any text from the Aadhaar front image."))
  } else {
    frontNumber = extractAadhaarNumber(frontText)
    checks.push(
      frontNumber
        ? ok()
        : fail("The Aadhaar front image does not contain a valid 12-digit Aadhaar number.")
    )
    checks.push(
      containsCI(frontText, "Government of India")
        ? ok()
        : fail('The Aadhaar front image does not contain the text "Government of India".')
    )
    checks.push(
      partialNameMatch(frontText, name)
        ? ok()
        : fail("The name read from the document did not match the tenant name.")
    )
  }

  if (!isReadable(backText)) {
    checks.push(fail("Could not read any text from the Aadhaar back image."))
  } else {
    checks.push(
      frontNumber && containsCI(backText, frontNumber)
        ? ok()
        : fail("The Aadhaar back image does not contain the same Aadhaar number as the front image.")
    )
    checks.push(
      containsCI(backText, "Unique Identification Authority of India")
        ? ok()
        : fail('The Aadhaar back image does not contain the text "Unique Identification Authority of India".')
    )
  }

  const status = classifyStatus(checks)
  if (status.status === "Verified" && frontNumber) {
    return { status: "Verified", identityType: "Aadhaar", code: frontNumber }
  }
  return { status: "In_Progress", reasons: status.status === "In_Progress" ? status.reasons : [] }
}

/**
 * Classify a PAN submission from the OCR text of its single front image (Reqs
 * 10.3, 10.4, 10.5, 10.6, 12.1, 12.2).
 *
 * If no text can be read from the front image it is a text-extraction failure
 * and the remaining content checks are skipped. Otherwise the front must
 * contain a PAN_Code matching `[A-Z]{5}[0-9]{4}[A-Z]`, the text "Permanent
 * Account Number Card" (case-insensitive), and produce a Partial_Name_Match
 * with `name`. Only when every check passes is the outcome `Verified`, carrying
 * the exact PAN_Code to store; otherwise the outcome is `In_Progress` with the
 * failed-check reasons and no code is stored.
 */
export function classifyPan(frontText: string, name: string): VerificationOutcome {
  if (!isReadable(frontText)) {
    return { status: "In_Progress", reasons: ["Could not read any text from the PAN front image."] }
  }

  const panCode = extractPanCode(frontText)
  const checks: CheckResult[] = [
    panCode ? ok() : fail("The PAN front image does not contain a valid PAN code."),
    containsCI(frontText, "Permanent Account Number Card")
      ? ok()
      : fail('The PAN front image does not contain the text "Permanent Account Number Card".'),
    partialNameMatch(frontText, name)
      ? ok()
      : fail("The name read from the document did not match the tenant name."),
  ]

  const status = classifyStatus(checks)
  if (status.status === "Verified" && panCode) {
    return { status: "Verified", identityType: "PAN", code: panCode }
  }
  return { status: "In_Progress", reasons: status.status === "In_Progress" ? status.reasons : [] }
}
