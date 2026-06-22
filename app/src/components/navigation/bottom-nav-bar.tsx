/**
 * BottomNavBar — classic Instagram-style bottom nav.
 *
 * No animations, no labels, no sliding indicator, no haptics. Just a row of
 * icons spread evenly across the full width of the screen, sitting on a flat
 * surface with a hairline top border separating it from page content.
 *
 * Active = white (dark theme) / slate-900 (light theme) with a thicker stroke.
 * Inactive = neutral grey with a thinner stroke.
 *
 * Correctness invariants:
 *   • Highlighted icon is derived strictly from router state via
 *     `deriveActiveFlag` — no local copy can disagree with the page on screen.
 *   • Each cell is its own Pressable so simultaneous multi-finger taps don't
 *     compete for a single gesture handler.
 *   • Each cell is React.memo'd: changing the active tab only re-renders the
 *     previously-active and newly-active cells.
 */

import { memo, useCallback, useMemo } from "react"
import {
  Pressable,
  StyleSheet,
  View,
} from "react-native"
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs"
import {
  BedDouble,
  IndianRupee,
  Inbox,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import useTheme from "@/hooks/use-theme"
import {
  buildDisplayRoutes,
  deriveActiveFlag,
  filterTabRoutes,
} from "@/components/navigation/tab-bar-state"

/* ─── Types ──────────────────────────────────────────────────── */

type TabRoute = {
  key: string
  name: string
  params?: object
}

/* ─── Per-tab icon ───────────────────────────────────────────── */

const icons: Record<string, LucideIcon> = {
  index: LayoutDashboard,
  rooms: BedDouble,
  tenants: Users,
  payments: IndianRupee,
  complaints: Inbox,
  settings: Settings,
}

function getIcon(routeName: string): LucideIcon {
  return icons[routeName] ?? LayoutDashboard
}

function getRouteLabel(route: TabRoute, descriptor?: BottomTabBarProps["descriptors"][string]): string {
  const tabBarLabel = descriptor?.options?.tabBarLabel
  if (typeof tabBarLabel === "string") return tabBarLabel
  const title = descriptor?.options?.title
  if (typeof title === "string" && title.length > 0) return title
  if (route.name === "index") return "Dashboard"
  return route.name
}

/* ─── TabItem ────────────────────────────────────────────────── */

type TabItemProps = {
  routeIndex: number
  routeName: string
  label: string
  active: boolean
  isDark: boolean
  onPress: (routeIndex: number) => void
}

const TabItem = memo(function TabItem({
  routeIndex,
  routeName,
  label,
  active,
  isDark,
  onPress,
}: TabItemProps) {
  const Icon = getIcon(routeName)

  const activeColor = isDark ? "#ffffff" : "#0f172a"
  const inactiveColor = isDark ? "#9ca3af" : "#6b7280"
  const iconColor = active ? activeColor : inactiveColor
  const strokeWidth = active ? 2.8 : 1.9

  const handlePress = useCallback(() => onPress(routeIndex), [onPress, routeIndex])

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={handlePress}
      android_ripple={null}
      hitSlop={6}
      style={({ pressed }) => [
        styles.cell,
        pressed ? styles.cellPressed : null,
      ]}
    >
      <Icon size={28} color={iconColor} strokeWidth={strokeWidth} />
    </Pressable>
  )
})

/* ─── BottomNavBar ───────────────────────────────────────────── */

export default function BottomNavBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useTheme()
  const isDark = colorScheme === "dark"

  // Pure, router-derived display list. No local copy of state.index.
  const tabRoutes = useMemo(
    () => filterTabRoutes(state.routes, descriptors) as TabRoute[],
    [state.routes, descriptors],
  )
  const displayRoutes = useMemo(
    () => buildDisplayRoutes(state.routes, descriptors),
    [state.routes, descriptors],
  )

  const selectedRouteName = state.routes[state.index]?.name
  const selectedIndex = useMemo(() => {
    if (!selectedRouteName) return -1
    return tabRoutes.findIndex((r) => r.name === selectedRouteName)
  }, [tabRoutes, selectedRouteName])
  const hasSelection = selectedIndex >= 0

  // Stable navigate handler so each TabItem's React.memo holds across renders.
  const navigateToRoute = useCallback(
    (routeIndex: number) => {
      const route = tabRoutes[routeIndex]
      if (!route) return

      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      })

      if (!event.defaultPrevented) {
        navigation.navigate(route.name, route.params)
      }
    },
    [navigation, tabRoutes],
  )

  // Bar surface: the same dark/light page background, with a clear hairline
  // top border for separation. (Instagram-style — flat, no elevation, blends
  // with the safe-area padding that sits below it.)
  const surface = isDark ? "#0b0f1a" : "#ffffff"
  const border = isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(15, 23, 42, 0.10)"

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: surface,
          borderTopColor: border,
          paddingBottom: Math.max(insets.bottom, 10) + 8,
        },
      ]}
    >
      <View style={styles.row}>
        {displayRoutes.map((displayRoute) => {
          const route = state.routes.find((r) => r.key === displayRoute.key) as TabRoute
          const descriptor = descriptors[displayRoute.key]
          const active = hasSelection && deriveActiveFlag(selectedIndex, displayRoute.routeIndex)
          const label = getRouteLabel(route, descriptor)

          return (
            <TabItem
              key={displayRoute.key}
              routeIndex={displayRoute.routeIndex}
              routeName={route.name}
              label={label}
              active={active}
              isDark={isDark}
              onPress={navigateToRoute}
            />
          )
        })}
      </View>
    </View>
  )
}

/* ─── Styles ─────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  bar: {
    width: "100%",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  cell: {
    flex: 1,
    height: 64,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cellPressed: {
    opacity: 0.55,
  },
})
