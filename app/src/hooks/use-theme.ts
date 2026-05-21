import { useColorScheme } from "nativewind"

export function useTheme() {
  const { colorScheme, setColorScheme, toggleColorScheme } = useColorScheme()

  return {
    isDark: colorScheme === "dark",
    colorScheme: colorScheme || "light",
    setTheme: (theme: "light" | "dark") => setColorScheme(theme),
    toggleTheme: toggleColorScheme
  }
}
export default useTheme
