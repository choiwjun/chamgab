import { handleAuthProxyRequest } from '@neondatabase/auth/server'

export const dynamic = 'force-dynamic'

async function handler(
  request: Request,
  context: { params: { path: string[] } }
) {
  return handleAuthProxyRequest({
    request,
    path: context.params.path.join('/'),
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookieSecret: process.env.NEON_AUTH_COOKIE_SECRET!,
    sameSite: 'lax',
    sessionDataTtl: 60,
  })
}

export { handler as GET, handler as POST }
