export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type { SchoolAnalysisReport } from '@/types/school-analysis'
import { createClient } from '@/lib/supabase/server'
import { buildMockReport, readPublicShareToken } from '../../_helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const publicShare = readPublicShareToken(token)
  if (publicShare) {
    const report = buildMockReport({
      userId: null,
      districtCode: publicShare.district_code,
    })

    return NextResponse.json({
      report: report as SchoolAnalysisReport,
      expires_at: publicShare.expires_at,
    })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'get_school_analysis_shared_report',
    { p_token: token }
  )

  if (error) {
    return NextResponse.json(
      { error: 'failed_to_resolve_share_token', detail: error.message },
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
