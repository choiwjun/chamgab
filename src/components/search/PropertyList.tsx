// @TASK P2-S2-T3 - 매물 리스트 (Editorial Luxury 스타일 + 무한 스크롤)
// @SPEC specs/screens/search-list.yaml

'use client'

import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Home } from 'lucide-react'
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
            className="h-52 animate-pulse border border-editorial-dark/5 bg-editorial-sand/30"
          />
        ))}
      </div>
    )
  }

  // 에러 상태
  if (isError) {
    return (
      <div className="border border-editorial-dark/10 bg-white p-12 text-center">
        <p className="text-editorial-ink/70">
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
      <div className="border border-editorial-dark/10 bg-white p-16 text-center">
        <Home className="mx-auto h-12 w-12 text-editorial-ink/20 mb-6" />
        <h3 className="font-serif text-xl text-editorial-dark mb-2">
          검색 결과가 없습니다
        </h3>
        <p className="text-sm text-editorial-ink/50">
          필터 조건을 변경하거나 다른 지역을 선택해보세요
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* 검색 결과 개수 */}
      <div className="mb-8 flex items-center gap-3">
        <span className="text-sm tracking-wide text-editorial-ink/50">
          총
        </span>
        <span className="font-serif text-2xl text-editorial-gold">
          {totalCount.toLocaleString()}
        </span>
        <span className="text-sm tracking-wide text-editorial-ink/50">
          개 매물
        </span>
      </div>

      {/* 매물 그리드 */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {allProperties.map((property, index) => (
          <PropertyCard key={property.id} property={property} index={index} />
        ))}
      </div>

      {/* Intersection Observer 타겟 */}
      <div ref={observerTarget} className="py-12 text-center">
        {isFetchingNextPage && (
          <div className="flex flex-col items-center gap-3">
            <div className="h-px w-8 bg-editorial-gold animate-pulse" />
            <span className="text-xs tracking-widest uppercase text-editorial-ink/40">
              Loading more
            </span>
          </div>
        )}
        {!hasNextPage && allProperties.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <div className="h-px w-16 bg-editorial-dark/10" />
            <p className="text-xs tracking-widest uppercase text-editorial-ink/30">
              End of Results
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
