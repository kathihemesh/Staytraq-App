import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  Text,
  TouchableOpacity,
  View,
  Pressable,
  Modal,
  UIManager,
  findNodeHandle,
  Dimensions,
  ScrollView,
  StyleSheet,
} from "react-native"
import Animated, { FadeIn, FadeOut } from "react-native-reanimated"
import clsx from "clsx"
import { ChevronDown } from "lucide-react-native"

export type InlineSelectOption = {
  value: string
  shortLabel: string
  listLabel?: string
  count?: number
  colorClass?: string
  bgClass?: string
  borderClass?: string
  circleBgClass?: string
  circleTextClass?: string
  iconColor?: string
}

type InlineSelectProps = {
  options: InlineSelectOption[]
  value: string
  onChange: (value: string) => void
  /** Label shown on trigger when the default / “all” value is selected */
  defaultTriggerLabel: string
  /** When false, never use “selected” styling (only `open` uses emphasis). Default true. */
  isActive?: boolean
  /** Primary tint on trigger; use "neutral" for edit forms (no blue highlight). */
  accent?: "primary" | "neutral"
  primaryColor?: string
  isDark?: boolean
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  footer?: React.ReactNode
  /** Render menu in a Modal overlay (does not expand parent layout) */
  overlay?: boolean
  /** When set, re-measure overlay position on keyboard show/hide (keeps menu aligned). */
  keyboardHeight?: number
  triggerHeightClassName?: string
}

type MenuLayout = { x: number; y: number; width: number; height: number }

const MENU_ANIM_IN = FadeIn.duration(80)
const MENU_ANIM_OUT = FadeOut.duration(60)

export function InlineSelect({
  options,
  value,
  onChange,
  defaultTriggerLabel,
  isActive = true,
  accent = "primary",
  primaryColor = "#0071df",
  isDark = false,
  className,
  open = false,
  onOpenChange,
  footer,
  overlay = false,
  keyboardHeight = 0,
  triggerHeightClassName,
}: InlineSelectProps) {
  const triggerRef = useRef<View>(null)
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null)

  const hasSelection = Boolean(value && options.some((o) => o.value === value))
  const selected = hasSelection ? options.find((o) => o.value === value) : undefined
  const triggerLabel = selected ? selected.shortLabel : defaultTriggerLabel
  const usePrimaryAccent = accent === "primary"

  const measureTrigger = useCallback((onMeasured?: () => void) => {
    const handle = findNodeHandle(triggerRef.current)
    if (!handle) {
      onMeasured?.()
      return
    }
    UIManager.measureInWindow(handle, (x, y, w, h) => {
      setMenuLayout({ x, y, width: w, height: h })
      onMeasured?.()
    })
  }, [])

  useEffect(() => {
    if (!overlay || !open) return
    const t = requestAnimationFrame(() => measureTrigger())
    return () => cancelAnimationFrame(t)
  }, [keyboardHeight, overlay, open, measureTrigger])

  useEffect(() => {
    if (!open) setMenuLayout(null)
  }, [open])

  const toggleOpen = useCallback(() => {
    if (open) {
      onOpenChange?.(false)
      return
    }
    if (overlay) {
      measureTrigger(() => onOpenChange?.(true))
      return
    }
    onOpenChange?.(true)
  }, [open, overlay, measureTrigger, onOpenChange])

  const windowHeight = Dimensions.get("window").height
  const menuMaxHeight = menuLayout
    ? Math.min(280, windowHeight - keyboardHeight - (menuLayout.y + menuLayout.height + 24))
    : 280

  const showEmphasisBorder = open || (isActive && hasSelection)
  const showPrimaryTint = usePrimaryAccent && (open || (isActive && hasSelection))

  const selectedHasStyles = selected && (selected.bgClass || selected.borderClass || selected.colorClass)

  let triggerClassName = clsx(
    "flex-row items-center justify-center rounded-xl px-4",
    triggerHeightClassName || "h-11"
  )

  if (isActive && hasSelection && selectedHasStyles && selected) {
    triggerClassName = clsx(
      triggerClassName,
      "border-2",
      selected.borderClass || "border-primary",
      selected.bgClass || "bg-primary/10 dark:bg-primary/20"
    )
  } else if (showPrimaryTint) {
    triggerClassName = clsx(
      triggerClassName,
      "border-2 border-primary bg-primary/10 dark:bg-primary/20"
    )
  } else if (showEmphasisBorder) {
    triggerClassName = clsx(
      triggerClassName,
      "border-2 border-slate-200 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    )
  } else {
    triggerClassName = clsx(
      triggerClassName,
      "border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
    )
  }

  const renderOptions = () => (
    <>
      {options.map((opt) => {
        const sel = opt.value === value
        return (
          <TouchableOpacity
            key={`${opt.value}-${sel}`}
            onPress={() => {
              onChange(opt.value)
              onOpenChange?.(false)
            }}
            className={clsx(
              "flex-row items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800",
              sel ? "bg-slate-50 dark:bg-slate-900" : "",
            )}
          >
            <Text
              style={sel && usePrimaryAccent && !opt.colorClass ? { color: primaryColor } : undefined}
              className={clsx(
                "text-[13px] font-semibold",
                sel && usePrimaryAccent
                  ? opt.colorClass || ""
                  : opt.colorClass || "text-slate-800 dark:text-slate-100",
              )}
            >
              {opt.listLabel ?? opt.shortLabel}
            </Text>

            {typeof opt.count === "number" && (
              <View
                className={clsx(
                  "h-5 min-w-[20px] px-1 rounded-full items-center justify-center ml-2 border border-slate-200 dark:border-slate-700",
                  opt.circleBgClass || "bg-slate-100 dark:bg-slate-800"
                )}
              >
                <Text
                  className={clsx(
                    "text-[10px] font-extrabold",
                    opt.circleTextClass || "text-slate-600 dark:text-slate-400"
                  )}
                >
                  {opt.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )
      })}
      {footer}
    </>
  )

  const menuPanelClass =
    "overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"

  const menuPanelStyle = {
    elevation: 8 as const,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  }

  const menuContent = (
    <Animated.View entering={MENU_ANIM_IN} exiting={MENU_ANIM_OUT} className={menuPanelClass} style={menuPanelStyle}>
      {overlay ? (
        <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {renderOptions()}
        </ScrollView>
      ) : (
        <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {renderOptions()}
        </ScrollView>
      )}
    </Animated.View>
  )

  return (
    <View
      ref={triggerRef}
      collapsable={false}
      className={clsx("flex-1", className)}
      style={{ position: "relative" }}
    >
      <TouchableOpacity
        key={`trigger-${open}-${showEmphasisBorder}-${showPrimaryTint}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={toggleOpen}
        activeOpacity={0.88}
        className={triggerClassName}
      >
        <Text
          className={clsx(
            "text-[13px] font-bold",
            isActive && hasSelection && selected?.colorClass
              ? selected.colorClass
              : showPrimaryTint
              ? "text-slate-800 dark:text-slate-100"
              : "text-slate-600 dark:text-slate-300",
          )}
        >
          {triggerLabel}
        </Text>

        {hasSelection && selected && typeof selected.count === "number" && (
          <View
            className={clsx(
              "h-4 min-w-[16px] px-1 rounded-full items-center justify-center ml-1.5 border border-slate-200 dark:border-slate-700",
              selected.circleBgClass || "bg-slate-200 dark:bg-slate-700"
            )}
          >
            <Text
              className={clsx(
                "text-[9px] font-black",
                selected.circleTextClass || "text-slate-700 dark:text-slate-300"
              )}
            >
              {selected.count}
            </Text>
          </View>
        )}

        <ChevronDown
          size={14}
          color={
            isActive && hasSelection && selected?.iconColor
              ? selected.iconColor
              : showPrimaryTint
              ? (isDark ? "#e2e8f0" : "#334155")
              : "#64748b"
          }
          style={{ marginLeft: 4, transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </TouchableOpacity>

      {open && !overlay ? (
        <>
          <Pressable
            style={{
              position: "absolute",
              top: -2000,
              bottom: -2000,
              left: -2000,
              right: -2000,
              backgroundColor: "transparent",
              zIndex: 9998,
            }}
            onPress={() => onOpenChange?.(false)}
          />
          <View
            style={{
              position: "absolute",
              top: 48,
              left: 0,
              right: 0,
              zIndex: 9999,
            }}
          >
            {menuContent}
          </View>
        </>
      ) : null}

      {overlay && open && menuLayout ? (
        <Modal transparent visible animationType="none" statusBarTranslucent={true} onRequestClose={() => onOpenChange?.(false)}>
          <Animated.View entering={FadeIn.duration(60)} exiting={FadeOut.duration(40)} style={StyleSheet.absoluteFill}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpenChange?.(false)} />
          </Animated.View>
          <View
            style={{
              position: "absolute",
              top: menuLayout.y + menuLayout.height + 4,
              left: menuLayout.x,
              width: menuLayout.width,
              maxHeight: Math.max(120, menuMaxHeight),
            }}
          >
            {menuContent}
          </View>
        </Modal>
      ) : null}
    </View>
  )
}
