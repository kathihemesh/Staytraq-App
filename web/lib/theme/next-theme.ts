/**
 * Pure theme-mode decision logic for the web ThemeToggle.
 *
 * The toggle is a two-state switch between "dark" and "light". Extracting the
 * decision into a pure function keeps the component behavior identical while
 * making the involution property testable without rendering.
 */

export type ThemeMode = "dark" | "light"

/**
 * Returns the opposite color mode for a given resolved theme.
 *
 * A single application flips the mode; two successive applications return to
 * the starting mode (the toggle is a two-state involution).
 */
export function nextTheme(current: ThemeMode): ThemeMode {
  return current === "dark" ? "light" : "dark"
}
