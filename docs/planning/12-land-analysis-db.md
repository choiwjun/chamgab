# 토지 투자 분석 Database Design

> Phase 7: 데이터베이스 설계

---

## 1. ERD

```
┌──────────────────┐
│   regions (기존)  │
│   126개 시군구    │
└────────┬─────────┘
         │ 1:N
         │
┌────────▼─────────┐       ┌──────────────────┐
│   land_parcels   │       │  land_prices     │
├──────────────────┤       ├──────────────────┤
│ id (PK)          │  1:N  │ id (PK)          │
│ pnu (UNIQUE)     ├──────►│ parcel_id (FK)   │
│ sido             │       │ price_year       │
│ sigungu          │       │ official_price   │
│ eupmyeondong     │       │   _per_m2        │
│ jibun            │       └──────────────────┘
│ land_category    │
│ zoning           │       ┌──────────────────┐
│ area_m2          │       │ land_chars       │
│ location (GIS)   │  1:1  ├──────────────────┤
│                  ├──────►│ id (PK)          │
└────────┬─────────┘       │ parcel_id (FK)   │
         │                 │ land_use         │
         │ 1:N             │ elevation_type   │
         │                 │ terrain_shape    │
┌────────▼─────────┐      │ road_access      │
│ land_transactions│      └──────────────────┘
├──────────────────┤
│ id (PK)          │
│ parcel_id (FK)   │   ← NULL 가능 (매칭 안 된 경우)
│ sido             │
│ sigungu          │
│ eupmyeondong     │
│ jibun            │
│ land_category    │
│ area_m2          │
│ price            │
│ price_per_m2     │
│ transaction_date │
└──────────────────┘

기존 테이블 (재활용)
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│business_statistics│  │foot_traffic_stats│  │  poi_data        │
│  (143,595건)     │  │   (1,180건)      │  │  (124 regions)   │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 2. 테이블 상세

### 2.1 land_parcels (토지 필지)

```sql
-- supabase/migrations/021_create_land_parcels.sql

CREATE TABLE land_parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 필지 고유번호 (19자리: 시도2+시군구3+읍면동3+리3+본번4+부번4)
  pnu VARCHAR(19) UNIQUE NOT NULL,

  -- 위치 정보
  sido VARCHAR(20) NOT NULL,
  sigungu VARCHAR(50) NOT NULL,
  eupmyeondong VARCHAR(50),
  jibun VARCHAR(20),

  -- 토지 기본 정보
  land_category VARCHAR(10) NOT NULL,   -- 지목: 대, 전, 답, 임, 잡, 공, 도 등
  zoning VARCHAR(50),                    -- 용도지역: 제1종일반주거, 상업, 공업 등
  area_m2 NUMERIC(12,2),                 -- 면적 (m²)

  -- 공간 데이터
  location GEOGRAPHY(POINT, 4326),

  -- 최신 공시지가 (빠른 조회용 비정규화)
  latest_official_price_per_m2 NUMERIC(12,0),  -- 원/m²
  latest_official_price_year INT,

  -- 최신 실거래가 (빠른 조회용 비정규화)
  latest_transaction_price NUMERIC(15,0),       -- 만원
  latest_transaction_date DATE,
  latest_price_per_m2 NUMERIC(12,0),            -- 원/m²

  -- 메타
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_land_parcels_location ON land_parcels USING GIST (location);
CREATE INDEX idx_land_parcels_sigungu ON land_parcels (sigungu);
CREATE INDEX idx_land_parcels_category ON land_parcels (land_category);
CREATE INDEX idx_land_parcels_zoning ON land_parcels (zoning);
CREATE INDEX idx_land_parcels_pnu ON land_parcels (pnu);

-- RLS (공개 읽기)
ALTER TABLE land_parcels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON land_parcels FOR SELECT USING (true);
```

**지목 코드 매핑:**

| 코드 | 지목     | 설명        |
| ---- | -------- | ----------- |
| 대   | 대지     | 건축물 부지 |
| 전   | 전       | 농경지 (밭) |
| 답   | 답       | 논          |
| 임   | 임야     | 산림        |
| 잡   | 잡종지   | 기타        |
| 공   | 공장용지 | 공장        |
| 도   | 도로     | 도로        |
| 학   | 학교용지 | 학교        |
| 주   | 주차장   | 주차장      |
| 목   | 목장용지 | 목장        |

### 2.2 land_transactions (토지 실거래)

```sql
-- supabase/migrations/022_create_land_transactions.sql

CREATE TABLE land_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 필지 연결 (매칭 가능한 경우)
  parcel_id UUID REFERENCES land_parcels(id),

  -- 위치
  sido VARCHAR(20) NOT NULL,
  sigungu VARCHAR(50) NOT NULL,
  eupmyeondong VARCHAR(50),
  jibun VARCHAR(20),

  -- 토지 정보
  land_category VARCHAR(10),           -- 지목
  area_m2 NUMERIC(12,2) NOT NULL,     -- 거래면적

  -- 거래 정보
  price NUMERIC(15,0) NOT NULL,        -- 거래금액 (만원)
  price_per_m2 NUMERIC(12,0),          -- 단가 (원/m²) - 계산값
  transaction_date DATE NOT NULL,       -- 계약일
  transaction_type VARCHAR(20),         -- 매매, 교환 등

  -- 기타
  is_partial_sale BOOLEAN DEFAULT FALSE, -- 지분거래 여부
  is_cancelled BOOLEAN DEFAULT FALSE,    -- 해제 여부

  -- 메타
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_land_txn_sigungu ON land_transactions (sigungu);
CREATE INDEX idx_land_txn_date ON land_transactions (transaction_date DESC);
CREATE INDEX idx_land_txn_category ON land_transactions (land_category);
CREATE INDEX idx_land_txn_parcel ON land_transactions (parcel_id);

-- RLS
ALTER TABLE land_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON land_transactions FOR SELECT USING (true);
```

### 2.3 land_prices (공시지가 이력)

```sql
-- supabase/migrations/023_create_land_prices.sql

CREATE TABLE land_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  parcel_id UUID NOT NULL REFERENCES land_parcels(id),
  price_year INT NOT NULL,                        -- 기준년도
  official_price_per_m2 NUMERIC(12,0) NOT NULL,  -- 개별공시지가 (원/m²)

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(parcel_id, price_year)
);

-- 인덱스
CREATE INDEX idx_land_prices_parcel ON land_prices (parcel_id);
CREATE INDEX idx_land_prices_year ON land_prices (price_year DESC);

-- RLS
ALTER TABLE land_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON land_prices FOR SELECT USING (true);
```

### 2.4 land_characteristics (토지 특성)

```sql
-- supabase/migrations/024_create_land_characteristics.sql

CREATE TABLE land_characteristics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  parcel_id UUID NOT NULL REFERENCES land_parcels(id) UNIQUE,

  -- 토지 특성
  land_use VARCHAR(50),          -- 토지이용상황 (주거, 상업, 공업 등)
  elevation_type VARCHAR(20),    -- 지형고저 (저지, 평지, 완경사, 급경사)
  terrain_shape VARCHAR(20),     -- 지형형상 (정방형, 가장형, 삼각형, 부정형)
  road_access VARCHAR(50),       -- 도로접면 (광대로, 중로, 소로, 세로, 맹지)
  road_distance VARCHAR(20),     -- 도로거리

  -- 규제 정보
  zoning_detail VARCHAR(100),    -- 세부 용도지역
  building_coverage NUMERIC(5,2), -- 건폐율 (%)
  floor_area_ratio NUMERIC(6,2),  -- 용적률 (%)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE land_characteristics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON land_characteristics FOR SELECT USING (true);
```

---

## 3. 데이터 규모 추정

| 테이블               | 예상 건수 | 근거                         |
| -------------------- | --------- | ---------------------------- |
| land_parcels         | ~50,000   | 주요 도시 대지+상업용지 위주 |
| land_transactions    | ~200,000  | 전국 5년간 토지 실거래       |
| land_prices          | ~100,000  | 50,000 필지 × 2년            |
| land_characteristics | ~50,000   | 필지당 1건                   |

---

## 4. 수집 스크립트

### 4.1 토지 실거래 수집

```
ml-api/scripts/collect_land_transactions.py
  --group N          # 지역 그룹 (기존 아파트 수집과 동일 그룹)
  --months 60        # 수집 기간 (5년)
  --clean            # 기존 데이터 삭제 후 재수집
```

### 4.2 필지 생성

```
ml-api/scripts/create_land_parcels.py
  # land_transactions에서 고유 필지를 추출하여 land_parcels 생성
  # (아파트: create_complexes_from_transactions.py와 동일 패턴)
```

### 4.3 공시지가 수집

```
ml-api/scripts/collect_land_prices.py
  --year 2024        # 기준년도
  --sigungu 강남구   # 특정 시군구만
  --all              # 전체
```

### 4.4 토지 특성 수집

```
ml-api/scripts/collect_land_characteristics.py
  # land_parcels의 PNU를 기반으로 토지특성정보 API 호출
```

---

## 5. 마이그레이션 순서

```
021_create_land_parcels.sql
022_create_land_transactions.sql
023_create_land_prices.sql
024_create_land_characteristics.sql
```

현재 마이그레이션: 002~020. 번호 021부터 시작.
