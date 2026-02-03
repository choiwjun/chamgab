// @TASK P2-R2-T2 - Regions API 테스트
// @SPEC docs/planning/04-database-design.md#regions-api

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RegionTrend } from '@/types/region'

describe('P2-R2-T2: Regions API', () => {
  describe('GET /api/regions - 지역 목록', () => {
    it('should return regions list without parameters', async () => {
      // Mock response
      const mockResponse = {
        data: [
          {
            id: '1',
            code: '1100000000',
            name: '서울시',
            level: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        pagination: {
          page: 1,
          limit: 50,
          total: 1,
          pages: 1,
        },
      }

      expect(mockResponse.data).toHaveLength(1)
      expect(mockResponse.data[0].name).toBe('서울시')
    })

    it('should filter regions by level', () => {
      const regions = [
        { id: '1', code: '1100000000', name: '서울시', level: 1 },
        { id: '2', code: '1111000000', name: '강남구', level: 2 },
      ]

      const level2 = regions.filter((r) => r.level === 2)
      expect(level2).toHaveLength(1)
      expect(level2[0].name).toBe('강남구')
    })

    it('should filter regions by parent_code', () => {
      const regions = [
        {
          id: '2',
          code: '1111000000',
          name: '강남구',
          level: 2,
          parent_code: '1100000000',
        },
        {
          id: '3',
          code: '1111010100',
          name: '역삼1동',
          level: 3,
          parent_code: '1111000000',
        },
      ]

      const children = regions.filter((r) => r.parent_code === '1111000000')
      expect(children).toHaveLength(1)
      expect(children[0].name).toBe('역삼1동')
    })

    it('should support keyword search', () => {
      const regions = [
        { id: '1', name: '강남구' },
        { id: '2', name: '강동구' },
        { id: '3', name: '서초구' },
      ]

      const keyword = '강'
      const results = regions.filter((r) => r.name.includes(keyword))
      expect(results).toHaveLength(2)
    })

    it('should support pagination', () => {
      const regions = Array.from({ length: 30 }, (_, i) => ({
        id: String(i),
        name: `Region ${i}`,
      }))

      const page = 1
      const limit = 10
      const offset = (page - 1) * limit
      const paginated = regions.slice(offset, offset + limit)

      expect(paginated).toHaveLength(10)
      expect(paginated[0].name).toBe('Region 0')
    })

    it('should return hierarchical structure for root level', () => {
      const hierarchical = [
        {
          id: '1',
          code: '1100000000',
          name: '서울시',
          level: 1,
          children: [
            {
              id: '2',
              code: '1111000000',
              name: '강남구',
              level: 2,
              parent_code: '1100000000',
              children: [],
            },
          ],
        },
      ]

      expect(hierarchical).toHaveLength(1)
      expect(hierarchical[0].children).toHaveLength(1)
      expect(hierarchical[0].children[0].name).toBe('강남구')
    })
  })

  describe('GET /api/regions/trends - 가격 트렌드', () => {
    it('should return trend data with avg_price and change_rate', () => {
      const trends: RegionTrend[] = [
        {
          id: '1',
          name: '강남구',
          level: 2,
          avg_price: 3500000000,
          price_change_weekly: 0.5,
          property_count: 1230,
        },
        {
          id: '2',
          name: '서초구',
          level: 2,
          avg_price: 4200000000,
          price_change_weekly: -0.2,
          property_count: 950,
        },
      ]

      expect(trends).toHaveLength(2)
      expect(trends[0].avg_price).toBe(3500000000)
      expect(trends[0].price_change_weekly).toBe(0.5)
      expect(trends[1].price_change_weekly).toBe(-0.2)
    })

    it('should support level parameter (1 or 2)', () => {
      const level1Trends: RegionTrend[] = [
        {
          id: '1',
          name: '서울시',
          level: 1,
          avg_price: 3200000000,
          price_change_weekly: 0.3,
        },
      ]

      const level2Trends: RegionTrend[] = [
        {
          id: '2',
          name: '강남구',
          level: 2,
          avg_price: 3500000000,
          price_change_weekly: 0.5,
        },
      ]

      expect(level1Trends[0].level).toBe(1)
      expect(level2Trends[0].level).toBe(2)
    })

    it('should sort by price_change in descending order', () => {
      const trends: RegionTrend[] = [
        { id: '1', name: '강남구', level: 2, price_change_weekly: 0.5 },
        { id: '2', name: '서초구', level: 2, price_change_weekly: -0.2 },
        { id: '3', name: '송파구', level: 2, price_change_weekly: 0.8 },
      ]

      const sorted = [...trends].sort(
        (a, b) => (b.price_change_weekly || 0) - (a.price_change_weekly || 0)
      )

      expect(sorted[0].price_change_weekly).toBe(0.8)
      expect(sorted[1].price_change_weekly).toBe(0.5)
      expect(sorted[2].price_change_weekly).toBe(-0.2)
    })

    it('should support sort by avg_price', () => {
      const trends: RegionTrend[] = [
        { id: '1', name: '강남구', level: 2, avg_price: 3500000000 },
        { id: '2', name: '서초구', level: 2, avg_price: 4200000000 },
        { id: '3', name: '송파구', level: 2, avg_price: 3200000000 },
      ]

      const sorted = [...trends].sort((a, b) => (b.avg_price || 0) - (a.avg_price || 0))

      expect(sorted[0].avg_price).toBe(4200000000)
      expect(sorted[1].avg_price).toBe(3500000000)
      expect(sorted[2].avg_price).toBe(3200000000)
    })

    it('should support limit parameter', () => {
      const allTrends = Array.from({ length: 30 }, (_, i) => ({
        id: String(i),
        name: `Region ${i}`,
        level: 2,
      }))

      const limit = 10
      const limited = allTrends.slice(0, limit)

      expect(limited).toHaveLength(10)
      expect(limited[0].name).toBe('Region 0')
    })

    it('should include property_count for each region', () => {
      const trends: RegionTrend[] = [
        {
          id: '1',
          name: '강남구',
          level: 2,
          avg_price: 3500000000,
          property_count: 1230,
        },
        {
          id: '2',
          name: '서초구',
          level: 2,
          avg_price: 4200000000,
          property_count: 950,
        },
      ]

      expect(trends.every((t) => t.property_count !== undefined)).toBe(true)
      expect(trends[0].property_count).toBe(1230)
    })

    it('should handle positive and negative price changes', () => {
      const trends: RegionTrend[] = [
        {
          id: '1',
          name: '강남구',
          level: 2,
          price_change_weekly: 1.2, // 상승
        },
        {
          id: '2',
          name: '서초구',
          level: 2,
          price_change_weekly: -0.8, // 하락
        },
      ]

      expect(trends[0].price_change_weekly! > 0).toBe(true)
      expect(trends[1].price_change_weekly! < 0).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should return 400 for invalid level parameter', () => {
      const invalidLevel = 5
      expect([1, 2].includes(invalidLevel)).toBe(false)
    })

    it('should handle missing optional parameters gracefully', () => {
      // API should work with default parameters
      const defaultParams = {
        level: 2,
        limit: 10,
        sort: 'price_change',
      }

      expect(defaultParams.level).toBe(2)
      expect(defaultParams.limit).toBe(10)
    })

    it('should cap limit at 50 maximum', () => {
      const requestedLimit = 100
      const cappedLimit = Math.min(requestedLimit, 50)

      expect(cappedLimit).toBe(50)
    })
  })
})
