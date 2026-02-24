// @TASK Land Analysis Feature - Layout
// @SPEC Land section layout with metadata

import type { Metadata } from 'next'
import { ENABLE_LAND } from '@/lib/features'

export const metadata: Metadata = {
  title: '토지 실거래가 조회 | 참값 토지분석',
  description:
    '전국 토지 실거래 데이터를 기반으로 시세, 최근 거래, 용도지역 정보를 한 번에 확인하세요.',
  keywords: [
    '토지 실거래가',
    '토지 시세',
    '토지 분석',
    '토지 가격',
    '토지 투자',
    '토지 매매',
    'AI 토지분석',
  ],
  alternates: {
    canonical: '/land',
  },
  robots: ENABLE_LAND
    ? { index: true, follow: true }
    : { index: false, follow: false },
}

export default function LandLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
