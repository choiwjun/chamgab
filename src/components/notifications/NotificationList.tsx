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
    const fetchNotifications = async () => {
      setIsLoading(true)
      try {
        const res = await fetch('/api/notifications?limit=50')
        if (res.ok) {
          const data = await res.json()
          setNotifications(data.notifications || [])
        } else {
          setNotifications([])
        }
      } catch {
        setNotifications([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchNotifications()
  }, [])

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    )
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
    } catch {
      // 낙관적 UI - 실패해도 UI는 유지
    }
  }

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
    } catch {
      // 낙관적 UI - 실패해도 UI는 유지
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
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
        {notifications.map((notification) => (
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
                <p className="mt-1 text-sm text-gray-600">
                  {notification.body}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
