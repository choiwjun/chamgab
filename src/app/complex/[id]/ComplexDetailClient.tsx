'use client'

// 단지 상세 클라이언트 컴포넌트
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  MapPin,
  Building,
  Calendar,
  Car,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Home,
  Layers,
  Compass,
} from 'lucide-react'
import type { Complex } from '@/types/complex'
import { formatPrice } from '@/lib/format'

interface ComplexDetailClientProps {
  complex: Complex
}

interface Transaction {
  id: string
  price: number
  area_exclusive: number
  floor: number
  transaction_date: string
}

// 매물 정보 입력 타입
interface PropertyInput {
  areaType: string // 평형 타입 (예: '84A', '59B')
  floor: number // 층수
  dong: string // 동 (선택)
  direction: string // 향 (선택)
}

// SHAP 요인 카테고리
interface SHAPFactor {
  name: string
  impact: number
  description: string
  detail?: string // 상세 설명
  source?: string // 데이터 출처
}

interface SHAPCategory {
  category: string
  icon: string
  factors: SHAPFactor[]
  totalImpact: number
}

interface AnalysisResult {
  predicted_price: number
  confidence: number
  price_per_pyeong: number
  market_comparison: 'undervalued' | 'fair' | 'overvalued'
  propertyInput: PropertyInput // 분석에 사용된 매물 정보
  // 카테고리별 상세 SHAP 요인
  shapCategories: SHAPCategory[]
  // 시장 지표 (REB API 등)
  marketIndicators: {
    rebPriceIndex: number // 한국부동산원 가격지수
    rebRentIndex: number // 전세지수
    baseRate: number // 기준금리
    mortgageRate: number // 주담대 금리
    buyingPowerIndex: number // 매수우위지수
    jeonseRatio: number // 전세가율
  }
  // 분석 메타데이터
  analysisDate: string
  modelVersion: string
}

// 평형 타입 옵션 (단지별로 다를 수 있음)
const AREA_TYPES = [
  { value: '59A', label: '59㎡ A타입', pyeong: 18 },
  { value: '59B', label: '59㎡ B타입', pyeong: 18 },
  { value: '84A', label: '84㎡ A타입', pyeong: 25 },
  { value: '84B', label: '84㎡ B타입', pyeong: 25 },
  { value: '112A', label: '112㎡ A타입', pyeong: 34 },
  { value: '134A', label: '134㎡ A타입', pyeong: 40 },
]

// 향 옵션
const DIRECTIONS = [
  { value: '', label: '선택 안함' },
  { value: 'south', label: '남향' },
  { value: 'southeast', label: '남동향' },
  { value: 'southwest', label: '남서향' },
  { value: 'east', label: '동향' },
  { value: 'west', label: '서향' },
  { value: 'north', label: '북향' },
]

export function ComplexDetailClient({ complex }: ComplexDetailClientProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRequesting, setIsRequesting] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  )

  // 매물 정보 입력 state
  const [propertyInput, setPropertyInput] = useState<PropertyInput>({
    areaType: '',
    floor: 0,
    dong: '',
    direction: '',
  })
  const [inputErrors, setInputErrors] = useState<{
    areaType?: string
    floor?: string
  }>({})

  // 입력 유효성 검사
  const validateInput = (): boolean => {
    const errors: { areaType?: string; floor?: string } = {}

    if (!propertyInput.areaType) {
      errors.areaType = '평형을 선택해주세요'
    }
    if (!propertyInput.floor || propertyInput.floor < 1) {
      errors.floor = '층수를 입력해주세요'
    }

    setInputErrors(errors)
    return Object.keys(errors).length === 0
  }

  // 참값 분석 요청
  const handleRequestAnalysis = async () => {
    if (!validateInput()) {
      return
    }

    setIsRequesting(true)
    try {
      // TODO: 실제 ML API 연동
      // const res = await fetch('/api/chamgab', {
      //   method: 'POST',
      //   body: JSON.stringify({
      //     complex_id: complex.id,
      //     area_type: propertyInput.areaType,
      //     floor: propertyInput.floor,
      //     dong: propertyInput.dong,
      //     direction: propertyInput.direction,
      //   }),
      // })

      // Mock: 2초 후 완료 + Mock 분석 결과
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // 선택한 평형에 따른 가격 조정
      const selectedArea = AREA_TYPES.find(
        (a) => a.value === propertyInput.areaType
      )
      const basePricePerPyeong = 5850 // 만원
      const pyeong = selectedArea?.pyeong || 25

      // 층수에 따른 프리미엄 (고층일수록 높음)
      const floorPremium =
        propertyInput.floor > 20
          ? 1.05
          : propertyInput.floor > 10
            ? 1.02
            : propertyInput.floor < 5
              ? 0.97
              : 1.0

      // 향에 따른 프리미엄
      const directionPremium =
        propertyInput.direction === 'south'
          ? 1.03
          : propertyInput.direction === 'southeast' ||
              propertyInput.direction === 'southwest'
            ? 1.02
            : propertyInput.direction === 'north'
              ? 0.97
              : 1.0

      const predictedPrice = Math.round(
        basePricePerPyeong * pyeong * floorPremium * directionPremium * 10000
      )

      // 준공년도 기반 재건축 여부
      const buildingAge = 2026 - (complex.built_year || 2015)
      const isReconstructionTarget = buildingAge >= 30
      const isOldBuilding = buildingAge >= 20

      // 상세 SHAP 분석 결과 생성
      const shapCategories: SHAPCategory[] = [
        {
          category: '입지 요인',
          icon: '📍',
          totalImpact: 28.5,
          factors: [
            {
              name: '역세권 접근성',
              impact: 15.2,
              description: '지하철역 도보 5분 이내',
              detail: '2호선 역삼역 350m, 9호선 신논현역 500m',
              source: 'POI 데이터',
            },
            {
              name: '학군 프리미엄',
              impact: 12.8,
              description: '강남 8학군 내 위치',
              detail: '대치동 학원가 인접, 휘문고/단대부고 배정권',
              source: '학군 데이터',
            },
            {
              name: '편의시설 접근성',
              impact: 0.5,
              description: '대형마트/병원 1km 내',
              detail: '코스트코 800m, 삼성서울병원 1.2km',
              source: 'POI 데이터',
            },
          ],
        },
        {
          category: '시장 요인',
          icon: '📊',
          totalImpact: -2.1,
          factors: [
            {
              name: '기준금리 영향',
              impact: -3.5,
              description: '현재 기준금리 2.5%',
              detail: '6개월 전 대비 0.25%p 인하, 금리 인하 사이클',
              source: '한국은행',
            },
            {
              name: '매수우위지수',
              impact: -1.8,
              description: '현재 85 (매도 우위)',
              detail: '100 미만은 매도자 우위 시장, 협상 여지 존재',
              source: 'KB부동산',
            },
            {
              name: '지역 가격지수',
              impact: 2.7,
              description: '한국부동산원 지수 106.5',
              detail: '전월 대비 0.3% 상승, 3개월 연속 상승세',
              source: 'REB R-ONE API',
            },
            {
              name: '전세가율',
              impact: 0.5,
              description: '현재 55%',
              detail: '전세가율 하락 중, 갭투자 매력도 감소',
              source: 'KB부동산',
            },
          ],
        },
        {
          category: '상권/유동인구',
          icon: '🏪',
          totalImpact: 4.2,
          factors: [
            {
              name: '유동인구 점수',
              impact: 2.5,
              description: '유동인구 상위 15%',
              detail: '일평균 유동인구 45,000명, 상업지역 인접',
              source: '소상공인 유동인구 API',
            },
            {
              name: '상업밀집도',
              impact: 1.2,
              description: '상업시설 밀집 지역',
              detail: '반경 500m 내 음식점 127개, 편의점 23개',
              source: '소상공인 상권정보',
            },
            {
              name: '업종다양성',
              impact: 0.5,
              description: '업종다양성 지수 0.72',
              detail: '다양한 업종 분포로 생활 편의성 높음',
              source: '소상공인 상권정보',
            },
          ],
        },
        {
          category: '매물 특성',
          icon: '🏠',
          totalImpact:
            (propertyInput.floor > 15 ? 5.5 : propertyInput.floor < 5 ? -3.2 : 1.2) +
            (propertyInput.direction === 'south' ? 3.5 : propertyInput.direction === 'north' ? -2.8 : 0.5),
          factors: [
            {
              name: '층수',
              impact: propertyInput.floor > 15 ? 5.5 : propertyInput.floor < 5 ? -3.2 : 1.2,
              description: `${propertyInput.floor}층 ${propertyInput.floor > 15 ? '(고층 프리미엄)' : propertyInput.floor < 5 ? '(저층 할인)' : '(중층)'}`,
              detail: propertyInput.floor > 15
                ? '조망권 확보, 소음 감소, 프라이버시 우수'
                : propertyInput.floor < 5
                  ? '지상 소음 영향, 조망권 제한'
                  : '적정 층수, 엘리베이터 대기시간 적음',
              source: '실거래가 분석',
            },
            {
              name: '향',
              impact: propertyInput.direction === 'south' ? 3.5 : propertyInput.direction === 'north' ? -2.8 : 0.5,
              description: DIRECTIONS.find((d) => d.value === propertyInput.direction)?.label || '미지정',
              detail: propertyInput.direction === 'south'
                ? '채광 최상, 겨울 난방비 절감'
                : propertyInput.direction === 'north'
                  ? '채광 불리, 여름 시원함'
                  : '보통 채광 조건',
              source: '실거래가 분석',
            },
            {
              name: '평형 프리미엄',
              impact: pyeong >= 30 ? 2.1 : pyeong <= 20 ? -1.5 : 0,
              description: `${pyeong}평형 ${pyeong >= 30 ? '(대형 프리미엄)' : pyeong <= 20 ? '(소형)' : '(중형)'}`,
              detail: pyeong >= 30
                ? '대형 평형 희소성, 가족 수요 높음'
                : '1~2인 가구 수요층',
              source: '실거래가 분석',
            },
          ],
        },
        {
          category: '단지 요인',
          icon: '🏢',
          totalImpact: isReconstructionTarget ? 15.5 : isOldBuilding ? 3.2 : 10.8,
          factors: [
            {
              name: '단지 규모',
              impact: (complex.total_units || 500) > 1000 ? 8.5 : (complex.total_units || 500) > 500 ? 5.2 : 2.1,
              description: `${complex.total_units || 500}세대 ${(complex.total_units || 500) > 1000 ? '대단지' : '중단지'}`,
              detail: '커뮤니티 시설 풍부, 관리비 효율성 높음',
              source: '단지 정보',
            },
            {
              name: '브랜드 가치',
              impact: complex.brand === '래미안' || complex.brand === '아이파크' ? 4.5 : 2.0,
              description: `${complex.brand || '일반'} 브랜드`,
              detail: complex.brand ? '프리미엄 브랜드 가치 반영' : '일반 브랜드',
              source: '브랜드 티어 분석',
            },
            {
              name: isReconstructionTarget ? '재건축 프리미엄' : '건물 연식',
              impact: isReconstructionTarget ? 12.5 : isOldBuilding ? -2.5 : 1.5,
              description: `${complex.built_year || 2015}년 준공 (${buildingAge}년차)`,
              detail: isReconstructionTarget
                ? '재건축 안전진단 대상, 투자 프리미엄'
                : isOldBuilding
                  ? '노후화로 인한 할인 요인'
                  : '적정 연식, 시설 양호',
              source: '재건축 분석',
            },
            {
              name: '주차 여건',
              impact: (complex.parking_ratio || 1.0) >= 1.5 ? 1.8 : (complex.parking_ratio || 1.0) < 1.0 ? -1.5 : 0.5,
              description: `세대당 ${complex.parking_ratio?.toFixed(1) || '1.0'}대`,
              detail: (complex.parking_ratio || 1.0) >= 1.5
                ? '여유로운 주차 환경'
                : '주차 공간 부족 가능',
              source: '단지 정보',
            },
          ],
        },
      ]

      // Mock 분석 결과 생성
      const mockResult: AnalysisResult = {
        predicted_price: predictedPrice,
        confidence: 87.5,
        price_per_pyeong: Math.round(
          basePricePerPyeong * floorPremium * directionPremium
        ),
        market_comparison: 'fair',
        propertyInput: { ...propertyInput },
        shapCategories,
        marketIndicators: {
          rebPriceIndex: 106.5,
          rebRentIndex: 104.2,
          baseRate: 2.5,
          mortgageRate: 4.3,
          buyingPowerIndex: 85,
          jeonseRatio: 55,
        },
        analysisDate: new Date().toISOString().split('T')[0],
        modelVersion: 'XGBoost v2.1 (48 features)',
      }

      setAnalysisResult(mockResult)
    } catch (error) {
      console.error('Analysis request failed:', error)
      alert('분석 요청 중 오류가 발생했습니다.')
    } finally {
      setIsRequesting(false)
    }
  }

  // 실거래 데이터 로드 (Mock)
  useEffect(() => {
    async function loadTransactions() {
      setIsLoading(true)
      try {
        // TODO: 실제 API 연동
        // const res = await fetch(`/api/transactions?complex_id=${complex.id}&limit=10`)
        // const data = await res.json()
        // setTransactions(data.items)

        // Mock 데이터
        setTransactions([
          {
            id: '1',
            price: 1500000000,
            area_exclusive: 84.5,
            floor: 10,
            transaction_date: '2024-01-15',
          },
          {
            id: '2',
            price: 1450000000,
            area_exclusive: 84.5,
            floor: 5,
            transaction_date: '2023-12-20',
          },
          {
            id: '3',
            price: 1520000000,
            area_exclusive: 112.3,
            floor: 15,
            transaction_date: '2023-11-10',
          },
        ])
      } catch (error) {
        console.error('Failed to load transactions:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadTransactions()
  }, [complex.id])

  return (
    <div className="min-h-screen bg-editorial-bg pb-24">
      {/* 헤더 */}
      <div className="bg-white border-b border-editorial-dark/5">
        <div className="px-6 py-8">
          {/* 섹션 레이블 */}
          <div className="mb-6 flex items-center gap-3">
            <span className="w-8 h-px bg-editorial-gold" />
            <span className="text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
              Complex Detail
            </span>
          </div>

          {/* 브랜드 배지 */}
          <div className="mb-4 flex items-center gap-3">
            {complex.brand && (
              <span className="border border-editorial-gold/30 bg-editorial-gold/5 px-3 py-1.5 text-xs tracking-wider uppercase text-editorial-gold">
                {complex.brand}
              </span>
            )}
            <span className="text-sm tracking-wide text-editorial-ink/50">{complex.sigungu}</span>
          </div>

          {/* 단지명 */}
          <h1 className="font-serif text-2xl md:text-3xl text-editorial-dark mb-3">
            {complex.name}
          </h1>

          {/* 주소 */}
          <div className="flex items-center gap-2 text-editorial-ink/60">
            <MapPin className="h-4 w-4" />
            <span className="text-sm tracking-wide">{complex.address}</span>
          </div>
        </div>
      </div>

      {/* 단지 정보 */}
      <div className="mt-px bg-white border-b border-editorial-dark/5">
        <div className="px-6 py-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-8 h-px bg-editorial-gold" />
            <span className="text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
              Complex Info
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {complex.total_units && (
              <div className="flex items-center gap-4 border border-editorial-dark/5 p-4">
                <Building className="h-5 w-5 text-editorial-gold" />
                <div>
                  <p className="text-xs tracking-wide uppercase text-editorial-ink/50">총 세대수</p>
                  <p className="font-serif text-lg text-editorial-dark">
                    {complex.total_units.toLocaleString()}
                  </p>
                </div>
              </div>
            )}
            {complex.total_buildings && (
              <div className="flex items-center gap-4 border border-editorial-dark/5 p-4">
                <Building className="h-5 w-5 text-editorial-gold" />
                <div>
                  <p className="text-xs tracking-wide uppercase text-editorial-ink/50">총 동수</p>
                  <p className="font-serif text-lg text-editorial-dark">
                    {complex.total_buildings}동
                  </p>
                </div>
              </div>
            )}
            {complex.built_year && (
              <div className="flex items-center gap-4 border border-editorial-dark/5 p-4">
                <Calendar className="h-5 w-5 text-editorial-gold" />
                <div>
                  <p className="text-xs tracking-wide uppercase text-editorial-ink/50">준공년도</p>
                  <p className="font-serif text-lg text-editorial-dark">
                    {complex.built_year}
                  </p>
                </div>
              </div>
            )}
            {complex.parking_ratio && (
              <div className="flex items-center gap-4 border border-editorial-dark/5 p-4">
                <Car className="h-5 w-5 text-editorial-gold" />
                <div>
                  <p className="text-xs tracking-wide uppercase text-editorial-ink/50">주차대수</p>
                  <p className="font-serif text-lg text-editorial-dark">
                    {complex.parking_ratio.toFixed(1)}대/세대
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 참값 분석 */}
      <div className="mt-px bg-white border-b border-editorial-dark/5">
        <div className="px-6 py-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-8 h-px bg-editorial-gold" />
            <span className="text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
              AI Analysis
            </span>
          </div>

        {analysisResult ? (
          // 분석 결과 표시
          <div className="space-y-6">
            {/* 분석 대상 정보 */}
            <div className="border-l-2 border-editorial-gold bg-editorial-sand/30 px-4 py-3">
              <p className="text-xs tracking-widest uppercase text-editorial-ink/50 mb-1">분석 대상</p>
              <p className="text-sm text-editorial-dark">
                {AREA_TYPES.find(
                  (a) => a.value === analysisResult.propertyInput.areaType
                )?.label || analysisResult.propertyInput.areaType}{' '}
                · {analysisResult.propertyInput.floor}층
                {analysisResult.propertyInput.dong &&
                  ` · ${analysisResult.propertyInput.dong}동`}
                {analysisResult.propertyInput.direction &&
                  ` · ${DIRECTIONS.find((d) => d.value === analysisResult.propertyInput.direction)?.label}`}
              </p>
            </div>

            {/* 예측 가격 카드 - Editorial Style */}
            <div className="border border-editorial-dark bg-editorial-dark p-6 text-white relative">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-editorial-gold" />
              <p className="text-xs tracking-[0.2em] uppercase text-white/60 mb-3">AI 예측 적정가</p>
              <p className="font-serif text-3xl md:text-4xl mb-3">
                {formatPrice(analysisResult.predicted_price)}
              </p>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-white/70">
                  평당 {analysisResult.price_per_pyeong.toLocaleString()}만원
                </span>
                <span className="border border-white/30 px-3 py-1 text-xs tracking-wide">
                  신뢰도 {analysisResult.confidence}%
                </span>
              </div>
              <div className="mt-4 pt-4 border-t border-white/20 flex items-center gap-2">
                <span
                  className={`px-3 py-1 text-xs tracking-wider uppercase ${
                    analysisResult.market_comparison === 'undervalued'
                      ? 'bg-green-600'
                      : analysisResult.market_comparison === 'overvalued'
                        ? 'bg-red-600'
                        : 'bg-white/20'
                  }`}
                >
                  {analysisResult.market_comparison === 'undervalued'
                    ? '저평가'
                    : analysisResult.market_comparison === 'overvalued'
                      ? '고평가'
                      : '적정가'}
                </span>
              </div>
            </div>

            {/* 시장 지표 요약 */}
            <div className="border border-editorial-dark/10 p-5">
              <h3 className="mb-4 flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-editorial-ink/60">
                현재 시장 지표
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-editorial-dark/5 p-3 text-center">
                  <p className="text-xs tracking-wide uppercase text-editorial-ink/50 mb-1">기준금리</p>
                  <p className="font-serif text-lg text-editorial-dark">
                    {analysisResult.marketIndicators.baseRate}%
                  </p>
                </div>
                <div className="border border-editorial-dark/5 p-3 text-center">
                  <p className="text-xs tracking-wide uppercase text-editorial-ink/50 mb-1">매수우위</p>
                  <p className="font-serif text-lg text-editorial-dark">
                    {analysisResult.marketIndicators.buyingPowerIndex}
                  </p>
                </div>
                <div className="border border-editorial-dark/5 p-3 text-center">
                  <p className="text-xs tracking-wide uppercase text-editorial-ink/50 mb-1">가격지수</p>
                  <p className="font-serif text-lg text-editorial-gold">
                    {analysisResult.marketIndicators.rebPriceIndex}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-right text-xs text-editorial-ink/40">
                출처: 한국부동산원 R-ONE, 한국은행
              </p>
            </div>

            {/* 카테고리별 SHAP 분석 - Premium Accordion */}
            <div className="space-y-6">
              {/* 섹션 헤더 */}
              <div className="border-b border-editorial-dark/10 pb-4">
                <h3 className="font-serif text-lg text-editorial-dark mb-2">
                  Price Impact Analysis
                </h3>
                <p className="text-xs text-editorial-ink/50 tracking-wide">
                  {analysisResult.modelVersion} · SHAP Explainability
                </p>
              </div>

              {/* 카테고리 아코디언 */}
              <div className="divide-y divide-editorial-dark/5">
                {analysisResult.shapCategories.map((category, catIdx) => (
                  <details
                    key={catIdx}
                    className="group"
                    open={catIdx === 0}
                  >
                    <summary className="flex cursor-pointer items-center py-5 list-none [&::-webkit-details-marker]:hidden">
                      {/* 카테고리 번호 */}
                      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center border border-editorial-dark/10 text-xs font-medium text-editorial-ink/40 mr-4 group-open:border-editorial-gold group-open:text-editorial-gold transition-colors">
                        {String(catIdx + 1).padStart(2, '0')}
                      </div>

                      {/* 카테고리명 */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm tracking-wide text-editorial-dark group-hover:text-editorial-gold transition-colors">
                          {category.category}
                        </span>
                      </div>

                      {/* 영향도 */}
                      <div className="flex items-center gap-4 ml-4">
                        <div className="text-right">
                          <span
                            className={`font-serif text-lg ${
                              category.totalImpact > 0
                                ? 'text-red-600'
                                : 'text-blue-600'
                            }`}
                          >
                            {category.totalImpact > 0 ? '+' : ''}
                            {category.totalImpact.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-px h-6 bg-editorial-dark/10" />
                        <ChevronRight className="h-4 w-4 text-editorial-ink/30 transition-transform duration-300 group-open:rotate-90" />
                      </div>
                    </summary>

                    {/* 세부 요인 리스트 */}
                    <div className="pl-12 pb-6">
                      <div className="border-l border-editorial-gold/30 pl-6 space-y-0">
                        {category.factors.map((factor, factorIdx) => (
                          <div
                            key={factorIdx}
                            className="relative py-4 first:pt-0 border-b border-editorial-dark/5 last:border-b-0"
                          >
                            {/* 타임라인 도트 */}
                            <div className="absolute -left-6 top-4 first:top-0 w-2 h-2 -translate-x-1/2 bg-editorial-bg border border-editorial-gold/50" />

                            {/* 요인 헤더 */}
                            <div className="flex items-baseline justify-between mb-2">
                              <h4 className="text-sm text-editorial-dark">
                                {factor.name}
                              </h4>
                              <span
                                className={`font-mono text-sm tabular-nums ${
                                  factor.impact > 0 ? 'text-red-600' : 'text-blue-600'
                                }`}
                              >
                                {factor.impact > 0 ? '+' : ''}
                                {factor.impact.toFixed(1)}%
                              </span>
                            </div>

                            {/* 영향도 바 */}
                            <div className="mb-3">
                              <div className="h-1 bg-editorial-dark/5 overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 ${
                                    factor.impact > 0
                                      ? 'bg-gradient-to-r from-red-400 to-red-500'
                                      : 'bg-gradient-to-r from-blue-400 to-blue-500'
                                  }`}
                                  style={{
                                    width: `${Math.min(Math.abs(factor.impact) * 6, 100)}%`,
                                  }}
                                />
                              </div>
                            </div>

                            {/* 설명 */}
                            <p className="text-xs text-editorial-ink/60 leading-relaxed">
                              {factor.description}
                            </p>

                            {/* 상세 설명 */}
                            {factor.detail && (
                              <div className="mt-3 bg-editorial-sand/40 px-4 py-3">
                                <p className="text-xs text-editorial-ink/70 leading-relaxed">
                                  {factor.detail}
                                </p>
                              </div>
                            )}

                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>

            {/* 분석 메타데이터 */}
            <div className="flex items-center justify-between py-4 border-t border-editorial-dark/10">
              <div className="space-y-0.5">
                <p className="text-[10px] tracking-wider uppercase text-editorial-ink/40">Analysis Date</p>
                <p className="text-xs text-editorial-ink/60">{analysisResult.analysisDate}</p>
              </div>
              <div className="w-px h-8 bg-editorial-dark/10" />
              <div className="space-y-0.5 text-center">
                <p className="text-[10px] tracking-wider uppercase text-editorial-ink/40">Model</p>
                <p className="text-xs text-editorial-ink/60">{analysisResult.modelVersion}</p>
              </div>
              <div className="w-px h-8 bg-editorial-dark/10" />
              <div className="space-y-0.5 text-right">
                <p className="text-[10px] tracking-wider uppercase text-editorial-ink/40">Features</p>
                <p className="text-xs text-editorial-ink/60">48 Variables</p>
              </div>
            </div>

            {/* 다시 분석 버튼 */}
            <button
              onClick={() => setAnalysisResult(null)}
              className="w-full border border-editorial-dark py-3.5 text-sm tracking-widest uppercase text-editorial-dark hover:bg-editorial-dark hover:text-white transition-colors"
            >
              다시 분석하기
            </button>
          </div>
        ) : (
          // 분석 요청 전 - 매물 정보 입력 폼
          <div className="space-y-6">
            {/* 안내 메시지 */}
            <div className="border-l-2 border-editorial-gold bg-editorial-sand/30 px-4 py-3">
              <p className="text-sm text-editorial-ink/70">
                정확한 가격 분석을 위해 매물 정보를 입력해주세요.
              </p>
            </div>

            {/* 매물 정보 입력 폼 */}
            <div className="border border-editorial-dark/10 p-5">
              <h3 className="mb-5 flex items-center gap-3 text-xs tracking-[0.2em] uppercase text-editorial-ink/60">
                <Home className="h-4 w-4 text-editorial-gold" />
                매물 정보 입력
              </h3>

              <div className="space-y-5">
                {/* 평형 선택 (필수) */}
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs tracking-widest uppercase text-editorial-ink/60">
                    <Layers className="h-3.5 w-3.5" />
                    평형 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={propertyInput.areaType}
                    onChange={(e) =>
                      setPropertyInput((prev) => ({
                        ...prev,
                        areaType: e.target.value,
                      }))
                    }
                    className={`w-full border px-4 py-3.5 text-sm bg-white focus:border-editorial-gold focus:outline-none transition-colors ${
                      inputErrors.areaType ? 'border-red-500' : 'border-editorial-dark/10'
                    }`}
                  >
                    <option value="">평형을 선택하세요</option>
                    {AREA_TYPES.map((area) => (
                      <option key={area.value} value={area.value}>
                        {area.label} ({area.pyeong}평)
                      </option>
                    ))}
                  </select>
                  {inputErrors.areaType && (
                    <p className="mt-2 text-xs text-red-600">
                      {inputErrors.areaType}
                    </p>
                  )}
                </div>

                {/* 층수 입력 (필수) */}
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs tracking-widest uppercase text-editorial-ink/60">
                    <Building className="h-3.5 w-3.5" />
                    층수 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="70"
                    placeholder="예: 15"
                    value={propertyInput.floor || ''}
                    onChange={(e) =>
                      setPropertyInput((prev) => ({
                        ...prev,
                        floor: parseInt(e.target.value) || 0,
                      }))
                    }
                    className={`w-full border px-4 py-3.5 text-sm bg-white focus:border-editorial-gold focus:outline-none transition-colors ${
                      inputErrors.floor ? 'border-red-500' : 'border-editorial-dark/10'
                    }`}
                  />
                  {inputErrors.floor && (
                    <p className="mt-2 text-xs text-red-600">
                      {inputErrors.floor}
                    </p>
                  )}
                </div>

                {/* 동 입력 (선택) */}
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs tracking-widest uppercase text-editorial-ink/60">
                    <Building className="h-3.5 w-3.5" />
                    동 <span className="text-editorial-ink/40">(선택)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="예: 101"
                    value={propertyInput.dong}
                    onChange={(e) =>
                      setPropertyInput((prev) => ({
                        ...prev,
                        dong: e.target.value,
                      }))
                    }
                    className="w-full border border-editorial-dark/10 px-4 py-3.5 text-sm bg-white focus:border-editorial-gold focus:outline-none transition-colors"
                  />
                </div>

                {/* 향 선택 (선택) */}
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs tracking-widest uppercase text-editorial-ink/60">
                    <Compass className="h-3.5 w-3.5" />
                    향 <span className="text-editorial-ink/40">(선택)</span>
                  </label>
                  <select
                    value={propertyInput.direction}
                    onChange={(e) =>
                      setPropertyInput((prev) => ({
                        ...prev,
                        direction: e.target.value,
                      }))
                    }
                    className="w-full border border-editorial-dark/10 px-4 py-3.5 text-sm bg-white focus:border-editorial-gold focus:outline-none transition-colors"
                  >
                    {DIRECTIONS.map((dir) => (
                      <option key={dir.value} value={dir.value}>
                        {dir.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 분석 요청 버튼 */}
            <button
              onClick={handleRequestAnalysis}
              disabled={isRequesting}
              className="w-full bg-editorial-dark py-4 text-sm tracking-widest uppercase text-white hover:bg-editorial-gold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRequesting ? (
                <span className="flex items-center justify-center gap-3">
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  AI가 분석 중입니다...
                </span>
              ) : (
                '참값 분석 요청'
              )}
            </button>
          </div>
        )}
        </div>
      </div>

      {/* 최근 실거래 */}
      <div className="mt-px bg-white border-b border-editorial-dark/5">
        <div className="px-6 py-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-8 h-px bg-editorial-gold" />
              <span className="text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
                Recent Transactions
              </span>
            </div>
            <button className="flex items-center gap-1 text-xs tracking-wide text-editorial-gold hover:text-editorial-dark transition-colors">
              전체보기 <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse bg-editorial-sand/50"
                />
              ))}
            </div>
          ) : transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.map((tx, index) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between border border-editorial-dark/5 p-4 hover:border-editorial-gold/30 transition-colors"
                >
                  <div>
                    <p className="font-serif text-lg text-editorial-dark">
                      {formatPrice(tx.price)}
                    </p>
                    <p className="text-sm text-editorial-ink/50 mt-1">
                      {tx.area_exclusive}㎡ · {tx.floor}층
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs tracking-wide text-editorial-ink/40">{tx.transaction_date}</p>
                    {index > 0 && (
                      <p
                        className={`flex items-center justify-end text-xs mt-1 ${
                          tx.price > transactions[index - 1].price
                            ? 'text-red-600'
                            : 'text-blue-600'
                        }`}
                      >
                        {tx.price > transactions[index - 1].price ? (
                          <TrendingUp className="mr-1 h-3 w-3" />
                        ) : (
                          <TrendingDown className="mr-1 h-3 w-3" />
                        )}
                        {Math.abs(
                          ((tx.price - transactions[index - 1].price) /
                            transactions[index - 1].price) *
                            100
                        ).toFixed(1)}
                        %
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <div className="w-12 h-px bg-editorial-gold mx-auto mb-4" />
              <p className="text-sm text-editorial-ink/50">
                실거래 내역이 없습니다
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 하단 CTA */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-editorial-dark/10 bg-white px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <Link
            href={`/search?q=${encodeURIComponent(complex.name)}` as '/search'}
            className="block w-full bg-editorial-dark py-3.5 text-center text-sm tracking-widest uppercase text-white hover:bg-editorial-gold transition-colors"
          >
            이 단지 매물 보기
          </Link>
        </div>
      </div>
    </div>
  )
}
