import { Tabs } from "expo-router"
import { Platform } from "react-native"
import { LayoutDashboard, Hotel, Users, CircleDollarSign, Settings } from "lucide-react-native"
import useTheme from "@/hooks/use-theme"

export default function TabLayout() {
  const { colorScheme } = useTheme()
  const isDark = colorScheme === "dark"

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isDark ? "#0091ff" : "#0071df", // Custom brand blue
        tabBarInactiveTintColor: isDark ? "#6b7280" : "#9ca3af",
        tabBarStyle: {
          backgroundColor: isDark ? "#161924" : "#ffffff",
          borderTopColor: isDark ? "#262936" : "#e5e7eb",
          paddingBottom: Platform.OS === "ios" ? 24 : 10,
          paddingTop: 10,
          height: Platform.OS === "ios" ? 88 : 68,
          shadowColor: "#000000",
          shadowOpacity: isDark ? 0.3 : 0.05,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -2 },
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          paddingBottom: 2
        }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          title: "Rooms",
          tabBarIcon: ({ color, size }) => <Hotel size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="tenants"
        options={{
          title: "Tenants",
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: "Payments",
          tabBarIcon: ({ color, size }) => <CircleDollarSign size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />
        }}
      />
    </Tabs>
  )
}
