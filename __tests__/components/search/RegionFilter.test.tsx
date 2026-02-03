// @TASK P2-S2-T2 - RegionFilter 테스트
// @SPEC specs/screens/search-list.yaml

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegionFilter } from '@/components/search/RegionFilter'
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

describe('RegionFilter', () => {
  it('시도 목록을 불러와 표시해야 함', async () => {
    const mockSidoList = [
      { id: '1', code: '11', name: '서울특별시', level: 1 as const, created_at: '', updated_at: '' },
      { id: '2', code: '26', name: '부산광역시', level: 1 as const, created_at: '', updated_at: '' },
    ]

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: mockSidoList }),
    } as Response)

    render(
      <RegionFilter
        onSidoChange={vi.fn()}
        onSigunguChange={vi.fn()}
      />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('서울특별시')).toBeInTheDocument()
      expect(screen.getByText('부산광역시')).toBeInTheDocument()
    })
  })

  it('시도 선택 시 onSidoChange 콜백을 호출해야 함', async () => {
    const mockSidoList = [
      { id: '1', code: '11', name: '서울특별시', level: 1 as const, created_at: '', updated_at: '' },
    ]

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: mockSidoList }),
    } as Response)

    const onSidoChange = vi.fn()
    const user = userEvent.setup()

    render(
      <RegionFilter
        onSidoChange={onSidoChange}
        onSigunguChange={vi.fn()}
      />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('서울특별시')).toBeInTheDocument()
    })

    const sidoSelect = screen.getByRole('combobox', { name: /시·도/i })
    await user.selectOptions(sidoSelect, '서울특별시')

    expect(onSidoChange).toHaveBeenCalledWith('서울특별시')
  })

  it('시도 변경 시 시군구를 초기화해야 함', async () => {
    const mockSidoList = [
      { id: '1', code: '11', name: '서울특별시', level: 1 as const, created_at: '', updated_at: '' },
    ]

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: mockSidoList }),
    } as Response)

    const onSidoChange = vi.fn()
    const onSigunguChange = vi.fn()
    const user = userEvent.setup()

    render(
      <RegionFilter
        onSidoChange={onSidoChange}
        onSigunguChange={onSigunguChange}
      />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('서울특별시')).toBeInTheDocument()
    })

    const sidoSelect = screen.getByRole('combobox', { name: /시·도/i })
    await user.selectOptions(sidoSelect, '서울특별시')

    expect(onSigunguChange).toHaveBeenCalledWith(undefined)
  })
})
