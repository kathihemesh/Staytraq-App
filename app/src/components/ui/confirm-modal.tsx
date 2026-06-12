import React from "react"
import { Modal, View, Text, Pressable, StyleSheet } from "react-native"
import useTheme from "@/hooks/use-theme"

interface ConfirmModalProps {
  visible: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmText?: string
  cancelText?: string
  isDestructive?: boolean
  icon?: React.ReactNode
}

export function ConfirmModal({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  icon,
}: ConfirmModalProps) {
  const { isDark } = useTheme()

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View className="flex-1 bg-black/60 backdrop-blur-sm justify-center items-center p-6">
        <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl items-center relative">
          
          {/* Top Decorative Icon */}
          {icon && (
            <View 
              className="h-14 w-14 rounded-2xl items-center justify-center mb-1 mt-2"
              style={{
                backgroundColor: isDestructive ? "rgba(239, 68, 68, 0.1)" : "rgba(32, 138, 239, 0.1)",
                borderWidth: 1,
                borderColor: isDestructive ? "rgba(239, 68, 68, 0.2)" : "rgba(32, 138, 239, 0.2)",
              }}
            >
              {icon}
            </View>
          )}

          {/* Text Content */}
          <Text className="text-[17px] font-black text-slate-900 dark:text-white mb-2 mt-3 text-center">
            {title}
          </Text>
          <Text className="text-xs text-slate-500 dark:text-slate-400 font-bold mb-6 text-center leading-relaxed">
            {message}
          </Text>

          {/* Quick Actions Row */}
          <View className="flex-row w-full gap-2.5 mt-2">
            <Pressable 
              className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 py-3 rounded-xl items-center justify-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              onPress={onCancel}
            >
              <Text className="text-xs font-black text-slate-700 dark:text-slate-300">
                {cancelText}
              </Text>
            </Pressable>
            
            <Pressable 
              className={`flex-1 py-3 rounded-xl items-center justify-center border ${
                isDestructive 
                  ? "bg-red-600 border-red-600" 
                  : "bg-primary border-primary"
              }`}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              onPress={onConfirm}
            >
              <Text className="text-xs font-black text-white">
                {confirmText}
              </Text>
            </Pressable>
          </View>

        </View>
      </View>
    </Modal>
  )
}
