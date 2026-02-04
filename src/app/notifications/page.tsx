// @TASK P4-S3 - 알림 페이지
import { Metadata } from 'next'
import { NotificationList } from '@/components/notifications/NotificationList'

export const metadata: Metadata = {
  title: '알림 | 참값',
  description: '새로운 알림을 확인하세요',
}

export default function NotificationsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">알림</h1>
        <NotificationList />
      </div>
    </div>
  )
}
