// tailwind.config.js
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0071df", // Premium brand blue (light)
          dark: "#0091ff",    // Premium brand blue (dark)
          foreground: "#f9f9f9",
        },
        success: {
          DEFAULT: "#10b981", // Emerald green
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#f59e0b", // Amber warning
          foreground: "#1f2937",
        },
        destructive: {
          DEFAULT: "#ef4444", // Crimson red
          foreground: "#ffffff",
        },
        background: {
          DEFAULT: "#fafafa", // Soft background
          dark: "#0f111a", // Deep midnight slate
        },
        foreground: {
          DEFAULT: "#252525",
          dark: "#f1f1f1",
        },
        card: {
          DEFAULT: "#ffffff", // Pure white card
          dark: "#161924", // Slate card background
        },
        border: {
          DEFAULT: "#e5e7eb",
          dark: "#262936",
        },
        muted: {
          DEFAULT: "#9ca3af",
          dark: "#6b7280",
        }
      },
    },
  },
  plugins: [],
}
