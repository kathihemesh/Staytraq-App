// Feature: tenant-identity-verification
//
// Pure, framework-free predicates that drive the public verification portal's
// presentation and submission gating. Nothing here imports from React, Next, or
// Supabase, so every function is fully unit- and property-testable. The portal
// UI (`web/app/identity-verify/[token]/page.tsx`) and the submit API route are
// thin wrappers that call into these predicates.
//
// Task 4.5 scope: room display, type-specific upload controls, single-selection
// enforcement, front-before-back gating, front-change reset, and submission
// enablement.

import type { IdentityType } from "./verify"

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * The context the `GET /api/identity-verify/[token]` route returns for a valid,
 * non-Verified tenant. `room` is `null` when the tenant has no assigned
 * room/bed.
 */
export interface PortalTenantContext {
  name: string
  room: string | null
  alreadyVerified: boolean
}

/** Which upload controls a given identity type requires. */
export interface UploadControls {
  /** A front-image upload control is shown. */
  front: boolean
  /** A back-image upload control is shown. */
  back: boolean
}

/** The display model for the tenant header on the portal. */
export interface RoomDisplay {
  /** The tenant name as supplied by the context. */
  name: string
  /** The room/bed identifier, or the "no room/bed assigned" indication. */
  room: string
  /** Whether an actual room/bed identifier is assigned. */
  hasRoom: boolean
}

/**
 * The portal's current per-submission upload state. `frontCompleted` is `true`
 * once the portal shows a confirmation/preview of the stored front image;
 * `backUploaded` is `true` once a back image has been uploaded for this
 * submission.
 */
export interface PortalUploadState {
  type: IdentityType | null
  frontCompleted: boolean
  backUploaded: boolean
}

/** Which document images have been uploaded for the current submission. */
export interface UploadedImages {
  front: boolean
  back: boolean
}

/** The exact indication shown when a tenant has no assigned room/bed. */
export const NO_ROOM_ASSIGNED = "no room/bed assigned"

// ---------------------------------------------------------------------------
// Tenant header
// ---------------------------------------------------------------------------

/**
 * Build the tenant header display (Req 4.6).
 *
 * Returns the tenant name together with the room/bed identifier when one is
 * assigned, and the name together with a "no room/bed assigned" indication when
 * none is assigned. A `null`, empty, or whitespace-only `room` is treated as no
 * assignment.
 */
export function roomDisplay(context: PortalTenantContext): RoomDisplay {
  const name = context.name
  const hasRoom = typeof context.room === "string" && context.room.trim().length > 0
  return {
    name,
    room: hasRoom ? (context.room as string) : NO_ROOM_ASSIGNED,
    hasRoom,
  }
}

// ---------------------------------------------------------------------------
// Upload controls
// ---------------------------------------------------------------------------

/**
 * Determine which upload controls to show for the selected identity type
 * (Reqs 6.2, 6.3, 6.4, 6.7).
 *
 * - Aadhaar: exactly one front and one back control.
 * - PAN: exactly one front control and no back control.
 * - none selected (`null`): no upload controls.
 */
export function controlsForType(type: IdentityType | null): UploadControls {
  switch (type) {
    case "Aadhaar":
      return { front: true, back: true }
    case "PAN":
      return { front: true, back: false }
    default:
      return { front: false, back: false }
  }
}

// ---------------------------------------------------------------------------
// Identity-type selection
// ---------------------------------------------------------------------------

/**
 * Reduce a sequence of identity-type selection actions to the resulting single
 * selection, enforcing that at most one identity type is ever selected
 * (Req 6.6).
 *
 * Each action selects a type (replacing any previous selection) or clears the
 * selection when it is `null`. The result is therefore always either a single
 * `IdentityType` or `null` — never more than one — which is the invariant the
 * portal relies on. An empty sequence yields `null` (the initial "none
 * selected" state of Req 6.5).
 */
export function atMostOneType(selections: ReadonlyArray<IdentityType | null>): IdentityType | null {
  if (!Array.isArray(selections)) return null
  let current: IdentityType | null = null
  for (const selection of selections) {
    current = selection === "Aadhaar" || selection === "PAN" ? selection : null
  }
  return current
}

// ---------------------------------------------------------------------------
// Front-before-back ordering
// ---------------------------------------------------------------------------

/**
 * Whether the back-image upload control is enabled/interactive (Req 7.1).
 *
 * The back control is enabled only when the selected identity type requires a
 * back image (Aadhaar) and the front image has completed uploading. While the
 * front is incomplete — or for a type with no back control — it stays disabled.
 */
export function backEnabled(state: PortalUploadState): boolean {
  return controlsForType(state.type).back && state.frontCompleted === true
}

/**
 * Whether a submitted back image is accepted (Req 7.3).
 *
 * A back image is accepted only when the front image has completed uploading; a
 * back image submitted before the front is complete is rejected (and the caller
 * must not store it).
 */
export function acceptBack(state: PortalUploadState): boolean {
  return state.frontCompleted === true
}

/**
 * Reset the back upload when the front image is removed or replaced (Req 7.4).
 *
 * Returns a new state in which the front is no longer completed and any
 * previously uploaded back image is discarded, returning the back control to
 * its disabled state. The selected identity type is preserved.
 */
export function resetBackOnFrontChange(state: PortalUploadState): PortalUploadState {
  return {
    type: state.type,
    frontCompleted: false,
    backUploaded: false,
  }
}

// ---------------------------------------------------------------------------
// Submission enablement
// ---------------------------------------------------------------------------

/**
 * Whether the submission action is enabled (Reqs 11.2, 11.3, 11.4).
 *
 * Submission is enabled only when consent has been given, an identity type is
 * selected, and every document image required by that type has been uploaded.
 * Missing consent, no selected type, or any missing required image disables
 * submission.
 */
export function submitEnabled(
  consent: boolean,
  type: IdentityType | null,
  images: UploadedImages,
): boolean {
  if (consent !== true) return false
  if (type !== "Aadhaar" && type !== "PAN") return false

  const required = controlsForType(type)
  if (required.front && !images.front) return false
  if (required.back && !images.back) return false

  return true
}
