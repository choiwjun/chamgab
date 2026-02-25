'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, TrendingUp, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '@/hooks/useAuth'

interface TabItem {
  id: string
  icon: typeof Home
  label: string
  route: string
  requiresAuth?: boolean
}

const tabs: TabItem[] = [
  { id: 'home', icon: Home, label: '홈', route: '/' },
  {
    id: 'business',
    icon: TrendingUp,
    label: '상권',
    route: '/business-analysis',
  },
  {
    id: 'mypage',
    icon: User,
    label: '내정보',
    route: '/mypage',
    requiresAuth: true,
  },
]

export function BottomTabBar() {
  const pathname = usePathname()
  const { isAuthenticated } = useAuth()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white md:hidden"
      aria-label="하단 네비게이션"
    >
      <div className="flex h-16 items-center justify-around px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive =
            tab.route === '/'
              ? pathname === '/'
              : pathname.startsWith(tab.route)
          const isDisabled = tab.requiresAuth && !isAuthenticated

          const href = (isDisabled ? '/auth/login' : tab.route) as never

          return (
            <Link
              key={tab.id}
              href={href}
              className={`relative flex h-full flex-1 flex-col items-center justify-center transition-colors ${isDisabled ? 'opacity-40' : ''} ${isActive ? 'text-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 bg-blue-500"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}

              <div className="relative">
                <Icon
                  className="h-5 w-5"
                  strokeWidth={isActive ? 2 : 1.5}
                  aria-hidden="true"
                />
              </div>

              <span
                className={`mt-1 text-[10px] tracking-wide ${isActive ? 'font-medium' : ''}`}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
