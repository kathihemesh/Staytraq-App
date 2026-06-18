import { Text, type TextProps } from "react-native"
import { sanitizeText } from "@/lib/sanitize"

/**
 * SafeText Component
 * 
 * A drop-in replacement for React Native's Text component that automatically
 * sanitizes children text to prevent XSS attacks when displaying user-generated content.
 * 
 * Use this component whenever displaying content from:
 * - User inputs (complaints, notes, messages)
 * - Database fields that contain user-generated text
 * - Any untrusted data source
 * 
 * @example
 * <SafeText className="text-sm">{userComplaint}</SafeText>
 */
export function SafeText({ children, ...props }: TextProps) {
  // If children is a string, sanitize it
  if (typeof children === "string") {
    return <Text {...props}>{sanitizeText(children)}</Text>
  }
  
  // If children is an array, sanitize string elements
  if (Array.isArray(children)) {
    const sanitizedChildren = children.map((child, index) =>
      typeof child === "string" ? sanitizeText(child) : child
    )
    return <Text {...props}>{sanitizedChildren}</Text>
  }
  
  // For other types (React elements, numbers, etc.), pass through
  return <Text {...props}>{children}</Text>
}
