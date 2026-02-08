# 성능 최적화 가이드

## 적용된 최적화

### 1. React Query 캐싱 전략

**파일**: `src/components/providers.tsx`

```typescript
- staleTime: 5분 (데이터를 fresh 상태로 유지)
- gcTime: 30분 (캐시 유지 시간)
- refetchOnWindowFocus: false (윈도우 포커스 시 자동 리페치 비활성화)
- retry: 1 (빠른 에러 표시)
```

**효과**: 불필요한 API 호출 감소, 사용자 경험 향상

---

### 2. Next.js 설정 최적화

**파일**: `next.config.js`

#### 이미지 최적화

- AVIF, WebP 포맷 지원
- 반응형 이미지 사이즈 설정
- Device-specific image sizes

#### 압축 및 번들링

- Gzip/Brotli 압축 활성화
- SWC minify 활성화
- 외부 패키지 트랜스파일 (lucide-react, recharts)

#### 보안

- X-Powered-By 헤더 제거

---

### 3. 코드 스플리팅 (Dynamic Import)

**파일**: `src/app/business-analysis/result/page.tsx`

모든 큰 분석 컴포넌트를 lazy load:

- SuccessProbabilityCard
- DistrictCharacteristicsCard
- PeakHoursAnalysis
- DemographicsAnalysis
- WeekendAnalysis
- ProfileAnalysis
- CompetitionAnalysis
- GrowthPotential
- IndustryRecommendation

**효과**: 초기 번들 크기 감소, 페이지 로드 속도 향상

---

## Lighthouse 목표

### 목표 점수

- Performance: 90+
- Accessibility: 90+
- Best Practices: 90+
- SEO: 90+

### 측정 방법

```bash
# 프로덕션 빌드
npm run build
npm start

# Chrome DevTools > Lighthouse
# - Mode: Desktop/Mobile
# - Categories: All
```

---

## 추가 최적화 가능 항목

### 1. 이미지 최적화

- [ ] 모든 이미지를 `next/image` 사용
- [ ] 적절한 width/height 설정
- [ ] priority 속성 활용 (LCP 이미지)

### 2. 폰트 최적화

- [ ] `next/font`로 웹폰트 로드
- [ ] font-display: swap 설정
- [ ] 폰트 서브셋 사용

### 3. API 최적화

- [ ] Server Components 활용 (가능한 경우)
- [ ] Streaming SSR
- [ ] ISR (Incremental Static Regeneration)

### 4. 번들 최적화

- [ ] webpack-bundle-analyzer로 번들 분석
- [ ] tree-shaking 확인
- [ ] 중복 dependency 제거

---

## 모니터링

### 프로덕션 성능 모니터링

- Vercel Analytics
- Google Analytics (Core Web Vitals)
- Sentry Performance Monitoring

### 주요 지표

- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1
- **TTFB** (Time to First Byte): < 600ms
- **FCP** (First Contentful Paint): < 1.8s

---

## 참고 문서

- [Next.js Performance Optimization](https://nextjs.org/docs/app/building-your-application/optimizing)
- [React Query Performance](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [Web.dev Performance](https://web.dev/performance/)
