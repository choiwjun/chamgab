# ML API Deployment (Commercial Confidence 90%+)

상권 분석 신뢰도가 60%에 머무르는 가장 흔한 원인은 `ML_API_URL`이 **구버전/데모 ML API**를 가리켜서,
`/api/commercial/predict`가 `district_code=11680` 같은 5자리 시군구 코드를 처리하지 못하고 404로 실패하는 경우입니다.

현재 Next.js는 아래 조건을 만족할 때만 “ML 모델” 라벨(`source=ml_model`)과 90%+ 신뢰도를 기대할 수 있습니다.

1. `ML_API_URL`이 최신 `ml-api` 배포를 가리킴
2. ML API의 `GET /health` 응답에 `models.business_model` 필드가 존재
3. ML API의 `POST /api/commercial/predict?district_code=11680&industry_code=Q12`가 200으로 동작

## 빠른 호환성 점검

로컬에서:

```bash
node scripts/check_ml_api_compat.mjs 11680 Q12
```

결과가 `RESULT OK`면 호환.

관리자에서:

- `/admin/jobs`에서 `ml_health`와 “ML API 호환 경고”를 확인
- 같은 페이지에서 `ML 예측 테스트` 실행 후 `source=ml_model`인지 확인

## 배포 옵션 A: Railway (권장)

레포 안의 `ml-api/`는 Railway 배포 설정 파일이 포함되어 있습니다.

필수 환경변수(예시):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `ML_ADMIN_TOKEN`
- `CORS_ORIGINS` (프론트 도메인 포함)

배포가 끝나면:

- Vercel(프론트) 환경변수 `ML_API_URL`을 Railway URL로 설정
- `/admin/jobs`에서 `ml_health`가 `compat=true`인지 확인

## 배포 옵션 B: HuggingFace Spaces (Docker)

HuggingFace Spaces는 보통 “Space 레포 루트에 Dockerfile이 있어야” Docker Space로 실행됩니다.
현재 프로젝트는 `ml-api/Dockerfile`에 Dockerfile이 있으므로, 아래 방식 중 하나를 권장합니다.

1. **별도 레포로 분리(권장)**
   - 새 레포(예: `chamgab-ml-api`)를 만들고 `ml-api/` 폴더 내용을 레포 루트로 복사
   - HuggingFace Space를 Docker로 만들고 해당 레포를 연결

2. **HuggingFace Space 레포에서 직접 관리**
   - Space 레포에 최신 `ml-api` 코드를 직접 반영

필수 Variables(HF Space Settings > Variables):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `ML_ADMIN_TOKEN`
- `CORS_ORIGINS`
- (필요 시) `SBIZ_API_KEY`, `PUBLIC_DATA_API_KEY`

배포 후 확인:

- `GET https://<space>.hf.space/health`에 `models.business_model`이 포함되는지
- `POST https://<space>.hf.space/api/commercial/predict?...`가 200인지

## 운영 플로우 (데이터 최신화 + 학습)

`/admin/jobs`에서 순서대로 실행:

1. `collect_commercial` (상권 통계 3종 + 유동인구/특성 최신화)
2. `train_business` (상권 모델 학습)
3. `ML 예측 테스트`에서 `source=ml_model` 확인
