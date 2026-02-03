// @TASK P2-S2-T3 - PropertyList 테스트
// @SPEC specs/screens/search-list.yaml

import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PropertyList } from '@/components/search/PropertyList'
import { describe, it, expect, vi } from 'vitest'

// Mock fetch
global.fetch = vi.fn()

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('PropertyList', () => {
  it('로딩 상태에서 스켈레톤을 표시해야 함', () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], total: 0, page: 1, limit: 20 }),
    } as Response)

    const { container } = render(
      <PropertyList filters={{}} />,
      { wrapper: createWrapper() }
    )

    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('매물이 없을 때 안내 메시지를 표시해야 함', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], total: 0, page: 1, limit: 20 }),
    } as Response)

    render(
      <PropertyList filters={{}} />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument()
    })
  })

  it('매물 목록을 렌더링해야 함', async () => {
    const mockProperties = [
      {
        id: '1',
        property_type: 'apt',
        name: '테스트 아파트',
        address: '서울시 강남구',
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        property_type: 'officetel',
        name: '테스트 오피스텔',
        address: '서울시 서초구',
        created_at: '2024-01-01T00:00:00Z',
      },
    ]

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: mockProperties,
        total: 2,
        page: 1,
        limit: 20,
      }),
    } as Response)

    render(
      <PropertyList filters={{}} />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('총')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })
})
