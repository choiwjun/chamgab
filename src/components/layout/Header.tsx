'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  Building2,
  ChevronDown,
  GraduationCap,
  MapPin,
  Menu,
  Search,
  Store,
  User,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface NavLink {
  href: string
  label: string
  requiresAuth?: boolean
  comingSoon?: boolean
}

interface NavCategory {
  id: string
  label: string
  icon: LucideIcon
  links: NavLink[]
  comingSoon?: boolean
}

const NAV_APARTMENT: NavCategory = {
  id: 'apartment',
  label: '아파트',
  icon: Building2,
  links: [
    { href: '/search', label: '매물 검색' },
    { href: '/compare', label: '비교하기' },
    { href: '/favorites', label: '관심목록', requiresAuth: true },
  ],
}

const NAV_BUSINESS: NavCategory = {
  id: 'business',
  label: '상권분석',
  icon: Store,
  links: [
    { href: '/business-analysis', label: '상권 분석' },
    { href: '/business-analysis/compare', label: '지역 비교' },
  ],
}

const NAV_LAND: NavCategory = {
  id: 'land',
  label: '토지분석',
  icon: MapPin,
  comingSoon: true,
  links: [
    { href: '/land', label: '토지 분석', comingSoon: true },
    { href: '/land/search', label: '토지 검색', comingSoon: true },
  ],
}

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
    const onClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const handleComingSoon = (e: React.MouseEvent) => {
    e.preventDefault()
    alert('곧 오픈 예정입니다!')
    setIsOpen(false)
  }

  if (category.comingSoon) {
    return (
      <button
        onClick={handleComingSoon}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#8B95A1] transition-colors hover:text-[#4E5968]"
      >
        {category.label}
        <span className="rounded bg-[#F2F4F6] px-1.5 py-0.5 text-[10px] font-semibold text-[#8B95A1]">
          Soon
        </span>
      </button>
    )
  }

  return (
    <div
      ref={dropdownRef}
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onClick={() => setIsOpen((prev) => !prev)}
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
            className="absolute left-0 top-full mt-2 w-48 overflow-hidden rounded-lg border border-[#E5E8EB] bg-white shadow-md"
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

function isCategoryActive(pathname: string, categoryId: string) {
  if (categoryId === 'apartment') {
    return (
      pathname.startsWith('/search') ||
      pathname.startsWith('/compare') ||
      pathname.startsWith('/favorites') ||
      pathname.startsWith('/property') ||
      pathname.startsWith('/complex')
    )
  }
  if (categoryId === 'business')
    return pathname.startsWith('/business-analysis')
  if (categoryId === 'school') return pathname.startsWith('/school-analysis')
  if (categoryId === 'land') return pathname.startsWith('/land')
  return false
}

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { isAuthenticated } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const desktopCategories = [NAV_APARTMENT, NAV_BUSINESS, NAV_LAND]

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return

    fetch('/api/search/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'search_submit', query: q }),
      keepalive: true,
    }).catch(() => {})

    router.push(`/search?q=${encodeURIComponent(q)}`)
    setSearchQuery('')
    setIsSearchExpanded(false)
    setIsMobileMenuOpen(false)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[#E5E8EB] bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex flex-1 items-center md:flex-none">
            <button
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="-ml-2 rounded-lg p-2 transition-colors hover:bg-[#F2F4F6] md:hidden"
              aria-label="Open menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5 text-[#191F28]" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5 text-[#191F28]" aria-hidden="true" />
              )}
            </button>
          </div>

          <Link
            href="/"
            className="absolute left-1/2 -translate-x-1/2 md:static md:flex-none md:translate-x-0"
          >
            <span className="text-lg font-bold text-[#191F28]">참값</span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-2 md:flex">
            <NavDropdown
              category={NAV_APARTMENT}
              isActive={isCategoryActive(pathname, 'apartment')}
            />
            <NavDropdown
              category={NAV_BUSINESS}
              isActive={isCategoryActive(pathname, 'business')}
            />
            <Link
              href={'/school-analysis' as never}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                pathname.startsWith('/school-analysis')
                  ? 'text-[#191F28]'
                  : 'text-[#4E5968] hover:text-[#191F28]'
              }`}
            >
              학군분석
            </Link>
            <NavDropdown
              category={NAV_LAND}
              isActive={isCategoryActive(pathname, 'land')}
            />
          </nav>

          <div className="flex flex-1 items-center justify-end gap-1 md:gap-2">
            <button
              onClick={() => setIsSearchExpanded((prev) => !prev)}
              className="rounded-lg p-2 transition-colors hover:bg-[#F2F4F6]"
              aria-label="Open search"
            >
              <Search className="h-5 w-5 text-[#191F28]" aria-hidden="true" />
            </button>

            {isAuthenticated ? (
              <>
                <Link
                  href="/notifications"
                  className="relative rounded-lg p-2 transition-colors hover:bg-[#F2F4F6]"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5 text-[#191F28]" aria-hidden="true" />
                  <span
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#3182F6]"
                    aria-hidden="true"
                  />
                </Link>
                <Link
                  href="/mypage"
                  className="rounded-lg p-2 transition-colors hover:bg-[#F2F4F6]"
                  aria-label="My page"
                >
                  <User className="h-5 w-5 text-[#191F28]" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <Link
                href="/auth/login"
                className="hidden rounded-lg bg-[#3182F6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1B64DA] md:inline-flex"
              >
                로그인
              </Link>
            )}
          </div>
        </div>

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
                  placeholder="지역 또는 주소명으로 검색"
                  className="w-full rounded-lg border border-[#E5E8EB] bg-white px-4 py-3 pl-11 text-[#191F28] placeholder-[#8B95A1] transition-colors focus:border-[#3182F6] focus:outline-none focus:ring-1 focus:ring-[#3182F6]"
                  autoFocus
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
              <Link
                href="/"
                className="block px-4 py-2 font-medium text-[#191F28] transition-colors hover:bg-[#F9FAFB]"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                홈
              </Link>

              {desktopCategories.map((category) => {
                const Icon = category.icon
                return (
                  <div
                    key={category.id}
                    className="border-t border-[#E5E8EB] pt-4"
                  >
                    <div className="mb-2 flex items-center gap-2 px-4">
                      <Icon className="h-4 w-4 text-[#8B95A1]" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1]">
                        {category.label}
                      </span>
                      {category.comingSoon && (
                        <span className="rounded bg-[#F2F4F6] px-1.5 py-0.5 text-[10px] font-semibold text-[#8B95A1]">
                          Soon
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {category.links.map((link) => {
                        if (link.requiresAuth && !isAuthenticated) return null
                        if (link.comingSoon) {
                          return (
                            <button
                              key={link.href}
                              className="block w-full px-4 py-2 text-left text-[#8B95A1] transition-colors hover:bg-[#F9FAFB]"
                              onClick={() => {
                                alert('곧 오픈 예정입니다!')
                                setIsMobileMenuOpen(false)
                              }}
                            >
                              {link.label}
                            </button>
                          )
                        }
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
                )
              })}

              <div className="border-t border-[#E5E8EB] pt-4">
                <Link
                  href={'/school-analysis' as never}
                  className="flex items-center gap-2 px-4 py-2 text-[#4E5968] transition-colors hover:bg-[#F9FAFB] hover:text-[#191F28]"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <GraduationCap className="h-4 w-4 text-[#8B95A1]" />
                  학군분석
                </Link>
              </div>

              {isAuthenticated ? (
                <div className="border-t border-[#E5E8EB] pt-4">
                  <Link
                    href="/mypage"
                    className="block px-4 py-2 font-medium text-[#191F28] transition-colors hover:bg-[#F9FAFB]"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    마이페이지
                  </Link>
                </div>
              ) : (
                <div className="border-t border-[#E5E8EB] pt-4">
                  <Link
                    href="/auth/login"
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
