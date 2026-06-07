import React from "react"
import { Image, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

export default function RootIndex() {
  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark items-center justify-center">
      <View className="items-center justify-center p-6">
        <Image
          source={require("../../assets/images/logo-glow.png")}
          className="h-28 w-28"
          resizeMode="contain"
        />
      </View>
    </SafeAreaView>
  )
}
