import { createClient as createNeonClient } from '@neondatabase/neon-js'

let anonymousToken: { value: string; expiresAt: number } | null = null

export async function getAnonymousToken() {
  if (anonymousToken && anonymousToken.expiresAt > Date.now()) {
    return anonymousToken.value
  }
  const response = await fetch(
    `${process.env.NEON_AUTH_BASE_URL}/token/anonymous`,
    {
      cache: 'no-store',
    }
  )
  if (!response.ok) throw new Error('Neon anonymous authentication failed')
  const data = (await response.json()) as { token: string }
  if (!data.token) throw new Error('Neon did not return an anonymous token')
  anonymousToken = { value: data.token, expiresAt: Date.now() + 60_000 }
  return data.token
}

// Preserve the existing query interface until Neon schema types are generated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDatabaseClient<Database = any>(
  getToken = getAnonymousToken
) {
  return createNeonClient<Database>({
    dataApi: {
      url: process.env.NEXT_PUBLIC_NEON_DATA_API_URL!,
      getToken,
    },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DatabaseClient = ReturnType<typeof createDatabaseClient<any>>
