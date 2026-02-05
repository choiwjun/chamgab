// @TASK P4-S6-T4 - 관심 매물 리스트 컴포넌트
// @SPEC specs/screens/favorites.yaml

'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import type { Favorite, FavoriteQueryParams } from '@/types/favorite'
import { FavoriteCard } from './FavoriteCard'
import { EmptyFavorites } from './EmptyFavorites'

interface FavoritesListProps {
  initialData?: Favorite[]
  userId?: string
}

export function FavoritesList({ initialData = [], userId }: FavoritesListProps) {
  const [favorites, setFavorites] = useState<Favorite[]>(initialData)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'created_at' | 'price'>('created_at')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // 데이터 가져오기
  const fetchFavorites = async (pageNum: number = 1) => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '20',
        sort: sortBy,
        ...(userId && { user_id: userId }),
      })

      const res = await fetch(`/api/favorites?${params}`)

      if (!res.ok) {
        throw new Error('Failed to fetch favorites')
      }

      const data = await res.json()

      if (pageNum === 1) {
        setFavorites(data.items || [])
      } else {
        setFavorites((prev) => [...prev, ...(data.items || [])])
      }

      setHasMore(data.items.length >= 20)
    } catch (err) {
      console.error('Failed to fetch favorites:', err)
      setError('관심 매물을 불러오는데 실패했습니다.')
      setFavorites([])
    } finally {
      setIsLoading(false)
    }
  }

  // 초기 로드
  useEffect(() => {
    if (initialData.length === 0) {
      fetchFavorites(1)
    }
  }, [sortBy])

  // 삭제 핸들러
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/favorites/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to delete favorite')
      }

      // UI에서 즉시 제거
      setFavorites((prev) => prev.filter((f) => f.id !== id))
    } catch (err) {
      console.error('Failed to delete favorite:', err)
      alert('삭제에 실패했습니다.')
      throw err
    }
  }

  // 알림 토글 핸들러
  const handleToggleNotify = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/favorites/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notify_enabled: enabled }),
      })

      if (!res.ok) {
        throw new Error('Failed to toggle notify')
      }

      // UI 업데이트
      setFavorites((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, notify_enabled: enabled } : f
        )
      )
    } catch (err) {
      console.error('Failed to toggle notify:', err)
      alert('알림 설정에 실패했습니다.')
      throw err
    }
  }

  // 더 보기
  const handleLoadMore = () => {
    fetchFavorites(page + 1)
    setPage((p) => p + 1)
  }

  // 로딩 스켈레톤
  if (isLoading && favorites.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-52 animate-pulse border border-editorial-dark/5 bg-editorial-sand/30"
          />
        ))}
      </div>
    )
  }

  // 에러
  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="mb-6 text-editorial-ink/70">{error}</p>
          <button
            onClick={() => fetchFavorites(1)}
            className="border border-editorial-dark bg-editorial-dark px-6 py-2.5 text-sm tracking-wide text-white hover:bg-editorial-gold hover:border-editorial-gold transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  // 빈 상태
  if (favorites.length === 0) {
    return <EmptyFavorites />
  }

  return (
    <div>
      {/* 정렬 옵션 */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm tracking-wide text-editorial-ink/50">총</span>
          <span className="font-serif text-2xl text-editorial-gold">{favorites.length}</span>
          <span className="text-sm tracking-wide text-editorial-ink/50">개</span>
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'created_at' | 'price')}
          className="border border-editorial-dark/10 bg-white px-4 py-2 text-sm text-editorial-dark focus:border-editorial-gold focus:outline-none transition-colors"
        >
          <option value="created_at">최신순</option>
          <option value="price">가격순</option>
        </select>
      </div>

      {/* 리스트 */}
      <AnimatePresence>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map((favorite, index) => (
            <FavoriteCard
              key={favorite.id}
              favorite={favorite}
              onDelete={handleDelete}
              onToggleNotify={handleToggleNotify}
              index={index}
            />
          ))}
        </div>
      </AnimatePresence>

      {/* 더 보기 버튼 */}
      {hasMore && (
        <div className="mt-12 text-center">
          <button
            onClick={handleLoadMore}
            disabled={isLoading}
            className="border border-editorial-dark/20 px-8 py-3 text-sm tracking-widest uppercase text-editorial-dark hover:bg-editorial-dark hover:text-white transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  )
}
