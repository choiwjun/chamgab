import { MetadataRoute } from 'next'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://chamgab.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/mypage/',
          '/checkout/',
          '/notifications/',
          '/admin/',
        ],
      },
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: ['/api/', '/auth/', '/mypage/', '/checkout/', '/admin/'],
      },
      {
        userAgent: 'Google-Extended',
        allow: '/',
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
