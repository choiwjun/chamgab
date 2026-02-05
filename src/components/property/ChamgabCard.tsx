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
      <div className="border-2 border-dashed border-editorial-dark/20 bg-editorial-sand/20 p-8 text-center">
        <Shield className="mx-auto mb-4 h-10 w-10 text-editorial-ink/30" />
        <h3 className="font-serif text-lg text-editorial-dark mb-2">
          AI 분석 결과를 확인하세요
        </h3>
        <p className="text-sm text-editorial-ink/50 mb-5">
          로그인하고 이 매물의 참값을 확인하세요
        </p>
        <button
          onClick={onRequestAnalysis}
          className="bg-editorial-dark px-6 py-2.5 text-sm tracking-widest uppercase text-white hover:bg-editorial-gold transition-colors"
        >
          Sign In
        </button>
      </div>
    )
  }

  // 한도 초과 상태
  if (limitReached) {
    return (
      <div className="border-l-2 border-editorial-gold bg-editorial-sand/30 p-8 text-center">
        <Clock className="mx-auto mb-4 h-10 w-10 text-editorial-gold" />
        <h3 className="font-serif text-lg text-editorial-dark mb-2">
          오늘 조회 한도에 도달했습니다
        </h3>
        <p className="text-sm text-editorial-ink/50 mb-5">
          무료 회원: 1일 10회 / 프리미엄: 무제한
        </p>
        <button className="bg-editorial-gold px-6 py-2.5 text-sm tracking-widest uppercase text-white hover:bg-editorial-dark transition-colors">
          Upgrade
        </button>
      </div>
    )
  }

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="animate-pulse border border-editorial-dark/5 bg-white p-6">
        <div className="mb-4 h-6 w-32 bg-editorial-sand" />
        <div className="mb-2 h-10 w-48 bg-editorial-sand" />
        <div className="h-4 w-40 bg-editorial-sand" />
      </div>
    )
  }

  // 분석 결과 없음
  if (!analysis) {
    return (
      <div className="border border-editorial-dark/10 bg-white p-8 text-center">
        <div className="w-12 h-px bg-editorial-gold mx-auto mb-6" />
        <h3 className="font-serif text-lg text-editorial-dark mb-2">
          분석 결과 없음
        </h3>
        <p className="text-sm text-editorial-ink/50 mb-5">
          이 매물의 AI 분석을 요청하세요
        </p>
        <button
          onClick={onRequestAnalysis}
          className="bg-editorial-dark px-6 py-2.5 text-sm tracking-widest uppercase text-white hover:bg-editorial-gold transition-colors"
        >
          Request Analysis
        </button>
      </div>
    )
  }

  const confidencePercent = Math.round(analysis.confidence * 100)

  return (
    <div className="border border-editorial-dark bg-editorial-dark text-white relative">
      <div className="absolute top-0 left-0 w-full h-0.5 bg-editorial-gold" />

      {/* 헤더 */}
      <div className="p-6 pb-0 flex items-center justify-between">
        <h3 className="text-xs tracking-[0.2em] uppercase text-white/60">참값 분석</h3>
        <div className="flex items-center gap-2 border border-white/30 px-3 py-1">
          <Shield className="h-3.5 w-3.5 text-white/70" />
          <span className="text-xs tracking-wide">신뢰도 {confidencePercent}%</span>
        </div>
      </div>

      {/* 참값 가격 */}
      <div className="px-6 py-4">
        <p className="font-serif text-3xl md:text-4xl">
          {formatPrice(analysis.chamgab_price)}
        </p>
      </div>

      {/* 가격 범위 */}
      <div className="px-6 pb-4 flex gap-4">
        <div className="flex-1 border border-white/20 p-3">
          <div className="flex items-center gap-2 text-blue-300 mb-1">
            <TrendingDown className="h-3.5 w-3.5" />
            <span className="text-xs tracking-wide uppercase">최저</span>
          </div>
          <p className="text-sm text-white/90">
            {formatPrice(analysis.min_price)}
          </p>
        </div>
        <div className="flex-1 border border-white/20 p-3">
          <div className="flex items-center gap-2 text-red-300 mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs tracking-wide uppercase">최고</span>
          </div>
          <p className="text-sm text-white/90">
            {formatPrice(analysis.max_price)}
          </p>
        </div>
      </div>

      {/* 신뢰도 바 */}
      <div className="px-6 pb-4">
        <div className="mb-2 flex justify-between text-xs text-white/50">
          <span>신뢰도</span>
          <span>{confidencePercent}%</span>
        </div>
        <div className="h-0.5 bg-white/20">
          <div
            className="h-full bg-editorial-gold transition-all"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      {/* 메타 정보 */}
      <div className="px-6 pb-6 flex items-center justify-between text-xs text-white/40 border-t border-white/10 pt-4">
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
