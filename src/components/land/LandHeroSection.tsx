'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Search, MapPin } from 'lucide-react'

export function LandHeroSection() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/land/search?q=${encodeURIComponent(query.trim())}` as never)
    }
  }

  return (
    <section className="relative overflow-hidden bg-white">
      {/* Subtle amber gradient background */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(245,158,11,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 py-16 md:py-24">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6 flex justify-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF7ED] px-4 py-2 text-sm font-medium text-[#F59E0B]">
            <MapPin className="h-4 w-4" strokeWidth={2} />
            토지 분석
          </div>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <h1 className="text-center text-4xl font-bold tracking-[-0.02em] text-[#191F28] md:text-5xl">
            이 땅의 가치를
            <br />
            <span className="text-[#F59E0B]">참값</span>이 알려드립니다
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-5 text-center text-base text-[#4E5968] md:text-lg"
        >
          토지 실거래 데이터와 AI 분석으로 최적의 투자 기회를 찾으세요
        </motion.p>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-10"
        >
          <form onSubmit={handleSearch} className="mx-auto max-w-2xl">
            <div className="relative">
              <div className="pointer-events-none absolute left-5 top-1/2 flex -translate-y-1/2 items-center">
                <Search className="h-5 w-5 text-[#8B95A1]" strokeWidth={2} />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="지번 또는 주소를 입력하세요 (예: 강남구 역삼동 123-4)"
                className="h-14 w-full rounded-2xl border border-[#E5E8EB] bg-white pl-14 pr-32 text-[#191F28] placeholder:text-[#8B95A1] focus:border-[#F59E0B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/20"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-[#F59E0B] px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#EA8A0C]"
              >
                검색
              </button>
            </div>
          </form>
        </motion.div>

        {/* Popular searches */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mt-6 text-center"
        >
          <p className="text-sm text-[#8B95A1]">
            인기 검색:{' '}
            <button
              onClick={() => setQuery('강남구 역삼동')}
              className="text-[#4E5968] hover:text-[#F59E0B]"
            >
              강남구 역삼동
            </button>{' '}
            ·{' '}
            <button
              onClick={() => setQuery('송파구 잠실동')}
              className="text-[#4E5968] hover:text-[#F59E0B]"
            >
              송파구 잠실동
            </button>{' '}
            ·{' '}
            <button
              onClick={() => setQuery('성남시 분당구')}
              className="text-[#4E5968] hover:text-[#F59E0B]"
            >
              성남시 분당구
            </button>
          </p>
        </motion.div>
      </div>
    </section>
  )
}
