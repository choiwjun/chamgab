// @TASK P3-S4-T1 - 매물 상세 페이지

// 동적 렌더링 강제 (Supabase 사용)
export const dynamic = 'force-dynamic'

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { PropertyDetailClient } from './PropertyDetailClient'
import {
  BreadcrumbJsonLd,
  RealEstateListingJsonLd,
} from '@/components/seo/JsonLd'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

interface Props {
  params: Promise<{ id: string }>
}

// 매물 정보 조회
async function getProperty(id: string) {
  const { data, error } = await supabase
    .from('properties')
    .select('*, complexes(*)')
    .eq('id', id)
    .single()

  if (error || !data) {
    return null
  }

  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const property = await getProperty(id)

  if (!property) {
    return {
      title: '매물을 찾을 수 없음',
      description: 'AI 기반 부동산 가격 분석 서비스',
    }
  }

  const area = property.area_exclusive
    ? `전용 ${property.area_exclusive}㎡`
    : ''
  const desc = `${property.name} ${property.address} ${area} - AI 적정가격 분석. 실거래가 기반 가격 예측과 영향 요인을 확인하세요.`

  return {
    title: `${property.name} ${area}`,
    description: desc,
    keywords: [
      property.name,
      `${property.name} 시세`,
      `${property.name} 실거래가`,
      '아파트 적정가격',
    ],
    openGraph: {
      title: `${property.name} ${area} | 참값`,
      description: desc,
      images: property.thumbnail ? [property.thumbnail] : [],
    },
    twitter: {
      card: 'summary',
      title: `${property.name} ${area} | 참값`,
      description: `${property.address} ${area}`,
    },
    alternates: {
      canonical: `/property/${id}`,
    },
  }
}

export default async function PropertyDetailPage({ params }: Props) {
  const { id } = await params
  const property = await getProperty(id)

  if (!property) {
    notFound()
  }

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: '홈', href: '/' },
          { name: '검색', href: '/search' },
          { name: property.name, href: `/property/${id}` },
        ]}
      />
      <RealEstateListingJsonLd
        name={property.name}
        description={`${property.address} - AI 적정가격 분석`}
        url={`/property/${id}`}
        address={property.address}
        area={property.area_exclusive}
        image={property.thumbnail}
      />
      <PropertyDetailClient property={property} />
    </>
  )
}
