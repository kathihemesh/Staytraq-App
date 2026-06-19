import { createClient } from "@supabase/supabase-js"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import type { Database } from "@/types/database.types"

// Custom secure storage adapter for Expo SecureStore
const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key)
    } catch (error) {
      console.error("Error reading from secure store:", error)
      return null
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch (error) {
      console.error("Error writing to secure store:", error)
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key)
    } catch (error) {
      console.error("Error removing from secure store:", error)
    }
  }
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ""

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase environment variables are missing! Make sure your .env file is set up correctly.")
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
    flowType: "pkce"
  }
})
