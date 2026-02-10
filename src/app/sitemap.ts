import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://chamgab.vercel.app'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/search`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/land`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/compare`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/terms/service`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/terms/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ]

  // 동적 페이지: 단지 상세
  let complexPages: MetadataRoute.Sitemap = []
  try {
    const { data: complexes } = await supabase
      .from('complexes')
      .select('id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5000)

    if (complexes) {
      complexPages = complexes.map((c) => ({
        url: `${SITE_URL}/complex/${c.id}`,
        lastModified: c.updated_at ? new Date(c.updated_at) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))
    }
  } catch {
    // Supabase 연결 실패 시 정적 페이지만 반환
  }

  return [...staticPages, ...complexPages]
}
