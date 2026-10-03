import {
  createClient as createNeonClient,
  SupabaseAuthAdapter,
} from '@neondatabase/neon-js'

export function createClient() {
  return createNeonClient({
    auth: {
      url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/neon/auth`,
      adapter: SupabaseAuthAdapter(),
      allowAnonymous: true,
    },
    dataApi: { url: process.env.NEXT_PUBLIC_NEON_DATA_API_URL! },
  })
}
