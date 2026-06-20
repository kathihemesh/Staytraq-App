import { useEffect, useState, useRef } from "react"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import * as SystemUI from "expo-system-ui"
import * as WebBrowser from "expo-web-browser"
import { enableFreeze } from "react-native-screens"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider, useAuth } from "@/context/auth"
import { queryClient } from "@/lib/queryClient"
import useTheme from "@/hooks/use-theme"
import { Animated, Image, StyleSheet, View } from "react-native"
import "../global.css"

// [OAuth] Must be called at module level (outside components) so it runs
// as soon as the JS bundle loads. On web this completes the auth redirect;
// on native it helps dismiss the in-app browser after the redirect fires.
WebBrowser.maybeCompleteAuthSession()
enableFreeze(true)

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

interface AnimatedSplashScreenProps {
  isAppReady: boolean
  onAnimationComplete: () => void
  backgroundColor: string
}

function AnimatedSplashScreen({
  isAppReady,
  onAnimationComplete,
  backgroundColor
}: AnimatedSplashScreenProps) {
  const logoOpacity = useRef(new Animated.Value(1)).current
  const logoScale = useRef(new Animated.Value(1)).current
  const containerOpacity = useRef(new Animated.Value(1)).current
  const [animationState, setAnimationState] = useState<"ready" | "outro">("ready")

  // Outro animation when app is ready
  useEffect(() => {
    if (isAppReady && animationState === "ready") {
      setAnimationState("outro")
      
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1.25, // seamless zoom-out exit
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onAnimationComplete()
      })
    }
  }, [isAppReady, animationState])

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor,
          opacity: containerOpacity,
          justifyContent: "center",
          alignItems: "center",
          zIndex: 99999,
        },
      ]}
    >
      <Animated.View
        style={{
          width: 120, // matches app.json native splash imageWidth exactly!
          height: 120,
          borderRadius: 24, // 20% rounded corners matching native splash rounding
          overflow: "hidden",
          opacity: logoOpacity,
          transform: [{ scale: logoScale }],
        }}
      >
        <Image
          source={require("../../assets/images/staytraqlogo.png")}
          style={{
            width: "100%",
            height: "100%",
          }}
          resizeMode="cover"
        />
      </Animated.View>
    </Animated.View>
  )
}

function RootLayoutNav() {
  const { colorScheme } = useTheme()
  const { authReady, isLoading } = useAuth()
  const backgroundColor = colorScheme === "dark" ? "#0f111a" : "#fafafa"
  
  const [splashVisible, setSplashVisible] = useState(true)

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(backgroundColor)
  }, [backgroundColor])

  const isAppReady = authReady && !isLoading

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
        <Stack.Screen name="auth/callback" options={{ headerShown: false, animation: "none" }} />
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

      {splashVisible && (
        <AnimatedSplashScreen
          isAppReady={isAppReady}
          onAnimationComplete={() => setSplashVisible(false)}
          backgroundColor={backgroundColor}
        />
      )}
    </>
  )
}
