import type { Metadata } from 'next'
import { ENABLE_LAND } from '@/lib/features'

const ACTIVE_METADATA: Metadata = {
  title: '토지 실거래가 조회·시세 분석',
  description:
    '전국 토지 실거래가 데이터와 AI 분석으로 최적의 투자 기회를 찾으세요. 지역별 토지 시세, 최근 거래 내역, 용도지역별 가격 추이를 확인하세요.',
  keywords: [
    '토지 실거래가',
    '토지 시세',
    '토지 분석',
    '토지 가격',
    '토지 투자',
    '토지 매매',
    'AI 토지 분석',
  ],
  alternates: {
    canonical: '/land',
  },
}

const PREPARING_METADATA: Metadata = {
  title: '토지분석 준비중',
  description:
    '토지분석은 현재 내부 점검 모드입니다. 공시지가와 토지특성 수집 소스를 재정비한 뒤 다시 공개합니다.',
  robots: {
    index: false,
    follow: false,
  },
}

export const metadata: Metadata = ENABLE_LAND
  ? ACTIVE_METADATA
  : PREPARING_METADATA

export default function LandLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
