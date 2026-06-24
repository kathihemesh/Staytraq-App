// Pure owner-side identity logic.
// IMPORTANT: this module must stay free of React Native / Expo imports so it can
// be unit/property-tested with vitest + fast-check (see runner config).

export type IdentityType = "Aadhaar" | "PAN"

/**
 * Character used to mask all but the final 4 characters of an identity code.
 */
export const MASK_CHAR = "•"

/**
 * Derive the persisted Identity_Request_Flag for a newly created tenant.
 *
 * The flag is only ever `true` when the owner is chatbot-enabled AND the
 * "Request identity from tenant" checkbox was selected. A non-chatbot owner
 * always persists `false`, regardless of any checkbox value.
 *
 * Requirements: 1.4, 1.5, 1.8
 */
export function deriveIdentityRequestFlag(
  chatbotEnabled: boolean,
  checked: boolean,
): boolean {
  return chatbotEnabled === true && checked === true
}

/**
 * Mask an identity code so that only the final 4 characters remain visible and
 * every preceding character is replaced with {@link MASK_CHAR}.
 *
 * Codes of length 4 or fewer have no characters to mask and are returned
 * unchanged. Falsy/empty input yields an empty string.
 *
 * Requirements: 16.1, 16.2
 */
export function maskIdentityCode(code: string): string {
  if (!code) return ""

  const VISIBLE = 4
  if (code.length <= VISIBLE) return code

  const maskedCount = code.length - VISIBLE
  return MASK_CHAR.repeat(maskedCount) + code.slice(-VISIBLE)
}

/**
 * Select which stored identity code the tenant details popup should display.
 *
 * Aadhaar takes precedence over PAN when both are present. When only a PAN code
 * exists it is selected. When neither a (non-empty) Aadhaar number nor PAN code
 * is stored, `null` is returned.
 *
 * Requirements: 16.5, 16.6
 */
export function selectDisplayCode(t: {
  aadhaar_number?: string | null
  pan_code?: string | null
}): { value: string; type: IdentityType } | null {
  const aadhaar = t.aadhaar_number
  if (aadhaar && aadhaar.trim().length > 0) {
    return { value: aadhaar, type: "Aadhaar" }
  }

  const pan = t.pan_code
  if (pan && pan.trim().length > 0) {
    return { value: pan, type: "PAN" }
  }

  return null
}
