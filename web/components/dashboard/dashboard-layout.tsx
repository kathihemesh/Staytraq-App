"use client"

import { useState, useCallback } from "react"

import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { useSidebar } from "./sidebar-context"
import { cn } from "@/lib/utils"

interface DashboardLayoutProps {
  children: React.ReactNode
  title: string
  fullWidth?: boolean
}

export function DashboardLayout({ children, title, fullWidth = false }: DashboardLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { collapsed, setCollapsed } = useSidebar()

  const handleMenuToggle = useCallback(() => {
    setMobileOpen((prev) => !prev)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to main content
      </a>
      
      <Sidebar 
        mobileOpen={mobileOpen} 
        setMobileOpen={setMobileOpen}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
      
      <div className={`flex min-w-0 max-w-full flex-col transition-all duration-300 ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
        <Header
          title={title}
          onMenuClick={handleMenuToggle}
          isMobileMenuOpen={mobileOpen}
        />
        <main 
          id="main-content"
          role="main"
          className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8"
          tabIndex={-1}
        >
          <div className={cn("mx-auto w-full", fullWidth ? "max-w-none" : "max-w-7xl")}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
