'use client'

const API_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8002'

import { useQuery } from '@tanstack/react-query'
import { Building2, Store, MapPin, CheckCircle2, Award } from 'lucide-react'

// Types matching backend API
interface PropertyAnalysis {
  property_id: string
  property_name: string
  address: string
  investment_score: number
  roi_1year: number
  roi_3year: number
  jeonse_ratio: number
  liquidity_score: number
}

interface NearbyDistrict {
  code: string
  name: string
  distance_km: number
  success_probability: number
  avg_monthly_sales: number
  foot_traffic_score: number
}

interface ConvenienceScore {
  total_score: number
  transport_score: number
  commercial_score: number
  education_score: number
  medical_score: number
  amenities_count: number
}

interface IntegratedInvestmentScore {
  total_score: number
  apartment_weight: number
  convenience_weight: number
  rating: string
  recommendation: string
}

interface IntegratedAnalysisData {
  property_analysis: PropertyAnalysis
  nearby_districts: NearbyDistrict[]
  convenience: ConvenienceScore
  integrated_score: IntegratedInvestmentScore
  analyzed_at: string
}

interface IntegratedDashboardProps {
  propertyId: string
  radiusKm?: number
}

export default function IntegratedDashboard({
  propertyId,
  radiusKm = 1.0,
}: IntegratedDashboardProps) {
  const { data, isLoading, error } = useQuery<IntegratedAnalysisData>({
    queryKey: ['integrated-analysis', propertyId, radiusKm],
    queryFn: async () => {
      const response = await fetch(
        `${API_URL}/api/integrated/analysis?property_id=${propertyId}&radius_km=${radiusKm}`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch integrated analysis')
      }
      return response.json()
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg bg-white p-6 shadow">
            <div className="animate-pulse">
              <div className="mb-4 h-4 w-1/3 rounded bg-gray-200"></div>
              <div className="h-32 rounded bg-gray-200"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-red-600">
          통합 분석 데이터를 불러오는데 실패했습니다.
        </p>
      </div>
    )
  }

  if (!data) return null

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'excellent':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'good':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'fair':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      default:
        return 'text-red-600 bg-red-50 border-red-200'
    }
  }

  const getRatingLabel = (rating: string) => {
    switch (rating) {
      case 'excellent':
        return '매우 우수'
      case 'good':
        return '우수'
      case 'fair':
        return '보통'
      default:
        return '주의'
    }
  }

  return (
    <div className="space-y-6">
      {/* 통합 투자 점수 */}
      <div
        className={`rounded-lg border p-6 shadow ${getRatingColor(data.integrated_score.rating)}`}
      >
        <div className="mb-4 flex items-center gap-2">
          <Award className="h-6 w-6" />
          <h3 className="text-xl font-bold">통합 투자 점수</h3>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* 점수 */}
          <div>
            <div className="flex items-end gap-2">
              <p className="text-5xl font-bold">
                {data.integrated_score.total_score.toFixed(1)}
              </p>
              <span className="mb-2 text-gray-600">/100</span>
            </div>
            <p className="mt-2 text-lg font-semibold">
              {getRatingLabel(data.integrated_score.rating)}
            </p>
            <div className="mt-4 h-3 rounded-full bg-gray-200">
              <div
                className="h-3 rounded-full bg-current"
                style={{ width: `${data.integrated_score.total_score}%` }}
              ></div>
            </div>
          </div>

          {/* 구성 비율 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">아파트 투자 가치</span>
              <span className="font-semibold">
                {(data.integrated_score.apartment_weight * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">생활 편의성</span>
              <span className="font-semibold">
                {(data.integrated_score.convenience_weight * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-4 rounded-lg bg-white/50 p-3">
              <p className="text-sm">{data.integrated_score.recommendation}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 아파트 분석 섹션 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-bold">아파트 투자 분석</h3>
        </div>

        <div className="mb-4">
          <h4 className="text-xl font-semibold">
            {data.property_analysis.property_name}
          </h4>
          <p className="text-sm text-gray-600">
            {data.property_analysis.address}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-xs text-blue-600">투자 점수</p>
            <p className="text-2xl font-bold text-blue-900">
              {data.property_analysis.investment_score}
            </p>
          </div>
          <div className="rounded-lg bg-green-50 p-3">
            <p className="text-xs text-green-600">1년 ROI</p>
            <p className="text-2xl font-bold text-green-900">
              {data.property_analysis.roi_1year}%
            </p>
          </div>
          <div className="rounded-lg bg-purple-50 p-3">
            <p className="text-xs text-purple-600">전세가율</p>
            <p className="text-2xl font-bold text-purple-900">
              {data.property_analysis.jeonse_ratio}%
            </p>
          </div>
          <div className="rounded-lg bg-orange-50 p-3">
            <p className="text-xs text-orange-600">유동성</p>
            <p className="text-2xl font-bold text-orange-900">
              {data.property_analysis.liquidity_score}
            </p>
          </div>
        </div>
      </div>

      {/* 생활 편의성 섹션 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <h3 className="text-lg font-bold">생활 편의성 분석</h3>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">종합 점수</span>
            <span className="text-2xl font-bold text-green-600">
              {data.convenience.total_score.toFixed(1)}
            </span>
          </div>
          <div className="mt-2 h-3 rounded-full bg-gray-200">
            <div
              className="h-3 rounded-full bg-green-500"
              style={{ width: `${data.convenience.total_score}%` }}
            ></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-gray-600">대중교통</p>
            <p className="text-lg font-semibold">
              {data.convenience.transport_score.toFixed(0)}
            </p>
            <div className="mt-1 h-2 rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-blue-500"
                style={{ width: `${data.convenience.transport_score}%` }}
              ></div>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-600">상권 밀집도</p>
            <p className="text-lg font-semibold">
              {data.convenience.commercial_score.toFixed(0)}
            </p>
            <div className="mt-1 h-2 rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-green-500"
                style={{ width: `${data.convenience.commercial_score}%` }}
              ></div>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-600">교육 시설</p>
            <p className="text-lg font-semibold">
              {data.convenience.education_score.toFixed(0)}
            </p>
            <div className="mt-1 h-2 rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-purple-500"
                style={{ width: `${data.convenience.education_score}%` }}
              ></div>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-600">의료 시설</p>
            <p className="text-lg font-semibold">
              {data.convenience.medical_score.toFixed(0)}
            </p>
            <div className="mt-1 h-2 rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-red-500"
                style={{ width: `${data.convenience.medical_score}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          {radiusKm}km 반경 내 {data.convenience.amenities_count}개 상권 분석
        </div>
      </div>

      {/* 근처 상권 섹션 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
        <div className="mb-4 flex items-center gap-2">
          <Store className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-bold">근처 상권 정보</h3>
        </div>

        <div className="space-y-3">
          {data.nearby_districts.slice(0, 5).map((district, i) => (
            <div
              key={district.code}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                  {i + 1}
                </div>
                <div>
                  <h4 className="font-semibold">{district.name}</h4>
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    <MapPin className="h-3 w-3" />
                    <span>{district.distance_km}km</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-green-600">
                  {district.success_probability}%
                </p>
                <p className="text-xs text-gray-500">성공률</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 분석 시간 */}
      <div className="text-center text-xs text-gray-500">
        분석 시간: {new Date(data.analyzed_at).toLocaleString('ko-KR')}
      </div>
    </div>
  )
}
