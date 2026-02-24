# OPS Smoke Tests

This document is an operator-oriented checklist for verifying recent security/ops features.

## Prerequisites

- Next.js server env has `SUPABASE_SERVICE_ROLE_KEY` set (required for anonymous quota + event logging).
- Supabase migrations applied:
  - `034_harden_user_profiles_and_quota.sql`
  - `035_add_anonymous_analysis_quota.sql`
- Optional env:
  - `ANON_DAILY_ANALYSIS_LIMIT` (default 3)

## Anonymous (Guest) Daily Limit

1. Open an incognito window (logged out).
2. Call `/api/chamgab` with a valid body that triggers an ML call (e.g. `{ "property_id": "..." }`).
3. Repeat until the daily limit is exceeded.

Expected:
- The first N calls succeed (N = `ANON_DAILY_ANALYSIS_LIMIT`).
- The next call returns `429` with error message about guest daily limit.
- `public.anonymous_analysis_usage` row exists for that IP hash.
- `public.chamgab_analysis_events` contains `ANON_QUOTA_EXCEEDED` on the blocked attempt.

## Authenticated Daily Limit (Atomic)

1. Login with a `free` tier user with low credits (e.g. `daily_credit_limit=20`, `monthly_credit_limit=400`).
2. Call `/api/chamgab` repeatedly (each call consumes credits).

Expected:
- Allowed calls atomically increment `user_profiles.daily_credit_used` and `user_profiles.monthly_credit_used`.
- When credits are insufficient, `/api/chamgab` returns `429` with `CREDITS_EXCEEDED`.

## Force Logout (Operator Action)

1. As admin, open `/admin/users`.
2. Click "강제 로그아웃" for a target user.
3. As that target user, try to access a protected route (e.g. `/mypage`).

Expected:
- Redirect to `/auth/login?error=forced_logout`.
- Client also signs out on next token refresh or profile fetch.

## Admin Analyses Sanity Check

1. Open `/admin/analyses`.

Expected:
- "최근 실거래" and "괴리" columns are shown.
- Large gaps (abs >= 25%) are highlighted.
- "이력" shows last 10 analysis events for the property.

## Credits Debug Endpoint (QA convenience)

1. Login as a normal user.
2. Call `GET /api/me/credits`.

Expected:
- `profile.daily_credit_used` increases after `/api/chamgab` calls.
- `recent_events` contains `consume` entries for `home_price`.
