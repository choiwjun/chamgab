# Phase 6 구현 가이드

> 데이터 활용 극대화 및 사용자 참여도 향상

## 📋 준비 사항

### 필수 확인

- ✅ Supabase 데이터 확인 (245개 레코드)
- ✅ ML API 서버 작동 (localhost:8001)
- ✅ 프론트엔드 개발 환경 (localhost:3000)

### 데이터 확인

```bash
cd ml-api
python scripts/check_detailed_data.py
```

**기대 결과**:

```
✓ Time-based Analysis            READY
✓ Age-based Analysis             READY
✓ Weekend vs Weekday             READY
✓ District Profile               READY
✓ Competition Analysis           READY
✓ AI Industry Recommendation     READY

Result: 6/6 features READY
```

---

## 🚀 Week 1-2: 상권 분석 고도화

### Day 1-2: 시간대별 분석

#### Backend (2시간)

**파일**: `ml-api/app/api/commercial.py`

```python
@router.get("/districts/{code}/peak-hours")
async def get_peak_hours(code: str):
    """시간대별 유동인구 분석"""
    # 1. foot_traffic_statistics에서 데이터 조회
    result = supabase.table('foot_traffic_statistics') \
        .select('*') \
        .eq('commercial_district_code', code) \
        .single() \
        .execute()

    data = result.data

    # 2. 시간대별 점수 계산
    times = {
        "morning": {"time": "06-11시", "traffic": data['time_06_11'], "score": 0},
        "lunch": {"time": "11-14시", "traffic": data['time_11_14'], "score": 0},
        "afternoon": {"time": "14-17시", "traffic": data['time_14_17'], "score": 0},
        "evening": {"time": "17-21시", "traffic": data['time_17_21'], "score": 0},
        "night": {"time": "21-24시", "traffic": data['time_21_24'], "score": 0}
    }

    # 3. 점수 정규화 (0-10)
    max_traffic = max(t['traffic'] for t in times.values())
    for key in times:
        times[key]['score'] = int((times[key]['traffic'] / max_traffic) * 10)

    # 4. 최고 시간대 찾기
    best_time = max(times.items(), key=lambda x: x[1]['score'])[0]

    return {
        "peak_hours": times,
        "best_time": best_time,
        "recommendation": f"{times[best_time]['time']} 집중 운영 추천"
    }
```

**테스트**:

```bash
curl http://localhost:8001/api/commercial/districts/1168053500/peak-hours
```

---

#### Frontend (3시간)

**파일**: `src/components/business/PeakHoursAnalysis.tsx`

```tsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

export default function PeakHoursAnalysis({
  districtCode,
}: {
  districtCode: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['peak-hours', districtCode],
    queryFn: () =>
      fetch(`/api/commercial/districts/${districtCode}/peak-hours`).then((r) =>
        r.json()
      ),
  })

  if (isLoading) return <div>Loading...</div>

  // 차트 데이터 변환
  const chartData = Object.entries(data.peak_hours).map(([key, value]) => ({
    name: value.time,
    유동인구: value.traffic,
    점수: value.score,
  }))

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-bold">시간대별 유동인구 분석</h3>

      <BarChart width={500} height={300} data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="유동인구" fill="#8884d8" />
      </BarChart>

      <div className="mt-4 rounded bg-blue-50 p-4">
        <p className="text-sm font-medium text-blue-900">
          💡 {data.recommendation}
        </p>
      </div>
    </div>
  )
}
```

---

### Day 3-4: 연령대별 분석

#### Backend (2시간)

**파일**: `ml-api/app/api/commercial.py`

```python
@router.get("/districts/{code}/demographics")
async def get_demographics(code: str):
    """연령대별 유동인구 분석"""
    result = supabase.table('foot_traffic_statistics') \
        .select('*') \
        .eq('commercial_district_code', code) \
        .single() \
        .execute()

    data = result.data

    # 연령대별 데이터
    ages = {
        "10s": data['age_10s'] or 0,
        "20s": data['age_20s'] or 0,
        "30s": data['age_30s'] or 0,
        "40s": data['age_40s'] or 0,
        "50s": data['age_50s'] or 0,
        "60s": data['age_60s'] or 0
    }

    total = sum(ages.values())

    # 비율 및 점수 계산
    demographics = {}
    for age, count in ages.items():
        percentage = (count / total * 100) if total > 0 else 0
        score = int((percentage / 100) * 10)
        demographics[age] = {
            "count": count,
            "percentage": round(percentage, 1),
            "score": score
        }

    # 주 타겟 찾기
    primary_target = max(demographics.items(), key=lambda x: x[1]['percentage'])[0]

    # 페르소나 생성
    persona_map = {
        "10s": {"name": "10대 학생", "age": "13-19세", "lifestyle": "학업, SNS"},
        "20s": {"name": "MZ세대 직장인", "age": "20-29세", "lifestyle": "SNS 활발, 트렌드 민감"},
        "30s": {"name": "30대 직장인", "age": "30-39세", "lifestyle": "가족, 안정 추구"},
        "40s": {"name": "40대 가장", "age": "40-49세", "lifestyle": "가족 중심"},
        "50s": {"name": "50대 중년", "age": "50-59세", "lifestyle": "안정 중시"},
        "60s": {"name": "60대 이상", "age": "60세+", "lifestyle": "여유, 건강"}
    }

    return {
        "demographics": demographics,
        "primary_target": primary_target,
        "persona": persona_map.get(primary_target, {}),
        "suggested_industries": get_matching_industries(primary_target)
    }

def get_matching_industries(target_age: str) -> list:
    """연령대에 맞는 업종 추천"""
    mapping = {
        "10s": [{"code": "Q07", "name": "패스트푸드", "match_score": 90}],
        "20s": [
            {"code": "Q12", "name": "커피전문점", "match_score": 95},
            {"code": "Q06", "name": "치킨전문점", "match_score": 88}
        ],
        "30s": [
            {"code": "Q01", "name": "한식음식점", "match_score": 85},
            {"code": "Q12", "name": "커피전문점", "match_score": 82}
        ]
        # ... 나머지
    }
    return mapping.get(target_age, [])
```

---

#### Frontend (3시간)

**파일**: `src/components/business/DemographicsAnalysis.tsx`

```tsx
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

export default function DemographicsAnalysis({
  districtCode,
}: {
  districtCode: string
}) {
  const { data } = useQuery({
    queryKey: ['demographics', districtCode],
    queryFn: () =>
      fetch(`/api/commercial/districts/${districtCode}/demographics`).then(
        (r) => r.json()
      ),
  })

  if (!data) return null

  const chartData = Object.entries(data.demographics).map(([age, info]) => ({
    name: age,
    value: info.percentage,
  }))

  const COLORS = [
    '#0088FE',
    '#00C49F',
    '#FFBB28',
    '#FF8042',
    '#8884D8',
    '#82CA9D',
  ]

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-bold">연령대별 고객 분석</h3>

      <PieChart width={400} height={300}>
        <Pie
          data={chartData}
          cx={200}
          cy={150}
          labelLine={false}
          label={({ name, value }) => `${name}: ${value}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>

      <div className="mt-4 rounded bg-purple-50 p-4">
        <h4 className="mb-2 font-bold text-purple-900">🎯 타겟 고객</h4>
        <p className="text-sm">
          {data.persona.name} ({data.persona.age})
        </p>
        <p className="mt-1 text-xs text-gray-600">{data.persona.lifestyle}</p>
      </div>

      <div className="mt-4">
        <h4 className="mb-2 font-bold">💡 추천 업종</h4>
        {data.suggested_industries.map((industry, i) => (
          <div
            key={i}
            className="mb-2 flex items-center justify-between rounded bg-gray-50 p-2"
          >
            <span>{industry.name}</span>
            <span className="text-sm text-blue-600">
              {industry.match_score}% 매칭
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

### Day 5-10: 나머지 기능

같은 패턴으로 구현:

- Day 5-6: 주말/평일 비교
- Day 7-8: 상권 프로필
- Day 9-10: 경쟁 분석 + 성장 가능성

---

## 📊 Week 3-4: 통합 기능

### 통합 대시보드 API

```python
@router.get("/integrated/analysis")
async def get_integrated_analysis(
    property_id: str,
    include_commercial: bool = True
):
    """아파트 + 상권 통합 분석"""
    # 1. 아파트 분석
    property_data = get_property_analysis(property_id)

    # 2. 근처 상권 검색
    nearby_districts = find_nearby_districts(
        property_data['lat'],
        property_data['lng'],
        radius=1000
    )

    # 3. 통합 점수 계산
    integrated_score = calculate_integrated_score(
        property_data,
        nearby_districts
    )

    return {
        "property": property_data,
        "nearby_commercial": nearby_districts,
        "integrated_score": integrated_score,
        "recommendation": generate_recommendation(integrated_score)
    }
```

---

## 🎯 성공 기준

### Week 1-2 완료 시

- [ ] API 5개 엔드포인트 작동
- [ ] 컴포넌트 5개 렌더링
- [ ] E2E 테스트 통과
- [ ] Lighthouse 성능 80+

### Week 3-4 완료 시

- [ ] 통합 대시보드 작동
- [ ] 알림 시스템 작동
- [ ] 리포트 생성 가능
- [ ] 전체 플로우 테스트 통과

### Week 5-6 완료 시

- [ ] 투자 점수 계산 정확
- [ ] 성능 최적화 완료
- [ ] 문서화 완료
- [ ] 프로덕션 배포 준비

---

## 📌 다음 단계

**지금 바로 시작**:

```bash
# 1. 브랜치 생성
git checkout -b feature/phase6-advancement

# 2. Backend 시작
cd ml-api
# commercial.py에 peak-hours 엔드포인트 추가

# 3. Frontend 시작
cd src/components/business
# PeakHoursAnalysis.tsx 생성

# 4. 테스트
curl http://localhost:8001/api/commercial/districts/1168053500/peak-hours
```

**문서 참조**:

- PRD: `docs/planning/08-advancement-prd.md`
- TASKS: `TASKS.md` (Phase 6)
- 데이터: `ml-api/scripts/check_detailed_data.py`

**질문 시**:

- Discord/Slack에 문의
- GitHub Issues 생성
- PRD 참조
