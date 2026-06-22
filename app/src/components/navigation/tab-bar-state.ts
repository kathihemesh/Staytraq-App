// Feature: mobile-tab-navigation-performance (bugfix) — Change B.
//
// Pure, render-free derivation of the tab bar's active flag, section index, and the
// list of display routes. Extracting this logic here lets it be unit/property tested
// without rendering React Native, and — critically — lets the active highlight be
// derived strictly from router state so it can never desync (bugs 1.5 / 1.6).
//
// Validates: Requirements 1.5, 1.6, 2.5, 2.6, 3.3, 3.4

/** A route as exposed by the bottom tab navigator's router state. */
export type TabBarRouteLike = {
  key: string
  name: string
}

/** The descriptor options we care about for filtering non-tab routes. */
export type TabBarDescriptorLike = {
  // expo-router stores the per-screen `href` on the descriptor options. We only read it
  // to detect `href: null`; allow arbitrary extra option keys so the real navigator
  // descriptor map (BottomTabNavigationOptions) is assignable.
  options?: Record<string, unknown>
}

export type TabBarDescriptorsLike = Record<string, TabBarDescriptorLike | undefined>

/** A route that should be rendered as a tab, paired with its index in the filtered list. */
export type DisplayRoute = {
  key: string
  routeIndex: number
}

/**
 * Predicate for whether a router route should appear as a bottom-tab item.
 *
 * Non-tab routes are filtered out: the `reminders` route and any route whose
 * descriptor sets `href: null` (the expo-router convention for "not a tab").
 */
export function isTabRoute(route: TabBarRouteLike, descriptors?: TabBarDescriptorsLike): boolean {
  const options = (descriptors?.[route.key]?.options ?? {}) as { href?: unknown }
  return options.href !== null && route.name !== "reminders"
}

/**
 * Filter the router's routes down to the ordered list of tab routes, dropping
 * `reminders` and `href: null` routes.
 */
export function filterTabRoutes<T extends TabBarRouteLike>(
  routes: readonly T[],
  descriptors?: TabBarDescriptorsLike,
): T[] {
  return routes.filter((route) => isTabRoute(route, descriptors))
}

/**
 * Build the list of display routes (key + index within the filtered list) from the
 * router state. The `routeIndex` is the position within the filtered tab list, which is
 * the same space the router-derived `selectedIndex` lives in, so `deriveActiveFlag` can
 * compare the two directly.
 */
export function buildDisplayRoutes(
  routes: readonly TabBarRouteLike[],
  descriptors?: TabBarDescriptorsLike,
): DisplayRoute[] {
  return filterTabRoutes(routes, descriptors).map((route, routeIndex) => ({
    key: route.key,
    routeIndex,
  }))
}

/**
 * The active highlight is true exactly when the route's index equals the router-derived
 * selected index. There is no local copy that can disagree with the router.
 */
export function deriveActiveFlag(selectedIndex: number, routeIndex: number): boolean {
  return selectedIndex === routeIndex
}

/**
 * Derive the section (page) to display.
 *
 * The base section is the one that contains the selected index
 * (`floor(selectedIndex / visibleSlots)`), so the visible section is always consistent
 * with the real selected tab. A `manualSection` (set when the user pages sections by
 * hand) takes precedence, but the result is always clamped to `[0, sectionCount - 1]`.
 */
export function deriveSectionIndex(
  selectedIndex: number,
  visibleSlots: number,
  sectionCount: number,
  manualSection?: number | null,
): number {
  const maxSection = Math.max(0, sectionCount - 1)
  const clamp = (value: number) => Math.min(Math.max(value, 0), maxSection)

  if (manualSection != null) {
    return clamp(manualSection)
  }

  const slots = Math.max(1, visibleSlots)
  const base = Math.floor(Math.max(0, selectedIndex) / slots)
  return clamp(base)
}
