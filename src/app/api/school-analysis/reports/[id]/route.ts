export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireApiUser } from '@/app/api/_auth'
import { createClient } from '@/lib/supabase/server'
import type { SchoolAnalysisReport } from '@/types/school-analysis'
import { getSchoolAnalysisMode, schoolApiError } from '../../_helpers'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SCHOOL_QUALITY_VERSION =
  process.env.SCHOOL_QUALITY_VERSION || 'school-quality-v1'

type QualityGateStatus = 'pass' | 'warn' | 'fail'
type QualityGrade = 'A' | 'B' | 'C' | 'D'

function isRecent(ts: string | null | undefined, maxDays: number): boolean {
  if (!ts) return false
  const parsed = Date.parse(ts)
  if (!Number.isFinite(parsed)) return false
  const ageMs = Date.now() - parsed
  return ageMs <= maxDays * 24 * 60 * 60 * 1000
}

function deriveSchoolQualityMeta(report: SchoolAnalysisReport): {
  quality_gate_status: QualityGateStatus
  quality_grade: QualityGrade
  quality_flags: string[]
  quality_version: string
  data_freshness: string | null
} {
  const coverageRaw =
    report.data_quality?.coverage_rate ??
    report.confidence_breakdown.official_confidence
  const inferredRatio = Math.max(0, 100 - (coverageRaw ?? 0))
  const flags: string[] = []

  if ((coverageRaw ?? 0) < 95) flags.push('insufficient_official_data')
  if (inferredRatio > 20) flags.push('high_inferred_ratio')
  if (!isRecent(report.data_freshness, 45)) flags.push('stale_data')
  if (report.confidence_score < 70) flags.push('low_confidence')

  const hasFail = (coverageRaw ?? 0) < 80 || report.confidence_score < 55
  const quality_gate_status: QualityGateStatus = hasFail
    ? 'fail'
    : flags.length > 0
      ? 'warn'
      : 'pass'

  const quality_grade: QualityGrade =
    quality_gate_status === 'fail'
      ? 'D'
      : quality_gate_status === 'warn'
        ? 'C'
        : report.confidence_score >= 85
          ? 'A'
          : 'B'

  return {
    quality_gate_status,
    quality_grade,
    quality_flags: flags,
    quality_version: SCHOOL_QUALITY_VERSION,
    data_freshness: report.data_freshness || null,
  }
}

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

    const report = data.report_payload as SchoolAnalysisReport
    return NextResponse.json({
      report,
      ...deriveSchoolQualityMeta(report),
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
