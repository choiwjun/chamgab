# Commercial Analysis Setup Guide

This guide explains how to set up the commercial analysis (상권분석) infrastructure for the Chamgab project.

## Overview

The commercial analysis feature requires:

1. Database tables (via migrations)
2. Sample data or real data from external APIs
3. Trained ML model for business success prediction
4. Running ML API server

## Setup Steps

### Step 1: Apply Database Migrations

**Option A: Manual via Supabase Dashboard (Recommended)**

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project: `csnmpkixzzszuxcsdwou`
3. Navigate to **SQL Editor**
4. Copy and paste the contents of these files one by one:

   **First migration (015):** `supabase/migrations/015_create_commercial_analysis_tables.sql`
   - Creates: business_statistics, sales_statistics, store_statistics

   **Second migration (016):** `supabase/migrations/016_add_commercial_demographics.sql`
   - Creates: foot_traffic_statistics, residential_population, work_population, income_consumption, district_characteristics

5. Click **Run** for each migration

**Option B: Using Python script (requires DB password)**

```bash
# Set environment variable
export SUPABASE_DB_PASSWORD=your_database_password

# Run migration script
cd ml-api
python scripts/apply_migrations.py
```

You can find the database password in:

- Supabase Dashboard → Settings → Database → Connection string

### Step 2: Generate Sample Data

After migrations are applied, generate sample data for testing:

```bash
cd ml-api
python scripts/generate_commercial_sample_data.py
```

This creates:

- 5 sample districts (강남역, 홍대입구역, 잠실역, etc.)
- 5 sample industries (한식음식점, 커피전문점, etc.)
- Business statistics (last 3 months)
- Sales statistics (last 3 months)
- Store statistics (last 3 months)
- Foot traffic data (last 2 quarters)
- District characteristics (last 2 quarters)

**Total records:** ~300 records across 5 tables

### Step 3: Prepare Training Data

Combine the statistics into training data for the ML model:

```bash
cd ml-api
python scripts/prepare_business_training_data.py
```

This creates: `scripts/business_training_data.csv` with features:

- survival_rate
- monthly_avg_sales
- sales_growth_rate
- store_count
- franchise_ratio
- competition_ratio
- success (target: 0=failure, 1=success)

### Step 4: Train ML Model

Train the XGBoost model for business success prediction:

```bash
cd ml-api
python -m scripts.train_business_model --data scripts/business_training_data.csv
```

**Optional:** Enable hyperparameter tuning (takes longer):

```bash
python -m scripts.train_business_model --data scripts/business_training_data.csv --tune
```

This creates: `models/business_model.pkl` containing:

- Trained XGBoost classifier
- SHAP explainer for interpretability
- Feature names and metadata

### Step 5: Restart ML API Server

```bash
cd ml-api
uvicorn app.main:app --reload --port 8000
```

The server will load the trained model on startup.

### Step 6: Test API Endpoints

Test the commercial analysis endpoints:

```bash
# Test districts endpoint
curl http://localhost:8000/api/commercial/districts

# Test industries endpoint
curl http://localhost:8000/api/commercial/industries

# Test prediction endpoint
curl -X POST http://localhost:8000/api/commercial/predict \
  -H "Content-Type: application/json" \
  -d '{
    "district_code": "1168053500",
    "industry_code": "Q12"
  }'
```

## Collecting Real Data

To collect real data from external APIs instead of using sample data:

### Prerequisites

1. Get API keys:
   - **SBIZ_API_KEY**: 소상공인진흥공단 API key ([Apply here](https://www.data.go.kr/data/15083033/))

2. Set environment variables:

```bash
export SUPABASE_URL=https://csnmpkixzzszuxcsdwou.supabase.co
export SUPABASE_SERVICE_KEY=your_service_role_key
export SBIZ_API_KEY=your_sbiz_api_key
```

### Run Data Collection

```bash
cd ml-api
python scripts/collect_business_statistics.py --months 12
```

This will:

- Collect data for major regions (Seoul, Busan, etc.)
- Collect data for major industries (restaurants, cafes, etc.)
- Store in Supabase tables
- Take ~30 minutes due to API rate limits

## Troubleshooting

### Error: Table 'business_statistics' does not exist

- **Solution:** Apply migrations (Step 1)

### Error: No training data found

- **Solution:** Generate sample data or collect real data (Step 2)

### Error: Model file not found

- **Solution:** Train the model (Step 4)

### Error: SUPABASE_URL not set

- **Solution:** Create `.env` file from `.env.example` and set credentials

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│  - Business Analysis UI                                      │
│  - District/Industry Selection                               │
│  - Result Visualization                                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   ML API (FastAPI)                           │
│  - /api/commercial/districts                                 │
│  - /api/commercial/industries                                │
│  - /api/commercial/predict                                   │
│  - /api/commercial/compare                                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 Supabase (PostgreSQL)                        │
│  - business_statistics                                       │
│  - sales_statistics                                          │
│  - store_statistics                                          │
│  - foot_traffic_statistics                                   │
│  - district_characteristics                                  │
└─────────────────────────────────────────────────────────────┘
```

## Next Steps

After completing the setup:

1. **Test the feature**: Navigate to `/business-analysis` in the app
2. **Deploy**: Deploy ML API to Railway or similar platform
3. **Monitor**: Set up logging and monitoring for API calls
4. **Improve**: Retrain model with more data periodically

## Support

If you encounter issues:

1. Check the logs: `tail -f ml-api/logs/app.log`
2. Verify environment variables: `env | grep SUPABASE`
3. Test Supabase connection: `python scripts/test_api.py`
