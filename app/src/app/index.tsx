import React from "react"
import { ActivityIndicator, View, Text } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import useTheme from "@/hooks/use-theme"

export default function RootIndex() {
  const { isDark } = useTheme()

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark items-center justify-center">
      <View className="items-center justify-center p-6">
        <ActivityIndicator size="large" color={isDark ? "#0091ff" : "#0071df"} />
        <Text className="text-base font-extrabold text-foreground dark:text-foreground-dark mt-6 tracking-tight text-center">
          Staytraq Premium
        </Text>
        <Text className="text-xs font-semibold text-muted dark:text-muted-dark mt-2 tracking-wide text-center uppercase">
          Securing session context...
        </Text>
      </View>
    </SafeAreaView>
  )
}
