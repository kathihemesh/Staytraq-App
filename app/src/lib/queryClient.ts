import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry failed queries up to 3 times (similar to web networkRetry)
      retry: (failureCount, error: any) => {
        if (failureCount >= 3) return false
        
        const msg = error?.message || error?.details || String(error)
        const s = String(msg).toLowerCase()
        
        // Only retry on network errors, matching defaultShouldRetry in web
        return (
          s.includes("failed to fetch") ||
          s.includes("networkerror") ||
          s.includes("err_network_changed") ||
          s.includes("network changed") ||
          s.includes("load resource") ||
          s.includes("fetch")
        )
      },
      // Exponential backoff retry delay matching web parameters
      retryDelay: (attemptIndex) => {
        const delay = Math.min(1000 * Math.pow(2, attemptIndex), 5000)
        const jitter = 0.5 + Math.random()
        return Math.round(delay * jitter)
      },
      staleTime: 1000 * 60 * 5, // 5 minutes stale time
      gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
      refetchOnWindowFocus: false, // Refetches on focus are handled via router hooks in React Native
      refetchOnReconnect: "always" // Automatically refetch on reconnect
    }
  }
})
