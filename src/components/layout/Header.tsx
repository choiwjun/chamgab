// @TASK P1-S0-T1 - 공통 헤더 컴포넌트 (Toss Clean Minimal Style)
// @SPEC specs/shared/components.yaml#header

'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Menu,
  X,
  User,
  Bell,
  ChevronDown,
  Building2,
  Store,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

interface NavLink {
  href: string
  label: string
  requiresAuth?: boolean
}

interface NavCategory {
  id: string
  label: string
  icon: typeof Building2
  links: NavLink[]
}

const navCategories: NavCategory[] = [
  {
    id: 'apartment',
    label: '아파트 적정가',
    icon: Building2,
    links: [
      { href: '/search', label: '매물 검색' },
      { href: '/compare', label: '비교하기' },
      { href: '/favorites', label: '관심 매물', requiresAuth: true },
    ],
  },
  {
    id: 'business',
    label: '상권분석',
    icon: Store,
    links: [
      { href: '/business-analysis', label: '상권 분석' },
      { href: '/business-analysis/compare', label: '지역 비교' },
    ],
  },
]

function NavDropdown({
  category,
  isActive,
}: {
  category: NavCategory
  isActive: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div
      ref={dropdownRef}
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
          isActive ? 'text-[#191F28]' : 'text-[#4E5968] hover:text-[#191F28]'
        }`}
      >
        {category.label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 w-44 overflow-hidden rounded-lg border border-[#E5E8EB] bg-white shadow-md"
          >
            {category.links.map((link) => {
              if (link.requiresAuth && !isAuthenticated) return null
              return (
                <Link
                  key={link.href}
                  href={link.href as never}
                  className="block px-4 py-2.5 text-sm text-[#4E5968] transition-colors hover:bg-[#F9FAFB] hover:text-[#191F28]"
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </Link>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { isAuthenticated } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (q) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(`/search?q=${encodeURIComponent(q)}` as any)
      setIsSearchExpanded(false)
      setSearchQuery('')
    }
  }

  const isApartmentActive =
    pathname.startsWith('/search') ||
    pathname.startsWith('/compare') ||
    pathname.startsWith('/favorites') ||
    pathname.startsWith('/property')
  const isBusinessActive = pathname.startsWith('/business-analysis')

  return (
    <header className="sticky top-0 z-50 border-b border-[#E5E8EB] bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Clean flat header */}
        <div className="flex h-16 items-center justify-between">
          {/* 모바일 메뉴 버튼 */}
          <div className="flex flex-1 items-center md:flex-none">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="-ml-2 rounded-lg p-2 transition-colors hover:bg-[#F2F4F6] md:hidden"
              aria-label="메뉴 열기"
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5 text-[#191F28]" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5 text-[#191F28]" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* 로고 */}
          <Link
            href={'/' as never}
            className="absolute left-1/2 -translate-x-1/2 md:static md:flex-none md:translate-x-0"
          >
            <span className="text-lg font-bold text-[#191F28]">
              참<span className="text-[#3182F6]">값</span>
            </span>
          </Link>

          {/* 데스크톱 네비게이션 - 2분류 드롭다운 */}
          <nav className="hidden flex-1 items-center justify-center gap-2 md:flex">
            <NavDropdown
              category={navCategories[0]}
              isActive={isApartmentActive}
            />
            <NavDropdown
              category={navCategories[1]}
              isActive={isBusinessActive}
            />
          </nav>

          {/* 우측 메뉴 */}
          <div className="flex flex-1 items-center justify-end gap-1 md:gap-2">
            {/* 모바일 검색 아이콘 */}
            <button
              onClick={() => setIsSearchExpanded(!isSearchExpanded)}
              className="rounded-lg p-2 transition-colors hover:bg-[#F2F4F6] md:hidden"
              aria-label="검색"
            >
              <Search className="h-5 w-5 text-[#191F28]" aria-hidden="true" />
            </button>

            {/* 데스크톱 검색 */}
            <div className="hidden items-center md:flex">
              <button
                onClick={() => setIsSearchExpanded(!isSearchExpanded)}
                className="rounded-lg p-2 transition-colors hover:bg-[#F2F4F6]"
                aria-label="검색"
              >
                <Search className="h-5 w-5 text-[#191F28]" aria-hidden="true" />
              </button>
            </div>

            {/* 다크모드 토글 */}
            <ThemeToggle />

            {isAuthenticated ? (
              <>
                {/* 알림 */}
                <Link
                  href={'/notifications' as never}
                  className="relative rounded-lg p-2 transition-colors hover:bg-[#F2F4F6]"
                  aria-label="알림"
                >
                  <Bell className="h-5 w-5 text-[#191F28]" aria-hidden="true" />
                  <span
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#3182F6]"
                    aria-hidden="true"
                  />
                </Link>

                {/* 마이페이지 */}
                <Link
                  href={'/mypage' as never}
                  className="rounded-lg p-2 transition-colors hover:bg-[#F2F4F6]"
                  aria-label="마이페이지"
                >
                  <User className="h-5 w-5 text-[#191F28]" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <Link
                href={'/auth/login' as never}
                className="hidden rounded-lg bg-[#3182F6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1B64DA] md:inline-flex"
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
              <form
                onSubmit={handleSearch}
                className="relative mx-auto max-w-xl"
              >
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="아파트명, 지역으로 검색"
                  className="w-full rounded-lg border border-[#E5E8EB] bg-white px-4 py-3 pl-11 text-[#191F28] placeholder-[#8B95A1] transition-colors focus:border-[#3182F6] focus:outline-none focus:ring-1 focus:ring-[#3182F6]"
                  autoFocus
                  aria-label="부동산 검색"
                />
                <Search
                  className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B95A1]"
                  aria-hidden="true"
                />
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 모바일 메뉴 - 2분류 구조 */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-[#E5E8EB] bg-white md:hidden"
          >
            <div className="space-y-1 px-6 py-6">
              {/* 홈 */}
              <Link
                href="/"
                className="block px-4 py-2 font-medium text-[#191F28] transition-colors hover:bg-[#F9FAFB]"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                홈
              </Link>

              {/* 아파트 적정가 섹션 */}
              <div className="border-t border-[#E5E8EB] pt-4">
                <div className="mb-2 flex items-center gap-2 px-4">
                  <Building2 className="h-4 w-4 text-[#8B95A1]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1]">
                    아파트 적정가
                  </span>
                </div>
                <div className="space-y-1">
                  {navCategories[0].links.map((link) => {
                    if (link.requiresAuth && !isAuthenticated) return null
                    return (
                      <Link
                        key={link.href}
                        href={link.href as never}
                        className="block px-4 py-2 text-[#4E5968] transition-colors hover:bg-[#F9FAFB] hover:text-[#191F28]"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {link.label}
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* 상권분석 섹션 */}
              <div className="border-t border-[#E5E8EB] pt-4">
                <div className="mb-2 flex items-center gap-2 px-4">
                  <Store className="h-4 w-4 text-[#8B95A1]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1]">
                    상권분석
                  </span>
                </div>
                <div className="space-y-1">
                  {navCategories[1].links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href as never}
                      className="block px-4 py-2 text-[#4E5968] transition-colors hover:bg-[#F9FAFB] hover:text-[#191F28]"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>

              {/* 사용자 메뉴 */}
              {isAuthenticated ? (
                <div className="border-t border-[#E5E8EB] pt-4">
                  <Link
                    href={'/mypage' as never}
                    className="block px-4 py-2 font-medium text-[#191F28] transition-colors hover:bg-[#F9FAFB]"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    마이페이지
                  </Link>
                </div>
              ) : (
                <div className="border-t border-[#E5E8EB] pt-4">
                  <Link
                    href={'/auth/login' as never}
                    className="block rounded-lg bg-[#3182F6] px-4 py-2.5 text-center font-medium text-white transition-colors hover:bg-[#1B64DA]"
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
