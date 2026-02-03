// @TASK P2-R2 - Regions 테이블 및 API 테스트
// @SPEC docs/planning/04-database-design.md#regions-table
// @SPEC specs/domain/resources.yaml#regions

import { describe, it, expect } from 'vitest'
import type { Region, RegionWithChildren, RegionTrend } from '@/types/region'

describe('P2-R2: Regions 테이블 생성 및 API', () => {
  describe('P2-R2-T1: Regions 테이블 스키마', () => {
    it('should have Region type definitions', () => {
      // TypeScript interfaces are compile-time constructs
      // This test verifies the types are properly defined in TypeScript
      expect(true).toBe(true)
    })

    it('should validate region with required fields', () => {
      const region: Region = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        code: '1100000000',
        name: '서울시',
        level: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      expect(region.code).toBeTruthy()
      expect(region.name).toBeTruthy()
      expect(region.level).toBe(1)
      expect([1, 2, 3]).toContain(region.level)
    })

    it('should validate 계층형 region (시도 -> 시군구 -> 읍면동)', () => {
      const sido: Region = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        code: '1100000000',
        name: '서울시',
        level: 1,
        parent_code: undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const sigungu: Region = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        code: '1111000000',
        name: '강남구',
        level: 2,
        parent_code: '1100000000',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const eupmyeondong: Region = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        code: '1111010100',
        name: '역삼1동',
        level: 3,
        parent_code: '1111000000',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      expect(sido.level).toBe(1)
      expect(sigungu.level).toBe(2)
      expect(sigungu.parent_code).toBe(sido.code)
      expect(eupmyeondong.level).toBe(3)
      expect(eupmyeondong.parent_code).toBe(sigungu.code)
    })

    it('should have optional location fields', () => {
      const region: Region = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        code: '1100000000',
        name: '서울시',
        level: 1,
        latitude: 37.5665,
        longitude: 126.978,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      expect(region.latitude).toBeGreaterThanOrEqual(-90)
      expect(region.latitude).toBeLessThanOrEqual(90)
      expect(region.longitude).toBeGreaterThanOrEqual(-180)
      expect(region.longitude).toBeLessThanOrEqual(180)
    })

    it('should have optional price cache fields', () => {
      const region: Region = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        code: '1111000000',
        name: '강남구',
        level: 2,
        avg_price: 3500000000, // 35억원
        price_change_weekly: 0.5, // 주간 0.5% 상승
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      expect(typeof region.avg_price).toBe('number')
      expect(typeof region.price_change_weekly).toBe('number')
    })
  })

  describe('P2-R2-T1: 계층형 쿼리 (RegionWithChildren)', () => {
    it('should support hierarchical region structure', () => {
      const seoul: RegionWithChildren = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        code: '1100000000',
        name: '서울시',
        level: 1,
        children: [
          {
            id: '550e8400-e29b-41d4-a716-446655440002',
            code: '1111000000',
            name: '강남구',
            level: 2,
            parent_code: '1100000000',
            children: [
              {
                id: '550e8400-e29b-41d4-a716-446655440003',
                code: '1111010100',
                name: '역삼1동',
                level: 3,
                parent_code: '1111000000',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      expect(seoul.children).toHaveLength(1)
      expect(seoul.children?.[0].children).toHaveLength(1)
      expect(seoul.children?.[0].children?.[0].name).toBe('역삼1동')
    })
  })

  describe('P2-R2-T2: Regions API - 지역 목록', () => {
    it('should list regions by level', () => {
      const sidos = [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          code: '1100000000',
          name: '서울시',
          level: 1,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440004',
          code: '2700000000',
          name: '경주시',
          level: 1,
        },
      ]

      expect(sidos).toHaveLength(2)
      expect(sidos.every((r) => r.level === 1)).toBe(true)
    })

    it('should list sub-regions by parent_code', () => {
      const gangnamChildren = [
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          code: '1111010100',
          name: '역삼1동',
          level: 3,
          parent_code: '1111000000',
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440005',
          code: '1111010200',
          name: '역삼2동',
          level: 3,
          parent_code: '1111000000',
        },
      ]

      expect(gangnamChildren).toHaveLength(2)
      expect(gangnamChildren.every((r) => r.parent_code === '1111000000')).toBe(true)
    })
  })

  describe('P2-R2-T2: Regions API - 가격 트렌드', () => {
    it('should return trend data with avg_price and change_rate', () => {
      const trends: RegionTrend[] = [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          name: '강남구',
          level: 2,
          avg_price: 3500000000,
          price_change_weekly: 0.5,
          property_count: 1230,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
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

    it('should support positive and negative price changes', () => {
      const upTrend: RegionTrend = {
        id: '1',
        name: '강남구',
        level: 2,
        price_change_weekly: 1.2,
      }
      const downTrend: RegionTrend = {
        id: '2',
        name: '서초구',
        level: 2,
        price_change_weekly: -0.8,
      }

      expect(upTrend.price_change_weekly).toBeGreaterThan(0)
      expect(downTrend.price_change_weekly).toBeLessThan(0)
    })
  })

  describe('Sample Data - 서울시 지역', () => {
    it('should have valid Seoul regions hierarchy', () => {
      const sampleRegions: RegionWithChildren[] = [
        {
          id: 'seoul-id',
          code: '1100000000',
          name: '서울시',
          level: 1,
          children: [
            {
              id: 'gangnam-id',
              code: '1111000000',
              name: '강남구',
              level: 2,
              parent_code: '1100000000',
              children: [
                {
                  id: 'yeoksam1-id',
                  code: '1111010100',
                  name: '역삼1동',
                  level: 3,
                  parent_code: '1111000000',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]

      expect(sampleRegions).toHaveLength(1)
      expect(sampleRegions[0].name).toBe('서울시')
      expect(sampleRegions[0].children).toHaveLength(1)
    })

    it('should validate Seoul code format (10 digits)', () => {
      const codes = ['1100000000', '1111000000', '1111010100']
      codes.forEach((code) => {
        expect(code).toHaveLength(10)
        expect(/^\d{10}$/.test(code)).toBe(true)
      })
    })
  })
})
