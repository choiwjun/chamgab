// @TASK P1-S0-T1 - 공통 헤더 컴포넌트 (데스크톱/모바일 반응형)
// @SPEC specs/shared/components.yaml#header

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Menu, X, User, Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const { user, isAuthenticated } = useAuth()

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* 로고 - 모바일에서 중앙, 데스크톱에서 왼쪽 */}
          <div className="flex-1 flex items-center md:flex-none">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="메뉴 열기"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 text-gray-700" aria-hidden="true" />
              ) : (
                <Menu className="w-6 h-6 text-gray-700" aria-hidden="true" />
              )}
            </button>
          </div>

          <Link
            href={"/" as any}
            className="absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0 md:flex-none"
          >
            <span className="text-xl font-bold text-[#1E3A5F]">참값</span>
          </Link>

          {/* 데스크톱 검색 - 중앙 */}
          <div className="hidden md:flex flex-1 max-w-2xl mx-8">
            <div className="w-full relative">
              <input
                type="search"
                placeholder="지역, 단지명으로 검색하세요"
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent transition-all"
                aria-label="부동산 검색"
              />
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* 우측 메뉴 */}
          <div className="flex-1 flex items-center justify-end gap-2 md:gap-4">
            {/* 모바일 검색 아이콘 */}
            <button
              onClick={() => setIsSearchExpanded(!isSearchExpanded)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="검색"
            >
              <Search className="w-6 h-6 text-gray-700" aria-hidden="true" />
            </button>

            {isAuthenticated ? (
              <>
                {/* 알림 */}
                <Link
                  href={"/notifications" as any}
                  className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label="알림"
                >
                  <Bell className="w-6 h-6 text-gray-700" aria-hidden="true" />
                  {/* 알림 뱃지 (예시) */}
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />
                </Link>

                {/* 마이페이지 */}
                <Link
                  href={"/mypage" as any}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label="마이페이지"
                >
                  <User className="w-6 h-6 text-gray-700" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <Link
                href={"/auth/login" as any}
                className="hidden md:inline-flex px-4 py-2 bg-[#1E3A5F] text-white rounded-full hover:bg-[#2E5A8F] transition-colors font-medium text-sm"
              >
                로그인
              </Link>
            )}
          </div>
        </div>

        {/* 모바일 확장 검색 */}
        <AnimatePresence>
          {isSearchExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden overflow-hidden pb-4"
            >
              <div className="relative">
                <input
                  type="search"
                  placeholder="지역, 단지명으로 검색하세요"
                  className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
                  autoFocus
                  aria-label="부동산 검색"
                />
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                  aria-hidden="true"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 모바일 메뉴 */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-gray-200 bg-white overflow-hidden"
          >
            <div className="px-4 py-4 space-y-2">
              <Link
                href="/"
                className="block px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                홈
              </Link>
              <Link
                href={"/search" as any}
                className="block px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                검색
              </Link>
              {isAuthenticated ? (
                <>
                  <Link
                    href={"/favorites" as any}
                    className="block px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 font-medium"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    관심 매물
                  </Link>
                  <Link
                    href={"/mypage" as any}
                    className="block px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 font-medium"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    마이페이지
                  </Link>
                </>
              ) : (
                <Link
                  href={"/auth/login" as any}
                  className="block px-4 py-3 rounded-lg bg-[#1E3A5F] text-white text-center font-medium hover:bg-[#2E5A8F] transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  로그인
                </Link>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
