'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { ReactNode, useState } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 데이터를 5분간 fresh 상태로 유지 (불필요한 리페치 방지)
            staleTime: 5 * 60 * 1000,
            // 30분간 캐시 유지
            gcTime: 30 * 60 * 1000,
            // 윈도우 포커스 시 자동 리페치 비활성화 (필요시 수동으로)
            refetchOnWindowFocus: false,
            // 재시도 1회로 제한 (빠른 에러 표시)
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
