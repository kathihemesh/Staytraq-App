"use client"

// Feature: web-dashboard-parity
//
// ChatbotLauncher (Requirements 1.2, 1.3 / Owner clarification 2)
//
// A floating launcher control that opens the existing chatbot experience in a
// new browser tab. The web app does not build a chatbot conversation UI; the
// launcher simply opens the chatbot endpoint the rest of the app already talks
// to (mirroring the mobile path, which resolves the chatbot base from
// `EXPO_PUBLIC_CHATBOT_API_URL` and the `web/lib/dashboard/notice-service.ts`
// client, which resolves `NEXT_PUBLIC_CHATBOT_API_URL`).
//
//   - WHERE the Owner's `chatbot_enabled` flag is true (Req 1.2) the launcher is
//     rendered.
//   - WHERE the flag is false (Req 1.3) the component returns `null`, so it is
//     entirely absent from the rendered output (not merely hidden).
//
// The control opens the resolved URL with `window.open(url, "_blank")` using a
// `noopener,noreferrer` feature string so the opened tab cannot access this
// window via `window.opener`. All colors resolve from Theme_System tokens and
// the entrance micro-interaction honors `prefers-reduced-motion`.

import * as React from "react"
import { Bot } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Fallback chatbot base URL when no env override is provided (parity with the notice-service client). */
const DEFAULT_CHATBOT_URL = "http://localhost:8000"

/**
 * Resolve the chatbot experience URL.
 *
 * Prefers a dedicated chat UI URL (`NEXT_PUBLIC_CHATBOT_URL`) when configured,
 * otherwise opens the chatbot API base (`NEXT_PUBLIC_CHATBOT_API_URL` — the same
 * variable `notice-service.ts` uses), and finally a localhost fallback. No
 * dedicated chat UI URL exists in the codebase today, so the API base is the
 * effective target.
 */
function resolveChatbotUrl(override?: string): string {
  return (
    override ??
    process.env.NEXT_PUBLIC_CHATBOT_URL ??
    process.env.NEXT_PUBLIC_CHATBOT_API_URL ??
    DEFAULT_CHATBOT_URL
  )
}

export interface ChatbotLauncherProps {
  /**
   * The Owner's `chatbot_enabled` flag. When `false`, the component renders
   * nothing (returns `null`) so it is absent from the output (Req 1.3); when
   * `true`, the floating launcher is shown (Req 1.2).
   */
  chatbotEnabled: boolean
  /**
   * Optional override of the chatbot URL (primarily for testing). Defaults to
   * `NEXT_PUBLIC_CHATBOT_URL` → `NEXT_PUBLIC_CHATBOT_API_URL` → localhost.
   */
  chatbotUrl?: string
  className?: string
}

export function ChatbotLauncher({ chatbotEnabled, chatbotUrl, className }: ChatbotLauncherProps) {
  const prefersReducedMotion = useReducedMotion()

  // Req 1.3: when the flag is false the launcher is not present in the output.
  if (!chatbotEnabled) return null

  const openChatbot = () => {
    const url = resolveChatbotUrl(chatbotUrl)
    // Open the existing chatbot experience in a new tab; `noopener,noreferrer`
    // prevents the opened page from accessing `window.opener`.
    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <motion.div
      data-slot="chatbot-launcher"
      className={cn("fixed bottom-20 right-4 z-50 lg:bottom-6 lg:right-6", className)}
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 25 }}
    >
      <Button
        type="button"
        size="icon-lg"
        aria-label="Open chatbot"
        title="Open chatbot"
        onClick={openChatbot}
        className="size-12 rounded-full shadow-lg hover:shadow-xl"
      >
        <Bot className="size-5" aria-hidden="true" />
      </Button>
    </motion.div>
  )
}

export default ChatbotLauncher
