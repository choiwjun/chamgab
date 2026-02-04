'use client'

import { useState, useEffect } from 'react'
import { Bell, TrendingUp, Home, FileText, Check } from 'lucide-react'

interface Notification {
  id: string
  type: 'chamgab_changed' | 'transaction_new' | 'report_ready' | 'system'
  title: string
  body: string
  is_read: boolean
  created_at: string
}

// Mock 데이터
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'chamgab_changed',
    title: '참값이 변경되었습니다',
    body: '래미안 레이크팰리스의 참값이 5% 상승했습니다.',
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: '2',
    type: 'transaction_new',
    title: '새로운 거래가 등록되었습니다',
    body: '반포자이 아파트 인근에 새로운 실거래가가 등록되었습니다.',
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: '3',
    type: 'report_ready',
    title: '리포트가 준비되었습니다',
    body: '요청하신 PDF 리포트가 다운로드 가능합니다.',
    is_read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: '4',
    type: 'system',
    title: '서비스 업데이트 안내',
    body: '새로운 기능이 추가되었습니다. 지금 확인해보세요!',
    is_read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
]

const getIcon = (type: Notification['type']) => {
  switch (type) {
    case 'chamgab_changed':
      return <TrendingUp className="h-5 w-5 text-blue-500" />
    case 'transaction_new':
      return <Home className="h-5 w-5 text-green-500" />
    case 'report_ready':
      return <FileText className="h-5 w-5 text-purple-500" />
    case 'system':
      return <Bell className="h-5 w-5 text-gray-500" />
  }
}

const formatTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  if (hours < 24) return `${hours}시간 전`
  if (days === 1) return '어제'
  return `${days}일 전`
}

export function NotificationList() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Mock API 호출
    const fetchNotifications = async () => {
      setIsLoading(true)
      await new Promise(resolve => setTimeout(resolve, 500))
      setNotifications(MOCK_NOTIFICATIONS)
      setIsLoading(false)
    }
    fetchNotifications()
  }, [])

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
    )
  }

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse rounded-lg bg-white p-4 shadow">
            <div className="flex gap-3">
              <div className="h-10 w-10 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-gray-200" />
                <div className="h-3 w-2/3 rounded bg-gray-200" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Bell className="mb-4 h-12 w-12 text-gray-300" />
        <p className="text-gray-500">새로운 알림이 없어요</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            읽지 않은 알림 {unreadCount}개
          </span>
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Check className="h-4 w-4" />
            모두 읽음
          </button>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map(notification => (
          <div
            key={notification.id}
            onClick={() => markAsRead(notification.id)}
            className={`cursor-pointer rounded-lg bg-white p-4 shadow transition hover:shadow-md ${
              !notification.is_read ? 'border-l-4 border-primary' : ''
            }`}
          >
            <div className="flex gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                {getIcon(notification.type)}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <h3 className="font-medium text-gray-900">
                    {notification.title}
                    {!notification.is_read && (
                      <span className="ml-2 inline-block h-2 w-2 rounded-full bg-blue-500" />
                    )}
                  </h3>
                  <span className="text-xs text-gray-400">
                    {formatTime(notification.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{notification.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
