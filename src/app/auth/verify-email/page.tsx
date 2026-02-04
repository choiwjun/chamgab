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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* 아이콘 */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-10 w-10 text-primary" />
        </div>

        {/* 제목 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">이메일을 확인해주세요</h1>
          <p className="mt-2 text-gray-600">
            {email ? (
              <>
                <span className="font-medium text-gray-900">{email}</span>
                <br />
                으로 인증 메일을 발송했습니다.
              </>
            ) : (
              '입력하신 이메일로 인증 메일을 발송했습니다.'
            )}
          </p>
        </div>

        {/* 안내 */}
        <div className="rounded-lg bg-blue-50 p-4 text-left text-sm text-blue-800">
          <p className="font-medium">이메일이 도착하지 않았나요?</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-blue-700">
            <li>스팸 메일함을 확인해주세요</li>
            <li>이메일 주소가 정확한지 확인해주세요</li>
            <li>몇 분 후 다시 시도해주세요</li>
          </ul>
        </div>

        {/* 버튼 */}
        <div className="space-y-3">
          <Link
            href="/auth/login"
            className="block w-full rounded-lg bg-primary px-4 py-3 font-medium text-white transition hover:bg-primary/90"
          >
            로그인 페이지로 이동
          </Link>
          <Link
            href="/"
            className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  )
}
