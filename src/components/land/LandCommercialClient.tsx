'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import {
  ArrowLeft,
  BarChart3,
  MapPin,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react'
import { formatNumber } from '@/lib/format'

interface LandCommercialResponse {
  pnu: string
  parcel: {
    pnu: string
    sido: string
    sigungu: string
    eupmyeondong: string | null
    jibun: string | null
    land_category: string | null
    zoning: string | null
    area_m2: number | null
  }
  district: {
    code: string
    name: string
  } | null
  commercial_score: number
  regulatory_gate?: {
    status: 'pass' | 'hold'
    reasons: string[]
    requires_verification: boolean
  }
  land_context: {
    suitability_score: number
    factors: string[]
  }
  recommended_industries: Array<{
    industry_code: string
    industry_name: string
    success_probability: number
    district_match_score: number
    land_adjustment: number
    expected_monthly_sales: number
    reasons: string[]
  }>
  foot_traffic: {
    daily_avg: number
    peak_time: string
    weekend_ratio: number
    demographics: Array<{
      age_group: string
      percentage: number
    }>
  }
  competition: {
    density_score: number
    top_industries: Array<{
      industry_name: string
      count: number
    }>
  }
  insights: string[]
  analyzed_at: string
}

interface LandCommercialClientProps {
  pnu: string
}

function scoreTone(score: number) {
  if (score >= 75) return 'text-[#00C471]'
  if (score >= 60) return 'text-[#2F80ED]'
  return 'text-[#F59E0B]'
}

export function LandCommercialClient({ pnu }: LandCommercialClientProps) {
  const [result, setResult] = useState<LandCommercialResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch(
          `/api/land/${encodeURIComponent(pnu)}/commercial`,
          { cache: 'no-store' }
        )

        if (!response.ok) {
          let message = '토지 상권 분석 결과를 불러오지 못했습니다.'
          try {
            const payload = (await response.json()) as {
              error?: string
              detail?: string
            }
            message = payload.error || payload.detail || message
          } catch {
            // ignore parse error
          }
          throw new Error(message)
        }

        const payload = (await response.json()) as LandCommercialResponse
        if (!cancelled) {
          setResult(payload)
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : '토지 상권 분석 결과를 불러오지 못했습니다.'
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [pnu])

  const address = useMemo(() => {
    if (!result) return ''
    const parts = [
      result.parcel.sido,
      result.parcel.sigungu,
      result.parcel.eupmyeondong || '',
      result.parcel.jibun || '',
    ]
    return parts.filter(Boolean).join(' ')
  }, [result])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-[#8B95A1]">
          토지 기반 상권 분석 중입니다...
        </p>
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href={`/land/${encodeURIComponent(pnu)}` as Route}
          className="inline-flex items-center gap-2 text-sm text-[#8B95A1] hover:text-[#191F28]"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          토지 상세로 돌아가기
        </Link>
        <div className="mt-6 rounded-2xl border border-[#F5D0D5] bg-[#FFF5F6] p-5">
          <p className="text-sm font-semibold text-[#B42318]">
            분석을 불러오지 못했습니다.
          </p>
          <p className="mt-1 text-sm text-[#B42318]">{error}</p>
        </div>
      </div>
    )
  }

  const top = result.recommended_industries[0]

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href={`/land/${encodeURIComponent(pnu)}` as Route}
        className="inline-flex items-center gap-2 text-sm text-[#8B95A1] hover:text-[#191F28]"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        토지 상세로 돌아가기
      </Link>

      <div className="mt-5 rounded-2xl border border-[#E5E8EB] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#F59E0B]" />
              <h1 className="text-2xl font-bold text-[#191F28]">
                토지 기반 상권 분석
              </h1>
            </div>
            <p className="mt-2 text-sm text-[#4E5968]">{address}</p>
            {result.district && (
              <p className="mt-1 text-xs text-[#8B95A1]">
                상권 매핑: {result.district.name} ({result.district.code})
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-[#8B95A1]">상업 입지 점수</p>
            <p
              className={`text-3xl font-bold ${scoreTone(result.commercial_score)}`}
            >
              {result.commercial_score}
              <span className="text-lg text-[#8B95A1]">/100</span>
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <div className="flex items-center gap-2 text-xs text-[#8B95A1]">
              <Store className="h-3 w-3" />
              토지 적합도
            </div>
            <p className="mt-1 text-sm font-semibold text-[#191F28]">
              {result.land_context.suitability_score}점
            </p>
          </div>
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <div className="flex items-center gap-2 text-xs text-[#8B95A1]">
              <Users className="h-3 w-3" />
              일평균 유동인구
            </div>
            <p className="mt-1 text-sm font-semibold text-[#191F28]">
              {formatNumber(result.foot_traffic.daily_avg)}명
            </p>
          </div>
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <div className="flex items-center gap-2 text-xs text-[#8B95A1]">
              <BarChart3 className="h-3 w-3" />
              경쟁 밀도
            </div>
            <p className="mt-1 text-sm font-semibold text-[#191F28]">
              {result.competition.density_score}점
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[#E5E8EB] bg-white p-6">
        <h2 className="text-lg font-bold text-[#191F28]">추천 업종 Top 5</h2>
        <p className="mt-1 text-sm text-[#8B95A1]">
          같은 상권 데이터에 토지 조건(지목/용도/면적)을 반영한 결과입니다.
        </p>

        <div className="mt-4 space-y-3">
          {result.recommended_industries.length === 0 && (
            <div className="rounded-xl border border-[#F5D0D5] bg-[#FFF5F6] p-4">
              <p className="text-sm font-semibold text-[#B42318]">
                업종 추천 보류
              </p>
              <p className="mt-1 text-sm text-[#B42318]">
                {result.regulatory_gate?.reasons?.[0] ||
                  '법적 인허가 가능 여부 확인 전에는 자동 추천을 제공하지 않습니다.'}
              </p>
            </div>
          )}
          {result.recommended_industries.map((item, index) => (
            <div
              key={`${item.industry_code}-${index}`}
              className="rounded-xl border border-[#E5E8EB] bg-[#FCFCFD] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#191F28]">
                  {index + 1}. {item.industry_name}
                </p>
                <p
                  className={`text-sm font-bold ${scoreTone(item.success_probability)}`}
                >
                  성공확률 {item.success_probability}%
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#8B95A1]">
                <span>상권 일치도 {item.district_match_score}</span>
                <span>
                  토지 보정{' '}
                  {item.land_adjustment > 0
                    ? `+${item.land_adjustment}`
                    : item.land_adjustment}
                </span>
                <span>
                  예상 월매출 {formatNumber(item.expected_monthly_sales)}원
                </span>
              </div>
              {item.reasons.length > 0 && (
                <p className="mt-2 text-xs text-[#4E5968]">
                  {item.reasons.join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-[#E5E8EB] bg-white p-6">
          <h2 className="text-lg font-bold text-[#191F28]">유동인구 요약</h2>
          <p className="mt-2 text-sm text-[#4E5968]">
            피크 시간대: {result.foot_traffic.peak_time}
          </p>
          <p className="mt-1 text-sm text-[#4E5968]">
            주말 비중: {Math.round(result.foot_traffic.weekend_ratio * 100)}%
          </p>
          <div className="mt-3 space-y-1">
            {result.foot_traffic.demographics.map((row) => (
              <p key={row.age_group} className="text-xs text-[#8B95A1]">
                {row.age_group}: {row.percentage}%
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[#E5E8EB] bg-white p-6">
          <h2 className="text-lg font-bold text-[#191F28]">경쟁 업종 분포</h2>
          <div className="mt-3 space-y-1">
            {result.competition.top_industries.length === 0 ? (
              <p className="text-sm text-[#8B95A1]">
                집계된 경쟁 데이터가 없습니다.
              </p>
            ) : (
              result.competition.top_industries.map((row) => (
                <p key={row.industry_name} className="text-sm text-[#4E5968]">
                  {row.industry_name}: {formatNumber(row.count)}개
                </p>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-[#DDE8FF] bg-[#F6F9FF] p-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#2F80ED]" />
          <h2 className="text-base font-bold text-[#191F28]">핵심 인사이트</h2>
        </div>
        <div className="mt-3 space-y-1">
          {result.insights.map((insight, index) => (
            <p key={index} className="text-sm text-[#4E5968]">
              - {insight}
            </p>
          ))}
        </div>
      </section>

      {top && result.district && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E8EB] bg-white p-4">
          <p className="text-sm text-[#4E5968]">
            추천 1순위 업종으로 기존 상권 상세 분석도 이어서 볼 수 있습니다.
          </p>
          <Link
            href={
              `/business-analysis/result?district=${encodeURIComponent(result.district.code)}&industry=${encodeURIComponent(top.industry_code)}&from=land&pnu=${encodeURIComponent(result.pnu)}` as Route
            }
            className="rounded-xl bg-[#2F80ED] px-4 py-2 text-sm font-semibold text-white hover:bg-[#276FDB]"
          >
            상권 상세 분석 열기
          </Link>
        </div>
      )}
    </div>
  )
}
