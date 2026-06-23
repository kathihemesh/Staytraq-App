// Feature: web-dashboard-parity
// Toast service wrapper (Requirement 15.5)
//
// Reuses the existing `sonner` `Toaster` already mounted in `web/app/layout.tsx`.
// This module provides a small, typed wrapper around `toast.success/error/info/warning`
// so every dashboard surface reports outcomes consistently. Entrance/exit animations
// are handled by sonner and complete within 300ms.

import { toast } from 'sonner'

/** Optional, framework-agnostic options for a dashboard notification. */
export interface DashboardToastOptions {
  /** Secondary descriptive line shown beneath the message. */
  description?: string
  /** Override the default display duration, in milliseconds. */
  duration?: number
}

/** Report a successful operation. */
export function notifySuccess(message: string, options?: DashboardToastOptions): void {
  toast.success(message, options)
}

/** Report a failed operation. */
export function notifyError(message: string, options?: DashboardToastOptions): void {
  toast.error(message, options)
}

/** Report neutral, informational feedback. */
export function notifyInfo(message: string, options?: DashboardToastOptions): void {
  toast.info(message, options)
}

/** Report a non-blocking warning. */
export function notifyWarning(message: string, options?: DashboardToastOptions): void {
  toast.warning(message, options)
}

/**
 * Consolidated toast service for the dashboard. Prefer these methods over importing
 * `sonner` directly so reporting stays consistent across sections and panels.
 */
export const dashboardToast = {
  success: notifySuccess,
  error: notifyError,
  info: notifyInfo,
  warning: notifyWarning,
} as const

export type DashboardToast = typeof dashboardToast
