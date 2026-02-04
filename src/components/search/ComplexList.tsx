// 단지 목록 컴포넌트 (무한 스크롤)

'use client'

import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ComplexCard } from './ComplexCard'
import type { Complex } from '@/types/complex'

interface ComplexListProps {
  sigungu?: string
  keyword?: string
}

interface ComplexListResponse {
  items: Complex[]
  total: number
  page: number
  limit: number
}

async function fetchComplexes(
  sigungu?: string,
  keyword?: string,
  page: number = 1
): Promise<ComplexListResponse> {
  const params = new URLSearchParams()
  if (sigungu) params.set('sigungu', sigungu)
  if (keyword) params.set('keyword', keyword)
  params.set('page', String(page))
  params.set('limit', '20')

  const res = await fetch(`/api/complexes?${params.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch complexes')

  return res.json()
}

export function ComplexList({ sigungu, keyword }: ComplexListProps) {
  const observerTarget = useRef<HTMLDivElement>(null)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['complexes', sigungu, keyword],
    queryFn: ({ pageParam = 1 }) => fetchComplexes(sigungu, keyword, pageParam),
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
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
          단지 목록을 불러오는 중 오류가 발생했습니다.
        </p>
      </div>
    )
  }

  const allComplexes = data?.pages.flatMap((page) => page.items) || []
  const totalCount = data?.pages[0]?.total || 0

  // 결과 없음
  if (allComplexes.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <div className="mb-4 text-6xl">🏢</div>
        <h3 className="mb-2 text-xl font-semibold text-gray-900">
          검색 결과가 없습니다
        </h3>
        <p className="text-gray-600">다른 지역을 검색해보세요</p>
      </div>
    )
  }

  return (
    <div>
      {/* 검색 결과 개수 */}
      <div className="mb-4 text-sm text-gray-600">
        총{' '}
        <span className="font-semibold text-primary">
          {totalCount.toLocaleString()}
        </span>
        개 단지
      </div>

      {/* 단지 그리드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allComplexes.map((complex, index) => (
          <ComplexCard key={complex.id} complex={complex} index={index} />
        ))}
      </div>

      {/* Intersection Observer 타겟 */}
      <div ref={observerTarget} className="py-8 text-center">
        {isFetchingNextPage && (
          <div className="flex items-center justify-center gap-2">
            <div className="border-3 h-6 w-6 animate-spin rounded-full border-primary border-t-transparent" />
            <span className="text-gray-600">더 많은 단지를 불러오는 중...</span>
          </div>
        )}
        {!hasNextPage && allComplexes.length > 0 && (
          <p className="text-gray-500">모든 단지를 확인했습니다</p>
        )}
      </div>
    </div>
  )
}
