'use client'

// @TASK P4-S4 - 마이페이지 콘텐츠 (Editorial Luxury 스타일)

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
import { useAuth } from '@/hooks/useAuth'

const TIER_BADGES = {
  free: { label: 'Free', color: 'bg-[#8B95A1]', textColor: 'text-white' },
  premium: { label: 'Premium', color: 'bg-[#3182F6]', textColor: 'text-white' },
  business: {
    label: 'Business',
    color: 'bg-[#191F28]',
    textColor: 'text-white',
  },
}

export function MyPageContent() {
  const router = useRouter()
  const { user, profile, signOut, isLoading } = useAuth()

  const handleLogout = async () => {
    await signOut()
    router.push('/')
    router.refresh()
  }

  const dailyCreditsUsed =
    typeof profile?.daily_credit_used === 'number'
      ? profile.daily_credit_used
      : profile?.daily_analysis_count || 0
  const dailyCreditsLimit =
    typeof profile?.daily_credit_limit === 'number'
      ? profile.daily_credit_limit
      : profile?.daily_analysis_limit || 3

  const monthlyCreditsUsed =
    typeof profile?.monthly_credit_used === 'number'
      ? profile.monthly_credit_used
      : null
  const monthlyCreditsLimit =
    typeof profile?.monthly_credit_limit === 'number'
      ? profile.monthly_credit_limit
      : null
  const bonusCredits =
    typeof profile?.bonus_credits === 'number' ? profile.bonus_credits : 0

  const usagePercent =
    dailyCreditsLimit > 0 ? (dailyCreditsUsed / dailyCreditsLimit) * 100 : 0

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

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg px-6 py-12 md:px-8">
        <div className="mb-8">
          <div className="h-9 w-32 animate-pulse rounded bg-[#F2F4F6]" />
        </div>
        <div className="mb-8 rounded-xl border border-[#E5E8EB] bg-white p-6">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 animate-pulse rounded-xl bg-[#F2F4F6]" />
            <div className="flex-1 space-y-3">
              <div className="h-5 w-32 animate-pulse rounded bg-[#F2F4F6]" />
              <div className="h-4 w-48 animate-pulse rounded bg-[#F2F4F6]" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const displayName = profile?.name || user?.user_metadata?.name || '사용자'
  const displayEmail = user?.email || profile?.email || ''
  const displayTier = (profile?.tier || 'free') as
    | 'free'
    | 'premium'
    | 'business'
  const avatarUrl = profile?.avatar_url

  return (
    <div className="mx-auto max-w-lg px-6 py-12 md:px-8">
      {/* 헤더 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-[#191F28]">마이페이지</h1>
      </motion.div>

      {/* 프로필 섹션 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-8 rounded-xl border border-[#E5E8EB] bg-white p-6"
      >
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-[#E5E8EB] bg-[#F9FAFB]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-full w-full rounded-xl object-cover"
              />
            ) : (
              <User className="h-7 w-7 text-[#8B95A1]" />
            )}
          </div>
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-3">
              <h2 className="text-xl font-semibold text-[#191F28]">
                {displayName}
              </h2>
              <span
                className={`flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-medium ${TIER_BADGES[displayTier].color} ${TIER_BADGES[displayTier].textColor}`}
              >
                {displayTier === 'premium' && <Crown className="h-3 w-3" />}
                {TIER_BADGES[displayTier].label}
              </span>
            </div>
            <p className="text-sm text-[#4E5968]">{displayEmail}</p>
          </div>
        </div>
      </motion.div>

      {/* 사용량 섹션 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-8 rounded-xl border border-[#E5E8EB] bg-white p-6"
      >
        <h3 className="mb-4 text-xs font-semibold text-[#8B95A1]">
          크레딧 사용량
        </h3>
        <div className="mb-3 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-[#191F28]">
              {dailyCreditsUsed}
            </span>
            <span className="text-sm text-[#8B95A1]">
              / {dailyCreditsLimit} (일)
            </span>
          </div>
          <span className="text-sm font-medium text-[#3182F6]">
            {usagePercent.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#F9FAFB]">
          <div
            className="h-full rounded-full bg-[#3182F6] transition-all duration-500"
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        {(monthlyCreditsLimit !== null || bonusCredits > 0) && (
          <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-[#4E5968]">
            {monthlyCreditsLimit !== null && (
              <div>
                이번 달: {monthlyCreditsUsed ?? 0} / {monthlyCreditsLimit}
              </div>
            )}
            {bonusCredits > 0 && <div>보너스: {bonusCredits}</div>}
          </div>
        )}
        {displayTier === 'free' && (
          <p className="mt-4 text-sm text-[#4E5968]">
            Premium으로 업그레이드하면 더 많은 크레딧을 사용할 수 있어요
          </p>
        )}
      </motion.div>

      {/* 메뉴 리스트 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mb-8 overflow-hidden rounded-xl border border-[#E5E8EB] bg-white"
      >
        {menuItems.map((item, index) => (
          <button
            key={item.label}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={() => router.push(item.href as any)}
            className={`flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-[#F9FAFB] ${
              index !== menuItems.length - 1 ? 'border-b border-[#E5E8EB]' : ''
            }`}
          >
            <div className="flex items-center gap-4">
              <item.icon className="h-5 w-5 text-[#8B95A1]" strokeWidth={1.5} />
              <span className="font-medium text-[#191F28]">{item.label}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-[#8B95A1]" />
          </button>
        ))}
      </motion.div>

      {/* 로그아웃 버튼 */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        onClick={handleLogout}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E5E8EB] bg-white py-4 text-[#8B95A1] transition hover:border-[#F04452] hover:text-[#F04452]"
      >
        <LogOut className="h-4 w-4" />
        <span className="text-sm font-medium">로그아웃</span>
      </motion.button>
    </div>
  )
}
