import type { Metadata } from 'next'
import { MyPageContent } from '@/components/mypage/MyPageContent'

export const metadata: Metadata = {
  title: '마이페이지 | 참값',
  description: '회원 정보와 크레딧 사용량을 관리합니다.',
}

export default function MyPage() {
  return (
    <main className="min-h-screen bg-white">
      <MyPageContent />
    </main>
  )
}
