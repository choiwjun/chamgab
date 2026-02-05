# 지역별/상권별 유동인구 데이터 수집 방법

## 개요

부동산 가격 예측 모델에 활용할 지역별/상권별 유동인구 데이터 수집 방법을 정리합니다.

---

## 1. 데이터 출처 및 방법

### 1.1 소상공인시장진흥공단 상가(상권)정보 API ⭐ 추천

**장점:**
- 무료 (공공데이터포털)
- PublicDataReader 라이브러리로 간편 사용 가능
- 전국 약 200만 상가업소 정보 제공
- 상권번호, 업종별 분류 제공

**제한사항:**
- 직접적인 유동인구 수치는 없음 (상권 정보 기반 추정 필요)
- 개발계정: 10,000건/일 트래픽 제한

**접근 방법:**
1. 공공데이터포털(data.go.kr) 회원가입
2. "소상공인시장진흥공단_상가(상권)정보" API 활용신청
3. API 키 발급
4. PublicDataReader 라이브러리 사용

**데이터 항목:**
- 상호명, 주소, 상권번호, 상권업종명
- 경도, 위도 (위치 정보)
- 업종코드 (대/중/소분류)

**갱신주기:** 분기별

---

### 1.2 서울열린데이터광장 (서울시 한정)

**서비스:**
- 서울시 상권분석서비스 (길단위인구-상권)
- 실시간 유동인구측정정보 (S-DoT)

**데이터:**
- 상권 영역 내 생활인구 정보 (월간)
- 실시간 유동인구 (5분 단위, 120개 주요 장소)
- 직장인구 정보 (반기)

**접근 방법:**
- 서울열린데이터광장(data.seoul.go.kr) 회원가입
- OpenAPI 키 발급
- REST API 호출

**제한사항:**
- 서울시 데이터만 제공
- API 트래픽 제한 있음

---

### 1.3 SKT 지오비전 퍼즐 (유료, 고정밀)

**장점:**
- 국가승인통계 인증 (2014년)
- 50m² pCell 단위 정밀도
- 5분 단위 실시간 분석 가능
- 약 2,700만 유동인구 데이터 기반

**제한사항:**
- 유료 서비스 (기업 대상)
- API 접근 제한적

**활용:**
- 상업적 프로젝트에서 고정밀 데이터 필요 시
- KB국민카드, 서울신용보증재단 등과 협력 사례 있음

---

## 2. 수집 가능한 지표

### 2.1 ✅ 상가업소 수 (밀도)

**수집 방법:**
- 소상공인시장진흥공단 상가(상권)정보 API
- 시군구별 상가업소 조회 → 총 개수 집계

**지표:**
- `total_stores`: 상가업소 총 개수
- 상권 밀도 = 상가업소 수 / 면적 (향후 추가 가능)

**상태:** ✅ 구현 완료

---

### 2.2 ✅ 업종 다양성

**수집 방법:**
- 상가업소 데이터의 업종 중분류 기준
- 고유 업종 수 / 총 상가업소 수

**지표:**
- `category_count`: 고유 업종 수
- `category_diversity`: 업종 다양성 비율 (%)

**상태:** ✅ 구현 완료

---

### 2.3 ✅ 프랜차이즈 점포 비율

**수집 방법:**
- 상호명에 프랜차이즈 키워드 매칭
- 프랜차이즈 점포 수 / 총 상가업소 수

**지표:**
- `franchise_count`: 프랜차이즈 점포 수
- `franchise_ratio`: 프랜차이즈 비율 (%)

**상태:** ✅ 구현 완료

---

### 2.4 ✅ 교통 접근성 (지하철역 거리)

**수집 방법:**
- 공공데이터포털 지하철역 위치 데이터 (CSV)
- Haversine 공식으로 거리 계산
- 반경 내 역 개수 집계

**데이터 출처:**
- 서울교통공사 1~8호선 역사좌표 정보
- https://www.data.go.kr/data/15099316/fileData.do
- CSV 파일 다운로드 후 `scripts/data/subway_stations.csv`에 저장

**지표:**
- `distance_to_subway`: 가장 가까운 지하철역까지 거리 (m)
- `subway_count_500m`: 500m 이내 역 개수
- `subway_count_1km`: 1km 이내 역 개수
- `transit_score`: 교통 접근성 점수 (0-100)

**사용법:**
```bash
python -m scripts.collect_footfall_data --region 서울 --sigungu 강남구 --include-transit
```

**상태:** ✅ 구현 완료 (지하철역 데이터 파일 필요)

---

### 2.5 ✅ 주변 시설 밀도 (POI)

**수집 방법:**
- 학교, 병원, 공원 등 주변 시설 데이터 수집
- 반경 내 시설 개수 집계

**데이터 출처:**

1. **병원 데이터** ✅
   - 국립중앙의료원 전국 병·의원찾기서비스 API
   - 공공데이터포털: https://www.data.go.kr/data/15000736/openapi.do
   - REST API, XML 형식
   - 위치정보 조회 가능 (위도/경도)
   - 트래픽: 개발계정 1,000회/일

2. **공원 데이터** ✅
   - 전국도시공원정보 표준데이터
   - 공공데이터포털: https://www.data.go.kr/data/15012890/standard.do
   - CSV/JSON 다운로드 또는 오픈API 제공
   - 위도/경도 포함
   - 총 235개 지자체 데이터

3. **학교 데이터** ✅
   - 전국초중등학교위치표준데이터
   - 공공데이터포털: https://www.data.go.kr/data/15021148/standard.do
   - CSV/JSON 다운로드 가능
   - 위도/경도 포함
   - 갱신주기: 반기

**지표:**
- `school_count_500m`: 500m 이내 학교 수
- `school_count_1km`: 1km 이내 학교 수
- `hospital_count_500m`: 500m 이내 병원 수
- `hospital_count_1km`: 1km 이내 병원 수
- `park_count_500m`: 500m 이내 공원 수
- `park_count_1km`: 1km 이내 공원 수
- `poi_score`: POI 종합 점수 (0-100)

**사용법:**
```bash
# POI 데이터 파일 준비 후
python -m scripts.collect_footfall_data --region 서울 --sigungu 강남구 --include-poi
```

**상태:** ✅ 수집 가능 확인 완료, 구현 진행 중

---

## 3. 구현 방법

### 3.1 PublicDataReader를 사용한 상권정보 수집

**설치:**
```bash
pip install PublicDataReader --upgrade
```

**기본 사용법:**
```python
from PublicDataReader import Store

# API 키 설정 (공공데이터포털에서 발급)
service_key = "YOUR_API_KEY"
api = Store(service_key)

# 상권번호로 조회
df = api.get_data(
    service="소상공인시장진흥공단_상가(상권)정보",
    operation="지정상권상가조회",
    상권번호="3110001"
)

# 시군구별 상가업소 조회
df = api.get_data(
    service="소상공인시장진흥공단_상가(상권)정보",
    operation="시군구별상가업소조회",
    시도명="서울특별시",
    시군구명="강남구"
)
```

---

### 2.2 유동인구 추정 방법

**직접적인 유동인구 API가 없는 경우, 다음 지표로 추정 가능:**

1. **상권 활성도 지표**
   - 상가업소 수 (밀도)
   - 업종 다양성 (카페, 음식점, 쇼핑몰 등)
   - 프랜차이즈 점포 비율

2. **교통 접근성**
   - 지하철역 거리 및 이용객 수
   - 버스 정류장 밀도
   - 주차장 수

3. **주변 시설 밀도**
   - 학교, 병원, 공원 등 생활 인프라
   - 관광지, 문화시설

4. **시간대별 패턴**
   - 출퇴근 시간대 (직장인구)
   - 주말/평일 패턴
   - 야간 활동 (유흥가, 24시 편의시설)

---

## 3. 데이터 구조 제안

### 3.1 상권 정보 테이블

```sql
CREATE TABLE commercial_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_code VARCHAR(20) UNIQUE NOT NULL,  -- 상권번호
  name VARCHAR(100) NOT NULL,              -- 상권명
  sido VARCHAR(50),                       -- 시도명
  sigungu VARCHAR(50),                   -- 시군구명
  dong VARCHAR(50),                       -- 읍면동명
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  store_count INTEGER,                    -- 상가업소 수
  category_diversity INTEGER,             -- 업종 다양성
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 유동인구 추정 지표 테이블

```sql
CREATE TABLE footfall_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_area_id UUID REFERENCES commercial_areas(id),
  date DATE NOT NULL,
  time_slot INTEGER,                      -- 시간대 (0-23)
  weekday INTEGER,                        -- 요일 (1=월요일)
  
  -- 추정 지표
  estimated_footfall INTEGER,              -- 추정 유동인구
  store_density DECIMAL(5, 2),           -- 상가 밀도
  transit_accessibility DECIMAL(5, 2),    -- 교통 접근성 점수
  poi_score DECIMAL(5, 2),                -- 주변 시설 점수
  
  -- 실제 데이터 (있는 경우)
  actual_footfall INTEGER,                -- 실제 측정 유동인구 (SKT 등)
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commercial_area_id, date, time_slot)
);
```

---

## 4. 수집 스크립트

`ml-api/scripts/collect_footfall_data.py` 파일을 참고하세요.

**주요 기능:**
- 소상공인시장진흥공단 API로 상권정보 수집
- 지역별/상권별 상가업소 수 집계
- 업종별 분류 및 다양성 계산
- 프랜차이즈 점포 비율 계산
- 교통 접근성 계산 (지하철역 거리)
- CSV/JSON 저장 및 DB 적재

**사용 예시:**
```bash
# 기본 지표만 수집
python -m scripts.collect_footfall_data --region 서울 --sigungu 강남구 --save-csv

# 교통 접근성 포함
python -m scripts.collect_footfall_data --region 서울 --sigungu 강남구 --include-transit --save-csv

# 모든 지표 포함
python -m scripts.collect_footfall_data --region 서울 --sigungu 강남구 --include-transit --include-poi --save-csv
```

**지하철역 데이터 준비:**
1. 공공데이터포털에서 다운로드
   - https://www.data.go.kr/data/15099316/fileData.do
2. `ml-api/scripts/data/subway_stations.csv`에 저장
   - 컬럼: 역명, 위도, 경도

---

## 5. 참고 자료

- [공공데이터포털 - 소상공인시장진흥공단 상가정보](https://www.data.go.kr/dataset/15012005/openapi.do)
- [PublicDataReader GitHub](https://github.com/WooilJeong/PublicDataReader)
- [서울열린데이터광장](https://data.seoul.go.kr/)
- [SKT 지오비전 퍼즐](https://puzzle.geovision.co.kr/)

---

## 6. 다음 단계

1. ✅ 상권정보 수집 스크립트 작성
2. ⏳ 유동인구 추정 모델 개발 (상권 정보 기반)
3. ⏳ 서울시 실시간 유동인구 API 연동 (서울 한정)
4. ⏳ 유료 서비스 검토 (SKT 등, 필요 시)
