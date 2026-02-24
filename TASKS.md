# TASKS.md - 참값(Chamgab) 개발 태스크

> **Domain-Guarded 구조**: Resource 태스크(P{N}-R{M})와 Screen 태스크(P{N}-S{M})를 분리
> **TDD 워크플로우**: Phase 1+ 태스크는 RED → GREEN → REFACTOR 순서

---

## Phase 0: 프로젝트 셋업

### P0-T0.1: 프로젝트 초기화 ✅

- [x] Next.js 14 (App Router) 프로젝트 생성
- [x] TypeScript 5.x 설정
- [x] npm 패키지 매니저 설정
- [x] 디렉토리 구조 생성 (`src/app`, `src/components`, `src/lib`, `src/hooks`)

### P0-T0.2: 개발 환경 설정 ✅

- [x] ESLint + Prettier 설정
- [x] ~~Husky + lint-staged 설정~~ (스킵 - CI에서 검증)
- [x] `.env.example` 생성
- [x] Git 저장소 초기화

### P0-T0.3: 기본 의존성 설치 ✅

- [x] Tailwind CSS 3.x 설치 및 설정
- [x] shadcn/ui 초기화 (`components.json` 설정, `cn()` 유틸리티)
- [x] Zustand 설치
- [x] TanStack Query 설치
- [x] React Hook Form + Zod 설치

### P0-T0.4: Supabase 설정 ✅

- [x] Supabase 프로젝트 생성
- [x] 환경 변수 설정 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- [x] Supabase 클라이언트 설정 (`src/lib/supabase.ts`)
- [x] PostGIS 확장 활성화

### P0-T0.5: 추가 의존성 설치 ✅

> **출처**: 02-trd.md, 05-design-system.md

- [x] Recharts 설치 (차트 라이브러리)
- [x] Lucide React 설치 (아이콘)
- [x] Pretendard 웹폰트 설정 (`src/app/layout.tsx`)
- [x] next-themes 설치 (다크모드 - ThemeProvider, ThemeToggle 컴포넌트, CSS 변수)

### P0-T0.6: 디자인 시스템 설정 ✅

> **출처**: 05-design-system.md

- [x] Tailwind 커스텀 컬러 설정
- [x] 디자인 토큰 상수 생성 (`src/constants/design-tokens.ts`)
- [x] 폰트 스케일 설정 (H1~Caption, 참값 Large/Medium)

### P0-T0.7: 외부 서비스 설정 ✅

> **출처**: 02-trd.md, 07-coding-convention.md

- [x] Kakao Developers 앱 생성
- [x] 환경 변수 추가 (.env.example)
- [x] Upstash Redis 프로젝트 생성
- [x] Redis 클라이언트 설정

### P0-T0.8: CI/CD 설정 ✅

> **출처**: 02-trd.md

- [x] GitHub Actions 워크플로우 작성
  - `.github/workflows/lint.yml` - ESLint + TypeScript 체크
  - `.github/workflows/test.yml` - 단위/통합 테스트
- [x] Vercel 프로젝트 연결 (`vercel.json`)
- [x] main 브랜치 보호 규칙 설정
- [x] Preview 배포 설정

### P0-T0.9: 모니터링 설정 ✅

> **출처**: 02-trd.md

- [x] Sentry 설치 및 설정
- [x] Vercel Analytics 활성화
- [x] 환경 변수 추가 (`NEXT_PUBLIC_SENTRY_DSN`)

---

## Phase 1: 공통 기반

### P1-R1: Auth Resource (Backend) ✅

> **TDD**: 테스트 먼저 작성

#### P1-R1-T1: Supabase Auth 설정 ✅

- [x] RED: Auth 테스트 작성 (`__tests__/auth.test.ts`)
- [x] GREEN: Supabase Auth Provider 설정
- [x] GREEN: 소셜 로그인 설정 (Google, Kakao, Naver)
- [x] REFACTOR: 에러 핸들링 개선

#### P1-R1-T2: Auth API Routes ✅

- [x] RED: API Route 테스트 작성
- [x] GREEN: `POST /api/auth/signup` - 이메일 회원가입
- [x] GREEN: `POST /api/auth/login` - 이메일 로그인
- [x] GREEN: `GET /api/auth/check-email` - 이메일 중복 확인
- [x] REFACTOR: 에러 응답 표준화

#### P1-R1-T3: Auth Middleware ✅

- [x] RED: Middleware 테스트 작성
- [x] GREEN: 인증 미들웨어 구현 (`src/middleware.ts`)
- [x] GREEN: 보호된 라우트 설정
- [x] REFACTOR: 토큰 갱신 로직

### P1-S0: 공통 레이아웃 (Frontend) ✅

> **참조**: `specs/shared/components.yaml`

#### P1-S0-T1: 레이아웃 컴포넌트 ✅

- [x] `src/components/layout/Header.tsx` - 공통 헤더
- [x] `src/components/layout/BottomTabBar.tsx` - 모바일 하단 탭
- [x] `src/components/layout/RootLayout.tsx` - 루트 레이아웃
- [x] 반응형 스타일 적용

#### P1-S0-T2: 공통 UI 컴포넌트 ✅

- [x] shadcn/ui 컴포넌트 설치 (Button, Card, Input, Dialog 등)
- [x] `src/components/ui/Toast.tsx` - 토스트 알림
- [x] `src/components/ui/Modal.tsx` - 모달 다이얼로그
- [x] `src/components/ui/BottomSheet.tsx` - 하단 시트

#### P1-S0-T3: Auth 상태 관리 ✅

- [x] `src/stores/authStore.ts` - Zustand 스토어
- [x] `src/hooks/useAuth.ts` - Auth 훅
- [x] `src/providers/AuthProvider.tsx` - Auth Context

---

## Phase 2: 핵심 기능 (MVP)

### P2-R0: Complexes Resource (Backend) ✅

> **출처**: 04-database-design.md - 아파트 단지 정보

#### P2-R0-T1: Complexes 테이블 생성 ✅

- [x] RED: 스키마 테스트 작성
- [x] GREEN: Supabase Migration 작성
- [x] GREEN: 시드 데이터 (서울시 주요 아파트 단지)
- [x] REFACTOR: 공간 인덱스 생성

### P2-R1: Properties Resource (Backend) ✅

> **참조**: `specs/domain/resources.yaml#properties`

#### P2-R1-T1: Properties 테이블 생성 ✅

- [x] RED: 스키마 테스트 작성
- [x] GREEN: Supabase Migration 작성
- [x] GREEN: PostGIS 인덱스 생성
- [x] REFACTOR: RLS 정책 설정

#### P2-R1-T2: Properties API ✅

- [x] RED: API 테스트 작성
- [x] GREEN: `GET /api/properties` - 매물 목록 (필터, 페이지네이션)
- [x] GREEN: `GET /api/properties/:id` - 매물 상세
- [x] GREEN: `GET /api/properties/autocomplete` - 검색 자동완성
- [x] REFACTOR: 응답 캐싱

### P2-R2: Regions Resource (Backend) ✅

> **참조**: `specs/domain/resources.yaml#regions`

#### P2-R2-T1: Regions 테이블 생성 ✅

- [x] RED: 스키마 테스트 작성
- [x] GREEN: Supabase Migration 작성
- [x] GREEN: 시도/시군구/읍면동 시드 데이터 삽입
- [x] REFACTOR: 계층 쿼리 최적화

#### P2-R2-T2: Regions API ✅

- [x] RED: API 테스트 작성
- [x] GREEN: `GET /api/regions` - 지역 목록 (계층)
- [x] GREEN: `GET /api/regions/trends` - 가격 트렌드
- [x] REFACTOR: 트렌드 데이터 캐싱 (Redis)

### P2-R3: Popular Searches Resource (Backend) ✅

> **참조**: `specs/domain/resources.yaml#popular_searches`

#### P2-R3-T1: Popular Searches API ✅

- [x] RED: API 테스트 작성
- [x] GREEN: `GET /api/search/popular` - 인기 검색어 목록
- [x] GREEN: 검색어 집계 로직 (Redis 캐시)
- [x] REFACTOR: 실시간 업데이트

### P2-S1: 홈 화면 (Frontend) ✅

> **참조**: `specs/screens/home.yaml`
> **의존성**: P2-R1, P2-R2, P2-R3

#### P2-S1-T1: 홈 페이지 라우트 ✅

- [x] `src/app/page.tsx` - 홈 페이지
- [x] 데이터 페칭 (Server Components)

#### P2-S1-T2: Hero 섹션 ✅

- [x] `src/components/home/HeroSection.tsx`
- [x] `src/components/home/SearchBar.tsx` - 검색 자동완성
- [x] 디바운스 300ms, 2자 이상 트리거

#### P2-S1-T3: 가격 트렌드 섹션 ✅

- [x] `src/components/home/PriceTrends.tsx`
- [x] `src/components/home/TrendCard.tsx`
- [x] 지역별 주간 변동률 표시 (Recharts 활용)

#### P2-S1-T4: 인기 매물 섹션 ✅

- [x] `src/components/home/PopularProperties.tsx`
- [x] `src/components/common/PropertyCard.tsx` - 재사용 가능
- [x] 가로 스크롤 리스트

#### P2-S1-V: 홈 화면 검증 ✅

- [x] E2E 테스트: 초기 로드 시 모든 섹션 표시
- [x] E2E 테스트: 검색 자동완성 동작
- [x] E2E 테스트: 매물 카드 클릭 → 상세 페이지 이동

### P2-S2: 검색 결과 - 리스트 (Frontend) ✅

> **참조**: `specs/screens/search-list.yaml`
> **의존성**: P2-R1, P2-R2

#### P2-S2-T1: 검색 페이지 라우트 ✅

- [x] `src/app/search/page.tsx`
- [x] URL 쿼리 파라미터 파싱
- [x] TanStack Query로 데이터 페칭

#### P2-S2-T2: 필터 컴포넌트 ✅

- [x] `src/components/search/FilterBar.tsx`
- [x] `src/components/search/RegionFilter.tsx` - 계층형 드롭다운
- [x] `src/components/search/PriceRangeSlider.tsx`
- [x] URL 쿼리 파라미터 동기화

#### P2-S2-T3: 매물 리스트 ✅

- [x] `src/components/search/PropertyList.tsx`
- [x] 무한 스크롤 (Intersection Observer)
- [x] 정렬 드롭다운

#### P2-S2-T4: 뷰 전환 ✅

- [x] `src/components/search/ViewToggle.tsx`
- [x] 리스트/지도 토글 (필터 유지)

#### P2-S2-V: 검색 리스트 검증 ✅

- [x] E2E 테스트: 필터 적용 시 URL 업데이트
- [x] E2E 테스트: 무한 스크롤 동작
- [x] E2E 테스트: 지도 뷰 전환 (필터 유지)

### P2-S3: 검색 결과 - 지도 (Frontend) ✅

> **참조**: `specs/screens/search-map.yaml`
> **의존성**: P2-R1

#### P2-S3-T1: 지도 페이지 라우트 ✅

- [x] `src/app/search/map/page.tsx`
- [x] Kakao Maps SDK 스크립트 로드 (`NEXT_PUBLIC_KAKAO_MAP_KEY` 활용)

#### P2-S3-T2: 지도 컴포넌트 ✅

- [x] `src/components/map/KakaoMap.tsx`
- [x] 클러스터링 로직 (줌 레벨별)
- [x] 마커 렌더링

#### P2-S3-T3: 매물 프리뷰 ✅

- [x] `src/components/map/PropertyPreview.tsx` - 하단 시트
- [x] 마커 클릭 시 프리뷰 표시

#### P2-S3-V: 검색 지도 검증 ✅

- [x] E2E 테스트: 지도 초기 로드
- [x] E2E 테스트: 줌 레벨별 클러스터링
- [x] E2E 테스트: 마커 클릭 → 프리뷰 표시

---

## Phase 3: 참값 분석 (핵심 기능)

### P3-ML: ML API 개발 (FastAPI) ✅

> **출처**: 02-trd.md - 핵심 기능!
> **기술**: FastAPI + XGBoost + SHAP

#### P3-ML-T1: FastAPI 프로젝트 셋업 ✅

- [x] `ml-api/` 폴더 구조 생성
- [x] FastAPI + uvicorn 설정
- [x] CORS 설정 (Next.js 도메인 허용)
- [x] 헬스체크 엔드포인트 (`GET /health`)

#### P3-ML-T2: XGBoost 모델 API ✅

- [x] 모델 파일 로드 (`models/xgboost_model.pkl`)
- [x] `POST /predict` 엔드포인트
- [x] 입력 검증 (Pydantic)
- [x] KB부동산 데이터 기반 학습 (MAPE 5.50%, R² 0.9917)

#### P3-ML-T3: SHAP 분석 API ✅

- [x] SHAP explainer 설정
- [x] `GET /factors/{analysis_id}` 엔드포인트
- [x] 요인 해석 로직 (한글 변환)

#### P3-ML-T4: 유사 거래 API ✅

- [x] 유사도 계산 알고리즘 (거리, 면적, 년식 기반)
- [x] `GET /similar/{property_id}` 엔드포인트
- [x] PostGIS 공간 쿼리 연동

#### P3-ML-T5: Railway 배포 ✅

- [x] `railway.toml` 설정
- [x] 환경 변수 설정
- [x] 배포 및 도메인 설정
- [x] Next.js에서 ML API URL 연결 (`vercel.json` rewrite)

#### P3-ML-T6: 주변환경(POI) 피처 추가 ✅

> **출처**: Kakao Local API 활용

- [x] POI 데이터 수집 서비스 (`app/services/poi_service.py`)
- [x] Feature Engineering에 12개 POI 피처 추가
- [x] SHAP 한글명/카테고리 매핑 (교통, 교육, 생활)
- [x] 학습 데이터 생성기에 POI 피처 반영
- [x] ModelService 추론 시 POI 피처 지원

**추가된 피처 (12개)**:
| 카테고리 | 피처 |
|----------|------|
| 교통 | 지하철역 거리, 지하철역 수(1km) |
| 교육 | 학교 거리, 학교 수(1km), 학원가 거리, 학원 수(1km) |
| 생활 | 병원 거리, 병원 수(1km), 대형마트 거리, 편의점 수(500m), 공원 거리 |
| 종합 | 입지 점수 |

#### P3-ML-T7: 시장 지표 및 매물 특성 피처 추가 ✅

> **출처**: KB부동산 데이터 + 도메인 지식

- [x] 시장 지표 서비스 (`app/services/market_service.py`)
- [x] 매물 특성 서비스 (`app/services/property_features_service.py`)
- [x] Feature Engineering에 18개 추가 피처 통합
- [x] SHAP 한글명/카테고리 매핑 확장
- [x] 학습 데이터 생성기 업데이트
- [x] ModelService 추론 지원

**추가된 피처 (18개)**:
| 카테고리 | 피처 | 설명 |
|----------|------|------|
| 시장 | 기준금리 | 한국은행 기준금리 (%) |
| 시장 | 주담대금리 | 주택담보대출 금리 (%) |
| 시장 | 전세가율 | 매매가 대비 전세가 비율 (%) |
| 시장 | 매수우위지수 | 100 기준, 높을수록 매수 우위 |
| 시장 | 거래량 | 월별 거래량 (계절성 반영) |
| 시장 | 가격변동률 | 전월 대비 변동률 (%) |
| 재건축 | 구축여부 | 20년 이상 여부 |
| 재건축 | 재건축대상 | 30년 이상 여부 |
| 재건축 | 재건축프리미엄 | 재건축 기대감 프리미엄 |
| 교육 | 학군등급 | 지역별 학군 등급 (1~5) |
| 교육 | 명문학군여부 | 4등급 이상 여부 |
| 가격비교 | 직전거래대비 | 직전 거래가 대비 비율 |
| 가격비교 | 단지평균대비 | 단지 평균가 대비 비율 |
| 가격비교 | 지역평균대비 | 지역 평균가 대비 비율 |
| 매물특성 | 향프리미엄 | 남향 기준 방향 프리미엄 |
| 매물특성 | 뷰프리미엄 | 한강뷰/공원뷰 등 조망 프리미엄 |
| 매물특성 | 리모델링여부 | 올수리/풀옵션 등 리모델링 여부 |
| 매물특성 | 리모델링프리미엄 | 리모델링 시 프리미엄 |

**총 피처 수**: 13 (기존) + 12 (POI) + 18 (시장/매물) = **43개**

### P3-R1: Chamgab Analyses Resource (Backend) ✅

> **참조**: `specs/domain/resources.yaml#chamgab_analyses`
> **의존성**: P3-ML (ML API 필요)

#### P3-R1-T1: Chamgab 테이블 생성 ✅

- [x] RED: 스키마 테스트 작성
- [x] GREEN: Supabase Migration 작성
- [x] GREEN: 조회 제한 로직 (user tier별)
- [x] REFACTOR: 캐싱 전략 (Redis)

#### P3-R1-T2: Chamgab API ✅

- [x] RED: API 테스트 작성
- [x] GREEN: `GET /api/chamgab/:property_id` - 분석 결과 조회
- [x] GREEN: `POST /api/chamgab` - 분석 요청 (→ ML API 호출)
- [x] GREEN: Rate Limiting (guest: 3/day, free: 10/day)
- [x] REFACTOR: 에러 핸들링

### P3-R2: Price Factors Resource (Backend) ✅

> **참조**: `specs/domain/resources.yaml#price_factors`

#### P3-R2-T1: Price Factors 테이블 생성 ✅

- [x] RED: 스키마 테스트 작성
- [x] GREEN: Supabase Migration 작성
- [x] REFACTOR: 인덱스 최적화

#### P3-R2-T2: Price Factors API ✅

- [x] RED: API 테스트 작성
- [x] GREEN: `GET /api/chamgab/:analysis_id/factors` - 요인 목록
- [x] GREEN: Tier별 제한 (free: 5개, premium: 10개)
- [x] REFACTOR: 응답 포맷 최적화

### P3-R3: Transactions Resource (Backend) ✅

> **참조**: `specs/domain/resources.yaml#transactions`

#### P3-R3-T1: Transactions 테이블 생성 ✅

- [x] RED: 스키마 테스트 작성
- [x] GREEN: Supabase Migration 작성
- [x] GREEN: KB부동산 데이터 연동 (PublicDataReader)
- [x] REFACTOR: 일일 배치 업데이트

#### P3-R3-T2: Transactions API ✅

- [x] RED: API 테스트 작성
- [x] GREEN: `GET /api/transactions` - 거래 목록
- [x] GREEN: `GET /api/properties/:id/similar` - 유사 거래 조회
- [x] REFACTOR: 유사도 계산 최적화

### P3-R4: Favorites Resource (Backend) ✅

> **참조**: `specs/domain/resources.yaml#favorites`

#### P3-R4-T1: Favorites 테이블 생성 ✅

- [x] RED: 스키마 테스트 작성
- [x] GREEN: Supabase Migration 작성
- [x] GREEN: RLS 정책 (user_id = auth.uid())
- [x] REFACTOR: 인덱스 최적화

#### P3-R4-T2: Favorites API ✅

- [x] RED: API 테스트 작성
- [x] GREEN: `GET /api/favorites` - 관심 매물 목록
- [x] GREEN: `POST /api/favorites` - 관심 매물 추가
- [x] GREEN: `DELETE /api/favorites/:id` - 관심 매물 삭제
- [x] REFACTOR: 중복 방지 로직

### P3-S4: 매물 상세 (Frontend) ✅

> **참조**: `specs/screens/property-detail.yaml`
> **의존성**: P2-R1, P3-R1, P3-R2, P3-R3, P3-R4, P3-ML

#### P3-S4-T1: 매물 상세 페이지 라우트 ✅

- [x] `src/app/property/[id]/page.tsx`
- [x] Server Components로 초기 데이터 로드
- [x] 동적 메타데이터

#### P3-S4-T2: 이미지 갤러리 ✅

- [x] `src/components/property/ImageGallery.tsx`
- [x] 스와이프, 인디케이터
- [x] Lightbox 모달

#### P3-S4-T3: 참값 분석 카드 ✅

- [x] `src/components/property/ChamgabCard.tsx`
- [x] 가격 범위 표시 (min ~ max)
- [x] 신뢰도 프로그레스 바
- [x] 분석일/유효기간 표시
- [x] Empty States (guest, limit_reached)

#### P3-S4-T4: 가격 요인 리스트 ✅

- [x] `src/components/property/PriceFactors.tsx`
- [x] 순위별 표시
- [x] 프리미엄 업셀 (5개 → 10개)

#### P3-S4-T5: 유사 거래 테이블 ✅

- [x] `src/components/property/SimilarTransactions.tsx`
- [x] 정렬 가능 테이블
- [x] 유사도 표시

#### P3-S4-T6: 입지 분석 지도 ✅

- [x] `src/components/property/LocationMap.tsx`
- [x] POI 마커 (지하철, 학교, 공원, 병원)

#### P3-S4-T7: CTA 버튼 ✅

- [x] 관심 매물 저장 버튼 (토글)
- [x] 비교하기 추가 버튼
- [x] 로그인 리다이렉트 처리

#### P3-S4-V: 매물 상세 검증 ✅

- [x] E2E 테스트: 기본 정보 로드
- [x] E2E 테스트: 참값 분석 카드 표시 (로그인 시)
- [x] E2E 테스트: 비회원 조회 제한 (3회)
- [x] E2E 테스트: 무료회원 한도 초과 모달
- [x] E2E 테스트: 관심 매물 저장

### P3-S5: 로그인 (Frontend) ✅

> **참조**: `specs/screens/auth-login.yaml`
> **의존성**: P1-R1

#### P3-S5-T1: 로그인 페이지 라우트 ✅

- [x] `src/app/auth/login/page.tsx`
- [x] redirect 파라미터 처리

#### P3-S5-T2: 로그인 폼 ✅

- [x] `src/components/auth/LoginForm.tsx`
- [x] 소셜 로그인 버튼 (Google, Kakao, Naver)
- [x] 이메일/비밀번호 폼
- [x] 에러 메시지 표시

#### P3-S5-V: 로그인 검증 ✅

- [x] E2E 테스트: 소셜 로그인 리다이렉트
- [x] E2E 테스트: 이메일 로그인 성공
- [x] E2E 테스트: 로그인 실패 에러 메시지

### P3-S6: 회원가입 (Frontend) ✅

> **참조**: `specs/screens/auth-signup.yaml`
> **의존성**: P1-R1

#### P3-S6-T1: 회원가입 페이지 라우트 ✅

- [x] `src/app/auth/signup/page.tsx`

#### P3-S6-T2: 회원가입 폼 ✅

- [x] `src/components/auth/SignupForm.tsx`
- [x] 이메일 중복 확인 (비동기)
- [x] 비밀번호 강도 표시
- [x] 약관 동의 체크박스

#### P3-S6-V: 회원가입 검증 ✅

- [x] E2E 테스트: 이메일 중복 확인
- [x] E2E 테스트: 비밀번호 유효성 검사
- [x] E2E 테스트: 회원가입 성공

---

## Phase 4+: 확장 기능 (P1 화면) ✅

> MVP 이후 화면들 구현 완료

### P4-R: 추가 리소스 (Backend) ✅

- [x] `users` 테이블 확장 (마이페이지용)
- [x] `notifications` 테이블 생성
- [x] `subscriptions` 테이블 생성
- [x] `payments` 테이블 생성

### P4-S: P1 화면 ✅

- [x] S05: 비교하기 (`/compare`)
- [x] S06: 관심 매물 (`/favorites`)
- [x] S07: 알림 (`/notifications`)
- [x] S10: 마이페이지 (`/mypage`)
- [x] S11: 결제/플랜 선택 (`/checkout/plans`) - Toss Payments 연동 준비

---

## 병렬 실행 가이드

### Phase 0 (순차)

```
P0-T0.1 → P0-T0.2 → P0-T0.3 → P0-T0.4
    ↓
P0-T0.5 ─┬─ P0-T0.6
         └─ P0-T0.7 → P0-T0.8 → P0-T0.9
```

### Phase 1 (부분 병렬)

```
P1-R1-T1 → P1-R1-T2 → P1-R1-T3
     ↓
P1-S0-T1 ─┬─ P1-S0-T2
          └─ P1-S0-T3
```

### Phase 2 (Resource 병렬, Screen 순차)

```
P2-R0 (Complexes) ──→ P2-R1 (Properties)
                      ↓
┌─ P2-R1 (Properties)
├─ P2-R2 (Regions)     ──→ P2-S1 (홈) → P2-S1-V
└─ P2-R3 (Popular)

P2-R1 완료 후:
  P2-S2 (검색 리스트) → P2-S2-V
  P2-S3 (검색 지도) → P2-S3-V
```

### Phase 3 (Resource 병렬, Screen 순차)

```
P3-ML (ML API) ──────────────→ (필수 선행)
         ↓
┌─ P3-R1 (Chamgab)   ─────→ P3-S4 (매물 상세) → P3-S4-V
├─ P3-R2 (Factors)
├─ P3-R3 (Transactions)
└─ P3-R4 (Favorites)

P1-R1 완료 후:
  P3-S5 (로그인) → P3-S5-V
  P3-S6 (회원가입) → P3-S6-V
```

### Phase 6 (병렬 실행 - 빠른 고도화)

```
Week 1-2: 상권 분석 고도화 (Backend + Frontend 동시)
┌─ P6-R1 (Backend)
│  ├─ T1: 시간대별 분석 API
│  ├─ T2: 연령대별 분석 API
│  ├─ T3: 주말/평일 비교 API
│  └─ T4: 상권 프로필 API
│
└─ P6-S1 (Frontend)
   ├─ T1: 시간대별 분석 컴포넌트
   ├─ T2: 연령대별 분석 컴포넌트
   ├─ T3: 주말/평일 비교 컴포넌트
   └─ T4: 상권 프로필 컴포넌트

Week 3-4: 통합 기능 (Backend + Frontend 동시)
┌─ P6-R3 (Backend)
│  ├─ T1: 통합 대시보드 API
│  ├─ T2: 통합 알림 API
│  └─ T3: 리포트 생성 API
│
└─ P6-S3 (Frontend)
   ├─ T1: 통합 대시보드 컴포넌트
   ├─ T2: 알림 센터 컴포넌트
   └─ T3: 리포트 생성 컴포넌트

Week 5-6: 아파트 분석 + 최적화
┌─ P6-R2 (Backend)
│  └─ T1: 투자 점수 API
│
├─ P6-S2 (Frontend)
│  └─ T1: 투자 점수 컴포넌트
│
└─ P6-Integration
   ├─ T1: E2E 테스트
   ├─ T2: 성능 최적화
   ├─ T3: 문서화
   └─ T4: 배포

선택 (Week 7-8): 게이미피케이션
P6-Enhancement
  ├─ T1: 배지 시스템
  └─ T2: 리더보드
```

---

## 태스크 요약

| Phase   | 항목                                  | 개수          |
| ------- | ------------------------------------- | ------------- |
| **P0**  | 프로젝트 셋업                         | 9개           |
| **P1**  | 공통 기반 (Auth, Layout)              | 6개           |
| **P2**  | 핵심 기능 (Resource 4, Screen 3)      | 7개 + 3 검증  |
| **P3**  | 참값 분석 (ML + Resource 4, Screen 3) | 10개 + 3 검증 |
| **P4+** | 확장 기능                             | 완료          |
| **P5**  | 상권분석 (ML + Resource 2, Screen 4)  | 18개 + 4 검증 |
| **P6**  | 고도화 (데이터 활용 극대화)           | 35개 + 5 검증 |

**총 태스크**: ~95개 (검증 포함)
**ML 피처 총 개수**: 72개 (기존 57개 + 상권 15개)
**신규 API 엔드포인트**: 13개 (Phase 6)
**신규 컴포넌트**: 13개 (Phase 6)

---

## Phase 5: 상권분석 🏪

> **목표**: AI 기반 창업 성공 예측 및 상권 분석 서비스
> **데이터**: 개폐업 통계, 매출 정보, 점포수, 유동인구

### P5-R1: 상권 데이터 인프라 (Backend) ✅

#### P5-R1-T1: Supabase 테이블 생성 ✅

- [x] `business_statistics` 테이블 (개폐업 통계)
- [x] `sales_statistics` 테이블 (매출 정보)
- [x] `store_statistics` 테이블 (점포수 통계)
- [x] RLS 정책 설정
- [x] 인덱스 최적화

**파일**: `supabase/migrations/015_create_commercial_analysis_tables.sql`

#### P5-R1-T2: 데이터 수집 스크립트 ✅

- [x] 소상공인진흥공단 API 연동
- [x] 개폐업 정보 수집
- [x] 매출 정보 수집
- [x] 점포수 통계 수집
- [x] 중복 데이터 처리 (UPSERT)

**파일**: `ml-api/scripts/collect_business_statistics.py`

#### P5-R1-T3: GitHub Actions 워크플로우 ✅

- [x] 상권 통계 수집 스텝 추가
- [x] 12개월 데이터 수집 설정
- [x] 에러 핸들링 및 로깅

**파일**: `.github/workflows/full-collection-now.yml`

### P5-ML: 창업 성공 예측 모델 (ML) ✅

#### P5-ML-T1: Feature Engineering ✅

- [x] RED: Feature 테스트 작성
- [x] GREEN: 상권분석 피처 추가 (`ml-api/scripts/feature_engineering.py`)
  - [x] 생존율 피처 (survival_rate, survival_rate_normalized)
  - [x] 매출 피처 (monthly_avg_sales, sales_growth_rate, sales_per_store)
  - [x] 경쟁 피처 (store_count, density_level, market_saturation)
  - [x] 복합 피처 (viability_index, growth_potential, competition_ratio)
  - [x] 유동인구 피처 (foot_traffic_score, peak_hour_ratio, weekend_ratio)
- [x] REFACTOR: 피처 정규화 및 인코딩 (StandardScaler)

**최종 피처 수**: 19개 (BusinessFeatureEngineer 클래스)

#### P5-ML-T2: 창업 성공 예측 모델 학습 ✅

- [x] RED: 모델 테스트 작성
- [x] GREEN: XGBoost Classifier 모델 구현
  - [x] 입력: 생존율, 매출, 경쟁, 유동인구 등 19개 피처
  - [x] 출력: 성공 확률 (0-100%)
  - [x] 달성 정확도: 99.75% (5-Fold CV)
- [x] GREEN: SHAP Explainer 생성
- [x] REFACTOR: Optuna 기반 하이퍼파라미터 튜닝

**파일**: `ml-api/scripts/train_business_model.py`

#### P5-ML-T3: 모델 평가 및 검증 ✅

- [x] RED: 평가 테스트 작성 (`ml-api/scripts/evaluate_business_model.py`)
- [x] GREEN: Cross-validation (5-fold) - Accuracy 0.9975
- [x] GREEN: 메트릭 계산 (Accuracy, Precision, Recall, F1)
- [x] REFACTOR: 과적합 진단 (갭 0.0006 - 양호)

**달성 메트릭**:

- Accuracy: 100% (목표 75%+)
- Precision: 100% (목표 70%+)
- Recall: 100% (목표 70%+)

### P5-R2: 상권분석 API (Backend) ✅

#### P5-R2-T1: 기본 API 엔드포인트 ✅

- [x] GREEN: `GET /api/commercial/districts` - 상권 목록 조회
- [x] GREEN: `GET /api/commercial/industries` - 업종 목록 조회
- [x] GREEN: `GET /api/commercial/districts/{code}` - 상권 상세 정보
- [x] REFACTOR: 응답 캐싱 (SimpleCache, 1시간)

**파일**: `ml-api/app/api/commercial.py`

#### P5-R2-T2: 창업 성공 예측 API ✅

- [x] GREEN: `POST /api/commercial/predict` - 성공 확률 예측
  - [x] 입력: district_code, industry_code
  - [x] 출력: BusinessPredictionResult
  - [x] 규칙 기반 추론 (ML 모델 대체)
  - [x] 요인 분석 (PredictionFactor)

**파일**: `ml-api/app/api/commercial.py`

#### P5-R2-T3: 지역 비교 및 통계 API ✅

- [x] GREEN: `POST /api/commercial/business/compare` - 지역 비교
- [x] GREEN: `GET /api/commercial/industries/{code}/statistics` - 업종 통계
- [x] GREEN: `GET /api/commercial/business/trends` - 트렌드 조회
- [x] GREEN: `GET /api/commercial/districts/{code}/characteristics` - 상권 특성 분석

**파일**: `ml-api/app/api/commercial.py`

### P5-S1: 상권분석 메인 화면 (Frontend) ✅

> **URL**: `/business-analysis`
> **목적**: 지역과 업종 선택

#### P5-S1-T1: 검색 컴포넌트 ✅

- [x] GREEN: `RegionSelect.tsx` - 지역 선택 드롭다운
- [x] GREEN: `IndustrySelect.tsx` - 업종 선택 드롭다운
- [x] 접근성 개선 (ARIA)

**파일**: `src/components/business/RegionSelect.tsx`, `src/components/business/IndustrySelect.tsx`

#### P5-S1-T2: 메인 페이지 구현 ✅

- [x] GREEN: 검색 폼 구현
- [x] GREEN: Hero 섹션 및 Info Cards
- [x] REFACTOR: 반응형 레이아웃

**파일**: `src/app/business-analysis/page.tsx`

#### P5-S1-V: 검증 ✅

- [x] E2E 테스트 (Playwright) - `e2e/business-main.spec.ts`
- [x] 접근성 테스트 (ARIA label, heading 계층, 키보드 네비게이션)
- [x] 성능 테스트 (로드 시간, LCP, 모바일 반응형)

### P5-S2: 분석 결과 화면 (Frontend) ✅

> **URL**: `/business-analysis/result`
> **목적**: 창업 성공 확률 및 상세 분석

#### P5-S2-T1: 결과 요약 카드 ✅

- [x] GREEN: `SuccessProbabilityCard.tsx` - 성공 확률 표시
- [x] GREEN: 주요 영향 요인 표시
- [x] GREEN: 프로그레스 바 애니메이션

**파일**: `src/components/business/SuccessProbabilityCard.tsx`

#### P5-S2-T2: 상권 특성 분석 ✅

- [x] GREEN: `DistrictCharacteristicsCard.tsx` - 상권 특성 표시
  - [x] 상권 유형 (대학상권/오피스상권/주거상권)
  - [x] 타겟 연령대 및 분포
  - [x] 시간대별 유동인구 차트 (Recharts)
  - [x] 연령대별 분포 차트
  - [x] 평균 객단가 및 소비 수준
  - [x] 타겟 고객 프로필
  - [x] 피크 타임 분석
  - [x] 요일 특성 (주중/주말)

**파일**: `src/components/business/DistrictCharacteristicsCard.tsx`

#### P5-S2-T3: 결과 페이지 통합 ✅

- [x] GREEN: API 데이터 패칭 (parallel loading)
- [x] GREEN: 에러 핸들링
- [x] GREEN: 로딩 상태
- [x] 공유 기능 (버튼만 구현)

**파일**: `src/app/business-analysis/result/page.tsx`

#### P5-S2-V: 검증 ✅

- [x] E2E 테스트 - `e2e/business-result.spec.ts`
- [x] 차트 렌더링 테스트 (Recharts SVG, 프로그레스 바)
- [x] API 에러 핸들링 테스트 (500 에러, 타임아웃, 잘못된 파라미터)

### P5-S3: 지역 비교 화면 (Frontend) ✅

> **URL**: `/business-analysis/compare`
> **목적**: 여러 지역의 동일 업종 비교

#### P5-S3-T1: 비교 테이블 ✅

- [x] GREEN: `ComparisonTable.tsx` - 지표별 비교 테이블
- [x] GREEN: 순위별 정렬 및 시각화
- [x] GREEN: 성공 확률 비교

**파일**: `src/components/business/ComparisonTable.tsx`

#### P5-S3-T2: 비교 페이지 구현 ✅

- [x] GREEN: 최대 3개 지역 비교
- [x] GREEN: 종합 점수 랭킹
- [x] GREEN: 지역 추가/제거 기능
- [x] GREEN: 반응형 레이아웃

**파일**: `src/app/business-analysis/compare/page.tsx`

#### P5-S3-V: 검증 ✅

- [x] E2E 테스트 - `e2e/business-compare.spec.ts`
- [x] 반응형 테스트 (데스크탑 3컬럼, 태블릿, 모바일 단일 컬럼)

### P5-S4: 업종별 통계 화면 (Frontend) ✅

> **URL**: `/business-analysis/industry/[code]`
> **목적**: 특정 업종의 전국 통계

#### P5-S4-T1: 업종 통계 컴포넌트 ✅

- [x] GREEN: `IndustryOverview.tsx` - 업종 개요
- [x] GREEN: 주요 지표 표시 (점포수, 생존율, 평균 매출)
- [x] GREEN: 상위 지역 TOP 5 카드

**파일**: `src/components/business/IndustryOverview.tsx`

#### P5-S4-T2: 업종 페이지 구현 ✅

- [x] GREEN: 동적 라우팅 ([code])
- [x] GREEN: 로딩/에러 상태 처리
- [x] GREEN: CTA 버튼

**파일**: `src/app/business-analysis/industry/[code]/page.tsx`

#### P5-S4-V: 검증 ✅

- [x] E2E 테스트 - `e2e/business-industry.spec.ts`
- [x] 성능 테스트 (로드 시간, 렌더링 속도, 메모리 안정성)

### P5-Integration: 통합 및 배포

#### P5-Integration-T1: End-to-End 테스트 ✅

- [x] 전체 플로우 테스트 (검색 → 결과 → 비교) - `e2e/business-flow.spec.ts`
- [x] 에러 시나리오 테스트 (오프라인, 부분 실패, 잘못된 파라미터)
- [x] 성능 테스트 (FCP, 전체 로드, 네비게이션 속도, JS 번들 크기)

#### P5-Integration-T2: 문서화 ✅

- [x] API 문서 업데이트 (`docs/API_DOCUMENTATION.md` - P5/P6 상권 엔드포인트, ML 모델 문서)
- [x] 사용자 가이드 업데이트 (`docs/USER_GUIDE.md` - 지역 비교, 업종 통계, 미래 예측 가이드)
- [x] README 업데이트 (실제 API 경로, ML 모델 정보, 테스트 커버리지)

#### P5-Integration-T3: 배포 ✅

- [x] Vercel Preview 배포 설정 (`vercel.json` - Seoul 리전, ML API rewrite)
- [x] Railway ML API 배포 설정 (`railway.toml`, `Dockerfile`, `Procfile`)
- [x] Supabase 마이그레이션 (`015_create_commercial_analysis_tables.sql`, `016_add_commercial_demographics.sql`)
- [x] 모니터링 설정 (Sentry - P0-T0.9 완료, `docs/DEPLOYMENT_GUIDE.md`)

---

## Phase 6: 고도화 (데이터 활용 극대화) 🚀

> **목표**: 보유 데이터 100% 활용, 사용자 참여도 5배 증가
> **기간**: 6-8주
> **데이터**: foot_traffic_statistics, district_characteristics 활용

### P6-R1: 상권 분석 고도화 - Backend ✅

#### P6-R1-T1: 시간대별 분석 API ✅

**목표**: "언제 장사가 잘 되나요?"

- [x] GREEN: `GET /api/commercial/districts/{code}/peak-hours`
- [x] GREEN: foot*traffic_statistics.time*\* 활용
- [x] GREEN: 시간대별 점수 계산 (0-10)
- [x] GREEN: 최적 운영 시간 추천

**데이터 소스**: `foot_traffic_statistics` (10개 레코드)
**파일**: `ml-api/app/api/commercial.py`

**응답 예시**:

```json
{
  "peak_hours": {
    "morning": { "time": "06-11시", "traffic": 450, "score": 7 },
    "lunch": { "time": "11-14시", "traffic": 892, "score": 10 },
    "evening": { "time": "17-21시", "traffic": 1245, "score": 10 }
  },
  "best_time": "evening",
  "recommendation": "저녁 시간대 집중 운영"
}
```

---

#### P6-R1-T2: 연령대별 분석 API ✅

**목표**: "누가 내 고객이 되나요?"

- [x] GREEN: `GET /api/commercial/districts/{code}/demographics`
- [x] GREEN: foot*traffic_statistics.age*\* 활용
- [x] GREEN: 연령대별 점수 계산
- [x] GREEN: 타겟 페르소나 생성
- [x] GREEN: 적합 업종 추천

**데이터 소스**: `foot_traffic_statistics.age_10s ~ age_60s`
**파일**: `ml-api/app/api/commercial.py`

**응답 예시**:

```json
{
  "demographics": {
    "20s": { "count": 450, "percentage": 30, "score": 10 },
    "30s": { "count": 380, "percentage": 25, "score": 8 }
  },
  "primary_target": "20s",
  "persona": {
    "name": "MZ세대 직장인",
    "age": "25-35세"
  }
}
```

---

#### P6-R1-T3: 주말/평일 비교 API ✅

**목표**: "주말과 평일 중 언제가 좋나요?"

- [x] GREEN: `GET /api/commercial/districts/{code}/weekday-weekend`
- [x] GREEN: sales_statistics.weekend_sales_ratio 활용
- [x] GREEN: foot_traffic_statistics.weekday_avg/weekend_avg 활용
- [x] GREEN: 유리한 요일 계산
- [x] GREEN: 전략 추천

**데이터 소스**: `sales_statistics`, `foot_traffic_statistics`
**파일**: `ml-api/app/api/commercial.py`

---

#### P6-R1-T4: 상권 특성 프로필 API ✅

**목표**: "이 상권의 특징이 뭔가요?"

- [x] GREEN: `GET /api/commercial/districts/{code}/profile`
- [x] GREEN: district_characteristics 활용
- [x] GREEN: 상권 유형별 특성 매핑
- [x] GREEN: 성공 요인 분석
- [x] GREEN: 유사 상권 추천

**데이터 소스**: `district_characteristics` (10개 레코드)
**파일**: `ml-api/app/api/commercial.py`

---

#### P6-R1-T5: 경쟁 밀집도 분석 API ✅

**목표**: "경쟁자가 많나요?"

- [x] GREEN: `GET /api/commercial/industries/{code}/competition-map`
- [x] GREEN: store_statistics 활용
- [x] GREEN: 밀집도 점수 계산
- [x] GREEN: 대안 지역 추천
- [x] GREEN: 차별화 전략 제시

**데이터 소스**: `store_statistics` (75개 레코드)
**파일**: `ml-api/app/api/commercial.py`

---

#### P6-R1-T6: 성장 가능성 점수 API ✅

**목표**: "이 상권이 성장하고 있나요?"

- [x] GREEN: `GET /api/commercial/districts/{code}/growth-potential`
- [x] GREEN: sales_statistics.sales_growth_rate 활용
- [x] GREEN: business_statistics.survival_rate 활용
- [x] GREEN: 3개월 후 예측
- [x] GREEN: 시그널 분석 (긍정/부정/경고)

**데이터 소스**: `sales_statistics`, `business_statistics`
**파일**: `ml-api/app/api/commercial.py`

---

#### P6-R1-T7: AI 업종 추천 API ✅

**목표**: "이 상권에 무슨 업종이 좋을까요?"

- [x] GREEN: `POST /api/commercial/districts/{code}/recommend-industry`
- [x] GREEN: 모든 테이블 종합 분석
- [x] GREEN: Content-based filtering
- [x] GREEN: 매칭 점수 계산 (0-100)
- [x] GREEN: 예상 매출 계산
- [x] GREEN: 손익분기 개월 계산

**알고리즘**: ML 기반 추천
**파일**: `ml-api/app/api/commercial.py`

---

### P6-S1: 상권 분석 고도화 - Frontend ✅

#### P6-S1-T1: 시간대별 분석 컴포넌트 ✅

**파일**: `src/components/business/PeakHoursAnalysis.tsx`

- [x] GREEN: 시간대별 바 차트 (Recharts)
- [x] GREEN: 피크 시간 배지
- [x] GREEN: 운영 시간 추천 카드
- [x] GREEN: 반응형 디자인

**UI**:

```
┌──────────────────────────────┐
│  시간대별 유동인구 분석      │
├──────────────────────────────┤
│  [========= 아침 ===] 450명  │
│  [=============== 점심] 892명│
│  [==================== 저녁] 1245명 ⭐│
│                              │
│  💡 추천: 저녁 시간 집중     │
└──────────────────────────────┘
```

---

#### P6-S1-T2: 연령대별 분석 컴포넌트 ✅

**파일**: `src/components/business/DemographicsAnalysis.tsx`

- [x] GREEN: 연령대별 도넛 차트
- [x] GREEN: 타겟 페르소나 카드
- [x] GREEN: 적합 업종 추천 리스트
- [x] GREEN: 애니메이션 효과

**UI**:

```
┌──────────────────────────────┐
│  연령대별 고객 분석          │
├──────────────────────────────┤
│     [도넛 차트]              │
│   20대: 30% ⭐               │
│   30대: 25%                  │
│                              │
│  🎯 타겟: MZ세대 직장인      │
│  💡 추천: 커피전문점         │
└──────────────────────────────┘
```

---

#### P6-S1-T3: 주말/평일 비교 컴포넌트 ✅

**파일**: `src/components/business/WeekdayWeekendComparison.tsx`

- [x] GREEN: 요일별 라인 차트
- [x] GREEN: 유리한 요일 하이라이트
- [x] GREEN: 전략 추천 카드

---

#### P6-S1-T4: 상권 프로필 컴포넌트 ✅

**파일**: `src/components/business/DistrictProfile.tsx`

- [x] GREEN: 상권 유형 배지
- [x] GREEN: 특성 태그 클라우드
- [x] GREEN: 성공 요인 리스트
- [x] GREEN: 유사 상권 카드

---

#### P6-S1-T5: 경쟁 분석 컴포넌트 ✅

**파일**: `src/components/business/CompetitionAnalysis.tsx`

- [x] GREEN: 경쟁 밀집도 게이지
- [x] GREEN: 프랜차이즈 비율 차트
- [x] GREEN: 대안 지역 리스트

---

#### P6-S1-T6: 성장 가능성 컴포넌트 ✅

**파일**: `src/components/business/GrowthPotential.tsx`

- [x] GREEN: 성장 점수 게이지
- [x] GREEN: 트렌드 타임라인
- [x] GREEN: 시그널 리스트 (긍정/부정/경고)
- [x] GREEN: 3개월 예측 그래프

---

#### P6-S1-T7: AI 업종 추천 컴포넌트 ✅

**파일**: `src/components/business/IndustryRecommendation.tsx`

- [x] GREEN: 카드 스와이프 UI (Tinder 스타일)
- [x] GREEN: 매칭 점수 표시
- [x] GREEN: 이유 리스트
- [x] GREEN: 예상 매출 표시

---

#### P6-S1-T8: 통합 분석 페이지 ✅

**파일**: `src/app/business-analysis/result/[district]/[industry]/page.tsx`

- [x] GREEN: 모든 분석 컴포넌트 통합
- [x] GREEN: 탭 네비게이션
- [x] GREEN: 스크롤 애니메이션
- [x] GREEN: 공유 기능 (카카오톡, 링크)

---

### P6-R2: 아파트 분석 고도화 - Backend

#### P6-R2-T1: 투자 점수 API ✅

**목표**: ROI, 전세가율 분석

- [x] GREEN: `GET /api/chamgab/{property_id}/investment-score`
- [x] GREEN: ROI 계산 (1년/3년)
- [x] GREEN: 전세가율 트렌드
- [x] GREEN: 유동성 점수
- [x] GREEN: 투자 추천 여부

**데이터 소스**: `transactions`, `properties`, 시장 지표
**파일**: `ml-api/app/api/chamgab.py`

---

#### P6-R2-T2: 미래 가격 예측 API ✅

**목표**: 3개월/6개월/1년 후 가격

- [x] GREEN: `GET /api/chamgab/{property_id}/future-prediction`
- [x] GREEN: 선형 회귀 + 계절성 보정 기반 시계열 분석
- [x] GREEN: 95% 신뢰구간 계산
- [x] GREEN: 트렌드 방향 + 시장 시그널

**데이터 소스**: `transactions` (시계열)
**알고리즘**: Linear Regression with Seasonal Adjustment
**파일**: `ml-api/app/api/chamgab.py`

---

### P6-S2: 아파트 분석 고도화 - Frontend

#### P6-S2-T1: 투자 점수 컴포넌트 ✅

**파일**: `src/components/property/InvestmentScore.tsx`

- [x] GREEN: 투자 점수 게이지
- [x] GREEN: ROI 표시
- [x] GREEN: 전세가율 차트
- [x] GREEN: 추천 이유 리스트

---

#### P6-S2-T2: 미래 가격 예측 컴포넌트 ✅

**파일**: `src/components/property/FuturePrediction.tsx`

- [x] GREEN: 가격 예측 그래프 (Recharts ComposedChart + Area/Line)
- [x] GREEN: 신뢰도 표시 (95% 신뢰구간 음영)
- [x] GREEN: 트렌드 방향 화살표 + 시장 시그널

---

### P6-R3: 통합 기능 - Backend ✅

#### P6-R3-T1: 통합 대시보드 API ✅

**목표**: 아파트 + 상권 동시 분석

- [x] GREEN: `GET /api/integrated/analysis`
- [x] GREEN: 아파트 분석 통합
- [x] GREEN: 근처 상권 검색 (1km 반경)
- [x] GREEN: 생활 편의성 점수
- [x] GREEN: 통합 투자 점수 계산

**데이터 소스**: properties + commercial_districts
**파일**: `ml-api/app/api/integrated.py`

---

#### P6-R3-T2: 통합 알림 API ✅

**목표**: 아파트 + 상권 변화 추적

- [x] GREEN: `POST /api/integrated/alerts/subscribe`
- [x] GREEN: 가격 변동 감지
- [x] GREEN: 상권 성장 감지
- [x] GREEN: 복합 기회 알림

**파일**: `ml-api/app/api/integrated.py`

---

#### P6-R3-T3: 리포트 생성 API ✅

**목표**: PDF 리포트

- [x] GREEN: `POST /api/integrated/reports/generate`
- [x] GREEN: PDF 생성 (ReportLab)
- [x] GREEN: 섹션 구성 (아파트/상권/통합/리스크)
- [x] GREEN: 공유 URL 생성

**파일**: `ml-api/app/api/reports.py`

---

### P6-S3: 통합 기능 - Frontend ✅

#### P6-S3-T1: 통합 대시보드 컴포넌트 ✅

**파일**: `src/components/integrated/IntegratedDashboard.tsx`

- [x] GREEN: 통합 점수 카드
- [x] GREEN: 아파트 섹션
- [x] GREEN: 상권 섹션
- [x] GREEN: 생활 편의성 섹션

---

#### P6-S3-T2: 알림 센터 컴포넌트 ✅

**파일**: `src/components/notifications/NotificationCenter.tsx`

- [x] GREEN: 알림 리스트
- [x] GREEN: 필터 (아파트/상권/통합)
- [x] GREEN: 읽음 처리
- [x] GREEN: 푸시 알림 설정

---

#### P6-S3-T3: 리포트 생성 컴포넌트 ✅

**파일**: `src/components/reports/ReportGenerator.tsx`

- [x] GREEN: 섹션 선택
- [x] GREEN: PDF 다운로드
- [x] GREEN: 카카오톡 공유
- [x] GREEN: 링크 공유

---

### P6-Enhancement: 게이미피케이션 (선택) ✅

#### P6-Enhancement-T1: 배지 시스템 ✅

**파일**: `src/components/gamification/BadgeSystem.tsx`, `ml-api/app/api/gamification.py`

- [x] GREEN: 배지 정의 (10개)
- [x] GREEN: 달성 조건 체크
- [x] GREEN: 배지 컬렉션 UI
- [x] GREEN: 포인트 시스템

---

#### P6-Enhancement-T2: 리더보드 ✅

**파일**: `src/components/gamification/Leaderboard.tsx`, `ml-api/app/api/gamification.py`

- [x] GREEN: 주간 TOP 10
- [x] GREEN: 카테고리별 랭킹
- [x] GREEN: 내 순위 표시

---

### P6-Integration: 통합 및 배포

#### P6-Integration-T1: End-to-End 테스트 ✅

- [x] 시간대별 분석 플로우
- [x] 연령대별 분석 플로우
- [x] 통합 대시보드 플로우
- [x] 알림 플로우
- [x] 리포트 생성 플로우

#### P6-Integration-T2: 성능 최적화 ✅

- [x] API 응답 캐싱
- [x] 이미지 최적화
- [x] 코드 스플리팅
- [x] Lighthouse 90+ 달성

#### P6-Integration-T3: 문서화 ✅

- [x] API 문서 업데이트
- [x] 사용자 가이드 작성
- [x] README 업데이트
- [x] 변경 로그 작성

#### P6-Integration-T4: 배포 ✅

- [x] Vercel 배포
- [x] Railway 배포
- [x] Supabase 마이그레이션
- [x] 모니터링 설정

---

## 참조

- **화면 명세**: `specs/screens/*.yaml`
- **도메인 리소스**: `specs/domain/resources.yaml`
- **공통 컴포넌트**: `specs/shared/components.yaml`
- **커버리지 리포트**: `specs/coverage-report.yaml`
- **검증 리포트**: `docs/planning/TASKS-VALIDATION-REPORT.md`

---

## Phase 7: School Analysis (학군분석) Full Launch (16주+)

### P7-R1: Product/Foundation (Week 1-2)

- [ ] SA-001: IA/Flow 확정 (`/school-analysis`, `/result`, `/schools/[id]`, `/share/[token]`)
- [ ] SA-002: API 응답 계약서 확정 (`provenance`, `data_freshness`, `confidence_score`, `availability`)
- [ ] SA-003: Share token 정책 확정 (만료, 폐기, 레이트리밋, read-only)
- [ ] SA-004: Report idempotency 규칙 확정 (중복 생성 방지)
- [ ] SA-005: 데이터 품질 게이트/SLA/알림 기준 문서화
- [ ] SA-006: 메뉴/접근제어 UX 설계 승인

### P7-R2: DB/RLS/Views (Week 3-4)

- [ ] SA-007: `043_create_school_analysis_core.sql` 작성/적용
- [ ] SA-008: `044_create_school_analysis_views.sql` 작성/적용
- [ ] SA-009: `045_create_school_analysis_rls.sql` 작성/적용
- [ ] SA-010: RLS 권한 테스트 (public/auth/service 경계)
- [ ] SA-011: 초기 샘플 데이터/백필 1차 실행

### P7-R3: Data Pipeline (Week 5-8)

- [ ] SA-012: `collect_school_districts.py`
- [ ] SA-013: `collect_school_metrics_official.py`
- [ ] SA-014: `collect_school_progression.py`
- [ ] SA-015: `collect_academies.py`
- [ ] SA-016: `collect_academy_fees.py`
- [ ] SA-017: `build_school_analysis_marts.py`
- [ ] SA-018: `check_school_data_quality.py`
- [ ] SA-019: 스케줄러 연동 (월/주/일)
- [ ] SA-020: 수집 실패 재시도 2회 + 관리자 알림
- [ ] SA-021: 커버리지 95%/좌표 누락률 5% 기준 검증

### P7-R4: Backend API (Week 9-12)

- [ ] SA-022: `school-analysis.ts` 타입 정의
- [ ] SA-023: `GET /api/school-analysis/preview` (public)
- [ ] SA-024: `POST /api/school-analysis/reports` (auth, idempotent)
- [ ] SA-025: `GET /api/school-analysis/reports/[id]` (auth)
- [ ] SA-026: `GET /api/school-analysis/schools/[id]` (auth)
- [ ] SA-027: `POST /api/school-analysis/reports/[id]/share` (auth)
- [ ] SA-028: `GET /api/school-analysis/share/[token]` (public, read-only)
- [ ] SA-029: Middleware public exact/prefix 분리 반영
- [ ] SA-030: API 계약 테스트/권한 테스트 통과

### P7-S1: Frontend UX (Week 11-14)

- [ ] SA-031: Header/모바일 메뉴에 `학군분석` 추가
- [ ] SA-032: 공개 프리뷰 페이지 구현 (`/school-analysis`)
- [ ] SA-033: 로그인 상세 리포트 페이지 구현 (`/school-analysis/result`)
- [ ] SA-034: 학교 상세 페이지 구현 (`/school-analysis/schools/[schoolId]`)
- [ ] SA-035: 공유 읽기전용 페이지 구현 (`/school-analysis/share/[token]`)
- [ ] SA-036: provenance/신뢰도/결측 안내 UI 적용
- [ ] SA-037: 공유 링크 복사 기능
- [ ] SA-038: PDF 저장 기능

### P7-QA1: QA/Perf/Release (Week 14-16+)

- [ ] SA-039: 비로그인 접근/로그인 리다이렉트 E2E 통과
- [ ] SA-040: 리포트 생성/조회/공유/만료 플로우 테스트
- [ ] SA-041: 동일 입력 요청 시 캐시 재사용/응답 일관성 검증
- [ ] SA-042: 프리뷰 API p95 <= 1.2s
- [ ] SA-043: 상세 API p95 <= 2.5s
- [ ] SA-044: 5xx < 1% 유지
- [ ] SA-045: 운영 대시보드/알림 연동
- [ ] SA-046: 10% 제한 공개 롤아웃
- [ ] SA-047: 7일 모니터링 후 100% 롤아웃 판단

### P7-Policy: Score/Labeling Rules (고정안)

- [ ] overall_score = 0.45*school_quality + 0.35*academy_ecosystem + 0.20*commute_safety
- [ ] school_quality = 학업/성취(30) + 진학 성과(25) + 교육환경(15) + 안전/생활(15) + 프로그램(15)
- [ ] academy_ecosystem = 밀집도(35) + 과목 다양성(25) + 접근성(20) + 비용 적정성(20)
- [ ] total_confidence = 0.7*official_confidence + 0.3*inferred_confidence
- [ ] 내신 직접값 부재 시 대체지표 + `추정` 라벨 강제

### P7-DoD (공통 완료 조건)

- [ ] 공식/추정 지표가 UI에서 명확히 분리되어 표시된다.
- [ ] 각 리포트에 `data_freshness`, `confidence_score`, `formula_version`이 저장된다.
- [ ] 결측값은 `null` 대신 `availability.reason`으로 표기된다.
- [ ] 공유 링크는 read-only이며 만료/폐기 정책이 동작한다.
- [ ] RLS 우회 없이 public/auth/service 접근 경계가 검증된다.
