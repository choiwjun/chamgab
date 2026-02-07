// @TASK P4-S6-T2 - 관심 매물 빈 상태 컴포넌트 (Editorial Luxury 스타일)
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
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center"
    >
      {/* 아이콘 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="mb-8"
      >
        <Heart className="h-12 w-12 text-[#E5E8EB]" strokeWidth={1.5} />
      </motion.div>

      {/* 제목 */}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mb-4 text-2xl font-bold text-[#191F28] md:text-3xl"
      >
        아직 저장한 매물이 없어요
      </motion.h2>

      {/* 설명 */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="mb-10 max-w-sm text-[#4E5968]"
      >
        마음에 드는 매물을 저장하고 가격 변동 알림을 받아보세요
      </motion.p>

      {/* CTA 버튼 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <Link
          href="/search"
          className="inline-flex items-center rounded-xl bg-[#3182F6] px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1B64DA]"
        >
          매물 찾아보기
        </Link>
      </motion.div>
    </motion.div>
  )
}
