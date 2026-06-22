// Feature: mobile-tab-navigation-performance (bugfix) — Change A.
//
// Pure, render-free helper for deferring a screen's on-focus data fetch until AFTER the
// navigation transition / first interactive paint. It wraps
// `InteractionManager.runAfterInteractions` (the pattern already used by index.tsx and
// complaints.tsx) behind a single-flight, idempotent, cancel-on-cleanup handle so the
// blocking portion of the fetch no longer runs on the transition's JS thread.
//
// The scheduling primitive is injectable so the logic can be unit/property tested without
// rendering React Native (see task 3.8). The default primitive uses
// `InteractionManager.runAfterInteractions`.
//
// Semantics (preserved from the existing useFocusEffect + task.cancel() pattern):
//   • The `run` callback fires AT MOST ONCE per handle (single-flight / idempotent).
//   • `cancel()` is idempotent and prevents `run` from firing if it has not run yet;
//     it also cancels the underlying interaction task. Calling cancel after the task has
//     already run is a no-op (the load is neither dropped nor duplicated).
//
// Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.2, 3.5

import { InteractionManager } from "react-native"

/** Handle returned by the scheduler; cancelling prevents a not-yet-run task from firing. */
export type ScheduledTaskHandle = {
  cancel: () => void
}

/**
 * A scheduling primitive: given a callback, schedule it to run after interactions and
 * return a handle that can cancel it before it runs. Mirrors the shape of
 * `InteractionManager.runAfterInteractions`.
 */
export type SchedulePrimitive = (callback: () => void) => { cancel: () => void }

/** Default primitive: defer the work until after the current interactions/animations. */
export const defaultSchedule: SchedulePrimitive = (callback) =>
  InteractionManager.runAfterInteractions(callback)

/**
 * Schedule `run` to execute after the current interactions complete (i.e. after the
 * transition / first interactive paint), returning a cancel handle.
 *
 * The returned handle guarantees:
 *   - `run` is invoked at most once (single-flight), even if the underlying primitive
 *     fires its callback more than once.
 *   - `cancel()` is idempotent: calling it before the task runs prevents `run` and cancels
 *     the underlying task; calling it after `run` has fired (or calling it twice) is a no-op.
 *
 * @param run        The (blocking) fetch/work to defer past first paint.
 * @param schedule   Injectable scheduling primitive (defaults to InteractionManager).
 */
export function scheduleAfterInteractions(
  run: () => void,
  schedule: SchedulePrimitive = defaultSchedule,
): ScheduledTaskHandle {
  let cancelled = false
  let hasRun = false

  const task = schedule(() => {
    // Single-flight + cancel guard: never run after cancel, never run twice.
    if (cancelled || hasRun) return
    hasRun = true
    run()
  })

  return {
    cancel: () => {
      // Idempotent: cancelling after run, or cancelling twice, does nothing.
      if (cancelled || hasRun) return
      cancelled = true
      task.cancel()
    },
  }
}
