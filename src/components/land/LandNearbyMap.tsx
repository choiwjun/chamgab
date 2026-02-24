'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { LandMapPoint } from '@/types/land'

interface LandNearbyMapProps {
  points: LandMapPoint[]
}

const KAKAO_SDK_ID = 'kakao-land-nearby-map-sdk'

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function loadKakaoSdk(appKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.kakao?.maps) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(
      KAKAO_SDK_ID
    ) as HTMLScriptElement | null

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Kakao SDK')),
        { once: true }
      )
      return
    }

    const script = document.createElement('script')
    script.id = KAKAO_SDK_ID
    script.async = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      appKey
    )}&autoload=false&libraries=clusterer,services`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Kakao SDK'))
    document.head.appendChild(script)
  })
}

export function LandNearbyMap({ points }: LandNearbyMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'idle' | 'ready' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const normalizedPoints = useMemo(
    () =>
      points.filter(
        (p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng) &&
          p.lat >= -90 &&
          p.lat <= 90 &&
          p.lng >= -180 &&
          p.lng <= 180
      ),
    [points]
  )

  useEffect(() => {
    let isUnmounted = false
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY

    if (!mapRef.current) return
    if (normalizedPoints.length === 0) {
      setStatus('error')
      setErrorMessage('표시할 위치 데이터가 없습니다.')
      return
    }
    if (!appKey) {
      setStatus('error')
      setErrorMessage('NEXT_PUBLIC_KAKAO_MAP_KEY 환경변수가 필요합니다.')
      return
    }

    const markers: kakao.maps.Marker[] = []
    const overlays: kakao.maps.CustomOverlay[] = []

    const init = async () => {
      try {
        await loadKakaoSdk(appKey)
        if (!window.kakao?.maps || isUnmounted || !mapRef.current) return

        window.kakao.maps.load(() => {
          if (isUnmounted || !mapRef.current) return

          const subject =
            normalizedPoints.find((point) => point.kind === 'subject') ||
            normalizedPoints[0]
          const map = new window.kakao.maps.Map(mapRef.current, {
            center: new window.kakao.maps.LatLng(subject.lat, subject.lng),
            level: 5,
          })
          const bounds = new window.kakao.maps.LatLngBounds()

          for (const point of normalizedPoints) {
            const position = new window.kakao.maps.LatLng(point.lat, point.lng)
            bounds.extend(position)

            const marker = new window.kakao.maps.Marker({
              map,
              position,
              clickable: false,
            })
            markers.push(marker)

            const tone =
              point.kind === 'subject'
                ? 'background:#2F80ED;color:#fff;'
                : 'background:#fff;color:#4E5968;border:1px solid #D1D6DB;'
            const content = `<div style="padding:4px 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;${tone}">${escapeHtml(point.title)}</div>`
            const overlay = new window.kakao.maps.CustomOverlay({
              map,
              position,
              content,
              yAnchor: 2,
            })
            overlays.push(overlay)
          }

          if (normalizedPoints.length > 1) {
            map.setBounds(bounds)
          } else {
            map.setLevel(4)
          }
          setStatus('ready')
          setErrorMessage(null)
        })
      } catch (error) {
        if (isUnmounted) return
        setStatus('error')
        setErrorMessage(
          error instanceof Error ? error.message : '지도를 불러오지 못했습니다.'
        )
      }
    }

    init()

    return () => {
      isUnmounted = true
      for (const marker of markers) {
        marker.setMap(null)
      }
      for (const overlay of overlays) {
        overlay.setMap(null)
      }
    }
  }, [normalizedPoints])

  return (
    <div className="relative h-[360px] w-full overflow-hidden rounded-2xl border border-[#E5E8EB] bg-white">
      <div ref={mapRef} className="h-full w-full" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/85">
          <p className="px-4 text-sm text-[#8B95A1]">
            {errorMessage || '지도를 준비 중입니다.'}
          </p>
        </div>
      )}
    </div>
  )
}
