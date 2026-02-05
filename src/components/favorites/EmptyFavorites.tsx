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
      {/* 장식 라인 */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="w-16 h-px bg-editorial-gold mb-8"
      />

      {/* 아이콘 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mb-8"
      >
        <Heart className="h-12 w-12 text-editorial-ink/20" strokeWidth={1} />
      </motion.div>

      {/* 제목 */}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="font-serif text-2xl md:text-3xl text-editorial-dark mb-4"
      >
        아직 저장한 매물이 없어요
      </motion.h2>

      {/* 설명 */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="text-editorial-ink/50 mb-10 max-w-sm"
      >
        마음에 드는 매물을 저장하고 가격 변동 알림을 받아보세요
      </motion.p>

      {/* CTA 버튼 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <Link
          href="/search"
          className="inline-flex items-center bg-editorial-dark px-8 py-3 text-sm tracking-widest uppercase text-white hover:bg-editorial-gold transition-colors"
        >
          매물 찾아보기
        </Link>
      </motion.div>
    </motion.div>
  )
}
