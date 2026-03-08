'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Download,
  GraduationCap,
  Loader2,
  Share2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  APIError,
  createSchoolReport,
  createShareToken,
} from '@/lib/api/school-analysis'
import type {
  MetricValue,
  SchoolAnalysisReport,
  SchoolReportResponse,
  SchoolLevel,
} from '@/types/school-analysis'
import { QualityGateNotice } from '@/components/ui/QualityGateNotice'

const LEVEL_LABEL: Record<SchoolLevel, string> = {
  elementary: '초등',
  middle: '중등',
  high: '고등',
  other: '기타',
}

const PIE_COLORS = ['#2563EB', '#7C3AED', '#0EA5E9', '#94A3B8']

function toNumber(metric: MetricValue | undefined): number | null {
  if (!metric) return null
  return metric.value === null ? null : metric.value
}

function formatMetric(
  metric: MetricValue | undefined,
  fallbackUnit = '점',
  digits = 1
): string {
  const value = toNumber(metric)
  if (value === null) return '-'

  if (metric?.unit === '%') return `${value.toFixed(digits)}%`
  if (metric?.unit === 'score') return `${value.toFixed(digits)}점`
  return `${value.toFixed(digits)}${fallbackUnit}`
}

function formatDate(value: string): string {
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return '-'
  return parsed.toLocaleDateString('ko-KR')
}

function progressWidth(value: number | null): string {
  if (value === null) return '0%'
  return `${Math.max(0, Math.min(100, value))}%`
}

async function getDailyCreditRemaining(): Promise<number | null> {
  try {
    const response = await fetch('/api/me/credits', { cache: 'no-store' })
    if (!response.ok) return null
    const data = (await response.json()) as {
      profile?: {
        daily_credit_used?: number | null
        daily_credit_limit?: number | null
        daily_credit_reset_at?: string | null
      } | null
    }

    const profile = data.profile
    if (!profile) return null

    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
    }).format(new Date())
    const used =
      !profile.daily_credit_reset_at || profile.daily_credit_reset_at < today
        ? 0
        : Number(profile.daily_credit_used ?? 0)
    const limit = Number(profile.daily_credit_limit ?? 0)
    return Math.max(0, limit - used)
  } catch {
    return null
  }
}

function InsightCard({
  title,
  body,
  toneClass,
  icon,
}: {
  title: string
  body: string
  toneClass: string
  icon: React.ReactNode
}) {
  return (
    <article className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/70">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-[#111827]">{title}</h3>
      <p className="mt-1 text-sm text-[#4B5563]">{body}</p>
    </article>
  )
}

function SchoolAnalysisResultContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const districtCode = searchParams.get('district') || '11680'

  const [report, setReport] = useState<SchoolAnalysisReport | null>(null)
  const [reportQuality, setReportQuality] = useState<
    Partial<SchoolReportResponse>
  >({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const dailyRemaining = await getDailyCreditRemaining()
        if (dailyRemaining !== null && dailyRemaining <= 0) {
          window.alert(
            '일일 크레딧이 모두 소진되었습니다. 내일 다시 이용해 주세요.'
          )
          router.replace('/school-analysis' as never)
          return
        }
        const response = await createSchoolReport({
          district_code: districtCode,
        })
        setReport(response.report)
        setReportQuality({
          quality_gate_status: response.quality_gate_status,
          quality_grade: response.quality_grade,
          quality_flags: response.quality_flags,
        })
      } catch (err) {
        if (err instanceof APIError) {
          if (err.code === 'preview_only_mode') {
            setError(
              '현재 학군분석 상세 리포트는 점검 중입니다. 잠시 후 다시 시도해 주세요.'
            )
          } else if (err.code === 'insufficient_credits') {
            setError(
              '요청이 많아 일시 제한되었거나 크레딧이 부족합니다. 잠시 후 다시 시도하거나 크레딧을 확인해 주세요.'
            )
          } else if (err.code === 'insufficient_official_data') {
            setError(
              '공식 데이터 커버리지가 낮아 상세 리포트를 생성할 수 없습니다.'
            )
          } else {
            setError(err.message)
          }
        } else {
          setError('학군 리포트 생성 중 오류가 발생했습니다.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void run()
  }, [districtCode, router])

  const title = useMemo(() => {
    if (!report) return '학군 상세 분석'
    return `${report.district_name} 상세 분석`
  }, [report])

  const radarData = useMemo(() => {
    if (!report) return []
    return [
      {
        name: '학업성취',
        value: toNumber(report.school_quality.achievement) ?? 0,
      },
      {
        name: '진학성과',
        value: toNumber(report.school_quality.progression_outcome) ?? 0,
      },
      {
        name: '교육환경',
        value: toNumber(report.school_quality.education_environment) ?? 0,
      },
      {
        name: '안전생활',
        value: toNumber(report.school_quality.safety_life) ?? 0,
      },
      {
        name: '프로그램',
        value: toNumber(report.school_quality.programs) ?? 0,
      },
    ]
  }, [report])

  const progressionData = useMemo(() => {
    if (!report) return []
    return [
      {
        label: '일반고',
        value: toNumber(report.progression.general_highschool_rate) ?? 0,
      },
      {
        label: '대학진학',
        value: toNumber(report.progression.college_progression_rate) ?? 0,
      },
    ]
  }, [report])

  const academyData = useMemo(() => {
    if (!report) return []
    return [
      {
        label: '밀집도',
        value: toNumber(report.academy_ecosystem.density) ?? 0,
      },
      {
        label: '과목 다양성',
        value: toNumber(report.academy_ecosystem.subject_diversity) ?? 0,
      },
      {
        label: '접근성',
        value: toNumber(report.academy_ecosystem.accessibility) ?? 0,
      },
      {
        label: '비용 적정성',
        value: toNumber(report.academy_ecosystem.fee_affordability) ?? 0,
      },
    ]
  }, [report])

  const levelDistribution = useMemo(() => {
    if (!report) return []
    const counts: Record<SchoolLevel, number> = {
      elementary: 0,
      middle: 0,
      high: 0,
      other: 0,
    }

    for (const school of report.schools) {
      const level = school.school_level
      counts[level] = (counts[level] || 0) + 1
    }

    return (Object.keys(counts) as SchoolLevel[])
      .map((level) => ({
        key: level,
        name: LEVEL_LABEL[level],
        value: counts[level],
      }))
      .filter((item) => item.value > 0)
  }, [report])

  const topSchools = useMemo(() => {
    if (!report) return []
    return [...report.schools]
      .filter((school) => school.overall_score.value !== null)
      .sort(
        (a, b) =>
          (b.overall_score.value as number) - (a.overall_score.value as number)
      )
      .slice(0, 12)
  }, [report])

  const collegeRateIsEstimated =
    report?.progression.college_progression_rate.provenance !== 'official'

  const insightTexts = useMemo(() => {
    if (!report) return []
    const college = toNumber(report.progression.college_progression_rate) ?? 0
    const academy = toNumber(report.academy_ecosystem.overall) ?? 0
    const safety = toNumber(report.commute_safety) ?? 0
    const schoolCount =
      report.data_quality?.total_schools ?? report.schools.length ?? 0

    return [
      college >= 65
        ? '대학 진학 성과가 우수한 편입니다.'
        : '대학 진학 성과는 보완 여지가 있습니다.',
      schoolCount >= 40
        ? '학교 수가 많아 학군 선택 폭이 넓은 편입니다.'
        : '학교 수가 적어 개별 학교 비교가 더 중요합니다.',
      academy >= 70
        ? '학원 생태계 접근성이 좋아 보조 학습 인프라가 충분합니다.'
        : '학원 생태계는 지역 내 편차를 확인할 필요가 있습니다.',
      safety >= 80
        ? '통학/안전 지표가 안정적인 구간입니다.'
        : '통학/안전 지표는 개별 학교별 추가 점검이 필요합니다.',
    ]
  }, [report])

  const handleShare = async () => {
    if (!report || isSharing) return
    setIsSharing(true)

    try {
      let shareUrl = window.location.href
      try {
        const response = await createShareToken(report.id, report.district_code)
        shareUrl = response.share_url
      } catch {
        // Fallback to current URL when token creation fails.
      }

      if (navigator.share) {
        await navigator.share({ title, url: shareUrl })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        window.alert('공유 링크가 복사되었습니다.')
      } else {
        window.prompt('아래 링크를 복사해 주세요.', shareUrl)
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        window.alert('공유 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
      }
    } finally {
      setIsSharing(false)
    }
  }

  const handleSavePdf = () => {
    if (typeof window === 'undefined') return
    window.print()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#2563EB]" />
          <p className="mt-3 text-sm text-[#6B7280]">
            학군 상세 리포트를 생성하는 중입니다...
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
            리포트를 생성하지 못했습니다
          </h1>
          <p className="mt-2 text-sm text-[#B91C1C]">
            {error || '알 수 없는 오류가 발생했습니다.'}
          </p>
          <button
            onClick={() => router.push('/school-analysis' as never)}
            className="mt-4 rounded-lg border border-[#FCA5A5] bg-white px-4 py-2 text-sm text-[#991B1B]"
          >
            학군 목록으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  const totalSchools =
    report.data_quality?.total_schools ?? report.schools.length

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#111827]">{title}</h1>
            <p className="mt-1 text-sm text-[#6B7280]">
              데이터 기준일 {formatDate(report.data_freshness)} | 신뢰도{' '}
              {report.confidence_score.toFixed(1)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              disabled={isSharing}
              className="inline-flex items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] disabled:opacity-60"
            >
              <Share2 className="h-4 w-4" />
              공유
            </button>
            <button
              onClick={handleSavePdf}
              className="inline-flex items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827]"
            >
              <Download className="h-4 w-4" />
              PDF 저장
            </button>
          </div>
        </header>

        <QualityGateNotice
          status={reportQuality.quality_gate_status}
          grade={reportQuality.quality_grade}
          flags={reportQuality.quality_flags}
        />

        <section className="rounded-2xl border border-[#DBEAFE] bg-gradient-to-br from-[#EFF6FF] to-white p-6">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="text-sm font-semibold text-[#1D4ED8]">종합 점수</p>
              <p className="mt-2 text-5xl font-bold text-[#0F172A]">
                {formatMetric(report.overall_score)}
              </p>
              <p className="mt-2 text-xs text-[#6B7280]">
                confidence formula {report.confidence_breakdown.formula_version}
              </p>

              <div className="mt-5">
                <div className="mb-1 flex items-center justify-between text-xs text-[#64748B]">
                  <span>학군 경쟁력</span>
                  <span>{formatMetric(report.overall_score)}</span>
                </div>
                <div className="h-2 rounded-full bg-[#DBEAFE]">
                  <div
                    className="h-2 rounded-full bg-[#2563EB]"
                    style={{
                      width: progressWidth(toNumber(report.overall_score)),
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-xl border border-[#E5E7EB] bg-white p-4">
                <p className="text-xs text-[#6B7280]">
                  {collegeRateIsEstimated ? '대학 진학률(추정)' : '대학 진학률'}
                </p>
                <p className="mt-1 text-2xl font-bold text-[#111827]">
                  {formatMetric(
                    report.progression.college_progression_rate,
                    '%'
                  )}
                </p>
              </article>
              <article className="rounded-xl border border-[#E5E7EB] bg-white p-4">
                <p className="text-xs text-[#6B7280]">통학·안전 점수</p>
                <p className="mt-1 text-2xl font-bold text-[#111827]">
                  {formatMetric(report.commute_safety)}
                </p>
              </article>
              <article className="rounded-xl border border-[#E5E7EB] bg-white p-4">
                <p className="text-xs text-[#6B7280]">학교 수</p>
                <p className="mt-1 text-2xl font-bold text-[#111827]">
                  {totalSchools.toLocaleString()}개
                </p>
              </article>
              <article className="rounded-xl border border-[#E5E7EB] bg-white p-4">
                <p className="text-xs text-[#6B7280]">학원 생태계 점수</p>
                <p className="mt-1 text-2xl font-bold text-[#111827]">
                  {formatMetric(report.academy_ecosystem.overall)}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <h2 className="text-lg font-semibold text-[#111827]">
              학교 품질 레이더
            </h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              학업·진학·환경·안전·프로그램을 100점 기준으로 비교합니다.
            </p>
            <div className="mt-4 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <Radar
                    name="점수"
                    dataKey="value"
                    stroke="#2563EB"
                    fill="#3B82F6"
                    fillOpacity={0.35}
                  />
                  <Tooltip
                    formatter={(value: number) =>
                      `${Number(value).toFixed(1)}점`
                    }
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <h2 className="text-lg font-semibold text-[#111827]">
              진학 경로 분포
            </h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              현재 학군의 주요 진학 경로를
              {collegeRateIsEstimated ? ' 추정 비율' : ' 공식+추정 혼합 비율'}로
              보여줍니다.
            </p>
            <div className="mt-4 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progressionData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${v}%`} width={40} />
                  <Tooltip
                    formatter={(v: number) => `${Number(v).toFixed(1)}%`}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {progressionData.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={idx === 3 ? '#2563EB' : '#93C5FD'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <h2 className="text-lg font-semibold text-[#111827]">
              학원 생태계 세부 지표
            </h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              밀집도, 다양성, 접근성, 비용 적정성을 점수화했습니다.
            </p>
            <div className="mt-4 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={academyData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    width={80}
                  />
                  <Tooltip
                    formatter={(v: number) => `${Number(v).toFixed(1)}점`}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#14B8A6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <h2 className="text-lg font-semibold text-[#111827]">
              학교급 분포
            </h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              이 학군에 포함된 학교의 급별 구성입니다.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px] md:items-center">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={levelDistribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={92}
                      paddingAngle={2}
                    >
                      {levelDistribution.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={PIE_COLORS[idx % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${v}개`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {levelDistribution.map((item, idx) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between rounded-lg border border-[#E5E7EB] px-3 py-2"
                  >
                    <span className="inline-flex items-center gap-2 text-sm text-[#374151]">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: PIE_COLORS[idx % PIE_COLORS.length],
                        }}
                      />
                      {item.name}
                    </span>
                    <span className="text-sm font-semibold text-[#111827]">
                      {item.value}개
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InsightCard
            title="진학 인사이트"
            body={insightTexts[0] || '-'}
            toneClass="border-[#DBEAFE] bg-[#EFF6FF]"
            icon={<GraduationCap className="h-4 w-4 text-[#2563EB]" />}
          />
          <InsightCard
            title="학교 구성"
            body={insightTexts[1] || '-'}
            toneClass="border-[#EDE9FE] bg-[#F5F3FF]"
            icon={<GraduationCap className="h-4 w-4 text-[#7C3AED]" />}
          />
          <InsightCard
            title="보조 학습 인프라"
            body={insightTexts[2] || '-'}
            toneClass="border-[#CCFBF1] bg-[#F0FDFA]"
            icon={<Sparkles className="h-4 w-4 text-[#0F766E]" />}
          />
          <InsightCard
            title="통학/안전"
            body={insightTexts[3] || '-'}
            toneClass="border-[#DCFCE7] bg-[#F0FDF4]"
            icon={<ShieldCheck className="h-4 w-4 text-[#166534]" />}
          />
        </section>

        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#111827]">
              학교 랭킹 TOP 12
            </h2>
            <p className="text-xs text-[#6B7280]">
              점수 클릭 시 학교 상세 페이지로 이동합니다.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {topSchools.map((school, index) => {
              const score = school.overall_score.value
              return (
                <Link
                  key={school.school_id}
                  href={
                    `/school-analysis/schools/${encodeURIComponent(school.school_id)}` as never
                  }
                  className="rounded-xl border border-[#E5E7EB] p-3 transition-colors hover:border-[#93C5FD]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#111827]">
                      {index + 1}. {school.school_name}
                    </p>
                    <span className="text-sm font-bold text-[#2563EB]">
                      {score !== null ? `${score.toFixed(1)}점` : '-'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#8B95A1]">
                    {LEVEL_LABEL[school.school_level] || '기타'}
                  </p>
                  <div className="mt-2 h-1.5 rounded-full bg-[#EEF2FF]">
                    <div
                      className="h-1.5 rounded-full bg-[#3B82F6]"
                      style={{ width: progressWidth(score) }}
                    />
                  </div>
                </Link>
              )
            })}
            {topSchools.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#CBD5E1] p-4 text-sm text-[#64748B]">
                표시할 학교 점수가 없습니다.
              </div>
            )}
          </div>
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
          <Loader2 className="h-10 w-10 animate-spin text-[#2563EB]" />
        </div>
      }
    >
      <SchoolAnalysisResultContent />
    </Suspense>
  )
}
