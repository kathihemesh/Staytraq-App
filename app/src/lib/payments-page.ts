// Feature: payments-loading-performance
//
// Mobile copy of the platform-agnostic shared data-access contract for the
// payments-page RPCs. This mirrors `web/lib/payments/payments-page.ts`
// byte-for-byte in its type contract and pure logic so both platforms share an
// identical shape, following the same convention as `app/src/lib/dashboard-aggregates.ts`.
//
// This module imports no React Native and no concrete Supabase client, so it stays
// pure and testable. The Supabase client is injected via the `SupabaseLike`
// interface below.
//
// It exposes:
//   - pure helpers: `buildPageArgs`, `reducePageResult`, `hasMorePages`,
//     `filterSignature`, `initialPageState`
//   - async wrappers: `fetchPaymentsPage`, `fetchMonthSummary` (map the Supabase
//     `{ data, error }` envelope to a `Result` and never throw)
//   - the `PaymentFilters` / `PageState` / `PaymentRow` / `MonthSummary` /
//     `PageArgs` / `SummaryArgs` / `Result` types and `PAGE_SIZE`

/**
 * Minimal injected Supabase client contract.
 *
 * Mirrors the shape of the Supabase JS client's `rpc(name, args)` method, which
 * resolves to a `{ data, error }` envelope. Only `rpc` is required by the helpers,
 * so the contract is intentionally narrow to keep callers and tests simple.
 */
export interface SupabaseLike {
  rpc<T = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: T | null; error: { message: string } | null }>
}

/** The fixed maximum number of payment records returned in a single page (Req 1.3, 4.1). */
export const PAGE_SIZE = 50

/**
 * Owner-selected filter set that scopes a payments page request. `status` is either
 * the literal `"all"` (no status restriction) or a single existing `Payment_Status`
 * value. `search` is the raw, possibly-empty search term.
 */
export interface PaymentFilters {
  month: number
  year: number
  status: string
  search: string
}

/**
 * One payment row returned by `get_payments_page`. Field-for-field mirror of the SQL
 * `TABLE(...)` row shape from the design. Optional/related fields are `null` rather
 * than absent so a row is never dropped for a missing value (Req 1.6).
 */
export interface PaymentRow {
  id: number
  tenant_id: number | null
  month: number | null
  year: number | null
  rent_amount: number | null
  extra_charges: number | null
  total_amount: number | null
  due_date: string | null
  status: string | null
  paid_at: string | null
  submitted_at: string | null
  verified_at: string | null
  reminder_sent: boolean | null
  payment_token: string | null
  payment_method: string | null
  payment_code: string | null
  screenshot_path: string | null
  utr_number: string | null
  verification_notes: string | null
  tenant_name: string | null
  tenant_mobile_number: string | null
  room_number: string | null
  rent_amount_room: number | null
}

/** Aggregate totals returned by `get_payment_month_summary` for a month/year. */
export interface MonthSummary {
  month: number
  year: number
  total_collected: number
  total_pending: number
  total_late: number
  total_submitted: number
}

/**
 * Client-side pagination/infinite-load state for one filter view.
 *
 * - `rows`: the currently displayed payment rows.
 * - `pageOffset`: the offset already consumed (number of rows loaded for these filters).
 * - `filterSignature`: a stable string identity of the active filter set; used to
 *   distinguish "same filters → append" from "filter change → replace".
 * - `latestRequestId`: the monotonically increasing id of the most recently issued
 *   request, used to recognize append-eligible results.
 * - `fullyLoaded`: true once a short page (< PAGE_SIZE) arrived for these filters.
 * - `isLoading`: whether a request is currently in flight.
 */
export interface PageState {
  rows: PaymentRow[]
  pageOffset: number
  filterSignature: string
  latestRequestId: number
  fullyLoaded: boolean
  isLoading: boolean
}

/** RPC argument object for `get_payments_page`. */
export interface PageArgs {
  owner_id: string
  p_month: number
  p_year: number
  status_filter: string
  search_term: string
  page_size: number
  page_offset: number
}

/** RPC argument object for `get_payment_month_summary`. */
export interface SummaryArgs {
  owner_id: string
  p_month: number
  p_year: number
}

/**
 * Result of an async RPC wrapper: a successful payload is `{ ok: true, data }`, and
 * any rejection or envelope error becomes `{ ok: false, error }`. Mirrors the
 * `SectionResult` shape in `dashboard-aggregates.ts`. The wrappers never throw.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: Error }

/**
 * Stable string identity of a filter set. Two filter sets share a signature iff they
 * agree on month, year, status, and the trimmed search term, so any user-visible
 * filter change produces a new signature (Req 4.6).
 */
export function filterSignature(f: PaymentFilters): string {
  return JSON.stringify([f.month, f.year, f.status, f.search.trim()])
}

/**
 * Pure: build the `get_payments_page` RPC args for a filter set + offset.
 *
 * The first request for a filter set uses `page_size = 50` and `page_offset = 0`
 * (Req 4.1); subsequent pages pass the advanced `pageOffset` (Req 4.2).
 */
export function buildPageArgs(
  ownerId: string,
  filters: PaymentFilters,
  pageOffset: number,
): PageArgs {
  return {
    owner_id: ownerId,
    p_month: filters.month,
    p_year: filters.year,
    status_filter: filters.status,
    search_term: filters.search,
    page_size: PAGE_SIZE,
    page_offset: pageOffset,
  }
}

/** Pure: build the `get_payment_month_summary` RPC args for a filter set. */
export function buildSummaryArgs(ownerId: string, filters: PaymentFilters): SummaryArgs {
  return {
    owner_id: ownerId,
    p_month: filters.month,
    p_year: filters.year,
  }
}

/**
 * Pure: decide whether more pages remain for the current filters.
 *
 * A full page (exactly PAGE_SIZE rows) implies more pages may exist; a short page
 * means the list is fully loaded (Req 4.5).
 */
export function hasMorePages(incoming: PaymentRow[]): boolean {
  return incoming.length === PAGE_SIZE
}

/**
 * Create the initial `PageState` for a filter set (no rows loaded yet).
 */
export function initialPageState(filters: PaymentFilters): PageState {
  return {
    rows: [],
    pageOffset: 0,
    filterSignature: filterSignature(filters),
    latestRequestId: 0,
    fullyLoaded: false,
    isLoading: false,
  }
}

/**
 * Pure: given the current state and an incoming page, compute the next state.
 *
 * Behavior (each maps to a requirement):
 *   - Append on next page (Req 4.3): when the incoming result belongs to the same
 *     filter signature as the current state, the incoming rows are appended to the
 *     existing rows in order.
 *   - Replace on filter-change first page (Req 6.3): when the incoming result belongs
 *     to a new filter signature with `pageOffset === 0`, the rows are replaced.
 *   - Keep previous results (Req 4.4, 6.1, 6.2): this reducer only runs when a result
 *     arrives; it never clears rows at request start.
 *   - Fully loaded (Req 4.5): `fullyLoaded = incoming.length < PAGE_SIZE`.
 *   - Offset advance (Req 4.2): the new `pageOffset` is the total rows now loaded.
 *
 * `incomingSignature` defaults to the current state's signature (i.e. an append under
 * unchanged filters). Callers pass the signature of the request's filters so a result
 * from a superseded request still applies to its own filter view (Req 4.7).
 */
export function reducePageResult(
  state: PageState,
  incoming: PaymentRow[],
  requestId: number,
  incomingSignature: string = state.filterSignature,
): PageState {
  const isSameFilter = incomingSignature === state.filterSignature
  // A first page (offset 0) for a new filter signature replaces the rows; otherwise
  // (same filter signature) the incoming page is appended.
  const isReplace = !isSameFilter
  const rows = isReplace ? [...incoming] : [...state.rows, ...incoming]

  return {
    rows,
    pageOffset: rows.length,
    filterSignature: incomingSignature,
    latestRequestId: Math.max(state.latestRequestId, requestId),
    fullyLoaded: incoming.length < PAGE_SIZE,
    isLoading: false,
  }
}

/** Coerce a possibly-missing value to a finite number, defaulting to 0. */
function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Coerce a possibly-missing value to a finite number or `null`. */
function toNullableNumber(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Coerce a possibly-missing value to a string or `null`. */
function toNullableString(value: unknown): string | null {
  return value == null ? null : String(value)
}

/** Coerce an unknown rejection/envelope error into an `Error` instance. */
function toError(err: unknown): Error {
  if (err instanceof Error) return err
  if (err && typeof err === "object" && "message" in err) {
    return new Error(String((err as { message: unknown }).message))
  }
  return new Error(typeof err === "string" ? err : "Payments page call failed")
}

/** Normalize one raw payment row, coercing fields and defaulting missing ones to null. */
export function mapPaymentRow(row: unknown): PaymentRow {
  const r = (row ?? {}) as Record<string, unknown>
  return {
    id: toNumber(r.id),
    tenant_id: toNullableNumber(r.tenant_id),
    month: toNullableNumber(r.month),
    year: toNullableNumber(r.year),
    rent_amount: toNullableNumber(r.rent_amount),
    extra_charges: toNullableNumber(r.extra_charges),
    total_amount: toNullableNumber(r.total_amount),
    due_date: toNullableString(r.due_date),
    status: toNullableString(r.status),
    paid_at: toNullableString(r.paid_at),
    submitted_at: toNullableString(r.submitted_at),
    verified_at: toNullableString(r.verified_at),
    reminder_sent: r.reminder_sent == null ? null : Boolean(r.reminder_sent),
    payment_token: toNullableString(r.payment_token),
    payment_method: toNullableString(r.payment_method),
    payment_code: toNullableString(r.payment_code),
    screenshot_path: toNullableString(r.screenshot_path),
    utr_number: toNullableString(r.utr_number),
    verification_notes: toNullableString(r.verification_notes),
    tenant_name: toNullableString(r.tenant_name),
    tenant_mobile_number: toNullableString(r.tenant_mobile_number),
    room_number: toNullableString(r.room_number),
    rent_amount_room: toNullableNumber(r.rent_amount_room),
  }
}

/** Normalize the raw month-summary payload, coercing numerics and defaulting to 0. */
export function mapMonthSummary(data: unknown): MonthSummary {
  const raw = (data ?? {}) as Record<string, unknown>
  return {
    month: toNumber(raw.month),
    year: toNumber(raw.year),
    total_collected: toNumber(raw.total_collected),
    total_pending: toNumber(raw.total_pending),
    total_late: toNumber(raw.total_late),
    total_submitted: toNumber(raw.total_submitted),
  }
}

/**
 * Async wrapper: issue `supabase.rpc("get_payments_page", args)` and map the
 * `{ data, error }` envelope to a `Result<PaymentRow[]>`. Never throws — a rejected
 * promise or an envelope error becomes `{ ok: false, error }`, so the caller can keep
 * the previously displayed rows visible (Req 4.4, 6.1).
 */
export async function fetchPaymentsPage(
  supabase: SupabaseLike,
  args: PageArgs,
): Promise<Result<PaymentRow[]>> {
  try {
    const { data, error } = await supabase.rpc<unknown[]>(
      "get_payments_page",
      args as unknown as Record<string, unknown>,
    )
    if (error) {
      return { ok: false, error: toError(error) }
    }
    const rows = Array.isArray(data) ? data : []
    return { ok: true, data: rows.map(mapPaymentRow) }
  } catch (err) {
    return { ok: false, error: toError(err) }
  }
}

/**
 * Async wrapper: issue `supabase.rpc("get_payment_month_summary", args)` and map the
 * `{ data, error }` envelope to a `Result<MonthSummary>`. Never throws. On error the
 * caller must NOT substitute totals computed from loaded pages (Req 5.10).
 */
export async function fetchMonthSummary(
  supabase: SupabaseLike,
  args: SummaryArgs,
): Promise<Result<MonthSummary>> {
  try {
    const { data, error } = await supabase.rpc<unknown>(
      "get_payment_month_summary",
      args as unknown as Record<string, unknown>,
    )
    if (error) {
      return { ok: false, error: toError(error) }
    }
    return { ok: true, data: mapMonthSummary(data) }
  } catch (err) {
    return { ok: false, error: toError(err) }
  }
}
