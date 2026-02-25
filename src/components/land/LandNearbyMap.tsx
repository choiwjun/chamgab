'use client'

import { useMemo } from 'react'
import { MapPin } from 'lucide-react'
import type { LandMapPoint } from '@/types/land'

interface LandNearbyMapProps {
  points: LandMapPoint[]
}

type PositionedPoint = LandMapPoint & { x: number; y: number }

function normalize(points: LandMapPoint[]): PositionedPoint[] {
  if (!points.length) return []

  const latitudes = points.map((point) => point.lat)
  const longitudes = points.map((point) => point.lng)

  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLng = Math.min(...longitudes)
  const maxLng = Math.max(...longitudes)

  const latRange = Math.max(maxLat - minLat, 0.0001)
  const lngRange = Math.max(maxLng - minLng, 0.0001)

  return points.map((point) => {
    const x = ((point.lng - minLng) / lngRange) * 100
    const y = 100 - ((point.lat - minLat) / latRange) * 100

    return {
      ...point,
      x: Math.min(Math.max(x, 2), 98),
      y: Math.min(Math.max(y, 2), 98),
    }
  })
}

function formatPrice(value: number | null | undefined): string {
  if (!value || value <= 0) return '-'
  const eok = Math.floor(value / 10000)
  const man = value % 10000
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만원`
  if (eok > 0) return `${eok}억원`
  return `${value.toLocaleString()}만원`
}

export function LandNearbyMap({ points }: LandNearbyMapProps) {
  const positioned = useMemo(() => normalize(points), [points])
  const subject = positioned.find((point) => point.kind === 'subject') || null
  const nearbyCount = positioned.filter((point) => point.kind === 'nearby').length

  if (!positioned.length) {
    return (
      <div className="rounded-2xl border border-[#E5E8EB] bg-white p-6 text-sm text-[#8B95A1]">
        지도 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#E5E8EB] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-[#191F28]">
          기준 토지 + 인근 {nearbyCount}필지
        </div>
        {subject && (
          <div className="text-xs text-[#8B95A1]">
            중심: {subject.title} ({subject.lat.toFixed(5)}, {subject.lng.toFixed(5)})
          </div>
        )}
      </div>

      <div className="relative h-72 overflow-hidden rounded-xl border border-[#E5E8EB] bg-[radial-gradient(circle_at_15%_20%,#f8fbff_0,#eef4ff_45%,#f9fafb_100%)]">
        {positioned.map((point) => (
          <div
            key={point.id}
            className="group absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          >
            <div
              className={`h-3 w-3 rounded-full border-2 shadow ${
                point.kind === 'subject'
                  ? 'border-[#1D4ED8] bg-[#2563EB]'
                  : 'border-[#F59E0B] bg-[#FCD34D]'
              }`}
            />
            <div className="pointer-events-none absolute left-1/2 top-4 z-10 hidden w-44 -translate-x-1/2 rounded-lg border border-[#E5E8EB] bg-white px-2 py-1.5 text-[11px] text-[#4E5968] shadow-md group-hover:block">
              <div className="font-semibold text-[#191F28]">{point.title}</div>
              <div>{formatPrice(point.transaction_price)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-[#6B7280]">
        <div className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2563EB]" />
          기준 토지
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FCD34D]" />
          인근 토지
        </div>
        <div className="inline-flex items-center gap-1.5">
          <MapPin className="h-3 w-3" />
          상대 좌표(반경 분포)
        </div>
      </div>
    </div>
  )
}
