export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/app/api/_auth'
import { createClient } from '@/lib/supabase/server'
import { getSchoolAnalysisMode, schoolApiError } from '../../../_helpers'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function makeRawToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser()
  if ('response' in auth) return auth.response

  if (getSchoolAnalysisMode() !== 'open') {
    const payload = schoolApiError(
      'preview_only_mode',
      'School analysis detail is temporarily limited to preview mode.',
      409
    )
    return NextResponse.json(payload, { status: payload.status })
  }

  const { id: reportId } = await params
  if (!UUID_REGEX.test(reportId)) {
    return NextResponse.json({ error: 'invalid_report_id' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: report, error: reportError } = await supabase
    .from('school_analysis_reports')
    .select('id')
    .eq('id', reportId)
    .maybeSingle()

  if (reportError) {
    return NextResponse.json({ error: 'report_lookup_failed' }, { status: 500 })
  }
  if (!report?.id) {
    return NextResponse.json({ error: 'report_not_found' }, { status: 404 })
  }

  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString()

  let token = ''
  let insertError: { code?: string; message?: string } | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    token = makeRawToken()
    const { error } = await supabase
      .from('school_analysis_share_tokens')
      .insert({
        report_id: reportId,
        created_by: auth.userId,
        token_hash: hashToken(token),
        token_prefix: token.slice(0, 12),
        expires_at: expiresAt,
      })
    if (!error) {
      insertError = null
      break
    }
    insertError = error
    if (error.code !== '23505') {
      break
    }
  }

  if (insertError) {
    return NextResponse.json({ error: 'share_create_failed' }, { status: 500 })
  }

  const shareUrl = new URL(
    `/school-analysis/share/${token}`,
    request.url
  ).toString()

  return NextResponse.json({
    token,
    share_url: shareUrl,
    expires_at: expiresAt,
  })
}
