// @TASK P2-S2-T4 - 리스트/지도 뷰 토글
// @SPEC specs/screens/search-list.yaml

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ViewToggleProps {
  currentView: 'list' | 'map'
}

export function ViewToggle({ currentView }: ViewToggleProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleViewChange = (view: 'list' | 'map') => {
    const params = new URLSearchParams(searchParams.toString())

    if (view === 'map') {
      // 지도 뷰로 전환 (필터 유지)
      router.push(`/search/map?${params.toString()}`)
    } else {
      // 리스트 뷰로 전환
      router.push(`/search?${params.toString()}`)
    }
  }

  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
      {/* 리스트 뷰 버튼 */}
      <motion.button
        onClick={() => handleViewChange('list')}
        className={cn(
          'relative flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
          currentView === 'list'
            ? 'text-white'
            : 'text-gray-600 hover:text-gray-900'
        )}
        whileHover={{ scale: currentView === 'list' ? 1 : 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {currentView === 'list' && (
          <motion.div
            layoutId="activeView"
            className="absolute inset-0 rounded-md bg-primary"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <svg
          className="relative z-10 h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 10h16M4 14h16M4 18h16"
          />
        </svg>
        <span className="relative z-10">리스트</span>
      </motion.button>

      {/* 지도 뷰 버튼 */}
      <motion.button
        onClick={() => handleViewChange('map')}
        className={cn(
          'relative flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
          currentView === 'map'
            ? 'text-white'
            : 'text-gray-600 hover:text-gray-900'
        )}
        whileHover={{ scale: currentView === 'map' ? 1 : 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {currentView === 'map' && (
          <motion.div
            layoutId="activeView"
            className="absolute inset-0 rounded-md bg-primary"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <svg
          className="relative z-10 h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
        <span className="relative z-10">지도</span>
      </motion.button>
    </div>
  )
}
