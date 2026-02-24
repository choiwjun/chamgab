#!/usr/bin/env python3
"""
Prepare training data for business success prediction model (v2)

Combines statistics from multiple tables including foot_traffic,
creates derived features, and produces labeled training data.

Uses BusinessFeatureEngineer for advanced 32-feature pipeline.
"""
import os
import sys
import argparse
from pathlib import Path
from datetime import datetime

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    project_root = Path(__file__).parent.parent.parent
    env_file = project_root / '.env'
    if env_file.exists():
        load_dotenv(env_file)
except ImportError:
    pass

try:
    import pandas as pd
    import numpy as np
    from supabase import create_client, Client
    from supabase.lib.client_options import SyncClientOptions
    import httpx
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pandas', 'numpy', 'supabase', 'httpx'])
    import pandas as pd
    import numpy as np
    from supabase import create_client, Client
    from supabase.lib.client_options import SyncClientOptions
    import httpx


# Supabase credentials
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Supabase not configured.")
    print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.")
    sys.exit(1)


def fetch_all_rows(supabase: Client, table_name: str) -> pd.DataFrame:
    """Supabase 1000-row 제한 우회: 페이지네이션으로 전체 행 가져오기 (legacy)"""
    all_data = []
    page_size = 1000
    offset = 0

    while True:
        response = supabase.table(table_name).select('*').range(
            offset, offset + page_size - 1).execute()
        if not response.data:
            break
        all_data.extend(response.data)
        if len(response.data) < page_size:
            break
        offset += page_size

    return pd.DataFrame(all_data) if all_data else pd.DataFrame()


def _yyyymm_months_ago(months: int) -> str:
    now = datetime.now()
    y = now.year
    m = now.month
    total = y * 12 + (m - 1) - months
    yy = total // 12
    mm = total % 12 + 1
    return f"{yy:04d}{mm:02d}"


def _yyyyqq_quarters_ago(quarters: int) -> str:
    now = datetime.now()
    q = (now.month - 1) // 3 + 1
    total = now.year * 4 + (q - 1) - quarters
    yy = total // 4
    qq = total % 4 + 1
    return f"{yy:04d}{qq:02d}"


def fetch_rows(
    supabase: Client,
    table_name: str,
    columns: str,
    base_year_month_gte: str | None = None,
    base_year_quarter_gte: str | None = None,
) -> pd.DataFrame:
    """
    Fetch rows with pagination but keep volume bounded for Railway training.

    - For monthly tables, filter by base_year_month >= threshold (YYYYMM string).
    - For quarterly tables, filter by base_year_quarter >= threshold (YYYYQQ string).
    """
    all_data = []
    page_size = 1000
    offset = 0

    while True:
        q = supabase.table(table_name).select(columns)
        if base_year_month_gte:
            q = q.gte("base_year_month", base_year_month_gte)
        if base_year_quarter_gte:
            q = q.gte("base_year_quarter", base_year_quarter_gte)
        q = q.range(offset, offset + page_size - 1)
        resp = q.execute()
        if not resp.data:
            break
        all_data.extend(resp.data)
        if len(resp.data) < page_size:
            break
        offset += page_size

    return pd.DataFrame(all_data) if all_data else pd.DataFrame()


def fetch_statistics(supabase: Client, months: int = 24, quarters: int = 8) -> tuple:
    """Fetch statistics from Supabase (bounded for training speed)"""
    print("\nFetching statistics from Supabase...")

    min_ym = _yyyymm_months_ago(months)
    min_q = _yyyyqq_quarters_ago(quarters)

    business_df = fetch_rows(
        supabase,
        "business_statistics",
        "sigungu_code,sido_code,industry_small_code,industry_name,base_year_month,survival_rate,operating_count",
        base_year_month_gte=min_ym,
    )
    print(f"  Business statistics: {len(business_df)} records")

    sales_df = fetch_rows(
        supabase,
        "sales_statistics",
        "sigungu_code,sido_code,industry_small_code,industry_name,base_year_month,monthly_avg_sales,sales_growth_rate,monthly_sales_count",
        base_year_month_gte=min_ym,
    )
    print(f"  Sales statistics: {len(sales_df)} records")

    store_df = fetch_rows(
        supabase,
        "store_statistics",
        "sigungu_code,sido_code,industry_small_code,industry_name,base_year_month,store_count,franchise_count",
        base_year_month_gte=min_ym,
    )
    print(f"  Store statistics: {len(store_df)} records")

    foot_df = fetch_rows(
        supabase,
        "foot_traffic_statistics",
        "sigungu_code,base_year_quarter,total_foot_traffic,weekday_avg,weekend_avg,time_06_11,time_11_14,time_14_17,time_17_21,time_21_24,age_10s,age_20s,age_30s,age_40s,age_50s,age_60s_plus",
        base_year_quarter_gte=min_q,
    )
    print(f"  Foot traffic statistics: {len(foot_df)} records")

    return business_df, sales_df, store_df, foot_df


def combine_statistics(
    business_df: pd.DataFrame,
    sales_df: pd.DataFrame,
    store_df: pd.DataFrame,
    foot_df: pd.DataFrame,
) -> pd.DataFrame:
    """Combine statistics from multiple tables"""
    print("\nCombining statistics...")

    if business_df.empty or sales_df.empty or store_df.empty:
        print("Warning: One or more core tables are empty. Cannot combine.")
        return pd.DataFrame()

    # Aggregate to sigungu-level so training data matches serving inputs.
    merge_keys = ["sigungu_code", "industry_small_code", "base_year_month"]

    def _num(df: pd.DataFrame, col: str) -> pd.Series:
        return pd.to_numeric(df.get(col), errors="coerce").fillna(0)

    def _wmean(v: pd.Series, w: pd.Series) -> float:
        ww = w.fillna(0)
        vv = v.fillna(0)
        denom = float(ww.sum())
        return float((vv * ww).sum() / denom) if denom > 0 else float(vv.mean() if len(vv) > 0 else 0)

    # business: survival_rate weighted by operating_count
    b = business_df.copy()
    b["survival_rate"] = _num(b, "survival_rate")
    b["operating_count"] = _num(b, "operating_count")
    b_agg = (
        b.groupby(merge_keys, as_index=False)
        .apply(lambda g: pd.Series({
            "sido_code": str(g["sido_code"].dropna().iloc[0]) if "sido_code" in g.columns and g["sido_code"].notna().any() else None,
            "industry_name": str(g["industry_name"].dropna().iloc[0]) if "industry_name" in g.columns and g["industry_name"].notna().any() else None,
            "operating_count": float(g["operating_count"].sum()),
            "survival_rate": _wmean(g["survival_rate"], g["operating_count"]),
        }))
        .reset_index(drop=True)
    )

    # sales: monthly_avg_sales weighted by monthly_sales_count
    s = sales_df.copy()
    s["monthly_avg_sales"] = _num(s, "monthly_avg_sales")
    s["sales_growth_rate"] = pd.to_numeric(s.get("sales_growth_rate"), errors="coerce")
    s["monthly_sales_count"] = _num(s, "monthly_sales_count")
    s_agg = (
        s.groupby(merge_keys, as_index=False)
        .apply(lambda g: pd.Series({
            "monthly_sales_count": float(_num(g, "monthly_sales_count").sum()),
            "monthly_avg_sales": _wmean(_num(g, "monthly_avg_sales"), _num(g, "monthly_sales_count")),
            "sales_growth_rate": float(pd.to_numeric(g.get("sales_growth_rate"), errors="coerce").dropna().mean()) if "sales_growth_rate" in g.columns else 0.0,
        }))
        .reset_index(drop=True)
    )

    # store: sum counts
    st = store_df.copy()
    st["store_count"] = _num(st, "store_count")
    st["franchise_count"] = _num(st, "franchise_count")
    st_agg = (
        st.groupby(merge_keys, as_index=False)
        .agg(store_count=("store_count", "sum"), franchise_count=("franchise_count", "sum"))
    )

    combined = pd.merge(b_agg, s_agg, on=merge_keys, how="inner")
    combined = pd.merge(combined, st_agg, on=merge_keys, how="inner")

    print(f"  Combined (biz+sales+store): {len(combined)}")

    # ── Foot traffic 병합 (sigungu_code 기준, 최신 분기) ──
    if not foot_df.empty and 'sigungu_code' in foot_df.columns:
        # 최신 분기만 사용 (지역별)
        foot_latest = foot_df.sort_values('base_year_quarter', ascending=False) \
            .drop_duplicates(subset=['sigungu_code'], keep='first').copy()

        # foot_traffic_score 계산
        foot_latest['foot_traffic_score'] = foot_latest['total_foot_traffic'].fillna(0) / 1000.0

        # peak_hour_ratio (17-21시 / 활동 시간대 전체)
        time_cols = ['time_06_11', 'time_11_14', 'time_14_17', 'time_17_21', 'time_21_24']
        for c in time_cols:
            foot_latest[c] = pd.to_numeric(foot_latest[c], errors='coerce').fillna(0)
        total_active = foot_latest[time_cols].sum(axis=1).replace(0, 1)
        foot_latest['peak_hour_ratio'] = foot_latest['time_17_21'] / total_active

        # weekend_ratio (%)
        weekday = pd.to_numeric(foot_latest['weekday_avg'], errors='coerce').fillna(0)
        weekend = pd.to_numeric(foot_latest['weekend_avg'], errors='coerce').fillna(0)
        total_weekly = (weekday + weekend).replace(0, 1)
        foot_latest['weekend_ratio'] = weekend / total_weekly * 100

        # 저녁/아침 트래픽 (파생 피처용)
        foot_latest['evening_traffic'] = foot_latest['time_17_21']
        foot_latest['morning_traffic'] = foot_latest['time_06_11'].replace(0, 1)

        # 연령대 컬럼
        age_cols_sel = ['sigungu_code', 'foot_traffic_score', 'peak_hour_ratio',
                        'weekend_ratio', 'evening_traffic', 'morning_traffic']
        age_data_cols = ['age_10s', 'age_20s', 'age_30s', 'age_40s', 'age_50s', 'age_60s_plus']
        for c in age_data_cols:
            if c in foot_latest.columns:
                foot_latest[c] = pd.to_numeric(foot_latest[c], errors='coerce').fillna(0)
                age_cols_sel.append(c)

        ft_merge = foot_latest[age_cols_sel].copy()

        combined = pd.merge(combined, ft_merge, on='sigungu_code', how='left')
        print(f"  After foot_traffic merge: {len(combined)}")
    else:
        print("  Foot traffic: no data (features will be 0)")

    return combined


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Create features for ML model (v2 - delegates to BusinessFeatureEngineer)"""
    print("\nEngineering features...")

    # Calculate franchise_ratio and competition_ratio from raw columns
    if 'franchise_count' in df.columns and 'store_count' in df.columns:
        df['franchise_ratio'] = df['franchise_count'] / df['store_count'].replace(0, 1)
    if 'operating_count' in df.columns and 'store_count' in df.columns:
        df['competition_ratio'] = df['store_count'] / df['operating_count'].replace(0, 1)

    # Resolve duplicate columns from merges
    for col in ['sigungu_code', 'sido_code', 'industry_name']:
        for suffix in ['_business', '_sales', '_store']:
            alt = f'{col}{suffix}'
            if alt in df.columns and col not in df.columns:
                df[col] = df[alt]

    # Select core + context columns for training data CSV
    core_features = [
        'survival_rate', 'monthly_avg_sales', 'sales_growth_rate',
        'store_count', 'franchise_ratio', 'competition_ratio',
        'foot_traffic_score', 'peak_hour_ratio', 'weekend_ratio',
        'evening_traffic', 'morning_traffic',
    ]
    context_columns = [
        'commercial_district_code', 'industry_name', 'industry_small_code',
        'sigungu_code', 'sido_code', 'base_year_month',
    ]
    age_columns = ['age_10s', 'age_20s', 'age_30s', 'age_40s', 'age_50s', 'age_60s_plus']

    all_columns = context_columns + core_features + age_columns
    available_columns = [col for col in all_columns if col in df.columns]
    result = df[available_columns].copy()

    # Remove duplicates
    result = result.drop_duplicates()

    # Remove rows with missing core features
    required = ['survival_rate', 'monthly_avg_sales', 'sales_growth_rate', 'store_count']
    result = result.dropna(subset=required)

    # Fill optional feature NaNs
    for col in ['foot_traffic_score', 'peak_hour_ratio', 'weekend_ratio']:
        if col in result.columns:
            result[col] = result[col].fillna(0)
    for col in ['franchise_ratio', 'competition_ratio']:
        if col in result.columns:
            result[col] = result[col].fillna(result[col].median() if len(result) > 0 else 0.3)

    print(f"  Final training records: {len(result)}")
    print(f"  Columns: {list(result.columns)}")

    return result


def main():
    """Main execution"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--months", type=int, default=24, help="최근 N개월만 사용 (기본 24)")
    parser.add_argument("--quarters", type=int, default=8, help="최근 N분기만 사용 (기본 8)")
    args = parser.parse_args()

    print("=" * 60)
    print("Preparing Business Success Training Data (v2)")
    print("=" * 60)
    print(f"Supabase URL: {SUPABASE_URL}")
    print("=" * 60)

    # Create Supabase client
    # Disable env proxy usage to prevent local proxy settings from breaking DB access.
    supabase = create_client(
        SUPABASE_URL,
        SUPABASE_KEY,
        SyncClientOptions(httpx_client=httpx.Client(trust_env=False)),
    )

    # Fetch data
    business_df, sales_df, store_df, foot_df = fetch_statistics(
        supabase, months=args.months, quarters=args.quarters
    )

    if business_df.empty or sales_df.empty or store_df.empty:
        print("\nError: No data found in one or more tables.")
        print("\nPlease ensure:")
        print("  1. Migrations have been applied (015 and 016)")
        print("  2. Seed data has been generated (run seed_commercial_data.py)")
        sys.exit(1)

    # Combine statistics
    combined_df = combine_statistics(business_df, sales_df, store_df, foot_df)

    if combined_df.empty:
        print("\nError: Could not combine statistics.")
        sys.exit(1)

    # Engineer features
    training_df = engineer_features(combined_df)

    if len(training_df) < 100:
        print(f"\nWarning: Only {len(training_df)} training samples.")
        print("Consider generating more sample data for better model performance.")

    # Save to CSV
    output_dir = Path(__file__).parent
    output_file = output_dir / 'business_training_data.csv'
    training_df.to_csv(output_file, index=False)

    print(f"\nOK Training data saved to: {output_file}")
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Total records: {len(training_df)}")
    print(f"Unique months: {training_df['base_year_month'].nunique() if 'base_year_month' in training_df.columns else 'N/A'}")
    print(f"Unique regions: {training_df['sigungu_code'].nunique() if 'sigungu_code' in training_df.columns else 'N/A'}")
    print(f"Unique industries: {training_df['industry_small_code'].nunique() if 'industry_small_code' in training_df.columns else 'N/A'}")
    has_ft = 'foot_traffic_score' in training_df.columns and training_df['foot_traffic_score'].sum() > 0
    print(f"Foot traffic: {'connected' if has_ft else 'not available (all zeros)'}")
    print(f"\nNext step: Run train_business_model.py with this data")
    print(f"  python -m scripts.train_business_model --data {output_file}")


if __name__ == '__main__':
    main()
