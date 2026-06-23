"use client"

// Feature: web-dashboard-parity
//
// TimeFilter — the dashboard reporting-period control (Req 2.1, 2.2, 2.4–2.7).
//
// A presentational client component: it owns no data-fetching and no Date_Range
// math. It renders the five Time_Filter options (defaulting, via the hook, to
// `This Month`), reveals start/end date inputs when `Custom Range` is selected,
// and surfaces an error indication when the custom range is invalid (a missing
// bound or an inverted start > end pair). Selection and custom-range changes are
// reported back through the `onFilterChange` / `onCustomRangeChange` setters,
// which align with `useDashboardHome`'s `setFilter` / `setCustomRange`.

import * as React from "react"

import { computeDateRange, type TimeFilter as TimeFilterValue } from "@/lib/dashboard/home-compute"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** The five Time_Filter options in display order (Req 2.1); default is `This Month` (Req 2.2). */
const TIME_FILTER_OPTIONS: readonly TimeFilterValue[] = [
  "Today",
  "This Week",
  "This Month",
  "Last Month",
  "Custom Range",
] as const

export interface TimeFilterProps {
  /** The active Time_Filter selection (from `useDashboardHome().filter`). */
  filter: TimeFilterValue
  /** The custom start-date input value (from `useDashboardHome().customStart`). */
  customStart: string
  /** The custom end-date input value (from `useDashboardHome().customEnd`). */
  customEnd: string
  /**
   * Explicit error indication for the current custom range. When omitted, the
   * component derives the indication itself via `computeDateRange` so it works
   * whether or not the parent threads through the hook's fallback/error flag
   * (Req 2.6, 2.7).
   */
  error?: boolean
  /** Report a Time_Filter selection (maps to `useDashboardHome().setFilter`). */
  onFilterChange: (filter: TimeFilterValue) => void
  /** Report custom start/end inputs (maps to `useDashboardHome().setCustomRange`). */
  onCustomRangeChange: (start: string, end: string) => void
  className?: string
}

/**
 * Derive whether the current `Custom Range` inputs are invalid (missing bound or
 * inverted pair), used only when the parent does not pass an explicit `error`.
 */
function deriveCustomRangeError(filter: TimeFilterValue, start: string, end: string): boolean {
  if (filter !== "Custom Range") return false
  return computeDateRange("Custom Range", new Date(), start, end).error
}

export function TimeFilter({
  filter,
  customStart,
  customEnd,
  error,
  onFilterChange,
  onCustomRangeChange,
  className,
}: TimeFilterProps) {
  const isCustom = filter === "Custom Range"
  const showError = isCustom && (error ?? deriveCustomRangeError(filter, customStart, customEnd))

  const handleStartChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onCustomRangeChange(event.target.value, customEnd)
  }

  const handleEndChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onCustomRangeChange(customStart, event.target.value)
  }

  return (
    <div className={cn("flex flex-col gap-3", className)} data-slot="time-filter">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="time-filter-select" className="text-muted-foreground text-xs font-medium">
          Time period
        </Label>
        <Select
          value={filter}
          onValueChange={(value) => onFilterChange(value as TimeFilterValue)}
        >
          <SelectTrigger id="time-filter-select" className="w-full sm:w-48">
            <SelectValue placeholder="This Month" />
          </SelectTrigger>
          <SelectContent>
            {TIME_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isCustom && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end" data-slot="time-filter-custom">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label
              htmlFor="time-filter-start"
              className="text-muted-foreground text-xs font-medium"
            >
              Start date
            </Label>
            <Input
              id="time-filter-start"
              type="date"
              value={customStart}
              max={customEnd || undefined}
              onChange={handleStartChange}
              aria-invalid={showError || undefined}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label
              htmlFor="time-filter-end"
              className="text-muted-foreground text-xs font-medium"
            >
              End date
            </Label>
            <Input
              id="time-filter-end"
              type="date"
              value={customEnd}
              min={customStart || undefined}
              onChange={handleEndChange}
              aria-invalid={showError || undefined}
            />
          </div>
        </div>
      )}

      {showError && (
        <p className="text-destructive text-sm" role="alert" data-slot="time-filter-error">
          Select a valid start and end date (start must be on or before end). Showing this
          month&apos;s data instead.
        </p>
      )}
    </div>
  )
}

export default TimeFilter
