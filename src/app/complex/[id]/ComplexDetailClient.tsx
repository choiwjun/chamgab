'use client'

// 단지 상세 클라이언트 컴포넌트
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  MapPin,
  Building,
  Calendar,
  Car,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import type { Complex } from '@/types/complex'
import { formatPrice } from '@/lib/format'

interface ComplexDetailClientProps {
  complex: Complex
}

interface Transaction {
  id: string
  price: number
  area_exclusive: number
  floor: number
  transaction_date: string
}

export function ComplexDetailClient({ complex }: ComplexDetailClientProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 실거래 데이터 로드 (Mock)
  useEffect(() => {
    async function loadTransactions() {
      setIsLoading(true)
      try {
        // TODO: 실제 API 연동
        // const res = await fetch(`/api/transactions?complex_id=${complex.id}&limit=10`)
        // const data = await res.json()
        // setTransactions(data.items)

        // Mock 데이터
        setTransactions([
          {
            id: '1',
            price: 1500000000,
            area_exclusive: 84.5,
            floor: 10,
            transaction_date: '2024-01-15',
          },
          {
            id: '2',
            price: 1450000000,
            area_exclusive: 84.5,
            floor: 5,
            transaction_date: '2023-12-20',
          },
          {
            id: '3',
            price: 1520000000,
            area_exclusive: 112.3,
            floor: 15,
            transaction_date: '2023-11-10',
          },
        ])
      } catch (error) {
        console.error('Failed to load transactions:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadTransactions()
  }, [complex.id])

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 헤더 */}
      <div className="bg-white px-4 py-6">
        {/* 브랜드 배지 */}
        <div className="mb-2 flex items-center gap-2">
          {complex.brand && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {complex.brand}
            </span>
          )}
          <span className="text-sm text-gray-400">{complex.sigungu}</span>
        </div>

        {/* 단지명 */}
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          {complex.name}
        </h1>

        {/* 주소 */}
        <div className="flex items-center gap-1 text-gray-500">
          <MapPin className="h-4 w-4" />
          <span className="text-sm">{complex.address}</span>
        </div>
      </div>

      {/* 단지 정보 */}
      <div className="mt-2 bg-white px-4 py-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">단지 정보</h2>
        <div className="grid grid-cols-2 gap-4">
          {complex.total_units && (
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              <Building className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">총 세대수</p>
                <p className="font-semibold text-gray-900">
                  {complex.total_units.toLocaleString()}세대
                </p>
              </div>
            </div>
          )}
          {complex.total_buildings && (
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              <Building className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">총 동수</p>
                <p className="font-semibold text-gray-900">
                  {complex.total_buildings}개동
                </p>
              </div>
            </div>
          )}
          {complex.built_year && (
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              <Calendar className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">준공년도</p>
                <p className="font-semibold text-gray-900">
                  {complex.built_year}년
                </p>
              </div>
            </div>
          )}
          {complex.parking_ratio && (
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              <Car className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">주차대수</p>
                <p className="font-semibold text-gray-900">
                  세대당 {complex.parking_ratio.toFixed(1)}대
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 참값 분석 */}
      <div className="mt-2 bg-white px-4 py-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">참값 분석</h2>
        <div className="rounded-xl bg-gradient-to-r from-primary to-primary/80 p-6 text-white">
          <p className="mb-2 text-sm opacity-80">AI 예측 적정가</p>
          <p className="mb-4 text-3xl font-bold">분석 대기중</p>
          <p className="text-sm opacity-80">
            이 단지의 AI 가격 분석을 요청해보세요
          </p>
          <button className="mt-4 w-full rounded-lg bg-white py-3 font-semibold text-primary hover:bg-gray-100">
            참값 분석 요청
          </button>
        </div>
      </div>

      {/* 최근 실거래 */}
      <div className="mt-2 bg-white px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">최근 실거래</h2>
          {/* TODO: 실거래 전체보기 페이지 구현 */}
          <button className="flex items-center gap-1 text-sm text-primary">
            전체보기 <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg bg-gray-100"
              />
            ))}
          </div>
        ) : transactions.length > 0 ? (
          <div className="space-y-3">
            {transactions.map((tx, index) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 p-4"
              >
                <div>
                  <p className="font-semibold text-gray-900">
                    {formatPrice(tx.price)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {tx.area_exclusive}㎡ · {tx.floor}층
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400">{tx.transaction_date}</p>
                  {index > 0 && (
                    <p
                      className={`flex items-center justify-end text-xs ${
                        tx.price > transactions[index - 1].price
                          ? 'text-red-500'
                          : 'text-blue-500'
                      }`}
                    >
                      {tx.price > transactions[index - 1].price ? (
                        <TrendingUp className="mr-1 h-3 w-3" />
                      ) : (
                        <TrendingDown className="mr-1 h-3 w-3" />
                      )}
                      {Math.abs(
                        ((tx.price - transactions[index - 1].price) /
                          transactions[index - 1].price) *
                          100
                      ).toFixed(1)}
                      %
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-gray-500">
            실거래 내역이 없습니다
          </p>
        )}
      </div>

      {/* 하단 CTA */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white px-4 py-3">
        <Link
          href={`/search?q=${encodeURIComponent(complex.name)}` as '/search'}
          className="block w-full rounded-lg bg-primary py-3 text-center font-semibold text-white hover:bg-primary/90"
        >
          이 단지 매물 보기
        </Link>
      </div>
    </div>
  )
}
