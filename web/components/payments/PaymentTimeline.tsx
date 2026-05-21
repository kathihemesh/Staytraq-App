"use client";

import { motion } from "framer-motion";

export interface PaymentTimelineStep {
  label: string;
  sub: string;
  done: boolean;
  active?: boolean;
}

interface PaymentTimelineProps {
  steps: PaymentTimelineStep[];
  /** When true, animate the connector through to the last step (e.g. paid). */
  fillComplete: boolean;
  compact?: boolean;
  /** When false, timeline renders in a static state (no entrance animation). */
  play?: boolean;
}

export function PaymentTimeline({ steps, fillComplete, compact, play = true }: PaymentTimelineProps) {
  if (steps.length === 0) return null;

  const titleClass = compact
    ? "mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    : "mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground";
  const labelClass = compact ? "font-medium text-[13px] leading-tight" : "font-medium text-sm leading-tight";
  const subClass = compact ? "mt-0.5 text-[12px] text-muted-foreground" : "mt-0.5 text-sm text-muted-foreground";

  return (
    <div>
      <h3 className={titleClass}>Timeline</h3>
      <div className="relative px-1 pt-0.5 pb-1">
        <div className="relative grid grid-cols-2">
          <div
            className="pointer-events-none absolute left-1/4 right-1/4 top-[14px] z-0 h-[2px] -translate-y-1/2 rounded-full bg-muted"
            aria-hidden
          />
          {fillComplete && play && (
            <motion.div
              key="progress-play"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
              className="pointer-events-none absolute left-1/4 top-[14px] z-0 h-[2px] w-1/2 origin-left -translate-y-1/2 rounded-full bg-emerald-500"
              aria-hidden
            />
          )}

          {steps.map((step, i) => (
            <div key={i} className="relative z-10 flex flex-col items-center text-center">
              <div className="relative flex h-7 items-center justify-center">
                {step.active && play && (
                  <div
                    className="absolute h-5 w-5 rounded-full bg-emerald-500/20 animate-timeline-pulse"
                    style={{ transform: "scale(1.5)" }}
                  />
                )}
                <motion.div
                  key={play ? `dot-${i}-play` : `dot-${i}-idle`}
                  initial={play && step.done ? { scale: 0.85, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.35, delay: play ? i * 0.12 + 0.1 : 0 }}
                  className={`relative z-10 box-content h-3 w-3 rounded-full border-2 border-background ${
                    step.done ? "bg-emerald-500" : "bg-muted"
                  }`}
                />
              </div>
              <div className="mt-2 w-full max-w-[min(160px,46vw)] px-1">
                <p className={labelClass}>{step.label}</p>
                <p className={subClass}>{step.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
