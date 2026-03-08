'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { APIError, getSchoolDetail } from '@/lib/api/school-analysis'
import type {
  MetricValue,
  MetricProvenance,
  SchoolDataStatus,
  SchoolDetail,
  SchoolLevel,
} from '@/types/school-analysis'

function provenanceLabel(provenance: MetricProvenance): string {
  return provenance === 'official' ? '공식' : '추정'
}

function MetricRow({ label, metric }: { label: string; metric: MetricValue }) {
  const displayValue =
    metric.value === null
      ? '-'
      : metric.unit === '%'
        ? `${metric.value.toFixed(1)}%`
        : metric.value.toFixed(1)

  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-[#4E5968]">{label}</span>
      <span className="font-medium text-[#191F28]">
        {displayValue}
        <span className="ml-2 rounded bg-[#F2F4F6] px-1.5 py-0.5 text-[10px] uppercase text-[#8B95A1]">
          {provenanceLabel(metric.provenance)}
        </span>
      </span>
    </div>
  )
}

function levelLabel(level: SchoolLevel): string {
  const map: Record<SchoolLevel, string> = {
    elementary: '초등학교',
    middle: '중학교',
    high: '고등학교',
    other: '기타',
  }
  return map[level] ?? level
}

function ProgressionSection({ school }: { school: SchoolDetail }) {
  const { school_level, progression } = school

  if (school_level === 'high') {
    return (
      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-[#191F28]">진학 지표</h2>
        <MetricRow
          label="대학 진학률"
          metric={progression.college_progression_rate}
        />
      </section>
    )
  }

  if (school_level === 'middle') {
    return (
      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-[#191F28]">
          고등학교 진학
        </h2>
        <MetricRow
          label="일반고 진학률"
          metric={progression.general_highschool_rate}
        />
      </section>
    )
  }

  // elementary or other: no meaningful progression data
  return null
}

const STATUS_BANNER: Record<
  SchoolDataStatus,
  { bg: string; border: string; text: string; label: string }
> = {
  official: {
    bg: 'bg-[#E8FAF0]',
    border: 'border-[#00C471]/20',
    text: 'text-[#059669]',
    label: '학교알리미 공식 데이터 연동',
  },
  name_mismatch: {
    bg: 'bg-[#FEF3C7]',
    border: 'border-[#F59E0B]/20',
    text: 'text-[#B45309]',
    label: '학교명 불일치로 추정 데이터 사용',
  },
  inactive: {
    bg: 'bg-[#F2F4F6]',
    border: 'border-[#8B95A1]/20',
    text: 'text-[#8B95A1]',
    label: '비활성 학교: 과거 데이터만 제공',
  },
}

function DataStatusBanner({
  status,
  officialReferenceYear,
  hasInferredCollegeProgression,
}: {
  status?: SchoolDataStatus
  officialReferenceYear?: number | null
  hasInferredCollegeProgression?: boolean
}) {
  if (!status) return null
  const cfg = STATUS_BANNER[status]

  const label =
    status === 'official'
      ? officialReferenceYear
        ? `학교알리미 공식 데이터 확인됨 (${officialReferenceYear}년 기준)`
        : '학교알리미 공식 데이터 확인됨 (최신)'
      : cfg.label

  const note =
    status === 'official' && hasInferredCollegeProgression
      ? ' · 대학 진학률은 추정치'
      : ''

  return (
    <div
      className={`mt-3 rounded-xl border ${cfg.border} ${cfg.bg} px-4 py-2.5`}
    >
      <p className={`text-xs font-medium ${cfg.text}`}>
        {label}
        {note}
      </p>
    </div>
  )
}

export default function SchoolDetailPage() {
  const params = useParams<{ schoolId: string }>()
  const schoolId = decodeURIComponent(params.schoolId)

  const [school, setSchool] = useState<SchoolDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await getSchoolDetail(schoolId)
        setSchool(response.school)
      } catch (err) {
        const message =
          err instanceof APIError
            ? err.message
            : '학교 상세 데이터를 불러오지 못했습니다.'
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    void run()
  }, [schoolId])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="h-10 w-10 animate-spin text-[#3182F6]" />
      </div>
    )
  }

  if (error || !school) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-5">
          <p className="text-sm text-[#B91C1C]">
            {error || '알 수 없는 오류가 발생했습니다.'}
          </p>
          <Link
            href={'/school-analysis' as never}
            className="mt-3 inline-block text-sm font-medium text-[#3182F6]"
          >
            학군 목록으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href={'/school-analysis' as never}
          className="text-sm font-medium text-[#3182F6]"
        >
          학군분석으로 돌아가기
        </Link>

        <header className="mt-3 rounded-2xl border border-[#E5E8EB] bg-white p-5">
          <h1 className="text-2xl font-bold text-[#191F28]">
            {school.school_name}
          </h1>
          <p className="mt-1 text-sm text-[#8B95A1]">
            {levelLabel(school.school_level)} | {school.district_name} |{' '}
            {school.address}
          </p>
          <p className="mt-2 text-xs text-[#8B95A1]">
            데이터 기준일 {new Date(school.data_freshness).toLocaleDateString()}
          </p>
          <DataStatusBanner
            status={school.data_status}
            officialReferenceYear={school.official_reference_year}
            hasInferredCollegeProgression={
              school.school_level === 'high' &&
              school.progression.college_progression_rate.provenance !==
                'official'
            }
          />
        </header>

        <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-start">
          <section className="rounded-2xl border border-[#E5E8EB] bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-[#191F28]">
              학교 품질
            </h2>
            <MetricRow label="종합" metric={school.quality.overall} />
            <MetricRow label="학업/성취" metric={school.quality.achievement} />
            <MetricRow
              label="진학 성과"
              metric={school.quality.progression_outcome}
            />
            <MetricRow
              label="교육환경"
              metric={school.quality.education_environment}
            />
            <MetricRow label="안전/생활" metric={school.quality.safety_life} />
          </section>

          <ProgressionSection school={school} />
        </div>
      </div>
    </div>
  )
}
