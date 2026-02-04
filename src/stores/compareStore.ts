// @TASK P4-S4-T1 - 비교하기 Zustand 스토어
// @SPEC Phase 4 비교하기 화면 요구사항

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CompareProperty {
  id: string
  name: string
  address: string
  area_exclusive?: number
  built_year?: number
  floors?: number
  thumbnail?: string
  chamgab_price?: number
  latest_price?: number
}

interface CompareState {
  // 최대 4개 매물 ID 저장
  propertyIds: string[]

  // 매물 추가 (최대 4개)
  addProperty: (id: string) => void

  // 매물 제거
  removeProperty: (id: string) => void

  // 전체 초기화
  clear: () => void

  // URL 쿼리로 초기화
  setFromQuery: (ids: string[]) => void
}

const MAX_COMPARE = 4

export const useCompareStore = create<CompareState>()(
  persist(
    (set) => ({
      propertyIds: [],

      addProperty: (id) =>
        set((state) => {
          if (state.propertyIds.includes(id)) return state
          if (state.propertyIds.length >= MAX_COMPARE) {
            // 최대 개수 초과 시 무시
            return state
          }
          return { propertyIds: [...state.propertyIds, id] }
        }),

      removeProperty: (id) =>
        set((state) => ({
          propertyIds: state.propertyIds.filter((pid) => pid !== id),
        })),

      clear: () => set({ propertyIds: [] }),

      setFromQuery: (ids) =>
        set({ propertyIds: ids.slice(0, MAX_COMPARE) }),
    }),
    {
      name: 'compare-storage',
      partialize: (state) => ({ propertyIds: state.propertyIds }),
    }
  )
)
