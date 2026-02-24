'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Search,
  Filter,
  SlidersHorizontal,
  MapPin,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { LandTransactionCard } from '@/components/land/LandTransactionCard'
import type { LandTransaction } from '@/types/land'
import { LAND_CATEGORY_LABELS } from '@/types/land'

const ITEMS_PER_PAGE = 12

function LandSearchContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [transactions, setTransactions] = useState<LandTransaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [showFilters, setShowFilters] = useState(false)

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [zoningKeyword, setZoningKeyword] = useState('')
  const [areaRange, setAreaRange] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'area'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const sortFieldMap: Record<'date' | 'price' | 'area', string> = {
    date: 'transaction_date',
    price: 'price',
    area: 'area_m2',
  }

  useEffect(() => {
    const q = searchParams.get('q')
    const sigungu = searchParams.get('sigungu')
    const category = searchParams.get('land_category')
    const zoning = searchParams.get('zoning')
    const minArea = searchParams.get('min_area')
    const maxArea = searchParams.get('max_area')
    const minPrice = searchParams.get('min_price')
    const maxPrice = searchParams.get('max_price')

    const areaToken = minArea || maxArea ? `${minArea || ''}-${maxArea || ''}` : ''
    const priceToken =
      minPrice || maxPrice ? `${minPrice || ''}-${maxPrice || ''}` : ''

    if (q || sigungu) {
      setQuery(q || sigungu || '')
    }
    setSelectedCategory(category || null)
    setZoningKeyword(zoning || '')
    setAreaRange(areaToken)
    setPriceRange(priceToken)
    setCurrentPage(1)
  }, [searchParams])

  const parseRange = (
    value: string
  ): { min: number | null; max: number | null } => {
    if (!value) return { min: null, max: null }
    const [minRaw, maxRaw] = value.split('-')
    const min = minRaw ? Number(minRaw) : null
    const max = maxRaw ? Number(maxRaw) : null
    return {
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
    }
  }

  const fetchTransactions = async (q?: string, sigungu?: string) => {
    setIsLoading(true)
    try {
      const query = new URLSearchParams()
      if (q) query.set('q', q)
      if (sigungu) query.set('sigungu', sigungu)
      if (selectedCategory) query.set('land_category', selectedCategory)
      if (zoningKeyword.trim()) query.set('zoning', zoningKeyword.trim())
      const areaParsed = parseRange(areaRange)
      if (areaParsed.min != null) query.set('min_area', String(areaParsed.min))
      if (areaParsed.max != null) query.set('max_area', String(areaParsed.max))
      const priceParsed = parseRange(priceRange)
      if (priceParsed.min != null)
        query.set('min_price', String(priceParsed.min))
      if (priceParsed.max != null)
        query.set('max_price', String(priceParsed.max))
      query.set('page', String(currentPage))
      query.set('limit', String(ITEMS_PER_PAGE))
      query.set('sort', `${sortFieldMap[sortBy]}:${sortOrder}`)

      const res = await fetch(`/api/land/search?${query.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setTransactions(data.items || [])
        setTotalCount(data.total || 0)
      } else {
        setTransactions([])
        setTotalCount(0)
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err)
      setTransactions([])
      setTotalCount(0)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      const params = new URLSearchParams()
      params.set('q', query.trim())
      if (selectedCategory) params.set('land_category', selectedCategory)
      if (zoningKeyword.trim()) params.set('zoning', zoningKeyword.trim())
      const areaParsed = parseRange(areaRange)
      if (areaParsed.min != null) params.set('min_area', String(areaParsed.min))
      if (areaParsed.max != null) params.set('max_area', String(areaParsed.max))
      const priceParsed = parseRange(priceRange)
      if (priceParsed.min != null)
        params.set('min_price', String(priceParsed.min))
      if (priceParsed.max != null)
        params.set('max_price', String(priceParsed.max))
      router.push(`/land/search?${params.toString()}` as never)
      setCurrentPage(1)
    }
  }

  useEffect(() => {
    const q = searchParams.get('q') || undefined
    const sigungu = searchParams.get('sigungu') || undefined
    fetchTransactions(q, sigungu)
  }, [
    searchParams,
    currentPage,
    sortBy,
    sortOrder,
    selectedCategory,
    zoningKeyword,
    areaRange,
    priceRange,
  ])

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  const categoryOptions = Object.entries(LAND_CATEGORY_LABELS)

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Search bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <form onSubmit={handleSearch} className="mb-6">
            <div className="relative">
              <div className="pointer-events-none absolute left-5 top-1/2 flex -translate-y-1/2 items-center">
                <Search className="h-5 w-5 text-[#8B95A1]" strokeWidth={2} />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="지번 또는 주소를 입력하세요 (예: 강남구 역삼동 123-4)"
                className="h-14 w-full rounded-2xl border border-[#E5E8EB] bg-white pl-14 pr-32 text-[#191F28] placeholder:text-[#8B95A1] focus:border-[#F59E0B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/20"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-[#F59E0B] px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#EA8A0C]"
              >
                검색
              </button>
            </div>
          </form>
        </motion.div>

        {/* Filters bar */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 rounded-xl border border-[#E5E8EB] bg-white px-4 py-2.5 text-sm font-medium text-[#191F28] transition-all hover:border-[#D1D6DB]"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
            필터
          </button>

          {/* Sort */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split('-') as [
                'date' | 'price' | 'area',
                'asc' | 'desc',
              ]
              setSortBy(sort)
              setSortOrder(order)
            }}
            className="rounded-xl border border-[#E5E8EB] bg-white px-4 py-2.5 text-sm font-medium text-[#191F28] transition-all hover:border-[#D1D6DB] focus:border-[#F59E0B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/20"
          >
            <option value="date-desc">최신순</option>
            <option value="date-asc">오래된순</option>
            <option value="price-desc">높은 가격순</option>
            <option value="price-asc">낮은 가격순</option>
            <option value="area-desc">넓은 면적순</option>
            <option value="area-asc">좁은 면적순</option>
          </select>

          {/* Active filters */}
          {selectedCategory && (
            <div className="flex items-center gap-2 rounded-xl bg-[#FFF7ED] px-3 py-2 text-sm font-medium text-[#F59E0B]">
              <Filter className="h-4 w-4" strokeWidth={2} />
              {LAND_CATEGORY_LABELS[selectedCategory]}
              <button
                onClick={() => setSelectedCategory(null)}
                className="ml-1 hover:text-[#EA8A0C]"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          )}
          {zoningKeyword.trim() && (
            <div className="flex items-center gap-2 rounded-xl bg-[#EEF4FF] px-3 py-2 text-sm font-medium text-[#2F80ED]">
              용도지역: {zoningKeyword.trim()}
              <button
                onClick={() => setZoningKeyword('')}
                className="ml-1 hover:text-[#276FDB]"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          )}
          {areaRange && (
            <div className="rounded-xl bg-[#F2F4F6] px-3 py-2 text-sm font-medium text-[#4E5968]">
              면적: {areaRange.replace('-', ' ~ ')}
            </div>
          )}
          {priceRange && (
            <div className="rounded-xl bg-[#F2F4F6] px-3 py-2 text-sm font-medium text-[#4E5968]">
              가격: {priceRange.replace('-', ' ~ ')} 만원
            </div>
          )}

          <div className="ml-auto text-sm text-[#8B95A1]">
            총{' '}
            <span className="font-semibold text-[#191F28]">{totalCount}</span>건
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden rounded-2xl border border-[#E5E8EB] bg-white p-6"
          >
            <h3 className="mb-4 font-semibold text-[#191F28]">지목</h3>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map(([code, label]) => (
                <button
                  key={code}
                  onClick={() =>
                    setSelectedCategory(selectedCategory === code ? null : code)
                  }
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    selectedCategory === code
                      ? 'bg-[#F59E0B] text-white'
                      : 'border border-[#E5E8EB] text-[#4E5968] hover:border-[#F59E0B]/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#191F28]">
                  용도지역(키워드)
                </label>
                <input
                  value={zoningKeyword}
                  onChange={(e) => {
                    setZoningKeyword(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="예: 제2종일반주거"
                  className="h-10 w-full rounded-lg border border-[#E5E8EB] bg-white px-3 text-sm text-[#191F28] placeholder:text-[#8B95A1] focus:border-[#F59E0B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#191F28]">
                  면적
                </label>
                <select
                  value={areaRange}
                  onChange={(e) => {
                    setAreaRange(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="h-10 w-full rounded-lg border border-[#E5E8EB] bg-white px-3 text-sm text-[#191F28] focus:border-[#F59E0B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/20"
                >
                  <option value="">전체</option>
                  <option value="-100">~100m²</option>
                  <option value="100-300">100~300m²</option>
                  <option value="300-1000">300~1000m²</option>
                  <option value="1000-">1000m²~</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#191F28]">
                  가격(만원)
                </label>
                <select
                  value={priceRange}
                  onChange={(e) => {
                    setPriceRange(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="h-10 w-full rounded-lg border border-[#E5E8EB] bg-white px-3 text-sm text-[#191F28] focus:border-[#F59E0B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/20"
                >
                  <option value="">전체</option>
                  <option value="-10000">~1억</option>
                  <option value="10000-50000">1~5억</option>
                  <option value="50000-100000">5~10억</option>
                  <option value="100000-500000">10~50억</option>
                  <option value="500000-">50억~</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}

        {/* Results */}
        {isLoading ? (
          <div className="py-20 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF7ED]">
              <MapPin
                className="h-8 w-8 animate-pulse text-[#F59E0B]"
                strokeWidth={2}
              />
            </div>
            <p className="mt-4 text-[#8B95A1]">검색 중...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F2F4F6]">
              <Search className="h-8 w-8 text-[#8B95A1]" strokeWidth={2} />
            </div>
            <p className="mt-4 text-[#8B95A1]">
              검색 결과가 없습니다. 다른 조건으로 검색해보세요.
            </p>
          </div>
        ) : (
          <>
            {/* Cards grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {transactions.map((tx, i) => (
                <LandTransactionCard key={tx.id} transaction={tx} index={i} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E8EB] bg-white text-[#8B95A1] transition-all hover:border-[#D1D6DB] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2} />
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page = i + 1
                  if (totalPages > 5) {
                    if (currentPage > 3) {
                      page = currentPage - 2 + i
                    }
                    if (currentPage > totalPages - 2) {
                      page = totalPages - 4 + i
                    }
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold transition-all ${
                        currentPage === page
                          ? 'bg-[#F59E0B] text-white'
                          : 'border border-[#E5E8EB] bg-white text-[#4E5968] hover:border-[#D1D6DB]'
                      }`}
                    >
                      {page}
                    </button>
                  )
                })}

                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E8EB] bg-white text-[#8B95A1] transition-all hover:border-[#D1D6DB] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function LandSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB]">
          <div className="text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF7ED]">
              <MapPin
                className="h-8 w-8 animate-pulse text-[#F59E0B]"
                strokeWidth={2}
              />
            </div>
            <p className="mt-4 text-[#8B95A1]">로딩 중...</p>
          </div>
        </div>
      }
    >
      <LandSearchContent />
    </Suspense>
  )
}
