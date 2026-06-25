// Feature: tenant-identity-verification
//
// Identity verification is performed server-side by an OpenAI vision model in
// the submit API route (`app/api/identity-verify/[token]/submit/route.ts`).
// The previous client/server tesseract OCR text-rule helpers were removed in
// favour of that approach; this module now only exports the shared identity
// type used across the portal, server route, and edge functions.

/** The kind of identity document a tenant submits. */
export type IdentityType = "Aadhaar" | "PAN"
