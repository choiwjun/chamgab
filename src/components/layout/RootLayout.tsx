// @TASK P1-S0-T1 - 루트 레이아웃 컴포넌트
// @SPEC specs/shared/components.yaml#layouts

'use client'

import { ReactNode } from 'react'
import { Header } from './Header'
import { BottomTabBar } from './BottomTabBar'

interface RootLayoutProps {
  children: ReactNode
  /**
   * 헤더 표시 여부 (기본: true)
   */
  showHeader?: boolean
  /**
   * 하단 탭 바 표시 여부 (기본: true, 모바일만)
   */
  showBottomTabBar?: boolean
  /**
   * 풀스크린 모드 (지도 등, 기본: false)
   */
  fullScreen?: boolean
  /**
   * 최대 너비 제한 (기본: '7xl')
   */
  maxWidth?: 'full' | '7xl' | '6xl' | '5xl' | '4xl'
}

const maxWidthClasses = {
  full: '',
  '7xl': 'max-w-7xl mx-auto',
  '6xl': 'max-w-6xl mx-auto',
  '5xl': 'max-w-5xl mx-auto',
  '4xl': 'max-w-4xl mx-auto',
}

export function RootLayout({
  children,
  showHeader = true,
  showBottomTabBar = true,
  fullScreen = false,
  maxWidth = '7xl',
}: RootLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 헤더 */}
      {showHeader && <Header />}

      {/* 메인 콘텐츠 */}
      <main
        className={`
          flex-1 flex flex-col
          ${fullScreen ? 'overflow-hidden' : ''}
          ${showBottomTabBar ? 'pb-16 md:pb-0' : ''}
        `}
      >
        <div
          className={`
            flex-1 flex flex-col
            ${fullScreen ? '' : maxWidthClasses[maxWidth]}
            ${fullScreen ? '' : 'px-4 sm:px-6 lg:px-8 py-6'}
          `}
        >
          {children}
        </div>
      </main>

      {/* 하단 탭 바 (모바일) */}
      {showBottomTabBar && <BottomTabBar />}
    </div>
  )
}
