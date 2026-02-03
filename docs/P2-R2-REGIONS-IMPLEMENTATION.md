# P2-R2: Regions Resource 구현

## 개요

**태스크**: P2-R2 - Regions Resource (Backend)
**상태**: COMPLETED (GREEN)
**테스트**: 28/28 통과 (59 tests total)

---

## 구현 내용

### 1. 데이터 모델 (TypeScript Types)

**파일**: `src/types/region.ts`

#### Region 인터페이스
```typescript
interface Region {
  id: string
  code: string           // 법정동코드 (10자리, UNIQUE)
  name: string           // 지역명
  level: 1 | 2 | 3       // 1: 시도, 2: 시군구, 3: 읍면동
  parent_code?: string   // 상위 지역 코드
  latitude?: number
  longitude?: number
  avg_price?: number     // 캐시
  price_change_weekly?: number  // 캐시
  created_at: string
  updated_at: string
}
```

#### 계층형 Region
```typescript
interface RegionWithChildren extends Region {
  children?: RegionWithChildren[]
}
```

#### 가격 트렌드
```typescript
interface RegionTrend {
  id: string
  name: string
  level: 1 | 2 | 3
  avg_price?: number
  price_change_weekly?: number
  property_count?: number
}
```

---

### 2. 데이터베이스 스키마

**파일**: `supabase/migrations/003_create_regions.sql`

#### 테이블 구조
```sql
CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(50) NOT NULL,
  level INT NOT NULL CHECK (level IN (1, 2, 3)),
  parent_code VARCHAR(10),
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  avg_price BIGINT,
  price_change_weekly DECIMAL(5, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 인덱스 전략
- `idx_regions_level`: 레벨 기반 쿼리 최적화
- `idx_regions_parent`: 상위 지역 조회 최적화
- `idx_regions_code`: 법정동코드 빠른 조회
- `idx_regions_name`: 지역명 검색 최적화

#### 외래키 제약
```sql
ALTER TABLE regions
ADD CONSTRAINT fk_regions_parent_code
FOREIGN KEY (parent_code)
REFERENCES regions (code)
ON DELETE RESTRICT;
```

#### RLS 정책
- 공개 읽기 (SELECT)
- 관리자만 쓰기/수정 가능

---

### 3. 시드 데이터

**파일**: `supabase/seed/regions.sql`

#### 데이터 계층 구조

```
서울시 (시도) - Level 1
├── 강남구 (시군구) - Level 2
│   ├── 역삼1동 (읍면동) - Level 3
│   ├── 역삼2동 - Level 3
│   ├── 강남동 - Level 3
│   └── ... (7개 동)
├── 서초구 - Level 2
│   ├── 방배동 - Level 3
│   ├── 반포1동 - Level 3
│   └── ... (5개 동)
└── ... (9개 구)
```

#### 포함된 지역
- **시도**: 1개 (서울시)
- **시군구**: 10개 (강남구, 서초구, 송파구 등)
- **읍면동**: 14개 (강남구 8개, 서초구 6개)

#### 트렌드 데이터 (샘플)
```
강남구: avg_price=3.5B, price_change_weekly=+0.5%
서초구: avg_price=4.2B, price_change_weekly=-0.2%
송파구: avg_price=3.2B, price_change_weekly=+0.3%
```

---

### 4. API 엔드포인트

#### A. GET /api/regions - 지역 목록 조회

**쿼리 파라미터**:
- `level`: 계층 필터 (1, 2, 3)
- `parent_code`: 상위 지역 코드
- `keyword`: 지역명 검색
- `page`: 페이지 번호 (기본: 1)
- `limit`: 페이지 사이즈 (기본: 50, 최대: 100)

**응답 예시**:
```json
{
  "data": [
    {
      "id": "...",
      "code": "1100000000",
      "name": "서울시",
      "level": 1,
      "children": [
        {
          "id": "...",
          "code": "1111000000",
          "name": "강남구",
          "level": 2,
          "parent_code": "1100000000",
          "children": [...]
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "pages": 2
  }
}
```

#### B. GET /api/regions/trends - 가격 트렌드

**쿼리 파라미터**:
- `level`: 조회 레벨 (기본: 2)
- `limit`: 반환 개수 (기본: 10, 최대: 50)
- `sort`: 정렬 기준 ('price_change' 또는 'avg_price', 기본: 'price_change')

**응답 예시**:
```json
{
  "data": [
    {
      "id": "...",
      "name": "강남구",
      "level": 2,
      "avg_price": 3500000000,
      "price_change_weekly": 0.5,
      "property_count": 1230
    },
    {
      "id": "...",
      "name": "송파구",
      "level": 2,
      "avg_price": 3200000000,
      "price_change_weekly": 0.3,
      "property_count": 890
    }
  ],
  "metadata": {
    "level": 2,
    "limit": 10,
    "sort": "price_change",
    "count": 2
  }
}
```

---

### 5. 서비스 계층

**파일**: `src/services/regions.ts`

#### RegionService 클래스 메서드

1. **listRegions(params)** - 페이지네이션 포함 지역 조회
2. **getRegionByCode(code)** - 단일 지역 조회
3. **getHierarchicalRegions(sidoCode?)** - 계층형 구조 조회
4. **getChildRegions(parentCode)** - 자식 지역 조회
5. **getTrends(level, limit, sort)** - 가격 트렌드 조회
6. **updateRegionPrice(code, data)** - 가격 정보 업데이트 (관리자)
7. **searchRegions(keyword, limit)** - 자동완성용 검색

---

### 6. 테스트 커버리지

#### 테스트 파일

| 파일 | 테스트 수 | 상태 |
|------|---------|------|
| `__tests__/regions.test.ts` | 12 | ✅ 통과 |
| `__tests__/api/regions.test.ts` | 16 | ✅ 통과 |
| **총계** | **28** | ✅ **통과** |

#### 테스트 범위

**Regions 스키마 검증 (12개)**:
- 필드 유효성 검사
- 계층형 구조 (시도 → 시군구 → 읍면동)
- 위치 정보 범위 검증
- 가격 캐시 필드
- 샘플 데이터 유효성

**API 기능 테스트 (16개)**:
- 지역 목록 조회 (필터, 검색, 페이지네이션)
- 계층형 구조 반환
- 가격 트렌드 조회 (정렬, 필터링)
- 에러 처리 (유효성 검사, 한도 제한)
- property_count 포함

---

### 7. 파일 구조

```
worktree/phase-2-core/
├── src/
│   ├── types/
│   │   └── region.ts                      # ✅ Region 타입 정의
│   ├── services/
│   │   └── regions.ts                     # ✅ RegionService 클래스
│   └── app/api/
│       └── regions/
│           ├── route.ts                   # ✅ GET /api/regions
│           └── trends/
│               └── route.ts               # ✅ GET /api/regions/trends
├── supabase/
│   ├── migrations/
│   │   └── 003_create_regions.sql         # ✅ DB 스키마
│   └── seed/
│       └── regions.sql                    # ✅ 시드 데이터
└── __tests__/
    ├── regions.test.ts                    # ✅ 타입 검증 테스트
    └── api/regions.test.ts                # ✅ API 기능 테스트
```

---

## TDD 워크플로우 완료

### 1. RED Phase ✅
- 테스트 먼저 작성
- 모든 요구사항을 테스트로 명시

### 2. GREEN Phase ✅
- 타입 정의 구현
- 마이그레이션 작성
- API 라우트 구현
- 시드 데이터 작성
- 모든 28개 테스트 통과

### 3. REFACTOR Phase ✅
- 서비스 계층 추가 (비즈니스 로직 분리)
- 인덱스 최적화
- RLS 정책 설정
- 에러 처리 강화

---

## 주요 특징

### 계층형 지역 구조 지원
```javascript
// 최상위 조회 시 자동으로 계층 구조 반환
GET /api/regions
응답: [
  { name: "서울시", level: 1, children: [
    { name: "강남구", level: 2, children: [
      { name: "역삼1동", level: 3 }
    ]}
  ]}
]
```

### 성능 최적화
- 인덱스 4개 (level, parent, code, name)
- 페이지네이션 (기본 50개, 최대 100개)
- 계층 쿼리 시 N+1 최소화 (캐싱 고려)

### 캐싱 전략
- `avg_price`: 지역별 평균 가격 (캐시)
- `price_change_weekly`: 주간 변동률 (캐시)
- Redis 연동 예정 (Phase 3)

---

## 다음 단계

### P2-R2-T2 완료 후
1. **홈 화면 (P2-S1)** - PriceTrends 섹션에서 `/api/regions/trends` 사용
2. **검색 페이지 (P2-S2)** - RegionFilter 컴포넌트에서 계층형 드롭다운 구현
3. **Redis 캐싱 (P3)** - 트렌드 데이터 캐싱

### 확장성
- 전국 모든 시도/시군구/읍면동 데이터 추가 예정
- 가격 이력 데이터 추가 (price_history 테이블)
- 시계열 분석 (시간별 가격 변화)

---

## 체크리스트

- [x] P2-R2-T1: Regions 테이블 생성
  - [x] TypeScript 타입 정의
  - [x] Supabase Migration 작성
  - [x] 시드 데이터 작성
  - [x] 테스트 작성 및 통과

- [x] P2-R2-T2: Regions API
  - [x] `GET /api/regions` 구현
  - [x] `GET /api/regions/trends` 구현
  - [x] API 테스트 작성 및 통과
  - [x] 서비스 계층 구현

- [x] 성능 최적화
  - [x] 인덱스 설정
  - [x] 페이지네이션
  - [x] RLS 정책

---

## 완료 신호

```
✅ TASK_DONE: P2-R2 - Regions Resource

검증 결과:
- TypeScript 타입: ✅ 완료
- 마이그레이션 파일: ✅ 완료
- 시드 데이터: ✅ 완료
- API 라우트: ✅ 완료
- 서비스 계층: ✅ 완료
- 테스트: ✅ 28/28 통과
- 태그 시스템: ✅ 적용됨
```

---

## TAG 시스템

모든 파일에 @TASK와 @SPEC 태그 적용:

```
@TASK P2-R2 - 지역 정보 (Regions) 리소스
@SPEC docs/planning/04-database-design.md#regions-table
@SPEC specs/domain/resources.yaml#regions
```

---

## 커밋 메시지

```
P2-R2: Regions Resource 구현 (타입, 마이그레이션, API, 테스트)

- TypeScript 타입 정의 (Region, RegionWithChildren, RegionTrend)
- Supabase 마이그레이션 (테이블, 인덱스, RLS)
- 시드 데이터 (서울시 시도/시군구/읍면동)
- API 라우트 (GET /api/regions, GET /api/regions/trends)
- 서비스 계층 (RegionService)
- 테스트 (28개 모두 통과)

마이그레이션 실행:
  supabase migration up

시드 데이터 적용:
  supabase db push --seeded

테스트 실행:
  npm test -- --run
```
