'use client'

// @TASK P4-S4-T4 - 비교 테이블 컴포넌트
// @SPEC Phase 4 비교하기 화면 요구사항

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { useCompareStore } from '@/stores/compareStore'
import { PropertyColumn } from './PropertyColumn'
import { AddPropertyButton } from './AddPropertyButton'
import type { CompareProperty } from '@/stores/compareStore'
import type { PriceFactor } from '@/types/chamgab'

const MAX_COMPARE = 4

export function CompareTable() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { propertyIds, removeProperty, setFromQuery } = useCompareStore()

  const [properties, setProperties] = useState<CompareProperty[]>([])
  const [factors, setFactors] = useState<Record<string, PriceFactor[]>>({})
  const [isLoading, setIsLoading] = useState(true)

  // URL 쿼리 → Zustand 동기화
  useEffect(() => {
    const idsParam = searchParams.get('ids')
    if (idsParam) {
      const ids = idsParam.split(',').filter(Boolean)
      setFromQuery(ids)
    }
  }, [searchParams, setFromQuery])

  // Zustand → URL 쿼리 동기화
  useEffect(() => {
    if (propertyIds.length === 0) {
      router.replace('/compare')
      return
    }

    const newQuery = `?ids=${propertyIds.join(',')}`
    if (searchParams.toString() !== `ids=${propertyIds.join(',')}`) {
      // @ts-expect-error - TypedRoutes는 동적 쿼리 파라미터를 지원하지 않음
      router.replace(`/compare${newQuery}`, { scroll: false })
    }
  }, [propertyIds, router, searchParams])

  // 매물 데이터 + 가격요인 가져오기
  useEffect(() => {
    if (propertyIds.length === 0) {
      setProperties([])
      setFactors({})
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    Promise.all(
      propertyIds.map(async (id) => {
        try {
          // 1. 매물 정보
          const propertyRes = await fetch(`/api/properties/${id}`)
          if (!propertyRes.ok) throw new Error('Property fetch failed')
          const property = await propertyRes.json()

          // 2. 참값 분석
          const chamgabRes = await fetch(`/api/chamgab?property_id=${id}`)
          let chamgab_price = null
          let analysis_id = null

          if (chamgabRes.ok) {
            const chamgabData = await chamgabRes.json()
            chamgab_price = chamgabData.analysis?.chamgab_price
            analysis_id = chamgabData.analysis?.id
          }

          // 3. 가격요인
          let priceFactors: PriceFactor[] = []
          if (analysis_id) {
            const factorsRes = await fetch(`/api/chamgab/${analysis_id}/factors`)
            if (factorsRes.ok) {
              const factorsData = await factorsRes.json()
              priceFactors = factorsData.factors || []
            }
          }

          // 4. 실거래가 (유사 거래)
          const transactionsRes = await fetch(`/api/properties/${id}/similar?limit=1`)
          let latest_price = null
          if (transactionsRes.ok) {
            const transactionsData = await transactionsRes.json()
            latest_price = transactionsData.transactions?.[0]?.price
          }

          return {
            property: {
              ...property,
              chamgab_price,
              latest_price,
            },
            factors: priceFactors,
          }
        } catch (error) {
          console.error(`Failed to fetch property ${id}:`, error)
          return null
        }
      })
    )
      .then((results) => {
        const validResults = results.filter((r) => r !== null)
        setProperties(validResults.map((r) => r!.property))
        setFactors(
          validResults.reduce(
            (acc, r) => {
              acc[r!.property.id] = r!.factors
              return acc
            },
            {} as Record<string, PriceFactor[]>
          )
        )
      })
      .finally(() => setIsLoading(false))
  }, [propertyIds])

  const handleRemove = (id: string) => {
    removeProperty(id)
  }

  const handleAddProperty = () => {
    // TODO: 검색 모달 열기
    alert('검색 모달 구현 예정 (Phase 5)')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">매물 정보를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (propertyIds.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-gray-600 mb-4">비교할 매물을 추가해주세요</p>
          <button
            onClick={handleAddProperty}
            className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            매물 추가하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max px-4 sm:px-0">
        <AnimatePresence mode="popLayout">
          {properties.map((property) => (
            <PropertyColumn
              key={property.id}
              property={property}
              factors={factors[property.id]}
              onRemove={() => handleRemove(property.id)}
            />
          ))}

          {/* 매물 추가 버튼 (4개 미만일 때) */}
          {propertyIds.length < MAX_COMPARE && (
            <AddPropertyButton onClick={handleAddProperty} />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
