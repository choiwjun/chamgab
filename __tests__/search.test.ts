// @TASK P2-R3 - Popular Searches API 테스트
// @SPEC specs/domain/resources.yaml#popular_searches

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Next.js headers (필요한 경우)
vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Map()),
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))

// Mock Supabase client (테스트 환경에서 DB 연결 없이 동작)
const mockFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({
    data: [
      {
        name: '강남구',
        avg_price: 1500000000,
        price_change_weekly: 0.5,
        updated_at: new Date().toISOString(),
      },
      {
        name: '서초구',
        avg_price: 1300000000,
        price_change_weekly: -0.2,
        updated_at: new Date().toISOString(),
      },
      {
        name: '송파구',
        avg_price: 1100000000,
        price_change_weekly: 0.1,
        updated_at: new Date().toISOString(),
      },
    ],
    error: null,
  }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

describe('P2-R3-T1: Popular Searches API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/search/popular', () => {
    it('should return popular searches list', async () => {
      const { GET } = await import('@/app/api/search/popular/route')

      const request = new Request('http://localhost/api/search/popular', {
        method: 'GET',
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.items).toBeDefined()
      expect(Array.isArray(data.items)).toBe(true)
    })

    it('should have correct response structure', async () => {
      const { GET } = await import('@/app/api/search/popular/route')

      const request = new Request('http://localhost/api/search/popular', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      // 응답 구조 검증
      expect(data).toHaveProperty('items')
      expect(data).toHaveProperty('updated_at')
      expect(typeof data.updated_at).toBe('string')
    })

    it('should return items with required fields', async () => {
      const { GET } = await import('@/app/api/search/popular/route')

      const request = new Request('http://localhost/api/search/popular', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      // 각 아이템의 필수 필드 검증
      data.items.forEach((item: Record<string, unknown>) => {
        expect(item).toHaveProperty('rank')
        expect(item).toHaveProperty('keyword')
        expect(item).toHaveProperty('search_count')
        expect(item).toHaveProperty('change')

        // 타입 검증
        expect(typeof item.rank).toBe('number')
        expect(typeof item.keyword).toBe('string')
        expect(typeof item.search_count).toBe('number')
        expect(['up', 'down', 'same']).toContain(item.change)
      })
    })

    it('should include rank change information when applicable', async () => {
      const { GET } = await import('@/app/api/search/popular/route')

      const request = new Request('http://localhost/api/search/popular', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      // change가 'up' 또는 'down'인 경우 change_rank가 있어야 함
      data.items.forEach((item: Record<string, unknown>) => {
        if (item.change === 'up' || item.change === 'down') {
          expect(item).toHaveProperty('change_rank')
          expect(typeof item.change_rank).toBe('number')
          expect(item.change_rank).toBeGreaterThan(0)
        }
      })
    })

    it('should return items sorted by rank in ascending order', async () => {
      const { GET } = await import('@/app/api/search/popular/route')

      const request = new Request('http://localhost/api/search/popular', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      // rank 순서 검증
      for (let i = 0; i < data.items.length - 1; i++) {
        expect(data.items[i].rank).toBeLessThan(data.items[i + 1].rank)
      }
    })

    it('should limit results to top 10 by default', async () => {
      const { GET } = await import('@/app/api/search/popular/route')

      const request = new Request('http://localhost/api/search/popular', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data.items.length).toBeLessThanOrEqual(10)
    })

    it('should support limit query parameter', async () => {
      const { GET } = await import('@/app/api/search/popular/route')

      const request = new Request(
        'http://localhost/api/search/popular?limit=5',
        {
          method: 'GET',
        }
      )

      const response = await GET(request)
      const data = await response.json()

      expect(data.items.length).toBeLessThanOrEqual(5)
    })
  })
})

describe('Search Types', () => {
  it('should export PopularSearch type', async () => {
    const types = await import('@/types/search')
    expect(types).toBeDefined()
  })

  it('should export SearchSuggestion type', async () => {
    const types = await import('@/types/search')
    expect(types).toBeDefined()
  })
})
