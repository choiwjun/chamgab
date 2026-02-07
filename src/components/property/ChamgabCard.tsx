'use client'

// @TASK P3-S4-T3 - 참값 분석 카드 (핵심!)
import { TrendingUp, TrendingDown, Clock, Shield } from 'lucide-react'
import { formatPrice } from '@/lib/format'

interface ChamgabCardProps {
  analysis?: {
    chamgab_price: number
    min_price: number
    max_price: number
    confidence: number
    analyzed_at: string
    expires_at: string
  }
  isLoading?: boolean
  isGuest?: boolean
  limitReached?: boolean
  onRequestAnalysis?: () => void
}

export function ChamgabCard({
  analysis,
  isLoading,
  isGuest,
  limitReached,
  onRequestAnalysis,
}: ChamgabCardProps) {
  // Guest 상태
  if (isGuest) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <Shield className="mx-auto mb-4 h-10 w-10 text-gray-400" />
        <h3 className="mb-2 text-lg font-bold text-[#191F28]">
          AI 분석 결과를 확인하세요
        </h3>
        <p className="mb-5 text-sm text-[#4E5968]">
          로그인하고 이 매물의 참값을 확인하세요
        </p>
        <button
          onClick={onRequestAnalysis}
          className="rounded-lg bg-[#191F28] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          로그인
        </button>
      </div>
    )
  }

  // 한도 초과 상태
  if (limitReached) {
    return (
      <div className="rounded-xl border-l-4 border-blue-500 bg-blue-50 p-8 text-center">
        <Clock className="mx-auto mb-4 h-10 w-10 text-blue-500" />
        <h3 className="mb-2 text-lg font-bold text-[#191F28]">
          오늘 조회 한도에 도달했습니다
        </h3>
        <p className="mb-5 text-sm text-[#4E5968]">
          무료 회원: 1일 10회 / 프리미엄: 무제한
        </p>
        <button className="rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1B64DA]">
          프리미엄 업그레이드
        </button>
      </div>
    )
  }

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 h-6 w-32 rounded bg-gray-200" />
        <div className="mb-2 h-10 w-48 rounded bg-gray-200" />
        <div className="h-4 w-40 rounded bg-gray-200" />
      </div>
    )
  }

  // 분석 결과 없음
  if (!analysis) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <div className="mx-auto mb-6 h-px w-12 bg-blue-500" />
        <h3 className="mb-2 text-lg font-bold text-[#191F28]">
          분석 결과 없음
        </h3>
        <p className="mb-5 text-sm text-[#4E5968]">
          이 매물의 AI 분석을 요청하세요
        </p>
        <button
          onClick={onRequestAnalysis}
          className="rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1B64DA]"
        >
          분석 요청
        </button>
      </div>
    )
  }

  const confidencePercent = Math.round(analysis.confidence * 100)

  return (
    <div className="relative rounded-xl border border-gray-200 bg-white text-[#191F28] shadow-sm">
      <div className="absolute left-0 top-0 h-1 w-full rounded-t-xl bg-blue-500" />

      {/* 헤더 */}
      <div className="flex items-center justify-between p-6 pb-0">
        <h3 className="text-xs font-semibold tracking-wide text-gray-500">
          참값 분석
        </h3>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1">
          <Shield className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-xs font-medium">
            신뢰도 {confidencePercent}%
          </span>
        </div>
      </div>

      {/* 참값 가격 */}
      <div className="px-6 py-4">
        <p className="text-3xl font-bold md:text-4xl">
          {formatPrice(analysis.chamgab_price)}
        </p>
      </div>

      {/* 가격 범위 */}
      <div className="flex gap-4 px-6 pb-4">
        <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-blue-600">
            <TrendingDown className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">최저</span>
          </div>
          <p className="text-sm font-semibold text-[#191F28]">
            {formatPrice(analysis.min_price)}
          </p>
        </div>
        <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-red-500">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">최고</span>
          </div>
          <p className="text-sm font-semibold text-[#191F28]">
            {formatPrice(analysis.max_price)}
          </p>
        </div>
      </div>

      {/* 신뢰도 바 */}
      <div className="px-6 pb-4">
        <div className="mb-2 flex justify-between text-xs text-gray-500">
          <span>신뢰도</span>
          <span>{confidencePercent}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      {/* 메타 정보 */}
      <div className="flex items-center justify-between border-t border-gray-200 px-6 pb-6 pt-4 text-xs text-gray-400">
        <span>
          분석일: {new Date(analysis.analyzed_at).toLocaleDateString('ko-KR')}
        </span>
        <span>
          유효기간: {new Date(analysis.expires_at).toLocaleDateString('ko-KR')}
        </span>
      </div>
    </div>
  )
}
