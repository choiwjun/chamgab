# Database Design

## 참값(Chamgab) 데이터베이스 설계

---

## 1. 개요

| 항목 | 내용 |
|------|------|
| DBMS | PostgreSQL 15+ (Supabase) |
| Extension | PostGIS (공간 데이터) |
| 인증 | Supabase Auth |
| 보안 | Row Level Security (RLS) |

---

## 2. ERD (Entity Relationship Diagram)

```
┌──────────────────┐       ┌──────────────────┐
│      users       │       │    complexes     │
├──────────────────┤       ├──────────────────┤
│ id (PK)          │       │ id (PK)          │
│ email            │       │ name             │
│ name             │       │ address          │
│ tier             │       │ total_units      │
│ ...              │       │ built_year       │
└────────┬─────────┘       └────────┬─────────┘
         │                          │
         │                          │ 1:N
         │                          │
         │    ┌──────────────────┐  │
         │    │    properties    │◄─┘
         │    ├──────────────────┤
         │    │ id (PK)          │
         │    │ property_type    │
         │    │ name             │
         │    │ address          │
         │    │ location (GIS)   │
         │    │ complex_id (FK)  │
         │    └────────┬─────────┘
         │             │
         │             │ 1:N
         │             │
         │    ┌────────▼─────────┐
         │    │ chamgab_analyses │
         │    ├──────────────────┤
         │    │ id (PK)          │
         │    │ property_id (FK) │
         │    │ chamgab_price    │
         │    │ min_price        │
         │    │ max_price        │
         │    │ confidence       │
         │    └────────┬─────────┘
         │             │
         │             │ 1:N
         │             │
         │    ┌────────▼─────────┐
         │    │  price_factors   │
         │    ├──────────────────┤
         │    │ id (PK)          │
         │    │ analysis_id (FK) │
         │    │ factor_name      │
         │    │ contribution     │
         │    │ rank             │
         │    └──────────────────┘
         │
         │ 1:N
         │
┌────────▼─────────┐       ┌──────────────────┐
│    favorites     │       │   transactions   │
├──────────────────┤       ├──────────────────┤
│ id (PK)          │       │ id (PK)          │
│ user_id (FK)     │       │ property_id (FK) │
│ property_id (FK) │       │ price            │
│ alert_enabled    │       │ transaction_date │
└──────────────────┘       │ floor            │
                           └──────────────────┘
```

---

## 3. 테이블 상세

### 3.1 users (사용자)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100),
  tier VARCHAR(20) DEFAULT 'free', -- free, premium, business
  daily_analysis_count INT DEFAULT 0,
  daily_analysis_reset_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS 정책
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data"
  ON users FOR SELECT
  USING (auth.uid() = id);
```

### 3.2 properties (매물)

```sql
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_type VARCHAR(20) NOT NULL, -- apt, officetel, villa, store, land, building
  name VARCHAR(200) NOT NULL,
  address VARCHAR(500) NOT NULL,
  sido VARCHAR(20) NOT NULL,
  sigungu VARCHAR(50) NOT NULL,
  eupmyeondong VARCHAR(50),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  area_exclusive DECIMAL(10,2), -- 전용면적
  area_land DECIMAL(10,2), -- 대지면적
  built_year INT,
  floors INT,
  complex_id UUID REFERENCES complexes(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 공간 인덱스
CREATE INDEX idx_properties_location
  ON properties USING GIST(location);

-- 검색 인덱스
CREATE INDEX idx_properties_name
  ON properties USING gin(name gin_trgm_ops);

CREATE INDEX idx_properties_type_region
  ON properties(property_type, sido, sigungu);
```

### 3.3 complexes (단지 - 아파트용)

```sql
CREATE TABLE complexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  address VARCHAR(500) NOT NULL,
  sido VARCHAR(20) NOT NULL,
  sigungu VARCHAR(50) NOT NULL,
  eupmyeondong VARCHAR(50),
  location GEOGRAPHY(POINT, 4326),
  total_units INT,
  total_buildings INT,
  built_year INT,
  parking_ratio DECIMAL(5,2),
  floor_area_ratio DECIMAL(6,2), -- 용적률
  building_coverage_ratio DECIMAL(5,2), -- 건폐율
  brand VARCHAR(50), -- 래미안, 자이 등
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3.4 chamgab_analyses (참값 분석)

```sql
CREATE TABLE chamgab_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  chamgab_price BIGINT NOT NULL,
  min_price BIGINT NOT NULL,
  max_price BIGINT NOT NULL,
  confidence DECIMAL(5,4) NOT NULL, -- 0.0000 ~ 1.0000
  yield_rate DECIMAL(5,2), -- 수익률 (상업용)
  cap_rate DECIMAL(5,2), -- Cap Rate (빌딩용)
  model_version VARCHAR(20),
  valid_until TIMESTAMP,
  analyzed_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT confidence_range CHECK (confidence >= 0 AND confidence <= 1)
);

-- 분석 조회 인덱스
CREATE INDEX idx_chamgab_property_date
  ON chamgab_analyses(property_id, analyzed_at DESC);
```

### 3.5 price_factors (가격 요인)

```sql
CREATE TABLE price_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES chamgab_analyses(id) ON DELETE CASCADE,
  factor_name VARCHAR(50) NOT NULL,
  factor_category VARCHAR(30), -- 입지, 건물, 단지, 학군, 편의, 개발
  factor_value VARCHAR(100),
  contribution BIGINT NOT NULL, -- 기여도 (원)
  contribution_pct DECIMAL(5,2), -- 기여도 (%)
  direction VARCHAR(10) NOT NULL, -- positive, negative
  rank INT NOT NULL,
  description TEXT,

  CONSTRAINT direction_check CHECK (direction IN ('positive', 'negative'))
);

CREATE INDEX idx_factors_analysis
  ON price_factors(analysis_id);
```

### 3.6 transactions (실거래)

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  complex_id UUID REFERENCES complexes(id),
  price BIGINT NOT NULL,
  transaction_date DATE NOT NULL,
  area_exclusive DECIMAL(10,2),
  floor INT,
  is_new BOOLEAN DEFAULT FALSE, -- 신규/재거래
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transactions_property
  ON transactions(property_id, transaction_date DESC);

CREATE INDEX idx_transactions_date
  ON transactions(transaction_date DESC);
```

### 3.7 favorites (관심 매물)

```sql
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  alert_enabled BOOLEAN DEFAULT TRUE,
  alert_threshold DECIMAL(5,2) DEFAULT 3.0, -- 변동률 임계값 (%)
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, property_id)
);

-- RLS 정책
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own favorites"
  ON favorites FOR ALL
  USING (auth.uid() = user_id);
```

### 3.8 notifications (알림)

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL, -- chamgab_changed, transaction_new, report_ready
  title VARCHAR(200) NOT NULL,
  body TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id)
  WHERE is_read = FALSE;
```

### 3.9 subscriptions (구독)

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL, -- premium_monthly, premium_yearly, business
  status VARCHAR(20) NOT NULL, -- active, canceled, expired
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.10 payments (결제)

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  subscription_id UUID REFERENCES subscriptions(id),
  amount INT NOT NULL,
  currency VARCHAR(3) DEFAULT 'KRW',
  status VARCHAR(20) NOT NULL, -- pending, completed, failed, refunded
  payment_method VARCHAR(20), -- card, transfer
  pg_provider VARCHAR(20), -- toss
  pg_transaction_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 4. 인덱스 전략

### 4.1 공간 인덱스 (PostGIS)

```sql
-- 위치 기반 검색
CREATE INDEX idx_properties_location
  ON properties USING GIST(location);

-- 반경 검색 쿼리 예시
SELECT * FROM properties
WHERE ST_DWithin(
  location,
  ST_SetSRID(ST_MakePoint(127.0, 37.5), 4326)::geography,
  1000 -- 1km 반경
);
```

### 4.2 텍스트 검색 인덱스

```sql
-- 트라이그램 확장 활성화
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 유사 검색용 인덱스
CREATE INDEX idx_properties_name
  ON properties USING gin(name gin_trgm_ops);
```

---

## 5. 주요 쿼리

### 5.1 참값 분석 결과 조회

```sql
SELECT
  p.id,
  p.name,
  p.address,
  ca.chamgab_price,
  ca.min_price,
  ca.max_price,
  ca.confidence,
  json_agg(
    json_build_object(
      'rank', pf.rank,
      'name', pf.factor_name,
      'contribution', pf.contribution,
      'direction', pf.direction
    ) ORDER BY pf.rank
  ) as factors
FROM properties p
JOIN chamgab_analyses ca ON ca.property_id = p.id
JOIN price_factors pf ON pf.analysis_id = ca.id
WHERE p.id = :property_id
  AND ca.analyzed_at = (
    SELECT MAX(analyzed_at)
    FROM chamgab_analyses
    WHERE property_id = p.id
  )
GROUP BY p.id, ca.id;
```

### 5.2 유사 거래 검색

```sql
SELECT
  t.*,
  p.name,
  ST_Distance(p.location, :target_location) as distance
FROM transactions t
JOIN properties p ON p.id = t.property_id
WHERE p.property_type = :property_type
  AND ST_DWithin(p.location, :target_location, 1000)
  AND ABS(p.area_exclusive - :target_area) / :target_area < 0.1
  AND t.transaction_date > NOW() - INTERVAL '12 months'
ORDER BY
  ST_Distance(p.location, :target_location),
  t.transaction_date DESC
LIMIT 10;
```
