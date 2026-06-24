import { defineConfig } from "vitest/config"
import path from "node:path"

// Owner-app pure-logic test runner.
// Scoped to src/lib/identity/* only: these modules are plain TypeScript with
// no React Native / Expo imports, so they run in a fast Node environment.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/identity/**/*.test.ts"],
    exclude: ["node_modules/**", ".expo/**", "android/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
