import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'
import { Header } from '@/components/layout/Header'
import { BottomTabBar } from '@/components/layout/BottomTabBar'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://chamgab.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '참값 - AI 부동산 가격 분석 | 아파트 적정가격 조회',
    template: '%s | 참값',
  },
  description:
    'AI가 분석한 정확한 부동산 참값을 확인하세요. 아파트 적정가격, 실거래가 분석, 상권분석, 토지 시세를 한 곳에서 비교하세요.',
  keywords: [
    '부동산',
    '아파트 시세',
    '아파트 적정가격',
    'AI 부동산 분석',
    '실거래가 조회',
    '상권분석',
    '토지 시세',
    '참값',
    '아파트 가격 예측',
    '부동산 투자',
  ],
  authors: [{ name: '참값', url: SITE_URL }],
  creator: '참값',
  publisher: '참값',
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: '참값',
    title: '참값 - AI 부동산 가격 분석',
    description:
      'AI가 분석한 정확한 부동산 참값. 아파트 적정가격, 실거래가, 상권분석, 토지 시세를 확인하세요.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '참값 - AI 부동산 가격 분석 서비스',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '참값 - AI 부동산 가격 분석',
    description:
      'AI가 분석한 정확한 부동산 참값. 아파트 적정가격, 상권분석, 토지 시세.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || undefined,
    other: {
      'naver-site-verification': process.env.NEXT_PUBLIC_NAVER_VERIFICATION
        ? [process.env.NEXT_PUBLIC_NAVER_VERIFICATION]
        : [],
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
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
