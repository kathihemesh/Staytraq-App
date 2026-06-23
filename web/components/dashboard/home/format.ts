// Feature: web-dashboard-parity
// Shared presentation helpers for the dashboard home section components.

/**
 * Format a numeric amount as an Indian-Rupee currency string (e.g. `₹1,23,456`).
 *
 * Uses the `en-IN` grouping convention so every dashboard surface renders
 * amounts consistently. Non-finite inputs render as `₹0`.
 */
export function formatCurrency(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0
  return `₹${value.toLocaleString("en-IN")}`
}
