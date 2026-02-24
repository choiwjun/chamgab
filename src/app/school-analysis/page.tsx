'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { APIError, getSchoolPreview } from '@/lib/api/school-analysis'
import type { SchoolDistrictSummary } from '@/types/school-analysis'

const PER_PAGE = 24

const SIDO_OPTIONS: { code: string; label: string }[] = [
  { code: '', label: '전체' },
  { code: '11', label: '서울' },
  { code: '26', label: '부산' },
  { code: '27', label: '대구' },
  { code: '28', label: '인천' },
  { code: '29', label: '광주' },
  { code: '30', label: '대전' },
  { code: '31', label: '울산' },
  { code: '36', label: '세종' },
  { code: '41', label: '경기' },
  { code: '51', label: '강원' },
  { code: '43', label: '충북' },
  { code: '44', label: '충남' },
  { code: '52', label: '전북' },
  { code: '46', label: '전남' },
  { code: '47', label: '경북' },
  { code: '48', label: '경남' },
  { code: '50', label: '제주' },
]

export default function SchoolAnalysisPreviewPage() {
  const router = useRouter()
  const [allItems, setAllItems] = useState<SchoolDistrictSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSido, setSelectedSido] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)

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
    return result
  }, [allItems, selectedSido, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

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
                    <h2 className="text-base font-semibold text-[#191F28]">
                      {item.district_name}
                    </h2>
                    <p className="mt-1 text-xs text-[#8B95A1]">
                      코드 {item.district_code}
                    </p>
                    <dl className="mt-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <dt className="text-[#8B95A1]">종합 점수</dt>
                        <dd className="font-semibold text-[#3182F6]">
                          {item.overall_score.value?.toFixed(1) ?? '-'}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-[#8B95A1]">신뢰도</dt>
                        <dd className="font-medium text-[#191F28]">
                          {item.confidence_score.toFixed(1)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-[#8B95A1]">학교 수</dt>
                        <dd className="font-medium text-[#191F28]">
                          {item.school_count}
                        </dd>
                      </div>
                    </dl>

                    <button
                      onClick={() =>
                        router.push(
                          `/school-analysis/result?district=${item.district_code}` as never
                        )
                      }
                      className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#3182F6]"
                    >
                      상세 분석 보기
                      <ArrowRight className="h-4 w-4" />
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
