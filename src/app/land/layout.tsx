// @TASK Land Analysis Feature - Layout
// @SPEC Land section layout with metadata

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '토지 분석 - 참값',
  description:
    '토지 실거래 데이터와 AI 분석으로 최적의 투자 기회를 찾으세요. 지역별 토지 시세, 최근 거래 내역을 확인하세요.',
  keywords: [
    '토지',
    '토지 분석',
    '토지 실거래가',
    '토지 시세',
    '토지 투자',
    '부동산',
    'AI 분석',
  ],
}

export default function LandLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
