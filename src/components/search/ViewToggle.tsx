// @TASK P2-S2-T4 - 리스트/지도 뷰 토글 (Editorial Luxury 스타일)
// @SPEC specs/screens/search-list.yaml

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { List, Map } from 'lucide-react'
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
    <div className="inline-flex border border-editorial-dark/10 bg-white">
      {/* 리스트 뷰 버튼 */}
      <motion.button
        onClick={() => handleViewChange('list')}
        className={cn(
          'relative flex items-center gap-2 px-4 py-2 text-sm tracking-wide transition-colors',
          currentView === 'list'
            ? 'bg-editorial-dark text-white'
            : 'text-editorial-ink/50 hover:text-editorial-dark hover:bg-editorial-sand/30'
        )}
        whileTap={{ scale: 0.98 }}
      >
        <List className="h-4 w-4" />
        <span className="hidden sm:inline">리스트</span>
      </motion.button>

      {/* 지도 뷰 버튼 */}
      <motion.button
        onClick={() => handleViewChange('map')}
        className={cn(
          'relative flex items-center gap-2 px-4 py-2 text-sm tracking-wide transition-colors border-l border-editorial-dark/10',
          currentView === 'map'
            ? 'bg-editorial-dark text-white'
            : 'text-editorial-ink/50 hover:text-editorial-dark hover:bg-editorial-sand/30'
        )}
        whileTap={{ scale: 0.98 }}
      >
        <Map className="h-4 w-4" />
        <span className="hidden sm:inline">지도</span>
      </motion.button>
    </div>
  )
}
