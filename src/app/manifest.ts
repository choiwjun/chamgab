import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '참값 - AI 부동산 가격 분석',
    short_name: '참값',
    description:
      'AI가 분석한 정확한 부동산 참값을 확인하세요. 아파트 적정가격, 상권분석, 토지 시세를 한 곳에서.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3182F6',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
