// @TASK P2-S1-T4 - 인기 매물 섹션 (Bold & Playful 스타일)
// @SPEC specs/screens/home.yaml#popular_properties

import { getPopularProperties } from '@/lib/api/properties'
import { PopularPropertiesClient } from './PopularPropertiesClient'

export async function PopularProperties() {
  const properties = await getPopularProperties(10)

  return <PopularPropertiesClient properties={properties} />
}
