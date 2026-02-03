/**
 * 참값 디자인 토큰
 * @see docs/planning/05-design-system.md
 */

export const colors = {
  primary: {
    DEFAULT: '#1E3A5F',
    light: '#2E5A8F',
    dark: '#0E2A4F',
  },
  accent: {
    DEFAULT: '#D4A853',
    light: '#E4B863',
    dark: '#C49843',
  },
  chamgab: {
    up: '#10B981',
    down: '#EF4444',
    neutral: '#64748B',
  },
  confidence: {
    veryHigh: '#10B981',
    high: '#22C55E',
    medium: '#F59E0B',
    low: '#EF4444',
  },
} as const

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
} as const

export const fontSize = {
  // 일반 텍스트
  caption: ['0.75rem', { lineHeight: '1rem' }],
  body: ['0.875rem', { lineHeight: '1.25rem' }],
  bodyLarge: ['1rem', { lineHeight: '1.5rem' }],

  // 제목
  h4: ['1.125rem', { lineHeight: '1.75rem', fontWeight: '600' }],
  h3: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
  h2: ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
  h1: ['2rem', { lineHeight: '2.5rem', fontWeight: '700' }],

  // 참값 가격 표시
  chamgabLarge: ['2rem', { lineHeight: '1.2', fontWeight: '700' }],
  chamgabMedium: ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
} as const

export const borderRadius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
} as const

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const

// 신뢰도 레벨 맵핑
export const confidenceLevelMap = {
  very_high: { label: '매우 높음', color: colors.confidence.veryHigh, min: 90 },
  high: { label: '높음', color: colors.confidence.high, min: 75 },
  medium: { label: '보통', color: colors.confidence.medium, min: 50 },
  low: { label: '낮음', color: colors.confidence.low, min: 0 },
} as const

export type ConfidenceLevel = keyof typeof confidenceLevelMap
