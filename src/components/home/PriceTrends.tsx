// @TASK P2-S1-T3 - 가격 트렌드 섹션 (Bold & Playful 스타일)
// @SPEC specs/screens/home.yaml#price_trends

import { getRegionTrends } from '@/lib/api/regions'
import { PriceTrendsClient } from './PriceTrendsClient'

export async function PriceTrends() {
  const trends = await getRegionTrends(6)

  return <PriceTrendsClient trends={trends} />
}
