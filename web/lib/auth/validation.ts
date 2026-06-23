import { AUTH_MESSAGES } from "@/lib/auth/messages"

// Email_Format from the glossary
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email)
}

// Special characters allowed by the Signup_Password_Policy.
const SPECIAL_CHAR_REGEX = /[!@#$%^&*(),.?":{}|<>]/

// --- Login -----------------------------------------------------------------

export interface LoginFieldErrors {
  email?: string
  password?: string
}

// Login: email + password presence/format.
// empty email -> "Email is required"; non-empty but invalid -> "Please enter
// a valid email address"; empty password -> "Password is required".
export function validateLoginForm(
  email: string,
  password: string
): LoginFieldErrors {
  const errors: LoginFieldErrors = {}

  if (email.trim().length === 0) {
    errors.email = AUTH_MESSAGES.emailRequired
  } else if (!isValidEmail(email)) {
    errors.email = AUTH_MESSAGES.invalidEmail
  }

  if (password.trim().length === 0) {
    errors.password = AUTH_MESSAGES.passwordRequired
  }

  return errors
}

// --- Signup password policy ------------------------------------------------

export interface PasswordPolicyResult {
  isValid: boolean
  errors: string[]
}

// Signup_Password_Policy: >=8 chars, >=1 digit, >=1 special from
// !@#$%^&*(),.?":{}|<>. Collects unmet criteria in a fixed order.
export function validateSignupPassword(password: string): PasswordPolicyResult {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push("at least 8 characters")
  }
  if (!/[0-9]/.test(password)) {
    errors.push("at least one number")
  }
  if (!SPECIAL_CHAR_REGEX.test(password)) {
    errors.push("at least one special character")
  }

  return { isValid: errors.length === 0, errors }
}

// Builds "Password must contain X, Y" from unmet criteria (null when valid).
export function signupPasswordMessage(password: string): string | null {
  const { isValid, errors } = validateSignupPassword(password)
  if (isValid) {
    return null
  }
  return "Password must contain " + errors.join(", ")
}

// --- Signup form -----------------------------------------------------------

export interface SignupFieldErrors {
  identifier?: string
  password?: string
}

// Signup form: email + password policy combined. Email errors are keyed under
// `identifier` for mobile parity.
export function validateSignupForm(
  email: string,
  password: string
): SignupFieldErrors {
  const errors: SignupFieldErrors = {}

  if (!isValidEmail(email)) {
    errors.identifier = AUTH_MESSAGES.invalidEmail
  }

  const passwordMessage = signupPasswordMessage(password)
  if (passwordMessage) {
    errors.password = passwordMessage
  }

  return errors
}

// --- Reset password policy -------------------------------------------------

// Reset_Password_Policy: >=8, >=1 uppercase, >=1 lowercase, >=1 digit.
// Returns the FIRST unmet rule's message (ordered), or null when valid.
export function validateResetPassword(password: string): string | null {
  if (password.trim().length === 0) {
    return AUTH_MESSAGES.passwordRequired
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters"
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter"
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter"
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number"
  }
  return null
}

// --- Reset confirm equality ------------------------------------------------

export function validateResetForm(
  password: string,
  confirmPassword: string
): { password?: string; confirmPassword?: string } {
  const errors: { password?: string; confirmPassword?: string } = {}

  if (confirmPassword.trim().length === 0) {
    errors.confirmPassword = AUTH_MESSAGES.confirmPassword
  } else if (confirmPassword !== password) {
    errors.confirmPassword = AUTH_MESSAGES.passwordsDoNotMatch
  }

  return errors
}

// --- Forgot email ----------------------------------------------------------

// Forgot: email empty-or-invalid -> single message; null when valid.
export function validateForgotEmail(email: string): string | null {
  if (email.trim().length === 0 || !isValidEmail(email)) {
    return AUTH_MESSAGES.invalidEmail
  }
  return null
}
