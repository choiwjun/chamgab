// @TASK P1-S0-T1 - 공통 헤더 컴포넌트 (Editorial Luxury 스타일)
// @SPEC specs/shared/components.yaml#header
/* eslint-disable @typescript-eslint/no-explicit-any */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Menu, X, User, Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const { isAuthenticated } = useAuth()

  return (
    <header className="sticky top-0 z-50 border-b border-editorial-dark/5 bg-editorial-bg/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between md:h-20">
          {/* 모바일 메뉴 버튼 */}
          <div className="flex flex-1 items-center md:flex-none">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="-ml-2 p-2 transition-colors hover:bg-editorial-dark/5 md:hidden"
              aria-label="메뉴 열기"
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5 text-editorial-dark" aria-hidden="true" />
              ) : (
                <Menu
                  className="h-5 w-5 text-editorial-dark"
                  aria-hidden="true"
                />
              )}
            </button>
          </div>

          {/* 로고 */}
          <Link
            href={'/' as any}
            className="absolute left-1/2 -translate-x-1/2 md:static md:flex-none md:translate-x-0"
          >
            <span className="font-display text-2xl italic text-editorial-dark">
              참값
            </span>
          </Link>

          {/* 데스크톱 네비게이션 */}
          <nav className="hidden flex-1 items-center justify-center gap-8 md:flex">
            <Link
              href={'/search' as any}
              className="text-sm tracking-wide text-editorial-ink/60 transition-colors hover:text-editorial-dark"
            >
              매물 검색
            </Link>
            <Link
              href={'/compare' as any}
              className="text-sm tracking-wide text-editorial-ink/60 transition-colors hover:text-editorial-dark"
            >
              비교하기
            </Link>
            {isAuthenticated && (
              <Link
                href={'/favorites' as any}
                className="text-sm tracking-wide text-editorial-ink/60 transition-colors hover:text-editorial-dark"
              >
                관심 매물
              </Link>
            )}
          </nav>

          {/* 우측 메뉴 */}
          <div className="flex flex-1 items-center justify-end gap-1 md:gap-3">
            {/* 모바일 검색 아이콘 */}
            <button
              onClick={() => setIsSearchExpanded(!isSearchExpanded)}
              className="p-2 transition-colors hover:bg-editorial-dark/5 md:hidden"
              aria-label="검색"
            >
              <Search
                className="h-5 w-5 text-editorial-dark"
                aria-hidden="true"
              />
            </button>

            {/* 데스크톱 검색 */}
            <div className="hidden items-center md:flex">
              <button
                onClick={() => setIsSearchExpanded(!isSearchExpanded)}
                className="p-2 transition-colors hover:bg-editorial-dark/5"
                aria-label="검색"
              >
                <Search
                  className="h-5 w-5 text-editorial-dark"
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* 다크모드 토글 */}
            <ThemeToggle />

            {isAuthenticated ? (
              <>
                {/* 알림 */}
                <Link
                  href={'/notifications' as any}
                  className="relative p-2 transition-colors hover:bg-editorial-dark/5"
                  aria-label="알림"
                >
                  <Bell
                    className="h-5 w-5 text-editorial-dark"
                    aria-hidden="true"
                  />
                  <span
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-editorial-gold"
                    aria-hidden="true"
                  />
                </Link>

                {/* 마이페이지 */}
                <Link
                  href={'/mypage' as any}
                  className="p-2 transition-colors hover:bg-editorial-dark/5"
                  aria-label="마이페이지"
                >
                  <User
                    className="h-5 w-5 text-editorial-dark"
                    aria-hidden="true"
                  />
                </Link>
              </>
            ) : (
              <Link
                href={'/auth/login' as any}
                className="hidden bg-editorial-dark px-5 py-2 text-sm tracking-wide text-white transition-colors hover:bg-editorial-gold md:inline-flex"
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
              <div className="relative mx-auto max-w-xl">
                <input
                  type="search"
                  placeholder="아파트명, 지역으로 검색"
                  className="w-full border border-editorial-dark/10 bg-white px-4 py-3 pl-11 text-editorial-dark placeholder-editorial-ink/40 transition-colors focus:border-editorial-gold focus:outline-none"
                  autoFocus
                  aria-label="부동산 검색"
                />
                <Search
                  className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-editorial-ink/40"
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
            className="overflow-hidden border-t border-editorial-dark/5 bg-editorial-bg md:hidden"
          >
            <div className="space-y-1 px-6 py-6">
              <Link
                href="/"
                className="block px-4 py-3 text-editorial-dark transition-colors hover:bg-editorial-dark/5"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                홈
              </Link>
              <Link
                href={'/search' as any}
                className="block px-4 py-3 text-editorial-dark transition-colors hover:bg-editorial-dark/5"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                매물 검색
              </Link>
              <Link
                href={'/compare' as any}
                className="block px-4 py-3 text-editorial-dark transition-colors hover:bg-editorial-dark/5"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                비교하기
              </Link>
              {isAuthenticated ? (
                <>
                  <Link
                    href={'/favorites' as any}
                    className="block px-4 py-3 text-editorial-dark transition-colors hover:bg-editorial-dark/5"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    관심 매물
                  </Link>
                  <Link
                    href={'/mypage' as any}
                    className="block px-4 py-3 text-editorial-dark transition-colors hover:bg-editorial-dark/5"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    마이페이지
                  </Link>
                </>
              ) : (
                <div className="border-t border-editorial-dark/5 pt-4">
                  <Link
                    href={'/auth/login' as any}
                    className="block bg-editorial-dark px-4 py-3 text-center text-white transition-colors hover:bg-editorial-gold"
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
