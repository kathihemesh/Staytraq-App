import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import * as Haptics from "expo-haptics"
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs"
import {
  Bell,
  BellRing,
  Building2,
  IndianRupee,
  LayoutDashboard,
  Settings,
  Users,
  UsersRound,
} from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import useTheme from "@/hooks/use-theme"

type TabRoute = {
  key: string
  name: string
  params?: object
}

type NavAccent = {
  base: string
  soft: string
  glow: string
}

type NavVisual = {
  label: string
  accent: NavAccent
  Icon: typeof LayoutDashboard
  ActiveIcon: typeof LayoutDashboard
}

/* ─── Constants ──────────────────────────────────────────────── */

const VISIBLE_SLOTS = 5
const COLLAPSED_HEIGHT = 68
const EXPANDED_HEIGHT = 196
const EXPANDED_ITEM_HEIGHT = 84

/* ─── Accent colours per route ───────────────────────────────── */

const accents: Record<string, NavAccent> = {
  index: { base: "#6366f1", soft: "#c7d2fe", glow: "rgba(99, 102, 241, 0.14)" },
  rooms: { base: "#0ea5e9", soft: "#bae6fd", glow: "rgba(14, 165, 233, 0.14)" },
  tenants: { base: "#10b981", soft: "#bbf7d0", glow: "rgba(16, 185, 129, 0.14)" },
  payments: { base: "#f59e0b", soft: "#fde68a", glow: "rgba(245, 158, 11, 0.14)" },
  reminders: { base: "#f97316", soft: "#fed7aa", glow: "rgba(249, 115, 22, 0.14)" },
  settings: { base: "#a855f7", soft: "#e9d5ff", glow: "rgba(168, 85, 247, 0.14)" },
}

/* ─── Icon map — Settings uses the same gear icon for both states ── */

const iconMap: Record<string, Pick<NavVisual, "Icon" | "ActiveIcon">> = {
  index: { Icon: LayoutDashboard, ActiveIcon: LayoutDashboard },
  rooms: { Icon: Building2, ActiveIcon: Building2 },
  tenants: { Icon: Users, ActiveIcon: UsersRound },
  payments: { Icon: IndianRupee, ActiveIcon: IndianRupee },
  reminders: { Icon: Bell, ActiveIcon: BellRing },
  settings: { Icon: Settings, ActiveIcon: Settings },
}

/* ─── Helpers ────────────────────────────────────────────────── */

function triggerHaptic(type: "preview" | "select" | "toggle") {
  if (Platform.OS === "web") return

  try {
    if (type === "select") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      return
    }

    if (type === "toggle") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      return
    }

    void Haptics.selectionAsync()
  } catch {
    // Haptics are best effort and should never block navigation.
  }
}

function getRouteVisual(route: TabRoute, descriptor?: BottomTabBarProps["descriptors"][string]): NavVisual {
  const title = descriptor?.options?.title
  const tabBarLabel = descriptor?.options?.tabBarLabel
  const label = typeof tabBarLabel === "string" ? tabBarLabel : title || (route.name === "index" ? "Dashboard" : route.name)
  const icons = iconMap[route.name] || iconMap.index

  return {
    label,
    accent: accents[route.name] || accents.index,
    ...icons,
  }
}

// Helper removed — layout is now statically paginated in sections of up to 5 items.

/* ─── NavGlyph ───────────────────────────────────────────────── */

function NavGlyph(props: {
  visual: NavVisual
  active: boolean
  previewed: boolean
  collapsed?: boolean
  expanded?: boolean
  isDark: boolean
}) {
  const { visual, active, previewed, collapsed, expanded, isDark } = props
  const Icon = active ? visual.ActiveIcon : visual.Icon
  const inactiveColor = isDark ? "#7a808c" : "#8f949f"
  const labelColor = active ? (isDark ? "#ffffff" : "#0f172a") : inactiveColor

  return (
    <View style={[styles.itemInner, expanded && styles.expandedItemInner]}>
      <Animated.View
        style={[
          styles.iconLift,
          active && {
            shadowColor: visual.accent.base,
            shadowOpacity: isDark ? 0.65 : 0.35,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 0 },
            elevation: 9,
          },
          previewed && !active && styles.previewLift,
        ]}
      >
        {active ? (
          <View
            style={[
              styles.activeIconShell,
              expanded && styles.expandedActiveShell,
              { backgroundColor: visual.accent.glow },
            ]}
          >
            <Icon size={expanded ? 30 : 30} color={visual.accent.base} strokeWidth={2.85} />
          </View>
        ) : (
          <View
            style={[
              styles.inactiveIconShell,
              {
                borderColor: isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(71, 85, 105, 0.14)",
                backgroundColor: previewed
                  ? isDark
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(15,23,42,0.05)"
                  : "transparent",
              },
            ]}
          >
            <Icon size={expanded ? 23 : 25} color={previewed ? visual.accent.base : inactiveColor} strokeWidth={2.25} />
          </View>
        )}
      </Animated.View>

      {!collapsed ? (
        <Text
          numberOfLines={1}
          style={[
            styles.itemLabel,
            expanded && styles.expandedLabel,
            {
              color: labelColor,
              opacity: active ? 1 : previewed ? 0.88 : 0.62,
              fontWeight: active ? "800" : "700",
            },
          ]}
        >
          {visual.label}
        </Text>
      ) : null}
    </View>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PremiumBottomNavigation — Fixed 5-Slot Circular Row
   ═══════════════════════════════════════════════════════════════

   Architecture:
   • Renders exactly 5 items — no ScrollView, no FlatList.
   • The selected tab is ALWAYS in slot 2 (centre).
   • The surrounding 4 slots are filled circularly.
   • No scrolling = no intermediate highlights, no 6th-item peek,
     no opposite-direction scrolling, no centering drift.
   • Horizontal swipe ±1 tab, vertical swipe expand/collapse.
   ═══════════════════════════════════════════════════════════════ */

export default function PremiumBottomNavigation({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useTheme()
  const isDark = colorScheme === "dark"
  const [width, setWidth] = useState(Dimensions.get("window").width)
  const [expanded, setExpanded] = useState(false)
  const expandProgress = useRef(new Animated.Value(0)).current
  const selectedIndexRef = useRef(state.index)
  selectedIndexRef.current = state.index
  const selectedIndex = state.index

  const routes = state.routes
  const collapsedWidth = Math.min(width - 48, 340)
  const collapsedShellWidth = collapsedWidth + 12
  const itemWidth = collapsedWidth / VISIBLE_SLOTS
  const expandedTargetHeight = Math.min(360, Math.max(EXPANDED_HEIGHT, Math.ceil(routes.length / 3) * EXPANDED_ITEM_HEIGHT + 38))

  /* ─── Derived visuals ──────────────────────────────────────── */

  const visuals = useMemo(
    () => routes.map((route) => getRouteVisual(route, descriptors[route.key])),
    [descriptors, routes],
  )

  /* ─── 5 visible route indices, centred on selectedIndex ────── */

  const currentSectionItems = useMemo(() => {
    const itemsPerSection = 5
    const sectionIndex = Math.floor(selectedIndex / itemsPerSection)
    const start = sectionIndex * itemsPerSection
    const end = Math.min(start + itemsPerSection, routes.length)
    return Array.from({ length: end - start }, (_, i) => start + i)
  }, [selectedIndex, routes.length])

  /* ─── Expand / collapse spring ─────────────────────────────── */

  useEffect(() => {
    Animated.spring(expandProgress, {
      toValue: expanded ? 1 : 0,
      damping: 19,
      stiffness: 190,
      mass: 0.82,
      useNativeDriver: false,
    }).start()
  }, [expandProgress, expanded])

  /* ─── Dimension listener ───────────────────────────────────── */

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => setWidth(window.width))
    return () => subscription.remove()
  }, [])

  /* ─── Expand toggle with haptic ────────────────────────────── */

  const setExpandedWithFeedback = useCallback((next: boolean) => {
    setExpanded((current) => {
      if (current !== next) triggerHaptic("toggle")
      return next
    })
  }, [])

  /* ─── Navigate to a route ──────────────────────────────────── */

  const navigateToRoute = useCallback(
    (index: number) => {
      const route = routes[index]
      if (!route) return

      triggerHaptic("select")

      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      })

      if (!event.defaultPrevented) {
        navigation.navigate(route.name, route.params)
      }

      setExpanded(false)
    },
    [navigation, routes],
  )

  /* ─── Combined pan responder (horizontal swipe + vertical expand) ── */

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          (Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx)) ||
          (Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy)),
        onPanResponderRelease: (_, g) => {
          const total = routes.length
          const current = selectedIndexRef.current

          if (Math.abs(g.dy) > Math.abs(g.dx)) {
            // Vertical → expand / collapse
            if (g.dy < -16) setExpandedWithFeedback(true)
            if (g.dy > 16) setExpandedWithFeedback(false)
          } else {
            // Horizontal → change tab circularly
            if (g.dx < -25) {
              navigateToRoute((current + 1) % total)
            } else if (g.dx > 25) {
              navigateToRoute((current - 1 + total) % total)
            }
          }
        },
      }),
    [navigateToRoute, routes.length, setExpandedWithFeedback],
  )

  /* ─── Animated interpolations ──────────────────────────────── */

  const shellBackground = isDark ? "#080d18" : "#ffffff"
  const shellBorder = isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.1)"
  const expandedHeight = expandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [COLLAPSED_HEIGHT, expandedTargetHeight],
  })
  const backdropOpacity = expandProgress.interpolate({ inputRange: [0, 1], outputRange: [0, isDark ? 0.42 : 0.22] })
  const expandedOpacity = expandProgress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] })
  const collapsedOpacity = expandProgress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 0, 0] })

  /* ─── Render ───────────────────────────────────────────────── */

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Backdrop for expanded grid */}
      {expanded ? (
        <Animated.View pointerEvents="auto" style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" onPress={() => setExpandedWithFeedback(false)} />
        </Animated.View>
      ) : null}

      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.wrap,
          {
            paddingBottom: Math.max(insets.bottom - 8, 4),
          },
        ]}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {/* ── Drag handle — OUTSIDE and ABOVE the nav shell ──── */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Collapse navigation" : "Expand navigation"}
          onPress={() => setExpandedWithFeedback(!expanded)}
          style={styles.handleHitbox}
          {...panResponder.panHandlers}
        >
          <View
            style={[
              styles.handle,
              {
                backgroundColor: isDark ? "rgba(226, 232, 240, 0.82)" : "rgba(51, 65, 85, 0.26)",
              },
            ]}
          />
        </Pressable>

        {/* ── Navigation shell ───────────────────────────────── */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.shell,
            {
              width: expanded ? "100%" : collapsedShellWidth,
              height: expandedHeight,
              backgroundColor: shellBackground,
              borderColor: shellBorder,
              shadowColor: isDark ? "#020617" : "#64748b",
              shadowOpacity: isDark ? 0.64 : 0.18,
            },
          ]}
        >
          {/* ── Collapsed: fixed 5-slot row (NO scroll) ──────── */}
          <Animated.View
            pointerEvents={expanded ? "none" : "auto"}
            style={[styles.collapsedLayer, { opacity: collapsedOpacity }]}
          >
            <View style={[styles.collapsedRow, { width: collapsedWidth }]}>
              {currentSectionItems.map((routeIndex) => {
                const active = selectedIndex === routeIndex
                const visual = visuals[routeIndex]

                return (
                  <Pressable
                    key={routeIndex}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={visual.label}
                    onPress={() => navigateToRoute(routeIndex)}
                    onLongPress={() => setExpandedWithFeedback(true)}
                    style={({ pressed }) => [
                      styles.item,
                      { width: itemWidth },
                      {
                        transform: [{ scale: pressed ? 0.92 : active ? 1.12 : 0.88 }],
                      },
                    ]}
                  >
                    <NavGlyph visual={visual} active={active} previewed={active} collapsed isDark={isDark} />
                  </Pressable>
                )
              })}
            </View>
          </Animated.View>

          {/* ── Expanded: grid of all tabs ────────────────────── */}
          <Animated.View
            pointerEvents={expanded ? "auto" : "none"}
            style={[
              styles.expandedLayer,
              {
                opacity: expandedOpacity,
              },
            ]}
          >
            <View style={styles.expandedGrid}>
              {routes.map((route, index) => {
                const active = selectedIndex === index
                const visual = visuals[index]

                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={visual.label}
                    onPress={() => navigateToRoute(index)}
                    style={({ pressed }) => [
                      styles.expandedItem,
                      {
                        borderColor: active ? visual.accent.base : isDark ? "rgba(148, 163, 184, 0.12)" : "rgba(15, 23, 42, 0.08)",
                        backgroundColor: active
                          ? isDark
                            ? "rgba(255,255,255,0.1)"
                            : "rgba(255,255,255,0.72)"
                          : isDark
                            ? "rgba(255,255,255,0.045)"
                            : "rgba(15,23,42,0.035)",
                        transform: [{ scale: pressed ? 0.96 : active ? 1.04 : 1 }],
                      },
                    ]}
                  >
                    <NavGlyph visual={visual} active={active} previewed={active} expanded isDark={isDark} />
                  </Pressable>
                )
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#020617",
  },
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: 14,
  },
  handleHitbox: {
    width: 64,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: -6,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 999,
  },
  shell: {
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 32,
    overflow: "hidden",
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 18,
  },
  collapsedLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  collapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  expandedLayer: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 25,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  item: {
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInner: {
    minWidth: 54,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  expandedItemInner: {
    minHeight: 66,
    gap: 5,
  },
  iconLift: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  previewLift: {
    transform: [{ translateY: -1 }],
  },
  activeIconShell: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  expandedActiveShell: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  inactiveIconShell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: {
    maxWidth: 80,
    fontSize: 11,
    letterSpacing: 0,
  },
  expandedLabel: {
    maxWidth: 94,
    fontSize: 11,
  },
  expandedGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  expandedItem: {
    width: "30.5%",
    minWidth: 92,
    minHeight: 74,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
})
