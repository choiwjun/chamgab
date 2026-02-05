// 단지 목록 컴포넌트 (Editorial Luxury 스타일 + 무한 스크롤)

'use client'

import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
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
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-48 animate-pulse border border-editorial-dark/5 bg-editorial-sand/30"
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
      <div className="border border-editorial-dark/10 bg-white p-16 text-center">
        <Building2 className="mx-auto h-12 w-12 text-editorial-ink/20 mb-6" />
        <h3 className="font-serif text-xl text-editorial-dark mb-2">
          검색 결과가 없습니다
        </h3>
        <p className="text-sm text-editorial-ink/50">다른 지역을 검색해보세요</p>
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
          개 단지
        </span>
      </div>

      {/* 단지 그리드 */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {allComplexes.map((complex, index) => (
          <ComplexCard key={complex.id} complex={complex} index={index} />
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
        {!hasNextPage && allComplexes.length > 0 && (
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
