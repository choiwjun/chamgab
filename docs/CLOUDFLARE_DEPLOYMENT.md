# Cloudflare deployment

Production URL: https://chamgab.wj94128871.workers.dev

The Next.js app runs on Cloudflare Workers through OpenNext. Supabase and the
existing Python ML service remain external services. The ML service URL comes
from the repository's existing `ML_API_BASE_URL` secret.

## Build and deploy

Use Node.js 22 or newer. OpenNext 1.15.1 is pinned because this app uses Next.js 14.

```sh
npm ci
npm run build:cloudflare
npm run preview:cloudflare
npx wrangler login
npx wrangler deploy --keep-vars
```

Set the public Supabase URL, anon key, and Kakao map key in your local
`.env.local` before building. Set server credentials as Worker secrets. Never
commit `.env.local`, `.dev.vars`, or `.cloudflare-secrets.json`.

## GitHub Actions

`.github/workflows/deploy-cloudflare.yml` builds using the existing repository
secrets and uploads runtime settings as encrypted Worker secrets. Pushes to
`cloudflare-deploy` trigger deployment. A future automated deployment requires
the `CLOUDFLARE_API_TOKEN` repository secret, with Worker deployment permissions
for the account in `wrangler.jsonc`.

The initial deployment can use a temporary
`CHAMGAB_CLOUDFLARE_DEPLOY_TOKEN` secret. Remove it after that deployment.

## Authentication and maps

To enable social login on this URL, add
`https://chamgab.wj94128871.workers.dev/auth/callback` to Supabase's redirect
allowlist, and allow the new origin in the relevant provider console. Naver
also needs its own callback URL and client credentials. Add the new origin to
the Kakao JavaScript SDK's allowed domains for maps.
