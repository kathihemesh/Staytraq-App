// Feature: tenant-identity-verification
//
// Pure, framework-free date- and state-based predicates that drive the two
// scheduled Deno edge functions: the Daily_Reminder_Scheduler
// (`web/supabase/functions/identity-reminders/index.ts`) and the document
// cleanup job (`web/supabase/functions/identity-cleanup/index.ts`). Nothing here
// imports from React, Next, Deno, or Supabase, so every function is fully unit-
// and property-testable. The edge functions are thin wrappers that select rows
// from `tenants_table` and call into these predicates.
//
// Task 4.7 scope: daily reminder eligibility and document cleanup eligibility.

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** A tenant's current verification status, mirroring the DB CHECK domain. */
export type VerificationStatus = "Not_Started" | "In_Progress" | "Verified" | "Ignored"

/**
 * The subset of tenant state the daily reminder eligibility decision depends
 * on, named to match the `tenants_table` columns the scheduler selects.
 */
export interface ReminderTenant {
  identity_request_flag: boolean
  verification_status: VerificationStatus
  ignore_identity_flag: boolean
}

/** A date supplied as a `Date`, an ISO/parseable date string, or absent. */
export type DateInput = Date | string | null | undefined

/**
 * The number of calendar days that must elapse after a tenant's recorded
 * Move_Out_Date (`exit_date`) before their stored documents and identity values
 * become eligible for deletion (Reqs 19.1, 19.2).
 */
export const CLEANUP_DELAY_DAYS = 15

const MS_PER_DAY = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Daily reminder eligibility
// ---------------------------------------------------------------------------

/**
 * Whether a tenant is eligible for a daily identity verification reminder
 * (Reqs 13.1, 13.2, 13.3, 13.4).
 *
 * A tenant is eligible if and only if all three conditions hold:
 * - `identity_request_flag` is `true` (an identity request was made — Req 13.2),
 * - `verification_status` is not `"Verified"` (verification is incomplete —
 *   Reqs 13.1, 13.3), and
 * - `ignore_identity_flag` is `false` (reminders have not been silenced —
 *   Req 13.4).
 *
 * This is purely whether a tenant *qualifies*; the once-per-calendar-day guard
 * (via `identity_reminder_last_date`) and delivery handling live in the
 * scheduler, not here.
 */
export function isReminderEligible(tenant: ReminderTenant): boolean {
  return (
    tenant.identity_request_flag === true &&
    tenant.verification_status !== "Verified" &&
    tenant.ignore_identity_flag === false
  )
}

// ---------------------------------------------------------------------------
// Document cleanup eligibility
// ---------------------------------------------------------------------------

/**
 * Parse a {@link DateInput} into a finite epoch-millisecond timestamp, or
 * `null` when it is absent or not a valid date.
 */
function toTimestamp(value: DateInput): number | null {
  if (value === null || value === undefined) return null
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * Whether a tenant's stored documents and identity values are eligible for
 * automatic deletion (Reqs 19.1, 19.2, 19.3).
 *
 * Eligibility holds if and only if a Move_Out_Date (`exit_date`) is recorded
 * and `now` is on or after 15 calendar days past it. A tenant with no recorded
 * Move_Out_Date (a `null`/`undefined`/unparseable `exitDate`) is never eligible
 * (Req 19.3), so their documents and identity values are retained
 * indefinitely. An unparseable `now` likewise yields `false`.
 */
export function isCleanupEligible(exitDate: DateInput, now: DateInput): boolean {
  const exitMs = toTimestamp(exitDate)
  if (exitMs === null) return false

  const nowMs = toTimestamp(now)
  if (nowMs === null) return false

  const deadlineMs = exitMs + CLEANUP_DELAY_DAYS * MS_PER_DAY
  return nowMs >= deadlineMs
}
