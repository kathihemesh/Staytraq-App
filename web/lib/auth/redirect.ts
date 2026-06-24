/**
 * Pure, framework-free redirect-decision helper for the web auth flow.
 *
 * This encodes the authenticated/unauthenticated routing rules from the
 * AuthProvider so they can be unit- and property-tested in isolation (see
 * design Property 6: "Auth redirect decision is correct for every state and
 * route"). It contains no React/Next.js dependencies and performs no I/O.
 *
 * The provider imports the exported route constants so the live redirect
 * effect and this helper stay in lockstep.
 */

/** Derived from `pg_owners.is_onboarded`. */
export type OnboardingStatus = "unknown" | "onboarded" | "not_onboarded"

/**
 * Routes that never require authentication. Mirrors the AuthProvider's
 * PUBLIC_ROUTES. `/auth/callback` is included so the Google OAuth PKCE
 * callback is not bounced to `/login` while unauthenticated (Requirement 3.7).
 */
export const PUBLIC_ROUTES = [
  "/login",
  "/reset-password",
  "/forgot-password",
  "/signup",
  "/verified",
  "/auth/callback",
] as const

/**
 * Public route prefixes (dynamic segments) that are also treated as public,
 * matching the provider's `startsWith` checks.
 */
export const PUBLIC_ROUTE_PREFIXES = ["/pay/", "/complaint-submit/", "/identity-verify/"] as const

/**
 * Routes an authenticated-but-not-onboarded user is allowed to remain on
 * without being forced to `/onboarding`.
 */
export const PRE_ONBOARDING_ROUTES = [
  "/onboarding",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verified",
] as const

/**
 * Routes from which an authenticated, onboarded user is redirected to the
 * application dashboard (`/`).
 */
export const ONBOARDED_REDIRECT_ROUTES = ["/login", "/signup", "/onboarding"] as const

/** The dashboard route. */
export const DASHBOARD_ROUTE = "/"
/** The login route. */
export const LOGIN_ROUTE = "/login"
/** The onboarding route. */
export const ONBOARDING_ROUTE = "/onboarding"

export interface RedirectDecisionInput {
  /** Whether the user has a valid authenticated session. */
  isAuthenticated: boolean
  /** Onboarding status derived from `pg_owners.is_onboarded`. */
  onboardingStatus: OnboardingStatus
  /** The current route path (may include a trailing slash). */
  pathname: string
}

export interface RedirectDecisionOptions {
  /** Exact public routes. Defaults to {@link PUBLIC_ROUTES}. */
  publicRoutes?: readonly string[]
  /** Public route prefixes. Defaults to {@link PUBLIC_ROUTE_PREFIXES}. */
  publicRoutePrefixes?: readonly string[]
  /** Allowed pre-onboarding routes. Defaults to {@link PRE_ONBOARDING_ROUTES}. */
  preOnboardingRoutes?: readonly string[]
  /** Routes onboarded users are bounced from to the dashboard. Defaults to {@link ONBOARDED_REDIRECT_ROUTES}. */
  onboardedRedirectRoutes?: readonly string[]
}

/** Normalize a path by stripping a single trailing slash (except for root). */
function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname
}

function isPublic(
  normalizedPath: string,
  publicRoutes: readonly string[],
  publicRoutePrefixes: readonly string[],
): boolean {
  if (publicRoutes.includes(normalizedPath)) return true
  return publicRoutePrefixes.some((prefix) => normalizedPath.startsWith(prefix))
}

/**
 * Decide whether the current state/route requires a redirect.
 *
 * Returns the target path to redirect to, or `null` when no redirect is needed.
 *
 * Rules (design Property 6):
 * - unauthenticated + public route → none
 * - unauthenticated + non-public route → `/login`
 * - authenticated + unknown onboarding → none
 * - authenticated + not_onboarded (and not on an allowed pre-onboarding route) → `/onboarding`
 * - authenticated + onboarded on login/signup/onboarding → `/`
 * - otherwise → none
 */
export function decideAuthRedirect(
  { isAuthenticated, onboardingStatus, pathname }: RedirectDecisionInput,
  options: RedirectDecisionOptions = {},
): string | null {
  const {
    publicRoutes = PUBLIC_ROUTES,
    publicRoutePrefixes = PUBLIC_ROUTE_PREFIXES,
    preOnboardingRoutes = PRE_ONBOARDING_ROUTES,
    onboardedRedirectRoutes = ONBOARDED_REDIRECT_ROUTES,
  } = options

  const normalizedPath = normalizePath(pathname)

  if (!isAuthenticated) {
    return isPublic(normalizedPath, publicRoutes, publicRoutePrefixes) ? null : LOGIN_ROUTE
  }

  // Authenticated below.
  if (onboardingStatus === "unknown") {
    // Defer redirection until onboarding status is resolved.
    return null
  }

  if (onboardingStatus === "not_onboarded") {
    return preOnboardingRoutes.includes(normalizedPath) ? null : ONBOARDING_ROUTE
  }

  // onboardingStatus === "onboarded"
  if (onboardedRedirectRoutes.includes(normalizedPath)) {
    return DASHBOARD_ROUTE
  }

  return null
}
