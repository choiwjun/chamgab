# Deployment Guide

This guide provides step-by-step instructions for deploying the Chamgab platform to production.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Deployment (Supabase)](#database-deployment-supabase)
3. [ML API Deployment (Railway)](#ml-api-deployment-railway)
4. [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
5. [Environment Variables](#environment-variables)
6. [Post-Deployment Checklist](#post-deployment-checklist)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Required Accounts

1. **Vercel Account**: [https://vercel.com/signup](https://vercel.com/signup)
2. **Railway Account**: [https://railway.app/](https://railway.app/)
3. **Supabase Account**: [https://supabase.com/dashboard](https://supabase.com/dashboard)

### Required Tools

```bash
# Vercel CLI
npm install -g vercel

# Railway CLI (optional, can use dashboard)
npm install -g @railway/cli

# Supabase CLI
npm install -g supabase
```

### GitHub Repository

Ensure your code is pushed to GitHub:

```bash
git remote add origin https://github.com/your-username/chamgab.git
git push -u origin main
```

---

## Database Deployment (Supabase)

### Step 1: Create Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in project details:
   - **Name**: chamgab-production
   - **Database Password**: (generate strong password)
   - **Region**: Northeast Asia (Seoul) - `ap-northeast-2`
4. Click "Create new project"
5. Wait for provisioning (~2 minutes)

### Step 2: Run Database Migrations

```bash
# Login to Supabase
supabase login

# Link to remote project
supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations
supabase db push

# Verify migrations
supabase db diff
```

### Step 3: Configure Auth Providers

**Email/Password Auth:**

1. Navigate to Authentication → Providers
2. Enable "Email" provider
3. Configure email templates

**Kakao OAuth:**

1. Get Kakao OAuth credentials from [Kakao Developers](https://developers.kakao.com/)
2. Navigate to Authentication → Providers
3. Enable "Kakao" provider
4. Add Client ID and Client Secret
5. Add redirect URL: `https://your-project.supabase.co/auth/v1/callback`

### Step 4: Enable PostGIS Extension

```sql
-- Run in SQL Editor
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify
SELECT PostGIS_version();
```

### Step 5: Set Up Row Level Security (RLS)

RLS policies are already defined in migrations. Verify they are active:

```sql
-- Check RLS is enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

### Step 6: Get Connection Credentials

Navigate to Settings → API:

- **Project URL**: Copy for `NEXT_PUBLIC_SUPABASE_URL`
- **Anon/Public Key**: Copy for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Service Role Key**: Keep secure, only for server-side

---

## ML API Deployment (Railway)

### Step 1: Create Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Authorize Railway to access your GitHub
5. Select the `chamgab` repository

### Step 2: Configure Build Settings

1. Click on your service
2. Navigate to Settings → Build
3. Set **Root Directory**: `ml-api`
4. Set **Build Command**: `pip install -r requirements.txt`
5. Set **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### Step 3: Add Environment Variables

Navigate to Variables tab and add:

```bash
# Python Environment
PYTHONUNBUFFERED=1
PYTHONPATH=/app

# Database (if using)
DATABASE_URL=postgresql://...

# CORS Origins
ALLOWED_ORIGINS=https://chamgab.vercel.app,https://www.chamgab.com

# Model Configuration
MODEL_PATH=/app/app/models/xgboost_model.pkl

# API Keys (if needed)
# OPENAI_API_KEY=sk-...
```

### Step 4: Configure Deployment

1. Navigate to Settings → Deployment
2. Enable **Auto Deploy** from `main` branch
3. Set **Health Check Path**: `/health`
4. Set **Health Check Timeout**: 300 seconds

### Step 5: Upload Model Files

Model files (.pkl) are too large for git. Upload via Railway CLI:

```bash
# Login to Railway
railway login

# Link to project
railway link

# Upload model file
railway run python -m scripts.train_model --csv scripts/kb_transactions.csv

# Or use Railway Volumes (recommended for large files)
# 1. Create a volume in Railway dashboard
# 2. Mount to /app/app/models
# 3. Upload model files via railway CLI or SFTP
```

### Step 6: Configure Custom Domain (Optional)

1. Navigate to Settings → Domains
2. Click "Add Custom Domain"
3. Enter: `api.chamgab.com`
4. Add DNS records as instructed

### Step 7: Verify Deployment

```bash
# Test health endpoint
curl https://chamgab-ml.railway.app/health

# Test prediction endpoint
curl -X POST https://chamgab-ml.railway.app/predict \
  -H "Content-Type: application/json" \
  -d '{
    "region": "서울특별시 강남구 역삼동",
    "area_m2": 84.5,
    "floor": 10,
    "total_floors": 20,
    "building_year": 2010,
    "brand": "래미안"
  }'
```

---

## Frontend Deployment (Vercel)

### Step 1: Create Vercel Project

**Option A: Via CLI**

```bash
# Login
vercel login

# Deploy to production
vercel --prod
```

**Option B: Via Dashboard**

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Select the `chamgab` repository

### Step 2: Configure Build Settings

Vercel auto-detects Next.js. Verify settings:

- **Framework Preset**: Next.js
- **Root Directory**: `./`
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

### Step 3: Add Environment Variables

Navigate to Settings → Environment Variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Kakao Map
NEXT_PUBLIC_KAKAO_MAP_KEY=your_kakao_map_api_key

# ML API
NEXT_PUBLIC_ML_API_URL=https://chamgab-ml.railway.app

# Analytics (Optional)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

### Step 4: Configure Domains

1. Navigate to Settings → Domains
2. Add custom domain: `www.chamgab.com`
3. Add apex domain: `chamgab.com`
4. Update DNS records:

   ```
   Type: A
   Name: @
   Value: 76.76.21.21

   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

### Step 5: Enable Vercel Analytics

1. Navigate to Analytics tab
2. Click "Enable Analytics"
3. This provides Core Web Vitals monitoring

### Step 6: Configure Performance Settings

Navigate to Settings → Performance:

- ✅ Enable **Image Optimization**
- ✅ Enable **Automatic Static Optimization**
- ✅ Set **Edge Functions** to Seoul region

### Step 7: Deploy

```bash
# Deploy to production
vercel --prod

# Or commit and push to main branch (auto-deploy)
git push origin main
```

### Step 8: Verify Deployment

```bash
# Check deployment status
vercel list

# Check deployment logs
vercel logs

# Open in browser
vercel open
```

---

## Environment Variables

### Complete Environment Variable Reference

#### Frontend (Vercel)

| Variable                        | Description                  | Example                          | Required |
| ------------------------------- | ---------------------------- | -------------------------------- | -------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL         | `https://xxx.supabase.co`        | Yes      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key     | `eyJhbGci...`                    | Yes      |
| `NEXT_PUBLIC_KAKAO_MAP_KEY`     | Kakao Map JavaScript API key | `a1b2c3d4e5f6...`                | Yes      |
| `NEXT_PUBLIC_ML_API_URL`        | ML API base URL              | `https://chamgab-ml.railway.app` | Yes      |
| `NEXT_PUBLIC_GA_ID`             | Google Analytics ID          | `G-XXXXXXXXXX`                   | No       |
| `SENTRY_DSN`                    | Sentry error tracking        | `https://xxx@sentry.io/xxx`      | No       |

#### ML API (Railway)

| Variable           | Description                       | Example                             | Required |
| ------------------ | --------------------------------- | ----------------------------------- | -------- |
| `PORT`             | Port number (auto-set by Railway) | `8080`                              | Auto     |
| `PYTHONUNBUFFERED` | Python output buffering           | `1`                                 | Yes      |
| `PYTHONPATH`       | Python module path                | `/app`                              | Yes      |
| `ALLOWED_ORIGINS`  | CORS allowed origins              | `https://chamgab.vercel.app`        | Yes      |
| `MODEL_PATH`       | Path to model file                | `/app/app/models/xgboost_model.pkl` | Yes      |
| `DATABASE_URL`     | PostgreSQL connection (optional)  | `postgresql://...`                  | No       |

#### Database (Supabase)

Supabase automatically manages database environment variables. No manual configuration needed.

---

## Post-Deployment Checklist

### Security

- [ ] Verify all environment variables are set correctly
- [ ] Ensure no secrets are committed to git
- [ ] Enable Supabase RLS policies on all tables
- [ ] Configure CORS on ML API
- [ ] Enable HTTPS on all endpoints
- [ ] Set up rate limiting on API endpoints

### Performance

- [ ] Run Lighthouse audit (target: 90+ all categories)
- [ ] Verify Vercel Analytics is tracking
- [ ] Test Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1)
- [ ] Enable CDN caching for static assets
- [ ] Test image optimization (AVIF/WebP)

### Functionality

- [ ] Test user registration and login
- [ ] Test property search and filtering
- [ ] Test Chamgab (참값) analysis
- [ ] Test commercial analysis
- [ ] Test integrated dashboard
- [ ] Test alert center
- [ ] Test PDF report generation
- [ ] Test favorite properties

### Monitoring

- [ ] Set up Vercel Analytics
- [ ] Configure Sentry error tracking (optional)
- [ ] Set up uptime monitoring (e.g., UptimeRobot)
- [ ] Configure alert notifications
- [ ] Test error logging and reporting

### SEO & Marketing

- [ ] Add meta tags for social sharing
- [ ] Submit sitemap to Google Search Console
- [ ] Configure robots.txt
- [ ] Set up Google Analytics
- [ ] Add structured data (JSON-LD)

---

## Monitoring & Maintenance

### Vercel Analytics

Access at: https://vercel.com/your-username/chamgab/analytics

**Key Metrics to Monitor:**

- **Traffic**: Page views, unique visitors
- **Performance**: Core Web Vitals (LCP, FID, CLS)
- **Real User Monitoring**: Actual user experience data
- **Top Pages**: Most visited pages
- **Devices**: Desktop vs Mobile traffic

### Railway Metrics

Access at: https://railway.app/project/chamgab

**Key Metrics:**

- **CPU Usage**: Should stay below 80%
- **Memory Usage**: Monitor for memory leaks
- **Network I/O**: Track bandwidth usage
- **Response Time**: API latency
- **Error Rate**: Track 4xx and 5xx errors

### Supabase Dashboard

Access at: https://supabase.com/dashboard/project/chamgab

**Key Metrics:**

- **Database Usage**: Storage and connections
- **API Requests**: Track quota usage
- **Auth Users**: Active user count
- **Edge Functions**: If using

### Error Tracking (Optional: Sentry)

```bash
# Install Sentry
npm install @sentry/nextjs

# Initialize
npx @sentry/wizard -i nextjs

# Add SENTRY_DSN to environment variables
```

### Uptime Monitoring

**Recommended Service**: [UptimeRobot](https://uptimerobot.com/) (Free tier available)

**Endpoints to Monitor:**

- https://chamgab.com (Frontend)
- https://chamgab-ml.railway.app/health (ML API)
- https://xxx.supabase.co/rest/v1/ (Database API)

**Alert Channels:**

- Email notifications
- Slack webhook (optional)
- SMS (optional, paid)

---

## Rollback Procedures

### Vercel Rollback

**Via Dashboard:**

1. Go to Deployments tab
2. Find the last stable deployment
3. Click "..." → "Promote to Production"

**Via CLI:**

```bash
# List deployments
vercel list

# Rollback to specific deployment
vercel rollback [deployment-url]
```

### Railway Rollback

**Via Dashboard:**

1. Navigate to Deployments
2. Click on previous stable deployment
3. Click "Redeploy"

**Via CLI:**

```bash
railway rollback
```

### Supabase Database Rollback

**Revert Migration:**

```bash
# Revert last migration
supabase db reset

# Or revert to specific migration
supabase db reset --version 20240101000000
```

**Database Backup:**
Supabase automatically backs up daily. To restore:

1. Go to Database → Backups
2. Select backup point
3. Click "Restore"

---

## Troubleshooting

### Common Issues

**Issue: Build fails on Vercel**

```
Solution:
1. Check build logs for specific error
2. Verify all dependencies are in package.json
3. Ensure environment variables are set
4. Try building locally: npm run build
```

**Issue: ML API returns 500 errors**

```
Solution:
1. Check Railway logs
2. Verify model files are uploaded
3. Check environment variables
4. Test locally: uvicorn app.main:app --reload
```

**Issue: Database connection fails**

```
Solution:
1. Verify Supabase project is active
2. Check environment variables
3. Verify network connectivity
4. Check Supabase status page
```

**Issue: Images not loading**

```
Solution:
1. Verify NEXT_PUBLIC_SUPABASE_URL is correct
2. Check Supabase Storage bucket permissions
3. Verify CORS settings on Supabase
```

---

## Support

For deployment issues:

- **Vercel**: [vercel.com/support](https://vercel.com/support)
- **Railway**: [railway.app/help](https://railway.app/help)
- **Supabase**: [supabase.com/support](https://supabase.com/support)

For project-specific issues:

- **GitHub Issues**: [github.com/chamgab/issues](https://github.com/chamgab/issues)
- **Email**: support@chamgab.com

---

**Last Updated**: 2024-02-01
**Version**: 1.0.0
