"use client"

import { useState, useEffect } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AuthThemeToggleProps {
  className?: string
}

export function AuthThemeToggle({ className }: AuthThemeToggleProps) {
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
        variant="outline"
        size="icon"
        className={cn(
          "h-9 w-9 rounded-full border-border/50 bg-background/80 backdrop-blur-sm",
          className
        )}
        disabled
        aria-label="Toggle theme"
      >
        <Sun className="h-4 w-4" aria-hidden="true" />
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${resolvedTheme === "light" ? "dark" : "light"} mode`}
      className={cn(
        "h-9 w-9 rounded-full border-border/50 bg-background/80 backdrop-blur-sm transition-colors hover:bg-muted",
        className
      )}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  )
}
