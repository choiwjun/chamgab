// @TASK P1-S0-T1 - 모바일 하단 탭 바 (Editorial Luxury 스타일)
// @SPEC specs/shared/components.yaml#bottom_tab_bar

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, Heart, Bell, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '@/hooks/useAuth'

interface TabItem {
  id: string
  icon: typeof Home
  label: string
  route: string
  requiresAuth?: boolean
  showBadge?: boolean
}

const tabs: TabItem[] = [
  { id: 'home', icon: Home, label: '홈', route: '/' },
  { id: 'search', icon: Search, label: '검색', route: '/search' },
  { id: 'favorites', icon: Heart, label: '관심', route: '/favorites', requiresAuth: true },
  { id: 'notifications', icon: Bell, label: '알림', route: '/notifications', requiresAuth: true, showBadge: true },
  { id: 'mypage', icon: User, label: 'MY', route: '/mypage', requiresAuth: true },
]

export function BottomTabBar() {
  const pathname = usePathname()
  const { isAuthenticated, unreadNotificationCount } = useAuth()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-editorial-bg/95 backdrop-blur-sm border-t border-editorial-dark/5 md:hidden"
      aria-label="하단 네비게이션"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = pathname === tab.route
          const isDisabled = tab.requiresAuth && !isAuthenticated

          const href = (isDisabled ? '/auth/login' : tab.route) as any

          return (
            <Link
              key={tab.id}
              href={href}
              className={`
                relative flex flex-col items-center justify-center flex-1 h-full
                transition-colors
                ${isDisabled ? 'opacity-40' : ''}
                ${isActive ? 'text-editorial-dark' : 'text-editorial-ink/40 hover:text-editorial-ink/60'}
              `}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* 활성 탭 인디케이터 */}
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-editorial-gold"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}

              {/* 아이콘 + 뱃지 */}
              <div className="relative">
                <Icon
                  className="w-5 h-5"
                  strokeWidth={isActive ? 2 : 1.5}
                  aria-hidden="true"
                />
                {tab.showBadge && isAuthenticated && unreadNotificationCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] bg-editorial-gold text-white text-[9px] font-medium rounded-full flex items-center justify-center px-1"
                    aria-label={`${unreadNotificationCount}개의 읽지 않은 알림`}
                  >
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
              </div>

              {/* 라벨 */}
              <span className={`text-[10px] mt-1 tracking-wide ${isActive ? 'font-medium' : ''}`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
