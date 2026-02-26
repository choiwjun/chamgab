'use client'

// @TASK P3-S4-T4 - 媛寃??붿씤 由ъ뒪??
import { ArrowUp, ArrowDown } from 'lucide-react'
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
  isLoading,
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

  const visibleFactors = factors

  return (
    <div>
      <h3 className="mb-5 text-lg font-bold text-[#191F28]">
        媛寃??곹뼢 ?붿씤 TOP {factors.length}
      </h3>

      <div className="space-y-3">
        {visibleFactors.map((factor) => (
          <div
            key={factor.id}
            className="flex items-center justify-between rounded-xl border border-gray-200 p-4 transition-colors hover:border-blue-500"
          >
            <div className="flex items-center gap-4">
              {/* ?쒖쐞 */}
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-50 text-sm font-semibold text-blue-600">
                {factor.rank}
              </div>

              {/* ?붿씤紐?*/}
              <div>
                <p className="text-sm font-medium text-[#191F28]">
                  {factor.factor_name_ko}
                </p>
                <p className="text-xs text-gray-500">{factor.factor_name}</p>
              </div>
            </div>

            {/* 湲곗뿬??*/}
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
    </div>
  )
}

