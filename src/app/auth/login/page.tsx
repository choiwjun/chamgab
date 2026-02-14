// @TASK P3-S5-T1 - 로그인 페이지 (Editorial Luxury 스타일)
import { Metadata } from 'next'
import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = {
  title: '로그인 | 참값',
  description: 'AI 기반 부동산 가격 분석 서비스 참값에 로그인하세요.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>
}) {
  const params = await searchParams
  const redirectUrl = params.redirect || '/'
  const error = params.error

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

        {error === 'suspended' && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            정지된 계정입니다. 관리자에게 문의해주세요.
          </div>
        )}
        {error === 'forced_logout' && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            보안상 로그아웃 처리되었습니다. 다시 로그인해주세요.
          </div>
        )}

        {/* 로그인 폼 */}
        <LoginForm redirectUrl={redirectUrl} />

        {/* 하단 링크 */}
        <div className="mt-8 text-center text-sm">
          <span className="text-gray-600">계정이 없으신가요? </span>
          <Link
            href="/auth/signup"
            className="text-blue-500 transition-colors hover:text-blue-600"
          >
            회원가입
          </Link>
        </div>
      </div>
    </main>
  )
}
