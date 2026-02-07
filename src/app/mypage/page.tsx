// @TASK P4-S4 - 마이페이지 (Editorial Luxury 스타일)
import { Metadata } from 'next'
import { MyPageContent } from '@/components/mypage/MyPageContent'

export const metadata: Metadata = {
  title: '마이페이지 | 참값',
  description: '내 정보 및 구독 관리',
}

export default function MyPage() {
  return (
    <main className="min-h-screen bg-white">
      <MyPageContent />
    </main>
  )
}
