export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditLog, requireAdmin } from '../_utils'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  if (gate.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('admin_users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data || [] })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  if (gate.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const email = (body?.email as string | undefined)?.trim().toLowerCase()
  const role = (body?.role as string | undefined) || 'admin'

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  if (!['viewer', 'admin', 'super_admin'].includes(role)) {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { data: profile, error: profErr } = await admin
      .from('user_profiles')
      .select('id,email')
      .eq('email', email)
      .single()

    if (profErr || !profile?.id) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('admin_users')
      .upsert({
        user_id: profile.id,
        role,
        is_active: true,
        created_by: gate.userId,
        note: body?.note || null,
      })
      .select('*')
      .single()

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    await auditLog({
      actorUserId: gate.userId,
      actorEmail: gate.email,
      action: 'admin.admin_users.upsert',
      targetTable: 'admin_users',
      targetId: profile.id,
      request: { email, role },
    })

    return NextResponse.json({ row: data })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  if (gate.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const userId = (body?.user_id as string | undefined)?.trim()
  const isActive = body?.is_active as boolean | undefined
  const role = body?.role as string | undefined

  if (!userId)
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof isActive === 'boolean') patch.is_active = isActive
  if (role) {
    if (!['viewer', 'admin', 'super_admin'].includes(role)) {
      return NextResponse.json({ error: 'invalid role' }, { status: 400 })
    }
    patch.role = role
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('admin_users')
      .update(patch)
      .eq('user_id', userId)
      .select('*')
      .single()

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    await auditLog({
      actorUserId: gate.userId,
      actorEmail: gate.email,
      action: 'admin.admin_users.update',
      targetTable: 'admin_users',
      targetId: userId,
      request: patch,
    })

    return NextResponse.json({ row: data })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
