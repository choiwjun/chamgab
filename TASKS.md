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
- [ ] shadcn/ui 초기화 (Phase 1에서)
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
- [ ] next-themes 설치 (다크모드 대비) - Phase 2+

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

---

## 태스크 요약

| Phase   | 항목                                  | 개수          |
| ------- | ------------------------------------- | ------------- |
| **P0**  | 프로젝트 셋업                         | 9개           |
| **P1**  | 공통 기반 (Auth, Layout)              | 6개           |
| **P2**  | 핵심 기능 (Resource 4, Screen 3)      | 7개 + 3 검증  |
| **P3**  | 참값 분석 (ML + Resource 4, Screen 3) | 10개 + 3 검증 |
| **P4+** | 확장 기능                             | 완료          |

**총 태스크**: ~42개 (검증 포함)
**ML 피처 총 개수**: 43개

---

## 참조

- **화면 명세**: `specs/screens/*.yaml`
- **도메인 리소스**: `specs/domain/resources.yaml`
- **공통 컴포넌트**: `specs/shared/components.yaml`
- **커버리지 리포트**: `specs/coverage-report.yaml`
- **검증 리포트**: `docs/planning/TASKS-VALIDATION-REPORT.md`
