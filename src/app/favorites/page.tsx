// @TASK P4-S6-T5 - 관심 매물 페이지 (Editorial Luxury 스타일)
// @SPEC specs/screens/favorites.yaml

import { Metadata } from 'next'
import { FavoritesList } from '@/components/favorites/FavoritesList'

export const metadata: Metadata = {
  title: '관심 매물 - 참값',
  description: '저장한 매물을 확인하고 가격 변동 알림을 관리하세요',
}

export default function FavoritesPage() {
  return (
    <main className="min-h-screen bg-editorial-bg">
      <div className="mx-auto max-w-7xl px-6 md:px-8 py-12 md:py-16">
        {/* 섹션 라벨 */}
        <div className="mb-6">
          <span className="inline-flex items-center gap-3 text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
            <span className="w-8 h-px bg-editorial-gold" />
            My Collection
          </span>
        </div>

        {/* 헤더 */}
        <div className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl text-editorial-dark tracking-tight mb-4">
            관심 <span className="text-editorial-gold italic">매물</span>
          </h1>
          <p className="text-editorial-ink/60 max-w-xl">
            저장한 매물을 확인하고 가격 변동 알림을 받아보세요
          </p>
        </div>

        {/* 구분선 */}
        <div className="h-px bg-editorial-dark/10 mb-12" />

        {/* 리스트 */}
        <FavoritesList />
      </div>
    </main>
  )
}
