import { useEffect } from "react"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider } from "@/context/auth"
import { queryClient } from "@/lib/queryClient"
import useTheme from "@/hooks/use-theme"
import "../global.css"

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

function RootLayoutNav() {
  const { colorScheme } = useTheme()

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: 160,
          gestureEnabled: true,
          contentStyle: {
            backgroundColor: colorScheme === "dark" ? "#0f111a" : "#fafafa"
          }
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen 
          name="reminders" 
          options={{ 
            presentation: "modal", 
            headerShown: false,
            animation: "fade_from_bottom",
            animationDuration: 180
          }} 
        />
      </Stack>
    </>
  )
}
