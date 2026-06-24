// Feature: web-dashboard-parity
//
// The dashboard home data hook. It owns the entire data lifecycle for the web
// dashboard home page so the page component stays declarative: cache-first
// render, background refetch, raw owner-scoped fetch, the Time_Filter / Date_Range
// state, the loading/error/stale phase, and the dismissed-activity set.
//
// Task 9.1 scope: the CORE data lifecycle —
//   - render a Cached_Aggregate immediately (< 100ms) and start a background
//     refetch (< 500ms) (Req 12.1);
//   - replace rendered values on a successful background refetch without
//     re-showing the skeleton (Req 12.2);
//   - fetch the raw owner-scoped tenants / payments / rooms / complaints / leads /
//     chatbot_enabled, every query scoped to the authenticated Owner's id
//     (Req 17.3);
//   - store the aggregates only when every aggregate section succeeds (Req 12.3);
//   - keep an up-to-date Date_Range so every Date_Range-dependent section
//     recomputes on a filter/data change (Req 2.8);
//   - apply a 15s refetch timeout that re-enables the manual refresh (Req 12.8);
//   - apply a 10s skeleton/auth ceiling (Req 12.6) and surface an error state with
//     a retry control when the initial fetch (no cache) fails (Req 12.9).
//
// Task 9.2 scope (added on top of 9.1):
//   - the owner-scoped Supabase realtime subscription (payments, tenants_table,
//     complaints, reminders, pg_owners, leads) that coalesces bursts through the
//     shared 500ms trailing-edge debounce and triggers a background refetch that
//     invalidates the Cached_Aggregate first (Req 12.7), mirroring the mobile
//     dashboard subscription;
//   - the dismissed-activity persistence FAILURE path: when the `localStorage`
//     write fails the item stays removed from the current view and a toast is
//     signalled through the Toast_Service (Req 7.6).

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useAuth } from "@/components/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { runWithNetworkRetry } from "@/lib/networkRetry"
import {
  loadDashboardAggregates,
  type DashboardAggregates,
} from "@/lib/dashboard/dashboard-aggregates"
import {
  retrieveAggregates,
  storeAggregates,
  invalidateAggregates,
  createTrailingDebounce,
  DEBOUNCE_WINDOW_MS,
} from "@/lib/dashboard/dashboard-cache"
import { dashboardToast } from "@/lib/dashboard/toast"
import {
  computeDateRange,
  type ComplaintRow,
  type DashboardActivityRow,
  type DashboardCollectionRow,
  type DashboardSummary,
  type DateRange,
  type LeadRow,
  type PaymentRow,
  type RoomRow,
  type TenantRow,
  type TimeFilter,
} from "@/lib/dashboard/home-compute"

// ---------------------------------------------------------------------------
// Lifecycle constants (parity with the mobile dashboard + Req 12)
// ---------------------------------------------------------------------------

/** Treat a refetch that exceeds this as failed and re-enable refresh (Req 12.8). */
const REFETCH_TIMEOUT_MS = 15_000
/** Stop showing the skeleton after this even if data has not arrived (Req 12.6). */
const SKELETON_CEILING_MS = 10_000
/** Stop showing the auth loader after this if auth has not resolved (Req 17.4). */
const AUTH_CEILING_MS = 10_000
/** `localStorage` key prefix for the per-owner dismissed-activity set (Req 7.3). */
const DISMISSED_KEY_PREFIX = "staytraq:dismissed-activity:"

// ---------------------------------------------------------------------------
// Public state / API shapes (match design.md exactly)
// ---------------------------------------------------------------------------

/** The dashboard lifecycle phase. */
export type DashboardPhase = "auth" | "skeleton" | "ready" | "error"

/** The observable state the page and its sections render from. */
export interface DashboardHomeState {
  // status
  phase: DashboardPhase
  isRefreshing: boolean
  /** A section refetch failed; prior values are retained (Req 12.4). */
  isStale: boolean
  // filter
  filter: TimeFilter
  dateRange: DateRange
  customStart: string
  customEnd: string
  // data (raw + aggregate)
  summary: DashboardSummary | null
  monthly: DashboardCollectionRow[]
  activity: DashboardActivityRow[]
  tenants: TenantRow[]
  payments: PaymentRow[]
  rooms: RoomRow[]
  complaints: ComplaintRow[]
  leads: LeadRow[]
  chatbotEnabled: boolean
  dismissedActivityIds: Set<string>
}

/** The imperative controls the page wires to its UI. */
export interface DashboardHomeApi {
  /** Select a Time_Filter; every Date_Range-dependent section recomputes (Req 2.8). */
  setFilter(filter: TimeFilter): void
  /** Set the custom start/end inputs; the Date_Range recomputes/validates (Req 2.5–2.7). */
  setCustomRange(start: string, end: string): void
  /** Invalidate the cache then refetch, disabling the control in-flight (Req 12.5). */
  refresh(): void
  /** Dismiss an activity item and persist its id to `localStorage` (Req 7.3). */
  dismissActivity(id: string): void
  /** Retry the initial fetch after an error state (Req 12.9). */
  retryInitial(): void
}

/** The combined value returned by {@link useDashboardHome}. */
export type UseDashboardHome = DashboardHomeState & DashboardHomeApi

// ---------------------------------------------------------------------------
// Raw owner-scoped fetch (Req 17.3)
// ---------------------------------------------------------------------------

/** The raw owner-scoped datasets used for record-level computations and panels. */
interface RawData {
  tenants: TenantRow[]
  payments: PaymentRow[]
  rooms: RoomRow[]
  complaints: ComplaintRow[]
  leads: LeadRow[]
  chatbotEnabled: boolean
}

type BrowserSupabase = ReturnType<typeof createClient>

/**
 * Fetch every raw owner-scoped dataset the dashboard needs, mirroring the mobile
 * dashboard's queries (`tenants_table`, `payments`, `rooms_table`, `complaints`,
 * `pg_owners.chatbot_enabled`, `leads`). Every query is scoped to `ownerId`
 * (Req 17.3). Rooms are resolved through the owner's `pg_details` ids, exactly
 * like the mobile screen. Throws on any hard query error so the caller can mark
 * the raw sections stale and retain previously rendered values (Req 12.4).
 */
async function fetchRawData(supabase: BrowserSupabase, ownerId: string): Promise<RawData> {
  const [pgRes, tenantsRes, paymentsRes, complaintsRes, ownerRes, leadsRes] = await Promise.all([
    supabase.from("pg_details").select("id").eq("owner_id", ownerId),
    supabase
      .from("tenants_table")
      .select(
        "id, name, mobile_number, status, room_id, join_date, exit_date, rooms_table(id, room_number, rent_amount)",
      )
      .eq("owner_id", ownerId),
    supabase
      .from("payments")
      .select("*, tenants_table(name, mobile_number, rooms_table(room_number, rent_amount))")
      .eq("owner_id", ownerId),
    supabase
      .from("complaints")
      .select(
        "id, owner_id, complaint_message, status, owner_response, created_at, updated_at, tenant_phone",
      )
      .eq("owner_id", ownerId),
    supabase.from("pg_owners").select("chatbot_enabled").eq("id", ownerId).single(),
    supabase
      .from("leads")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false }),
  ])

  if (pgRes.error) throw pgRes.error
  if (tenantsRes.error) throw tenantsRes.error
  if (paymentsRes.error) throw paymentsRes.error
  if (complaintsRes.error) throw complaintsRes.error
  // A missing owner row (PGRST116) is tolerated: chatbot just stays disabled.
  if (ownerRes.error && ownerRes.error.code !== "PGRST116") throw ownerRes.error
  if (leadsRes.error) throw leadsRes.error

  const pgIds = (pgRes.data ?? []).map((p: { id: number }) => p.id)

  let rooms: RoomRow[] = []
  if (pgIds.length > 0) {
    const roomsRes = await supabase
      .from("rooms_table")
      .select("id, pg_id, room_number, total_beds, occupied_beds, rent_amount")
      .in("pg_id", pgIds)
    if (roomsRes.error) throw roomsRes.error
    rooms = (roomsRes.data ?? []) as unknown as RoomRow[]
  }

  return {
    tenants: (tenantsRes.data ?? []) as unknown as TenantRow[],
    payments: (paymentsRes.data ?? []) as unknown as PaymentRow[],
    rooms,
    complaints: (complaintsRes.data ?? []) as unknown as ComplaintRow[],
    leads: (leadsRes.data ?? []) as unknown as LeadRow[],
    chatbotEnabled: Boolean(ownerRes.data?.chatbot_enabled),
  }
}

// ---------------------------------------------------------------------------
// Dismissed-activity persistence helpers (Req 7.3 read side)
// ---------------------------------------------------------------------------

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function dismissedKey(ownerId: string): string {
  return `${DISMISSED_KEY_PREFIX}${ownerId}`
}

/** Read the persisted dismissed-activity id set for an owner (best-effort). */
function loadDismissed(ownerId: string): Set<string> {
  if (!ownerId || !hasLocalStorage()) return new Set()
  try {
    const raw = window.localStorage.getItem(dismissedKey(ownerId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * Persist the dismissed-activity id set for an owner. Returns `false` when the
 * write fails so task 9.2 can surface the failure through the Toast_Service while
 * keeping the item removed from the current view (Req 7.6).
 */
function persistDismissed(ownerId: string, ids: ReadonlySet<string>): boolean {
  if (!ownerId || !hasLocalStorage()) return false
  try {
    window.localStorage.setItem(dismissedKey(ownerId), JSON.stringify([...ids]))
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

/**
 * The dashboard home data hook.
 *
 * @param ownerIdOverride optional explicit Owner id; defaults to the authenticated
 *                        user's id from {@link useAuth}. Every data query and the
 *                        cache are scoped to this id (Req 17.3).
 */
export function useDashboardHome(ownerIdOverride?: string | null): UseDashboardHome {
  const supabase = useMemo(() => createClient(), [])
  const { authReady, isLoading: isAuthLoading, isAuthenticated, user } = useAuth()
  const ownerId = ownerIdOverride ?? user?.id ?? null

  // --- status ---
  const [phase, setPhase] = useState<DashboardPhase>("auth")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isStale, setIsStale] = useState(false)

  // --- filter ---
  const [filter, setFilterState] = useState<TimeFilter>("This Month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

  // --- data ---
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [monthly, setMonthly] = useState<DashboardCollectionRow[]>([])
  const [activity, setActivity] = useState<DashboardActivityRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [complaints, setComplaints] = useState<ComplaintRow[]>([])
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [chatbotEnabled, setChatbotEnabled] = useState(false)
  const [dismissedActivityIds, setDismissedActivityIds] = useState<Set<string>>(() => new Set())

  // --- refs (avoid stale closures inside long-lived callbacks/timers) ---
  const ownerIdRef = useRef(ownerId)
  ownerIdRef.current = ownerId
  const hasRenderedRef = useRef(false)
  const startedRef = useRef(false)
  const requestTokenRef = useRef(0)
  const priorRangeRef = useRef<DateRange | null>(null)
  // Latest dismissed-id set, so `dismissActivity` can compute/persist the next set
  // without an effectful state updater (lets us toast on a persistence failure).
  const dismissedRef = useRef(dismissedActivityIds)
  dismissedRef.current = dismissedActivityIds

  // -------------------------------------------------------------------------
  // Date_Range: recompute whenever the filter or custom inputs change so every
  // Date_Range-dependent section recomputes from fresh bounds (Req 2.8). An
  // inverted/missing custom range preserves the last valid range via priorRange.
  // -------------------------------------------------------------------------
  const dateRange = useMemo(() => {
    const result = computeDateRange(
      filter,
      new Date(),
      customStart,
      customEnd,
      priorRangeRef.current ?? undefined,
    )
    return result.range
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, customStart, customEnd])

  useEffect(() => {
    priorRangeRef.current = dateRange
  }, [dateRange])

  // -------------------------------------------------------------------------
  // Apply helpers (stable): map fetched results into state. Each aggregate
  // section is applied only when it succeeded so a partial failure retains the
  // previously rendered values for the failed section (Req 12.4).
  // -------------------------------------------------------------------------
  const applyAggregates = useCallback((aggregates: DashboardAggregates): boolean => {
    let hadError = false
    if (aggregates.summary.ok) {
      setSummary(aggregates.summary.data)
      setChatbotEnabled(Boolean(aggregates.summary.data.chatbot_enabled))
    } else {
      hadError = true
    }
    if (aggregates.monthly.ok) setMonthly(aggregates.monthly.data)
    else hadError = true
    if (aggregates.activity.ok) setActivity(aggregates.activity.data)
    else hadError = true
    return hadError
  }, [])

  const applyRaw = useCallback((raw: RawData) => {
    setTenants(raw.tenants)
    setPayments(raw.payments)
    setRooms(raw.rooms)
    setComplaints(raw.complaints)
    setLeads(raw.leads)
    setChatbotEnabled(raw.chatbotEnabled)
  }, [])

  // -------------------------------------------------------------------------
  // The single refetch routine. Returns nothing; drives all status transitions.
  //  - `isInitial`: there is no Cached_Aggregate, so a hard failure becomes the
  //    error state with a retry control (Req 12.9).
  //  - `manual`: a user-initiated refresh that always shows the in-flight state
  //    and disables the control (Req 12.5).
  // A 15s timeout treats the refetch as failed and re-enables refresh (Req 12.8).
  // -------------------------------------------------------------------------
  const runRefetch = useCallback(
    async (opts: { isInitial: boolean; manual?: boolean }) => {
      const id = ownerIdRef.current
      if (!id) return

      const token = ++requestTokenRef.current
      if (hasRenderedRef.current || opts.manual) setIsRefreshing(true)

      const fetchData = async () => {
        const aggregates = await loadDashboardAggregates(
          supabase as unknown as Parameters<typeof loadDashboardAggregates>[0],
          { ownerId: id, call: runWithNetworkRetry },
        )
        let raw: RawData | null = null
        let rawError = false
        try {
          raw = await fetchRawData(supabase, id)
        } catch {
          rawError = true
        }
        return { aggregates, raw, rawError }
      }

      let timer: ReturnType<typeof setTimeout> | null = null
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), REFETCH_TIMEOUT_MS)
      })

      try {
        const outcome = await Promise.race([fetchData(), timeout])

        // A newer request superseded this one (e.g. a manual refresh fired): drop.
        if (token !== requestTokenRef.current) return

        if (outcome === "timeout") {
          // Treat the refetch as failed; re-enable refresh and flag stale (Req 12.8).
          setIsStale(true)
          if (opts.isInitial && !hasRenderedRef.current) setPhase("error")
          return
        }

        const { aggregates, raw, rawError } = outcome
        const hadAggError = applyAggregates(aggregates)
        if (raw && !rawError) applyRaw(raw)

        // Store the aggregates only when every aggregate section succeeded so a
        // partial failure never overwrites a good cache with a degraded snapshot
        // (Req 12.3).
        if (!hadAggError) storeAggregates(id, aggregates)

        setIsStale(hadAggError || rawError)

        const renderedSomething =
          hasRenderedRef.current ||
          aggregates.summary.ok ||
          aggregates.monthly.ok ||
          aggregates.activity.ok ||
          (raw !== null && !rawError)

        if (renderedSomething) {
          hasRenderedRef.current = true
          setPhase("ready")
        } else if (opts.isInitial) {
          setPhase("error")
        }
      } catch {
        if (token !== requestTokenRef.current) return
        setIsStale(true)
        if (opts.isInitial && !hasRenderedRef.current) setPhase("error")
      } finally {
        if (timer) clearTimeout(timer)
        if (token === requestTokenRef.current) setIsRefreshing(false)
      }
    },
    [supabase, applyAggregates, applyRaw],
  )

  // Keep a stable handle to the latest refetch so the long-lived realtime
  // subscription never has to resubscribe when the callback identity changes.
  const runRefetchRef = useRef(runRefetch)
  runRefetchRef.current = runRefetch

  // -------------------------------------------------------------------------
  // Mount lifecycle: cache-first render + background refetch (Req 12.1).
  // Runs once per authenticated owner; resets if the owner changes.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !ownerId) return
    if (startedRef.current) return
    startedRef.current = true

    // Load the persisted dismissed-activity set so dismissed items stay excluded
    // across reloads (Req 7.3, read side).
    setDismissedActivityIds(loadDismissed(ownerId))

    // Background sync chatbot status with Evolution connection status (non-blocking)
    const chatbotApiUrl = process.env.NEXT_PUBLIC_CHATBOT_API_URL || "https://144.91.79.198.sslip.io"
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token
      if (accessToken) {
        fetch(`${chatbotApiUrl}/api/v1/chatbot/status`, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }).catch(err => console.error("Failed to sync chatbot status on boot:", err))
      }
    })

    const cached = retrieveAggregates(ownerId)
    if (cached) {
      // Render the Cached_Aggregate immediately (< 100ms) ...
      applyAggregates(cached)
      hasRenderedRef.current = true
      setPhase("ready")
      // ... then start the background refetch (< 500ms) without a skeleton (Req 12.2).
      void runRefetch({ isInitial: false })
    } else {
      setPhase("skeleton")
      void runRefetch({ isInitial: true })
    }
  }, [isAuthenticated, ownerId, applyAggregates, runRefetch, supabase])

  // Reset the per-owner lifecycle when the owner changes (sign-out / switch).
  const lastOwnerRef = useRef(ownerId)
  useEffect(() => {
    if (lastOwnerRef.current !== ownerId) {
      lastOwnerRef.current = ownerId
      startedRef.current = false
      hasRenderedRef.current = false
      requestTokenRef.current += 1
      setPhase(ownerId ? "skeleton" : "auth")
      setIsRefreshing(false)
      setIsStale(false)
    }
  }, [ownerId])

  // -------------------------------------------------------------------------
  // Auth phase: while auth resolves and nothing has rendered, show the auth
  // loader (Req 17.1) with a 10s ceiling (Req 17.4 — the AuthProvider performs
  // the actual redirect; the hook just stops the indicator).
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (hasRenderedRef.current) return
    if (!authReady || isAuthLoading) {
      setPhase("auth")
    }
  }, [authReady, isAuthLoading])

  useEffect(() => {
    if (phase !== "auth") return
    const timer = setTimeout(() => {
      if (!hasRenderedRef.current) setPhase((p) => (p === "auth" ? "error" : p))
    }, AUTH_CEILING_MS)
    return () => clearTimeout(timer)
  }, [phase])

  // -------------------------------------------------------------------------
  // Skeleton ceiling: leave the skeleton after 10s even if data has not arrived
  // (Req 12.6). With no data yet, surface the error/retry state.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "skeleton") return
    const timer = setTimeout(() => {
      if (!hasRenderedRef.current) setPhase((p) => (p === "skeleton" ? "error" : p))
    }, SKELETON_CEILING_MS)
    return () => clearTimeout(timer)
  }, [phase])

  // -------------------------------------------------------------------------
  // Realtime subscription (Req 12.7)
  //
  // A single trailing-edge debouncer is shared across every owner-scoped channel
  // handler so that a burst of events from any subscribed table coalesces into
  // exactly one background refetch after the Debounce_Window. The debounced action
  // invalidates the Cached_Aggregate first so the refetch reflects fresh data
  // rather than re-rendering a stale snapshot. The subscribed tables and
  // owner-scoped filters mirror the mobile dashboard subscription exactly.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !ownerId) return

    const id = ownerId
    const debouncer = createTrailingDebounce(() => {
      invalidateAggregates(id)
      void runRefetchRef.current({ isInitial: false })
    }, DEBOUNCE_WINDOW_MS)

    const onRealtimeChange = () => {
      debouncer.trigger()
    }

    const channel = supabase
      .channel(`dashboard_owner_realtime_${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `owner_id=eq.${id}` },
        onRealtimeChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenants_table", filter: `owner_id=eq.${id}` },
        onRealtimeChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints", filter: `owner_id=eq.${id}` },
        onRealtimeChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders", filter: `owner_id=eq.${id}` },
        onRealtimeChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pg_owners", filter: `id=eq.${id}` },
        onRealtimeChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `owner_id=eq.${id}` },
        onRealtimeChange,
      )
      .subscribe()

    return () => {
      debouncer.cancel()
      void supabase.removeChannel(channel)
    }
  }, [isAuthenticated, ownerId, supabase])

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------
  const setFilter = useCallback((next: TimeFilter) => {
    setFilterState(next)
  }, [])

  const setCustomRange = useCallback((start: string, end: string) => {
    // The Date_Range memo validates start <= end via `computeDateRange`, falling
    // back / preserving the prior range on an invalid pair (Req 2.5–2.7). Task 9.2
    // surfaces the validation error indication on the TimeFilter control.
    setCustomStart(start)
    setCustomEnd(end)
    setFilterState("Custom Range")
  }, [])

  const refresh = useCallback(() => {
    const id = ownerIdRef.current
    if (!id) return
    // Invalidate first so the refetch returns fresh values rather than re-rendering
    // a stale cached aggregate (Req 12.5).
    invalidateAggregates(id)
    void runRefetch({ isInitial: false, manual: true })
  }, [runRefetch])

  const retryInitial = useCallback(() => {
    setPhase("skeleton")
    void runRefetch({ isInitial: true })
  }, [runRefetch])

  const dismissActivity = useCallback((activityId: string) => {
    const id = ownerIdRef.current
    const prev = dismissedRef.current
    if (prev.has(activityId)) return

    const next = new Set(prev)
    next.add(activityId)
    // Remove the item from the current view immediately and unconditionally;
    // persistence is best-effort and never blocks the dismissal (Req 7.3).
    dismissedRef.current = next
    setDismissedActivityIds(next)

    // Persist so the item stays excluded across reloads (Req 7.3). On a write
    // failure keep the item removed from the view but signal a toast so the user
    // knows the dismissal may not survive a reload (Req 7.6).
    if (id && !persistDismissed(id, next)) {
      dashboardToast.error("Couldn't save dismissed activity", {
        description: "It's hidden for now but may reappear after you reload.",
      })
    }
  }, [])

  return {
    // status
    phase,
    isRefreshing,
    isStale,
    // filter
    filter,
    dateRange,
    customStart,
    customEnd,
    // data
    summary,
    monthly,
    activity,
    tenants,
    payments,
    rooms,
    complaints,
    leads,
    chatbotEnabled,
    dismissedActivityIds,
    // api
    setFilter,
    setCustomRange,
    refresh,
    dismissActivity,
    retryInitial,
  }
}
