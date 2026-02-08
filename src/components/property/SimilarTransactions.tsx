'use client'

// @TASK P3-S4-T5 - 유사 거래 테이블
import { useState } from 'react'
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react'
import { formatPrice } from '@/lib/format'

interface Transaction {
  id: string
  transaction_date: string
  price: number
  area_exclusive?: number
  floor?: number
  dong?: string
  similarity?: number
}

interface SimilarTransactionsProps {
  transactions: Transaction[]
  isLoading?: boolean
}

type SortField = 'date' | 'price' | 'area' | 'similarity'
type SortOrder = 'asc' | 'desc'

export function SimilarTransactions({
  transactions,
  isLoading,
}: SimilarTransactionsProps) {
  const [sortField, setSortField] = useState<SortField>('similarity')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-gray-200" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </div>
    )
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const sortedTransactions = [...transactions].sort((a, b) => {
    let aVal: number, bVal: number

    switch (sortField) {
      case 'date':
        aVal = new Date(a.transaction_date).getTime()
        bVal = new Date(b.transaction_date).getTime()
        break
      case 'price':
        aVal = a.price
        bVal = b.price
        break
      case 'area':
        aVal = a.area_exclusive || 0
        bVal = b.area_exclusive || 0
        break
      case 'similarity':
        aVal = a.similarity || 0
        bVal = b.similarity || 0
        break
      default:
        return 0
    }

    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
  })

  const SortButton = ({
    field,
    label,
  }: {
    field: SortField
    label: string
  }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-[#191F28]"
    >
      {label}
      {sortField === field ? (
        sortOrder === 'asc' ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  )

  return (
    <div>
      <h3 className="mb-5 text-lg font-bold text-[#191F28]">
        유사 거래 내역 ({transactions.length}건)
      </h3>

      {/* 테이블 헤더 */}
      <div className="mb-3 grid grid-cols-5 gap-2 border-b border-gray-200 pb-3">
        <SortButton field="date" label="거래일" />
        <SortButton field="price" label="거래가" />
        <SortButton field="area" label="면적" />
        <div className="text-xs font-medium text-gray-500">층/동</div>
        <SortButton field="similarity" label="유사도" />
      </div>

      {/* 테이블 바디 */}
      <div className="space-y-2">
        {sortedTransactions.map((tx) => (
          <div
            key={tx.id}
            className="grid grid-cols-5 gap-2 rounded-xl border border-gray-200 p-3 text-sm transition-colors hover:border-blue-500"
          >
            <div className="text-xs text-[#4E5968]">
              {new Date(tx.transaction_date).toLocaleDateString('ko-KR', {
                year: '2-digit',
                month: 'short',
                day: 'numeric',
              })}
            </div>
            <div className="font-semibold text-[#191F28]">
              {formatPrice(tx.price)}
            </div>
            <div className="text-xs text-[#4E5968]">
              {tx.area_exclusive?.toFixed(1)}㎡
            </div>
            <div className="text-xs text-[#4E5968]">
              {tx.floor != null ? `${tx.floor}층` : '-'}{' '}
              {tx.dong && `/ ${tx.dong}`}
            </div>
            <div>
              {tx.similarity && (
                <span
                  className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
                    tx.similarity >= 90
                      ? 'border border-[#00C471]/20 bg-green-50 text-[#00C471]'
                      : tx.similarity >= 80
                        ? 'border border-blue-500/20 bg-blue-50 text-blue-600'
                        : 'border border-gray-200 bg-gray-50 text-gray-600'
                  }`}
                >
                  {tx.similarity}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {transactions.length === 0 && (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 h-px w-12 bg-blue-500" />
          <p className="text-sm text-[#4E5968]">유사 거래 내역이 없습니다</p>
        </div>
      )}
    </div>
  )
}
