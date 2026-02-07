import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'
import { Header } from '@/components/layout/Header'
import { BottomTabBar } from '@/components/layout/BottomTabBar'

export const metadata: Metadata = {
  title: '참값 - AI 부동산 가격 분석',
  description: 'AI가 분석한 정확한 부동산 참값을 확인하세요',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Pretendard - Body & Display Font */}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          <Header />
          <main className="pb-16 md:pb-0">{children}</main>
          <BottomTabBar />
        </Providers>
      </body>
    </html>
  )
}
