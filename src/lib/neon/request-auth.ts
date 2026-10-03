import {
  createAuthServer,
  type RequestContext,
} from '@neondatabase/auth/server'

export function createRequestAuth(context: RequestContext) {
  return createAuthServer({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookieSecret: process.env.NEON_AUTH_COOKIE_SECRET!,
    context: () => context,
    sameSite: 'lax',
    sessionDataTtl: 60,
  })
}
