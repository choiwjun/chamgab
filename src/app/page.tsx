// @TASK P2-S1-T1 - 홈 페이지
// @SPEC specs/screens/home.yaml

// 빌드 시 정적 생성 건너뛰기 (API 의존성)
export const dynamic = 'force-dynamic'

import { HeroSection } from '@/components/home/HeroSection'
import { PriceTrends } from '@/components/home/PriceTrends'
import { PopularProperties } from '@/components/home/PopularProperties'
import { ServiceIntro } from '@/components/home/ServiceIntro'

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <HeroSection />
      <PriceTrends />
      <PopularProperties />
      <ServiceIntro />
    </main>
  )
}
