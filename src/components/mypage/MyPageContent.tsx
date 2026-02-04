'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  User,
  Heart,
  Bell,
  CreditCard,
  LogOut,
  ChevronRight,
  Crown,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { createClient } from '@/lib/supabase/client'

interface UserProfile {
  name: string
  email: string
  tier: 'free' | 'premium' | 'business'
  daily_analysis_count: number
  daily_analysis_limit: number
  avatar_url?: string
}

// Mock 데이터
const MOCK_PROFILE: UserProfile = {
  name: '홍길동',
  email: 'hong@example.com',
  tier: 'free',
  daily_analysis_count: 3,
  daily_analysis_limit: 10,
}

const TIER_BADGES = {
  free: { label: 'Free', color: 'bg-gray-500' },
  premium: { label: 'Premium', color: 'bg-yellow-500' },
  business: { label: 'Business', color: 'bg-purple-500' },
}

export function MyPageContent() {
  const router = useRouter()
  const { user, setUser } = useAuthStore()
  const [profile] = useState<UserProfile>(MOCK_PROFILE)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    router.push('/')
  }

  const usagePercent =
    (profile.daily_analysis_count / profile.daily_analysis_limit) * 100

  const menuItems = [
    {
      icon: Heart,
      label: '관심 매물',
      href: '/favorites',
    },
    {
      icon: Bell,
      label: '알림',
      href: '/notifications',
    },
    {
      icon: CreditCard,
      label: '결제 및 플랜',
      href: '/checkout/plans',
    },
  ]

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      {/* 프로필 섹션 */}
      <div className="mb-6 rounded-xl bg-white p-6 shadow">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.name}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <User className="h-8 w-8 text-gray-400" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">{profile.name}</h2>
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${TIER_BADGES[profile.tier].color}`}
              >
                {profile.tier === 'premium' && <Crown className="h-3 w-3" />}
                {TIER_BADGES[profile.tier].label}
              </span>
            </div>
            <p className="text-sm text-gray-500">{user?.email || profile.email}</p>
          </div>
        </div>
      </div>

      {/* 사용량 섹션 */}
      <div className="mb-6 rounded-xl bg-white p-6 shadow">
        <h3 className="mb-3 font-medium text-gray-900">오늘의 분석 사용량</h3>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-gray-500">
            {profile.daily_analysis_count} / {profile.daily_analysis_limit}회
          </span>
          <span className="text-primary">{usagePercent.toFixed(0)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        {profile.tier === 'free' && (
          <p className="mt-3 text-sm text-gray-500">
            Premium으로 업그레이드하면 무제한 분석이 가능해요!
          </p>
        )}
      </div>

      {/* 메뉴 리스트 */}
      <div className="mb-6 overflow-hidden rounded-xl bg-white shadow">
        {menuItems.map((item, index) => (
          <button
            key={item.label}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={() => router.push(item.href as any)}
            className={`flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-gray-50 ${
              index !== menuItems.length - 1 ? 'border-b border-gray-100' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-5 w-5 text-gray-400" />
              <span className="font-medium text-gray-700">{item.label}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-300" />
          </button>
        ))}
      </div>

      {/* 로그아웃 버튼 */}
      <button
        onClick={handleLogout}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-4 text-red-500 shadow transition hover:bg-red-50"
      >
        <LogOut className="h-5 w-5" />
        로그아웃
      </button>
    </div>
  )
}
