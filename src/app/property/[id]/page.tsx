// @TASK P3-S4-T1 - 매물 상세 페이지
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
    // Mock 데이터 반환 (개발용)
    return {
      id,
      name: '래미안 강남 퍼스트',
      address: '서울 강남구 역삼동 123-45',
      property_type: 'apt',
      sido: '서울시',
      sigungu: '강남구',
      eupmyeondong: '역삼동',
      area_exclusive: 84.5,
      built_year: 2021,
      floors: 15,
      thumbnail: null,
      images: [],
      complex_id: null,
      created_at: new Date().toISOString(),
      complexes: null,
    }
  }

  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const property = await getProperty(id)

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
