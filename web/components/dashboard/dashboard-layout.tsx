"use client"

import { useState } from "react"

import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { BottomNavBar } from "./bottom-nav-bar"
import { useSidebar } from "./sidebar-context"
import { cn } from "@/lib/utils"

interface DashboardLayoutProps {
  children: React.ReactNode
  title: string
  fullWidth?: boolean
  /** Manual refresh handler passed through to the Header (e.g. `useDashboardHome().refresh()`). */
  onRefresh?: () => void
  /** True while a refresh is in flight; passed through to the Header's refresh control. */
  isRefreshing?: boolean
}

export function DashboardLayout({
  children,
  title,
  fullWidth = false,
  onRefresh,
  isRefreshing,
}: DashboardLayoutProps) {
  // The mobile sidebar drawer is retained for `lg`+ but is no longer opened via a
  // hamburger on Mobile_Width: the BottomNavBar provides mobile navigation (Req 16.2).
  const [mobileOpen, setMobileOpen] = useState(false)
  const { collapsed, setCollapsed } = useSidebar()

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to main content
      </a>

      {/* Sidebar - permanent at lg+, hidden below lg (replaced by BottomNavBar) */}
      <Sidebar
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />

      <div className={`flex min-w-0 max-w-full flex-col transition-all duration-300 ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
        <Header title={title} onRefresh={onRefresh} isRefreshing={isRefreshing} />
        <main
          id="main-content"
          role="main"
          // Reserve bottom space for the fixed BottomNavBar (h-16) below lg so no
          // content is obscured (Req 13.4); restore normal desktop padding at lg+.
          className="min-w-0 flex-1 overflow-x-hidden p-4 pb-20 sm:p-6 sm:pb-20 lg:p-8 lg:pb-8"
          tabIndex={-1}
        >
          <div className={cn("mx-auto w-full", fullWidth ? "max-w-none" : "max-w-7xl")}>
            {children}
          </div>
        </main>
      </div>

      {/* Bottom navigation - visible only below lg */}
      <BottomNavBar />
    </div>
  )
}
