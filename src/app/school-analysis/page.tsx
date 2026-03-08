'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Loader2,
  RefreshCw,
  School,
  Search,
} from 'lucide-react'
import { APIError, getSchoolPreview } from '@/lib/api/school-analysis'
import type { SchoolDistrictSummary } from '@/types/school-analysis'

const PER_PAGE = 24

const SIDO_OPTIONS: { code: string; label: string }[] = [
  { code: '', label: '전체' },
  { code: '11', label: '서울' },
  { code: '41', label: '경기' },
  { code: '28', label: '인천' },
  { code: '26', label: '부산' },
  { code: '27', label: '대구' },
  { code: '29', label: '광주' },
  { code: '30', label: '대전' },
  { code: '31', label: '울산' },
  { code: '36', label: '세종' },
  { code: '51', label: '강원' },
  { code: '43', label: '충북' },
  { code: '44', label: '충남' },
  { code: '52', label: '전북' },
  { code: '46', label: '전남' },
  { code: '47', label: '경북' },
  { code: '48', label: '경남' },
  { code: '50', label: '제주' },
]

const SIDO_PRIORITY = new Map(
  SIDO_OPTIONS.filter((opt) => opt.code).map(
    (opt, idx) => [opt.code, idx] as const
  )
)

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-'
  return `${value.toFixed(1)}%`
}

function formatScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-'
  return `${value.toFixed(1)}점`
}

function formatMonthlyFee(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-'
  const inManwon = value / 10000
  return `${inManwon.toFixed(1)}만원/월`
}

function scoreBarWidth(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function formatSchoolComposition(item: SchoolDistrictSummary): string {
  const levels = item.insights.school_level_breakdown
  const known = levels.elementary + levels.middle + levels.high + levels.other
  if (item.school_count > 0 && known === 0) {
    return `${item.school_count}개 (구성 집계중)`
  }
  return `${item.school_count}개 (초${levels.elementary} · 중${levels.middle} · 고${levels.high})`
}

function formatAcademyFee(item: SchoolDistrictSummary): string {
  if (item.insights.academy_fee_reliability === 'low') {
    return '월비용 표본 부족'
  }
  return formatMonthlyFee(item.insights.academy_avg_monthly_fee)
}

function collegeRateLabel(item: SchoolDistrictSummary): string {
  return item.insights.college_progression_estimated
    ? '대학 진학률(추정)'
    : '대학 진학률'
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

export default function SchoolAnalysisPreviewPage() {
  const router = useRouter()
  const [allItems, setAllItems] = useState<SchoolDistrictSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSido, setSelectedSido] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [checkingAccessDistrict, setCheckingAccessDistrict] = useState<
    string | null
  >(null)

  const loadPreview = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await getSchoolPreview({ limit: 300 })
      setAllItems(response.items)
    } catch (err) {
      const message =
        err instanceof APIError
          ? err.message
          : '학군 프리뷰 데이터를 불러오지 못했습니다.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadPreview()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [selectedSido, searchQuery])

  const filtered = useMemo(() => {
    let result = allItems
    if (selectedSido) {
      result = result.filter((d) => d.district_code.startsWith(selectedSido))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        (d) =>
          d.district_name.toLowerCase().includes(q) ||
          d.district_code.includes(q)
      )
    }
    return [...result].sort((a, b) => {
      const aSido = a.district_code.slice(0, 2)
      const bSido = b.district_code.slice(0, 2)
      const aPriority = SIDO_PRIORITY.get(aSido) ?? Number.MAX_SAFE_INTEGER
      const bPriority = SIDO_PRIORITY.get(bSido) ?? Number.MAX_SAFE_INTEGER
      if (aPriority !== bPriority) return aPriority - bPriority

      const byName = a.district_name.localeCompare(b.district_name, 'ko-KR')
      if (byName !== 0) return byName
      return a.district_code.localeCompare(b.district_code)
    })
  }, [allItems, selectedSido, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const handleViewDetail = async (districtCode: string) => {
    if (checkingAccessDistrict) return
    setCheckingAccessDistrict(districtCode)
    try {
      const dailyRemaining = await getDailyCreditRemaining()
      if (dailyRemaining !== null && dailyRemaining <= 0) {
        window.alert(
          '일일 크레딧이 모두 소진되었습니다. 내일 초기화 후 다시 이용해 주세요.'
        )
        return
      }
      router.push(`/school-analysis/result?district=${districtCode}` as never)
    } finally {
      setCheckingAccessDistrict(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 rounded-2xl border border-[#DDE7F2] bg-white p-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#E6F0FF] px-3 py-1 text-xs font-semibold text-[#1B64DA]">
            <GraduationCap className="h-4 w-4" />
            School Analysis
          </div>
          <h1 className="text-2xl font-bold text-[#191F28]">학군분석</h1>
          <p className="mt-2 text-sm text-[#4E5968]">
            전국 {allItems.length > 0 ? `${allItems.length}개` : ''} 학군의 학교
            수준, 진학 경로, 학원 생태계를 비교해보세요.
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex flex-wrap gap-1.5">
            {SIDO_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                onClick={() => setSelectedSido(opt.code)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedSido === opt.code
                    ? 'bg-[#3182F6] text-white'
                    : 'border border-[#E5E8EB] bg-white text-[#4E5968] hover:border-[#3182F6]/30'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative sm:ml-auto sm:w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B95A1]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="학군명/코드 검색"
              className="w-full rounded-xl border border-[#E5E8EB] bg-white py-2 pl-9 pr-3 text-sm text-[#191F28] placeholder-[#8B95A1] outline-none focus:border-[#3182F6]"
            />
          </div>
        </div>

        {!isLoading && !error && (
          <p className="mb-4 text-xs text-[#8B95A1]">
            {filtered.length}개 학군
            {filtered.length !== allItems.length &&
              ` (전체 ${allItems.length}개 중)`}
          </p>
        )}

        {isLoading && (
          <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-[#E5E8EB] bg-white">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#3182F6]" />
              <p className="mt-3 text-sm text-[#8B95A1]">
                학군 데이터를 불러오는 중입니다...
              </p>
            </div>
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-6">
            <p className="text-sm text-[#B91C1C]">{error}</p>
            <button
              onClick={() => void loadPreview()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#FCA5A5] bg-white px-3 py-2 text-sm text-[#991B1B]"
            >
              <RefreshCw className="h-4 w-4" />
              다시 시도
            </button>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {paged.length === 0 ? (
              <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-[#E5E8EB] bg-white">
                <p className="text-sm text-[#8B95A1]">검색 결과가 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paged.map((item) => (
                  <article
                    key={item.district_code}
                    className="rounded-2xl border border-[#E5E8EB] bg-white p-5 transition-colors hover:border-[#3182F6]/30"
                  >
                    <h2 className="truncate text-base font-semibold text-[#191F28]">
                      {item.district_name}
                    </h2>

                    <div className="mt-4">
                      <div className="flex items-end justify-between gap-2">
                        <p className="text-xs font-medium text-[#6B7684]">
                          종합 점수
                        </p>
                        <p className="text-base font-bold text-[#191F28]">
                          {formatScore(item.overall_score.value)}
                        </p>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-[#EEF2F7]">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-[#2563EB] to-[#1D4ED8]"
                          style={{
                            width: `${scoreBarWidth(item.overall_score.value)}%`,
                          }}
                        />
                      </div>
                    </div>

                    <dl className="mt-4 space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="inline-flex items-center gap-1.5 text-[#6B7684]">
                          <BarChart3 className="h-3.5 w-3.5 text-[#3182F6]" />
                          {collegeRateLabel(item)}
                        </dt>
                        <dd className="font-semibold text-[#191F28]">
                          {formatPercent(
                            item.insights.college_progression_rate
                          )}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="inline-flex items-center gap-1.5 text-[#6B7684]">
                          <School className="h-3.5 w-3.5 text-[#0EA5E9]" />
                          학교 구성
                        </dt>
                        <dd className="text-right font-medium text-[#191F28]">
                          {formatSchoolComposition(item)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="inline-flex items-center gap-1.5 text-[#6B7684]">
                          <Building2 className="h-3.5 w-3.5 text-[#0F766E]" />
                          학원 생태계
                        </dt>
                        <dd className="text-right font-medium text-[#191F28]">
                          {item.insights.academy_count ?? '-'}개 ·{' '}
                          {formatAcademyFee(item)}
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-2 text-[11px] text-[#8B95A1]">
                      * 진학률/월비용은 추정·표본 기반이며 지역별 오차가 있을 수
                      있습니다.
                    </p>

                    <button
                      onClick={() => void handleViewDetail(item.district_code)}
                      disabled={checkingAccessDistrict === item.district_code}
                      className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#3182F6] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {checkingAccessDistrict === item.district_code ? (
                        <>
                          확인중...
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </>
                      ) : (
                        <>
                          상세 분석 보기
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </article>
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E8EB] bg-white text-[#4E5968] transition-colors hover:border-[#3182F6]/30 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    if (totalPages <= 7) return true
                    if (p === 1 || p === totalPages) return true
                    return Math.abs(p - page) <= 1
                  })
                  .reduce<(number | 'gap')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                      acc.push('gap')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((item, idx) =>
                    item === 'gap' ? (
                      <span
                        key={`gap-${idx}`}
                        className="px-1 text-xs text-[#8B95A1]"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setPage(item)}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                          page === item
                            ? 'bg-[#3182F6] text-white'
                            : 'border border-[#E5E8EB] bg-white text-[#4E5968] hover:border-[#3182F6]/30'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E8EB] bg-white text-[#4E5968] transition-colors hover:border-[#3182F6]/30 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
