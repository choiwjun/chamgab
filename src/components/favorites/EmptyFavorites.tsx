// @TASK P4-S6-T2 - 관심 매물 빈 상태 컴포넌트
// @SPEC specs/screens/favorites.yaml#empty_state

'use client'

import Link from 'next/link'
import { Heart } from 'lucide-react'
import { motion } from 'framer-motion'

export function EmptyFavorites() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center"
    >
      {/* 아이콘 */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100"
      >
        <Heart className="h-10 w-10 text-gray-400" />
      </motion.div>

      {/* 제목 */}
      <h2 className="mb-2 text-2xl font-bold text-gray-900">
        아직 저장한 매물이 없어요
      </h2>

      {/* 설명 */}
      <p className="mb-8 text-gray-600">
        마음에 드는 매물을 저장하고 가격 변동 알림을 받아보세요
      </p>

      {/* CTA 버튼 */}
      <Link
        href="/search"
        className="inline-flex items-center rounded-lg bg-primary px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-primary/90"
      >
        매물 찾아보기
      </Link>
    </motion.div>
  )
}
