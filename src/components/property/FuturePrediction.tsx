'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Legend,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Calendar,
  BarChart3,
  Shield,
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8002'

interface PricePredictionPoint {
  date: string
  predicted_price: number
  lower_bound: number
  upper_bound: number
}

interface HistoricalPricePoint {
  date: string
  price: number
  transaction_count: number
}

interface TrendAnalysis {
  direction: string
  monthly_change_rate: number
  annual_change_rate: number
  volatility: number
  confidence: number
}

interface MarketSignal {
  signal_type: string
  title: string
  description: string
}

interface FuturePredictionData {
  property_id: string
  property_name: string
  current_price: number
  historical_prices: HistoricalPricePoint[]
  predictions: PricePredictionPoint[]
  trend: TrendAnalysis
  signals: MarketSignal[]
  prediction_method: string
  analyzed_at: string
}

interface FuturePredictionProps {
  propertyId: string
}

function formatPrice(price: number): string {
  if (price >= 100000000) {
    const eok = Math.floor(price / 100000000)
    const man = Math.floor((price % 100000000) / 10000)
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`
  }
  return `${Math.floor(price / 10000).toLocaleString()}만원`
}

function formatChartPrice(value: number): string {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1)}억`
  }
  return `${Math.floor(value / 10000)}만`
}

const TrendIcon = ({ direction }: { direction: string }) => {
  switch (direction) {
    case '상승':
      return <TrendingUp className="h-5 w-5 text-red-500" />
    case '하락':
      return <TrendingDown className="h-5 w-5 text-blue-500" />
    default:
      return <Minus className="h-5 w-5 text-gray-500" />
  }
}

const SignalIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'positive':
      return <CheckCircle className="h-5 w-5 text-green-500" />
    case 'negative':
      return <AlertCircle className="h-5 w-5 text-red-500" />
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />
    default:
      return <AlertCircle className="h-5 w-5 text-gray-400" />
  }
}

const signalBgColor: Record<string, string> = {
  positive: 'bg-green-50 border-green-200',
  negative: 'bg-red-50 border-red-200',
  warning: 'bg-yellow-50 border-yellow-200',
}

export default function FuturePrediction({
  propertyId,
}: FuturePredictionProps) {
  const [predictionMonths, setPredictionMonths] = useState(12)

  const { data, isLoading, error } = useQuery<FuturePredictionData>({
    queryKey: ['future-prediction', propertyId, predictionMonths],
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/api/chamgab/${propertyId}/future-prediction?months=${predictionMonths}`
      )
      if (!res.ok) throw new Error('예측 데이터를 불러올 수 없습니다.')
      return res.json()
    },
    staleTime: 10 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-64 animate-pulse rounded bg-gray-100" />
        <div className="mt-4 grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-2 text-lg font-bold text-gray-900">미래 가격 예측</h3>
        <p className="text-sm text-gray-500">
          예측 데이터를 불러올 수 없습니다.
        </p>
      </div>
    )
  }

  // 차트 데이터 결합 (과거 + 예측)
  const chartData = [
    ...data.historical_prices.map((p) => ({
      date: p.date,
      actual: p.price,
      predicted: null as number | null,
      lower: null as number | null,
      upper: null as number | null,
    })),
    // 마지막 실거래가를 예측 시작점에도 포함
    {
      date:
        data.historical_prices[data.historical_prices.length - 1]?.date || '',
      actual:
        data.historical_prices[data.historical_prices.length - 1]?.price || 0,
      predicted:
        data.historical_prices[data.historical_prices.length - 1]?.price || 0,
      lower:
        data.historical_prices[data.historical_prices.length - 1]?.price || 0,
      upper:
        data.historical_prices[data.historical_prices.length - 1]?.price || 0,
    },
    ...data.predictions.map((p) => ({
      date: p.date,
      actual: null as number | null,
      predicted: p.predicted_price,
      lower: p.lower_bound,
      upper: p.upper_bound,
    })),
  ]

  // 3/6/12개월 예측 요약
  const prediction3m = data.predictions[2]
  const prediction6m = data.predictions[5]
  const prediction12m =
    data.predictions[Math.min(11, data.predictions.length - 1)]

  const priceChange = (predicted: number) => {
    const change = ((predicted - data.current_price) / data.current_price) * 100
    return change
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-bold text-gray-900">미래 가격 예측</h3>
        </div>
        <div className="flex gap-2">
          {[6, 12, 24].map((m) => (
            <button
              key={m}
              onClick={() => setPredictionMonths(m)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                predictionMonths === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m}개월
            </button>
          ))}
        </div>
      </div>

      {/* 트렌드 요약 */}
      <div className="mb-6 flex items-center gap-4 rounded-lg bg-gray-50 p-4">
        <TrendIcon direction={data.trend.direction} />
        <div>
          <p className="font-semibold text-gray-900">
            {data.trend.direction} 추세
            <span className="ml-2 text-sm font-normal text-gray-500">
              (월 {data.trend.monthly_change_rate > 0 ? '+' : ''}
              {data.trend.monthly_change_rate}%, 연{' '}
              {data.trend.annual_change_rate > 0 ? '+' : ''}
              {data.trend.annual_change_rate}%)
            </span>
          </p>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              신뢰도 {data.trend.confidence}%
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              변동성 {data.trend.volatility}%
            </span>
          </div>
        </div>
      </div>

      {/* 예측 요약 카드 */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { label: '3개월 후', pred: prediction3m },
          { label: '6개월 후', pred: prediction6m },
          {
            label: `${Math.min(predictionMonths, 12)}개월 후`,
            pred: prediction12m,
          },
        ].map(({ label, pred }) => {
          if (!pred) return null
          const change = priceChange(pred.predicted_price)
          return (
            <div
              key={label}
              className="rounded-lg border border-gray-200 p-3 text-center"
            >
              <p className="text-xs text-gray-500">{label}</p>
              <p className="mt-1 text-sm font-bold text-gray-900">
                {formatPrice(pred.predicted_price)}
              </p>
              <p
                className={`mt-0.5 text-xs font-medium ${
                  change > 0
                    ? 'text-red-500'
                    : change < 0
                      ? 'text-blue-500'
                      : 'text-gray-500'
                }`}
              >
                {change > 0 ? '+' : ''}
                {change.toFixed(1)}%
              </p>
            </div>
          )
        })}
      </div>

      {/* 차트 */}
      <div className="mb-6 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatChartPrice}
              tick={{ fontSize: 10 }}
              width={55}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  actual: '실거래가',
                  predicted: '예측가',
                  lower: '하한',
                  upper: '상한',
                }
                return [formatPrice(value), labels[name] || name]
              }}
            />
            <Legend
              formatter={(value: string) => {
                const labels: Record<string, string> = {
                  actual: '실거래가',
                  predicted: '예측가',
                }
                return labels[value] || value
              }}
            />
            {/* 신뢰구간 영역 */}
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill="#818cf8"
              fillOpacity={0.1}
              name="upper"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="lower"
              stroke="none"
              fill="#ffffff"
              fillOpacity={1}
              name="lower"
              legendType="none"
            />
            {/* 실거래가 라인 */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#1f2937"
              strokeWidth={2}
              dot={{ r: 2 }}
              name="actual"
              connectNulls={false}
            />
            {/* 예측 라인 */}
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="#6366f1"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 2 }}
              name="predicted"
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 시장 시그널 */}
      {data.signals.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">시장 시그널</h4>
          {data.signals.map((signal, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                signalBgColor[signal.signal_type] ||
                'border-gray-200 bg-gray-50'
              }`}
            >
              <SignalIcon type={signal.signal_type} />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {signal.title}
                </p>
                <p className="text-xs text-gray-600">{signal.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 면책 조항 */}
      <p className="mt-4 text-[10px] text-gray-400">
        * 본 예측은 과거 실거래가 데이터 기반 통계 분석이며, 실제 가격은 시장
        상황에 따라 달라질 수 있습니다. 투자 결정 시 참고 자료로만 활용하세요.
      </p>
    </div>
  )
}
