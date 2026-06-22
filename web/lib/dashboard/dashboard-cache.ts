// Feature: dashboard-server-aggregation
//
// Platform-agnostic caching + debounce primitives for the web dashboard.
//
// This module owns two independent, pure-TS concerns used by the web dashboard
// integration (task 8.x):
//
//   1. A per-owner stale-while-revalidate cache (Req 10.1, 10.2, 10.3, 10.5) that
//      stores the last successful `DashboardAggregates` keyed by `ownerId`, backed
//      by a module-level `Map` plus an optional `sessionStorage` snapshot so the
//      cache survives a full page reload within a browser session.
//
//   2. A single-timer trailing-edge debounce (Req 11.1–11.5) that coalesces bursts
//      of realtime events into one refetch, always fires the trailing refetch once
//      events stop, and — when an event arrives while a refetch is in progress —
//      starts a fresh window so a subsequent refetch runs after the current one
//      completes.
//
// It imports no React and no concrete Supabase client, so it stays pure and
// testable (fake timers, no DOM required outside the SSR-guarded snapshot path).

import type { DashboardAggregates } from "./dashboard-aggregates"

// ---------------------------------------------------------------------------
// Cache store
// ---------------------------------------------------------------------------

/** `sessionStorage` key prefix for the per-owner snapshot. */
const SNAPSHOT_KEY_PREFIX = "staytraq:dashboard-aggregates:"

/**
 * Module-level in-memory cache, keyed by `ownerId`. Survives client-side
 * navigation within a single page session; the optional `sessionStorage`
 * snapshot additionally survives a full reload.
 */
const memoryCache = new Map<string, DashboardAggregates>()

/** True only in a browser context that exposes a usable `sessionStorage`. */
function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
}

function snapshotKey(ownerId: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${ownerId}`
}

/**
 * Store the last successful aggregates for an owner. Writes to the in-memory map
 * and, when available, mirrors a JSON snapshot into `sessionStorage`.
 *
 * Storing then retrieving yields an equal value and never alters the meaning of a
 * cached aggregate (Req 10.3, Property 9).
 */
export function storeAggregates(ownerId: string, data: DashboardAggregates): void {
  if (!ownerId) return
  memoryCache.set(ownerId, data)

  if (hasSessionStorage()) {
    try {
      window.sessionStorage.setItem(snapshotKey(ownerId), JSON.stringify(data))
    } catch {
      // Snapshotting is best-effort (quota / serialization / privacy mode);
      // the in-memory cache remains authoritative.
    }
  }
}

/**
 * Retrieve the cached aggregates for an owner, or `undefined` when none exist.
 *
 * Falls back to the `sessionStorage` snapshot (and rehydrates the in-memory map)
 * when the in-memory entry is missing — e.g. immediately after a page reload.
 */
export function retrieveAggregates(ownerId: string): DashboardAggregates | undefined {
  if (!ownerId) return undefined

  const inMemory = memoryCache.get(ownerId)
  if (inMemory) return inMemory

  if (hasSessionStorage()) {
    try {
      const raw = window.sessionStorage.getItem(snapshotKey(ownerId))
      if (raw) {
        const parsed = JSON.parse(raw) as DashboardAggregates
        memoryCache.set(ownerId, parsed)
        return parsed
      }
    } catch {
      // Corrupt / unavailable snapshot: treat as a cache miss.
    }
  }

  return undefined
}

/**
 * Invalidate the cached aggregates for an owner. Used on manual refresh and on
 * realtime refresh so the next render reflects freshly retrieved data
 * (Req 10.4, 10.5).
 */
export function invalidateAggregates(ownerId: string): void {
  if (!ownerId) return
  memoryCache.delete(ownerId)

  if (hasSessionStorage()) {
    try {
      window.sessionStorage.removeItem(snapshotKey(ownerId))
    } catch {
      // Best-effort removal; ignore failures.
    }
  }
}

// ---------------------------------------------------------------------------
// Trailing-edge debouncer
// ---------------------------------------------------------------------------

/** Fixed debounce window for coalescing realtime refresh bursts (Req 11). */
export const DEBOUNCE_WINDOW_MS = 400

/** A debounced trigger with a way to cancel any pending invocation. */
export interface TrailingDebouncer {
  /** Schedule (or reschedule) a trailing invocation after the quiescent window. */
  trigger: () => void
  /** Cancel any pending timer and clear queued follow-up work. */
  cancel: () => void
  /** True while a timer is pending or a callback invocation is in progress. */
  isPending: () => boolean
}

/**
 * Create a single-timer, trailing-edge debouncer (Property 8).
 *
 * Behavior:
 *  - Each `trigger()` resets a single timer; the callback fires once after a full
 *    `windowMs` of quiescence (Req 11.1, 11.2, 11.3, 11.4).
 *  - Multiple triggers within a window coalesce into exactly one invocation.
 *  - The callback may be synchronous or return a promise. If `trigger()` is called
 *    while an invocation is in progress, a new window is started and a subsequent
 *    invocation runs after the in-progress one settles (Req 11.5).
 *
 * Pure factory: it captures only its own timer/flags, so it is safe to construct
 * per dashboard mount and trivially testable with fake timers.
 */
export function createTrailingDebounce(
  callback: () => void | Promise<void>,
  windowMs: number = DEBOUNCE_WINDOW_MS,
): TrailingDebouncer {
  let timer: ReturnType<typeof setTimeout> | null = null
  let inProgress = false
  // Set when a trigger arrives while a callback invocation is in progress; causes
  // a fresh window to be scheduled once the in-progress invocation settles.
  let retriggered = false

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule(): void {
    clearTimer()
    timer = setTimeout(fire, windowMs)
  }

  function fire(): void {
    timer = null

    // An event during an in-progress refetch must not start a concurrent
    // invocation; defer it until the current one completes (Req 11.5).
    if (inProgress) {
      retriggered = true
      return
    }

    inProgress = true
    let result: void | Promise<void>
    try {
      result = callback()
    } catch {
      // A synchronous throw still ends the invocation; fall through to settle.
      result = undefined
    }

    Promise.resolve(result)
      .catch(() => {
        // Swallow async rejection: callers own their own error handling.
      })
      .finally(() => {
        inProgress = false
        // A trigger arrived mid-flight: start a fresh trailing window so the
        // latest event is eventually reflected by another refetch.
        if (retriggered) {
          retriggered = false
          schedule()
        }
      })
  }

  return {
    trigger(): void {
      if (inProgress) {
        // Mark for a follow-up window; do not interfere with the running call.
        retriggered = true
        return
      }
      schedule()
    },
    cancel(): void {
      clearTimer()
      retriggered = false
    },
    isPending(): boolean {
      return timer !== null || inProgress
    },
  }
}
