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
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="mb-12 text-center">
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              참값
            </h1>
          </Link>
          <p className="mt-3 text-sm text-gray-600">
            AI가 분석하는 부동산의 진짜 가치
          </p>
        </div>

        {/* 회원가입 폼 */}
        <SignupForm />

        {/* 하단 링크 */}
        <div className="mt-8 text-center text-sm">
          <span className="text-gray-600">이미 계정이 있으신가요? </span>
          <Link
            href="/auth/login"
            className="text-blue-500 transition-colors hover:text-blue-600"
          >
            로그인
          </Link>
        </div>
      </div>
    </main>
  )
}
