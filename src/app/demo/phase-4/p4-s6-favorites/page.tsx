// @TASK P4-S6-T6 - 관심 매물 데모 페이지
// @SPEC specs/screens/favorites.yaml

'use client'

import { useState } from 'react'
import { FavoritesList } from '@/components/favorites/FavoritesList'
import type { Favorite } from '@/types/favorite'

const MOCK_FAVORITES: Favorite[] = [
  {
    id: 'fav-1',
    user_id: 'mock-user',
    property_id: 'prop-1',
    notify_enabled: true,
    created_at: '2024-01-15T10:00:00Z',
    properties: {
      id: 'prop-1',
      property_type: 'apt',
      name: '래미안 강남파크',
      address: '서울특별시 강남구 역삼동 123-45',
      sido: '서울',
      sigungu: '강남구',
      eupmyeondong: '역삼동',
      area_exclusive: 84.5,
      built_year: 2020,
      floors: 25,
      thumbnail: 'https://picsum.photos/seed/prop1/320/192',
      created_at: '2024-01-10T10:00:00Z',
    },
  },
  {
    id: 'fav-2',
    user_id: 'mock-user',
    property_id: 'prop-2',
    notify_enabled: false,
    created_at: '2024-01-14T10:00:00Z',
    properties: {
      id: 'prop-2',
      property_type: 'apt',
      name: '힐스테이트 서초',
      address: '서울특별시 서초구 서초동 456-78',
      sido: '서울',
      sigungu: '서초구',
      eupmyeondong: '서초동',
      area_exclusive: 102.3,
      built_year: 2019,
      floors: 30,
      thumbnail: 'https://picsum.photos/seed/prop2/320/192',
      created_at: '2024-01-12T10:00:00Z',
    },
  },
  {
    id: 'fav-3',
    user_id: 'mock-user',
    property_id: 'prop-3',
    notify_enabled: true,
    created_at: '2024-01-13T10:00:00Z',
    properties: {
      id: 'prop-3',
      property_type: 'officetel',
      name: '디에이치 아너힐즈',
      address: '서울특별시 송파구 가락동 789-12',
      sido: '서울',
      sigungu: '송파구',
      eupmyeondong: '가락동',
      area_exclusive: 59.8,
      built_year: 2021,
      floors: 20,
      thumbnail: 'https://picsum.photos/seed/prop3/320/192',
      created_at: '2024-01-11T10:00:00Z',
    },
  },
]

const DEMO_STATES: Record<string, Favorite[]> = {
  normal: MOCK_FAVORITES,
  empty: [],
  single: [MOCK_FAVORITES[0]],
}

type DemoStateKey = keyof typeof DEMO_STATES

export default function FavoritesDemoPage() {
  const [state, setState] = useState<DemoStateKey>('normal')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상태 선택기 */}
      <div className="sticky top-0 z-50 border-b border-gray-300 bg-white p-4 shadow-sm">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-3 text-xl font-bold text-gray-900">
            [DEMO] 관심 매물 페이지
          </h1>
          <div className="flex flex-wrap gap-2">
            {Object.keys(DEMO_STATES).map((s) => {
              const key = s as DemoStateKey
              return (
                <button
                  key={s}
                  onClick={() => setState(key)}
                  className={
                    state === s
                      ? 'rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white'
                      : 'rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300'
                  }
                >
                  {s === 'normal' && '일반 (3개)'}
                  {s === 'empty' && '빈 상태'}
                  {s === 'single' && '단일 아이템'}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 컴포넌트 렌더링 */}
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">관심 매물</h1>
          <p className="mt-2 text-gray-600">
            저장한 매물을 확인하고 가격 변동 알림을 받아보세요
          </p>
        </div>

        <FavoritesList initialData={DEMO_STATES[state]} userId="mock-user" />
      </div>

      {/* 상태 정보 */}
      <div className="mx-auto max-w-7xl px-4 pb-8">
        <details className="rounded-lg bg-gray-800 p-4 text-white">
          <summary className="cursor-pointer font-semibold">
            현재 상태 정보 (JSON)
          </summary>
          <pre className="mt-2 overflow-x-auto text-xs">
            {JSON.stringify(
              {
                state,
                itemCount: DEMO_STATES[state].length,
                data: DEMO_STATES[state],
              },
              null,
              2
            )}
          </pre>
        </details>
      </div>
    </div>
  )
}
