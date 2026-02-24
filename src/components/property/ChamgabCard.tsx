'use client'

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
  quality?: {
    factor_count: number
    factor_complete: boolean
    gap_band: 'safe' | 'watch' | 'severe' | 'unknown'
    quality_flags?: string[]
  }
  isLoading?: boolean
  isGuest?: boolean
  limitReached?: boolean
  onRequestAnalysis?: () => void
}

export function ChamgabCard({
  analysis,
  quality,
  isLoading,
  isGuest,
  limitReached,
  onRequestAnalysis,
}: ChamgabCardProps) {
  if (isGuest) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <Shield className="mx-auto mb-4 h-10 w-10 text-gray-400" />
        <h3 className="mb-2 text-lg font-bold text-[#191F28]">
          Sign in to view AI analysis
        </h3>
        <p className="mb-5 text-sm text-[#4E5968]">
          Log in to check the AI fair price for this property.
        </p>
        <button
          onClick={onRequestAnalysis}
          className="rounded-lg bg-[#191F28] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          Log in
        </button>
      </div>
    )
  }

  if (limitReached) {
    return (
      <div className="rounded-xl border-l-4 border-blue-500 bg-blue-50 p-8 text-center">
        <Clock className="mx-auto mb-4 h-10 w-10 text-blue-500" />
        <h3 className="mb-2 text-lg font-bold text-[#191F28]">
          Daily request limit reached
        </h3>
        <p className="mb-5 text-sm text-[#4E5968]">
          Free: up to 10/day, Premium: unlimited
        </p>
        <button className="rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1B64DA]">
          Upgrade
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 h-6 w-32 rounded bg-gray-200" />
        <div className="mb-2 h-10 w-48 rounded bg-gray-200" />
        <div className="h-4 w-40 rounded bg-gray-200" />
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <div className="mx-auto mb-6 h-px w-12 bg-blue-500" />
        <h3 className="mb-2 text-lg font-bold text-[#191F28]">
          No analysis yet
        </h3>
        <p className="mb-5 text-sm text-[#4E5968]">
          Request AI analysis for this property.
        </p>
        <button
          onClick={onRequestAnalysis}
          className="rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1B64DA]"
        >
          Request analysis
        </button>
      </div>
    )
  }

  const confidencePercent = Math.round(analysis.confidence * 100)
  const showFactorPendingBadge = Boolean(quality && !quality.factor_complete)

  return (
    <div className="relative rounded-xl border border-gray-200 bg-white text-[#191F28] shadow-sm">
      <div className="absolute left-0 top-0 h-1 w-full rounded-t-xl bg-blue-500" />

      <div className="flex items-center justify-between p-6 pb-0">
        <h3 className="text-xs font-semibold tracking-wide text-gray-500">
          AI Fair Price
        </h3>
        <div className="flex items-center gap-2">
          {showFactorPendingBadge && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              설명요인 준비중
            </span>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1">
            <Shield className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-medium">
              Confidence {confidencePercent}%
            </span>
          </div>
        </div>
      </div>

      <div className="px-6 py-4">
        <p className="text-3xl font-bold md:text-4xl">
          {formatPrice(analysis.chamgab_price)}
        </p>
      </div>

      <div className="flex gap-4 px-6 pb-4">
        <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-blue-600">
            <TrendingDown className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Min</span>
          </div>
          <p className="text-sm font-semibold text-[#191F28]">
            {formatPrice(analysis.min_price)}
          </p>
        </div>
        <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-red-500">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Max</span>
          </div>
          <p className="text-sm font-semibold text-[#191F28]">
            {formatPrice(analysis.max_price)}
          </p>
        </div>
      </div>

      <div className="px-6 pb-4">
        <div className="mb-2 flex justify-between text-xs text-gray-500">
          <span>Confidence</span>
          <span>{confidencePercent}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 px-6 pb-6 pt-4 text-xs text-gray-400">
        <span>
          Analyzed {new Date(analysis.analyzed_at).toLocaleDateString('ko-KR')}
        </span>
        <span>
          Valid until {new Date(analysis.expires_at).toLocaleDateString('ko-KR')}
        </span>
      </div>
    </div>
  )
}

