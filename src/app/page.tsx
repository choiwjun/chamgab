// @TASK P2-S1-T1 - 홈 페이지
// @SPEC specs/screens/home.yaml

// 빌드 시 정적 생성 건너뛰기 (API 의존성)
export const dynamic = 'force-dynamic'

import { HeroSection } from '@/components/home/HeroSection'
import { ServiceSelector } from '@/components/home/ServiceSelector'
import { PriceTrends } from '@/components/home/PriceTrends'
import { PopularProperties } from '@/components/home/PopularProperties'
import { ServiceIntro } from '@/components/home/ServiceIntro'
import {
  OrganizationJsonLd,
  WebSiteJsonLd,
  FaqJsonLd,
} from '@/components/seo/JsonLd'

const homeFaqItems = [
  {
    question: '참값은 어떤 서비스인가요?',
    answer:
      '참값은 AI(XGBoost + SHAP)를 활용하여 아파트 적정가격을 분석하는 부동산 가격 분석 서비스입니다. 실거래가 데이터를 기반으로 AI가 예측한 적정가격과 실제 시세를 비교하여 합리적인 부동산 의사결정을 돕습니다.',
  },
  {
    question: '아파트 적정가격은 어떻게 산출되나요?',
    answer:
      '전국 70만 건 이상의 실거래가 데이터, 건축물대장, 주변 인프라(학교, 지하철, 상업시설 등) 정보를 종합하여 XGBoost 머신러닝 모델이 예측합니다. SHAP 분석으로 가격에 영향을 미친 요인도 확인할 수 있습니다.',
  },
  {
    question: '상권분석은 어떤 정보를 제공하나요?',
    answer:
      '업종별 점포 수, 개폐업률, 매출 추이, 유동인구, 경쟁 밀도 등을 분석하여 해당 지역의 창업 성공 가능성을 AI가 예측합니다. 소상공인진흥공단 실제 데이터를 기반으로 합니다.',
  },
  {
    question: '토지 시세도 확인할 수 있나요?',
    answer:
      '네, 전국 토지 실거래가 데이터를 수집하여 지역별 토지 시세, 최근 거래 내역, 용도지역별 가격 추이를 제공합니다.',
  },
  {
    question: '참값의 데이터는 얼마나 자주 업데이트되나요?',
    answer:
      '실거래가 데이터는 매일, 상권 데이터는 분기별, 토지 데이터는 매월 자동 업데이트됩니다. 국토교통부, 소상공인진흥공단 등 공공 API에서 직접 수집합니다.',
  },
]

export default function HomePage() {
  return (
    <>
      <OrganizationJsonLd />
      <WebSiteJsonLd />
      <FaqJsonLd items={homeFaqItems} />
      <main className="min-h-screen">
        <HeroSection />
        <ServiceSelector />
        <PriceTrends />
        <PopularProperties />
        <ServiceIntro />
      </main>
    </>
  )
}
