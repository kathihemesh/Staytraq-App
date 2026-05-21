import { createBrowserClient } from '@supabase/ssr'

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLIC_ANON_KEY

  return { supabaseUrl, supabaseAnonKey }
}

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
  if (!supabaseUrl || !supabaseAnonKey) {
    // IMPORTANT: Don't throw during static prerender/build.
    // Vercel builds can run without env vars, and we only need to prevent crashes.
    // Auth/data fetching will fail later, but those codepaths are already wrapped.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[supabase] Missing env vars; using placeholder Supabase client.')
    }
    return createBrowserClient('https://invalid.supabase.co', 'invalid-anon-key')
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
