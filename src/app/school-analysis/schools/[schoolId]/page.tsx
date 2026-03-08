'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { APIError, getSchoolDetail } from '@/lib/api/school-analysis'
import type {
  MetricValue,
  SchoolDataStatus,
  SchoolDetail,
  SchoolLevel,
} from '@/types/school-analysis'

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
          {metric.provenance}
        </span>
      </span>
    </div>
  )
}

function levelLabel(level: SchoolLevel): string {
  const map: Record<SchoolLevel, string> = {
    elementary: 'Elementary',
    middle: 'Middle',
    high: 'High',
    other: 'Other',
  }
  return map[level] ?? level
}

function ProgressionSection({ school }: { school: SchoolDetail }) {
  const { school_level, progression } = school

  if (school_level === 'high') {
    return (
      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-[#191F28]">
          Progression
        </h2>
        <MetricRow
          label="College progression"
          metric={progression.college_progression_rate}
        />
      </section>
    )
  }

  if (school_level === 'middle') {
    return (
      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-[#191F28]">
          High school destination
        </h2>
        <MetricRow
          label="General high school"
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
    label: 'Official schoolinfo data linked',
  },
  name_mismatch: {
    bg: 'bg-[#FEF3C7]',
    border: 'border-[#F59E0B]/20',
    text: 'text-[#B45309]',
    label: 'Name mismatch: estimated data in use',
  },
  inactive: {
    bg: 'bg-[#F2F4F6]',
    border: 'border-[#8B95A1]/20',
    text: 'text-[#8B95A1]',
    label: 'Inactive school: historical data only',
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
        ? `Official schoolinfo data linked (${officialReferenceYear})`
        : 'Official schoolinfo data linked (latest)'
      : cfg.label

  const note =
    status === 'official' && hasInferredCollegeProgression
      ? ' (college progression is inferred)'
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
            : 'Failed to load school detail.'
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
          <p className="text-sm text-[#B91C1C]">{error || 'Unknown error'}</p>
          <Link
            href={'/school-analysis' as never}
            className="mt-3 inline-block text-sm font-medium text-[#3182F6]"
          >
            Back to school preview
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
          Back to school analysis
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
            data freshness{' '}
            {new Date(school.data_freshness).toLocaleDateString()}
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
              School quality
            </h2>
            <MetricRow label="Overall" metric={school.quality.overall} />
            <MetricRow
              label="Achievement"
              metric={school.quality.achievement}
            />
            <MetricRow
              label="Progression outcome"
              metric={school.quality.progression_outcome}
            />
            <MetricRow
              label="Education environment"
              metric={school.quality.education_environment}
            />
            <MetricRow
              label="Safety / life"
              metric={school.quality.safety_life}
            />
          </section>

          <ProgressionSection school={school} />
        </div>
      </div>
    </div>
  )
}
