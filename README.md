# 참값 (Chamgab)

> AI 기반 부동산 가격 분석 서비스

KB부동산 데이터와 XGBoost 머신러닝을 활용하여 아파트 적정 가격을 분석하고, SHAP을 통해 가격 결정 요인을 설명합니다.

---

## 기술 스택

### Frontend

- **Next.js 14** (App Router)
- **TypeScript 5.x**
- **TailwindCSS 3.x**
- **Zustand** (상태 관리)
- **TanStack Query** (서버 상태)
- **Recharts** (차트)
- **Kakao Maps SDK** (지도)

### Backend

- **Supabase** (PostgreSQL + PostGIS + Auth)
- **FastAPI** (ML API)

### ML

- **XGBoost** (가격 예측 모델)
- **SHAP** (모델 해석)
- **PublicDataReader** (KB부동산 데이터)

---

## 프로젝트 구조

```
chamgab/
├── src/                    # Next.js 프론트엔드
│   ├── app/               # App Router 페이지
│   ├── components/        # React 컴포넌트
│   ├── hooks/             # Custom Hooks
│   ├── lib/               # 유틸리티
│   ├── services/          # API 서비스
│   ├── stores/            # Zustand 스토어
│   └── types/             # TypeScript 타입
├── ml-api/                 # FastAPI ML API
│   ├── app/
│   │   ├── api/           # API 엔드포인트
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

### Next.js API Routes

| 엔드포인트                     | 설명               |
| ------------------------------ | ------------------ |
| `GET /api/properties`          | 매물 목록          |
| `GET /api/properties/:id`      | 매물 상세          |
| `GET /api/chamgab/:id`         | 참값 분석 결과     |
| `GET /api/chamgab/:id/factors` | 가격 결정 요인     |
| `GET /api/regions/trends`      | 지역별 가격 트렌드 |

### ML API (FastAPI)

| 엔드포인트         | 설명      |
| ------------------ | --------- |
| `POST /predict`    | 가격 예측 |
| `GET /factors/:id` | SHAP 분석 |
| `GET /similar/:id` | 유사 거래 |
| `GET /health`      | 헬스체크  |

---

## E2E 테스트

```bash
# Playwright 설치
npx playwright install

# 테스트 실행
npx playwright test

# UI 모드로 실행
npx playwright test --ui
```

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

## 배포

### Frontend (Vercel)

```bash
# Vercel CLI로 배포
npx vercel
```

### ML API (Railway)

```bash
# Railway CLI로 배포
railway up
```

---

## 문서

- [PRD (제품 요구사항)](docs/planning/01-prd.md)
- [TRD (기술 요구사항)](docs/planning/02-trd.md)
- [데이터베이스 설계](docs/planning/04-database-design.md)
- [도메인 리소스](specs/domain/resources.yaml)
- [태스크 목록](TASKS.md)

---

## 라이선스

MIT License
