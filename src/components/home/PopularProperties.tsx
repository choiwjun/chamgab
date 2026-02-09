// @TASK P2-S1-T4 - 인기 매물 섹션
// @SPEC specs/screens/home.yaml#popular_properties

import { createClient } from '@supabase/supabase-js'
import { PopularPropertiesClient } from './PopularPropertiesClient'
import type { Property } from '@/types/property'
import { REGION_COORDS } from '@/lib/region-coords'

/**
 * PostGIS WKB hex → { lat, lng }
 */
function parseWKBPoint(wkb: string): { lat: number; lng: number } | null {
  if (!wkb || typeof wkb !== 'string' || wkb.length < 50) return null
  try {
    const xHex = wkb.substring(wkb.length - 32, wkb.length - 16)
    const yHex = wkb.substring(wkb.length - 16)
    const xBuf = Buffer.from(xHex, 'hex')
    const yBuf = Buffer.from(yHex, 'hex')
    const lng = xBuf.readDoubleLE(0)
    const lat = yBuf.readDoubleLE(0)
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)
      return { lat, lng }
    return null
  } catch {
    return null
  }
}

async function fetchPopularProperties(limit = 10): Promise<Property[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[PopularProperties] Supabase error:', error.message)
      return []
    }

    return (data || []).map((item) => {
      const parsed = parseWKBPoint(item.location)
      if (parsed) return { ...item, location: parsed }

      const regionCenter = REGION_COORDS[item.sigungu || '']
      if (regionCenter) {
        return {
          ...item,
          location: {
            lat: regionCenter.lat + (Math.random() - 0.5) * 0.008,
            lng: regionCenter.lng + (Math.random() - 0.5) * 0.008,
          },
        }
      }
      return { ...item, location: null }
    })
  } catch (err) {
    console.error('[PopularProperties] Error:', err)
    return []
  }
}

export async function PopularProperties() {
  const properties = await fetchPopularProperties(10)

  return <PopularPropertiesClient properties={properties} />
}
