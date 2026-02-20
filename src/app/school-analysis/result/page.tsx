'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Download, Loader2, Share2 } from 'lucide-react'
import {
  APIError,
  createSchoolReport,
  createShareToken,
} from '@/lib/api/school-analysis'
import type {
  MetricValue,
  SchoolAnalysisReport,
  SchoolDataStatus,
} from '@/types/school-analysis'

function MetricRow({ label, metric }: { label: string; metric: MetricValue }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-[#4B5563]">{label}</span>
      <span className="font-medium text-[#111827]">
        {metric.value === null ? '-' : metric.value.toFixed(1)}
        {metric.unit === '%' ? '%' : ''}
        <span className="ml-2 rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#4338CA]">
          {metric.provenance}
        </span>
      </span>
    </div>
  )
}

const STATUS_CONFIG: Record<
  SchoolDataStatus,
  { label: string; bg: string; text: string }
> = {
  official: { label: '공식', bg: 'bg-[#E8FAF0]', text: 'text-[#00C471]' },
  name_mismatch: { label: '추정', bg: 'bg-[#FEF3C7]', text: 'text-[#D97706]' },
  inactive: { label: '폐교', bg: 'bg-[#F2F4F6]', text: 'text-[#8B95A1]' },
}

function DataStatusBadge({ status }: { status?: SchoolDataStatus }) {
  if (!status) return null
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  )
}

function DataQualityCard({ report }: { report: SchoolAnalysisReport }) {
  const dq = report.data_quality
  if (!dq) return null

  return (
    <section className="mb-4 rounded-2xl border border-[#E5E8EB] bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-[#191F28]">데이터 품질</h2>

      {/* Coverage progress bar */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-[#4E5968]">공식 데이터 커버리지</span>
          <span className="font-semibold text-[#191F28]">
            {dq.coverage_rate.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#F2F4F6]">
          <div
            className="h-full rounded-full bg-[#3182F6] transition-all"
            style={{ width: `${Math.min(dq.coverage_rate, 100)}%` }}
          />
        </div>
      </div>

      {/* Status breakdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#00C471]" />
            <span className="text-[#4E5968]">공식 데이터 확인</span>
          </div>
          <span className="font-medium text-[#191F28]">
            {dq.official_count}개교
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#F59E0B]" />
            <span className="text-[#4E5968]">학교명 불일치</span>
          </div>
          <span className="font-medium text-[#191F28]">
            {dq.name_mismatch_count}개교
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#8B95A1]" />
            <span className="text-[#4E5968]">폐교/비활성</span>
          </div>
          <span className="font-medium text-[#191F28]">
            {dq.inactive_count}개교
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[#8B95A1]">
        학교알리미 API에서 학교명이 일치하지 않는 학교는 추정 데이터를
        사용합니다.
      </p>
    </section>
  )
}

function SchoolAnalysisResultContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const districtCode = searchParams.get('district') || '11680'

  const [report, setReport] = useState<SchoolAnalysisReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await createSchoolReport({
          district_code: districtCode,
        })
        setReport(response.report)
      } catch (err) {
        const message =
          err instanceof APIError
            ? err.message
            : 'Failed to create school report.'
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    void run()
  }, [districtCode])

  const title = useMemo(() => {
    if (!report) return '학군 상세 분석'
    return `${report.district_name} 상세 분석`
  }, [report])

  const handleShare = async () => {
    if (!report || isSharing) return
    setIsSharing(true)

    try {
      const response = await createShareToken(report.id, report.district_code)
      if (navigator.share) {
        await navigator.share({
          title,
          url: response.share_url,
        })
      } else {
        await navigator.clipboard.writeText(response.share_url)
        window.alert('공유 링크가 복사되었습니다.')
      }
    } catch {
      // no-op
    } finally {
      setIsSharing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#2563EB]" />
          <p className="mt-3 text-sm text-[#6B7280]">
            상세 리포트를 생성 중입니다.
          </p>
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14">
        <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-6">
          <h1 className="text-lg font-semibold text-[#991B1B]">
            리포트를 생성하지 못했습니다.
          </h1>
          <p className="mt-2 text-sm text-[#B91C1C]">
            {error || 'Unknown error'}
          </p>
          <button
            onClick={() => router.push('/school-analysis' as never)}
            className="mt-4 rounded-lg border border-[#FCA5A5] bg-white px-4 py-2 text-sm text-[#991B1B]"
          >
            프리뷰로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#111827]">{title}</h1>
            <p className="mt-1 text-sm text-[#6B7280]">
              freshness {new Date(report.data_freshness).toLocaleDateString()} |
              confidence {report.confidence_score.toFixed(1)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              disabled={isSharing}
              className="inline-flex items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827]"
            >
              <Share2 className="h-4 w-4" />
              공유
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827]"
            >
              <Download className="h-4 w-4" />
              PDF 저장
            </button>
          </div>
        </div>

        <section className="mb-4 rounded-2xl border border-[#DBEAFE] bg-white p-6">
          <h2 className="text-sm font-semibold text-[#1D4ED8]">종합 점수</h2>
          <p className="mt-2 text-4xl font-bold text-[#1E3A8A]">
            {report.overall_score.value?.toFixed(1)}
          </p>
          <p className="mt-2 text-xs text-[#6B7280]">
            공식 지표 + 추정 지표 혼합 산식 (
            {report.confidence_breakdown.formula_version})
          </p>
        </section>

        <DataQualityCard report={report} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-[#111827]">
              학교 품질
            </h3>
            <MetricRow label="종합" metric={report.school_quality.overall} />
            <MetricRow
              label="학업/성취"
              metric={report.school_quality.achievement}
            />
            <MetricRow
              label="진학 성과"
              metric={report.school_quality.progression_outcome}
            />
            <MetricRow
              label="교육환경"
              metric={report.school_quality.education_environment}
            />
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-[#111827]">
              진학 경로
            </h3>
            <MetricRow
              label="일반고 비율"
              metric={report.progression.general_highschool_rate}
            />
            <MetricRow
              label="특목/자사 비율"
              metric={report.progression.special_purpose_highschool_rate}
            />
            <MetricRow
              label="자율고 비율"
              metric={report.progression.autonomy_highschool_rate}
            />
            <MetricRow
              label="대학 진학률"
              metric={report.progression.college_progression_rate}
            />
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-[#111827]">
              학원 생태계
            </h3>
            <MetricRow label="종합" metric={report.academy_ecosystem.overall} />
            <MetricRow
              label="밀집도"
              metric={report.academy_ecosystem.density}
            />
            <MetricRow
              label="과목 다양성"
              metric={report.academy_ecosystem.subject_diversity}
            />
            <MetricRow
              label="비용 적정성"
              metric={report.academy_ecosystem.fee_affordability}
            />
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-[#111827]">
              통학/안전
            </h3>
            <MetricRow label="통학/안전 점수" metric={report.commute_safety} />
            <MetricRow
              label="공식 신뢰도"
              metric={report.school_quality.overall}
            />
            <MetricRow
              label="추정 신뢰도"
              metric={report.academy_ecosystem.overall}
            />
          </section>
        </div>

        <section className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#111827]">
            대상 학교
          </h3>
          <ul className="space-y-2">
            {report.schools.map((school) => (
              <li
                key={school.school_id}
                className="flex items-center justify-between rounded-lg border border-[#F3F4F6] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-sm font-medium text-[#111827]">
                      {school.school_name}
                    </p>
                    <p className="text-xs text-[#6B7280]">
                      {school.school_level}
                    </p>
                  </div>
                  <DataStatusBadge status={school.data_status} />
                </div>
                <Link
                  href={
                    `/school-analysis/schools/${encodeURIComponent(school.school_id)}` as never
                  }
                  className="text-sm font-medium text-[#1D4ED8]"
                >
                  학교 상세
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export default function SchoolAnalysisResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
          <div className="text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#2563EB]" />
            <p className="mt-3 text-sm text-[#6B7280]">
              상세 리포트를 불러오는 중입니다.
            </p>
          </div>
        </div>
      }
    >
      <SchoolAnalysisResultContent />
    </Suspense>
  )
}
