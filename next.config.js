/** @type {import('next').NextConfig} */
const nextConfig = {
  // 이미지 최적화
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
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // 압축 활성화
  compress: true,

  // SWC minify (기본값이지만 명시적으로)
  swcMinify: true,

  // Experimental features
  experimental: {
    typedRoutes: true,
  },

  // PoweredByHeader 제거 (보안)
  poweredByHeader: false,

  // ESLint 설정
  eslint: {
    ignoreDuringBuilds: true,
  },

  // 성능 최적화: 외부 패키지 최적화
  transpilePackages: ['lucide-react', 'recharts'],
}

module.exports = nextConfig
