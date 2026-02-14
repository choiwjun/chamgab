import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/auth/admin'

export type AdminRole = 'viewer' | 'admin' | 'super_admin'

export type AdminGate =
  | {
      ok: true
      userId: string
      email: string
      role: AdminRole
      bootstrap: boolean
    }
  | { ok: false; res: NextResponse }

function isUnsafeMethod(method: string) {
  const m = method.toUpperCase()
  return !(m === 'GET' || m === 'HEAD' || m === 'OPTIONS')
}

function isSameOrigin(req: NextRequest) {
  const expected = new URL(req.url).origin
  const origin = req.headers.get('origin')
  if (origin && origin === expected) return true
  const referer = req.headers.get('referer')
  if (referer && referer.startsWith(expected + '/')) return true

  // Modern browsers add this; if present and indicates cross-site, block.
  const sfs = req.headers.get('sec-fetch-site')
  if (sfs && sfs !== 'same-origin' && sfs !== 'same-site') return false

  return false
}

export async function requireAdmin(req: NextRequest): Promise<AdminGate> {
  // CSRF guard for state-changing requests.
  if (isUnsafeMethod(req.method) && !isSameOrigin(req)) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user || !user.email) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: membership } = await supabase
    .from('admin_users')
    .select('role,is_active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membership?.is_active) {
    return {
      ok: true,
      userId: user.id,
      email: user.email,
      role: (membership.role || 'admin') as AdminRole,
      bootstrap: false,
    }
  }

  // Bootstrap fallback (explicit opt-in).
  if (process.env.ADMIN_BOOTSTRAP === 'true' && isAdminEmail(user.email)) {
    return {
      ok: true,
      userId: user.id,
      email: user.email,
      role: 'super_admin',
      bootstrap: true,
    }
  }

  return {
    ok: false,
    res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  }
}

export async function auditLog(params: {
  actorUserId: string
  actorEmail: string
  action: string
  targetTable?: string
  targetId?: string
  request?: unknown
}) {
  try {
    const admin = createAdminClient()
    await admin.from('admin_audit_logs').insert({
      actor_user_id: params.actorUserId,
      actor_email: params.actorEmail,
      action: params.action,
      target_table: params.targetTable || null,
      target_id: params.targetId || null,
      request: params.request ?? {},
    })
  } catch {
    // Best-effort only: never block admin action on logging failure.
  }
}
