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
        // Editorial Luxury 팔레트
        editorial: {
          bg: '#faf8f5',        // Warm cream background
          dark: '#1a1a2e',      // Deep charcoal
          muted: '#2d2d44',     // Softer dark
          gold: '#b8956e',      // Muted gold accent
          sage: '#6b8f71',      // Sage green
          sand: '#e8e4dc',      // Sand/neutral
          ink: '#3d3d3d',       // Text ink
        },
        // 참값 브랜드 컬러 (기존 유지)
        primary: {
          DEFAULT: '#1a1a2e',
          light: '#2d2d44',
          dark: '#0f0f1a',
        },
        accent: {
          DEFAULT: '#b8956e',
          light: '#d4b896',
          dark: '#9a7a5a',
        },
        // 참값 분석 컬러
        chamgab: {
          up: '#6b8f71',      // Sage green for up
          down: '#c17d6f',    // Muted terracotta for down
          neutral: '#8b8b8b',
        },
        // 신뢰도 레벨
        confidence: {
          'very-high': '#6b8f71',
          high: '#7a9f81',
          medium: '#b8956e',
          low: '#c17d6f',
        },
      },
      fontFamily: {
        sans: ['Pretendard', 'sans-serif'],
        serif: ['Noto Serif KR', 'Georgia', 'serif'],
        display: ['Playfair Display', 'Noto Serif KR', 'serif'],
      },
      fontSize: {
        // Editorial 대형 타이포
        'display-xl': ['5rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-lg': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
        // 참값 가격 표시용
        'chamgab-lg': ['2rem', { lineHeight: '1.2', fontWeight: '700' }],
        'chamgab-md': ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      animation: {
        'fade-up': 'fadeUp 0.6s ease-out forwards',
        'fade-in': 'fadeIn 0.8s ease-out forwards',
        'slide-in': 'slideIn 0.5s ease-out forwards',
        'number-roll': 'numberRoll 2s ease-out forwards',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        numberRoll: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
