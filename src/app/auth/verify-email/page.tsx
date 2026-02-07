// @TASK P3-S6 - 이메일 인증 안내 페이지
import { Metadata } from 'next'
import Link from 'next/link'
import { Mail } from 'lucide-react'

export const metadata: Metadata = {
  title: '이메일 인증 | 참값',
  description: '이메일을 확인하여 회원가입을 완료하세요.',
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const params = await searchParams
  const email = params.email

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md text-center">
        {/* 아이콘 */}
        <div className="mx-auto mb-8">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
            <Mail className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        {/* 제목 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            이메일을 확인해주세요
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-gray-600">
            {email ? (
              <>
                <span className="font-semibold text-gray-900">{email}</span>
                <br />
                으로 인증 메일을 발송했습니다.
              </>
            ) : (
              '입력하신 이메일로 인증 메일을 발송했습니다.'
            )}
          </p>
        </div>

        {/* 안내 */}
        <div className="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-5 text-left">
          <p className="mb-3 text-sm font-semibold text-gray-900">
            이메일이 도착하지 않았나요?
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-blue-500">•</span>
              <span>스팸 메일함을 확인해주세요</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500">•</span>
              <span>이메일 주소가 정확한지 확인해주세요</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500">•</span>
              <span>몇 분 후 다시 시도해주세요</span>
            </li>
          </ul>
        </div>

        {/* 버튼 */}
        <div className="space-y-3">
          <Link
            href="/auth/login"
            className="block w-full rounded-lg bg-blue-500 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
          >
            로그인
          </Link>
          <Link
            href="/"
            className="block w-full rounded-lg border border-gray-200 bg-white px-4 py-3.5 text-sm text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </main>
  )
}
