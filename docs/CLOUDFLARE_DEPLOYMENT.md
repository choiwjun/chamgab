# Cloudflare deployment with Neon

Status: waiting for the target Neon project connection. The Supabase deployment
was cancelled before upload, and its workflow and temporary deployment credential
were removed. No Chamgab Worker has been deployed.

Cloudflare build configuration is prepared in wrangler.jsonc and
open-next.config.ts. The intended Worker name is chamgab.

A local environment file containing the target DATABASE_URL, or a local Neon API
credential, is required before inspecting and configuring the Neon database.
Never commit database credentials.

The app still contains its original Supabase database and authentication
integration. Both need migration, including SQL authorization helpers, PostGIS,
row-level policies, and the Python ML service database/storage integration. The
Neon Data API and Auth SDK provide migration interfaces for the existing client
APIs. Inspect the target project before choosing the final configuration.

Use Node.js 22 or newer. OpenNext 1.15.1 is pinned for Next.js 14 compatibility.
The additional scripts are build:cloudflare, preview:cloudflare, and
deploy:cloudflare. Do not deploy until the Neon migration is complete.
