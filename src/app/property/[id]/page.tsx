// @TASK P3-S4-T1 - 매물 상세 페이지

// 동적 렌더링 강제 (Supabase 사용)
export const dynamic = 'force-dynamic'

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { PropertyDetailClient } from './PropertyDetailClient'

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
      title: '매물을 찾을 수 없음 | 참값',
      description: 'AI 기반 부동산 가격 분석 서비스',
    }
  }

  return {
    title: `${property.name} | 참값`,
    description: `${property.address} - AI 기반 부동산 가격 분석`,
    openGraph: {
      title: `${property.name} - 참값 분석`,
      description: `${property.address} | 전용 ${property.area_exclusive}㎡`,
      images: property.thumbnail ? [property.thumbnail] : [],
    },
  }
}

export default async function PropertyDetailPage({ params }: Props) {
  const { id } = await params
  const property = await getProperty(id)

  if (!property) {
    notFound()
  }

  return <PropertyDetailClient property={property} />
}
