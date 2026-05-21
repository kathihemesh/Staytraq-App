import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLIC_ANON_KEY

  return { supabaseUrl, supabaseAnonKey }
}

export async function createClient() {
  const cookieStore = await cookies()

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
  const url = supabaseUrl ?? 'https://invalid.supabase.co'
  const anonKey = supabaseAnonKey ?? 'invalid-anon-key'

  if (!supabaseUrl || !supabaseAnonKey) {
    // IMPORTANT: Don't throw during static prerender/build.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[supabase] Missing env vars; using placeholder server client.')
    }
  }

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // The "setAll" method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  )
}
