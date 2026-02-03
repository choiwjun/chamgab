// @TASK P2-S1-T1 - 홈 페이지
// @SPEC specs/screens/home.yaml

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
