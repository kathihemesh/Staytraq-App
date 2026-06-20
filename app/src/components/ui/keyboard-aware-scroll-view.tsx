import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from "react"
import {
  ScrollView,
  Keyboard,
  Platform,
  ScrollViewProps,
  TextInput,
  findNodeHandle,
  UIManager,
  Dimensions,
} from "react-native"

interface KeyboardAwareContextType {
  scrollToInput: (inputNode: TextInput | null) => void
  keyboardHeight: number
}

const KeyboardAwareContext = createContext<KeyboardAwareContextType | null>(null)

/** Keyboard height for modals/sheets outside KeyboardAwareScrollView */
export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"

    const showSubscription = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height)
    })
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0)
    })

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [])

  return keyboardHeight
}

export function useKeyboardAwareInput() {
  const context = useContext(KeyboardAwareContext)
  const inputRef = useRef<TextInput>(null)

  const handleFocus = useCallback(() => {
    if (context && inputRef.current) {
      context.scrollToInput(inputRef.current)
    }
  }, [context])

  return {
    ref: inputRef,
    onFocus: handleFocus,
  }
}

interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  children: React.ReactNode
  extraScrollHeight?: number
  disableKeyboardPadding?: boolean
}

export function KeyboardAwareScrollView({
  children,
  extraScrollHeight = 24,
  disableKeyboardPadding = false,
  contentContainerStyle,
  ...props
}: KeyboardAwareScrollViewProps) {
  const scrollViewRef = useRef<ScrollView>(null)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const scrollOffsetY = useRef(0)
  const viewportHeight = useRef(0)

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"

    const showSubscription = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height)
    })
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0)
    })

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [])

  const measureNodeInWindow = useCallback(
    (node: TextInput | ScrollView | null): Promise<{ y: number; height: number } | null> =>
      new Promise((resolve) => {
        const handle = findNodeHandle(node)
        if (!handle) {
          resolve(null)
          return
        }
        UIManager.measureInWindow(handle, (_x, y, _w, h) => {
          resolve({ y, height: h })
        })
      }),
    [],
  )

  const scrollToInput = useCallback(
    async (inputNode: TextInput | null) => {
      if (!scrollViewRef.current || !inputNode) return

      const delay = Platform.OS === "ios" ? 320 : 120
      await new Promise((r) => setTimeout(r, delay))

      const [inputRect, scrollRect] = await Promise.all([
        measureNodeInWindow(inputNode),
        measureNodeInWindow(scrollViewRef.current),
      ])

      if (!inputRect || !scrollRect) return

      const windowHeight = Dimensions.get("window").height
      const visibleTop = scrollRect.y
      const visibleBottom = Math.min(
        scrollRect.y + (viewportHeight.current || scrollRect.height),
        keyboardHeight > 0 ? windowHeight - keyboardHeight : windowHeight
      ) - extraScrollHeight

      const inputTop = inputRect.y
      const inputBottom = inputRect.y + inputRect.height

      // Already fully visible above keyboard — do not scroll
      if (inputTop >= visibleTop && inputBottom <= visibleBottom) {
        return
      }

      let delta = 0
      if (inputBottom > visibleBottom) {
        delta = inputBottom - visibleBottom + extraScrollHeight
      } else if (inputTop < visibleTop) {
        delta = inputTop - visibleTop - extraScrollHeight
      }

      if (Math.abs(delta) < 4) return

      scrollViewRef.current.scrollTo({
        y: Math.max(0, scrollOffsetY.current + delta),
        animated: true,
      })
    },
    [extraScrollHeight, keyboardHeight, measureNodeInWindow],
  )

  const basePadding =
    typeof contentContainerStyle === "object" && contentContainerStyle !== null && !Array.isArray(contentContainerStyle)
      ? (contentContainerStyle as { paddingBottom?: number }).paddingBottom ?? 0
      : 0

  return (
    <KeyboardAwareContext.Provider value={{ scrollToInput, keyboardHeight }}>
      <ScrollView
        ref={scrollViewRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height
        }}
        onScroll={(e) => {
          scrollOffsetY.current = e.nativeEvent.contentOffset.y
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[
          contentContainerStyle,
          { paddingBottom: basePadding + (disableKeyboardPadding ? 0 : keyboardHeight + (keyboardHeight > 0 ? 16 : 0)) },
        ]}
        {...props}
      >
        {children}
      </ScrollView>
    </KeyboardAwareContext.Provider>
  )
}
