export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireApiUser } from '@/app/api/_auth'
import { createClient } from '@/lib/supabase/server'
import type { SchoolAnalysisReport } from '@/types/school-analysis'
import { getSchoolAnalysisMode, schoolApiError } from '../../_helpers'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  _request: Request,
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

  const { id } = await params
  if (!UUID_REGEX.test(id)) {
    const payload = schoolApiError('invalid_request', 'Invalid report id.', 400)
    return NextResponse.json(payload, { status: payload.status })
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('school_analysis_reports')
      .select('report_payload')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      const payload = schoolApiError(
        'pipeline_unavailable',
        `Failed to load report: ${error.message}`,
        503
      )
      return NextResponse.json(payload, { status: payload.status })
    }

    if (!data?.report_payload) {
      const payload = schoolApiError(
        'report_not_found',
        'Report not found.',
        404
      )
      return NextResponse.json(payload, { status: payload.status })
    }

    return NextResponse.json({
      report: data.report_payload as SchoolAnalysisReport,
    })
  } catch {
    const payload = schoolApiError(
      'pipeline_unavailable',
      'Failed to load report.',
      503
    )
    return NextResponse.json(payload, { status: payload.status })
  }
}
