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
    <main className="flex min-h-screen flex-col items-center justify-center bg-editorial-bg px-6 py-12">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-12">
          <Link href="/" className="inline-block">
            <h1 className="font-display text-4xl text-editorial-gold italic tracking-tight">
              참값
            </h1>
          </Link>
          <div className="mt-4 flex justify-center">
            <div className="w-12 h-px bg-editorial-gold/50" />
          </div>
          <p className="mt-4 text-sm text-editorial-ink/50 tracking-wide">
            AI가 분석하는 부동산의 진짜 가치
          </p>
        </div>

        {/* 회원가입 폼 */}
        <SignupForm />

        {/* 하단 링크 */}
        <div className="text-center text-sm mt-8">
          <span className="text-editorial-ink/50">이미 계정이 있으신가요? </span>
          <Link
            href="/auth/login"
            className="text-editorial-gold hover:text-editorial-dark transition-colors"
          >
            로그인
          </Link>
        </div>
      </div>
    </main>
  )
}
