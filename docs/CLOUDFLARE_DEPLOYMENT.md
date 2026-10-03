# Cloudflare Workers + Neon

Web URL: https://chamgab.wj94128871.workers.dev

The web application uses Neon PostgreSQL, the Neon Data API and managed Neon
Auth. The browser and user API queries use signed Neon JWTs and PostgreSQL
row-level policies. Privileged server operations use the encrypted DATABASE_URL
through @neondatabase/serverless. The small server query adapter in
src/lib/neon/sql-fetch.ts preserves the query interface used by existing routes;
it validates identifiers and binds filter/mutation values as SQL parameters.
It supports the query operations and embedded properties relationship used by
this application's server routes, rather than the entire PostgREST protocol.

## Resources

- Cloudflare account: ffd9a82c0fb9a5a7d9001eb7de25bef5
- Worker: chamgab
- Neon organization: org-round-tooth-64612810
- Neon project: ancient-meadow-78439548 (chamgab)
- Main branch: br-super-math-b3t9tq11
- Database/owner: chamgab / chamgab_owner
- Region: AWS Singapore

No Supabase endpoint, service key or authentication service is used by the
published web app. The historical SQL files remain under supabase/migrations;
scripts/migrate-neon.py adapts their auth references for Neon and records applied
migrations. It excludes 014_seed_data.sql, because its example prices and
properties are not production data. There are 61 applied migration files.

## Build and deploy

Use Node.js 22 or newer. OpenNext 1.15.1 is pinned for Next.js 14. The .npmrc
records the dependency installation setting used for the framework-independent
Neon Auth server toolkit. No Next.js 16-only Auth adapter is imported.

1. Run npm ci.
2. Put the settings from .env.example in an ignored .env.local file. Register
   NEXT_PUBLIC_SITE_URL as a trusted domain in Neon Auth. The NEXT_PUBLIC values
   must be available during the build.
3. Initialize the database with DATABASE_URL configured:
   pip install 'psycopg[binary]'; python scripts/migrate-neon.py.
4. Run npm run type-check and npm run build:cloudflare.
5. Authenticate Wrangler to the account above, then deploy with
   npx wrangler deploy --keep-vars --secrets-file .cloudflare-secrets.json.
   The JSON file maps runtime environment names to their values and is ignored
   by Git. Set DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET,
   NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_NEON_DATA_API_URL and APP_BASE_URL.
   Subsequent npm run deploy:cloudflare retains configured secrets.

Cloudflare compatibility dates use UTC. keep_names=false prevents Wrangler's
function-name helper from breaking next-themes' serialized browser script.
This deployment uses Wrangler OAuth; it does not configure GitHub auto-deploy.

## Verification and current limits

The deployment was checked for page rendering, email signup/sign-in, protected
API access, public data API queries and admin permission checks. Database tests
also checked anonymous privacy, isolation between two members, blocked plan and
admin-RPC escalation, allowed profile edits, credit consumption, privileged
server reads/writes/upserts, exact counts, pagination and embedded properties.
Temporary verification users are deleted after testing.

The new database has no imported production transactions, properties or
complexes. The original Supabase database is inaccessible, so existing records
could not be copied. Repository fixture prices are excluded.

The separate Python ML service under ml-api is not deployed to Workers and is
not connected to this site. Its original database/storage integration still
needs migration and a reachable backend deployment before ML_API_URL can be
set. AI valuation/training and collection jobs are therefore not operational.
Kakao maps and social OAuth providers also require their own provider settings;
only email authentication is verified. ml-api/.env.example describes the
historical Python configuration and is not the web deployment configuration.
