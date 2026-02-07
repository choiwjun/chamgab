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
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-6 py-12 md:px-8 md:py-16">
        {/* 헤더 */}
        <div className="mb-12">
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-[#191F28] md:text-5xl">
            관심 매물
          </h1>
          <p className="max-w-xl text-[#4E5968]">
            저장한 매물을 확인하고 가격 변동 알림을 받아보세요
          </p>
        </div>

        {/* 구분선 */}
        <div className="mb-12 h-px bg-[#E5E8EB]" />

        {/* 리스트 */}
        <FavoritesList />
      </div>
    </main>
  )
}
