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
        // Toss/Google clean palette
        gray: {
          50: '#F9FAFB',
          100: '#F2F4F6',
          200: '#E5E8EB',
          300: '#D1D6DB',
          400: '#B0B8C1',
          500: '#8B95A1',
          600: '#6B7684',
          700: '#4E5968',
          800: '#333D4B',
          900: '#191F28',
        },
        blue: {
          50: '#EBF5FF',
          100: '#DBEAFE',
          500: '#3182F6',
          600: '#1B64DA',
          700: '#1557B0',
        },
        green: {
          50: '#E8FAF0',
          500: '#00C471',
          600: '#00A65E',
        },
        red: {
          50: '#FFF0F0',
          500: '#F04452',
          600: '#E02020',
        },
        primary: {
          DEFAULT: '#3182F6',
          dark: '#1B64DA',
        },
        chamgab: {
          up: '#00C471',
          down: '#F04452',
          neutral: '#8B95A1',
        },
        confidence: {
          'very-high': '#00A65E',
          high: '#00C471',
          medium: '#F59E0B',
          low: '#F04452',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}

export default config
