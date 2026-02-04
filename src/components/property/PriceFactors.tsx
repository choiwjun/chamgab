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
          <div key={i} className="mb-3 h-12 animate-pulse rounded bg-gray-100" />
        ))}
      </div>
    )
  }

  const visibleFactors = isPremium ? factors : factors.slice(0, maxVisible)
  const hiddenCount = factors.length - visibleFactors.length

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-bold text-gray-900">
        가격 영향 요인 TOP {factors.length}
      </h3>

      <div className="space-y-3">
        {visibleFactors.map((factor) => (
          <div
            key={factor.id}
            className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
          >
            <div className="flex items-center gap-3">
              {/* 순위 */}
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {factor.rank}
              </div>

              {/* 요인명 */}
              <div>
                <p className="font-medium text-gray-900">{factor.factor_name_ko}</p>
                <p className="text-xs text-gray-500">{factor.factor_name}</p>
              </div>
            </div>

            {/* 기여도 */}
            <div className="flex items-center gap-2">
              {factor.direction === 'positive' ? (
                <ArrowUp className="h-4 w-4 text-green-500" />
              ) : (
                <ArrowDown className="h-4 w-4 text-red-500" />
              )}
              <span
                className={`font-semibold ${
                  factor.direction === 'positive' ? 'text-green-600' : 'text-red-600'
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
        <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center">
          <div className="mb-2 flex items-center justify-center gap-2 text-yellow-700">
            <Lock className="h-4 w-4" />
            <span className="text-sm font-medium">
              +{hiddenCount}개 요인 더보기
            </span>
          </div>
          <p className="mb-3 text-xs text-yellow-600">
            프리미엄 회원은 모든 가격 요인을 확인할 수 있습니다
          </p>
          <button
            onClick={onUpgrade}
            className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600"
          >
            프리미엄 업그레이드
          </button>
        </div>
      )}
    </div>
  )
}
