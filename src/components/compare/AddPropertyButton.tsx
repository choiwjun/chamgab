'use client'

// @TASK P4-S4-T3 - 매물 추가 버튼 (Editorial Luxury 스타일)
// @SPEC Phase 4 비교하기 화면 요구사항

import { Plus } from 'lucide-react'
import { motion } from 'framer-motion'

interface AddPropertyButtonProps {
  onClick: () => void
}

export function AddPropertyButton({ onClick }: AddPropertyButtonProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className="flex-shrink-0 w-full sm:w-72 md:w-80 min-h-[400px] border border-dashed border-editorial-dark/20 bg-editorial-sand/20 hover:bg-editorial-sand/50 hover:border-editorial-gold transition-all flex flex-col items-center justify-center gap-4 group"
    >
      <div className="w-12 h-12 border border-editorial-dark/10 bg-white flex items-center justify-center group-hover:border-editorial-gold transition-colors">
        <Plus className="w-6 h-6 text-editorial-ink/30 group-hover:text-editorial-gold transition-colors" />
      </div>
      <div className="text-center">
        <p className="text-sm tracking-wide text-editorial-dark mb-1">매물 추가</p>
        <p className="text-xs text-editorial-ink/40">최대 4개까지 비교 가능</p>
      </div>
    </motion.button>
  )
}
