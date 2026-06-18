/**
 * XSS Protection Utilities
 * 
 * Sanitizes user-generated content to prevent Cross-Site Scripting (XSS) attacks.
 * This library escapes HTML special characters that could be used for XSS injection.
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * 
 * @param input - The string to sanitize
 * @returns Sanitized string with HTML entities escaped
 */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return ""
  
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
}

/**
 * Sanitizes text but preserves line breaks by converting them to <br> tags
 * Use this for multi-line content like notes or messages
 * 
 * @param input - The string to sanitize
 * @returns Sanitized string with line breaks converted to <br> tags
 */
export function sanitizeMultilineText(input: string | null | undefined): string {
  if (!input) return ""
  
  return sanitizeText(input).replace(/\n/g, "<br>")
}

/**
 * Strips all HTML tags from input (aggressive sanitization)
 * Use this when no HTML should ever be present
 * 
 * @param input - The string to sanitize
 * @returns Plain text with all HTML removed
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return ""
  
  return String(input).replace(/<[^>]*>/g, "")
}

/**
 * Validates and sanitizes a phone number
 * Removes all non-digit characters except + at the start
 * 
 * @param phone - The phone number to sanitize
 * @returns Sanitized phone number
 */
export function sanitizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ""
  
  const str = String(phone).trim()
  const hasPlus = str.startsWith("+")
  const digits = str.replace(/\D/g, "")
  
  return hasPlus ? `+${digits}` : digits
}

/**
 * Sanitizes an email address
 * Basic validation and lowercasing
 * 
 * @param email - The email to sanitize
 * @returns Sanitized email address
 */
export function sanitizeEmail(email: string | null | undefined): string {
  if (!email) return ""
  
  return String(email).trim().toLowerCase()
}

/**
 * Truncates text to a maximum length and adds ellipsis
 * Useful for preventing display issues with extremely long inputs
 * 
 * @param input - The string to truncate
 * @param maxLength - Maximum length (default: 1000)
 * @returns Truncated and sanitized string
 */
export function sanitizeAndTruncate(
  input: string | null | undefined,
  maxLength: number = 1000
): string {
  if (!input) return ""
  
  const sanitized = sanitizeText(input)
  
  if (sanitized.length <= maxLength) {
    return sanitized
  }
  
  return sanitized.substring(0, maxLength) + "..."
}

/**
 * Type guard to ensure a value is a non-empty string
 * 
 * @param value - Value to check
 * @returns True if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}
