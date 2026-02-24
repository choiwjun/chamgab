import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/auth/admin'

export type AdminRole = 'viewer' | 'admin' | 'super_admin'

export type AdminContext = {
  userId: string
  email: string
  role: AdminRole
  bootstrap: boolean
}

export type AdminGateReason = 'unauthenticated' | 'forbidden'

export type AdminGateResult = {
  context: AdminContext | null
  reason: AdminGateReason | null
}

export async function getAdminGate(): Promise<AdminGateResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return { context: null, reason: 'unauthenticated' }
  }

  // Primary: DB-driven admin membership.
  const { data: membership } = await supabase
    .from('admin_users')
    .select('role,is_active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membership?.is_active) {
    return {
      context: {
        userId: user.id,
        email: user.email,
        role: (membership.role || 'admin') as AdminRole,
        bootstrap: false,
      },
      reason: null,
    }
  }

  // Bootstrap fallback: env allowlist.
  if (process.env.ADMIN_BOOTSTRAP === 'true' && isAdminEmail(user.email)) {
    return {
      context: {
        userId: user.id,
        email: user.email,
        role: 'super_admin',
        bootstrap: true,
      },
      reason: null,
    }
  }

  return { context: null, reason: 'forbidden' }
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const gate = await getAdminGate()
  return gate.context
}
