import { Stack } from "expo-router"
import { Image, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useAuth } from "@/context/auth"

export default function AuthLayout() {
  const { authReady, isAuthenticated, isLoading } = useAuth()

  if (!authReady || isLoading || isAuthenticated) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark items-center justify-center">
        <View className="items-center justify-center p-6">
          <Image
            source={require("../../../assets/images/logo-glow.png")}
            className="h-28 w-28"
            resizeMode="contain"
          />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
    </Stack>
  )
}
