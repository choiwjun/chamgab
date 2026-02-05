# 고도화 제품 요구사항 명세서 (Advancement PRD)

> Phase 6: 데이터 활용 극대화 및 사용자 참여도 향상

## 1. 개요

### 1.1 배경

- **현재 상태**: 아파트 분석 80%, 상권 분석 60% 완성
- **문제점**: 보유 데이터 미활용, 사용자 체류 시간 짧음 (3~5분)
- **목표**: 데이터 100% 활용, 체류 시간 15분 이상, 재방문율 60%

### 1.2 비즈니스 목표

1. **사용자 참여도 5배 증가**
   - 체류 시간: 3분 → 15분
   - 페이지뷰: 5 → 25
   - 재방문율: 20% → 60%

2. **경쟁사 대비 차별화**
   - 소상공인365: 통계만 → 참값: AI 예측 + 인사이트
   - 직방/호갱노노: 아파트만 → 참값: 아파트 + 상권 통합

3. **전환율 향상**
   - 무료 → 유료: 2% → 10%
   - 공유율: 1% → 15%

---

## 2. 기능 요구사항

### 2.1 상권 분석 고도화

#### 2.1.1 시간대별 성공 예측

**목표**: "언제 장사가 잘 되나요?"

**입력**:

- 상권 코드
- 업종 코드

**출력**:

```json
{
  "peak_hours": {
    "morning": { "time": "06-11시", "traffic": 450, "score": 7 },
    "lunch": { "time": "11-14시", "traffic": 892, "score": 10 },
    "afternoon": { "time": "14-17시", "traffic": 623, "score": 8 },
    "evening": { "time": "17-21시", "traffic": 1245, "score": 10 },
    "night": { "time": "21-24시", "traffic": 234, "score": 4 }
  },
  "best_time": "evening",
  "recommendation": "저녁 시간대(17-21시) 집중 운영 추천"
}
```

**데이터 소스**: `foot_traffic_statistics.time_*`

**UI**: 시간대별 바 차트 + 추천 배지

---

#### 2.1.2 연령대별 타겟팅

**목표**: "누가 내 고객이 되나요?"

**출력**:

```json
{
  "demographics": {
    "20s": { "count": 450, "percentage": 30, "score": 10 },
    "30s": { "count": 380, "percentage": 25, "score": 8 }
  },
  "primary_target": "20s",
  "persona": {
    "name": "MZ세대 직장인",
    "age": "25-35세",
    "lifestyle": "SNS 활발, 트렌드 민감"
  },
  "suggested_industries": [
    { "code": "Q12", "name": "커피전문점", "match_score": 95 }
  ]
}
```

**데이터 소스**: `foot_traffic_statistics.age_*`

**UI**: 도넛 차트 + 페르소나 카드

---

#### 2.1.3 주말/평일 비교

**목표**: "주말과 평일 중 언제가 좋나요?"

**출력**:

```json
{
  "weekday_avg": 850000,
  "weekend_avg": 1250000,
  "weekend_ratio": 59.5,
  "advantage": "weekend",
  "difference_percent": 47.1,
  "recommendation": "주말 특별 프로모션 추천"
}
```

**데이터 소스**: `sales_statistics.weekend_sales_ratio`, `foot_traffic_statistics.weekday_avg/weekend_avg`

**UI**: 요일별 라인 차트

---

#### 2.1.4 상권 특성 프로필

**목표**: "이 상권의 특징이 뭔가요?"

**출력**:

```json
{
  "district_type": "MZ 핫플레이스",
  "description": "트렌디한 카페와 음식점이 밀집된 젊은 상권",
  "persona": {
    "name": "MZ세대 직장인",
    "age": "25-35세",
    "lifestyle": "SNS 활발, 트렌드 민감"
  },
  "success_factors": ["SNS 마케팅 필수", "인스타그램 감성 인테리어"]
}
```

**데이터 소스**: `district_characteristics`

**UI**: 상권 페르소나 카드 + 특성 태그

---

#### 2.1.5 경쟁 밀집도 분석

**목표**: "경쟁자가 많나요?"

**출력**:

```json
{
  "competition_level": "높음",
  "total_stores": 168,
  "franchise_ratio": 30.4,
  "density_score": 8.5,
  "alternatives": [{ "name": "본오동", "store_count": 42, "success_rate": 72 }],
  "recommendation": "높은 경쟁도. 차별화 전략 필수"
}
```

**데이터 소스**: `store_statistics`

**UI**: 히트맵 + 대안 추천

---

#### 2.1.6 성장 가능성 점수

**목표**: "이 상권이 성장하고 있나요?"

**출력**:

```json
{
  "growth_score": 85,
  "trend": "상승",
  "sales_growth_rate": 5.12,
  "prediction_3months": {
    "sales": 36000000,
    "growth_rate": 6.5,
    "confidence": 78
  },
  "signals": [{ "type": "positive", "message": "매출 지속 증가 중 (+5.12%)" }],
  "recommendation": "지금이 진입 적기"
}
```

**데이터 소스**: `sales_statistics.sales_growth_rate`, `business_statistics.survival_rate`

**UI**: 게이지 차트 + 타임라인

---

#### 2.1.7 AI 업종 추천 엔진

**목표**: "이 상권에 무슨 업종이 좋을까요?"

**입력**:

```json
{
  "budget": 50000000,
  "target_age": ["20s", "30s"],
  "preferred_hours": ["evening"]
}
```

**출력**:

```json
{
  "recommendations": [
    {
      "rank": 1,
      "industry": { "code": "Q12", "name": "커피전문점" },
      "match_score": 92,
      "success_probability": 68,
      "reasons": ["타겟 연령(20-30대) 30% 집중", "저녁 시간 유동인구 최고"]
    }
  ]
}
```

**알고리즘**: Content-based filtering + ML

**UI**: 카드 스와이프 (Tinder 스타일)

---

### 2.2 아파트 분석 고도화

#### 2.2.1 투자 점수 계산

**목표**: ROI, 전세가율, 투자 매력도

**출력**:

```json
{
  "investment_score": 85,
  "roi_1year": 7.2,
  "roi_3years": 22.5,
  "jeonse_ratio": 68.5,
  "jeonse_trend": "하락",
  "recommendation": "투자 적기",
  "reasons": ["전세가율 하락 (매수 유리)", "향후 1년 7% 상승 예상"]
}
```

**데이터 소스**: `transactions`, `properties`, 시장 지표

**UI**: 투자 점수 카드 + 게이지

---

#### 2.2.2 미래 가격 예측 (선택)

**목표**: 3개월/6개월/1년 후 가격 예측

**출력**:

```json
{
  "current_price": 850000000,
  "predictions": {
    "3_months": { "price": 865000000, "change": 1.76, "confidence": 82 },
    "6_months": { "price": 880000000, "change": 3.53, "confidence": 75 },
    "1_year": { "price": 910000000, "change": 7.06, "confidence": 68 }
  },
  "trend": "상승"
}
```

**알고리즘**: ARIMA, Prophet, LSTM

**UI**: 가격 예측 그래프

---

### 2.3 통합 기능

#### 2.3.1 통합 대시보드

**목표**: 아파트 + 상권 동시 분석

**시나리오**:

```
사용자: "강남역 근처 아파트를 보고 있어요"
 ↓
통합 대시보드:
  - 아파트 참값 850만원 (5% 저렴)
  - 1년 후 910만원 예상 (+7%)
  - 근처 상권: 커피 성공률 68%
  - 생활 편의성: 95/100
  - 통합 투자 점수: 92/100
```

**UI**: 통합 점수 카드 + 상세 분석

---

#### 2.3.2 통합 알림

**목표**: 아파트 + 상권 변화 추적

**알림 예시**:

```
🔔 강남역 투자 기회!
  - 아파트 가격 5% 하락
  - 상권 매출 20% 증가
  → 저가 매수 + 창업 동시 검토
```

**UI**: 알림 센터 + 푸시

---

#### 2.3.3 리포트 생성 & 공유

**목표**: PDF 리포트 다운로드

**구성**:

1. 아파트 분석
2. 상권 분석
3. 통합 평가
4. 리스크

**UI**: PDF 다운로드 + 카카오톡 공유

---

#### 2.3.4 게이미피케이션

**목표**: 사용자 참여도 극대화

**배지**:

- 🗺️ 상권 탐험가 (10개 이상 분석)
- 📊 데이터 과학자 (리포트 5개 생성)
- 🎯 성공 예측가 (정확도 80% 달성)

**UI**: 배지 컬렉션 + 리더보드

---

## 3. 비기능 요구사항

### 3.1 성능

- API 응답 시간: < 500ms
- 페이지 로드: < 2초
- 차트 렌더링: < 1초

### 3.2 확장성

- 동시 사용자: 10,000명
- 데이터 증가: 월 10% 성장 대응

### 3.3 접근성

- WCAG 2.1 AA 준수
- 모바일 반응형
- 다크모드 지원

---

## 4. 우선순위

### P0 (즉시, 1~2주)

1. ✅ 시간대별 분석
2. ✅ 연령대별 분석
3. ✅ 주말/평일 비교
4. ✅ 상권 프로필
5. ✅ 경쟁 분석

### P1 (단기, 3~4주)

6. ✅ 성장 가능성
7. ✅ 투자 점수
8. ✅ 통합 대시보드

### P2 (중기, 1~2개월)

9. ✅ AI 업종 추천
10. ✅ 통합 알림
11. ✅ 리포트 생성

### P3 (장기, 3개월+)

12. 🟡 미래 가격 예측
13. 🟡 게이미피케이션
14. 🟡 지도 시각화

---

## 5. 성공 지표

### 5.1 사용자 참여도

- 평균 체류 시간: 3분 → **15분**
- 페이지뷰: 5 → **25**
- 재방문율: 20% → **60%**

### 5.2 비즈니스

- 일일 활성 사용자: 100 → **1,000**
- 전환율 (유료): 2% → **10%**
- 공유율: 1% → **15%**

### 5.3 기술

- API 응답 시간: < 500ms
- 에러율: < 0.1%
- 가동 시간: > 99.9%

---

## 6. 마일스톤

### Week 1-2 (Phase 6.1)

- 상권 분석 고도화 (5개 기능)
- API 엔드포인트 구현
- 프론트엔드 UI

### Week 3-4 (Phase 6.2)

- 아파트 분석 고도화
- 통합 대시보드
- 테스트 및 QA

### Week 5-6 (Phase 6.3)

- 통합 알림
- 리포트 생성
- 최적화

### Week 7-8 (Phase 6.4)

- 게이미피케이션
- 성능 최적화
- 프로덕션 배포

---

## 7. 리스크 및 대응

### 7.1 데이터 부족

**리스크**: 미래 가격 예측에 필요한 시계열 데이터 부족
**대응**: Phase 3 (장기)로 이동, 우선순위 낮춤

### 7.2 성능 저하

**리스크**: 복잡한 분석으로 인한 응답 시간 증가
**대응**: 캐싱, 백그라운드 작업, CDN

### 7.3 사용자 혼란

**리스크**: 너무 많은 정보로 인한 혼란
**대응**: 단계별 공개, 온보딩 가이드

---

## 8. 의존성

### 8.1 기술

- Supabase (데이터베이스)
- ML API (예측 엔진)
- Kakao Maps API (지도)
- Firebase (푸시 알림)

### 8.2 데이터

- foot_traffic_statistics ✅
- district_characteristics ✅
- sales_statistics ✅
- store_statistics ✅
- business_statistics ✅

---

## 9. 승인

- **작성자**: Claude Code
- **작성일**: 2026-02-05
- **버전**: 1.0
- **승인자**: 프로젝트 오너
