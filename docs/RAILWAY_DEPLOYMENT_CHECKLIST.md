# Railway Deployment Checklist (Repo 기준)

목표: `ML_API_URL`을 Railway의 최신 `ml-api` 배포로 교체하고, `/admin/jobs`에서 예측 probe가 `source=ml_model`로 뜰 때까지 운영 플로우를 고정한다.

## 0) 반드시 알아야 할 결론

- 상권 분석 신뢰도가 60% 근처에 머무르는 가장 흔한 원인은 `ML_API_URL`이 **구버전/데모 ML API**를 가리키는 것이다.
- `/admin/jobs`의 `ML 예측 테스트`에서 `source=ml_model`이 떠야, UI에서 “ML 모델” 라벨과 함께 90%+ 신뢰도가 현실적으로 가능하다.

## 1) 서비스 구성 (권장)

- Supabase: DB + RLS + RPC + 운영 데이터 저장소
- Next.js (Web/Admin): Vercel 또는 Railway (둘 다 가능)
- ML API (`ml-api/`): Railway (권장, HuggingFace Space 대신)

## 2) Railway에 ML API 배포 (monorepo: `ml-api/` 서브폴더)

1. Railway Project 생성
2. New Service → GitHub Repo 연결
3. Service 설정
   - Root Directory: `ml-api`
   - Start Command (권장): `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - (선택) Healthcheck path: `/health`
4. Environment Variables (ML API 서비스)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` (또는 `SUPABASE_SERVICE_ROLE_KEY`)
   - `ML_ADMIN_TOKEN` (Next.js와 동일 토큰)
   - `CORS_ORIGINS` (선택, 클라이언트 직접 호출을 열어둘 때만 필요)
   - `TZ=Asia/Seoul` (권장)
   - `PYTHONUNBUFFERED=1` (권장)
   - (상권 수집 필요 시) SBIZ API 키 관련 env (프로젝트에서 사용하는 이름에 맞춰 설정)
5. (강력 권장) Railway Volume
   - 학습 산출물(`ml-api/app/models/*.pkl`)이 런타임 재시작/재배포로 사라지지 않게,
     volume을 컨테이너 경로 `/app/app/models`에 마운트하는 구성이 안정적이다.

## 3) ML API 배포 후 필수 스모크 테스트

아래 둘 다 통과해야 한다.

1. health 스펙 호환
   - `/health` 응답에 `models.business_model`이 있어야 함
2. 상권 예측 스펙 호환
   - `POST /api/commercial/predict?district_code=11680&industry_code=Q12` 가 200 OK

레포에 포함된 스크립트로 빠르게 점검할 수 있다:

```bash
node scripts/check_ml_api_compat.mjs
node scripts/diagnose_commercial_confidence.mjs --district 11680 --industry Q12
```

## 4) Next.js(Web/Admin) 환경변수 (Railway/Vercel 공통)

Next.js는 **서버 라우트**에서 ML API를 호출하므로 아래가 중요하다.

- `ML_API_URL` (필수): Railway ML API base URL (예: `https://<service>.up.railway.app`)
- `ML_ADMIN_TOKEN` (필수): Next.js → ML API 스케줄러 호출용 토큰

상권 분석 API는 Supabase에서 통계를 직접 조회하므로(서버 라우트), 아래도 운영 환경에 반드시 있어야 한다:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (권장: 상권 통계 조회가 RLS에 막혀 "빈 데이터"가 되는 것을 방지)

추가로, 클라이언트 코드가 ML API를 직접 호출하는 화면이 있다면 아래도 맞춰 둔다:

- `NEXT_PUBLIC_ML_API_URL` (선택): 보통 `ML_API_URL`과 같은 값으로 둔다

주의:

- 환경변수 교체 후에는 Next.js 배포 환경에서 “재배포”가 필요할 수 있다(플랫폼마다 env 반영 시점이 다름).

## 5) 운영 플로우 고정 (정답 루틴)

`ML_API_URL` 교체 직후에는 아래 순서만 사용한다.

1. `/admin/jobs` 접속
2. `ml_health`에서 아래 확인
   - `compat: true`
   - `business_model: true` (학습 전이면 false일 수 있음)
   - `db: true`
3. `고정 플로우 실행` 버튼 클릭 (권장)
   - `collect_commercial` 실행
   - 완료되면 `train_business` 실행
   - 마지막에 예측 probe 실행
4. `예측 결과`에서 확인
   - `source=ml_model` 이어야 함
   - 이 상태가 되기 전까지는 상권 신뢰도가 60%대/룰 기반으로 보일 수 있다

실패 시 빠른 원인 분류:

- `compat=false`: `ML_API_URL`이 구버전/데모 ML API를 가리키는 중 (URL 교체 + 재배포)
- `db=false`: ML API의 `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` 불일치 또는 네트워크/프록시 문제
- `source=rule_based` + `ml_status=incompatible/http_error`: ML API 라우팅/스펙 불일치 또는 ML API에서 상권 엔드포인트 미구현
- `data_coverage` row가 0: Supabase 상권 통계 테이블이 비어있음(수집 먼저)
