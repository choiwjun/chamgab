import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: '이용약관 - 참값',
  description: '참값 서비스 이용약관',
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href={'/auth/signup' as never}
          className="mb-8 inline-flex items-center gap-2 text-sm text-[#4E5968] hover:text-[#191F28]"
        >
          <ArrowLeft className="h-4 w-4" />
          돌아가기
        </Link>

        <h1 className="mb-8 text-3xl font-bold text-[#191F28]">이용약관</h1>

        <div className="space-y-8 leading-relaxed text-[#4E5968]">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제1조 (목적)
            </h2>
            <p>
              이 약관은 참값(이하 &quot;서비스&quot;)이 제공하는 AI 기반 부동산
              가격 분석 서비스의 이용조건 및 절차, 이용자와 서비스 제공자의
              권리, 의무, 책임사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제2조 (정의)
            </h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>
                &quot;서비스&quot;란 참값이 제공하는 부동산 가격 분석, 상권
                분석, 투자 분석 등의 온라인 서비스를 말합니다.
              </li>
              <li>
                &quot;이용자&quot;란 이 약관에 따라 서비스를 이용하는 자를
                말합니다.
              </li>
              <li>
                &quot;참값 분석&quot;이란 AI 모델을 활용한 부동산 적정 가격 분석
                결과를 말합니다.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제3조 (서비스의 내용)
            </h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>AI 기반 아파트 적정 가격 분석</li>
              <li>상권 분석 및 창업 성공 확률 예측</li>
              <li>통합 투자 대시보드</li>
              <li>가격 변동 알림 서비스</li>
              <li>PDF 투자 리포트 생성</li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제4조 (면책조항)
            </h2>
            <p>
              본 서비스에서 제공하는 분석 결과는 참고 자료이며, 실제 투자 결정에
              대한 책임은 이용자 본인에게 있습니다. 서비스 제공자는 분석 결과의
              정확성을 보장하지 않으며, 이를 기반으로 한 투자 손실에 대해 책임을
              지지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제5조 (개인정보 보호)
            </h2>
            <p>
              서비스는 이용자의 개인정보를 관련 법령에 따라 보호하며, 자세한
              내용은{' '}
              <Link
                href={'/terms/privacy' as never}
                className="font-medium text-[#3182F6] hover:underline"
              >
                개인정보처리방침
              </Link>
              에서 확인할 수 있습니다.
            </p>
          </section>

          <p className="pt-4 text-sm text-[#8B95A1]">시행일: 2026년 2월 6일</p>
        </div>
      </div>
    </div>
  )
}
