export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type { SchoolAnalysisReport } from '@/types/school-analysis'
import { createClient } from '@/lib/supabase/server'

function isTokenShapeValid(token: string): boolean {
  const trimmed = token.trim()
  if (trimmed.length < 24 || trimmed.length > 512) return false
  return /^[A-Za-z0-9._-]+$/.test(trimmed)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!isTokenShapeValid(token)) {
    return NextResponse.json({ error: 'invalid_share_token' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'get_school_analysis_shared_report',
    { p_token: token }
  )

  if (error) {
    return NextResponse.json(
      { error: 'failed_to_resolve_share_token' },
      { status: 500 }
    )
  }

  const row = Array.isArray(data) ? data[0] : null
  if (!row) {
    return NextResponse.json({ error: 'share_not_found' }, { status: 404 })
  }

  if (row.revoked_at || row.is_expired) {
    return NextResponse.json({ error: 'share_expired' }, { status: 410 })
  }

  if (!row.report_payload) {
    return NextResponse.json({ error: 'report_not_found' }, { status: 404 })
  }

  return NextResponse.json({
    report: row.report_payload as SchoolAnalysisReport,
    expires_at: row.expires_at || null,
  })
}
