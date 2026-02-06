// @TASK P2-S2-T2 - 지역 필터 (계층형 드롭다운)
// @SPEC specs/screens/search-list.yaml
// @TEST tests/components/search/RegionFilter.test.tsx

'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Region } from '@/types/region'

interface RegionFilterProps {
  sido?: string
  sigungu?: string
  onSidoChange: (sido: string | undefined) => void
  onSigunguChange: (sigungu: string | undefined) => void
}

async function fetchRegions(
  level: 1 | 2,
  parentCode?: string
): Promise<Region[]> {
  const params = new URLSearchParams({ level: String(level) })
  if (parentCode) {
    params.set('parent_code', parentCode)
  }

  const res = await fetch(`/api/regions?${params.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch regions')

  const data = await res.json()
  return data.items || []
}

export function RegionFilter({
  sido,
  sigungu,
  onSidoChange,
  onSigunguChange,
}: RegionFilterProps) {
  const [selectedSidoCode, setSelectedSidoCode] = useState<string>()

  // 시도 목록 조회
  const { data: sidoList = [], isLoading: isSidoLoading } = useQuery({
    queryKey: ['regions', 'sido'],
    queryFn: () => fetchRegions(1),
  })

  // 시군구 목록 조회 (선택된 시도의 하위 지역)
  const { data: sigunguList = [], isLoading: isSigunguLoading } = useQuery({
    queryKey: ['regions', 'sigungu', selectedSidoCode],
    queryFn: () => fetchRegions(2, selectedSidoCode),
    enabled: !!selectedSidoCode,
  })

  // 초기 로드 시 시도 선택 상태 복원
  useEffect(() => {
    if (sido && sidoList.length > 0) {
      const foundSido = sidoList.find((s) => s.name === sido)
      if (foundSido) {
        setSelectedSidoCode(foundSido.code)
      }
    }
  }, [sido, sidoList])

  // 시도 변경 핸들러
  const handleSidoChange = (sidoName: string) => {
    if (!sidoName) {
      setSelectedSidoCode(undefined)
      onSidoChange(undefined)
      onSigunguChange(undefined)
      return
    }

    const foundSido = sidoList.find((s) => s.name === sidoName)
    if (foundSido) {
      setSelectedSidoCode(foundSido.code)
      onSidoChange(sidoName)
      onSigunguChange(undefined) // 시도 변경 시 시군구 초기화
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {/* 시도 선택 */}
      <div>
        <label
          htmlFor="region-sido"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          시·도
        </label>
        <select
          id="region-sido"
          value={sido || ''}
          onChange={(e) => handleSidoChange(e.target.value)}
          disabled={isSidoLoading}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-100"
        >
          <option value="">전체</option>
          {sidoList.map((region) => (
            <option key={region.id} value={region.name}>
              {region.name}
            </option>
          ))}
        </select>
      </div>

      {/* 시군구 선택 */}
      <div>
        <label
          htmlFor="region-sigungu"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          시·군·구
        </label>
        <select
          id="region-sigungu"
          value={sigungu || ''}
          onChange={(e) => onSigunguChange(e.target.value || undefined)}
          disabled={!selectedSidoCode || isSigunguLoading}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-100"
        >
          <option value="">전체</option>
          {sigunguList.map((region) => (
            <option key={region.id} value={region.name}>
              {region.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
