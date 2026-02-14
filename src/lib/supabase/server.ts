// @TASK P1-R1 - Supabase Server Client
// @SPEC .claude/constitutions/supabase/auth-integration.md

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * 서버 측 Supabase 클라이언트 생성
 * Next.js 14+ 호환 (async cookies)
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore
            .getAll()
            .map((c) => ({ name: c.name, value: c.value }))
        },
        setAll(
          cookiesToSet: {
            name: string
            value: string
            options: CookieOptions
          }[]
        ) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set({ name, value, ...options })
            }
          } catch {
            // The cookie store API throws when called from Server Components.
            // Middleware handles refresh; ignore here.
          }
        },
      },
      cookieEncoding: 'base64url',
    }
  )
}
