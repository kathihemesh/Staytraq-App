import { useEffect } from "react"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import * as SystemUI from "expo-system-ui"
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
  const backgroundColor = colorScheme === "dark" ? "#0f111a" : "#fafafa"

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(backgroundColor)
  }, [backgroundColor])

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          gestureEnabled: true,
          contentStyle: {
            backgroundColor
          }
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false, animation: "none" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: "none" }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: "none" }} />
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
