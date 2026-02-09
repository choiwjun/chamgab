# 토지 투자 분석 TRD (Technical Requirements Document)

> Phase 7: 기술 요구사항 명세서

---

## 1. 시스템 아키텍처

### 기존 아키텍처 확장

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                  │
│                                                          │
│  기존                          신규 (토지)               │
│  ┌──────────┐ ┌──────────┐   ┌──────────┐ ┌──────────┐ │
│  │ 아파트   │ │ 상권     │   │ 토지검색  │ │ 토지분석 │ │
│  │ 분석     │ │ 분석     │   │ /land    │ │ /land/[id]│ │
│  └────┬─────┘ └────┬─────┘   └────┬─────┘ └────┬─────┘ │
│       │            │              │             │        │
└───────┼────────────┼──────────────┼─────────────┼────────┘
        │            │              │             │
        ▼            ▼              ▼             ▼
┌─────────────────────────────────────────────────────────┐
│               API Layer (Next.js API Routes)             │
│                                                          │
│  기존                          신규                      │
│  /api/properties              /api/land/search           │
│  /api/chamgab                 /api/land/[id]             │
│  /api/commercial/*            /api/land/[id]/commercial  │
│  /api/regions                 /api/land/transactions     │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│   Supabase   │ │ FastAPI  │ │ External API │
│  PostgreSQL  │ │  ML API  │ │  (data.go.kr)│
│  + PostGIS   │ │(HF Space)│ │  (VWorld)    │
│              │ │          │ │              │
│ 신규 테이블: │ │ 기존:    │ │ 신규:        │
│ land_parcels │ │ business │ │ 토지 실거래  │
│ land_txns    │ │ _model   │ │ 공시지가     │
│ land_prices  │ │ .pkl     │ │ 토지특성     │
│ land_chars   │ │          │ │              │
└──────────────┘ └──────────┘ └──────────────┘
```

---

## 2. 데이터 수집 파이프라인

### 2.1 토지 실거래가 수집

```python
# ml-api/scripts/collect_land_transactions.py

API: https://apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade
KEY: DATA_GO_KR_API_KEY (기존 키 재사용)

Parameters:
  - LAWD_CD: 5자리 법정동코드 (regions 테이블에서 추출)
  - DEAL_YMD: YYYYMM (최근 5년)

Response Fields → DB Mapping:
  - 시군구 → sido, sigungu
  - 법정동 → eupmyeondong
  - 지번 → jibun
  - 지목 → land_category
  - 거래면적(㎡) → area_m2
  - 거래금액(만원) → price
  - 계약년/월/일 → transaction_date
```

**수집 전략:**

- 기존 `collect_all_transactions.py`와 동일한 패턴 (그룹별 병렬)
- 126개 시군구 × 60개월 = 7,560 API 호출
- GitHub Actions 워크플로우 재활용

### 2.2 공시지가 수집

```python
# ml-api/scripts/collect_land_prices.py

API: VWorld Data API 2.0
URL: https://api.vworld.kr/ned/data/getLandCharacteristics
KEY: VWORLD_API_KEY (신규 발급 필요)

Parameters:
  - pnu: 19자리 필지고유번호
  - stdrYear: 기준년도
  - format: json

Response Fields → DB Mapping:
  - 개별공시지가 → official_price_per_m2
  - 기준년도 → price_year
```

### 2.3 토지 특성 수집

```python
# ml-api/scripts/collect_land_characteristics.py

API: http://apis.data.go.kr/1611000/nsdi/LandCharacteristicsService
KEY: DATA_GO_KR_API_KEY (기존)

Response Fields → DB Mapping:
  - 지목 → land_category
  - 용도지역 → zoning
  - 토지이용상황 → land_use
  - 지형고저 → elevation_type
  - 지형형상 → terrain_shape
  - 도로접면 → road_access
```

---

## 3. API 엔드포인트 설계

### 3.1 토지 검색 API

```
GET /api/land/search
  ?q=역삼동 123        # 텍스트 검색
  &sido=서울특별시      # 시도 필터
  &sigungu=강남구       # 시군구 필터
  &land_category=대     # 지목 필터 (대, 전, 답, 임, 잡)
  &zoning=제2종일반주거  # 용도지역 필터
  &min_area=100         # 최소 면적 (m²)
  &max_area=1000        # 최대 면적 (m²)
  &page=1&limit=20

Response: {
  items: LandParcel[],
  total: number,
  page: number,
  limit: number
}
```

### 3.2 토지 상세 API

```
GET /api/land/[id]

Response: {
  parcel: LandParcel,
  official_price: OfficialPrice,
  characteristics: LandCharacteristics,
  recent_transactions: LandTransaction[],
  nearby_transactions: LandTransaction[],    # 반경 500m
  price_trend: { year: number, avg_price_per_m2: number }[]
}
```

### 3.3 토지×상권 융합 분석 API

```
GET /api/land/[id]/commercial

Response: {
  commercial_score: number,        # 0-100
  recommended_industries: {
    industry_name: string,
    industry_code: string,
    success_probability: number,   # 0-100
    factors: ShapFactor[]
  }[],
  foot_traffic: {
    daily_avg: number,
    peak_time: string,
    demographics: { age_group: string, percentage: number }[]
  },
  competition: {
    radius_500m: { industry: string, count: number }[],
    density_score: number
  },
  insights: string[]               # AI 생성 인사이트
}
```

### 3.4 토지 실거래 이력 API

```
GET /api/land/transactions
  ?sido=서울특별시
  &sigungu=강남구
  &eupmyeondong=역삼동
  &land_category=대
  &from=2020-01
  &to=2025-12
  &page=1&limit=50

Response: {
  items: LandTransaction[],
  total: number,
  stats: {
    avg_price_per_m2: number,
    median_price_per_m2: number,
    min_price_per_m2: number,
    max_price_per_m2: number,
    total_transactions: number
  }
}
```

---

## 4. FastAPI ML 엔드포인트 (Stage 2)

### 4.1 토지×상권 융합 분석

```python
# ml-api/app/api/land_commercial.py

POST /api/v1/land/commercial-analysis
Body: {
  "lat": 37.4967,
  "lng": 127.0276,
  "land_category": "대",
  "area_m2": 330,
  "zoning": "제2종일반주거지역"
}

Response: {
  "commercial_score": 82,
  "recommended_industries": [...],
  "shap_factors": [...],
  "insights": [...]
}
```

**구현 방식:**

1. 입력 좌표로 가장 가까운 `regions` 매칭 (PostGIS)
2. 해당 지역의 `business_statistics`, `foot_traffic_statistics` 조회
3. 기존 `business_model.pkl`에 feature 구성하여 업종별 예측
4. SHAP로 요인 분석
5. 룰 기반 인사이트 생성

---

## 5. 프론트엔드 페이지 구조

### 5.1 라우팅

```
/land                        # 토지 메인 (검색 + 지역별 시세)
/land/search                 # 토지 검색 결과
/land/[pnu]                  # 토지 상세 (기본 정보 + 실거래)
/land/[pnu]/commercial       # 토지×상권 융합 분석
```

### 5.2 컴포넌트 구조

```
src/components/land/
  ├── LandSearchBar.tsx          # 지번/주소 검색
  ├── LandSearchFilters.tsx      # 지목, 용도지역, 면적 필터
  ├── LandParcelCard.tsx         # 토지 카드 (목록)
  ├── LandDetailHeader.tsx       # 토지 상세 헤더 (지번, 지목, 면적)
  ├── LandPriceInfo.tsx          # 공시지가 + 실거래 비교
  ├── LandTransactionHistory.tsx # 실거래 이력 테이블
  ├── LandPriceTrend.tsx         # 시세 추이 차트
  ├── LandCharacteristics.tsx    # 토지 특성 (용도지역, 도로접면 등)
  ├── LandNearbyMap.tsx          # 주변 토지 거래 지도
  ├── CommercialScore.tsx        # 상업적 활용도 점수
  ├── IndustryRecommend.tsx      # 추천 업종 리스트
  ├── CommercialFactors.tsx      # SHAP 요인 분석 차트
  └── CommercialInsights.tsx     # AI 인사이트
```

---

## 6. 기술 스택 (추가분)

| 영역     | 기술            | 용도                 |
| -------- | --------------- | -------------------- |
| 지도     | Kakao Maps SDK  | 필지 표시, 주변 토지 |
| 차트     | Recharts (기존) | 시세 추이, SHAP 차트 |
| API 키   | VWORLD_API_KEY  | 공시지가, 토지특성   |
| 공간쿼리 | PostGIS (기존)  | 좌표 기반 주변 검색  |

---

## 7. 환경 변수 (추가)

```env
# .env (신규)
VWORLD_API_KEY=           # VWorld 공간정보 API (공시지가, 토지특성)
# DATA_GO_KR_API_KEY=     # 기존 키로 토지 실거래 API 사용 가능
```

---

## 8. 성능 요구사항

| 항목                      | 목표                         |
| ------------------------- | ---------------------------- |
| 토지 검색 응답            | < 500ms                      |
| 토지 상세 페이지 로드     | < 1s                         |
| 토지×상권 융합 분석       | < 3s                         |
| 토지 실거래 수집 (전국)   | 1일 내 완료 (GitHub Actions) |
| 공시지가 수집 (주요 도시) | 2일 내 완료                  |

---

## 9. 보안

| 항목          | 방법                            |
| ------------- | ------------------------------- |
| API 키 보호   | 환경변수, 서버 사이드 호출만    |
| 입력 검증     | sanitizeFilterInput 재사용      |
| RLS           | land_parcels에 public read 정책 |
| Rate limiting | 융합 분석 API에 분당 10회 제한  |
