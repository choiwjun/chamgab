// @TASK P4-S6-T5 - 관심 매물 페이지
// @SPEC specs/screens/favorites.yaml

import { Metadata } from 'next'
import { FavoritesList } from '@/components/favorites/FavoritesList'

export const metadata: Metadata = {
  title: '관심 매물 - 참값',
  description: '저장한 매물을 확인하고 가격 변동 알림을 관리하세요',
}

export default function FavoritesPage() {
  // TODO: 실제 인증 구현 시 서버 컴포넌트에서 세션 확인
  // const session = await getServerSession()
  // if (!session) redirect('/auth/login?redirect=/favorites')

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">관심 매물</h1>
          <p className="mt-2 text-gray-600">
            저장한 매물을 확인하고 가격 변동 알림을 받아보세요
          </p>
        </div>

        {/* 리스트 */}
        <FavoritesList />
      </div>
    </main>
  )
}
