// @TASK P2-S2-T3 - 매물 리스트 (무한 스크롤)
// @SPEC specs/screens/search-list.yaml
// @TEST tests/components/search/PropertyList.test.tsx

'use client'

import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { PropertyCard } from '@/components/common/PropertyCard'
import type { PropertyQueryParams, PropertyResponse } from '@/types/property'

interface PropertyListProps {
  filters: PropertyQueryParams
}

async function fetchProperties(
  filters: PropertyQueryParams,
  page: number
): Promise<PropertyResponse> {
  const params = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(filters).filter(([_, v]) => v !== undefined)
    ),
    page: String(page),
    limit: '20',
  } as Record<string, string>)

  const res = await fetch(`/api/properties?${params.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch properties')

  return res.json()
}

export function PropertyList({ filters }: PropertyListProps) {
  const observerTarget = useRef<HTMLDivElement>(null)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['properties', filters],
    queryFn: ({ pageParam = 1 }) => fetchProperties(filters, pageParam),
    getNextPageParam: (lastPage) => {
      const currentPage = lastPage.page
      const totalPages = Math.ceil(lastPage.total / lastPage.limit)
      return currentPage < totalPages ? currentPage + 1 : undefined
    },
    initialPageParam: 1,
  })

  // Intersection Observer로 무한 스크롤 구현
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-80 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
          />
        ))}
      </div>
    )
  }

  // 에러 상태
  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-red-600">
          매물 목록을 불러오는 중 오류가 발생했습니다.
        </p>
      </div>
    )
  }

  const allProperties = data?.pages.flatMap((page) => page.items) || []
  const totalCount = data?.pages[0]?.total || 0

  // 결과 없음
  if (allProperties.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <div className="mb-4 text-6xl">🏠</div>
        <h3 className="mb-2 text-xl font-semibold text-gray-900">
          검색 결과가 없습니다
        </h3>
        <p className="text-gray-600">
          필터 조건을 변경하거나 다른 지역을 선택해보세요
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* 검색 결과 개수 */}
      <div className="mb-4 text-sm text-gray-600">
        총 <span className="font-semibold text-primary">{totalCount.toLocaleString()}</span>개의 매물
      </div>

      {/* 매물 그리드 */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {allProperties.map((property, index) => (
          <PropertyCard key={property.id} property={property} index={index} />
        ))}
      </div>

      {/* Intersection Observer 타겟 */}
      <div ref={observerTarget} className="py-8 text-center">
        {isFetchingNextPage && (
          <div className="flex items-center justify-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="text-gray-600">더 많은 매물을 불러오는 중...</span>
          </div>
        )}
        {!hasNextPage && allProperties.length > 0 && (
          <p className="text-gray-500">모든 매물을 확인했습니다</p>
        )}
      </div>
    </div>
  )
}
