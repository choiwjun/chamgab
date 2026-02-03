// @TASK P3-S4-T1 - 매물 상세 페이지 (Placeholder)
// Phase 3에서 구현 예정

import { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return {
    title: `매물 상세 - ${id} | 참값`,
    description: 'AI 기반 부동산 가격 분석 서비스',
  }
}

export default async function PropertyDetailPage({ params }: Props) {
  const { id } = await params

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">매물 상세</h1>
        <p className="mb-2 text-gray-600">매물 ID: {id}</p>
        <p className="text-sm text-gray-500">
          이 페이지는 Phase 3에서 구현 예정입니다.
        </p>
      </div>
    </div>
  )
}
