# TRD (Technical Requirements Document)

## 참값(Chamgab) 기술 명세

---

## 1. 기술 스택

### Frontend

| 항목 | 기술 | 버전 | 선택 이유 |
|------|------|------|-----------|
| Framework | Next.js | 14+ | App Router, SSR/SSG |
| Language | TypeScript | 5.x | 타입 안전성 |
| Styling | Tailwind CSS | 3.x | 유틸리티 우선 |
| UI Components | shadcn/ui | latest | Radix 기반, 커스텀 용이 |
| State | Zustand + TanStack Query | latest | 서버 상태 분리 |
| Forms | React Hook Form + Zod | latest | 유효성 검증 |
| Charts | Recharts | latest | React 친화적 |
| Maps | Kakao Maps SDK | latest | 국내 최적화 |

### Backend

| 항목 | 기술 | 버전 | 선택 이유 |
|------|------|------|-----------|
| Database | Supabase (PostgreSQL) | latest | RLS, 실시간 |
| Extension | PostGIS | 3.x | 공간 쿼리 |
| Auth | Supabase Auth | latest | 소셜 로그인 |
| Storage | Supabase Storage | latest | 파일 저장 |
| ML API | FastAPI (Python) | 0.100+ | 비동기, ML 친화 |
| ML Model | XGBoost + SHAP | latest | 해석 가능한 ML |
| Cache | Upstash Redis | latest | 서버리스 캐시 |

### Infrastructure

| 항목 | 기술 | 선택 이유 |
|------|------|-----------|
| Frontend Hosting | Vercel | Next.js 최적화 |
| Database | Supabase Cloud | 관리형 PostgreSQL |
| ML API | Railway | Python 배포 용이 |
| Cache | Upstash | 서버리스 Redis |

---

## 2. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        Client                                │
│  (Next.js PWA - Vercel)                                     │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │   Auth   │  │ Database │  │ Storage  │  │ Realtime │    │
│  │          │  │(PostGIS) │  │          │  │          │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              ML API (FastAPI - Railway)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  AVM     │  │  SHAP    │  │  유사도  │                  │
│  │ (XGBoost)│  │  분석    │  │  검색    │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   Upstash Redis                              │
│                    (Cache)                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 데이터 흐름

### 참값 분석 플로우

```
1. 클라이언트 → POST /api/chamgab
2. Edge Function → ML API 호출
3. ML API:
   a. Redis 캐시 확인
   b. 캐시 미스 시 XGBoost 예측
   c. SHAP 요인 분석
   d. 유사 거래 검색
   e. 결과 캐싱 (7일)
4. 응답 → 클라이언트
```

---

## 4. 성능 요구사항

### 응답 시간

| 작업 | 목표 | 측정 |
|------|------|------|
| 검색 결과 | < 500ms | P95 |
| 참값 분석 (캐시) | < 200ms | P95 |
| 참값 분석 (신규) | < 3s | P95 |
| 지도 렌더링 | < 1s | 초기 로드 |

### 가용성

| 지표 | 목표 |
|------|------|
| Uptime | 99.5% |
| RTO | 4시간 |
| RPO | 24시간 |

---

## 5. 보안 요구사항

### 인증/인가

| 항목 | 구현 |
|------|------|
| 비밀번호 | bcrypt (salt rounds: 12) |
| 토큰 | JWT (Access: 1h, Refresh: 7d) |
| 로그인 실패 | 5회 실패 시 15분 잠금 |
| API 키 | SHA-256 해시 저장 |

### 데이터 보호

| 항목 | 구현 |
|------|------|
| 통신 | TLS 1.3 (HTTPS 강제) |
| 개인정보 | AES-256 암호화 |
| DB 접근 | Row Level Security (RLS) |

---

## 6. 확장성

### 수평 확장 포인트

| 컴포넌트 | 확장 방법 |
|----------|-----------|
| Frontend | Vercel 자동 스케일링 |
| API | Railway 인스턴스 추가 |
| Database | Supabase Pro (읽기 복제본) |
| Cache | Upstash 클러스터 |

### 예상 트래픽

| 단계 | MAU | 동시 접속 | API 호출/일 |
|------|-----|-----------|-------------|
| MVP | 1K | 50 | 10K |
| Phase 2 | 10K | 500 | 100K |
| Phase 3 | 100K | 5K | 1M |

---

## 7. 외부 연동

### 공공 데이터 API

| 데이터 | 출처 | 갱신 주기 |
|--------|------|-----------|
| 실거래가 | 국토부 | 일 1회 |
| 건축물대장 | 공공데이터포털 | 주 1회 |
| 학교 정보 | 학교알리미 | 월 1회 |
| 지하철/버스 | 서울 열린데이터 | 월 1회 |

### 결제

| 항목 | 선택 |
|------|------|
| PG사 | Toss Payments |
| 구독 관리 | 자체 구현 (Supabase) |

---

## 8. 모니터링

### 도구

| 영역 | 도구 |
|------|------|
| 에러 추적 | Sentry |
| 애플리케이션 성능 | Vercel Analytics |
| 사용자 행동 | Mixpanel |
| 업타임 | Better Uptime |

### 알림

| 이벤트 | 채널 | 임계값 |
|--------|------|--------|
| 에러율 증가 | Slack | > 1% |
| 응답 시간 증가 | Slack | P95 > 3s |
| 서버 다운 | Slack + SMS | 즉시 |

---

## 9. 개발 환경

### 로컬 개발

```bash
# 의존성 설치
pnpm install

# 환경 변수
cp .env.example .env.local

# 개발 서버
pnpm dev

# 타입 체크
pnpm type-check

# 린트
pnpm lint
```

### CI/CD

| 단계 | 도구 | 트리거 |
|------|------|--------|
| Lint/Test | GitHub Actions | PR |
| Preview | Vercel | PR |
| Production | Vercel | main merge |
