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
          <p>
            브릭소프트(이하 &quot;회사&quot;)는 「개인정보 보호법」에 따라
            이용자의 개인정보를 보호하고 이와 관련한 고충을 신속하게 처리하기
            위하여 다음과 같이 개인정보처리방침을 수립·공개합니다.
          </p>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              1. 수집하는 개인정보 항목
            </h2>
            <p className="mb-2 font-medium text-[#191F28]">
              가. 회원가입 시 (이메일 방식)
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>필수: 이메일 주소, 비밀번호(암호화 저장)</li>
              <li>선택: 이름, 프로필 이미지</li>
            </ul>
            <p className="mb-2 mt-4 font-medium text-[#191F28]">
              나. 소셜 로그인 시 (Google, 카카오, 네이버)
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>필수: 이메일 주소 (소셜 계정에 등록된 이메일)</li>
              <li>
                선택: 프로필 이미지, 닉네임 (각 소셜 서비스 동의항목에 따라
                수집)
              </li>
            </ul>
            <p className="mb-2 mt-4 font-medium text-[#191F28]">
              다. 서비스 이용 과정에서 자동 수집
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>서비스 이용 기록, 접속 로그, IP 주소</li>
              <li>쿠키, 기기 정보 (브라우저 종류, OS)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              2. 개인정보의 수집 및 이용 목적
            </h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>회원 가입 의사 확인 및 회원 식별·인증</li>
              <li>
                서비스 제공: 아파트 참값 분석, 상권 분석, 학군 분석, 관심 매물
                관리
              </li>
              <li>크레딧 사용 내역 관리</li>
              <li>서비스 개선 및 이용 통계 분석</li>
              <li>서비스 관련 공지사항 및 알림 전달</li>
              <li>부정 이용 방지 및 서비스 안정성 확보</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              3. 개인정보의 보유 및 이용 기간
            </h2>
            <p>
              회원 탈퇴 시 지체 없이 파기합니다. 단, 관련 법령에 따라 보존이
              필요한 경우 해당 기간 동안 별도 보관합니다.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래 등에서의
                소비자보호에 관한 법률)
              </li>
              <li>
                소비자의 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래
                등에서의 소비자보호에 관한 법률)
              </li>
              <li>웹사이트 방문 기록(접속 로그): 3개월 (통신비밀보호법)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              4. 개인정보의 제3자 제공
            </h2>
            <p>
              회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.
              단, 다음의 경우에는 예외로 합니다.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>이용자가 사전에 동의한 경우</li>
              <li>
                법령의 규정에 의하거나, 수사 목적으로 법령에 정해진 절차와
                방법에 따라 수사기관의 요구가 있는 경우
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              5. 개인정보 처리 위탁
            </h2>
            <p>
              회사는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를
              위탁하고 있습니다.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E5E8EB]">
                    <th className="px-3 py-2 text-left font-medium text-[#191F28]">
                      수탁업체
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[#191F28]">
                      위탁 업무
                    </th>
                  </tr>
                </thead>
                <tbody className="text-[#4E5968]">
                  <tr className="border-b border-[#E5E8EB]">
                    <td className="px-3 py-2">Supabase Inc.</td>
                    <td className="px-3 py-2">회원 데이터 저장 및 인증 처리</td>
                  </tr>
                  <tr className="border-b border-[#E5E8EB]">
                    <td className="px-3 py-2">Vercel Inc.</td>
                    <td className="px-3 py-2">웹 서비스 호스팅 및 배포</td>
                  </tr>
                  <tr className="border-b border-[#E5E8EB]">
                    <td className="px-3 py-2">Google LLC</td>
                    <td className="px-3 py-2">소셜 로그인 인증</td>
                  </tr>
                  <tr className="border-b border-[#E5E8EB]">
                    <td className="px-3 py-2">카카오</td>
                    <td className="px-3 py-2">소셜 로그인 인증</td>
                  </tr>
                  <tr className="border-b border-[#E5E8EB]">
                    <td className="px-3 py-2">네이버</td>
                    <td className="px-3 py-2">소셜 로그인 인증</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              6. 개인정보의 안전성 확보 조치
            </h2>
            <p>
              회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고
              있습니다.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>비밀번호 암호화 저장</li>
              <li>SSL/TLS 통신 암호화</li>
              <li>데이터베이스 접근 권한 관리 및 행 수준 보안 적용</li>
              <li>정기적 보안 점검 및 취약점 대응</li>
              <li>개인정보 접근 기록 관리</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              7. 쿠키의 운영 및 관리
            </h2>
            <p>
              회사는 이용자의 인증 상태 유지 및 서비스 이용 편의를 위해 쿠키를
              사용합니다. 이용자는 웹 브라우저의 설정을 통해 쿠키 저장을
              거부하거나 삭제할 수 있으나, 이 경우 로그인 등 일부 서비스 이용에
              제한이 있을 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              8. 이용자의 권리와 행사 방법
            </h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                이용자는 언제든지 자신의 개인정보에 대해 열람, 수정, 삭제를
                요청할 수 있습니다.
              </li>
              <li>
                마이페이지에서 직접 수정하거나, 이메일을 통해 요청할 수
                있습니다.
              </li>
              <li>
                회원 탈퇴를 통해 개인정보 처리에 대한 동의를 철회할 수 있습니다.
              </li>
              <li>만 14세 미만 아동의 개인정보는 수집하지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              9. 개인정보 보호책임자
            </h2>
            <ul className="list-none space-y-1 pl-0">
              <li>
                <strong className="text-[#191F28]">회사명:</strong> 브릭소프트
              </li>
              <li>
                <strong className="text-[#191F28]">개인정보 보호책임자:</strong>{' '}
                대표
              </li>
              <li>
                <strong className="text-[#191F28]">이메일:</strong>{' '}
                bricksoft@bricksoft.co.kr
              </li>
            </ul>
            <p className="mt-3">
              이용자는 서비스 이용 중 발생하는 모든 개인정보 보호 관련 문의,
              불만, 피해 구제 등을 위 연락처로 신고하실 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              10. 권익침해 구제 방법
            </h2>
            <p>
              개인정보 침해에 대한 신고·상담이 필요하신 경우 아래 기관에 문의해
              주시기 바랍니다.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>개인정보침해 신고센터 (privacy.kisa.or.kr / 국번없이 118)</li>
              <li>개인정보 분쟁조정위원회 (www.kopico.go.kr / 1833-6972)</li>
              <li>대검찰청 사이버수사과 (www.spo.go.kr / 국번없이 1301)</li>
              <li>경찰청 사이버수사국 (ecrm.police.go.kr / 국번없이 182)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              11. 개인정보처리방침의 변경
            </h2>
            <p>
              이 개인정보처리방침은 시행일로부터 적용되며, 법령 또는 서비스
              변경에 따라 내용이 추가·삭제·수정될 수 있습니다. 변경 시 시행일
              최소 7일 전에 서비스 내 공지사항을 통해 안내드립니다.
            </p>
          </section>

          <p className="pt-4 text-sm text-[#8B95A1]">시행일: 2026년 2월 20일</p>
        </div>
      </div>
    </div>
  )
}
