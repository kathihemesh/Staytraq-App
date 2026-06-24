// Pure predicates consumed by the Tenant Details popup (owner Expo app).
//
// These functions contain NO React Native / Expo imports so they can be
// unit- and property-tested with vitest + fast-check in isolation.
//
// Requirements: 14.1, 14.2, 14.3, 15.1, 15.3, 15.4, 15.5, 17.3, 17.4

/** The verification lifecycle states persisted on a tenant record. */
export type VerificationStatus =
  | "Not_Started"
  | "In_Progress"
  | "Verified"
  | "Ignored"

/** The minimal tenant fields the popup predicates depend on. */
export interface PopupTenantState {
  /** Whether identity collection was requested at tenant creation. */
  identity_request_flag: boolean
  /** Current verification lifecycle status. */
  verification_status: VerificationStatus
  /** Whether the owner has stopped reminders for this tenant. */
  ignore_identity_flag: boolean
}

/**
 * How the identity section presents its status in the popup.
 *
 * - `in_progress`     — document gathering is underway (Req 14.1)
 * - `verified`        — verification is complete (Req 14.2)
 * - `reminders_stopped` — the owner ignored this tenant (Req 14.3)
 * - `none`            — no identity status indication applies
 */
export type PopupStatusPresentation =
  | "in_progress"
  | "verified"
  | "reminders_stopped"
  | "none"

/**
 * Derive the identity-section status presentation for a tenant.
 *
 * Verified and Ignored take precedence over the in-progress indication so
 * the in-progress text is never shown alongside them (Reqs 14.2, 14.3).
 *
 * Requirements: 14.1, 14.2, 14.3
 */
export function popupStatusPresentation(
  state: PopupTenantState,
): PopupStatusPresentation {
  if (state.verification_status === "Verified") {
    return "verified"
  }
  if (state.verification_status === "Ignored") {
    return "reminders_stopped"
  }
  if (
    state.identity_request_flag &&
    (state.verification_status === "Not_Started" ||
      state.verification_status === "In_Progress")
  ) {
    return "in_progress"
  }
  return "none"
}

/**
 * Whether the "Ignore identity" button should be shown.
 *
 * Shown if and only if identity was requested, the tenant is not yet
 * Verified, and reminders have not already been stopped.
 *
 * Requirements: 15.1, 15.4, 15.5
 */
export function shouldShowIgnoreButton(state: PopupTenantState): boolean {
  return (
    state.identity_request_flag &&
    state.verification_status !== "Verified" &&
    state.ignore_identity_flag === false
  )
}

/**
 * Apply the "Ignore identity" action.
 *
 * Sets the ignore flag and moves the status to `Ignored` when the tenant is
 * not Verified. A Verified tenant is returned unchanged so verification is
 * never downgraded to Ignored.
 *
 * Requirements: 15.3, 15.4
 */
export function applyIgnore(state: PopupTenantState): PopupTenantState {
  if (state.verification_status === "Verified") {
    return state
  }
  return {
    ...state,
    ignore_identity_flag: true,
    verification_status: "Ignored",
  }
}

/** A stored image is present when its path is a non-empty string. */
function hasImage(path: string | null | undefined): boolean {
  return typeof path === "string" && path.trim().length > 0
}

/**
 * Whether the document viewer should provide a front/back slide control.
 *
 * Provided if and only if both a front image and a back image are stored.
 *
 * Requirements: 17.3, 17.4
 */
export function viewerHasSlideControl(
  front: string | null | undefined,
  back: string | null | undefined,
): boolean {
  return hasImage(front) && hasImage(back)
}
