// 단지 상세 페이지

// 동적 렌더링 강제 (Supabase 사용)
export const dynamic = 'force-dynamic'

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getComplexById } from '@/services/complexes'
import { ComplexDetailClient } from './ComplexDetailClient'
import {
  BreadcrumbJsonLd,
  RealEstateListingJsonLd,
} from '@/components/seo/JsonLd'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const complex = await getComplexById(id)

  if (!complex) {
    return {
      title: '단지를 찾을 수 없습니다',
      description: 'AI 기반 부동산 가격 분석 서비스 참값입니다.',
    }
  }

  const unitsText = complex.total_units
    ? `${complex.total_units.toLocaleString('ko-KR')}세대`
    : '단지'
  const desc = `${complex.name} (${complex.address}) ${unitsText} 아파트 시세/실거래가 분석. AI 적정가격, 실거래 추이, 가격 영향 요인을 확인하세요.`

  return {
    title: `${complex.name} 시세·적정가격`,
    description: desc,
    keywords: [
      complex.name,
      `${complex.name} 시세`,
      `${complex.name} 실거래가`,
      '아파트 적정가격',
      'AI 부동산 분석',
    ],
    openGraph: {
      title: `${complex.name} - AI 적정가격 분석 | 참값`,
      description: desc,
    },
    twitter: {
      card: 'summary',
      title: `${complex.name} 시세·적정가격 | 참값`,
      description: `${complex.address} | ${unitsText}`,
    },
    alternates: {
      canonical: `/complex/${id}`,
    },
  }
}

export default async function ComplexDetailPage({ params }: Props) {
  const { id } = await params
  const complex = await getComplexById(id)

  if (!complex) notFound()

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: '홈', href: '/' },
          { name: '검색', href: '/search' },
          { name: complex.name, href: `/complex/${id}` },
        ]}
      />
      <RealEstateListingJsonLd
        name={complex.name}
        description={`${complex.address} - ${complex.total_units ?? 0}세대 아파트`}
        url={`/complex/${id}`}
        address={complex.address}
      />
      <ComplexDetailClient complex={complex} />
    </>
  )
}

