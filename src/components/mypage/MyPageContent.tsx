'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { User, CreditCard, LogOut, ChevronRight, Crown } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ENABLE_FREE_OPEN_MODE } from '@/lib/features'

const TIER_BADGES = {
  free: { label: 'Free', color: 'bg-[#8B95A1]', textColor: 'text-white' },
  premium: { label: 'Premium', color: 'bg-[#3182F6]', textColor: 'text-white' },
  business: {
    label: 'Business',
    color: 'bg-[#191F28]',
    textColor: 'text-white',
  },
}

interface CreditData {
  daily_credit_used: number
  daily_credit_limit: number
  monthly_credit_used: number
  monthly_credit_limit: number
  bonus_credits: number
}

export function MyPageContent() {
  const router = useRouter()
  const { user, profile, signOut, isLoading, refreshUser } = useAuth()
  const [credits, setCredits] = useState<CreditData | null>(null)
  const [isAuthLoadDelayed, setIsAuthLoadDelayed] = useState(false)

  useEffect(() => {
    if (!user) return

    fetch('/api/me/credits')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.profile) return

        setCredits({
          daily_credit_used: data.profile.daily_credit_used ?? 0,
          daily_credit_limit: data.profile.daily_credit_limit ?? 20,
          monthly_credit_used: data.profile.monthly_credit_used ?? 0,
          monthly_credit_limit: data.profile.monthly_credit_limit ?? 400,
          bonus_credits: data.profile.bonus_credits ?? 0,
        })
      })
      .catch(() => {})
  }, [user])

  useEffect(() => {
    if (!isLoading) {
      setIsAuthLoadDelayed(false)
      return
    }

    const timeout = window.setTimeout(() => {
      setIsAuthLoadDelayed(true)
    }, 8000)

    return () => window.clearTimeout(timeout)
  }, [isLoading])

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/'
  }

  const dailyCreditsUsed =
    credits?.daily_credit_used ??
    (typeof profile?.daily_credit_used === 'number'
      ? profile.daily_credit_used
      : 0)
  const dailyCreditsLimit =
    credits?.daily_credit_limit ??
    (typeof profile?.daily_credit_limit === 'number'
      ? profile.daily_credit_limit
      : 20)

  const monthlyCreditsUsed =
    credits?.monthly_credit_used ??
    (typeof profile?.monthly_credit_used === 'number'
      ? profile.monthly_credit_used
      : 0)
  const monthlyCreditsLimit =
    credits?.monthly_credit_limit ??
    (typeof profile?.monthly_credit_limit === 'number'
      ? profile.monthly_credit_limit
      : 0)
  const bonusCredits =
    credits?.bonus_credits ??
    (typeof profile?.bonus_credits === 'number' ? profile.bonus_credits : 0)

  const usagePercent =
    dailyCreditsLimit > 0 ? (dailyCreditsUsed / dailyCreditsLimit) * 100 : 0

  const menuItems = useMemo(
    () =>
      ENABLE_FREE_OPEN_MODE
        ? []
        : [
            {
              icon: CreditCard,
              label: '결제 및 플랜',
              href: '/checkout/plans',
            },
          ],
    []
  )

  if (isLoading && !isAuthLoadDelayed) {
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

  if (isLoading && isAuthLoadDelayed) {
    return (
      <div className="mx-auto max-w-lg px-6 py-12 md:px-8">
        <div className="rounded-xl border border-[#E5E8EB] bg-white p-6">
          <h2 className="mb-2 text-lg font-semibold text-[#191F28]">
            인증 확인이 지연되고 있습니다
          </h2>
          <p className="mb-5 text-sm text-[#4E5968]">
            네트워크 또는 세션 상태 문제일 수 있습니다. 다시 시도하거나 로그인
            페이지로 이동해 주세요.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsAuthLoadDelayed(false)
                void refreshUser()
              }}
              className="rounded-lg bg-[#3182F6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1B64DA]"
            >
              다시 시도
            </button>
            <button
              onClick={() => router.push('/auth/login' as never)}
              className="rounded-lg border border-[#E5E8EB] px-4 py-2 text-sm font-medium text-[#4E5968] transition-colors hover:bg-[#F9FAFB]"
            >
              로그인으로 이동
            </button>
          </div>
        </div>
      </div>
    )
  }

  const displayName =
    profile?.name ||
    (user?.user_metadata?.name as string | undefined) ||
    '사용자'
  const displayEmail = user?.email || profile?.email || ''
  const displayTier = (profile?.tier || 'free') as
    | 'free'
    | 'premium'
    | 'business'
  const avatarUrl = profile?.avatar_url

  return (
    <div className="mx-auto max-w-lg px-6 py-12 md:px-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-[#191F28]">마이페이지</h1>
      </motion.div>

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
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-[#4E5968]">
          <div>
            이번 달 {monthlyCreditsUsed} / {monthlyCreditsLimit}
          </div>
          {bonusCredits > 0 && <div>보너스 {bonusCredits}</div>}
        </div>
      </motion.div>

      {menuItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mb-8 overflow-hidden rounded-xl border border-[#E5E8EB] bg-white"
        >
          {menuItems.map((item) => (
            <button
              key={item.label}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={() => router.push(item.href as any)}
              className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-[#F9FAFB]"
            >
              <div className="flex items-center gap-4">
                <item.icon
                  className="h-5 w-5 text-[#8B95A1]"
                  strokeWidth={1.5}
                />
                <span className="font-medium text-[#191F28]">{item.label}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-[#8B95A1]" />
            </button>
          ))}
        </motion.div>
      )}

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
