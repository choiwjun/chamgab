#!/usr/bin/env python3
"""
Prepare training data for business success prediction model
Combines statistics from multiple tables and creates labeled training data
"""
import os
import sys
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
    from supabase import create_client, Client
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pandas', 'supabase'])
    import pandas as pd
    from supabase import create_client, Client


# Supabase credentials
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Supabase not configured.")
    print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.")
    sys.exit(1)


def fetch_statistics(supabase: Client) -> tuple:
    """Fetch all statistics from Supabase"""
    print("\nFetching statistics from Supabase...")

    # Fetch business statistics
    business_response = supabase.table('business_statistics').select('*').execute()
    business_df = pd.DataFrame(business_response.data) if business_response.data else pd.DataFrame()
    print(f"  Business statistics: {len(business_df)} records")

    # Fetch sales statistics
    sales_response = supabase.table('sales_statistics').select('*').execute()
    sales_df = pd.DataFrame(sales_response.data) if sales_response.data else pd.DataFrame()
    print(f"  Sales statistics: {len(sales_df)} records")

    # Fetch store statistics
    store_response = supabase.table('store_statistics').select('*').execute()
    store_df = pd.DataFrame(store_response.data) if store_response.data else pd.DataFrame()
    print(f"  Store statistics: {len(store_df)} records")

    return business_df, sales_df, store_df


def combine_statistics(business_df: pd.DataFrame, sales_df: pd.DataFrame, store_df: pd.DataFrame) -> pd.DataFrame:
    """Combine statistics from multiple tables"""
    print("\nCombining statistics...")

    if business_df.empty or sales_df.empty or store_df.empty:
        print("Warning: One or more tables are empty. Cannot combine.")
        return pd.DataFrame()

    # Merge on commercial_district_code, industry_small_code, base_year_month
    merge_keys = ['commercial_district_code', 'industry_small_code', 'base_year_month']

    # First merge: business + sales
    combined = pd.merge(
        business_df,
        sales_df,
        on=merge_keys,
        how='inner',
        suffixes=('_business', '_sales')
    )

    # Second merge: + store
    combined = pd.merge(
        combined,
        store_df,
        on=merge_keys,
        how='inner',
        suffixes=('', '_store')
    )

    print(f"  Combined records: {len(combined)}")

    return combined


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Create features for ML model"""
    print("\nEngineering features...")

    # Calculate franchise_ratio
    df['franchise_ratio'] = df['franchise_count'] / df['store_count'].replace(0, 1)

    # Calculate competition_ratio (store count vs operating count)
    df['competition_ratio'] = df['store_count'] / df['operating_count'].replace(0, 1)

    # Create success target based on survival_rate and sales_growth_rate
    # Success = survival_rate > 70 AND sales_growth_rate > 0
    df['success'] = (
        (df['survival_rate'] > 70) &
        (df['sales_growth_rate'] > 0)
    ).astype(int)

    # Select model features
    feature_columns = [
        'survival_rate',
        'monthly_avg_sales',
        'sales_growth_rate',
        'store_count',
        'franchise_ratio',
        'competition_ratio',
        'success',
    ]

    # Additional context columns for reference
    context_columns = [
        'commercial_district_code',
        'industry_name',
        'industry_small_code',
        'base_year_month',
    ]

    # Select and clean
    all_columns = context_columns + feature_columns
    available_columns = [col for col in all_columns if col in df.columns]
    result = df[available_columns].copy()

    # Remove duplicates
    result = result.drop_duplicates()

    # Remove rows with missing values in feature columns
    result = result.dropna(subset=feature_columns)

    print(f"  Final training records: {len(result)}")
    print(f"\nSuccess distribution:")
    print(result['success'].value_counts())

    return result


def main():
    """Main execution"""
    print("=" * 60)
    print("Preparing Business Success Training Data")
    print("=" * 60)
    print(f"Supabase URL: {SUPABASE_URL}")
    print("=" * 60)

    # Create Supabase client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Fetch data
    business_df, sales_df, store_df = fetch_statistics(supabase)

    if business_df.empty or sales_df.empty or store_df.empty:
        print("\nError: No data found in one or more tables.")
        print("\nPlease ensure:")
        print("  1. Migrations have been applied (015 and 016)")
        print("  2. Sample data has been generated (run generate_commercial_sample_data.py)")
        sys.exit(1)

    # Combine statistics
    combined_df = combine_statistics(business_df, sales_df, store_df)

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
    print(f"Features: survival_rate, monthly_avg_sales, sales_growth_rate,")
    print(f"          store_count, franchise_ratio, competition_ratio")
    print(f"Target: success (0=failure, 1=success)")
    print("\nNext step: Run train_business_model.py with this data")
    print(f"  python -m scripts.train_business_model --data {output_file}")


if __name__ == '__main__':
    main()
