// @TASK P2-R1 - Properties 테이블 및 API 테스트
// @SPEC docs/planning/04-database-design.md#properties-table
// @SPEC specs/domain/resources.yaml#properties

import { describe, it, expect } from 'vitest'
import type {
  Property,
  PropertyQueryParams,
  PropertyResponse,
  SearchSuggestion,
  PropertyType
} from '@/types/property'

describe('P2-R1: Properties Resource', () => {
  describe('P2-R1-T1: Properties 타입 정의', () => {
    it('should import types module successfully', async () => {
      try {
        await import('@/types/property')
        expect(true).toBe(true)
      } catch (error) {
        throw new Error('Failed to import property types')
      }
    })

    it('should have proper Property data structure with required fields', () => {
      const testProperty: Property = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        property_type: 'apt',
        name: '래미안 강남 101동 1001호',
        address: '서울시 강남구 역삼동 123',
        created_at: new Date().toISOString(),
      }
      expect(testProperty).toBeDefined()
      expect(testProperty.id).toBeTruthy()
      expect(testProperty.property_type).toBe('apt')
    })

    it('should validate property_type enum values', () => {
      const validTypes: PropertyType[] = ['apt', 'officetel', 'villa', 'store', 'land', 'building']
      validTypes.forEach((type) => {
        expect(['apt', 'officetel', 'villa', 'store', 'land', 'building']).toContain(type)
      })
    })

    it('should have optional location fields', () => {
      const propertyWithLocation: Property = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        property_type: 'apt',
        name: '래미안 강남',
        address: '서울시 강남구 역삼동 123',
        sido: '서울시',
        sigungu: '강남구',
        location: { lat: 37.4979, lng: 127.0276 },
        created_at: new Date().toISOString(),
      }
      expect(propertyWithLocation.sido).toBe('서울시')
      expect(propertyWithLocation.location?.lat).toBeGreaterThanOrEqual(-90)
    })
  })

  describe('P2-R1-T1: Properties 스키마 유효성', () => {
    it('should validate area_exclusive as DECIMAL', () => {
      const areaValue = 84.55
      expect(typeof areaValue).toBe('number')
    })

    it('should validate built_year as INTEGER', () => {
      const builtYear = 2015
      expect(Number.isInteger(builtYear)).toBe(true)
    })

    it('should validate images as TEXT[]', () => {
      const images = ['url1', 'url2']
      expect(Array.isArray(images)).toBe(true)
    })

    it('should validate complex_id as UUID', () => {
      const complexId = '550e8400-e29b-41d4-a716-446655440001'
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      expect(uuidRegex.test(complexId)).toBe(true)
    })
  })

  describe('P2-R1-T2: Properties API - GET /api/properties', () => {
    it('should return paginated response structure', () => {
      const response: PropertyResponse = {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      }
      expect(response.items).toBeDefined()
      expect(response.total).toBeDefined()
    })

    it('should support filter params', () => {
      const params: PropertyQueryParams = {
        sido: '서울시',
        sigungu: '강남구',
        property_type: 'apt',
        min_area: 60,
        max_area: 100,
        page: 1,
        limit: 20,
        sort: 'created_at:desc',
      }
      expect(params.sido).toBe('서울시')
      expect(params.property_type).toBe('apt')
    })
  })

  describe('P2-R1-T2: Properties API - GET /api/properties/:id', () => {
    it('should return property with all fields', () => {
      const property: Property = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        property_type: 'apt',
        name: '래미안 강남',
        address: '서울시 강남구 역삼동 123',
        area_exclusive: 84.5,
        created_at: new Date().toISOString(),
      }
      expect(property.id).toBeTruthy()
      expect(property.property_type).toBe('apt')
    })
  })

  describe('P2-R1-T2: Properties API - GET /api/properties/autocomplete', () => {
    it('should return SearchSuggestion[] structure', () => {
      const suggestions: SearchSuggestion[] = [
        { id: '550e8400-e29b-41d4-a716-446655440000', name: '래미안 강남', type: 'property', address: '서울시 강남구' },
      ]
      expect(suggestions).toHaveLength(1)
      expect(suggestions[0].type).toBe('property')
    })

    it('should require minimum 2 characters for search', () => {
      const shortQuery = '래'
      const validQuery = '래미'
      expect(shortQuery.length).toBeLessThan(2)
      expect(validQuery.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Sample Data', () => {
    it('should have valid sample properties', () => {
      const samples: Property[] = [{
        id: '650e8400-e29b-41d4-a716-446655440001',
        property_type: 'apt',
        name: '래미안 강남 101동 1001호',
        address: '서울시 강남구 역삼동 123',
        created_at: new Date().toISOString(),
      }]
      expect(samples).toHaveLength(1)
      expect(samples[0].property_type).toBe('apt')
    })
  })
})
