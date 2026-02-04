// 단지 상세 페이지

// 동적 렌더링 강제 (Supabase 사용)
export const dynamic = 'force-dynamic'

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getComplexById } from '@/services/complexes'
import { ComplexDetailClient } from './ComplexDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const complex = await getComplexById(id)

  if (!complex) {
    return {
      title: '단지를 찾을 수 없음 | 참값',
      description: 'AI 기반 부동산 가격 분석 서비스',
    }
  }

  return {
    title: `${complex.name} | 참값`,
    description: `${complex.address} - ${complex.total_units}세대 아파트 단지`,
    openGraph: {
      title: `${complex.name} - 참값 분석`,
      description: `${complex.address} | ${complex.total_units}세대`,
    },
  }
}

export default async function ComplexDetailPage({ params }: Props) {
  const { id } = await params
  const complex = await getComplexById(id)

  if (!complex) {
    notFound()
  }

  return <ComplexDetailClient complex={complex} />
}
