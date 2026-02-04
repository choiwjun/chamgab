'use client'

// @TASK P4-S4-T3 - 매물 추가 버튼
// @SPEC Phase 4 비교하기 화면 요구사항

import { Plus } from 'lucide-react'
import { motion } from 'framer-motion'

interface AddPropertyButtonProps {
  onClick: () => void
}

export function AddPropertyButton({ onClick }: AddPropertyButtonProps) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="flex-shrink-0 w-full sm:w-64 md:w-72 h-[400px] border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 hover:border-primary transition-all flex flex-col items-center justify-center gap-3"
    >
      <div className="p-4 rounded-full bg-white shadow-sm">
        <Plus className="w-8 h-8 text-gray-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-gray-700">매물 추가</p>
        <p className="text-xs text-gray-500 mt-1">최대 4개까지 비교 가능</p>
      </div>
    </motion.button>
  )
}
