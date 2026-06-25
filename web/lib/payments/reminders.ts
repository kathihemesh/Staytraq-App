// Feature: payment-reminders
//
// Pure, framework-free date/state logic that drives the daily payment-reminder
// scheduler (`web/supabase/functions/payment-reminders/index.ts`). Nothing here
// imports React, Next, Deno, or Supabase, so every function is unit- and
// property-testable. The edge function inlines copies of these predicates (it
// cannot bundle a cross-directory import), keeping this module the single
// source of truth for the wording and timing rules.
//
// Reminder policy:
//   - A payment still needs reminders until its status is "paid" or "submitted"
//     (under review). "pending"/"late"/null all still need reminders.
//   - A bill enters the reminder window when it is due within the next
//     REMINDER_LEAD_DAYS days, due today, or overdue.
//   - All of a tenant's in-window bills are combined into ONE message per day.

export const REMINDER_LEAD_DAYS = 2

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** A bill's urgency relative to "today". */
export type DueKind = "upcoming" | "due_today" | "late"

/** The minimal unpaid-bill shape the reminder logic reads. */
export interface DueBill {
  amount: number
  month: number // 1-12
  year: number
  dueDate: string // YYYY-MM-DD (calendar date)
  status: string | null
}

/** A presentation-ready, in-window bill line for the combined message. */
export interface ReminderBillView {
  amount: number
  monthName: string
  year: number
  kind: DueKind
  /** Days until due (>0) for upcoming, 0 for due today, days overdue (>0) for late. */
  days: number
  /** Human label, e.g. "due today", "due in 2 days", "late by 3 days". */
  label: string
}

/** Parse a calendar date (YYYY-MM-DD or Date) to a UTC-midnight epoch ms, or null. */
function toCalendarMs(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Whole calendar days from `today` to `dueDate` (positive when the due date is
 * in the future, negative when overdue). Returns null on unparseable input.
 */
export function daysUntilDue(dueDate: string | Date, today: string | Date): number | null {
  const dueMs = toCalendarMs(dueDate)
  const todayMs = toCalendarMs(today)
  if (dueMs === null || todayMs === null) return null
  return Math.round((dueMs - todayMs) / MS_PER_DAY)
}

/**
 * Whether a payment still warrants reminders. Reminders continue until the
 * status is "paid" or "submitted" (under review); everything else (including a
 * null/"pending"/"late" status) still needs reminding.
 */
export function needsPaymentReminder(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase()
  return s !== "paid" && s !== "submitted"
}

/** Classify a bill's urgency relative to today. Returns null on bad input. */
export function classifyDue(
  dueDate: string | Date,
  today: string | Date,
): { kind: DueKind; days: number } | null {
  const delta = daysUntilDue(dueDate, today)
  if (delta === null) return null
  if (delta > 0) return { kind: "upcoming", days: delta }
  if (delta === 0) return { kind: "due_today", days: 0 }
  return { kind: "late", days: -delta }
}

/**
 * Whether a bill is inside the reminder window: due within the next
 * `leadDays` days, due today, or overdue (any amount). Bills due further than
 * `leadDays` in the future are not yet reminded.
 */
export function isWithinReminderWindow(
  dueDate: string | Date,
  today: string | Date,
  leadDays: number = REMINDER_LEAD_DAYS,
): boolean {
  const delta = daysUntilDue(dueDate, today)
  if (delta === null) return false
  return delta <= leadDays
}

/** Build the per-bill status label, e.g. "due today" / "due in 2 days" / "late by 3 days". */
export function billLabel(kind: DueKind, days: number): string {
  if (kind === "due_today") return "due today"
  if (kind === "upcoming") {
    if (days === 1) return "due tomorrow"
    return `due in ${days} days`
  }
  // late
  if (days === 1) return "late by 1 day"
  return `late by ${days} days`
}

/** Sort key: late first (most overdue first), then due today, then soonest upcoming. */
function urgencyRank(view: ReminderBillView): number {
  if (view.kind === "late") return -1000 - view.days // most overdue first
  if (view.kind === "due_today") return 0
  return view.days // sooner upcoming first
}

/**
 * Select the tenant's in-window, still-unpaid bills as presentation-ready views,
 * ordered most-urgent-first. Bills outside the window or already paid/under
 * review are excluded.
 */
export function selectReminderBills(
  bills: ReadonlyArray<DueBill>,
  today: string | Date,
  leadDays: number = REMINDER_LEAD_DAYS,
): ReminderBillView[] {
  const views: ReminderBillView[] = []
  for (const bill of bills) {
    if (!needsPaymentReminder(bill.status)) continue
    if (!isWithinReminderWindow(bill.dueDate, today, leadDays)) continue
    const cls = classifyDue(bill.dueDate, today)
    if (!cls) continue
    const monthName = MONTH_NAMES[bill.month - 1] ?? "Unknown"
    views.push({
      amount: bill.amount,
      monthName,
      year: bill.year,
      kind: cls.kind,
      days: cls.days,
      label: billLabel(cls.kind, cls.days),
    })
  }
  views.sort((a, b) => urgencyRank(a) - urgencyRank(b))
  return views
}

/**
 * Build the combined, dynamic reminder message for one tenant. Always names the
 * tenant, states the number of bills due, lists each bill with its status, and
 * embeds the single payment link. When the owner's PG name is known it is used
 * in place of the generic brand name. Returns "" when there are no bills to show.
 */
export function buildPaymentReminderMessage(
  name: string,
  views: ReadonlyArray<ReminderBillView>,
  link: string,
  pgName?: string | null,
): string {
  if (views.length === 0) return ""
  const tenantName = (name ?? "").trim() || "Tenant"
  const pg = (pgName ?? "").trim() || "your PG"
  const count = views.length
  const noun = count === 1 ? "pending payment" : "pending payments"

  const lines = views
    .map((v, i) => `${i + 1}. ₹${v.amount} for ${v.monthName} ${v.year} — ${v.label}`)
    .join("\n")

  return (
    `Hi ${tenantName},\n\n` +
    `You have ${count} ${noun} for ${pg}:\n\n` +
    `${lines}\n\n` +
    `View all your dues and pay securely here:\n${link}\n\n` +
    `If you've already paid, please ignore this message. Thank you!`
  )
}

/**
 * End-to-end helper: from a tenant's unpaid bills and "today", produce the
 * combined message + count, or null when nothing is in the reminder window.
 */
export function summarizeTenantReminder(
  name: string,
  bills: ReadonlyArray<DueBill>,
  today: string | Date,
  link: string,
  leadDays: number = REMINDER_LEAD_DAYS,
  pgName?: string | null,
): { message: string; count: number; views: ReminderBillView[] } | null {
  const views = selectReminderBills(bills, today, leadDays)
  if (views.length === 0) return null
  return { message: buildPaymentReminderMessage(name, views, link, pgName), count: views.length, views }
}
