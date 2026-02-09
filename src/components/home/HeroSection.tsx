'use client'

import { SearchBar } from './SearchBar'

export function HeroSection() {
  return (
    <section className="relative bg-white pb-20 pt-24 md:pb-28 md:pt-32">
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(49,130,246,0.04) 0%, transparent 100%)',
        }}
      />

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        {/* Headline */}
        <h1 className="mb-4 text-4xl font-bold tracking-[-0.02em] text-[#191F28] md:text-5xl">
          내 집의 진짜 가치를
          <br />
          <span className="text-[#3182F6]">참값</span>이 알려드립니다
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-4 max-w-md text-[17px] leading-[1.6] text-[#4E5968]">
          실거래 데이터와 AI 분석으로 아파트 적정가를 투명하게 확인하세요
        </p>

        {/* SearchBar */}
        <div className="mx-auto mt-10 max-w-xl">
          <SearchBar />
        </div>
      </div>
    </section>
  )
}
