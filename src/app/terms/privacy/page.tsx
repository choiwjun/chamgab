import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: '개인정보처리방침 - 참값',
  description: '참값 서비스 개인정보처리방침',
}

export default function PrivacyPolicyPage() {
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

        <h1 className="mb-8 text-3xl font-bold text-[#191F28]">
          개인정보처리방침
        </h1>

        <div className="space-y-8 leading-relaxed text-[#4E5968]">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              1. 수집하는 개인정보 항목
            </h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>필수: 이메일 주소, 비밀번호(암호화 저장)</li>
              <li>선택: 이름, 프로필 이미지</li>
              <li>자동 수집: 서비스 이용 기록, 접속 로그, IP 주소</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              2. 개인정보의 수집 및 이용 목적
            </h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>회원 가입 및 관리</li>
              <li>서비스 제공 (분석 결과 저장, 관심 매물 관리)</li>
              <li>서비스 개선 및 통계 분석</li>
              <li>알림 서비스 제공</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              3. 개인정보의 보유 및 이용 기간
            </h2>
            <p>
              회원 탈퇴 시 즉시 파기합니다. 단, 관련 법령에 따라 보존이 필요한
              경우 해당 기간 동안 보관합니다.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>전자상거래 관련 기록: 5년</li>
              <li>접속 로그: 3개월</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              4. 개인정보의 제3자 제공
            </h2>
            <p>
              서비스는 이용자의 동의 없이 개인정보를 제3자에게 제공하지
              않습니다. 단, 법령에 의한 경우는 예외로 합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              5. 개인정보의 안전성 확보 조치
            </h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>비밀번호 암호화 저장 (bcrypt)</li>
              <li>SSL/TLS 통신 암호화</li>
              <li>접근 권한 관리 (Supabase RLS)</li>
              <li>정기적 보안 점검</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              6. 이용자의 권리
            </h2>
            <p>
              이용자는 언제든지 자신의 개인정보에 대해 열람, 수정, 삭제를 요청할
              수 있으며, 회원 탈퇴를 통해 개인정보 삭제를 요청할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              7. 연락처
            </h2>
            <p>
              개인정보 관련 문의:{' '}
              <strong className="text-[#191F28]">support@chamgab.com</strong>
            </p>
          </section>

          <p className="pt-4 text-sm text-[#8B95A1]">시행일: 2026년 2월 6일</p>
        </div>
      </div>
    </div>
  )
}
