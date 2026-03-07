# ML API Service Boundary

## Active service

- Railway production service: `chamgab-ml-api`
- Public URL: `https://chamgab-ml-api-production.up.railway.app`

## Legacy service

- Legacy Railway service: `ml-api`
- Current state: no healthy public app, public URL returns `404 Application not found`
- Rule: do not use this service for deploys, env vars, health checks, or admin guidance

## Frontend target

Production Vercel env must point to the active service only:

```env
ML_API_URL=https://chamgab-ml-api-production.up.railway.app
NEXT_PUBLIC_ML_API_URL=https://chamgab-ml-api-production.up.railway.app
```

## Deployment rule

Always deploy from the `ml-api/` directory root.

Recommended command:

```powershell
powershell -File scripts/deploy_chamgab_ml_api.ps1
```

The script internally runs:

```powershell
railway up . --path-as-root --service chamgab-ml-api
```

This avoids the broken repo-root upload case where Railway receives the wrong archive root and the container fails with `ModuleNotFoundError: No module named 'app'`.

## Repository rule

- Repo root is the Next.js app and general project workspace.
- `ml-api/` is the only valid Railway deployment root for the ML API.
- Repo-root Railway/Python deployment stubs must not exist.
