type RetryOptions = {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  jitter?: boolean
  shouldRetry?: (err: unknown) => boolean
  onAttempt?: (info: { attempt: number; delayMs: number; err?: unknown }) => void
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function defaultShouldRetry(err: unknown) {
  const msg =
    typeof err === "string"
      ? err
      : (err as any)?.message || (err as any)?.details || (err as any)?.toString?.()

  if (!msg) return false

  const s = String(msg).toLowerCase()
  return (
    s.includes("failed to fetch") ||
    s.includes("networkerror") ||
    s.includes("err_network_changed") ||
    s.includes("network changed") ||
    s.includes("load resource") ||
    s.includes("fetch")
  )
}

async function waitForOnlineOrVisible(timeoutMs: number) {
  if (typeof window === "undefined") return
  if (navigator.onLine && document.visibilityState === "visible") return

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.removeEventListener("online", onOnline)
      document.removeEventListener("visibilitychange", onVis)
      if (timer) window.clearTimeout(timer)
      resolve()
    }
    const onOnline = () => finish()
    const onVis = () => {
      if (document.visibilityState === "visible") finish()
    }

    window.addEventListener("online", onOnline)
    document.addEventListener("visibilitychange", onVis)

    const timer =
      timeoutMs > 0 ? window.setTimeout(() => finish(), timeoutMs) : undefined
  })
}

export async function runWithNetworkRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4
  const initialDelayMs = opts.initialDelayMs ?? 400
  const maxDelayMs = opts.maxDelayMs ?? 5000
  const jitter = opts.jitter ?? true
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry

  let attempt = 0
  let delay = initialDelayMs
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1
    try {
      opts.onAttempt?.({ attempt, delayMs: 0 })
      return await fn()
    } catch (err) {
      if (attempt >= maxAttempts || !shouldRetry(err)) {
        throw err
      }

      // If we’re offline or tab is hidden, wait for it to come back.
      await waitForOnlineOrVisible(8000)

      const jitterFactor = jitter ? 0.5 + Math.random() : 1
      const waitMs = Math.min(maxDelayMs, Math.round(delay * jitterFactor))
      opts.onAttempt?.({ attempt, delayMs: waitMs, err })
      await sleep(waitMs)
      delay = Math.min(maxDelayMs, delay * 2)
    }
  }
}

