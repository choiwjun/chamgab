# 참값 (Chamgab)

> AI 기반 종합 부동산 투자 분석 플랫폼

KB부동산 데이터와 XGBoost 머신러닝을 활용한 아파트 가격 분석, 상권 분석, 그리고 통합 투자 대시보드를 제공하는 올인원 부동산 투자 플랫폼입니다.

---

## 주요 기능

### 🏠 아파트 투자 분석 (참값)

- **AI 가격 예측**: XGBoost 기반 아파트 적정 가격 분석 (MAPE 5.50%, R² 0.9917)
- **SHAP 분석**: 가격 결정 요인 상세 설명 (지역 74%, 면적 18%, 브랜드 3%)
- **투자 지표**: ROI, 전세가율, 유동성 점수 제공
- **유사 거래 분석**: 비슷한 조건의 실거래 사례 비교

### 🏪 상권 분석

- **AI 창업 성공 예측**: 업종별 성공 확률 분석 (유동인구, 매출, 경쟁 밀집도 기반)
- **시간대별 유동인구**: 피크 타임 분석으로 운영 시간 최적화
- **인구통계 분석**: 연령대/성별 고객 분포 파악
- **주말/평일 비교**: 상권 패턴 분석
- **AI 업종 추천**: 상권 특성에 맞는 최적 업종 TOP 5 추천

### 📊 통합 대시보드

- **통합 투자 점수**: 아파트 투자(60%) + 생활 편의성(40%) 종합 평가
- **생활 편의성 분석**: 교통, 상업, 교육, 의료, 공원 접근성 점수화
- **근처 상권 정보**: 도보 거리 내 상권 성공 확률 및 매출 정보
- **원스톱 의사결정**: 투자와 실거주 가치를 한눈에 비교

### 🔔 알림 센터

- **가격 변동 알림**: 관심 매물 가격 변동 시 실시간 알림
- **상권 성장 알림**: 근처 상권 매출 증가 시 알림
- **투자 기회 알림**: 저평가 매물 또는 고득점 매물 발견 시 알림
- **맞춤형 필터링**: 알림 유형, 심각도별 필터링

### 📄 리포트 생성

- **PDF 투자 리포트**: 아파트, 상권, 통합, 리스크 분석 포함
- **섹션 선택**: 필요한 분석만 선택하여 리포트 생성
- **공유 기능**: 링크 복사, 카카오톡 공유 (7일간 유효)

---

## 기술 스택

### Frontend

- **Next.js 14** (App Router)
- **TypeScript 5.x**
- **TailwindCSS 3.x**
- **Zustand** (상태 관리)
- **TanStack Query** (서버 상태, React Query)
- **Recharts** (차트 시각화)
- **Kakao Maps SDK** (지도)
- **Playwright** (E2E 테스트)

### Backend

- **Supabase** (PostgreSQL + PostGIS + Auth)
- **FastAPI** (ML API)

### ML & Data

- **XGBoost** (가격 예측 모델)
- **SHAP** (모델 해석)
- **PublicDataReader** (KB부동산 데이터)
- **공공데이터**: 서울시 우리마을가게 상권분석, 소상공인시장진흥공단

---

## 프로젝트 구조

```
chamgab/
├── src/                    # Next.js 프론트엔드
│   ├── app/               # App Router 페이지
│   ├── components/        # React 컴포넌트
│   │   ├── business/      # 상권 분석 컴포넌트
│   │   ├── integrated/    # 통합 대시보드 컴포넌트
│   │   ├── notifications/ # 알림 센터 컴포넌트
│   │   └── reports/       # 리포트 생성 컴포넌트
│   ├── hooks/             # Custom Hooks
│   ├── lib/               # 유틸리티
│   ├── services/          # API 서비스
│   ├── stores/            # Zustand 스토어
│   └── types/             # TypeScript 타입
├── ml-api/                 # FastAPI ML API
│   ├── app/
│   │   ├── api/           # API 엔드포인트
│   │   │   ├── business.py    # 상권 분석 API
│   │   │   ├── commercial.py  # 상권 데이터 API
│   │   │   └── integrated.py  # 통합 분석 API
│   │   ├── core/          # 설정
│   │   ├── models/        # 학습된 모델 (.pkl)
│   │   └── services/      # 비즈니스 로직
│   └── scripts/           # 데이터 수집/학습 스크립트
├── e2e/                    # Playwright E2E 테스트
├── docs/                   # 기획 문서
└── specs/                  # 화면/도메인 명세
```

---

## 시작하기

### 1. 환경 설정

```bash
# 저장소 클론
git clone <repository-url>
cd chamgab

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env.local
# .env.local 파일에서 Supabase 키 설정
```

### 2. 개발 서버 실행

```bash
# Next.js 개발 서버
npm run dev

# ML API (별도 터미널)
cd ml-api
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 3. 빌드

```bash
# 프로덕션 빌드
npm run build

# 린트 검사
npm run lint
```

---

## ML 파이프라인

### 데이터 수집

```bash
cd ml-api

# KB부동산 데이터 기반 학습 데이터 생성
python -m scripts.collect_kb_data --generate-training --count 10000
```

### 모델 학습

```bash
# XGBoost 모델 학습
python -m scripts.train_model --csv scripts/kb_transactions.csv

# 하이퍼파라미터 튜닝 (선택)
python -m scripts.train_model --tune --trials 50 --csv scripts/kb_transactions.csv
```

### 모델 성능

- **MAPE**: 5.50%
- **R²**: 0.9917
- **주요 피처**: 지역(74%), 면적(18%), 브랜드(3%)

---

## API 엔드포인트

### 아파트 분석 API

| 엔드포인트                     | 설명                  |
| ------------------------------ | --------------------- |
| `GET /api/properties`          | 매물 목록             |
| `GET /api/properties/:id`      | 매물 상세             |
| `GET /api/chamgab/:id`         | 참값 분석 결과        |
| `GET /api/chamgab/:id/factors` | 가격 결정 요인 (SHAP) |
| `POST /predict`                | AI 가격 예측          |
| `GET /similar/:id`             | 유사 거래 분석        |

### 상권 분석 API

| 엔드포인트                                  | 설명              |
| ------------------------------------------- | ----------------- |
| `GET /api/business/success-probability`     | 창업 성공 확률    |
| `GET /api/business/demographics`            | 인구통계 분석     |
| `GET /api/business/peak-hours`              | 시간대별 유동인구 |
| `GET /api/business/weekend-analysis`        | 주말/평일 비교    |
| `GET /api/business/industry-recommendation` | AI 업종 추천      |

### 통합 분석 API

| 엔드포인트                              | 설명            |
| --------------------------------------- | --------------- |
| `GET /api/integrated/analysis`          | 통합 투자 분석  |
| `GET /api/integrated/alerts/:user`      | 알림 센터       |
| `POST /api/integrated/reports/generate` | PDF 리포트 생성 |
| `GET /api/integrated/reports/:id`       | 리포트 다운로드 |

---

## E2E 테스트

```bash
# Playwright 설치
npx playwright install

# 모든 테스트 실행
npx playwright test

# 특정 테스트만 실행
npx playwright test business-analysis
npx playwright test integrated-features

# UI 모드로 실행
npx playwright test --ui

# 헤드 모드로 실행 (브라우저 보기)
npx playwright test --headed
```

### 테스트 커버리지

- **인증**: 로그인, 회원가입 (6 tests)
- **홈 화면**: 검색, 매물 카드 (3 tests)
- **매물 상세**: 참값 분석, 관심 매물 (4 tests)
- **검색**: 필터링, 무한 스크롤, 지도 (5 tests)
- **상권 분석**: 성공 확률, 업종 추천 (5 tests)
- **통합 기능**: 대시보드, 알림, 리포트 (5 tests)

**총 28개 테스트** (Chromium + Mobile)

---

## 환경 변수

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Kakao Map
NEXT_PUBLIC_KAKAO_MAP_KEY=your_kakao_key

# ML API (프로덕션)
NEXT_PUBLIC_ML_API_URL=https://your-ml-api.railway.app
```

---

## 성능 최적화

- **React Query 캐싱**: 5분 staleTime, 30분 gcTime
- **코드 스플리팅**: 동적 import로 번들 크기 최적화
- **이미지 최적화**: AVIF/WebP 자동 변환
- **압축**: Gzip/Brotli 활성화
- **목표**: Lighthouse 90+ (모든 카테고리)

자세한 내용: [docs/PERFORMANCE_OPTIMIZATION.md](docs/PERFORMANCE_OPTIMIZATION.md)

---

## 배포

### Frontend (Vercel)

```bash
# Vercel CLI로 배포
npx vercel --prod

# 환경 변수 설정
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add NEXT_PUBLIC_ML_API_URL
```

### ML API (Railway)

```bash
# Railway CLI로 배포
railway login
railway init
railway up

# 환경 변수 설정
railway variables set DATABASE_URL=...
```

### Database (Supabase)

- 자동 배포 (클라우드 호스팅)
- 마이그레이션: `supabase db push`

---

## 문서

### 기획 문서

- [PRD (제품 요구사항)](docs/planning/01-prd.md)
- [TRD (기술 요구사항)](docs/planning/02-trd.md)
- [Phase 6 고도화 PRD](docs/planning/08-advancement-prd.md)
- [데이터베이스 설계](docs/planning/04-database-design.md)

### 개발 문서

- [API 문서](docs/API_DOCUMENTATION.md) ⭐ **NEW**
- [성능 최적화](docs/PERFORMANCE_OPTIMIZATION.md)
- [Phase 6 구현 가이드](docs/planning/09-phase6-implementation-guide.md)

### 사용자 가이드

- [사용자 가이드](docs/USER_GUIDE.md) ⭐ **NEW**

### 기타

- [도메인 리소스](specs/domain/resources.yaml)
- [태스크 목록](TASKS.md)

---

## 프로젝트 진행 상황

### ✅ 완료

- **Phase 1**: 프로젝트 셋업
- **Phase 2**: 기본 기능 (매물 검색, 상세, 참값 분석)
- **Phase 3**: 비교 기능
- **Phase 4**: 관심 매물
- **Phase 5**: 상권 분석 (창업 성공 예측, 유동인구, 인구통계)
- **Phase 6**: 통합 대시보드, 알림 센터, 리포트 생성
- **Phase 6 Integration**: E2E 테스트, 성능 최적화, 문서화

### 🚀 배포 예정

- Frontend: Vercel
- ML API: Railway
- Database: Supabase (클라우드)

### 📈 향후 계획

- 미래 가격 예측 (시계열 분석)
- 게이미피케이션 (레벨, 뱃지, 리더보드)
- 모바일 앱 (React Native)
- 커뮤니티 기능 (댓글, 리뷰)

---

## 기여하기

기여를 환영합니다! 다음 단계를 따라주세요:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 라이선스

MIT License

---

## 연락처

- **이메일**: support@chamgab.com
- **GitHub Issues**: [chamgab/issues](https://github.com/chamgab/issues)
- **카카오톡 채널**: @참값
