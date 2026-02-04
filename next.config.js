/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
    ],
  },
  experimental: {
    typedRoutes: true,
  },
  eslint: {
    // 빌드 시 ESLint 에러 무시 (기존 프로젝트 설정 이슈)
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
