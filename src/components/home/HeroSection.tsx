'use client'

import { SearchBar } from './SearchBar'

export function HeroSection() {
  return (
    <section className="bg-white pb-16 pt-24 md:pb-20 md:pt-32">
      <div className="mx-auto max-w-2xl px-6 text-center">
        {/* Headline */}
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-[#191F28] md:text-5xl">
          내 집의 진짜 가치를
          <br />
          참값이 알려드립니다
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mb-8 mt-4 max-w-md text-lg text-[#4E5968]">
          실거래 데이터와 AI 분석으로 아파트 적정가를 투명하게 확인하세요
        </p>

        {/* SearchBar */}
        <div className="mx-auto mt-8 max-w-xl">
          <SearchBar />
        </div>

        {/* Trust indicators */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm text-[#8B95A1]">
          <div>8,900+ 단지 분석</div>
          <div className="h-1 w-1 rounded-full bg-[#E5E8EB]" />
          <div>전국 79개 지역</div>
          <div className="h-1 w-1 rounded-full bg-[#E5E8EB]" />
          <div>AI 가격 분석</div>
        </div>
      </div>
    </section>
  )
}
