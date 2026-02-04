// @TASK P3-S5-T1 - 로그인 페이지
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
  searchParams: Promise<{ redirect?: string }>
}) {
  // Server Component에서 searchParams를 await
  const params = await searchParams
  const redirectUrl = params.redirect || '/'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* 로고 */}
        <div className="text-center">
          <Link href="/" className="inline-block">
            <h1 className="text-chamgab-large font-bold text-primary">참값</h1>
          </Link>
          <p className="mt-2 text-sm text-gray-600">
            AI가 분석하는 부동산의 진짜 가치
          </p>
        </div>

        {/* 로그인 폼 */}
        <LoginForm redirectUrl={redirectUrl} />

        {/* 하단 링크 */}
        <div className="text-center text-sm">
          <span className="text-gray-600">계정이 없으신가요? </span>
          <Link
            href="/auth/signup"
            className="font-medium text-primary hover:underline"
          >
            회원가입
          </Link>
        </div>
      </div>
    </div>
  )
}
