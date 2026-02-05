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
    <main className="flex min-h-screen flex-col items-center justify-center bg-editorial-bg px-6 py-12">
      <div className="w-full max-w-md text-center">
        {/* 아이콘 */}
        <div className="mx-auto mb-8">
          <div className="inline-flex h-20 w-20 items-center justify-center border border-editorial-gold/30 bg-editorial-gold/5">
            <Mail className="h-8 w-8 text-editorial-gold" />
          </div>
        </div>

        {/* 제목 */}
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-editorial-dark">이메일을 확인해주세요</h1>
          <div className="w-12 h-px bg-editorial-gold/50 mx-auto my-4" />
          <p className="text-sm text-editorial-ink/60 leading-relaxed">
            {email ? (
              <>
                <span className="font-medium text-editorial-dark">{email}</span>
                <br />
                으로 인증 메일을 발송했습니다.
              </>
            ) : (
              '입력하신 이메일로 인증 메일을 발송했습니다.'
            )}
          </p>
        </div>

        {/* 안내 */}
        <div className="border-l-2 border-editorial-gold bg-editorial-sand/30 p-5 text-left mb-8">
          <p className="text-xs tracking-widest uppercase text-editorial-dark mb-3">이메일이 도착하지 않았나요?</p>
          <ul className="space-y-2 text-sm text-editorial-ink/70">
            <li className="flex items-start gap-2">
              <span className="text-editorial-gold mt-1">—</span>
              <span>스팸 메일함을 확인해주세요</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-editorial-gold mt-1">—</span>
              <span>이메일 주소가 정확한지 확인해주세요</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-editorial-gold mt-1">—</span>
              <span>몇 분 후 다시 시도해주세요</span>
            </li>
          </ul>
        </div>

        {/* 버튼 */}
        <div className="space-y-3">
          <Link
            href="/auth/login"
            className="block w-full bg-editorial-dark px-4 py-3.5 text-sm tracking-widest uppercase text-white transition-colors hover:bg-editorial-gold"
          >
            Sign In
          </Link>
          <Link
            href="/"
            className="block w-full border border-editorial-dark/10 bg-white px-4 py-3.5 text-sm tracking-wide text-editorial-dark transition-colors hover:border-editorial-dark/30"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </main>
  )
}
