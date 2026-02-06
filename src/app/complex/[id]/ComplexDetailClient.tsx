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
      // 실제 ML API 연동
      const res = await fetch('/api/chamgab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complex_id: complex.id,
          area_type: propertyInput.areaType,
          floor: propertyInput.floor,
          dong: propertyInput.dong,
          direction: propertyInput.direction,
        }),
      })

      if (!res.ok) {
        throw new Error('Analysis request failed')
      }

      const result = await res.json()
      setAnalysisResult(result.analysis)
    } catch (error) {
      console.error('Analysis request failed:', error)
      alert('분석 요청 중 오류가 발생했습니다.')
    } finally {
      setIsRequesting(false)
    }
  }

  // 실거래 데이터 로드
  useEffect(() => {
    async function loadTransactions() {
      setIsLoading(true)
      try {
        // 실제 API 연동
        const res = await fetch(
          `/api/transactions?complex_id=${complex.id}&limit=10`
        )

        if (!res.ok) {
          throw new Error('Failed to fetch transactions')
        }

        const data = await res.json()
        setTransactions(data.items || [])
      } catch (error) {
        console.error('Failed to load transactions:', error)
        setTransactions([])
      } finally {
        setIsLoading(false)
      }
    }

    loadTransactions()
  }, [complex.id])

  return (
    <div className="min-h-screen bg-editorial-bg pb-24">
      {/* 헤더 */}
      <div className="border-b border-editorial-dark/5 bg-white">
        <div className="px-6 py-8">
          {/* 섹션 레이블 */}
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-editorial-gold" />
            <span className="text-xs uppercase tracking-[0.2em] text-editorial-ink/50">
              Complex Detail
            </span>
          </div>

          {/* 브랜드 배지 */}
          <div className="mb-4 flex items-center gap-3">
            {complex.brand && (
              <span className="border border-editorial-gold/30 bg-editorial-gold/5 px-3 py-1.5 text-xs uppercase tracking-wider text-editorial-gold">
                {complex.brand}
              </span>
            )}
            <span className="text-sm tracking-wide text-editorial-ink/50">
              {complex.sigungu}
            </span>
          </div>

          {/* 단지명 */}
          <h1 className="mb-3 font-serif text-2xl text-editorial-dark md:text-3xl">
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
      <div className="mt-px border-b border-editorial-dark/5 bg-white">
        <div className="px-6 py-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-editorial-gold" />
            <span className="text-xs uppercase tracking-[0.2em] text-editorial-ink/50">
              Complex Info
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {complex.total_units && (
              <div className="flex items-center gap-4 border border-editorial-dark/5 p-4">
                <Building className="h-5 w-5 text-editorial-gold" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-editorial-ink/50">
                    총 세대수
                  </p>
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
                  <p className="text-xs uppercase tracking-wide text-editorial-ink/50">
                    총 동수
                  </p>
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
                  <p className="text-xs uppercase tracking-wide text-editorial-ink/50">
                    준공년도
                  </p>
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
                  <p className="text-xs uppercase tracking-wide text-editorial-ink/50">
                    주차대수
                  </p>
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
      <div className="mt-px border-b border-editorial-dark/5 bg-white">
        <div className="px-6 py-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-editorial-gold" />
            <span className="text-xs uppercase tracking-[0.2em] text-editorial-ink/50">
              AI Analysis
            </span>
          </div>

          {analysisResult ? (
            // 분석 결과 표시
            <div className="space-y-6">
              {/* 분석 대상 정보 */}
              <div className="border-l-2 border-editorial-gold bg-editorial-sand/30 px-4 py-3">
                <p className="mb-1 text-xs uppercase tracking-widest text-editorial-ink/50">
                  분석 대상
                </p>
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
              <div className="relative border border-editorial-dark bg-editorial-dark p-6 text-white">
                <div className="absolute left-0 top-0 h-0.5 w-full bg-editorial-gold" />
                <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/60">
                  AI 예측 적정가
                </p>
                <p className="mb-3 font-serif text-3xl md:text-4xl">
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
                <div className="mt-4 flex items-center gap-2 border-t border-white/20 pt-4">
                  <span
                    className={`px-3 py-1 text-xs uppercase tracking-wider ${
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
                <h3 className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-editorial-ink/60">
                  현재 시장 지표
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-editorial-dark/5 p-3 text-center">
                    <p className="mb-1 text-xs uppercase tracking-wide text-editorial-ink/50">
                      기준금리
                    </p>
                    <p className="font-serif text-lg text-editorial-dark">
                      {analysisResult.marketIndicators.baseRate}%
                    </p>
                  </div>
                  <div className="border border-editorial-dark/5 p-3 text-center">
                    <p className="mb-1 text-xs uppercase tracking-wide text-editorial-ink/50">
                      매수우위
                    </p>
                    <p className="font-serif text-lg text-editorial-dark">
                      {analysisResult.marketIndicators.buyingPowerIndex}
                    </p>
                  </div>
                  <div className="border border-editorial-dark/5 p-3 text-center">
                    <p className="mb-1 text-xs uppercase tracking-wide text-editorial-ink/50">
                      가격지수
                    </p>
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
                  <h3 className="mb-2 font-serif text-lg text-editorial-dark">
                    Price Impact Analysis
                  </h3>
                  <p className="text-xs tracking-wide text-editorial-ink/50">
                    {analysisResult.modelVersion} · SHAP Explainability
                  </p>
                </div>

                {/* 카테고리 아코디언 */}
                <div className="divide-y divide-editorial-dark/5">
                  {analysisResult.shapCategories.map((category, catIdx) => (
                    <details key={catIdx} className="group" open={catIdx === 0}>
                      <summary className="flex cursor-pointer list-none items-center py-5 [&::-webkit-details-marker]:hidden">
                        {/* 카테고리 번호 */}
                        <div className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center border border-editorial-dark/10 text-xs font-medium text-editorial-ink/40 transition-colors group-open:border-editorial-gold group-open:text-editorial-gold">
                          {String(catIdx + 1).padStart(2, '0')}
                        </div>

                        {/* 카테고리명 */}
                        <div className="min-w-0 flex-1">
                          <span className="text-sm tracking-wide text-editorial-dark transition-colors group-hover:text-editorial-gold">
                            {category.category}
                          </span>
                        </div>

                        {/* 영향도 */}
                        <div className="ml-4 flex items-center gap-4">
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
                          <div className="h-6 w-px bg-editorial-dark/10" />
                          <ChevronRight className="h-4 w-4 text-editorial-ink/30 transition-transform duration-300 group-open:rotate-90" />
                        </div>
                      </summary>

                      {/* 세부 요인 리스트 */}
                      <div className="pb-6 pl-12">
                        <div className="space-y-0 border-l border-editorial-gold/30 pl-6">
                          {category.factors.map((factor, factorIdx) => (
                            <div
                              key={factorIdx}
                              className="relative border-b border-editorial-dark/5 py-4 first:pt-0 last:border-b-0"
                            >
                              {/* 타임라인 도트 */}
                              <div className="absolute -left-6 top-4 h-2 w-2 -translate-x-1/2 border border-editorial-gold/50 bg-editorial-bg first:top-0" />

                              {/* 요인 헤더 */}
                              <div className="mb-2 flex items-baseline justify-between">
                                <h4 className="text-sm text-editorial-dark">
                                  {factor.name}
                                </h4>
                                <span
                                  className={`font-mono text-sm tabular-nums ${
                                    factor.impact > 0
                                      ? 'text-red-600'
                                      : 'text-blue-600'
                                  }`}
                                >
                                  {factor.impact > 0 ? '+' : ''}
                                  {factor.impact.toFixed(1)}%
                                </span>
                              </div>

                              {/* 영향도 바 */}
                              <div className="mb-3">
                                <div className="h-1 overflow-hidden bg-editorial-dark/5">
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
                              <p className="text-xs leading-relaxed text-editorial-ink/60">
                                {factor.description}
                              </p>

                              {/* 상세 설명 */}
                              {factor.detail && (
                                <div className="mt-3 bg-editorial-sand/40 px-4 py-3">
                                  <p className="text-xs leading-relaxed text-editorial-ink/70">
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
              <div className="flex items-center justify-between border-t border-editorial-dark/10 py-4">
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase tracking-wider text-editorial-ink/40">
                    Analysis Date
                  </p>
                  <p className="text-xs text-editorial-ink/60">
                    {analysisResult.analysisDate}
                  </p>
                </div>
                <div className="h-8 w-px bg-editorial-dark/10" />
                <div className="space-y-0.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-editorial-ink/40">
                    Model
                  </p>
                  <p className="text-xs text-editorial-ink/60">
                    {analysisResult.modelVersion}
                  </p>
                </div>
                <div className="h-8 w-px bg-editorial-dark/10" />
                <div className="space-y-0.5 text-right">
                  <p className="text-[10px] uppercase tracking-wider text-editorial-ink/40">
                    Features
                  </p>
                  <p className="text-xs text-editorial-ink/60">48 Variables</p>
                </div>
              </div>

              {/* 다시 분석 버튼 */}
              <button
                onClick={() => setAnalysisResult(null)}
                className="w-full border border-editorial-dark py-3.5 text-sm uppercase tracking-widest text-editorial-dark transition-colors hover:bg-editorial-dark hover:text-white"
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
                <h3 className="mb-5 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-editorial-ink/60">
                  <Home className="h-4 w-4 text-editorial-gold" />
                  매물 정보 입력
                </h3>

                <div className="space-y-5">
                  {/* 평형 선택 (필수) */}
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-editorial-ink/60">
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
                      className={`w-full border bg-white px-4 py-3.5 text-sm transition-colors focus:border-editorial-gold focus:outline-none ${
                        inputErrors.areaType
                          ? 'border-red-500'
                          : 'border-editorial-dark/10'
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
                    <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-editorial-ink/60">
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
                      className={`w-full border bg-white px-4 py-3.5 text-sm transition-colors focus:border-editorial-gold focus:outline-none ${
                        inputErrors.floor
                          ? 'border-red-500'
                          : 'border-editorial-dark/10'
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
                    <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-editorial-ink/60">
                      <Building className="h-3.5 w-3.5" />동{' '}
                      <span className="text-editorial-ink/40">(선택)</span>
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
                      className="w-full border border-editorial-dark/10 bg-white px-4 py-3.5 text-sm transition-colors focus:border-editorial-gold focus:outline-none"
                    />
                  </div>

                  {/* 향 선택 (선택) */}
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-editorial-ink/60">
                      <Compass className="h-3.5 w-3.5" />향{' '}
                      <span className="text-editorial-ink/40">(선택)</span>
                    </label>
                    <select
                      value={propertyInput.direction}
                      onChange={(e) =>
                        setPropertyInput((prev) => ({
                          ...prev,
                          direction: e.target.value,
                        }))
                      }
                      className="w-full border border-editorial-dark/10 bg-white px-4 py-3.5 text-sm transition-colors focus:border-editorial-gold focus:outline-none"
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
                className="w-full bg-editorial-dark py-4 text-sm uppercase tracking-widest text-white transition-colors hover:bg-editorial-gold disabled:cursor-not-allowed disabled:opacity-50"
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
      <div className="mt-px border-b border-editorial-dark/5 bg-white">
        <div className="px-6 py-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-editorial-gold" />
              <span className="text-xs uppercase tracking-[0.2em] text-editorial-ink/50">
                Recent Transactions
              </span>
            </div>
            <button className="flex items-center gap-1 text-xs tracking-wide text-editorial-gold transition-colors hover:text-editorial-dark">
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
                  className="flex items-center justify-between border border-editorial-dark/5 p-4 transition-colors hover:border-editorial-gold/30"
                >
                  <div>
                    <p className="font-serif text-lg text-editorial-dark">
                      {formatPrice(tx.price)}
                    </p>
                    <p className="mt-1 text-sm text-editorial-ink/50">
                      {tx.area_exclusive}㎡ · {tx.floor}층
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs tracking-wide text-editorial-ink/40">
                      {tx.transaction_date}
                    </p>
                    {index > 0 && (
                      <p
                        className={`mt-1 flex items-center justify-end text-xs ${
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
              <div className="mx-auto mb-4 h-px w-12 bg-editorial-gold" />
              <p className="text-sm text-editorial-ink/50">
                실거래 내역이 없습니다
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 하단 CTA */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-editorial-dark/10 bg-white px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <Link
            href={`/search?q=${encodeURIComponent(complex.name)}` as '/search'}
            className="block w-full bg-editorial-dark py-3.5 text-center text-sm uppercase tracking-widest text-white transition-colors hover:bg-editorial-gold"
          >
            이 단지 매물 보기
          </Link>
        </div>
      </div>
    </div>
  )
}
