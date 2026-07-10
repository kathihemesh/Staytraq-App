// Feature: dashboard-server-aggregation
//
// Mobile copy of the platform-agnostic shared data-access contract for the
// dashboard aggregate RPCs. This mirrors `web/lib/dashboard/dashboard-aggregates.ts`
// byte-for-byte in its type contract so both platforms share an identical shape.
//
// This module imports no React Native and no concrete Supabase client, so it stays
// pure and testable. The Supabase client is injected via the `SupabaseLike`
// interface below.
//
// NOTE: The `loadDashboardAggregates` implementation is wired in task 9.1. Only its
// signature is declared here; the cache/debounce primitives (task 6.2) depend solely
// on the `DashboardAggregates` type, not the implementation.

/**
 * Minimal injected Supabase client contract.
 *
 * Mirrors the shape of the Supabase JS client's `rpc(name, args)` method, which
 * resolves to a `{ data, error }` envelope. Only `rpc` is required by the helper,
 * so the contract is intentionally narrow to keep callers and tests simple.
 */
export interface SupabaseLike {
  rpc<T = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: T | null; error: { message: string } | null }>
}

/**
 * Result of `get_dashboard_summary`. Mirrors the existing UI summary shape; every
 * field is optional because the helper coerces/defaults missing values (Req 6.2).
 */
export interface DashboardSummary {
  current_month?: number
  current_year?: number
  total_active_tenants?: number
  paid_amount_this_month?: number
  pending_payment_count_this_month?: number
  pending_amount_this_month?: number
  late_payment_count_this_month?: number
  payment_status_counts?: {
    paid?: number
    pending?: number
    late?: number
    submitted?: number
    rejected?: number
  }
  bed_stats?: { total?: number; occupied?: number; vacant?: number }
  pending_complaints_count?: number
  chatbot_enabled?: boolean
  pg_id?: number | null
}

/** One row of `get_dashboard_monthly_collection`. */
export interface DashboardCollectionRow {
  month: string
  month_number?: number
  year?: number
  collected: number
  pending: number
}

/** One row of `get_dashboard_recent_activity`. */
export interface DashboardActivityRow {
  id: string
  type: "payment" | "complaint" | "reminder"
  tenant: string
  action: string
  amount?: string | null
  status: "success" | "pending" | "late"
  occurred_at: string
  raw_item: unknown
}

/**
 * Per-section result so callers can render whatever succeeded independently of the
 * sections that failed (partial degradation, Req 13).
 */
export type SectionResult<T> = { ok: true; data: T } | { ok: false; error: Error }

/** Combined result of a single dashboard load: one `SectionResult` per RPC. */
export interface DashboardAggregates {
  summary: SectionResult<DashboardSummary>
  monthly: SectionResult<DashboardCollectionRow[]>
  activity: SectionResult<DashboardActivityRow[]>
}

/** Options accepted by `loadDashboardAggregates`. */
export interface LoadDashboardOptions {
  ownerId: string
  pgId?: number | null
  /** Months of monthly-collection history to request. Default 6 (Req 2.1). */
  monthsBack?: number
  /** Max recent-activity rows to request. Default 7 (Req 3.2). */
  limitCount?: number
  /**
   * Optional wrapper around each RPC call. Identity by default.
   */
  call?: <T>(fn: () => Promise<T>) => Promise<T>
}

/** Default months of monthly-collection history requested (Req 2.1). */
const DEFAULT_MONTHS_BACK = 6
/** Default max recent-activity rows requested (Req 3.2). */
const DEFAULT_LIMIT_COUNT = 7

/** Identity wrapper used when no `call` option is supplied. */
const identityCall = <T>(fn: () => Promise<T>): Promise<T> => fn()

/** Coerce a possibly-missing value to a finite number, defaulting to 0 (Req 6.2). */
function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Normalize the raw summary payload, coercing numerics and defaulting to `{}`. */
function mapSummary(data: unknown): DashboardSummary {
  const raw = (data ?? {}) as Record<string, unknown>
  const counts = (raw.payment_status_counts ?? {}) as Record<string, unknown>
  const beds = (raw.bed_stats ?? {}) as Record<string, unknown>
  return {
    current_month: toNumber(raw.current_month),
    current_year: toNumber(raw.current_year),
    total_active_tenants: toNumber(raw.total_active_tenants),
    paid_amount_this_month: toNumber(raw.paid_amount_this_month),
    pending_payment_count_this_month: toNumber(raw.pending_payment_count_this_month),
    pending_amount_this_month: toNumber(raw.pending_amount_this_month),
    late_payment_count_this_month: toNumber(raw.late_payment_count_this_month),
    payment_status_counts: {
      paid: toNumber(counts.paid),
      pending: toNumber(counts.pending),
      late: toNumber(counts.late),
      submitted: toNumber(counts.submitted),
      rejected: toNumber(counts.rejected),
    },
    bed_stats: {
      total: toNumber(beds.total),
      occupied: toNumber(beds.occupied),
      vacant: toNumber(beds.vacant),
    },
    pending_complaints_count: toNumber(raw.pending_complaints_count),
    chatbot_enabled: Boolean(raw.chatbot_enabled),
    pg_id: raw.pg_id == null ? null : toNumber(raw.pg_id),
  }
}

/** Normalize the raw monthly-collection payload, defaulting to `[]`. */
function mapMonthly(data: unknown): DashboardCollectionRow[] {
  const rows = Array.isArray(data) ? data : []
  return rows.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>
    return {
      month: String(r.month ?? ""),
      month_number: toNumber(r.month_number),
      year: toNumber(r.year),
      collected: toNumber(r.collected),
      pending: toNumber(r.pending),
    }
  })
}

/** Normalize the raw recent-activity payload, defaulting to `[]`. */
function mapActivity(data: unknown): DashboardActivityRow[] {
  const rows = Array.isArray(data) ? data : []
  return rows.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>
    return {
      id: String(r.id ?? ""),
      type: (r.type as DashboardActivityRow["type"]) ?? "payment",
      tenant: r.tenant == null ? "Unknown Tenant" : String(r.tenant),
      action: String(r.action ?? ""),
      amount: r.amount == null ? null : String(r.amount),
      status: (r.status as DashboardActivityRow["status"]) ?? "pending",
      occurred_at: String(r.occurred_at ?? ""),
      raw_item: r.raw_item,
    }
  })
}

/** Coerce an unknown rejection/envelope error into an `Error` instance. */
function toError(err: unknown): Error {
  if (err instanceof Error) return err
  if (err && typeof err === "object" && "message" in err) {
    return new Error(String((err as { message: unknown }).message))
  }
  return new Error(typeof err === "string" ? err : "Dashboard aggregate call failed")
}

/**
 * Convert a settled RPC promise (resolving to a `{ data, error }` envelope) into a
 * `SectionResult`: any rejection or envelope error becomes `{ ok: false }`, and a
 * successful payload is mapped/coerced into `{ ok: true, data }`. Never throws.
 */
function toSectionResult<TRaw, TMapped>(
  settled: PromiseSettledResult<{ data: TRaw | null; error: { message: string } | null }>,
  map: (data: unknown) => TMapped,
): SectionResult<TMapped> {
  if (settled.status === "rejected") {
    return { ok: false, error: toError(settled.reason) }
  }
  const { data, error } = settled.value
  if (error) {
    return { ok: false, error: toError(error) }
  }
  return { ok: true, data: map(data) }
}

/**
 * Issues EXACTLY three RPC calls in parallel (Req 9.2) and never throws: each call
 * is independently settled so one failure does not blank the others (Req 13.1).
 *
 * Performs no per-record aggregation — it only maps/coerces the bounded RPC payloads
 * the Aggregation_Service already computed (Req 9.3). Numeric fields are coerced with
 * `Number(...)`, arrays default to `[]`, and the summary defaults to `{}` so the
 * rendered UI matches the existing client behavior (Req 6.2).
 */
export async function loadDashboardAggregates(
  supabase: SupabaseLike,
  opts: LoadDashboardOptions,
): Promise<DashboardAggregates> {
  const { ownerId, pgId, monthsBack = DEFAULT_MONTHS_BACK, limitCount = DEFAULT_LIMIT_COUNT } = opts
  const call = opts.call ?? identityCall

  const [summarySettled, monthlySettled, activitySettled] = await Promise.allSettled([
    call(() => Promise.resolve(supabase.rpc("get_dashboard_summary", { owner_id: ownerId, p_pg_id: pgId }))),
    call(() =>
      Promise.resolve(
        supabase.rpc("get_dashboard_monthly_collection", {
          owner_id: ownerId,
          months_back: monthsBack,
          p_pg_id: pgId,
        }),
      ),
    ),
    call(() =>
      Promise.resolve(
        supabase.rpc("get_dashboard_recent_activity", {
          owner_id: ownerId,
          limit_count: limitCount,
          p_pg_id: pgId,
        }),
      ),
    ),
  ])

  return {
    summary: toSectionResult(summarySettled, mapSummary),
    monthly: toSectionResult(monthlySettled, mapMonthly),
    activity: toSectionResult(activitySettled, mapActivity),
  }
}
