'use client'

// @TASK P3-S4-T4 - 가격 요인 리스트
import { ArrowUp, ArrowDown, Lock } from 'lucide-react'
import { formatPrice } from '@/lib/format'

interface PriceFactor {
  id: string
  rank: number
  factor_name: string
  factor_name_ko: string
  contribution: number
  direction: 'positive' | 'negative'
}

interface PriceFactorsProps {
  factors: PriceFactor[]
  maxVisible?: number
  isPremium?: boolean
  isLoading?: boolean
  onUpgrade?: () => void
}

export function PriceFactors({
  factors,
  maxVisible = 5,
  isPremium = false,
  isLoading,
  onUpgrade,
}: PriceFactorsProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-gray-200" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="mb-3 h-12 animate-pulse rounded bg-gray-100"
          />
        ))}
      </div>
    )
  }

  const visibleFactors = isPremium ? factors : factors.slice(0, maxVisible)
  const hiddenCount = factors.length - visibleFactors.length

  return (
    <div>
      <h3 className="mb-5 text-lg font-bold text-[#191F28]">
        가격 영향 요인 TOP {factors.length}
      </h3>

      <div className="space-y-3">
        {visibleFactors.map((factor) => (
          <div
            key={factor.id}
            className="flex items-center justify-between rounded-xl border border-gray-200 p-4 transition-colors hover:border-blue-500"
          >
            <div className="flex items-center gap-4">
              {/* 순위 */}
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-50 text-sm font-semibold text-blue-600">
                {factor.rank}
              </div>

              {/* 요인명 */}
              <div>
                <p className="text-sm font-medium text-[#191F28]">
                  {factor.factor_name_ko}
                </p>
                <p className="text-xs text-gray-500">{factor.factor_name}</p>
              </div>
            </div>

            {/* 기여도 */}
            <div className="flex items-center gap-2">
              {factor.direction === 'positive' ? (
                <ArrowUp className="h-3.5 w-3.5 text-[#00C471]" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 text-[#F04452]" />
              )}
              <span
                className={`text-sm font-semibold ${
                  factor.direction === 'positive'
                    ? 'text-[#00C471]'
                    : 'text-[#F04452]'
                }`}
              >
                {factor.direction === 'positive' ? '+' : '-'}
                {formatPrice(Math.abs(factor.contribution))}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 프리미엄 업그레이드 CTA */}
      {!isPremium && hiddenCount > 0 && (
        <div className="mt-5 rounded-xl border-l-4 border-blue-500 bg-blue-50 p-5 text-center">
          <div className="mb-3 flex items-center justify-center gap-2 text-[#191F28]">
            <Lock className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">
              +{hiddenCount}개 요인 더보기
            </span>
          </div>
          <p className="mb-4 text-xs text-[#4E5968]">
            프리미엄 회원은 모든 가격 요인을 확인할 수 있습니다
          </p>
          <button
            onClick={onUpgrade}
            className="rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1B64DA]"
          >
            프리미엄 업그레이드
          </button>
        </div>
      )}
    </div>
  )
}
