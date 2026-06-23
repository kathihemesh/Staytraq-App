"use client"

// Feature: web-dashboard-parity
// BottomNavBar (Requirements 16.1, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.10, 14.1)
//
// A fixed, mobile-only bottom navigation bar that mirrors the mobile dashboard's
// navigation set (Dashboard, Rooms, Tenants, Payments, Complaints). It is shown
// only below the `lg` breakpoint (`lg:hidden`) where the Sidebar is hidden, and
// reserves no space at `lg`+ where the permanent Sidebar takes over.
//
// The active destination is derived purely from `usePathname()` via the
// framework-free `deriveActiveNavKey` matcher, so exactly one destination — or
// none — is highlighted. The highlight is an animated `framer-motion` `layoutId`
// pill that slides behind the active icon and completes within 300ms; when
// `prefers-reduced-motion` is set the pill jumps immediately with no transition.
//
// Navigation uses `next/link`. On a navigation failure the bar stays on the
// current route (so the derived highlight is unchanged) and reports the failure
// through the shared Toast_Service. All colors resolve from Theme_System tokens.

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, DoorOpen, Users, CreditCard, MessageSquare } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { deriveActiveNavKey, resolveMotionVariant, type NavDestination } from "@/lib/dashboard/home-compute"
import { dashboardToast } from "@/lib/dashboard/toast"

/** A bottom-nav destination: pure routing data plus its presentation. */
interface BottomNavItem extends NavDestination {
  label: string
  icon: LucideIcon
}

/**
 * The five destinations, in the same order as the Mobile_Dashboard navigation
 * set: Dashboard, Rooms, Tenants, Payments, Complaints (Req 16.4). The route
 * table is defined once here; the pure matcher consumes `{ key, href }`.
 */
const NAV_ITEMS: readonly BottomNavItem[] = [
  { key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard },
  { key: "rooms", href: "/rooms", label: "Rooms", icon: DoorOpen },
  { key: "tenants", href: "/tenants", label: "Tenants", icon: Users },
  { key: "payments", href: "/payments", label: "Payments", icon: CreditCard },
  { key: "complaints", href: "/complaints", label: "Complaints", icon: MessageSquare },
]

const HIGHLIGHT_LAYOUT_ID = "bottom-nav-highlight"

export function BottomNavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const reducedMotion = useReducedMotion() ?? false

  // Exactly-one-or-none active destination, derived purely from the route (Req 16.5, 16.6).
  const activeKey = deriveActiveNavKey(pathname ?? "", NAV_ITEMS)

  // Honor Reduced_Motion: animate the highlight to its final position within
  // 300ms normally, or jump immediately (duration 0) when reduced (Req 16.9, 16.10).
  const { transition: highlightTransition } = resolveMotionVariant(
    { transition: { type: "spring", duration: 0.3, bounce: 0 } },
    reducedMotion,
  )

  const handleNavigate = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Drive navigation ourselves so a failure can be caught and reported while the
    // route — and therefore the derived highlight — stays unchanged (Req 16.7, 16.8).
    // Let modified clicks (new tab, etc.) fall through to the browser's default.
    if (event.defaultPrevented) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return
    }
    event.preventDefault()
    try {
      router.push(href)
    } catch {
      dashboardToast.error("Navigation didn't complete. Please try again.")
    }
  }

  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card lg:hidden",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="flex items-stretch justify-around" role="list">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === activeKey
          const Icon = item.icon
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                onClick={handleNavigate(item.href)}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId={HIGHLIGHT_LAYOUT_ID}
                    transition={highlightTransition}
                    aria-hidden="true"
                    className="absolute inset-x-2 top-1.5 h-9 rounded-full bg-primary/10"
                  />
                )}
                <Icon className="relative h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="relative whitespace-nowrap">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default BottomNavBar
