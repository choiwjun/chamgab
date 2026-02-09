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

        {/* Trust indicators */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-8">
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold tabular-nums text-[#191F28]">
              8,900+
            </span>
            <span className="mt-0.5 text-xs text-[#8B95A1]">단지 분석</span>
          </div>
          <div className="h-8 w-px bg-[#E5E8EB]" />
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold tabular-nums text-[#191F28]">
              126
            </span>
            <span className="mt-0.5 text-xs text-[#8B95A1]">전국 시군구</span>
          </div>
          <div className="h-8 w-px bg-[#E5E8EB]" />
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold tabular-nums text-[#191F28]">
              AI
            </span>
            <span className="mt-0.5 text-xs text-[#8B95A1]">가격 분석</span>
          </div>
        </div>
      </div>
    </section>
  )
}
