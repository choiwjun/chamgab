@echo off
REM Complete Commercial Analysis Setup Script
REM Run this after applying SQL migrations in Supabase Dashboard

echo ============================================================
echo Commercial Analysis Complete Setup
echo ============================================================
echo.

echo Step 1: Check if tables exist...
python ml-api/scripts/setup_commercial_tables.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Tables not found. Please apply migrations first:
    echo 1. Copy the SQL from: supabase/migrations/combined_commercial_migrations.sql
    echo 2. Paste and run in: https://app.supabase.com/project/csnmpkixzzszuxcsdwou/sql/new
    echo 3. Then run this script again
    pause
    exit /b 1
)

echo.
echo ============================================================
echo Step 2: Generate sample commercial data...
echo ============================================================
python ml-api/scripts/generate_commercial_sample_data.py
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to generate sample data
    pause
    exit /b 1
)

echo.
echo ============================================================
echo Step 3: Prepare training data...
echo ============================================================
python ml-api/scripts/prepare_business_training_data.py
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to prepare training data
    pause
    exit /b 1
)

echo.
echo ============================================================
echo Step 4: Train ML model...
echo ============================================================
cd ml-api
python -m scripts.train_business_model --data scripts/business_training_data.csv
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to train model
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo ============================================================
echo SUCCESS! Commercial Analysis Setup Complete
echo ============================================================
echo.
echo Next steps:
echo 1. Start ML API: cd ml-api ^&^& uvicorn app.main:app --reload
echo 2. Test endpoints: http://localhost:8000/api/commercial/districts
echo 3. Visit app: http://localhost:3000/business-analysis
echo.
pause
