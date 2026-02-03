# TASKS.md 검증 리포트

> 기획 문서 vs TASKS.md 교차 검증 결과

---

## 📊 검증 요약

| 검증 항목 | 상태 | 비고 |
|-----------|------|------|
| P0 화면 (6개) | ✅ 완료 | 100% 커버 |
| 핵심 기능 (참값 분석) | ⚠️ 부분 | ML API 누락 |
| 기술 스택 | ⚠️ 부분 | 일부 도구 누락 |
| 데이터베이스 | ⚠️ 부분 | 2개 테이블 누락 |
| 인프라/DevOps | ❌ 누락 | CI/CD, 모니터링 없음 |

---

## ✅ 정상 반영된 항목

### 1. 화면 (06-screens.md)

| 화면 | TASKS.md 반영 | 태스크 ID |
|------|--------------|-----------|
| S01 홈 | ✅ | P2-S1 |
| S02 검색 리스트 | ✅ | P2-S2 |
| S03 검색 지도 | ✅ | P2-S3 |
| S04 매물 상세 | ✅ | P3-S4 |
| S08 로그인 | ✅ | P3-S5 |
| S09 회원가입 | ✅ | P3-S6 |
| S05~S07, S10~S12 | ✅ Phase 4+로 예약 | - |

### 2. 기술 스택 (02-trd.md)

| 기술 | TASKS.md 반영 |
|------|--------------|
| Next.js 14 | ✅ P0-T0.1 |
| TypeScript | ✅ P0-T0.1 |
| Tailwind CSS | ✅ P0-T0.3 |
| shadcn/ui | ✅ P0-T0.3 |
| Zustand | ✅ P0-T0.3 |
| TanStack Query | ✅ P0-T0.3 |
| React Hook Form + Zod | ✅ P0-T0.3 |
| Supabase | ✅ P0-T0.4 |
| PostGIS | ✅ P0-T0.4 |
| Kakao Maps SDK | ✅ P2-S3-T1 |

### 3. 도메인 리소스 (resources.yaml)

| 리소스 | TASKS.md 반영 |
|--------|--------------|
| properties | ✅ P2-R1 |
| regions | ✅ P2-R2 |
| popular_searches | ✅ P2-R3 |
| chamgab_analyses | ✅ P3-R1 |
| price_factors | ✅ P3-R2 |
| transactions | ✅ P3-R3 |
| favorites | ✅ P3-R4 |

---

## ⚠️ 누락된 항목 (Critical)

### 1. 🤖 ML API (FastAPI) - 핵심 기능!

**출처**: 02-trd.md, 시스템 아키텍처

```
현재 TASKS.md:
- POST /api/chamgab에서 "ML API 호출"만 언급
- ML API 자체 개발 태스크 없음

누락된 태스크:
- [ ] FastAPI 프로젝트 셋업 (ml-api/)
- [ ] XGBoost 모델 로드/예측 API
- [ ] SHAP 요인 분석 API
- [ ] 유사 거래 검색 API
- [ ] Railway 배포 설정
```

**영향도**: 🔴 Critical - 핵심 기능 동작 불가

### 2. 📦 데이터베이스 테이블 누락

**출처**: 04-database-design.md

| 누락 테이블 | 용도 | 우선순위 |
|------------|------|----------|
| `complexes` | 아파트 단지 정보 | MVP 필요 |
| `payments` | 결제 내역 | P1 (구독) |

```sql
-- complexes: 아파트 단지 (MVP 필요)
-- properties.complex_id FK로 참조됨
CREATE TABLE complexes (
  id UUID PRIMARY KEY,
  name VARCHAR(200),
  address VARCHAR(500),
  total_units INT,
  built_year INT,
  brand VARCHAR(50), -- 래미안, 자이 등
  ...
);
```

**영향도**: 🟡 High - 아파트 데이터 모델링에 영향

### 3. 🔧 캐시 설정 (Upstash Redis)

**출처**: 02-trd.md

```
현재 TASKS.md:
- P2-R3에서 "Redis 캐시" 언급만

누락된 태스크:
- [ ] Upstash Redis 프로젝트 생성
- [ ] 환경 변수 설정 (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)
- [ ] Redis 클라이언트 설정 (src/lib/redis.ts)
- [ ] 캐싱 전략 구현 (참값 분석 7일 캐시)
```

**영향도**: 🟡 High - 성능/비용에 영향

---

## ⚠️ 누락된 항목 (Medium)

### 4. 📊 차트 라이브러리 (Recharts)

**출처**: 02-trd.md

```
누락된 태스크:
- [ ] Recharts 설치
- [ ] 가격 트렌드 차트 컴포넌트
- [ ] 신뢰도 차트 컴포넌트
```

**영향도**: 🟡 Medium - 시각화 기능에 영향

### 5. 🎨 디자인 시스템 설정

**출처**: 05-design-system.md

```
누락된 태스크:
- [ ] Pretendard 웹폰트 설정
- [ ] Lucide React 아이콘 설치
- [ ] Tailwind 커스텀 컬러 설정 (primary, accent, chamgab)
- [ ] 디자인 토큰 파일 생성
```

**영향도**: 🟡 Medium - UI 일관성에 영향

### 6. 🗺️ Kakao Maps 환경 변수

**출처**: 07-coding-convention.md

```
현재 TASKS.md:
- P2-S3-T1에서 "Kakao Maps SDK 로드"만 언급

누락된 태스크:
- [ ] Kakao Developers 앱 생성
- [ ] 환경 변수 설정 (NEXT_PUBLIC_KAKAO_MAP_KEY)
- [ ] SDK 스크립트 로드 설정
```

**영향도**: 🟡 Medium - 지도 기능 동작에 필요

---

## ❌ 누락된 항목 (DevOps/인프라)

### 7. 🔄 CI/CD 파이프라인

**출처**: 02-trd.md

```
누락된 태스크:
- [ ] GitHub Actions 워크플로우 작성
  - lint.yml: ESLint + TypeScript 체크
  - test.yml: 단위/통합 테스트
  - e2e.yml: E2E 테스트 (Playwright)
- [ ] Vercel Preview 배포 설정
- [ ] main 브랜치 보호 규칙
```

**영향도**: 🟠 Medium - 개발 효율성/품질에 영향

### 8. 📈 모니터링/분석 도구

**출처**: 02-trd.md

```
누락된 태스크:
- [ ] Sentry 설정 (에러 추적)
- [ ] Vercel Analytics 활성화
- [ ] Mixpanel 설정 (선택)
```

**영향도**: 🟠 Low (MVP) - 운영 시 필요

---

## 📝 P1 화면 리소스 누락

**출처**: 06-screens.md, resources.yaml

P1 화면에 필요한 리소스 태스크가 Phase 4+에만 언급됨:

| P1 화면 | 필요 리소스 | TASKS.md 상태 |
|---------|------------|---------------|
| S05 비교하기 | properties, chamgab_analyses | ✅ (P2, P3에서 생성) |
| S06 관심 매물 | favorites | ✅ (P3-R4에서 생성) |
| S07 알림 | notifications | ❌ 테이블 생성 없음 |
| S10 마이페이지 | users | ❌ 테이블 생성 없음 |
| S11 결제/플랜 | subscriptions, payments | ❌ 테이블 생성 없음 |

---

## 🔧 권장 수정 사항

### Priority 1 (MVP 필수)

```markdown
## P0-T0.5: 추가 의존성 설치 (신규)
- [ ] Recharts 설치
- [ ] Lucide React 아이콘 설치
- [ ] Pretendard 웹폰트 설정

## P0-T0.6: 디자인 시스템 설정 (신규)
- [ ] Tailwind 커스텀 컬러 설정
- [ ] 디자인 토큰 상수 생성

## P0-T0.7: 외부 서비스 설정 (신규)
- [ ] Kakao Developers 앱 설정
- [ ] Upstash Redis 설정
- [ ] 환경 변수 추가

## P2-R1-T0: Complexes 테이블 (신규)
- [ ] complexes 테이블 Migration
- [ ] 시드 데이터 (서울시 아파트 단지)
```

### Priority 2 (ML API - 핵심!)

```markdown
## P3-ML: ML API 개발 (신규 섹션)

### P3-ML-T1: FastAPI 프로젝트 셋업
- [ ] ml-api/ 폴더 구조 생성
- [ ] FastAPI + uvicorn 설정
- [ ] Docker 설정

### P3-ML-T2: XGBoost 모델 API
- [ ] 모델 파일 로드
- [ ] POST /predict 엔드포인트
- [ ] 응답 포맷 정의

### P3-ML-T3: SHAP 분석 API
- [ ] SHAP explainer 설정
- [ ] GET /factors 엔드포인트
- [ ] 요인 해석 로직

### P3-ML-T4: 유사 거래 API
- [ ] 유사도 계산 알고리즘
- [ ] GET /similar 엔드포인트

### P3-ML-T5: Railway 배포
- [ ] railway.toml 설정
- [ ] 환경 변수 설정
- [ ] 헬스체크 엔드포인트
```

### Priority 3 (DevOps)

```markdown
## P0-T0.8: CI/CD 설정 (신규)
- [ ] .github/workflows/lint.yml
- [ ] .github/workflows/test.yml
- [ ] Vercel 프로젝트 연결
```

---

## 📊 최종 검증 결과

| 카테고리 | 기획 항목 | TASKS.md 반영 | 커버리지 |
|----------|----------|---------------|----------|
| P0 화면 | 6개 | 6개 | **100%** |
| P1 화면 | 6개 | 6개 (예약) | **100%** |
| Frontend 기술 | 10개 | 9개 | **90%** |
| Backend 기술 | 7개 | 5개 | **71%** |
| 데이터베이스 | 10개 | 8개 | **80%** |
| DevOps | 4개 | 0개 | **0%** |
| **전체** | - | - | **~75%** |

---

## ✅ 결론

**TASKS.md는 화면/UI 중심으로 잘 구성되어 있으나, 다음 영역이 보완 필요:**

1. **🔴 Critical**: ML API (FastAPI) 개발 태스크 추가 필수
2. **🟡 High**: complexes 테이블, Redis 캐시 설정 추가
3. **🟠 Medium**: 디자인 시스템, CI/CD 설정 추가

**권장 조치:**
- TASKS.md에 위 수정 사항 반영
- 또는 별도 `TASKS-INFRA.md` 파일로 인프라 태스크 분리
