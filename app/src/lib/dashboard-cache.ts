// Feature: dashboard-server-aggregation
//
// Mobile per-owner cache store + trailing-edge debouncer for the dashboard
// aggregate RPCs (task 6.2). This is the mobile counterpart of
// `web/lib/dashboard/dashboard-cache.ts` and shares the same contract:
//   - store(ownerId, data) / retrieve(ownerId) / invalidate(ownerId)
//   - DEBOUNCE_WINDOW_MS = 400
//   - a trailing-edge debounce factory
//
// Reads are synchronous via an in-memory Map keyed by ownerId so the UI can render
// a Cached_Aggregate immediately (Req 10.1). Writes also snapshot to SecureStore so
// the cache survives reloads, using the same persistence mechanism the existing
// dashboard uses for `dismissed_activity_ids` (expo-secure-store).
//
// The debounce factory is intentionally free of any storage / React Native imports
// so it stays pure and testable with fake timers (Req 11).

import * as SecureStore from "expo-secure-store"
import type { DashboardAggregates } from "./dashboard-aggregates"

/**
 * Fixed coalescing window for realtime refresh bursts (Req 11). A trailing-edge
 * debounce performs exactly one refetch once no event has arrived for this duration.
 */
export const DEBOUNCE_WINDOW_MS = 400

/** SecureStore key prefix for per-owner cache snapshots. */
const CACHE_KEY_PREFIX = "dashboard_aggregates_cache:"

const cacheKeyFor = (ownerId: string): string => `${CACHE_KEY_PREFIX}${ownerId}`

// ---------------------------------------------------------------------------
// In-memory cache (synchronous) + SecureStore snapshot (async)
// ---------------------------------------------------------------------------

/**
 * Module-level in-memory store keyed by ownerId. Holds the last successfully
 * retrieved `DashboardAggregates` so subsequent loads can render it immediately
 * while a background refetch runs (Stale_While_Revalidate, Req 10.1, 10.2).
 */
const memoryCache = new Map<string, DashboardAggregates>()

/**
 * Store the last successful aggregates for an owner. Updates the synchronous
 * in-memory cache immediately and fires a best-effort SecureStore snapshot so the
 * value survives an app reload (mirrors `dismissed_activity_ids` persistence).
 *
 * Caching never changes the meaning of any value (Req 10.3): the object is stored
 * as-is and returned as-is.
 */
export function store(ownerId: string, data: DashboardAggregates): void {
  if (!ownerId) return
  memoryCache.set(ownerId, data)
  // Best-effort async snapshot; failures must not break the dashboard.
  void persistSnapshot(ownerId, data)
}

/**
 * Synchronously retrieve the cached aggregates for an owner, or `undefined` when
 * none exist. Returns the exact stored reference so displaying a Cached_Aggregate
 * does not alter any metric (Req 10.3).
 */
export function retrieve(ownerId: string): DashboardAggregates | undefined {
  if (!ownerId) return undefined
  return memoryCache.get(ownerId)
}

/**
 * Invalidate the cached aggregates for an owner. Called on manual (pull-to-refresh)
 * and realtime-triggered refreshes (Req 10.4, 10.5). Clears the in-memory entry
 * immediately and removes the SecureStore snapshot best-effort.
 */
export function invalidate(ownerId: string): void {
  if (!ownerId) return
  memoryCache.delete(ownerId)
  void SecureStore.deleteItemAsync(cacheKeyFor(ownerId)).catch(() => {})
}

/**
 * Hydrate the in-memory cache for an owner from the SecureStore snapshot. Useful on
 * dashboard mount so a Cached_Aggregate from a previous session can render
 * immediately. Returns the hydrated value, or `undefined` when no snapshot exists or
 * it could not be parsed.
 */
export async function hydrateFromSnapshot(
  ownerId: string,
): Promise<DashboardAggregates | undefined> {
  if (!ownerId) return undefined
  try {
    const raw = await SecureStore.getItemAsync(cacheKeyFor(ownerId))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as DashboardAggregates
    memoryCache.set(ownerId, parsed)
    return parsed
  } catch {
    return undefined
  }
}

async function persistSnapshot(
  ownerId: string,
  data: DashboardAggregates,
): Promise<void> {
  try {
    await SecureStore.setItemAsync(cacheKeyFor(ownerId), JSON.stringify(data))
  } catch {
    // Snapshot persistence is best-effort; the in-memory cache remains authoritative.
  }
}

/** Test helper: clear the entire in-memory cache. */
export function __clearMemoryCache(): void {
  memoryCache.clear()
}

// ---------------------------------------------------------------------------
// Trailing-edge debouncer
// ---------------------------------------------------------------------------

/** A debounced trigger plus controls. */
export interface Debouncer {
  /**
   * Schedule a trailing-edge invocation. Repeated calls within the window coalesce:
   * the timer is reset on each call, so the action fires exactly once after no call
   * has occurred for the full window (Req 11.1, 11.2, 11.3, 11.4).
   */
  trigger: () => void
  /** Cancel any pending invocation without firing it (e.g. on unmount). */
  cancel: () => void
  /** Whether an invocation is currently pending. */
  isPending: () => boolean
}

/**
 * Create a trailing-edge debouncer with a single shared timer.
 *
 * Each `trigger()` clears any existing timer and starts a new one for `windowMs`.
 * The supplied `action` runs only after a full quiescent window elapses with no
 * further triggers, coalescing rapid bursts into a single call (Req 11).
 *
 * Pure with respect to platform: it uses only `setTimeout`/`clearTimeout`, so it is
 * fully exercisable with fake timers in tests.
 */
export function createDebouncer(
  action: () => void,
  windowMs: number = DEBOUNCE_WINDOW_MS,
): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const trigger = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      action()
    }, windowMs)
  }

  const isPending = (): boolean => timer !== null

  return { trigger, cancel, isPending }
}
