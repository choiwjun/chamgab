'use client'

// @TASK P4-S4 - 마이페이지 콘텐츠 (Editorial Luxury 스타일)

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
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
  free: { label: 'Free', color: 'bg-editorial-ink/50', textColor: 'text-white' },
  premium: { label: 'Premium', color: 'bg-editorial-gold', textColor: 'text-white' },
  business: { label: 'Business', color: 'bg-editorial-dark', textColor: 'text-white' },
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
    <div className="mx-auto max-w-lg px-6 md:px-8 py-12">
      {/* 섹션 라벨 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="mb-6"
      >
        <span className="inline-flex items-center gap-3 text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
          <span className="w-8 h-px bg-editorial-gold" />
          Account
        </span>
      </motion.div>

      {/* 프로필 섹션 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-8 border border-editorial-dark/5 bg-white p-6"
      >
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center border border-editorial-dark/10 bg-editorial-sand/30">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-7 w-7 text-editorial-ink/30" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="font-serif text-xl text-editorial-dark">{profile.name}</h2>
              <span
                className={`flex items-center gap-1 px-2.5 py-0.5 text-xs tracking-wide ${TIER_BADGES[profile.tier].color} ${TIER_BADGES[profile.tier].textColor}`}
              >
                {profile.tier === 'premium' && <Crown className="h-3 w-3" />}
                {TIER_BADGES[profile.tier].label}
              </span>
            </div>
            <p className="text-sm text-editorial-ink/50">{user?.email || profile.email}</p>
          </div>
        </div>
      </motion.div>

      {/* 사용량 섹션 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-8 border border-editorial-dark/5 bg-white p-6"
      >
        <h3 className="text-xs tracking-widest uppercase text-editorial-ink/50 mb-4">
          Daily Analysis Usage
        </h3>
        <div className="mb-3 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1">
            <span className="font-serif text-3xl text-editorial-dark">
              {profile.daily_analysis_count}
            </span>
            <span className="text-sm text-editorial-ink/40">
              / {profile.daily_analysis_limit}
            </span>
          </div>
          <span className="text-sm text-editorial-gold">{usagePercent.toFixed(0)}%</span>
        </div>
        <div className="h-1 overflow-hidden bg-editorial-sand">
          <div
            className="h-full bg-editorial-gold transition-all duration-500"
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        {profile.tier === 'free' && (
          <p className="mt-4 text-sm text-editorial-ink/50">
            Premium으로 업그레이드하면 무제한 분석이 가능해요
          </p>
        )}
      </motion.div>

      {/* 메뉴 리스트 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mb-8 border border-editorial-dark/5 bg-white"
      >
        {menuItems.map((item, index) => (
          <button
            key={item.label}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={() => router.push(item.href as any)}
            className={`flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-editorial-sand/30 ${
              index !== menuItems.length - 1 ? 'border-b border-editorial-dark/5' : ''
            }`}
          >
            <div className="flex items-center gap-4">
              <item.icon className="h-5 w-5 text-editorial-ink/30" strokeWidth={1.5} />
              <span className="text-editorial-dark">{item.label}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-editorial-ink/20" />
          </button>
        ))}
      </motion.div>

      {/* 로그아웃 버튼 */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        onClick={handleLogout}
        className="flex w-full items-center justify-center gap-2 border border-editorial-dark/10 bg-white py-4 text-editorial-ink/50 transition hover:border-red-300 hover:text-red-500"
      >
        <LogOut className="h-4 w-4" />
        <span className="text-sm tracking-wide">로그아웃</span>
      </motion.button>
    </div>
  )
}
