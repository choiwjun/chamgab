# Design System

## 참값(Chamgab) 디자인 시스템

---

## 1. 디자인 원칙

| 원칙 | 설명 |
|------|------|
| **신뢰감** | "참값"이라는 브랜드에 맞는 정직하고 신뢰감 있는 디자인 |
| **명확성** | 복잡한 가격 데이터를 직관적으로 표현 |
| **효율성** | 최소 터치로 참값 확인 |
| **일관성** | 웹/앱 동일한 경험 제공 |

---

## 2. 컬러 시스템

### 2.1 Primary Colors

| 용도 | 이름 | Hex | 의미 |
|------|------|-----|------|
| Primary | Deep Blue | `#1E3A5F` | 신뢰, 안정 |
| Primary Light | Light Blue | `#2E5A8F` | 강조 |
| Accent | Gold | `#D4A853` | 가치, 프리미엄 |

### 2.2 Semantic Colors

| 용도 | 이름 | Hex | 사용 예 |
|------|------|-----|---------|
| Success | Green | `#10B981` | 상승, 완료 |
| Warning | Amber | `#F59E0B` | 주의, 경고 |
| Error | Red | `#EF4444` | 하락, 에러 |
| Info | Blue | `#3B82F6` | 정보 |

### 2.3 Neutral Colors

| 용도 | 이름 | Hex |
|------|------|-----|
| Background | White | `#FFFFFF` |
| Surface | Light Gray | `#F8FAFC` |
| Border | Gray | `#E2E8F0` |
| Text Primary | Dark | `#1E293B` |
| Text Secondary | Gray | `#64748B` |
| Text Disabled | Light Gray | `#94A3B8` |

### 2.4 Tailwind 설정

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1E3A5F',
          light: '#2E5A8F',
        },
        accent: {
          DEFAULT: '#D4A853',
        },
        chamgab: {
          up: '#10B981',
          down: '#EF4444',
          neutral: '#64748B',
        }
      }
    }
  }
}
```

---

## 3. 타이포그래피

### 3.1 폰트 패밀리

| 용도 | 폰트 |
|------|------|
| 본문 | Pretendard |
| 숫자 강조 | Pretendard (tabular-nums) |
| 영문 로고 | Pretendard |

### 3.2 폰트 스케일

| 용도 | 크기 | 굵기 | Line Height |
|------|------|------|-------------|
| H1 | 28px | Bold (700) | 1.3 |
| H2 | 24px | Bold (700) | 1.3 |
| H3 | 20px | Semibold (600) | 1.4 |
| H4 | 18px | Semibold (600) | 1.4 |
| Body Large | 16px | Regular (400) | 1.5 |
| Body | 14px | Regular (400) | 1.5 |
| Caption | 12px | Regular (400) | 1.4 |
| **참값 Large** | 32px | Bold (700) | 1.2 |
| **참값 Medium** | 24px | Semibold (600) | 1.2 |

### 3.3 사용 예시

```jsx
// 참값 표시
<div className="text-3xl font-bold text-primary">
  25억 원
</div>
<div className="text-lg text-gray-500">
  (24.5억 ~ 25.5억)
</div>
```

---

## 4. 간격 시스템

### 4.1 Spacing Scale

| 토큰 | 값 | 사용 예 |
|------|-----|---------|
| xs | 4px | 아이콘 내부 |
| sm | 8px | 인라인 요소 간격 |
| md | 16px | 컴포넌트 내부 패딩 |
| lg | 24px | 섹션 간격 |
| xl | 32px | 페이지 섹션 |
| 2xl | 48px | 대형 섹션 |

### 4.2 Container

| 브레이크포인트 | 너비 | 패딩 |
|---------------|------|------|
| Mobile | 100% | 16px |
| Tablet | 100% | 24px |
| Desktop | 1280px | 32px |

---

## 5. 컴포넌트

### 5.1 Button

| 변형 | 스타일 | 사용 예 |
|------|--------|---------|
| Primary | 배경: Primary, 텍스트: White | CTA 버튼 |
| Secondary | 배경: White, 테두리: Primary | 보조 액션 |
| Ghost | 배경: 투명, 텍스트: Primary | 덜 중요한 액션 |
| Danger | 배경: Red, 텍스트: White | 삭제 등 |

```jsx
// Primary Button
<button className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-light transition-colors">
  참값 분석하기
</button>
```

### 5.2 Card

```jsx
// 매물 카드
<div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
  <div className="flex justify-between items-start">
    <div>
      <h3 className="font-semibold text-lg">래미안 블레스티지</h3>
      <p className="text-gray-500 text-sm">강남구 삼성동 · 84㎡</p>
    </div>
    <div className="text-right">
      <p className="text-2xl font-bold text-primary">25억</p>
      <p className="text-sm text-gray-500">참값</p>
    </div>
  </div>
</div>
```

### 5.3 참값 분석 카드 (핵심 컴포넌트)

```jsx
<div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-primary/10">
  {/* 헤더 */}
  <div className="flex items-center gap-2 mb-4">
    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
      <span className="text-primary">📊</span>
    </div>
    <h2 className="font-semibold text-lg">참값 분석 리포트</h2>
  </div>

  {/* 참값 표시 */}
  <div className="text-center py-6">
    <p className="text-sm text-gray-500 mb-1">참값</p>
    <p className="text-4xl font-bold text-primary">25억 원</p>
    <p className="text-gray-500 mt-1">(24.5억 ~ 25.5억)</p>
  </div>

  {/* 신뢰도 바 */}
  <div className="mt-4">
    <div className="flex justify-between text-sm mb-1">
      <span>신뢰도</span>
      <span className="font-semibold text-green-600">94%</span>
    </div>
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full bg-green-500 rounded-full" style="width: 94%"></div>
    </div>
  </div>
</div>
```

### 5.4 가격 요인 아이템

```jsx
<div className="flex items-center gap-4 py-3 border-b border-gray-100">
  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-semibold">
    1
  </div>
  <div className="flex-1">
    <p className="font-medium">지하철역 거리 (도보 3분)</p>
    <p className="text-sm text-gray-500">강남역까지 5분 거리</p>
  </div>
  <div className="text-right">
    <p className="font-semibold text-green-600">+2.1억</p>
  </div>
</div>
```

### 5.5 Input

```jsx
// 검색 입력
<div className="relative">
  <input
    type="text"
    placeholder="지역, 아파트, 상가 검색"
    className="w-full px-4 py-3 pl-12 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
  />
  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400">
    {/* 검색 아이콘 */}
  </svg>
</div>
```

---

## 6. 아이콘

### 6.1 아이콘 라이브러리

- **Lucide React** 사용 (Heroicons 대체)

### 6.2 주요 아이콘

| 용도 | 아이콘 |
|------|--------|
| 검색 | Search |
| 홈 | Home |
| 관심 | Heart / HeartFilled |
| 알림 | Bell |
| 지도 | Map |
| 리스트 | List |
| 필터 | Filter |
| 상승 | TrendingUp |
| 하락 | TrendingDown |
| 정보 | Info |

### 6.3 부동산 유형 아이콘

| 유형 | 이모지 |
|------|--------|
| 전체 | 🏠 |
| 아파트 | 🏢 |
| 오피스텔 | 🏨 |
| 빌라/다세대 | 🏘️ |
| 상가 | 🏪 |
| 토지 | 🌳 |
| 빌딩 | 🏛️ |

---

## 7. 반응형 디자인

### 7.1 브레이크포인트

| 이름 | 너비 | 레이아웃 |
|------|------|----------|
| Mobile | < 640px | 단일 컬럼, 하단 네비 |
| Tablet | 640px ~ 1024px | 2컬럼 가능 |
| Desktop | > 1024px | 사이드바 + 메인 |

### 7.2 네비게이션

| 디바이스 | 구성 |
|----------|------|
| Mobile | 하단 탭 바 (5개 아이콘) |
| Tablet | 좌측 사이드바 (축약) |
| Desktop | 상단 헤더 + 좌측 사이드바 |

---

## 8. 애니메이션

### 8.1 Transition

| 용도 | Duration | Easing |
|------|----------|--------|
| 버튼 hover | 150ms | ease-out |
| 모달 | 200ms | ease-out |
| 페이지 전환 | 300ms | ease-in-out |
| 드롭다운 | 150ms | ease-out |

### 8.2 Loading States

```jsx
// 스켈레톤 UI
<div className="animate-pulse">
  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
</div>

// 참값 분석 로딩
<div className="flex flex-col items-center py-8">
  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
  <p className="mt-4 text-gray-500">참값 분석 중...</p>
</div>
```

---

## 9. 접근성 (a11y)

| 항목 | 기준 |
|------|------|
| 색상 대비 | WCAG 2.1 AA (4.5:1 이상) |
| 포커스 표시 | 모든 인터랙티브 요소에 포커스 링 |
| 키보드 네비게이션 | Tab 순서 논리적 구성 |
| 스크린 리더 | aria-label, role 속성 사용 |
| 터치 타겟 | 최소 44x44px |

---

## 10. 로고 가이드

### 10.1 로고 구성

| 형태 | 사용처 |
|------|--------|
| 로고 (한글) | 참값 |
| 로고 (영문) | Chamgab |
| 심볼 | 저울 + 체크 아이콘 |
| 조합형 | 심볼 + 참값 |

### 10.2 최소 여백

- 로고 높이의 50% 이상 여백 확보

### 10.3 금지 사항

- 로고 비율 변경 금지
- 로고 색상 임의 변경 금지
- 로고 위에 텍스트/이미지 배치 금지
