// Feature: web-dashboard-parity
//
// Pure, framework-free business-logic module for the web dashboard home page.
// It imports nothing from React, Next, or Supabase so every function here is fully
// unit- and property-testable and can be shared by every dashboard section component.
//
// Task 1.1 scope: shared view-model types, parity constants, and the two foundational
// coercion helpers (`coerceNumber`, `resolveTenantName`). Date-range / metric / task /
// activity / sanitization computations are added by later tasks.

import type {
  DashboardSummary,
  DashboardCollectionRow,
  DashboardActivityRow,
} from "./dashboard-aggregates"

// ---------------------------------------------------------------------------
// Re-exported aggregate models (so section components import from one place)
// ---------------------------------------------------------------------------

export type {
  DashboardSummary,
  DashboardCollectionRow,
  DashboardActivityRow,
  SectionResult,
  DashboardAggregates,
} from "./dashboard-aggregates"

// ---------------------------------------------------------------------------
// Raw owner-scoped models (record-level computations & modal panels)
// ---------------------------------------------------------------------------

/** A payment row joined with its tenant and room, as read for record-level computations. */
export interface PaymentRow {
  id: number
  tenant_id: number
  owner_id: string
  /** paid | success | completed | pending | late | submitted | rejected */
  status: string
  total_amount: number | string | null
  due_date: string | null
  paid_at?: string | null
  month?: number
  year?: number
  screenshot_path?: string | null
  utr_number?: string | null
  verification_notes?: string | null
  tenants_table?: {
    name?: string
    mobile_number?: string
    rooms_table?: { room_number?: string; rent_amount?: number }
  }
}

/** A tenant row joined with its room. */
export interface TenantRow {
  id: number
  name: string | null
  mobile_number: string | null
  /** active | notice_period | move_out | pending_move_in | ... */
  status: string
  room_id: number | null
  join_date?: string | null
  exit_date?: string | null
  rooms_table?: { id?: number; room_number?: string; rent_amount?: number }
}

/** A room row. */
export interface RoomRow {
  id: number
  pg_id: number
  room_number: string
  total_beds: number | null
  occupied_beds: number | null
  rent_amount?: number
}

/** A complaint row. */
export interface ComplaintRow {
  id: number
  owner_id: string
  complaint_message: string | null
  /** Under Working | Resolved | Ignored */
  status: string
  owner_response: string | null
  tenant_phone: string | null
  created_at: string
  updated_at?: string | null
}

/** An enquiry-lead row. */
export interface LeadRow {
  id: number
  owner_id: string
  name: string | null
  phone: string | null
  details?: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Derived view models (produced by this module)
// ---------------------------------------------------------------------------

/** The reporting-period selector. */
export type TimeFilter = "Today" | "This Week" | "This Month" | "Last Month" | "Custom Range"

/** A resolved start/end window used to scope record-level computations. */
export interface DateRange {
  start: Date
  end: Date
}

/** The four priority-card metrics. */
export interface PriorityMetrics {
  rentDue: { count: number; amount: number }
  overdue: { count: number; amount: number }
  vacantBeds: number
  pendingComplaints: number
}

/** Revenue overview figures for the active range. */
export interface RevenueMetrics {
  expected: number
  collected: number
  pending: number
  percent: number
}

/** Occupancy overview figures. */
export interface OccupancyMetrics {
  total: number
  occupied: number
  vacant: number
}

/** Payment-status breakdown counts. */
export interface PaymentStatusMetrics {
  paid: number
  pending: number
  late: number
  submitted: number
  rejected: number
}

/** A single bar in the monthly-collection chart. */
export interface MonthlyBar {
  key: string
  label: string
  collected: number
}

/** A follow-up (unpaid) payment task. */
export interface FollowUpTask {
  id: number
  tenantName: string
  roomNumber: string
  amount: number
  dueDate: string
  payment: PaymentRow
}

/** A maintenance task derived from an `Under Working` complaint. */
export interface MaintenanceTask {
  id: number
  message: string
  roomNumber: string | "Anonymous"
  complaint: ComplaintRow
}

/** A move-out or check-in task. */
export interface MoveTask {
  id: number
  tenantName: string
  roomNumber: string
  date: string
}

/** A recent-activity view item. */
export interface ActivityView {
  id: string
  type: "payment" | "complaint"
  tenant: string
  action: string
  amount?: string
  status: string
  relativeTime: string
  timestamp: Date
}

/** A leads-section view item. */
export interface LeadView {
  id: number
  name: string
  phone: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Constants (parity with the mobile dashboard)
// ---------------------------------------------------------------------------

/** Placeholder shown when a tenant name is missing/empty (Req 18.6). */
export const PLACEHOLDER_TENANT = "Unknown tenant"

/** Statuses treated as collected, compared case-insensitively (Req 4.2, 5.2). */
export const COLLECTED_STATUSES = ["paid", "success", "completed"] as const

/** Complaint status considered active/pending. */
export const ACTIVE_COMPLAINT_STATUS = "Under Working"

/** Tenant statuses that surface as move-out tasks. */
export const MOVE_OUT_STATUSES = ["notice_period"] as const

/** Tenant status that surfaces as a check-in task. */
export const CHECK_IN_STATUS = "pending_move_in"

/** Maximum recent-activity items rendered (Req 7.1). */
export const MAX_RECENT_ACTIVITY = 20

/** Maximum length, after HTML stripping, of a persisted owner response (Req 18.3). */
export const OWNER_RESPONSE_MAX = 5000

/** Maximum length of payment rejection notes (Req 9.3). */
export const REJECT_NOTES_MAX = 500

/** The large-breakpoint width below which the bottom nav / single column applies (Req 13, 16). */
export const MOBILE_BREAKPOINT_PX = 1024

// ---------------------------------------------------------------------------
// Foundational coercion helpers
// ---------------------------------------------------------------------------

/**
 * Coerce a possibly-missing data-source value into a finite number.
 *
 * Returns the numeric value when the input is a finite number (or a string that
 * parses to one) and 0 when the input is missing, null, NaN, infinite, or otherwise
 * non-numeric (Req 18.4).
 */
export function coerceNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  // Avoid Number("") === 0 and Number("   ") === 0 masking empty/blank strings as 0;
  // those already coerce to 0 which is the desired fallback, so they are fine. But a
  // boolean would coerce (true -> 1), which is not a numeric data value, so reject it.
  if (typeof value === "boolean") return 0
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Resolve a tenant name to a non-empty display string.
 *
 * Returns the trimmed name when present and non-empty, otherwise the fixed
 * placeholder label used for every missing/empty occurrence (Req 18.6).
 */
export function resolveTenantName(name: unknown): string {
  if (typeof name !== "string") return PLACEHOLDER_TENANT
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : PLACEHOLDER_TENANT
}

// ---------------------------------------------------------------------------
// Date_Range computation (Task 2.1)
// ---------------------------------------------------------------------------

/**
 * The result of resolving a Time_Filter (and optional custom dates) into a
 * concrete Date_Range.
 *
 * `error` is `true` when the requested range could not be honored and a
 * fallback range was substituted instead:
 *  - a `Custom Range` missing one or both bounds falls back to the current
 *    month (Req 2.6); and
 *  - a `Custom Range` whose start is after its end preserves the previously
 *    active range (`priorRange`) (Req 2.7).
 */
export interface DateRangeResult {
  range: DateRange
  error: boolean
}

/** Return a new Date at 00:00:00.000 (local) of the given date's calendar day. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

/** Return a new Date at 23:59:59.999 (local) of the given date's calendar day. */
function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

/**
 * Build the current-month Date_Range relative to a reference instant: the first
 * day of the reference month at 00:00:00.000 through the last day of that month
 * at 23:59:59.999 (local time). Mirrors the mobile `This Month` rule and the
 * mobile custom-range fallback.
 */
function currentMonthRange(reference: Date): DateRange {
  return {
    start: new Date(reference.getFullYear(), reference.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}

/**
 * Parse a custom date input into a local Date positioned at the start of its
 * calendar day, or `null` when the input is missing, blank, or unparseable.
 *
 * A bare `YYYY-MM-DD` value (the shape produced by a date input) is parsed by
 * its calendar components so it lands on the intended local day rather than
 * being interpreted as UTC midnight (which can shift the day in some
 * timezones). Other parseable values fall back to the calendar day of the
 * parsed instant in local time.
 */
function parseCustomDate(value: string | undefined | null): Date | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null

  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (isoDateOnly) {
    const year = Number(isoDateOnly[1])
    const month = Number(isoDateOnly[2]) - 1
    const day = Number(isoDateOnly[3])
    const date = new Date(year, month, day, 0, 0, 0, 0)
    // Reject impossible calendar dates (e.g. 2024-13-40) that Date would roll over.
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
      return date
    }
    return null
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return startOfDay(parsed)
}

/**
 * Resolve a Time_Filter selection into a concrete Date_Range, applying the same
 * boundary rules as the mobile dashboard (Req 2.3, 2.5–2.7).
 *
 * Preset ranges (all in the reference's local timezone, start at 00:00:00.000
 * and end at 23:59:59.999):
 *  - `Today`        — the reference calendar day.
 *  - `This Week`    — Monday through Sunday of the reference week.
 *  - `This Month`   — first through last day of the reference month.
 *  - `Last Month`   — first through last day of the previous month.
 *
 * `Custom Range`:
 *  - a valid pair with start ≤ end maps to start-day 00:00:00.000 →
 *    end-day 23:59:59.999 (`error: false`);
 *  - a missing/blank/unparseable bound falls back to the current-month range
 *    (`error: true`, Req 2.6);
 *  - an inverted pair (start after end) preserves `priorRange` when provided,
 *    otherwise the current-month range (`error: true`, Req 2.7).
 *
 * @param filter       the active Time_Filter selection.
 * @param reference    the instant treated as "now" (injected for testability).
 * @param customStart  the custom start-date input (only used for `Custom Range`).
 * @param customEnd    the custom end-date input (only used for `Custom Range`).
 * @param priorRange   the previously active range, preserved on an inverted custom pair.
 */
export function computeDateRange(
  filter: TimeFilter,
  reference: Date,
  customStart?: string,
  customEnd?: string,
  priorRange?: DateRange,
): DateRangeResult {
  switch (filter) {
    case "Today":
      return { range: { start: startOfDay(reference), end: endOfDay(reference) }, error: false }

    case "This Week": {
      const day = reference.getDay()
      // Shift to Monday as the first day of the week (Sunday => -6, else 1 - day offset).
      const diff = reference.getDate() - day + (day === 0 ? -6 : 1)
      const start = new Date(reference.getFullYear(), reference.getMonth(), diff, 0, 0, 0, 0)
      const end = new Date(reference.getFullYear(), reference.getMonth(), diff + 6, 23, 59, 59, 999)
      return { range: { start, end }, error: false }
    }

    case "This Month":
      return { range: currentMonthRange(reference), error: false }

    case "Last Month": {
      const start = new Date(reference.getFullYear(), reference.getMonth() - 1, 1, 0, 0, 0, 0)
      const end = new Date(reference.getFullYear(), reference.getMonth(), 0, 23, 59, 59, 999)
      return { range: { start, end }, error: false }
    }

    case "Custom Range": {
      const start = parseCustomDate(customStart)
      const end = parseCustomDate(customEnd)

      // Missing/unparseable bound -> current-month fallback, flagged as error (Req 2.6).
      if (start === null || end === null) {
        return { range: currentMonthRange(reference), error: true }
      }

      // Inverted pair -> preserve the prior range (or current month if none), error (Req 2.7).
      if (start.getTime() > end.getTime()) {
        return { range: priorRange ?? currentMonthRange(reference), error: true }
      }

      // Valid pair -> start-day 00:00:00.000 through end-day 23:59:59.999 (Req 2.5).
      return { range: { start: startOfDay(start), end: endOfDay(end) }, error: false }
    }

    default:
      return { range: currentMonthRange(reference), error: false }
  }
}

// ---------------------------------------------------------------------------
// Priority-card metric computation (Task 3.1)
// ---------------------------------------------------------------------------

/** Identifies which priority card a value/navigation request belongs to. */
export type PriorityCard = "rentDue" | "overdue" | "vacantBeds" | "pendingComplaints"

/** The management destination a priority card navigates to (Req 3.5). */
export type PriorityNavTarget = "payments" | "rooms" | "complaints"

/**
 * Return true when a payment status is in the collected set, compared
 * case-insensitively (`paid`, `success`, `completed`). A payment is treated as
 * unpaid when this returns false. Reuses {@link COLLECTED_STATUSES} for parity.
 */
function isCollectedStatus(status: unknown): boolean {
  if (typeof status !== "string") return false
  const normalized = status.trim().toLowerCase()
  return (COLLECTED_STATUSES as readonly string[]).includes(normalized)
}

/**
 * Return true when `dateStr` parses to an instant within the inclusive
 * [start, end] window. Missing/unparseable values are out of range. Mirrors the
 * mobile `isDateInRange` helper.
 */
function isDateInRange(dateStr: string | null | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return false
  return date >= start && date <= end
}

/**
 * Derive total/occupied/vacant beds from the summary `bed_stats` when present,
 * otherwise from the owner's rooms (`total_beds` − `occupied_beds`), with vacant
 * clamped to a minimum of 0 (Req 3.3, 4.3). Exposed so the Occupancy_Overview
 * (Task 3.7) reuses the identical derivation.
 */
export function deriveBedStats(
  summary: DashboardSummary | null | undefined,
  rooms: readonly RoomRow[],
): OccupancyMetrics {
  const bedStats = summary?.bed_stats
  if (bedStats) {
    const total = coerceNumber(bedStats.total)
    const occupied = coerceNumber(bedStats.occupied)
    const vacant =
      bedStats.vacant === null || bedStats.vacant === undefined
        ? Math.max(0, total - occupied)
        : coerceNumber(bedStats.vacant)
    return { total, occupied, vacant: Math.max(0, vacant) }
  }

  let total = 0
  let occupied = 0
  for (const room of rooms) {
    total += coerceNumber(room.total_beds)
    occupied += coerceNumber(room.occupied_beds)
  }
  return { total, occupied, vacant: Math.max(0, total - occupied) }
}

/**
 * Compute the four priority-card metrics, mirroring the mobile dashboard's
 * selection rules exactly (Req 3.1–3.4, 3.6):
 *
 *  - **Rent Due** — payments whose `due_date` falls within the active
 *    `dateRange`; `count` is the number of distinct `tenant_id`s and `amount`
 *    is the sum of their coerced `total_amount`s (missing/non-numeric → 0).
 *  - **Overdue** — unpaid payments (status not in the collected set) with a
 *    `due_date` strictly before the start of the current local day, restricted
 *    to a filter-specific window: the active `dateRange` for `Last Month` and
 *    `Custom Range`, otherwise the current calendar month. `count` is distinct
 *    tenants and `amount` the summed coerced amounts.
 *  - **Vacant Beds** — from summary `bed_stats` when present, else
 *    `total − occupied` from rooms, clamped to ≥ 0.
 *  - **Pending Complaints** — summary `pending_complaints_count` when present,
 *    otherwise the count of complaints whose status is `Under Working`.
 *
 * @param reference the instant treated as "now" (injected for testability);
 *                  defaults to the current time.
 */
export function computePriorityMetrics(
  summary: DashboardSummary | null | undefined,
  payments: readonly PaymentRow[],
  rooms: readonly RoomRow[],
  complaints: readonly ComplaintRow[],
  dateRange: DateRange,
  filter: TimeFilter,
  reference: Date = new Date(),
): PriorityMetrics {
  // --- Rent Due (in active range) ---
  const inRange = payments.filter((p) => isDateInRange(p.due_date, dateRange.start, dateRange.end))
  const rentDue = {
    count: new Set(inRange.map((p) => p.tenant_id)).size,
    amount: inRange.reduce((sum, p) => sum + coerceNumber(p.total_amount), 0),
  }

  // --- Overdue (unpaid, due before start-of-today, filter-windowed) ---
  const today = startOfDay(reference)
  const overdueWindow =
    filter === "Last Month" || filter === "Custom Range"
      ? dateRange
      : currentMonthRange(reference)

  const overdueUnpaid = payments.filter((p) => {
    if (!p.due_date) return false
    if (isCollectedStatus(p.status)) return false
    const dueDate = new Date(p.due_date)
    if (Number.isNaN(dueDate.getTime())) return false
    if (dueDate >= today) return false
    return dueDate >= overdueWindow.start && dueDate <= overdueWindow.end
  })
  const overdue = {
    count: new Set(overdueUnpaid.map((p) => p.tenant_id)).size,
    amount: overdueUnpaid.reduce((sum, p) => sum + coerceNumber(p.total_amount), 0),
  }

  // --- Vacant Beds ---
  const vacantBeds = deriveBedStats(summary, rooms).vacant

  // --- Pending Complaints ---
  const summaryPending = summary?.pending_complaints_count
  const pendingComplaints =
    summaryPending === null || summaryPending === undefined
      ? complaints.filter((c) => c.status === ACTIVE_COMPLAINT_STATUS).length
      : coerceNumber(summaryPending)

  return { rentDue, overdue, vacantBeds, pendingComplaints }
}

/**
 * Map a priority card to its management-page navigation target, using the same
 * destination mapping as the mobile dashboard (Req 3.5): Rent Due and Overdue
 * navigate to the Payments page, Vacant Beds to the Rooms page, and Pending
 * Complaints to the complaints view.
 */
export function derivePriorityNavTarget(card: PriorityCard): PriorityNavTarget {
  switch (card) {
    case "rentDue":
    case "overdue":
      return "payments"
    case "vacantBeds":
      return "rooms"
    case "pendingComplaints":
      return "complaints"
  }
}

// ---------------------------------------------------------------------------
// Revenue, occupancy, and payment-status computation (Task 3.7)
// ---------------------------------------------------------------------------

/**
 * Compute a collected-vs-expected percentage as `collected ÷ expected × 100`,
 * rounded to the nearest whole number with halves rounded up, and clamped to
 * the inclusive range 0–100 (Req 4.1, 4.6).
 *
 * Returns 0 (never NaN/Infinity) when `expected` is 0 or non-finite, mirroring
 * the mobile `expected > 0 ? Math.round(...) : 0` guard. Shared by the
 * This-Month summary fast path and the record-level fallback so both rounding
 * paths are identical.
 */
export function collectedPercentage(collected: number, expected: number): number {
  if (!Number.isFinite(expected) || expected === 0) return 0
  const raw = (collected / expected) * 100
  if (!Number.isFinite(raw)) return 0
  // Math.floor(x + 0.5) rounds halves up (e.g. 2.5 -> 3), matching the spec's
  // "halves rounded up" rule across the non-negative percentages produced here.
  const rounded = Math.floor(raw + 0.5)
  return Math.max(0, Math.min(100, rounded))
}

/**
 * Compute the Revenue_Overview figures for the active range (Req 4.1, 4.2, 4.6, 4.7).
 *
 *  - **This Month fast path** — when `filter` is `This Month` and a `summary` is
 *    available, `collected` is the coerced `paid_amount_this_month`, `pending`
 *    the coerced `pending_amount_this_month`, `expected = collected + pending`,
 *    and `percent` per {@link collectedPercentage}.
 *  - **Record fallback** — otherwise (a non-`This Month` filter, or `This Month`
 *    with no summary, Req 4.7) the figures are computed from the payments whose
 *    `due_date` falls within `dateRange`: `collected` sums coerced amounts whose
 *    status is in the collected set (`paid`/`success`/`completed`, compared
 *    case-insensitively), `pending` sums every other in-range payment's coerced
 *    amount, `expected = collected + pending`, and `percent` per
 *    {@link collectedPercentage}.
 */
export function computeRevenue(
  summary: DashboardSummary | null | undefined,
  payments: readonly PaymentRow[],
  dateRange: DateRange,
  filter: TimeFilter,
): RevenueMetrics {
  if (filter === "This Month" && summary) {
    const collected = coerceNumber(summary.paid_amount_this_month)
    const pending = coerceNumber(summary.pending_amount_this_month)
    const expected = collected + pending
    return { expected, collected, pending, percent: collectedPercentage(collected, expected) }
  }

  let collected = 0
  let pending = 0
  for (const p of payments) {
    if (!isDateInRange(p.due_date, dateRange.start, dateRange.end)) continue
    const amount = coerceNumber(p.total_amount)
    if (isCollectedStatus(p.status)) {
      collected += amount
    } else {
      pending += amount
    }
  }
  const expected = collected + pending
  return { expected, collected, pending, percent: collectedPercentage(collected, expected) }
}

/**
 * Compute the Occupancy_Overview figures (total/occupied/vacant beds), reusing
 * the shared {@link deriveBedStats} derivation so the occupancy overview, the
 * Vacant Beds priority card, and any other consumer report identical numbers:
 * the summary `bed_stats` when present, otherwise `total − occupied` summed
 * across the owner's rooms, with vacant clamped to a minimum of 0 (Req 4.3).
 */
export function computeOccupancy(
  summary: DashboardSummary | null | undefined,
  rooms: readonly RoomRow[],
): OccupancyMetrics {
  return deriveBedStats(summary, rooms)
}

/**
 * Compute the Payment_Status_Overview breakdown counts (Req 4.4, 4.5, 4.8).
 *
 *  - **This Month fast path** — when `filter` is `This Month` and summary
 *    `payment_status_counts` is available, each of paid/pending/late/submitted/
 *    rejected is the coerced summary count (missing/non-numeric → 0).
 *  - **Record fallback** — otherwise (a non-`This Month` filter, or `This Month`
 *    with no summary counts, Req 4.8) the breakdown is tallied per status from
 *    the payments whose `due_date` falls within `dateRange`: a status in the
 *    collected set (`paid`/`success`/`completed`, compared case-insensitively)
 *    increments `paid`, and `pending`/`late`/`submitted`/`rejected` are tallied
 *    by their literal (case-insensitive) status.
 */
export function computePaymentStatus(
  summary: DashboardSummary | null | undefined,
  payments: readonly PaymentRow[],
  dateRange: DateRange,
  filter: TimeFilter,
): PaymentStatusMetrics {
  if (filter === "This Month" && summary?.payment_status_counts) {
    const counts = summary.payment_status_counts
    return {
      paid: coerceNumber(counts.paid),
      pending: coerceNumber(counts.pending),
      late: coerceNumber(counts.late),
      submitted: coerceNumber(counts.submitted),
      rejected: coerceNumber(counts.rejected),
    }
  }

  const metrics: PaymentStatusMetrics = {
    paid: 0,
    pending: 0,
    late: 0,
    submitted: 0,
    rejected: 0,
  }
  for (const p of payments) {
    if (!isDateInRange(p.due_date, dateRange.start, dateRange.end)) continue
    if (isCollectedStatus(p.status)) {
      metrics.paid += 1
      continue
    }
    const status = typeof p.status === "string" ? p.status.trim().toLowerCase() : ""
    switch (status) {
      case "pending":
        metrics.pending += 1
        break
      case "late":
        metrics.late += 1
        break
      case "submitted":
        metrics.submitted += 1
        break
      case "rejected":
        metrics.rejected += 1
        break
    }
  }
  return metrics
}

// ---------------------------------------------------------------------------
// Monthly-collection chart computation (Task 5.1)
// ---------------------------------------------------------------------------

/**
 * Compute the monthly-collection bar set, mirroring the mobile dashboard's
 * `collectionTrendData` logic exactly (Req 5.1, 5.2, 5.4):
 *
 *  - **History fast path** — when the Aggregation_Service monthly-collection
 *    history is available (non-empty), each row becomes a bar keyed by
 *    `${year}-${month_number}` with its coerced `collected` amount and `month`
 *    label. Bars are ordered chronologically by `(year, month_number)` ascending
 *    (oldest leftmost) and capped to the six most recent months.
 *  - **Raw fallback** — when the history is unavailable/empty, six bars are built
 *    for the six calendar months ending at the reference month (oldest leftmost):
 *    each bar sums the coerced `total_amount` of the owner's payments whose
 *    `month`/`year` match that calendar month and whose status is in the collected
 *    set (`paid`/`success`/`completed`, compared case-insensitively).
 *
 * A month within the window with no collected payments — and any month absent from
 * the raw payment data — yields a bar with `collected: 0`.
 *
 * @param monthly    the six-month monthly-collection history (may be null/empty).
 * @param payments   the owner's raw payments, used for the fallback grouping.
 * @param reference  the instant treated as "now" (injected for testability);
 *                   defaults to the current time.
 */
export function computeMonthlyBars(
  monthly: readonly DashboardCollectionRow[] | null | undefined,
  payments: readonly PaymentRow[],
  reference: Date = new Date(),
): MonthlyBar[] {
  if (monthly && monthly.length > 0) {
    const bars = monthly.map((row, index) => ({
      key: `${row.year ?? ""}-${row.month_number ?? index}`,
      label: row.month,
      collected: coerceNumber(row.collected),
      year: coerceNumber(row.year),
      monthNumber: coerceNumber(row.month_number ?? index),
    }))
    bars.sort((a, b) => a.year - b.year || a.monthNumber - b.monthNumber)
    return bars
      .slice(Math.max(0, bars.length - 6))
      .map(({ key, label, collected }) => ({ key, label, collected }))
  }

  const bars: MonthlyBar[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(reference.getFullYear(), reference.getMonth() - i, 1)
    const monthIndex = d.getMonth()
    const year = d.getFullYear()
    let collected = 0
    for (const p of payments) {
      if (
        coerceNumber(p.month) === monthIndex + 1 &&
        coerceNumber(p.year) === year &&
        isCollectedStatus(p.status)
      ) {
        collected += coerceNumber(p.total_amount)
      }
    }
    bars.push({
      key: `${year}-${monthIndex}`,
      label: d.toLocaleString("default", { month: "short" }),
      collected,
    })
  }
  return bars
}

/**
 * Toggle the monthly-chart bar selection (Req 5.6).
 *
 * Selecting an unselected bar makes it the selected bar (revealing its amount);
 * selecting the already-selected bar clears the selection (hiding its amount).
 * Returns the new selection key, or `null` when no bar is selected.
 */
export function toggleBarSelection(currentKey: string | null, barKey: string): string | null {
  return currentKey === barKey ? null : barKey
}

/**
 * Whether a bar's collected amount label should be shown (Req 5.7).
 *
 * A bar whose collected amount is 0 never produces an amount label; the chart
 * component combines this with the active selection so only a selected,
 * non-zero bar reveals its currency-formatted amount.
 */
export function shouldShowBarAmount(bar: MonthlyBar): boolean {
  return coerceNumber(bar.collected) > 0
}

// ---------------------------------------------------------------------------
// Tasks computation (Task 5.4)
// ---------------------------------------------------------------------------

/**
 * The exact Tasks_Section heading for the active Time_Filter (Req 6.1).
 *
 * Mirrors the mobile `tasksHeading` mapping verbatim so the two platforms label
 * the section identically:
 *  - `Today`        → `Today's Tasks`
 *  - `This Week`    → `This Week's Tasks`
 *  - `This Month`   → `This Month's Tasks`
 *  - `Last Month`   → `Last Month's Tasks`
 *  - `Custom Range` → `Custom Range Tasks`
 */
export function tasksHeading(filter: TimeFilter): string {
  switch (filter) {
    case "Today":
      return "Today's Tasks"
    case "This Week":
      return "This Week's Tasks"
    case "This Month":
      return "This Month's Tasks"
    case "Last Month":
      return "Last Month's Tasks"
    case "Custom Range":
      return "Custom Range Tasks"
    default:
      return "Today's Tasks"
  }
}

/**
 * Compute the follow-up (unpaid) payment tasks, mirroring the mobile dashboard's
 * `followUpPayments` selection rules (Req 6.2):
 *
 *  - Only unpaid payments are eligible (status not in the collected set —
 *    `paid`/`success`/`completed`, compared case-insensitively) that have a
 *    parseable `due_date`.
 *  - For `Last Month` and `Custom Range`, a payment is selected when its due
 *    date falls within the active `dateRange` (inclusive).
 *  - For every other filter (`Today`, `This Week`, `This Month`), a payment is
 *    selected when its due date falls within the active `dateRange` OR it is a
 *    current-month overdue payment (due date within the current month and before
 *    the start of the current local day).
 *
 * Each task carries the resolved tenant name, room number (`—` when unknown),
 * coerced amount, due date, and the source payment. The list is sorted by due
 * date ascending, breaking ties by tenant name in ascending alphabetical order.
 *
 * @param reference the instant treated as "now" (injected for testability;
 *                  determines the current-day / current-month window).
 */
export function computeFollowUpTasks(
  payments: readonly PaymentRow[],
  dateRange: DateRange,
  filter: TimeFilter,
  reference: Date = new Date(),
): FollowUpTask[] {
  const today = startOfDay(reference)
  const monthRange = currentMonthRange(reference)

  const unpaid = payments.filter((p) => {
    if (!p.due_date) return false
    if (isCollectedStatus(p.status)) return false
    const dueDate = new Date(p.due_date)
    if (Number.isNaN(dueDate.getTime())) return false

    if (filter === "Last Month" || filter === "Custom Range") {
      return dueDate >= dateRange.start && dueDate <= dateRange.end
    }

    const inFilterRange = isDateInRange(p.due_date, dateRange.start, dateRange.end)
    const isCurrentMonthOverdue =
      dueDate >= monthRange.start && dueDate <= monthRange.end && dueDate < today
    return inFilterRange || isCurrentMonthOverdue
  })

  return unpaid
    .map((p) => ({
      id: p.id,
      tenantName: resolveTenantName(p.tenants_table?.name),
      roomNumber: p.tenants_table?.rooms_table?.room_number || "—",
      amount: coerceNumber(p.total_amount),
      dueDate: p.due_date as string,
      payment: p,
    }))
    .sort((a, b) => {
      const da = new Date(a.dueDate).getTime()
      const db = new Date(b.dueDate).getTime()
      if (da !== db) return da - db
      return a.tenantName.localeCompare(b.tenantName)
    })
}

/**
 * Compute the maintenance tasks from `Under Working` complaints (Req 6.3).
 *
 * Each active complaint resolves its room number by matching the complaint's
 * `tenant_phone` against the owner's tenants on the last ten digits of the phone
 * number (whitespace stripped). When exactly one tenant matches, that tenant's
 * room number is shown (falling back to `Anonymous` when the matched tenant has
 * no room number); otherwise — no phone, no match, or multiple matches — the task
 * is labeled `Anonymous`. Mirrors the mobile `maintenanceTasks` phone-match rule.
 */
export function computeMaintenanceTasks(
  complaints: readonly ComplaintRow[],
  tenants: readonly TenantRow[],
): MaintenanceTask[] {
  const active = complaints.filter((c) => c.status === ACTIVE_COMPLAINT_STATUS)
  return active.map((c) => {
    const phoneClean = c.tenant_phone ? c.tenant_phone.replace(/\s+/g, "").slice(-10) : ""
    let roomNumber: string | "Anonymous" = "Anonymous"
    if (phoneClean) {
      const matches = tenants.filter((t) => {
        if (!t.mobile_number) return false
        const tPhoneClean = t.mobile_number.replace(/\s+/g, "").slice(-10)
        return tPhoneClean === phoneClean
      })
      if (matches.length === 1) {
        roomNumber = matches[0].rooms_table?.room_number || "Anonymous"
      }
    }
    return {
      id: c.id,
      message: c.complaint_message ?? "",
      roomNumber,
      complaint: c,
    }
  })
}

/**
 * The move-task result, distinguishing move-out tasks from check-in tasks so a
 * single pass over the owner's tenants produces both lists (Req 6.4, 6.5).
 */
export interface MoveTasks {
  moveOut: MoveTask[]
  checkIn: MoveTask[]
}

/**
 * Compute the move-out and check-in tasks for the active range (Req 6.4, 6.5):
 *
 *  - **Move-out** — tenants whose status is `notice_period` or `move_out` with an
 *    `exit_date` within `dateRange` (inclusive of both boundaries).
 *  - **Check-in** — tenants whose status is `pending_move_in` with a `join_date`
 *    within `dateRange` (inclusive of both boundaries).
 *
 * Each task carries the resolved tenant name, room number (`—` when unknown), and
 * its driving date (exit date for move-out, move-in date for check-in). Each list
 * is sorted by its date ascending.
 */
export function computeMoveTasks(tenants: readonly TenantRow[], dateRange: DateRange): MoveTasks {
  const byDateAsc = (a: MoveTask, b: MoveTask) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()

  const moveOut = tenants
    .filter(
      (t) =>
        (MOVE_OUT_STATUSES as readonly string[]).includes(t.status) &&
        isDateInRange(t.exit_date, dateRange.start, dateRange.end),
    )
    .map((t) => ({
      id: t.id,
      tenantName: resolveTenantName(t.name),
      roomNumber: t.rooms_table?.room_number || "—",
      date: t.exit_date as string,
    }))
    .sort(byDateAsc)

  const checkIn = tenants
    .filter(
      (t) =>
        t.status === CHECK_IN_STATUS &&
        isDateInRange(t.join_date, dateRange.start, dateRange.end),
    )
    .map((t) => ({
      id: t.id,
      tenantName: resolveTenantName(t.name),
      roomNumber: t.rooms_table?.room_number || "—",
      date: t.join_date as string,
    }))
    .sort(byDateAsc)

  return { moveOut, checkIn }
}

// ---------------------------------------------------------------------------
// Recent-activity & leads computation (Task 5.9)
// ---------------------------------------------------------------------------

/** Safely convert a Date or date-string to epoch milliseconds, or 0 when invalid. */
function safeTime(value: Date | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const date = value instanceof Date ? value : new Date(value)
  const ms = date.getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Extract the underlying record status from an activity row's `raw_item`, when it
 * carries a string `status` field. Used to recover the source payment/complaint
 * status (the bounded `DashboardActivityRow.status` only models payment success
 * states), mirroring the mobile dashboard reading `(raw_item as any)?.status`.
 */
function activityRawStatus(raw: unknown): string | undefined {
  if (raw && typeof raw === "object" && "status" in raw) {
    const status = (raw as { status?: unknown }).status
    return typeof status === "string" ? status : undefined
  }
  return undefined
}

/**
 * Whether an aggregate activity row should be rendered in Recent_Activity,
 * mirroring the mobile dashboard's selection (Req 7.1):
 *  - `reminder` rows are always excluded;
 *  - `payment` rows are included only when their (raw) status is `submitted`
 *    (compared case-insensitively, preferring the row status then `raw_item`);
 *  - `complaint` rows are included only when their underlying status is
 *    `Under Working` (read from `raw_item`, compared case-insensitively).
 */
function isRenderableActivity(row: DashboardActivityRow): boolean {
  if (row.type === "reminder") return false

  if (row.type === "payment") {
    const status =
      (typeof row.status === "string" && row.status) || activityRawStatus(row.raw_item) || ""
    return status.trim().toLowerCase() === "submitted"
  }

  if (row.type === "complaint") {
    const status = activityRawStatus(row.raw_item) ?? (typeof row.status === "string" ? row.status : "")
    return status.trim().toLowerCase() === ACTIVE_COMPLAINT_STATUS.toLowerCase()
  }

  return false
}

/**
 * Compute a relative-time label for an activity timestamp, mirroring the mobile
 * dashboard's formatting exactly (Req 7.2).
 *
 * The label uses the largest applicable whole unit among days, hours, and minutes
 * (`N day(s) ago`, `N hr(s) ago`, `N min(s) ago`, pluralized when N > 1), and is
 * `Just now` when the elapsed time is under 60 seconds (i.e. fewer than one whole
 * minute). A future or unparseable timestamp yields `Just now`.
 *
 * @param timestamp the activity instant (a `Date` or date string).
 * @param now       the instant treated as "now" (injected for testability).
 */
export function relativeTimeLabel(timestamp: Date | string, now: Date): string {
  const ts = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const tsMs = ts.getTime()
  if (Number.isNaN(tsMs)) return "Just now"

  const diffMs = now.getTime() - tsMs
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
  if (diffHours > 0) return `${diffHours} hr${diffHours > 1 ? "s" : ""} ago`
  if (diffMins > 0) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`
  return "Just now"
}

/**
 * Compute the Recent_Activity view list from the Aggregation_Service activity rows
 * (Req 7.1, 7.4):
 *
 *  - keeps only renderable items — submitted payments and `Under Working`
 *    complaints (see {@link isRenderableActivity}); reminders and other statuses
 *    are dropped;
 *  - excludes every item whose id is in `dismissedIds`;
 *  - sorts the survivors by activity timestamp descending (most recent first),
 *    with missing/unparseable timestamps treated as the epoch (sorted last); and
 *  - caps the result to the {@link MAX_RECENT_ACTIVITY} most recent items.
 *
 * Each item carries the resolved tenant name, action label, optional amount (only
 * when present), status label, parsed timestamp, and a relative-time label
 * computed against `now` (see {@link relativeTimeLabel}).
 *
 * @param activityRows  the aggregate activity rows.
 * @param dismissedIds  the set of dismissed activity ids to exclude (Req 7.4).
 * @param now           the instant treated as "now" for relative-time labels
 *                      (injected for testability; defaults to the current time).
 */
export function computeRecentActivity(
  activityRows: readonly DashboardActivityRow[],
  dismissedIds: ReadonlySet<string>,
  now: Date = new Date(),
): ActivityView[] {
  return activityRows
    .filter((row) => isRenderableActivity(row) && !dismissedIds.has(row.id))
    .map((row) => {
      const timestamp = row.occurred_at ? new Date(row.occurred_at) : new Date(now.getTime())
      const amount =
        row.amount === null || row.amount === undefined || row.amount === ""
          ? undefined
          : String(row.amount)
      return {
        id: row.id,
        type: row.type === "complaint" ? "complaint" : "payment",
        tenant: resolveTenantName(row.tenant),
        action: row.action || "Activity",
        amount,
        status: row.status || "pending",
        relativeTime: relativeTimeLabel(timestamp, now),
        timestamp,
      } satisfies ActivityView
    })
    .sort((a, b) => safeTime(b.timestamp) - safeTime(a.timestamp))
    .slice(0, MAX_RECENT_ACTIVITY)
}

/**
 * Compute the Leads_Section view list (Req 8.1).
 *
 * Leads are ordered by creation time descending and, for leads sharing the same
 * creation time, by lead identifier descending. Each lead's name is resolved to a
 * non-empty display string via {@link resolveTenantName}, substituting the fixed
 * placeholder label for a missing/empty name, and its phone is normalized to a
 * string (empty when absent).
 */
export function computeLeads(leads: readonly LeadRow[]): LeadView[] {
  return leads
    .map((lead) => ({
      id: lead.id,
      name: resolveTenantName(lead.name),
      phone: typeof lead.phone === "string" ? lead.phone : "",
      created_at: lead.created_at,
    }))
    .sort((a, b) => {
      const tb = safeTime(b.created_at)
      const ta = safeTime(a.created_at)
      if (tb !== ta) return tb - ta
      return b.id - a.id
    })
}

/**
 * Whether the copy-phone action should be enabled for a lead (Req 8.5).
 *
 * Returns true if and only if the lead has a non-empty (non-whitespace) phone
 * number, so a lead without a phone never presents an enabled copy-phone action.
 */
export function canCopyPhone(lead: { phone?: string | null }): boolean {
  return typeof lead.phone === "string" && lead.phone.trim().length > 0
}

// ---------------------------------------------------------------------------
// Sanitization & owner-response validation (Task 7.1)
//
// Mirrors the mobile `app/src/lib/sanitize.ts` helpers byte-for-byte so the two
// platforms strip and escape owner/tenant text identically. Pure string work —
// no DOM/document APIs — so it stays unit- and property-testable.
// ---------------------------------------------------------------------------

/**
 * Strip all HTML markup from a string, yielding plain text (Req 18.2).
 *
 * Removes every `<...>` tag occurrence, leaving the surrounding text intact, and
 * returns an empty string for missing/null/non-string input. This is the exact
 * transformation applied before persisting an owner response, so embedded markup
 * never reaches storage. Mirrors the mobile `stripHtml` helper.
 */
export function stripHtml(text: unknown): string {
  if (typeof text !== "string" || text.length === 0) return ""
  return text.replace(/<[^>]*>/g, "")
}

/**
 * Escape a string for safe, inert literal rendering (Req 18.1).
 *
 * Replaces the HTML-significant characters (`&`, `<`, `>`, `"`, `'`, `/`) with
 * their entity equivalents so any embedded tags or scripts in owner-/tenant-
 * provided text (complaint messages, owner responses, lead details) are
 * displayed as literal characters and never interpreted or executed by the
 * browser. Missing/null/non-string input yields an empty string. The `&` is
 * escaped first so already-present entities are not double-decoded. Mirrors the
 * mobile `sanitizeText` helper.
 */
export function sanitizeInert(text: unknown): string {
  if (typeof text !== "string" || text.length === 0) return ""
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
}

/**
 * The result of validating a submitted owner response (Req 18.3).
 *
 * On success it carries the persistence-ready `value` — the HTML-stripped plain
 * text. On failure it reports the single possible failure reason, `max-length`.
 */
export type OwnerResponseValidation =
  | { ok: true; value: string }
  | { ok: false; error: "max-length" }

/**
 * Validate and prepare an owner response for persistence (Req 10.4, 18.2, 18.3).
 *
 * The input has all HTML markup removed via {@link stripHtml}; the submission is
 * accepted if and only if the resulting plain text is at most
 * {@link OWNER_RESPONSE_MAX} characters long. On acceptance the stripped text is
 * returned as `value` (the exact text to persist); otherwise the result is a
 * `max-length` rejection and the caller retains the unsent text in the input.
 */
export function validateOwnerResponse(text: unknown): OwnerResponseValidation {
  const stripped = stripHtml(text)
  if (stripped.length > OWNER_RESPONSE_MAX) {
    return { ok: false, error: "max-length" }
  }
  return { ok: true, value: stripped }
}

// ---------------------------------------------------------------------------
// Bottom-nav matching (Task 7.4)
// ---------------------------------------------------------------------------

/** A single Bottom_Nav_Bar destination: its stable key and its route href. */
export interface NavDestination {
  key: string
  href: string
}

/**
 * Normalize a route path for comparison: drop any query string / hash fragment
 * and collapse a trailing slash (preserving the bare root `/`). Returns `null`
 * for non-string input.
 */
function normalizeNavPath(value: unknown): string | null {
  if (typeof value !== "string") return null
  let path = value.split("?")[0].split("#")[0]
  if (path.length > 1 && path.endsWith("/")) {
    path = path.replace(/\/+$/, "")
    if (path.length === 0) path = "/"
  }
  return path
}

/**
 * Derive the single active Bottom_Nav_Bar destination key for a route, with
 * exactly-one-or-none semantics (Req 16.5, 16.6).
 *
 * A destination matches when:
 *  - its href is the root `/` — matched only by the exact root path (the root
 *    never matches sub-routes); or
 *  - its href is a sub-route — matched by the exact path or any nested path
 *    beneath it (`/rooms` matches `/rooms` and `/rooms/123`, but not `/roomsx`).
 *
 * When several destinations match (e.g. `/payments` and a hypothetical
 * `/payments/history`), the longest (most-specific) href wins, so at most one
 * key is ever returned. Returns the matching destination's key, or `null` when
 * the route matches none of the destinations.
 *
 * Pure and framework-free so the `BottomNavBar` component can feed it the value
 * from `usePathname()` and it stays property-testable.
 */
export function deriveActiveNavKey(
  pathname: string,
  destinations: readonly NavDestination[],
): string | null {
  const path = normalizeNavPath(pathname)
  if (path === null) return null

  let bestKey: string | null = null
  let bestLength = -1
  for (const dest of destinations) {
    const href = normalizeNavPath(dest?.href)
    if (href === null) continue

    const matches = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`)
    if (!matches) continue

    if (href.length > bestLength) {
      bestLength = href.length
      bestKey = dest.key
    }
  }
  return bestKey
}

// ---------------------------------------------------------------------------
// Reduced-motion variant resolution (Task 7.4)
// ---------------------------------------------------------------------------

/**
 * A framework-agnostic animation variant: a bag of target visual properties
 * (e.g. `opacity`, `x`, `scale`) plus an optional `transition` descriptor. This
 * mirrors the shape consumed by `framer-motion` without depending on it, so the
 * resolver stays pure and testable.
 */
export interface MotionVariant {
  /** Optional transition descriptor (e.g. `{ duration, ease }`). */
  transition?: Record<string, unknown>
  /** Target visual properties (opacity, x, y, scale, …). */
  [property: string]: unknown
}

/**
 * Resolve the animation variant to apply for a target visual state, honoring the
 * Reduced_Motion setting (Req 15.8, 16.10).
 *
 *  - When Reduced_Motion is **off**, the target variant is returned unchanged so
 *    the element animates normally to its final state.
 *  - When Reduced_Motion is **on**, the same target visual properties are kept
 *    (so the underlying state change — section shown, panel opened/closed, toast
 *    shown/dismissed, nav highlight moved — still completes) but the transition
 *    is forced to `{ duration: 0 }`, so the element jumps straight to the final
 *    state with no movement, scaling, or fading over time.
 *
 * The returned object is always a fresh value; the input `target` is never
 * mutated.
 */
export function resolveMotionVariant(
  target: MotionVariant,
  reducedMotion: boolean,
): MotionVariant {
  const variant: MotionVariant = target && typeof target === "object" ? target : {}
  if (!reducedMotion) return variant
  return { ...variant, transition: { ...(variant.transition ?? {}), duration: 0 } }
}

// ---------------------------------------------------------------------------
// Bulk-notice run summarization (Task 7.4)
// ---------------------------------------------------------------------------

/** The outcome of a single per-recipient notice send. */
export interface NoticeResult {
  tenantId: number
  tenantName: string
  /** `true` when the notice was delivered, `false` when it failed/timed out. */
  ok: boolean
}

/** The conserved tally of a completed bulk-notice run (Req 11.2). */
export interface BulkNoticeRun {
  total: number
  succeeded: number
  failed: number
  /** The recipients whose notice was not delivered, preserved in input order. */
  failures: NoticeResult[]
}

/**
 * Summarize a completed bulk-notice run from its per-recipient outcomes (Req 11.2).
 *
 * `total` equals the number of targeted recipients, `failures` are the outcomes
 * whose `ok` is `false` (in their original order), `failed` is the failure count,
 * and `succeeded` is `total − failed`. By construction `succeeded + failed`
 * always equals `total`, so the tally is conserved regardless of the mix of
 * outcomes. Pure and framework-free; the `notice-service` client feeds it the
 * accumulated results after every recipient has been attempted.
 */
export function summarizeBulkRun(outcomes: readonly NoticeResult[]): BulkNoticeRun {
  const total = outcomes.length
  const failures = outcomes.filter((o) => o.ok === false)
  const failed = failures.length
  return { total, succeeded: total - failed, failed, failures: [...failures] }
}
