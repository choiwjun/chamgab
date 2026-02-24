'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import type { Route } from 'next'
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Calendar,
  MapPin,
  Maximize2,
  Store,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { LAND_CATEGORY_LABELS } from '@/types/land'
import type { QualityGateStatus, QualityGrade } from '@/types/quality'
import type {
  LandCharacteristics,
  LandMapPoint,
  LandOfficialPrice,
  LandParcel,
  LandTransaction,
} from '@/types/land'
import { formatNumber } from '@/lib/format'
import type { LandAnalysisSummary } from '@/lib/land/analysis'
import type { LandValuationSummary } from '@/lib/land/valuation'
import { LandNearbyMap } from '@/components/land/LandNearbyMap'
import { QualityGateNotice } from '@/components/ui/QualityGateNotice'

interface LandDetailClientProps {
  parcel: LandParcel
  transactions: LandTransaction[]
  nearbyTransactions: LandTransaction[]
  nearbyTransactionsMode: 'radius' | 'fallback'
  officialPrice: LandOfficialPrice | null
  officialPrices: LandOfficialPrice[]
  priceTrend: Array<{
    year: number
    avg_price_per_m2: number
  }>
  characteristics: LandCharacteristics | null
  analysis: LandAnalysisSummary
  valuation: LandValuationSummary
  nearbyMapPoints: LandMapPoint[]
  quality: {
    quality_gate_status: QualityGateStatus
    quality_grade: QualityGrade
    quality_flags: string[]
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatPyeong(m2: number) {
  return (m2 / 3.305785).toFixed(1)
}

function formatPrice(price: number) {
  const eok = Math.floor(price / 10000)
  const man = price % 10000
  if (eok > 0 && man > 0)
    return `${formatNumber(eok)}억 ${formatNumber(man)}만원`
  if (eok > 0) return `${formatNumber(eok)}억원`
  return `${formatNumber(man)}만원`
}

const ANALYSIS_LABEL_MAP: Record<
  LandAnalysisSummary['investment_grade'],
  string
> = {
  strong: '진입 우세',
  watch: '관찰 권장',
  cautious: '보수 접근',
  insufficient: '표본 부족',
}

const ANALYSIS_TONE_MAP: Record<
  LandAnalysisSummary['investment_grade'],
  string
> = {
  strong: 'text-[#00C471]',
  watch: 'text-[#2F80ED]',
  cautious: 'text-[#F59E0B]',
  insufficient: 'text-[#8B95A1]',
}

const VALUATION_LABEL_MAP: Record<
  LandValuationSummary['valuation_grade'],
  string
> = {
  undervalued: '저평가 구간',
  fair: '적정 구간',
  overvalued: '고평가 구간',
  insufficient: '추정 불가',
}

const VALUATION_TONE_MAP: Record<
  LandValuationSummary['valuation_grade'],
  string
> = {
  undervalued: 'text-[#00C471]',
  fair: 'text-[#2F80ED]',
  overvalued: 'text-[#F04452]',
  insufficient: 'text-[#8B95A1]',
}

function PricePerM2Text({ value }: { value: number | null | undefined }) {
  if (!value || value <= 0) return <>-</>
  return <>{formatNumber(Math.floor(value / 10000))}만원/m²</>
}

export function LandDetailClient({
  parcel,
  transactions,
  nearbyTransactions,
  nearbyTransactionsMode,
  officialPrice,
  officialPrices,
  priceTrend,
  characteristics,
  analysis,
  valuation,
  nearbyMapPoints,
  quality,
}: LandDetailClientProps) {
  const pricesOverTime = transactions
    .filter((tx) => tx.price_per_m2)
    .sort(
      (a, b) =>
        new Date(a.transaction_date).getTime() -
        new Date(b.transaction_date).getTime()
    )

  const recentAvg =
    pricesOverTime.length > 0
      ? Math.round(
          pricesOverTime
            .slice(-5)
            .reduce((sum, tx) => sum + (tx.price_per_m2 || 0), 0) /
            Math.min(5, pricesOverTime.length)
        )
      : null

  const olderAvg =
    pricesOverTime.length > 5
      ? Math.round(
          pricesOverTime
            .slice(0, -5)
            .reduce((sum, tx) => sum + (tx.price_per_m2 || 0), 0) /
            (pricesOverTime.length - 5)
        )
      : null

  const recentTrendPct =
    recentAvg && olderAvg && olderAvg > 0
      ? ((recentAvg - olderAvg) / olderAvg) * 100
      : null

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          href="/land/search"
          className="inline-flex items-center gap-2 text-sm text-[#8B95A1] transition-colors hover:text-[#191F28]"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          토지 검색으로 돌아가기
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mt-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-[#F59E0B]" strokeWidth={2} />
              <h1 className="text-2xl font-bold text-[#191F28]">
                {parcel.sido} {parcel.sigungu} {parcel.eupmyeondong}
              </h1>
            </div>
            {parcel.jibun && (
              <p className="ml-7 mt-1 text-[#4E5968]">{parcel.jibun}</p>
            )}
          </div>

          {parcel.land_category && (
            <span className="rounded-xl bg-[#FFF7ED] px-4 py-2 text-sm font-semibold text-[#F59E0B]">
              {LAND_CATEGORY_LABELS[parcel.land_category] ||
                parcel.land_category}
            </span>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4"
      >
        <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
          <div className="flex items-center gap-1.5 text-xs text-[#8B95A1]">
            <Maximize2 className="h-3 w-3" strokeWidth={2} />
            면적
          </div>
          <p className="mt-2 text-xl font-bold text-[#191F28]">
            {parcel.area_m2 ? `${formatNumber(parcel.area_m2)}m²` : '-'}
          </p>
          {parcel.area_m2 && (
            <p className="text-xs text-[#8B95A1]">
              ({formatPyeong(parcel.area_m2)}평)
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
          <div className="flex items-center gap-1.5 text-xs text-[#8B95A1]">
            <BarChart3 className="h-3 w-3" strokeWidth={2} />
            최신 거래가
          </div>
          <p className="mt-2 text-xl font-bold text-[#191F28]">
            {parcel.latest_transaction_price
              ? formatPrice(parcel.latest_transaction_price)
              : '-'}
          </p>
          {parcel.latest_transaction_date && (
            <p className="text-xs text-[#8B95A1]">
              {formatDate(parcel.latest_transaction_date)}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
          <div className="text-xs text-[#8B95A1]">단가 (원/m²)</div>
          <p className="mt-2 text-xl font-bold text-[#F59E0B]">
            <PricePerM2Text value={parcel.latest_price_per_m2} />
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
          <div className="text-xs text-[#8B95A1]">가격 추세</div>
          {recentTrendPct !== null ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                {recentTrendPct >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-[#00C471]" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-[#F04452]" />
                )}
                <span
                  className={`text-xl font-bold ${
                    recentTrendPct >= 0 ? 'text-[#00C471]' : 'text-[#F04452]'
                  }`}
                >
                  {recentTrendPct >= 0 ? '+' : ''}
                  {recentTrendPct.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-[#8B95A1]">최근 5건 vs 이전 구간</p>
            </>
          ) : (
            <p className="mt-2 text-xl font-bold text-[#8B95A1]">-</p>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.26 }}
        className="mt-6 rounded-2xl border border-[#E5E8EB] bg-white p-6"
      >
        <QualityGateNotice
          status={quality.quality_gate_status}
          grade={quality.quality_grade}
          flags={quality.quality_flags}
        />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#191F28]">토지 분석 요약</h2>
            <p className="mt-1 text-sm text-[#8B95A1]">
              실거래 기반 점수(가격 구간 + 거래 유동성 + 변동성)
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-[#8B95A1]">종합 점수</p>
            <p className="text-2xl font-bold text-[#191F28]">
              {analysis.overall_score != null
                ? `${analysis.overall_score}점`
                : '-'}
            </p>
            <p
              className={`text-sm font-semibold ${ANALYSIS_TONE_MAP[analysis.investment_grade]}`}
            >
              {ANALYSIS_LABEL_MAP[analysis.investment_grade]}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <p className="text-xs text-[#8B95A1]">가격 포지션</p>
            <p className="mt-1 text-sm font-semibold text-[#191F28]">
              {analysis.price_position_pct != null
                ? `${analysis.price_position_pct}%`
                : '-'}
            </p>
            <p className="text-xs text-[#8B95A1]">중앙값 대비</p>
          </div>
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <p className="text-xs text-[#8B95A1]">유동성 (12개월)</p>
            <p className="mt-1 text-sm font-semibold text-[#191F28]">
              {analysis.liquidity_12m}건
            </p>
            <p className="text-xs text-[#8B95A1]">거래 표본</p>
          </div>
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <p className="text-xs text-[#8B95A1]">6개월 모멘텀</p>
            <p className="mt-1 text-sm font-semibold text-[#191F28]">
              {analysis.momentum_6m_pct != null
                ? `${analysis.momentum_6m_pct > 0 ? '+' : ''}${analysis.momentum_6m_pct}%`
                : '-'}
            </p>
            <p className="text-xs text-[#8B95A1]">단가 추세</p>
          </div>
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <p className="text-xs text-[#8B95A1]">변동성</p>
            <p className="mt-1 text-sm font-semibold text-[#191F28]">
              {analysis.volatility_pct != null
                ? `${analysis.volatility_pct}%`
                : '-'}
            </p>
            <p className="text-xs text-[#8B95A1]">표본 분산</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[#E5E8EB] bg-[#FCFCFD] p-4">
          <p className="text-xs font-semibold text-[#4E5968]">판단 시그널</p>
          <div className="mt-2 space-y-1">
            {analysis.signals.map((signal, idx) => (
              <p key={`${signal}-${idx}`} className="text-sm text-[#4E5968]">
                - {signal}
              </p>
            ))}
          </div>
          <p className="mt-3 text-xs text-[#8B95A1]">
            총 표본 {analysis.sample_size}건 (인근 {analysis.nearby_sample_size}
            건)
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.28 }}
        className="mt-6 rounded-2xl border border-[#E5E8EB] bg-white p-6"
      >
        <h2 className="text-lg font-bold text-[#191F28]">토지 AI 추정가</h2>
        <p className="mt-1 text-sm text-[#8B95A1]">
          실거래/공시지가 기반 추정 결과입니다.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <p className="text-xs text-[#8B95A1]">추정 단가</p>
            <p className="mt-1 text-sm font-semibold text-[#191F28]">
              {valuation.estimated_price_per_m2 ? (
                <PricePerM2Text value={valuation.estimated_price_per_m2} />
              ) : (
                '-'
              )}
            </p>
          </div>
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <p className="text-xs text-[#8B95A1]">추정 총액</p>
            <p className="mt-1 text-sm font-semibold text-[#191F28]">
              {valuation.estimated_total_price
                ? formatPrice(valuation.estimated_total_price)
                : '-'}
            </p>
          </div>
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <p className="text-xs text-[#8B95A1]">분석 신뢰도</p>
            <p className="mt-1 text-sm font-semibold text-[#191F28]">
              {valuation.confidence_score}%
            </p>
          </div>
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <p className="text-xs text-[#8B95A1]">평가 구간</p>
            <p
              className={`mt-1 text-sm font-semibold ${VALUATION_TONE_MAP[valuation.valuation_grade]}`}
            >
              {VALUATION_LABEL_MAP[valuation.valuation_grade]}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[#E5E8EB] bg-[#FCFCFD] p-4">
          <p className="text-xs text-[#8B95A1]">추정 범위</p>
          <p className="mt-1 text-sm font-semibold text-[#191F28]">
            {valuation.lower_bound_price != null &&
            valuation.upper_bound_price != null
              ? `${formatPrice(valuation.lower_bound_price)} ~ ${formatPrice(valuation.upper_bound_price)}`
              : '-'}
          </p>
          <p className="mt-2 text-xs text-[#8B95A1]">{valuation.disclaimer}</p>
          <p className="text-xs text-[#8B95A1]">
            모델 버전: {valuation.model_version}
          </p>
        </div>

        {valuation.factors.length > 0 && (
          <div className="mt-4 rounded-xl border border-[#E5E8EB] bg-[#FCFCFD] p-4">
            <p className="text-xs font-semibold text-[#4E5968]">
              주요 반영 요인
            </p>
            <div className="mt-2 space-y-1">
              {valuation.factors.map((factor, idx) => (
                <p
                  key={`${factor.label}-${idx}`}
                  className="text-sm text-[#4E5968]"
                >
                  - {factor.label}: {factor.description}
                </p>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="mt-6 rounded-2xl border border-[#E5E8EB] bg-white p-6"
      >
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[#4E5968]" />
          <h2 className="text-lg font-bold text-[#191F28]">공시지가 이력</h2>
        </div>

        {officialPrice && (
          <div className="mt-4 rounded-xl border border-[#E5E8EB] bg-[#FCFCFD] p-4">
            <p className="text-xs text-[#8B95A1]">최신 공시지가</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm font-medium text-[#4E5968]">
                {officialPrice.price_year}년
              </span>
              <span className="text-sm font-semibold text-[#191F28]">
                <PricePerM2Text value={officialPrice.official_price_per_m2} />
              </span>
            </div>
          </div>
        )}

        {officialPrices.length === 0 ? (
          <p className="mt-4 text-sm text-[#8B95A1]">
            공시지가 이력이 없습니다.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {officialPrices.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-xl bg-[#F9FAFB] px-4 py-3"
              >
                <span className="text-sm font-medium text-[#4E5968]">
                  {row.price_year}년
                </span>
                <span className="text-sm font-semibold text-[#191F28]">
                  <PricePerM2Text value={row.official_price_per_m2} />
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.32 }}
        className="mt-6 rounded-2xl border border-[#E5E8EB] bg-white p-6"
      >
        <h2 className="text-lg font-bold text-[#191F28]">연도별 단가 추이</h2>
        {priceTrend.length === 0 ? (
          <p className="mt-3 text-sm text-[#8B95A1]">
            연도별 추이 데이터가 없습니다.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {priceTrend.map((row) => (
              <div
                key={row.year}
                className="flex items-center justify-between rounded-xl bg-[#F9FAFB] px-4 py-3"
              >
                <span className="text-sm font-medium text-[#4E5968]">
                  {row.year}년
                </span>
                <span className="text-sm font-semibold text-[#191F28]">
                  <PricePerM2Text value={row.avg_price_per_m2} />
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.34 }}
        className="mt-6 rounded-2xl border border-[#E5E8EB] bg-white p-6"
      >
        <h2 className="text-lg font-bold text-[#191F28]">토지 특성</h2>
        {!characteristics ? (
          <p className="mt-4 text-sm text-[#8B95A1]">
            토지 특성 정보가 아직 없습니다.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-[#F9FAFB] p-3">
              <p className="text-xs text-[#8B95A1]">토지 이용상황</p>
              <p className="mt-1 text-sm font-semibold text-[#191F28]">
                {characteristics.land_use || '-'}
              </p>
            </div>
            <div className="rounded-xl bg-[#F9FAFB] p-3">
              <p className="text-xs text-[#8B95A1]">용도지역</p>
              <p className="mt-1 text-sm font-semibold text-[#191F28]">
                {characteristics.zoning_detail || parcel.zoning || '-'}
              </p>
            </div>
            <div className="rounded-xl bg-[#F9FAFB] p-3">
              <p className="text-xs text-[#8B95A1]">지형</p>
              <p className="mt-1 text-sm font-semibold text-[#191F28]">
                {[characteristics.elevation_type, characteristics.terrain_shape]
                  .filter(Boolean)
                  .join(' / ') || '-'}
              </p>
            </div>
            <div className="rounded-xl bg-[#F9FAFB] p-3">
              <p className="text-xs text-[#8B95A1]">도로 접면</p>
              <p className="mt-1 text-sm font-semibold text-[#191F28]">
                {[characteristics.road_access, characteristics.road_distance]
                  .filter(Boolean)
                  .join(' / ') || '-'}
              </p>
            </div>
            <div className="rounded-xl bg-[#F9FAFB] p-3">
              <p className="text-xs text-[#8B95A1]">건폐율</p>
              <p className="mt-1 text-sm font-semibold text-[#191F28]">
                {characteristics.building_coverage != null
                  ? `${characteristics.building_coverage}%`
                  : '-'}
              </p>
            </div>
            <div className="rounded-xl bg-[#F9FAFB] p-3">
              <p className="text-xs text-[#8B95A1]">용적률</p>
              <p className="mt-1 text-sm font-semibold text-[#191F28]">
                {characteristics.floor_area_ratio != null
                  ? `${characteristics.floor_area_ratio}%`
                  : '-'}
              </p>
            </div>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.36 }}
        className="mt-6 rounded-2xl border border-[#DDE8FF] bg-[#F6F9FF] p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-[#2F80ED]" />
              <h3 className="text-base font-bold text-[#191F28]">
                이 토지에서 창업한다면?
              </h3>
            </div>
            <p className="mt-1 text-sm text-[#4E5968]">
              토지 위치 기반으로 상권 적합도와 추천 업종을 확인할 수 있습니다.
            </p>
          </div>
          <Link
            href={`/land/${encodeURIComponent(parcel.pnu)}/commercial` as Route}
            className="inline-flex items-center rounded-xl bg-[#2F80ED] px-4 py-2 text-sm font-semibold text-white hover:bg-[#276FDB]"
          >
            상권 분석 시작하기
          </Link>
        </div>
      </motion.div>

      {nearbyMapPoints.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.38 }}
          className="mt-6"
        >
          <h2 className="mb-3 text-lg font-bold text-[#191F28]">
            인근 토지 지도
          </h2>
          <LandNearbyMap points={nearbyMapPoints} />
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="mt-8"
      >
        <h2 className="text-lg font-bold text-[#191F28]">
          거래 이력
          <span className="ml-2 text-sm font-normal text-[#8B95A1]">
            {transactions.length}건
          </span>
        </h2>

        {transactions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[#E5E8EB] bg-white p-8 text-center">
            <p className="text-[#8B95A1]">거래 이력이 없습니다.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-2xl border border-[#E5E8EB] bg-white p-5 transition-all hover:border-[#D1D6DB]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-[#191F28]">
                        {formatPrice(tx.price)}
                      </span>
                      {tx.price_per_m2 && (
                        <span className="text-sm text-[#F59E0B]">
                          <PricePerM2Text value={tx.price_per_m2} />
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[#8B95A1]">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" strokeWidth={2} />
                        {formatDate(tx.transaction_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Maximize2 className="h-3 w-3" strokeWidth={2} />
                        {formatNumber(tx.area_m2)}m² ({formatPyeong(tx.area_m2)}
                        평)
                      </span>
                      {tx.transaction_type && (
                        <span className="rounded-md bg-[#F2F4F6] px-2 py-0.5 text-xs">
                          {tx.transaction_type}
                        </span>
                      )}
                      {tx.is_partial_sale && (
                        <span className="rounded-md bg-[#FFF0F0] px-2 py-0.5 text-xs text-[#F04452]">
                          지분매매
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {nearbyTransactions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45 }}
          className="mt-8"
        >
          <h2 className="text-lg font-bold text-[#191F28]">
            인근 거래
            <span className="ml-2 text-sm font-normal text-[#8B95A1]">
              {nearbyTransactionsMode === 'radius'
                ? '반경 500m'
                : `${parcel.eupmyeondong || parcel.sigungu} 기준`}
            </span>
          </h2>

          <div className="mt-4 space-y-3">
            {nearbyTransactions.slice(0, 10).map((tx) => (
              <div
                key={tx.id}
                className="rounded-2xl border border-[#E5E8EB] bg-white p-5 transition-all hover:border-[#D1D6DB]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <MapPin
                        className="h-3.5 w-3.5 text-[#8B95A1]"
                        strokeWidth={2}
                      />
                      <span className="text-sm font-medium text-[#4E5968]">
                        {tx.eupmyeondong} {tx.jibun}
                      </span>
                      {tx.land_category && (
                        <span className="rounded-md bg-[#FFF7ED] px-2 py-0.5 text-xs text-[#F59E0B]">
                          {LAND_CATEGORY_LABELS[tx.land_category] ||
                            tx.land_category}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="font-bold text-[#191F28]">
                        {formatPrice(tx.price)}
                      </span>
                      {tx.price_per_m2 && (
                        <span className="text-sm text-[#8B95A1]">
                          <PricePerM2Text value={tx.price_per_m2} />
                        </span>
                      )}
                      <span className="text-xs text-[#8B95A1]">
                        {formatDate(tx.transaction_date)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
