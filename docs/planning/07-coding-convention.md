# Coding Convention

## 참값(Chamgab) 코딩 컨벤션

---

## 1. 프로젝트 구조

```
chamgab/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # 인증 관련 라우트 그룹
│   │   │   ├── login/
│   │   │   └── signup/
│   │   ├── (main)/             # 메인 라우트 그룹
│   │   │   ├── page.tsx        # 홈
│   │   │   ├── search/
│   │   │   ├── property/[id]/
│   │   │   ├── compare/
│   │   │   └── favorites/
│   │   ├── api/                # API Routes
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                 # shadcn/ui 컴포넌트
│   │   ├── features/           # 도메인별 컴포넌트
│   │   │   ├── chamgab/        # 참값 분석 관련
│   │   │   ├── property/       # 매물 관련
│   │   │   └── search/         # 검색 관련
│   │   └── layout/             # 레이아웃 컴포넌트
│   ├── hooks/                  # Custom Hooks
│   ├── lib/                    # 유틸리티
│   │   ├── supabase/           # Supabase 클라이언트
│   │   ├── api/                # API 클라이언트
│   │   └── utils/              # 헬퍼 함수
│   ├── stores/                 # Zustand 스토어
│   ├── types/                  # TypeScript 타입
│   └── constants/              # 상수
├── public/
├── tests/
└── ml-api/                     # FastAPI (Python)
    ├── app/
    │   ├── api/
    │   ├── models/
    │   └── services/
    └── tests/
```

---

## 2. 네이밍 컨벤션

### 2.1 파일명

| 유형 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 | PascalCase | `ChamgabCard.tsx` |
| 훅 | camelCase (use 접두사) | `useChamgab.ts` |
| 유틸리티 | camelCase | `formatPrice.ts` |
| 상수 | camelCase | `propertyTypes.ts` |
| 타입 | camelCase | `property.ts` |

### 2.2 변수/함수

| 유형 | 규칙 | 예시 |
|------|------|------|
| 변수 | camelCase | `chamgabPrice` |
| 상수 | UPPER_SNAKE_CASE | `MAX_ANALYSIS_COUNT` |
| 함수 | camelCase (동사 시작) | `fetchChamgab()` |
| 컴포넌트 | PascalCase | `ChamgabCard` |
| 타입/인터페이스 | PascalCase | `ChamgabAnalysis` |

### 2.3 CSS 클래스

- Tailwind CSS 유틸리티 클래스 사용
- 커스텀 클래스: kebab-case

---

## 3. TypeScript

### 3.1 타입 정의

```typescript
// types/property.ts

// 부동산 유형
export type PropertyType =
  | 'apt'       // 아파트
  | 'officetel' // 오피스텔
  | 'villa'     // 빌라
  | 'store'     // 상가
  | 'land'      // 토지
  | 'building'; // 빌딩

// 매물 인터페이스
export interface Property {
  id: string;
  propertyType: PropertyType;
  name: string;
  address: string;
  sido: string;
  sigungu: string;
  location: {
    lat: number;
    lng: number;
  };
  areaExclusive: number;
  builtYear: number;
  floors?: number;
  complexId?: string;
}

// 참값 분석 결과
export interface ChamgabAnalysis {
  id: string;
  propertyId: string;
  chamgabPrice: number;
  minPrice: number;
  maxPrice: number;
  confidence: number;
  confidenceLevel: 'very_high' | 'high' | 'medium' | 'low';
  factors: PriceFactor[];
  similarTransactions: Transaction[];
  analyzedAt: string;
  validUntil: string;
}

// 가격 요인
export interface PriceFactor {
  rank: number;
  name: string;
  category: string;
  value: string;
  contribution: number;
  contributionPct: number;
  direction: 'positive' | 'negative';
  description: string;
}
```

### 3.2 API 응답 타입

```typescript
// types/api.ts

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    page: number;
    limit: number;
    total: number;
  };
}

// 사용 예시
type ChamgabResponse = ApiResponse<ChamgabAnalysis>;
```

---

## 4. React 컴포넌트

### 4.1 컴포넌트 구조

```tsx
// components/features/chamgab/ChamgabCard.tsx

import { cn } from '@/lib/utils';
import type { ChamgabAnalysis } from '@/types/property';

interface ChamgabCardProps {
  analysis: ChamgabAnalysis;
  className?: string;
  showFactors?: boolean;
}

export function ChamgabCard({
  analysis,
  className,
  showFactors = true,
}: ChamgabCardProps) {
  const { chamgabPrice, minPrice, maxPrice, confidence } = analysis;

  return (
    <div className={cn('rounded-2xl bg-white p-6 shadow-lg', className)}>
      <h2 className="text-lg font-semibold">참값 분석 리포트</h2>

      <div className="mt-4 text-center">
        <p className="text-4xl font-bold text-primary">
          {formatPrice(chamgabPrice)}
        </p>
        <p className="text-gray-500">
          ({formatPrice(minPrice)} ~ {formatPrice(maxPrice)})
        </p>
      </div>

      <ConfidenceBar confidence={confidence} />

      {showFactors && <FactorList factors={analysis.factors} />}
    </div>
  );
}
```

### 4.2 훅 사용

```tsx
// hooks/useChamgab.ts

import { useQuery, useMutation } from '@tanstack/react-query';
import { chamgabApi } from '@/lib/api/chamgab';

export function useChamgab(propertyId: string) {
  return useQuery({
    queryKey: ['chamgab', propertyId],
    queryFn: () => chamgabApi.getAnalysis(propertyId),
    staleTime: 1000 * 60 * 5, // 5분
  });
}

export function useChamgabAnalyze() {
  return useMutation({
    mutationFn: chamgabApi.analyze,
    onSuccess: (data) => {
      // 캐시 업데이트
    },
  });
}
```

---

## 5. API 클라이언트

### 5.1 Supabase 클라이언트

```typescript
// lib/supabase/client.ts

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### 5.2 API 래퍼

```typescript
// lib/api/chamgab.ts

import { createClient } from '@/lib/supabase/client';

export const chamgabApi = {
  async getAnalysis(propertyId: string) {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('chamgab_analyses')
      .select(`
        *,
        price_factors (*)
      `)
      .eq('property_id', propertyId)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data;
  },

  async analyze(params: ChamgabAnalyzeParams) {
    const response = await fetch('/api/chamgab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('Analysis failed');
    }

    return response.json();
  },
};
```

---

## 6. 스타일 가이드

### 6.1 Tailwind 클래스 순서

```tsx
// 권장 순서
<div className={cn(
  // 1. 레이아웃
  'flex items-center justify-between',
  // 2. 크기
  'w-full h-12',
  // 3. 여백
  'p-4 mx-auto',
  // 4. 배경/테두리
  'bg-white rounded-lg border border-gray-200',
  // 5. 텍스트
  'text-lg font-semibold text-gray-900',
  // 6. 효과
  'shadow-sm hover:shadow-md transition-shadow',
  // 7. 조건부
  className
)}>
```

### 6.2 반응형

```tsx
// Mobile First
<div className="
  p-4          // 기본 (모바일)
  md:p-6       // 태블릿
  lg:p-8       // 데스크톱
">
```

---

## 7. 에러 처리

### 7.1 API 에러

```typescript
// lib/errors.ts

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// 사용
throw new ApiError('RATE_LIMIT_EXCEEDED', '일일 분석 한도 초과', 429);
```

### 7.2 에러 바운더리

```tsx
// components/ErrorBoundary.tsx

'use client';

import { useEffect } from 'react';

export function ErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <h2 className="text-xl font-semibold">오류가 발생했습니다</h2>
      <button onClick={reset} className="mt-4 btn-primary">
        다시 시도
      </button>
    </div>
  );
}
```

---

## 8. 테스트

### 8.1 단위 테스트

```typescript
// tests/utils/formatPrice.test.ts

import { formatPrice } from '@/lib/utils/formatPrice';

describe('formatPrice', () => {
  it('억 단위로 포맷', () => {
    expect(formatPrice(2500000000)).toBe('25억');
  });

  it('억+만 단위로 포맷', () => {
    expect(formatPrice(2550000000)).toBe('25억 5,000만');
  });
});
```

### 8.2 컴포넌트 테스트

```tsx
// tests/components/ChamgabCard.test.tsx

import { render, screen } from '@testing-library/react';
import { ChamgabCard } from '@/components/features/chamgab/ChamgabCard';

describe('ChamgabCard', () => {
  it('참값 표시', () => {
    const analysis = {
      chamgabPrice: 2500000000,
      confidence: 0.94,
      // ...
    };

    render(<ChamgabCard analysis={analysis} />);

    expect(screen.getByText('25억')).toBeInTheDocument();
    expect(screen.getByText('94%')).toBeInTheDocument();
  });
});
```

---

## 9. Git 컨벤션

### 9.1 브랜치 전략

| 브랜치 | 용도 |
|--------|------|
| `main` | 프로덕션 |
| `develop` | 개발 통합 |
| `feature/*` | 기능 개발 |
| `fix/*` | 버그 수정 |
| `hotfix/*` | 긴급 수정 |

### 9.2 커밋 메시지

```
<type>(<scope>): <subject>

[body]

[footer]
```

| Type | 설명 |
|------|------|
| feat | 새 기능 |
| fix | 버그 수정 |
| docs | 문서 |
| style | 포맷팅 |
| refactor | 리팩토링 |
| test | 테스트 |
| chore | 기타 |

예시:
```
feat(chamgab): 참값 분석 API 연동

- 참값 분석 요청 API 구현
- 결과 캐싱 로직 추가
- 에러 처리 개선

Closes #123
```

---

## 10. 환경 변수

```env
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ML API
ML_API_URL=

# Kakao Maps
NEXT_PUBLIC_KAKAO_MAP_KEY=

# 결제
TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
```
