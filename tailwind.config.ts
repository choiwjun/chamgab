import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 참값 브랜드 컬러
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
        // 참값 분석 컬러
        chamgab: {
          up: '#10B981',
          down: '#EF4444',
          neutral: '#64748B',
        },
        // 신뢰도 레벨
        confidence: {
          'very-high': '#10B981',
          high: '#22C55E',
          medium: '#F59E0B',
          low: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Pretendard', 'sans-serif'],
      },
      fontSize: {
        // 참값 가격 표시용
        'chamgab-lg': ['2rem', { lineHeight: '1.2', fontWeight: '700' }],
        'chamgab-md': ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
}

export default config
