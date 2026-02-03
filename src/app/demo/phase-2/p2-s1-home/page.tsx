'use client'

// @TASK P2-S1 - 홈 화면 데모 페이지
// @DEMO 모든 상태 시각화

import { useState } from 'react'
import { HeroSection } from '@/components/home/HeroSection'
import { TrendCard } from '@/components/home/TrendCard'
import { PropertyCard } from '@/components/common/PropertyCard'
import { ServiceIntro } from '@/components/home/ServiceIntro'
import type { RegionTrend } from '@/types/region'
import type { Property } from '@/types/property'

// 목 데이터
const MOCK_TRENDS: RegionTrend[] = [
  {
    id: '1',
    name: '강남구',
    level: 2,
    avg_price: 1800000000,
    price_change_weekly: 2.5,
    property_count: 142,
  },
  {
    id: '2',
    name: '서초구',
    level: 2,
    avg_price: 1650000000,
    price_change_weekly: 1.8,
    property_count: 98,
  },
  {
    id: '3',
    name: '송파구',
    level: 2,
    avg_price: 1400000000,
    price_change_weekly: -0.5,
    property_count: 156,
  },
  {
    id: '4',
    name: '마포구',
    level: 2,
    avg_price: 1200000000,
    price_change_weekly: 0,
    property_count: 89,
  },
  {
    id: '5',
    name: '용산구',
    level: 2,
    avg_price: 1550000000,
    price_change_weekly: 3.2,
    property_count: 67,
  },
  {
    id: '6',
    name: '성동구',
    level: 2,
    avg_price: 1100000000,
    price_change_weekly: -1.2,
    property_count: 54,
  },
]

const MOCK_PROPERTIES: Property[] = [
  {
    id: '1',
    name: '래미안 강남 퍼스트',
    address: '서울 강남구 역삼동 123-45',
    property_type: 'apt',
    thumbnail: undefined,
    area_exclusive: 84.5,
    built_year: 2021,
    created_at: '2024-01-01',
  },
  {
    id: '2',
    name: '자이 서초',
    address: '서울 서초구 서초동 456-78',
    property_type: 'apt',
    thumbnail: undefined,
    area_exclusive: 114.2,
    built_year: 2019,
    created_at: '2024-01-02',
  },
  {
    id: '3',
    name: '힐스테이트 송파',
    address: '서울 송파구 잠실동 789-12',
    property_type: 'apt',
    thumbnail: undefined,
    area_exclusive: 59.8,
    built_year: 2022,
    created_at: '2024-01-03',
  },
]

const DEMO_STATES = {
  normal: {
    trends: MOCK_TRENDS,
    properties: MOCK_PROPERTIES,
  },
  loading: {
    trends: [],
    properties: [],
  },
  empty: {
    trends: [],
    properties: [],
  },
} as const

export default function HomeDemo() {
  const [state, setState] = useState<keyof typeof DEMO_STATES>('normal')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상태 선택기 */}
      <div className="sticky top-0 z-50 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">
            P2-S1 홈 화면 데모
          </h1>
          <div className="flex gap-2">
            {(Object.keys(DEMO_STATES) as Array<keyof typeof DEMO_STATES>).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => setState(s)}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    state === s
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {s}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      {/* 데모 컨텐츠 */}
      <main>
        <HeroSection />

        {/* 가격 트렌드 */}
        <section className="py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="mb-6 text-2xl font-bold text-gray-900 md:mb-8">
              지역별 가격 트렌드
            </h2>

            {DEMO_STATES[state].trends.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
                <p className="text-gray-500">데이터가 없습니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {DEMO_STATES[state].trends.map((trend) => (
                  <TrendCard key={trend.id} trend={trend} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 인기 매물 */}
        <section className="bg-gray-50 py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="mb-6 text-2xl font-bold text-gray-900 md:mb-8">
              인기 매물
            </h2>

            {DEMO_STATES[state].properties.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
                <p className="text-gray-500">데이터가 없습니다.</p>
              </div>
            ) : (
              <div className="scrollbar-hide flex gap-4 overflow-x-auto pb-4">
                {DEMO_STATES[state].properties.map((property, index) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    index={index}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <ServiceIntro />
      </main>

      {/* 상태 정보 */}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="mx-auto max-w-7xl">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            현재 상태 정보
          </h3>
          <pre className="overflow-auto rounded bg-gray-100 p-3 text-xs text-gray-800">
            {JSON.stringify(DEMO_STATES[state], null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
