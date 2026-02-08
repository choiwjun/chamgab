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
      className="group flex min-h-[400px] w-full flex-shrink-0 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-[#E5E8EB] bg-[#F9FAFB] transition-all hover:border-[#3182F6] hover:bg-white sm:w-72 md:w-80"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#E5E8EB] bg-white transition-colors group-hover:border-[#3182F6]">
        <Plus className="h-6 w-6 text-[#8B95A1] transition-colors group-hover:text-[#3182F6]" />
      </div>
      <div className="text-center">
        <p className="mb-1 text-sm font-medium text-[#191F28]">매물 추가</p>
        <p className="text-xs text-[#8B95A1]">최대 4개까지 비교 가능</p>
      </div>
    </motion.button>
  )
}
