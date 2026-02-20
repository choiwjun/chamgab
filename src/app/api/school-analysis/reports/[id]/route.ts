export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SchoolAnalysisReport } from '@/types/school-analysis'
import { buildMockReport, normalizeDistrictCode } from '../../_helpers'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const districtCode = normalizeDistrictCode(
    request.nextUrl.searchParams.get('district_code') || undefined
  )

  if (UUID_REGEX.test(id)) {
    try {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('school_analysis_reports')
        .select('report_payload')
        .eq('id', id)
        .maybeSingle()

      if (!error && data?.report_payload) {
        return NextResponse.json({
          report: data.report_payload as SchoolAnalysisReport,
        })
      }
    } catch {
      // ignore and fallback to generated public report
    }
  }

  const report = buildMockReport({
    reportId: UUID_REGEX.test(id) ? id : undefined,
    userId: null,
    districtCode,
  })

  return NextResponse.json({ report })
}
