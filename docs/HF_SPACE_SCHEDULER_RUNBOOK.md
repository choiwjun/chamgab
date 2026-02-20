# HF Space Scheduler Runbook

목표: 로컬 장시간 실행 없이 Hugging Face Space의 ML API 스케줄러를 원격으로 실행한다.

## 1) Space 시크릿 등록 (CLI)

현재 저장소 기준:

- Space: `hunter8891/chamgab-ml-api`
- 스크립트: `scripts/hf_set_space_config.py`

필수 시크릿 등록:

```bash
python scripts/hf_set_space_config.py \
  --space-id hunter8891/chamgab-ml-api \
  --secret-from-env SUPABASE_URL \
  --secret-from-env SUPABASE_SERVICE_KEY \
  --secret-from-env ML_ADMIN_TOKEN \
  --restart
```

옵션:

- `--dry-run`: 실제 반영 없이 키 확인
- `--token <hf_token>`: 로컬 `hf auth login` 대신 토큰 직접 지정

## 2) 원격 스케줄러 실행

```bash
ML_API_URL=https://hunter8891-chamgab-ml-api.hf.space \
ML_ADMIN_TOKEN=... \
node scripts/trigger_scheduler_job.mjs --job-type chamgab_autofix_apply --wait
```

권장 순서:

1. `link_complexes`
2. `fix_complex_names`
3. `chamgab_backfill_property_id`
4. `chamgab_autofix_apply`

## 3) 상태 확인

헬스체크:

```bash
curl https://hunter8891-chamgab-ml-api.hf.space/health
```

스케줄러 상태:

```bash
curl -H "X-Admin-Token: <ML_ADMIN_TOKEN>" \
  https://hunter8891-chamgab-ml-api.hf.space/api/scheduler/status
```
