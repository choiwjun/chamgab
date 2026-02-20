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
              이 약관은 브릭소프트(이하 &quot;회사&quot;)가 운영하는 참값(이하
              &quot;서비스&quot;)의 이용조건 및 절차, 회사와 회원 간의
              권리·의무·책임사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제2조 (정의)
            </h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>
                &quot;서비스&quot;란 회사가 제공하는 AI 기반 부동산 가격 분석,
                상권 분석, 학군 분석 등의 온라인 서비스를 말합니다.
              </li>
              <li>
                &quot;회원&quot;이란 이 약관에 동의하고 회원가입을 완료하여
                서비스를 이용하는 자를 말합니다.
              </li>
              <li>
                &quot;비회원&quot;이란 회원가입 없이 서비스의 일부 기능을
                이용하는 자를 말합니다.
              </li>
              <li>
                &quot;크레딧&quot;이란 서비스 내 분석 기능을 이용하기 위해
                소비되는 가상의 이용 단위를 말합니다.
              </li>
              <li>
                &quot;참값 분석&quot;이란 AI 모델을 활용한 부동산 적정 가격 분석
                결과를 말합니다.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제3조 (약관의 효력 및 변경)
            </h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>
                이 약관은 서비스 화면에 게시하거나 기타의 방법으로 회원에게
                공지함으로써 효력이 발생합니다.
              </li>
              <li>
                회사는 필요한 경우 관련 법령을 위배하지 않는 범위에서 약관을
                변경할 수 있으며, 변경 시 적용일 최소 7일 전에 서비스 내
                공지합니다.
              </li>
              <li>
                회원이 변경된 약관에 동의하지 않는 경우 회원 탈퇴를 요청할 수
                있으며, 변경된 약관의 효력 발생일 이후에도 서비스를 계속
                이용하는 경우 약관 변경에 동의한 것으로 봅니다.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제4조 (회원가입 및 탈퇴)
            </h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>
                회원가입은 이메일 또는 소셜 계정(Google, 카카오, 네이버)을 통해
                이루어지며, 이 약관에 대한 동의로 가입이 완료됩니다.
              </li>
              <li>
                회원은 서비스 내 마이페이지 또는 이메일
                (bricksoft@bricksoft.co.kr)을 통해 언제든지 탈퇴를 요청할 수
                있습니다.
              </li>
              <li>
                탈퇴 시 회원의 개인정보는 개인정보처리방침에 따라 처리됩니다.
                단, 관련 법령에 따라 보존이 필요한 정보는 해당 기간 동안
                보관합니다.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제5조 (서비스의 내용)
            </h2>
            <p>회사가 제공하는 서비스는 다음과 같습니다.</p>
            <ol className="mt-2 list-decimal space-y-2 pl-6">
              <li>AI 기반 아파트 적정 가격 분석 (참값 분석)</li>
              <li>상권 분석 및 업종별 성공 확률 예측</li>
              <li>학군 분석 (학교 정보 및 교육 환경 분석)</li>
              <li>관심 매물 관리 및 비교 기능</li>
              <li>기타 회사가 추가 개발하여 제공하는 서비스</li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제6조 (크레딧 및 유료 서비스)
            </h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>
                서비스의 분석 기능은 크레딧을 소비하여 이용할 수 있으며,
                회원에게는 등급에 따라 일정량의 무료 크레딧이 제공됩니다.
              </li>
              <li>
                무료 크레딧은 매일 또는 매월 초기화되며, 이월되지 않습니다.
              </li>
              <li>
                유료 크레딧의 구매, 결제, 환불에 관한 사항은 별도의 유료서비스
                이용약관에 따릅니다.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제7조 (서비스의 중단)
            </h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>
                회사는 시스템 점검, 장비 교체, 기타 부득이한 사유가 있는 경우
                서비스의 전부 또는 일부를 일시적으로 중단할 수 있습니다.
              </li>
              <li>
                회사는 서비스 중단 시 사전에 공지하며, 불가피한 경우 사후에
                공지할 수 있습니다.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제8조 (이용 제한)
            </h2>
            <p>
              회사는 다음 각 호에 해당하는 경우 회원의 서비스 이용을 제한하거나
              계정을 정지할 수 있습니다.
            </p>
            <ol className="mt-2 list-decimal space-y-2 pl-6">
              <li>타인의 정보를 도용하여 가입하거나 이용한 경우</li>
              <li>
                서비스를 이용하여 얻은 정보를 회사의 사전 동의 없이 상업적으로
                이용하거나 제3자에게 제공한 경우
              </li>
              <li>서비스의 정상적인 운영을 방해하는 행위를 한 경우</li>
              <li>관련 법령을 위반한 경우</li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제9조 (면책조항)
            </h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>
                본 서비스에서 제공하는 분석 결과는 참고 자료이며, 실제 투자
                결정에 대한 책임은 이용자 본인에게 있습니다.
              </li>
              <li>
                회사는 AI 분석 결과의 정확성을 보장하지 않으며, 이를 기반으로 한
                투자 손실에 대해 책임을 지지 않습니다.
              </li>
              <li>
                회사는 천재지변, 전쟁, 기간통신사업자의 서비스 중단 등
                불가항력으로 인해 서비스를 제공할 수 없는 경우 책임을 지지
                않습니다.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제10조 (개인정보 보호)
            </h2>
            <p>
              회사는 이용자의 개인정보를 관련 법령에 따라 보호하며, 자세한
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

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">
              제11조 (분쟁 해결)
            </h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>
                서비스 이용과 관련하여 회사와 회원 간에 분쟁이 발생한 경우,
                쌍방은 원만한 해결을 위해 성실히 협의합니다.
              </li>
              <li>
                전항의 협의에도 불구하고 분쟁이 해결되지 않는 경우,
                민사소송법상의 관할법원에 소를 제기할 수 있습니다.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#191F28]">부칙</h2>
            <p>이 약관은 2026년 2월 20일부터 시행합니다.</p>
          </section>

          <p className="pt-4 text-sm text-[#8B95A1]">시행일: 2026년 2월 20일</p>
        </div>
      </div>
    </div>
  )
}
