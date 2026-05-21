"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  DoorOpen,
  CreditCard,
  Bell,
  Settings,
  Building2,
  X,
  Menu,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useState, useEffect, useId } from "react"
import { useTheme } from "next-themes"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, description: "Overview and statistics" },
  { href: "/tenants", label: "Tenants", icon: Users, description: "Manage tenant information" },
  { href: "/rooms", label: "Rooms", icon: DoorOpen, description: "Room inventory and status" },
  { href: "/payments", label: "Payments", icon: CreditCard, description: "Track rent payments" },
  { href: "/reminders", label: "Reminders", icon: Bell, description: "Payment reminders" },
  { href: "/settings", label: "Settings", icon: Settings, description: "App configuration" },
]


interface SidebarProps {
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}

function SidebarThemeToggle({ showLabel = true }: { showLabel?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size={showLabel ? "default" : "icon"}
        className={cn(
          "w-full justify-start gap-3",
          !showLabel && "h-10 w-10 justify-center p-0"
        )}
        disabled
      >
        <Sun className="h-5 w-5" aria-hidden="true" />
        {showLabel && <span>Toggle Theme</span>}
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size={showLabel ? "default" : "icon"}
      onClick={toggleTheme}
      aria-label={`Switch to ${resolvedTheme === "light" ? "dark" : "light"} mode`}
      className={cn(
        "w-full justify-start gap-3 text-muted-foreground hover:bg-muted hover:text-foreground",
        !showLabel && "h-10 w-10 justify-center p-0"
      )}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
      {showLabel && (
        <span>{resolvedTheme === "dark" ? "Light Mode" : "Dark Mode"}</span>
      )}
    </Button>
  )
}

export function Sidebar({ mobileOpen, setMobileOpen, collapsed, setCollapsed }: SidebarProps) {
  const pathname = usePathname()
  const navId = useId()

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, setMobileOpen])

  // Handle escape key to close mobile menu
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false)
      }
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [mobileOpen, setMobileOpen])

  // Trap focus within sidebar when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileOpen])

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="main-sidebar"
        role="navigation"
        aria-label="Main navigation"
        aria-hidden={!mobileOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-border bg-card shadow-xl lg:z-40 lg:translate-x-0 lg:shadow-none lg:aria-[hidden=true]:block",
          "transition-transform duration-300 ease-in-out lg:transition-[width] lg:duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[72px]" : "lg:w-64",
          "w-[280px]"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between overflow-hidden border-b border-border px-4">
          <Link 
            href="/" 
            className={cn(
              "flex items-center overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              collapsed ? "lg:justify-center w-full" : "gap-3"
            )}
            aria-label="Staytraq - Go to dashboard"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg overflow-hidden" aria-hidden="true">
              <img src="/logo.png" alt="Staytraq Logo" className="h-full w-full object-cover" />
            </div>
            <span className={cn(
              "whitespace-nowrap text-lg font-semibold tracking-tight text-foreground",
              collapsed ? "lg:hidden" : "lg:inline"
            )}>
              Staytraq
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4" aria-labelledby={`${navId}-label`}>
          <h2 id={`${navId}-label`} className="sr-only">Main navigation</h2>
          <ul className="flex flex-col gap-1" role="list">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              const linkContent = (
                  <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  aria-describedby={collapsed ? undefined : `${navId}-${item.label.toLowerCase()}-desc`}
                  className={cn(
                    "flex items-center overflow-hidden rounded-lg py-2.5 text-sm font-medium transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    collapsed ? "lg:justify-center lg:px-0" : "gap-3 px-3"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className={cn(
                    "whitespace-nowrap",
                    collapsed ? "lg:hidden" : "lg:inline"
                  )}>{item.label}</span>
                </Link>
              )
              
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild className="hidden lg:flex w-full">
                        {linkContent}
                      </TooltipTrigger>
                      <TooltipContent side="right" className="hidden lg:block">
                        {item.label}
                      </TooltipContent>
                      <div className="lg:hidden w-full">{linkContent}</div>
                    </Tooltip>
                  ) : (
                    linkContent
                  )}
                  {!collapsed && (
                    <span id={`${navId}-${item.label.toLowerCase()}-desc`} className="sr-only">
                      {item.description}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer - pinned to bottom */}
        <div className="mt-auto shrink-0 overflow-hidden border-t border-border">
          {/* Theme toggle for mobile */}
          <div className="border-b border-border p-3 lg:hidden">
            <SidebarThemeToggle showLabel={true} />
          </div>
          
          {/* Collapse toggle for desktop */}
          <div className="hidden overflow-hidden p-2 lg:block">
            <Button
              variant="ghost"
              size={collapsed ? "icon" : "sm"}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "w-full overflow-hidden text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                collapsed ? "h-10 justify-center" : "justify-start gap-3"
              )}
            >
              {collapsed ? (
                <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
              ) : (
                <>
                  <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">Collapse</span>
                </>
              )}
            </Button>
          </div>

          {/* Version info - always at very bottom */}
          <div className={cn(
            "overflow-hidden border-t border-border p-3",
            collapsed && "lg:p-2"
          )}>
            <div className={cn(
              "overflow-hidden rounded-lg bg-muted/50",
              collapsed ? "lg:p-2" : "p-3"
            )}>
              {collapsed ? (
                <p className="hidden text-center text-xs text-muted-foreground lg:block">v1.0</p>
              ) : (
                <>
                  <p className="whitespace-nowrap text-xs font-medium text-foreground">
                    Staytraq
                  </p>
                  <p className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
                    Version 1.0.0
                  </p>
                </>
              )}
              {/* Mobile always shows full text */}
              <div className="lg:hidden">
                {collapsed && (
                  <>
                    <p className="whitespace-nowrap text-xs font-medium text-foreground">
                      Staytraq
                    </p>
                    <p className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
                      Version 1.0.0
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}

export function MobileMenuButton({
  onClick,
  isOpen,
}: {
  onClick: () => void
  isOpen: boolean
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 lg:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-controls="main-sidebar"
      aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
    >
      <Menu className="h-5 w-5" aria-hidden="true" />
    </Button>
  )
}


