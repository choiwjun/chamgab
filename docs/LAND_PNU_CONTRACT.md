# Land PNU Contract (Operations)

## Scope

- Table: `public.land_parcels.pnu`
- Producer: `ml-api/scripts/create_land_parcels.py`
- Consumers: `collect_land_prices.py`, `collect_land_characteristics.py`, `collect_land_parcel_locations.py`

## Contract

- `pnu` must be exactly 19 digits.
- Format: `법정동코드(10) + 산여부(1) + 본번(4) + 부번(4)`.
- Regex: `^[0-9]{19}$`.

## Source Requirements

- Required source fields from `land_transactions`:
- `region_code` (5 digits)
- `eupmyeondong` (dong key to resolve the last 5 digits of 법정동코드)
- `jibun` (to derive 산여부/본번/부번)

## Failure Handling

- If PNU cannot be built, that parcel candidate is skipped.
- Failure reasons are counted in `create_land_parcels_latest.json` under `contract_counters`.
- Quality gate report exposes:
- `contract_checks.invalid_pnu_rate`
- `contract_checks.missing_pnu_source_fields`
- `contract_checks.eligible_parcel_pool_size`

## Gate Policy

- `land-ops-v1`: quota-level hard fail + full-threshold visibility (warn-only for full metrics).
