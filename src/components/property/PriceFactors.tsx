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
      <div className="border border-editorial-dark/5 bg-white p-6">
        <div className="mb-4 h-6 w-40 animate-pulse bg-editorial-sand" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-3 h-12 animate-pulse bg-editorial-sand/50" />
        ))}
      </div>
    )
  }

  const visibleFactors = isPremium ? factors : factors.slice(0, maxVisible)
  const hiddenCount = factors.length - visibleFactors.length

  return (
    <div>
      <h3 className="font-serif text-lg text-editorial-dark mb-5">
        가격 영향 요인 TOP {factors.length}
      </h3>

      <div className="space-y-3">
        {visibleFactors.map((factor) => (
          <div
            key={factor.id}
            className="flex items-center justify-between border border-editorial-dark/5 p-4 hover:border-editorial-gold/30 transition-colors"
          >
            <div className="flex items-center gap-4">
              {/* 순위 */}
              <div className="flex h-8 w-8 items-center justify-center border border-editorial-gold/30 bg-editorial-gold/5 text-sm font-medium text-editorial-gold">
                {factor.rank}
              </div>

              {/* 요인명 */}
              <div>
                <p className="text-sm text-editorial-dark">{factor.factor_name_ko}</p>
                <p className="text-xs text-editorial-ink/40">{factor.factor_name}</p>
              </div>
            </div>

            {/* 기여도 */}
            <div className="flex items-center gap-2">
              {factor.direction === 'positive' ? (
                <ArrowUp className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 text-red-600" />
              )}
              <span
                className={`text-sm font-medium ${
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
        <div className="mt-5 border-l-2 border-editorial-gold bg-editorial-sand/30 p-5 text-center">
          <div className="mb-3 flex items-center justify-center gap-2 text-editorial-dark">
            <Lock className="h-4 w-4 text-editorial-gold" />
            <span className="text-sm tracking-wide">
              +{hiddenCount}개 요인 더보기
            </span>
          </div>
          <p className="mb-4 text-xs text-editorial-ink/50">
            프리미엄 회원은 모든 가격 요인을 확인할 수 있습니다
          </p>
          <button
            onClick={onUpgrade}
            className="bg-editorial-gold px-5 py-2.5 text-xs tracking-widest uppercase text-white hover:bg-editorial-dark transition-colors"
          >
            Upgrade
          </button>
        </div>
      )}
    </div>
  )
}
