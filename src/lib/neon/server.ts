import 'server-only'

import { cookies, headers } from 'next/headers'
import type { User } from '@/lib/neon/types'
import { createDatabaseClient, getAnonymousToken } from './database'
import { createRequestAuth } from './request-auth'

type NeonUser = {
  id: string
  email: string
  name?: string | null
  image?: string | null
  emailVerified?: boolean
  createdAt?: string | Date
}

function mapError(error: { message?: string; code?: string } | null) {
  return error
    ? {
        message: error.message || 'Authentication failed',
        name: error.code || 'AUTH_ERROR',
      }
    : null
}

function mapUser(user: NeonUser | null | undefined): User | null {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {
      name: user.name,
      full_name: user.name,
      avatar_url: user.image,
    },
    created_at: new Date(user.createdAt || Date.now()).toISOString(),
    email_confirmed_at: user.emailVerified
      ? new Date(user.createdAt || Date.now()).toISOString()
      : undefined,
  }
}

export async function createClient() {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const auth = createRequestAuth({
    getCookies: () => cookieStore.toString(),
    getHeader: (name) => headerStore.get(name),
    getOrigin: () =>
      headerStore.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '',
    getFramework: () => 'nextjs',
    setCookie(name, value, options) {
      try {
        cookieStore.set(name, value, options)
      } catch {
        /* Server components cannot write cookies. */
      }
    },
  })
  const database = createDatabaseClient(async () => {
    const session = await auth.getSession()
    if (!session.data?.user) return getAnonymousToken()
    const result = await auth.token()
    if (result.error || !result.data?.token)
      throw new Error('Neon user token lookup failed')
    return result.data.token
  })
  const authCompat = {
    async getUser() {
      const result = await auth.getSession()
      return {
        data: { user: mapUser(result.data?.user) },
        error: mapError(result.error),
      }
    },
    async getSession() {
      const result = await auth.getSession()
      const user = mapUser(result.data?.user)
      const token = user ? await auth.token() : null
      return {
        data: {
          session: user
            ? { user, access_token: token?.data?.token || '' }
            : null,
        },
        error: mapError(result.error),
      }
    },
    async signInWithPassword(body: { email: string; password: string }) {
      const result = await auth.signIn.email(body)
      return {
        data: { user: mapUser(result.data?.user) },
        error: mapError(result.error),
      }
    },
    async signUp(body: {
      email: string
      password: string
      options?: { data?: { name?: string } }
    }) {
      const result = await auth.signUp.email({
        email: body.email,
        password: body.password,
        name: body.options?.data?.name || body.email.split('@')[0],
      })
      return {
        data: { user: mapUser(result.data?.user) },
        error: mapError(result.error),
      }
    },
    async signOut() {
      return auth.signOut()
    },
    async resetPasswordForEmail(
      email: string,
      options?: { redirectTo?: string }
    ) {
      return auth.requestPasswordReset({
        email,
        redirectTo: options?.redirectTo,
      })
    },
  }
  return Object.assign(database, { auth: authCompat })
}
