# Remote Scheduler Runbook

Purpose: run long ML/data jobs on the deployed ML API server instead of your local PC.

## 1) Required GitHub Secrets

Set these in GitHub repository settings:

- `ML_API_BASE_URL`: deployed ML API base URL (example: `https://chamgab-ml.railway.app`)
- `ML_ADMIN_TOKEN`: same admin token used by `X-Admin-Token` in ML API scheduler endpoints

## 2) Workflow to Use

Workflow: `.github/workflows/run-ml-scheduler-job.yml`

In GitHub:

1. Go to `Actions`
2. Select `Run ML Scheduler Job (Remote)`
3. Click `Run workflow`
4. Choose:
- `job_type`
- `wait_for_completion` (`true` recommended)
- `timeout_minutes` (increase for long jobs)
- `poll_seconds` (15-30s recommended)
- `allow_busy` (`false` recommended)

Available commercial quality job types:

- `collect_commercial`
- `build_commercial_quality_snapshot`
- `check_commercial_data_quality`
- `check_launch_readiness_gate`
- `collect_land_daily`
- `collect_land_locations`

Commercial quality fail mode:

- `COMMERCIAL_QUALITY_SOFT_FAIL=true` (recommended for continuous operations):
  `check_commercial_data_quality` writes FAIL to report but exits success.
- `COMMERCIAL_QUALITY_SOFT_FAIL=false` (strict): gate FAIL makes the job fail.

## 3) Recommended Order (Apartment/Chamgab Fix)

### One-shot (recommended)

Run:

1. `chamgab_gap_recovery_full`

This executes on the ML API server in this order:

1. `link_complexes`
2. `fix_complex_names`
3. `chamgab_backfill_property_id`
4. `chamgab_factor_backfill`
5. `chamgab_autofix_apply`
6. `school_full_rebuild` (enabled by default)

Toggle:

- `CHAMGAB_GAP_RECOVERY_CHAIN_SCHOOL_FULL_REBUILD=true|false`
- default is `true`

### Apartment model artifact hardening (required)

Root cause of repeated `chamgab_gap_recovery_full` failure is usually:
- missing apartment model artifacts (`xgboost_model.pkl`, `feature_artifacts.pkl`, `shap_explainer.pkl`)
- bootstrap training timeout during `scripts.train_model`

New scheduler behavior:
- before bootstrap, it tries to restore artifacts from Supabase Storage
- after successful bootstrap, it uploads artifacts back to storage

Required env:
- `CHAMGAB_MODEL_ARTIFACTS_RESTORE_ENABLED=true`
- `CHAMGAB_MODEL_ARTIFACTS_UPLOAD_AFTER_BOOTSTRAP=true`
- `ML_MODEL_ARTIFACT_BUCKET=ml-models`
- `APARTMENT_MODEL_ARTIFACT_PREFIX=apartment/latest`
- `MODEL_ARTIFACT_IO_RETRIES=3` (recommended)
- `MODEL_ARTIFACT_IO_RETRY_DELAY_SEC=2` (recommended)
- `SUPABASE_HTTP_TIMEOUT_SEC=600` (recommended for large model artifact download)
- `SUPABASE_HTTP_CONNECT_TIMEOUT_SEC=30`
- `CHAMGAB_MODEL_BOOTSTRAP_TIMEOUT_SEC=21600` (recommended)

One-time seed (local):

```bash
cd ml-api
python -m scripts.sync_apartment_model_artifacts --mode upload
```

Recovery check:

```bash
cd ml-api
python -m scripts.sync_apartment_model_artifacts --mode status
python -m scripts.sync_apartment_model_artifacts --mode download
```

## 3.1) Server-side automatic schedule (no local PC dependency)

The ML API scheduler can run the full sequence automatically on server cron:

1. `chamgab_gap_recovery_full`
2. `school_full_rebuild` (chained in step 1 when enabled)
3. `collect_commercial`
4. `build_commercial_quality_snapshot`
5. `check_commercial_data_quality`
6. `check_launch_readiness_gate` (calls:
   `/api/admin/commercial/quality/latest`,
   `/api/admin/data-quality/launch-readiness`)

Required env for step 6:

- `APP_BASE_URL` (e.g. `https://chamgab.vercel.app`)
- `ML_ADMIN_TOKEN` (same secret shared by ML API + web admin routes)

Automatic retry (recommended):

- `SCHEDULER_AUTO_RETRY_ENABLED=true`
- `SCHEDULER_AUTO_RETRY_MAX_ATTEMPTS=2`
- `SCHEDULER_AUTO_RETRY_DELAY_SEC=60`
- `SCHEDULER_AUTO_RETRY_EXP_BACKOFF=true`
- Optional scoped list:
  `SCHEDULER_AUTO_RETRY_JOB_TYPES=chamgab_gap_recovery_full,school_full_rebuild,collect_commercial,build_commercial_quality_snapshot,check_commercial_data_quality,check_launch_readiness_gate`

The retry metadata is attached to `current_job_result._retry`.

Watchdog auto-requeue (recommended):

- `SCHEDULER_WATCHDOG_ENABLED=true`
- `SCHEDULER_WATCHDOG_RUN_ON_START=true`
- `SCHEDULER_WATCHDOG_INTERVAL_SEC=180`
- `SCHEDULER_WATCHDOG_QUEUE_MISSING_JOBS=true`
- `SCHEDULER_WATCHDOG_REQUEUE_FAILED=true`
- `SCHEDULER_WATCHDOG_COOLDOWN_SEC=300`
- `SCHEDULER_WATCHDOG_MAX_REQUEUE_PER_JOB=12`
- `SCHEDULER_WATCHDOG_QUEUE_DELAY_SEC=2`
- Optional order override:
  `SCHEDULER_WATCHDOG_JOB_ORDER=chamgab_gap_recovery_full,school_full_rebuild,collect_commercial,build_commercial_quality_snapshot,check_commercial_data_quality,check_launch_readiness_gate`

Watchdog behavior:

1. If no job is running and a critical stage has no success record (or failed), it queues the earliest missing stage.
2. It enforces cooldown and max-requeue guardrails to avoid hot-loop requeueing.
3. It persists stage status in `ml-api/logs/scheduler_watchdog_state_latest.json`.

### Manual step-by-step (fallback)

Run these in order:

1. `link_complexes`
2. `fix_complex_names`
3. `chamgab_backfill_property_id`
4. `chamgab_factor_backfill`
5. `chamgab_autofix_apply`

This sequence keeps complex mapping, `property_id` linkage, and gap re-analysis aligned.

## 4) Verification

Check result from:

- GitHub Actions run log and summary
- Admin page: `/admin/jobs`
- ML API scheduler status: `GET /api/scheduler/status`

Key fields:

- `current_job_ok: true`
- `current_job_error: null`
- `current_job_result`: summary payload for the finished job
- `current_job_result._retry`: retry attempts and errors
- `last_chamgab_gap_recovery_summary`: one-shot run summary
- `last_watchdog_run_at`: watchdog latest check time
- `last_watchdog_action`: last watchdog decision (`queued` / `wait` / `blocked` / `skip` / `noop`)
- `last_job_status_by_type`: per-job latest success/failure state used by watchdog

## 6) Land Chunk + Resume (recommended)

To avoid contention with the critical pipeline window (`00:00~03:30`), keep land jobs in a separate slot:

- `LAND_COLLECTION_CRON_HOUR=6`
- `LAND_COLLECTION_CRON_MINUTE=20`
- `LAND_LOCATION_CRON_HOUR=7`
- `LAND_LOCATION_CRON_MINUTE=10`

Chunk/resume options:

- `LAND_TX_CHUNK_LIMIT=900`
- `LAND_PRICE_CHUNK_LIMIT=500`
- `LAND_CHARACTERISTICS_CHUNK_LIMIT=500`
- `LAND_LOCATION_CHUNK_LIMIT=500`
- `LAND_PRICE_SLEEP_MS=120`
- `LAND_CHARACTERISTICS_SLEEP_MS=120`
- `LAND_LOCATION_SLEEP_MS=180`

Optional regional chunk targeting:

- `LAND_PRICE_SIGUNGU=강남구`
- `LAND_CHARACTERISTICS_SIGUNGU=강남구`
- `LAND_LOCATION_SIGUNGU=강남구`

Resume state files on server:

- `logs/collect_land_prices_state.json`
- `logs/collect_land_characteristics_state.json`
- `logs/collect_land_parcel_locations_state.json`

## 5) Local Fallback (Optional)

You can still trigger remotely from local terminal without heavy compute:

```bash
ML_API_URL=https://chamgab-ml.railway.app \
ML_ADMIN_TOKEN=*** \
node scripts/trigger_scheduler_job.mjs --job-type chamgab_autofix_apply --wait
```

This only sends API requests and polling; compute still runs on the server.
