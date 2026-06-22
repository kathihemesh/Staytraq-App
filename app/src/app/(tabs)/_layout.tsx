import { View } from "react-native"
import { Tabs } from "expo-router"
import BottomNavBar from "@/components/navigation/bottom-nav-bar"

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName="index"
        tabBar={(props) => <BottomNavBar {...props} />}
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Dashboard",
          }}
        />
        <Tabs.Screen
          name="rooms"
          options={{
            title: "Rooms",
          }}
        />
        <Tabs.Screen
          name="tenants"
          options={{
            title: "Tenants",
          }}
        />
        <Tabs.Screen
          name="payments"
          options={{
            title: "Payments",
          }}
        />
        <Tabs.Screen
          name="complaints"
          options={{
            title: "Complaint Box",
          }}
        />
        <Tabs.Screen
          name="reminders"
          options={{
            title: "Reminders",
            href: null,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
          }}
        />
      </Tabs>
    </View>
  )
}
