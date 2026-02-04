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
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <Shield className="mx-auto mb-3 h-12 w-12 text-gray-400" />
        <h3 className="mb-2 text-lg font-semibold text-gray-700">
          AI 분석 결과를 확인하세요
        </h3>
        <p className="mb-4 text-sm text-gray-500">
          로그인하고 이 매물의 참값을 확인하세요
        </p>
        <button
          onClick={onRequestAnalysis}
          className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          로그인하기
        </button>
      </div>
    )
  }

  // 한도 초과 상태
  if (limitReached) {
    return (
      <div className="rounded-xl border-2 border-dashed border-yellow-300 bg-yellow-50 p-6 text-center">
        <Clock className="mx-auto mb-3 h-12 w-12 text-yellow-500" />
        <h3 className="mb-2 text-lg font-semibold text-yellow-700">
          오늘 조회 한도에 도달했습니다
        </h3>
        <p className="mb-4 text-sm text-yellow-600">
          무료 회원: 1일 10회 / 프리미엄: 무제한
        </p>
        <button className="rounded-lg bg-yellow-500 px-6 py-2 text-sm font-medium text-white hover:bg-yellow-600">
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
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <h3 className="mb-2 text-lg font-semibold text-gray-700">
          분석 결과 없음
        </h3>
        <p className="mb-4 text-sm text-gray-500">
          이 매물의 AI 분석을 요청하세요
        </p>
        <button
          onClick={onRequestAnalysis}
          className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          분석 요청하기
        </button>
      </div>
    )
  }

  const confidencePercent = Math.round(analysis.confidence * 100)

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-white p-6">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏠</span>
          <h3 className="text-lg font-bold text-gray-900">참값 분석</h3>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
          <Shield className="h-4 w-4" />
          신뢰도 {confidencePercent}%
        </div>
      </div>

      {/* 참값 가격 */}
      <div className="mb-4">
        <p className="mb-1 text-sm text-gray-500">AI 예측 참값</p>
        <p className="text-3xl font-bold text-primary">
          {formatPrice(analysis.chamgab_price)}
        </p>
      </div>

      {/* 가격 범위 */}
      <div className="mb-4 flex gap-4">
        <div className="flex-1 rounded-lg bg-blue-50 p-3">
          <div className="flex items-center gap-1 text-blue-600">
            <TrendingDown className="h-4 w-4" />
            <span className="text-xs">최저</span>
          </div>
          <p className="text-sm font-semibold text-blue-700">
            {formatPrice(analysis.min_price)}
          </p>
        </div>
        <div className="flex-1 rounded-lg bg-red-50 p-3">
          <div className="flex items-center gap-1 text-red-600">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs">최고</span>
          </div>
          <p className="text-sm font-semibold text-red-700">
            {formatPrice(analysis.max_price)}
          </p>
        </div>
      </div>

      {/* 신뢰도 바 */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>신뢰도</span>
          <span>{confidencePercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-400 to-green-600 transition-all"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      {/* 메타 정보 */}
      <div className="flex items-center justify-between text-xs text-gray-400">
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
