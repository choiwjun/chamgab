'use client'

const API_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8002'

import { useQuery } from '@tanstack/react-query'
import {
  Bell,
  TrendingUp,
  TrendingDown,
  Store,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { useState } from 'react'

// Types matching backend API
interface Alert {
  alert_id: string
  alert_type: string // price_change, district_growth, opportunity
  title: string
  message: string
  severity: string // info, warning, critical
  data: Record<string, unknown>
  created_at: string
}

interface NotificationCenterProps {
  userId: string
  limit?: number
}

export default function NotificationCenter({
  userId,
  limit = 10,
}: NotificationCenterProps) {
  const [selectedFilter, setSelectedFilter] = useState<string>('all')

  const {
    data: alerts,
    isLoading,
    error,
    refetch,
  } = useQuery<Alert[]>({
    queryKey: ['alerts', userId, limit],
    queryFn: async () => {
      const response = await fetch(
        `${API_URL}/api/integrated/alerts/${userId}?limit=${limit}`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch alerts')
      }
      return response.json()
    },
    refetchInterval: 30000, // 30초마다 자동 갱신
  })

  const getAlertIcon = (type: string, severity: string) => {
    switch (type) {
      case 'price_change':
        return severity === 'critical' ? (
          <TrendingDown className="h-5 w-5" />
        ) : (
          <TrendingUp className="h-5 w-5" />
        )
      case 'district_growth':
        return <Store className="h-5 w-5" />
      case 'opportunity':
        return <CheckCircle2 className="h-5 w-5" />
      default:
        return <Info className="h-5 w-5" />
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-red-200 bg-red-50'
      case 'warning':
        return 'border-yellow-200 bg-yellow-50'
      default:
        return 'border-blue-200 bg-blue-50'
    }
  }

  const getSeverityIconColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600'
      case 'warning':
        return 'text-yellow-600'
      default:
        return 'text-blue-600'
    }
  }

  const getAlertTypeLabel = (type: string) => {
    switch (type) {
      case 'price_change':
        return '가격 변동'
      case 'district_growth':
        return '상권 성장'
      case 'opportunity':
        return '투자 기회'
      default:
        return '알림'
    }
  }

  const filteredAlerts =
    selectedFilter === 'all'
      ? alerts
      : alerts?.filter((alert) => alert.alert_type === selectedFilter)

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-1/4 rounded bg-gray-200"></div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded bg-gray-200"></div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-red-600">알림을 불러오는데 실패했습니다.</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-white shadow">
      {/* 헤더 */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-6 w-6 text-gray-600" />
            <h2 className="text-xl font-bold">알림 센터</h2>
          </div>
          <button
            onClick={() => refetch()}
            className="text-sm text-blue-600 hover:underline"
          >
            새로고침
          </button>
        </div>

        {/* 필터 */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              selectedFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            전체 ({alerts?.length || 0})
          </button>
          <button
            onClick={() => setSelectedFilter('price_change')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              selectedFilter === 'price_change'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            가격 변동 (
            {alerts?.filter((a) => a.alert_type === 'price_change').length || 0}
            )
          </button>
          <button
            onClick={() => setSelectedFilter('district_growth')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              selectedFilter === 'district_growth'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            상권 성장 (
            {alerts?.filter((a) => a.alert_type === 'district_growth').length ||
              0}
            )
          </button>
          <button
            onClick={() => setSelectedFilter('opportunity')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              selectedFilter === 'opportunity'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            투자 기회 (
            {alerts?.filter((a) => a.alert_type === 'opportunity').length || 0})
          </button>
        </div>
      </div>

      {/* 알림 리스트 */}
      <div className="p-6">
        {!filteredAlerts || filteredAlerts.length === 0 ? (
          <div className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-gray-600">알림이 없습니다.</p>
            <p className="text-sm text-gray-500">
              매물이나 상권을 구독하면 변동사항을 알려드립니다.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAlerts.map((alert) => (
              <div
                key={alert.alert_id}
                className={`rounded-lg border p-4 ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={getSeverityIconColor(alert.severity)}>
                      {getAlertIcon(alert.alert_type, alert.severity)}
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold">
                          {getAlertTypeLabel(alert.alert_type)}
                        </span>
                        <span className="text-xs text-gray-600">
                          {new Date(alert.created_at).toLocaleString('ko-KR', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <h3 className="font-semibold">{alert.title}</h3>
                      <p className="mt-1 text-sm text-gray-700">
                        {alert.message}
                      </p>

                      {/* 추가 데이터 */}
                      {alert.data && Object.keys(alert.data).length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2 rounded bg-white/50 p-2 text-xs md:grid-cols-3">
                          {alert.data.property_name && (
                            <div>
                              <span className="text-gray-600">매물:</span>
                              <span className="ml-1 font-semibold">
                                {alert.data.property_name}
                              </span>
                            </div>
                          )}
                          {alert.data.change_percent !== undefined && (
                            <div>
                              <span className="text-gray-600">변동률:</span>
                              <span
                                className={`ml-1 font-semibold ${
                                  alert.data.change_percent > 0
                                    ? 'text-red-600'
                                    : 'text-blue-600'
                                }`}
                              >
                                {alert.data.change_percent > 0 ? '+' : ''}
                                {alert.data.change_percent.toFixed(1)}%
                              </span>
                            </div>
                          )}
                          {alert.data.growth_rate !== undefined && (
                            <div>
                              <span className="text-gray-600">성장률:</span>
                              <span className="ml-1 font-semibold text-green-600">
                                +{alert.data.growth_rate.toFixed(1)}%
                              </span>
                            </div>
                          )}
                          {alert.data.district_name && (
                            <div>
                              <span className="text-gray-600">상권:</span>
                              <span className="ml-1 font-semibold">
                                {alert.data.district_name}
                              </span>
                            </div>
                          )}
                          {alert.data.investment_score && (
                            <div>
                              <span className="text-gray-600">투자 점수:</span>
                              <span className="ml-1 font-semibold">
                                {alert.data.investment_score}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
