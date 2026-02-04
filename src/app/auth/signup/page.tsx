// @TASK P3-S6-T1 - 회원가입 페이지
import { Metadata } from 'next'
import Link from 'next/link'
import { SignupForm } from '@/components/auth/SignupForm'

export const metadata: Metadata = {
  title: '회원가입 | 참값',
  description: 'AI 기반 부동산 가격 분석 서비스 참값에 가입하세요.',
}

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* 로고 */}
        <div className="text-center">
          <Link href="/" className="inline-block">
            <h1 className="text-chamgab-large font-bold text-primary">참값</h1>
          </Link>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">회원가입</h2>
          <p className="mt-2 text-sm text-gray-600">
            참값과 함께 부동산의 진짜 가치를 찾아보세요
          </p>
        </div>

        {/* 회원가입 폼 */}
        <SignupForm />

        {/* 하단 링크 */}
        <div className="text-center text-sm">
          <span className="text-gray-600">이미 계정이 있으신가요? </span>
          <Link
            href="/auth/login"
            className="font-medium text-primary hover:underline"
          >
            로그인
          </Link>
        </div>
      </div>
    </div>
  )
}
