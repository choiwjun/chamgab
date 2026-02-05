// @TASK P1-S0-T1 - 공통 헤더 컴포넌트 (Editorial Luxury 스타일)
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
  const { isAuthenticated } = useAuth()

  return (
    <header className="sticky top-0 z-50 bg-editorial-bg/95 backdrop-blur-sm border-b border-editorial-dark/5">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* 모바일 메뉴 버튼 */}
          <div className="flex-1 flex items-center md:flex-none">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 -ml-2 hover:bg-editorial-dark/5 transition-colors"
              aria-label="메뉴 열기"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-editorial-dark" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5 text-editorial-dark" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* 로고 */}
          <Link
            href={"/" as any}
            className="absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0 md:flex-none"
          >
            <span className="font-display text-2xl text-editorial-dark italic">참값</span>
          </Link>

          {/* 데스크톱 네비게이션 */}
          <nav className="hidden md:flex items-center gap-8 flex-1 justify-center">
            <Link
              href={"/search" as any}
              className="text-sm tracking-wide text-editorial-ink/60 hover:text-editorial-dark transition-colors"
            >
              매물 검색
            </Link>
            <Link
              href={"/compare" as any}
              className="text-sm tracking-wide text-editorial-ink/60 hover:text-editorial-dark transition-colors"
            >
              비교하기
            </Link>
            {isAuthenticated && (
              <Link
                href={"/favorites" as any}
                className="text-sm tracking-wide text-editorial-ink/60 hover:text-editorial-dark transition-colors"
              >
                관심 매물
              </Link>
            )}
          </nav>

          {/* 우측 메뉴 */}
          <div className="flex-1 flex items-center justify-end gap-1 md:gap-3">
            {/* 모바일 검색 아이콘 */}
            <button
              onClick={() => setIsSearchExpanded(!isSearchExpanded)}
              className="md:hidden p-2 hover:bg-editorial-dark/5 transition-colors"
              aria-label="검색"
            >
              <Search className="w-5 h-5 text-editorial-dark" aria-hidden="true" />
            </button>

            {/* 데스크톱 검색 */}
            <div className="hidden md:flex items-center">
              <button
                onClick={() => setIsSearchExpanded(!isSearchExpanded)}
                className="p-2 hover:bg-editorial-dark/5 transition-colors"
                aria-label="검색"
              >
                <Search className="w-5 h-5 text-editorial-dark" aria-hidden="true" />
              </button>
            </div>

            {isAuthenticated ? (
              <>
                {/* 알림 */}
                <Link
                  href={"/notifications" as any}
                  className="relative p-2 hover:bg-editorial-dark/5 transition-colors"
                  aria-label="알림"
                >
                  <Bell className="w-5 h-5 text-editorial-dark" aria-hidden="true" />
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-editorial-gold rounded-full" aria-hidden="true" />
                </Link>

                {/* 마이페이지 */}
                <Link
                  href={"/mypage" as any}
                  className="p-2 hover:bg-editorial-dark/5 transition-colors"
                  aria-label="마이페이지"
                >
                  <User className="w-5 h-5 text-editorial-dark" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <Link
                href={"/auth/login" as any}
                className="hidden md:inline-flex px-5 py-2 bg-editorial-dark text-white text-sm tracking-wide hover:bg-editorial-gold transition-colors"
              >
                로그인
              </Link>
            )}
          </div>
        </div>

        {/* 확장 검색 */}
        <AnimatePresence>
          {isSearchExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden pb-4"
            >
              <div className="relative max-w-xl mx-auto">
                <input
                  type="search"
                  placeholder="아파트명, 지역으로 검색"
                  className="w-full px-4 py-3 pl-11 bg-white border border-editorial-dark/10 focus:border-editorial-gold focus:outline-none text-editorial-dark placeholder-editorial-ink/40 transition-colors"
                  autoFocus
                  aria-label="부동산 검색"
                />
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-editorial-ink/40"
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
            className="md:hidden border-t border-editorial-dark/5 bg-editorial-bg overflow-hidden"
          >
            <div className="px-6 py-6 space-y-1">
              <Link
                href="/"
                className="block px-4 py-3 text-editorial-dark hover:bg-editorial-dark/5 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                홈
              </Link>
              <Link
                href={"/search" as any}
                className="block px-4 py-3 text-editorial-dark hover:bg-editorial-dark/5 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                매물 검색
              </Link>
              <Link
                href={"/compare" as any}
                className="block px-4 py-3 text-editorial-dark hover:bg-editorial-dark/5 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                비교하기
              </Link>
              {isAuthenticated ? (
                <>
                  <Link
                    href={"/favorites" as any}
                    className="block px-4 py-3 text-editorial-dark hover:bg-editorial-dark/5 transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    관심 매물
                  </Link>
                  <Link
                    href={"/mypage" as any}
                    className="block px-4 py-3 text-editorial-dark hover:bg-editorial-dark/5 transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    마이페이지
                  </Link>
                </>
              ) : (
                <div className="pt-4 border-t border-editorial-dark/5">
                  <Link
                    href={"/auth/login" as any}
                    className="block px-4 py-3 bg-editorial-dark text-white text-center hover:bg-editorial-gold transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    로그인
                  </Link>
                </div>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
