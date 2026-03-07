# Open Quality Runbook

Purpose: provide one repeatable process to decide launch readiness for apartment, commercial, school, and land domains.

## 1. Required Environment

Set these variables in runtime before any quality checks:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `KAKAO_REST_API_KEY` (required for land location backfill)
- `ML_ADMIN_TOKEN` (for admin/scheduler integration)
- `APP_BASE_URL` or `NEXT_PUBLIC_APP_URL` or `WEB_BASE_URL`

If these are missing, scheduler preflight will disable key jobs.

## 2. One-Command Quality Gate

From repository root:

```bash
cd ml-api
python -m scripts.run_domain_quality_gates --strict-exit --land-gate-mode full --land-gate-profile land-ops-v1
```

Output summary file:

- `ml-api/logs/domain_quality_gate_summary_latest.json`

Behavior:

- Exit code `0`: all domain gates passed
- Exit code `1`: one or more domains failed

Optional soft mode:

```bash
python -m scripts.run_domain_quality_gates --soft-fail --land-gate-mode quota --land-gate-profile land-ops-v1
```

## 3. Gate Policy (Production)

- Release block: if any domain has `hard_fail=true`, do not deploy public open state.
- Feature block: if one domain fails, hide or lock only that domain entry point.
- UI disclosure: show freshness date, confidence, and quality warning reason on every report.

## 4. Domain Thresholds

### Apartment (gap-audit based)

- `coverage_pct >= 95`
- `abs_gap_median_pct <= 15`
- `severe_abs_gte_25_rate_pct <= 20`

Adjust via env:

- `APARTMENT_GATE_MIN_COVERAGE_PCT`
- `APARTMENT_GATE_MAX_MEDIAN_ABS_GAP_PCT`
- `APARTMENT_GATE_MAX_SEVERE25_RATE_PCT`

### Commercial

From `check_commercial_data_quality`:

- `low_prob_high_confidence_ratio_pct <= 3`
- `high_prob_bucket_pct` in `[COMMERCIAL_HIGH_PROB_BUCKET_PCT_MIN, COMMERCIAL_HIGH_PROB_BUCKET_PCT_MAX]` (default `[1, 20]`)
- `sigungu_coverage >= 227`
- freshness/snapshot age checks must pass

### School

From `check_school_data_quality`:

- `missing_location_rate <= 5`
- `official_coverage_rate >= 95`
- `inferred_ratio_rate <= 20`
- freshness checks must pass

### Land

From `check_land_collection_status`:

- `land_sido_coverage >= 17` (or quota mode threshold)
- `land_parcel_link_rate >= 95%`
- `land_parcel_location_fill_rate >= 90%`
- `land_prices_coverage >= 80%`
- `land_characteristics_coverage >= 80%`
- `contract_checks.invalid_pnu_rate`
- `contract_checks.missing_pnu_source_fields`
- `contract_checks.eligible_parcel_pool_size`

Recommended production profile:

- `--gate-profile land-ops-v1`
- hard-fail uses quota-grade keys (`land_sido_coverage`, `collection_freshness_sla`, `recent_run_error_rate`)
- full coverage metrics remain visible as warn-only signals

## 5. Recovery Actions by Domain

### Apartment

```bash
python -m scripts.audit_chamgab_gap_full
python -m scripts.reanalyze_severe_gap_properties
```

Then rerun merged gate script.

### Commercial

```bash
python -m scripts.collect_business_statistics --months 24
python -m scripts.build_commercial_quality_snapshot
python -m scripts.check_commercial_data_quality --strict-exit
```

### School

Run school location backfill + official metrics refresh, then:

```bash
python -m scripts.check_school_data_quality --strict-exit
```

### Land

Run parcel linking, location backfill, and price/characteristics collectors, then:

```bash
python -m scripts.check_land_collection_status --strict-exit --gate-mode full --gate-profile land-ops-v1
```

## 6. Launch Decision

Go live only when all conditions are true:

1. merged domain quality gate returns exit code `0`
2. `scheduler_preflight_latest.json` has no disabled critical jobs
3. domain quality snapshots are fresh within SLA
4. smoke tests for report generation pass
