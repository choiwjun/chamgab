#!/usr/bin/env python3
"""
Setup commercial tables and data via Supabase Python client
This script creates tables programmatically and inserts sample data
"""
import os
import sys
from pathlib import Path

# Load environment variables
try:
    from dotenv import load_dotenv
    project_root = Path(__file__).parent.parent.parent
    env_file = project_root / '.env'
    if env_file.exists():
        load_dotenv(env_file)
except ImportError:
    pass

try:
    from supabase import create_client, Client
except ImportError:
    print("Installing supabase...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'supabase'])
    from supabase import create_client, Client

# Supabase credentials
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY required")
    sys.exit(1)


def check_table_exists(supabase: Client, table_name: str) -> bool:
    """Check if a table exists by trying to query it"""
    try:
        supabase.table(table_name).select('*').limit(1).execute()
        return True
    except Exception as e:
        if 'does not exist' in str(e).lower() or 'not found' in str(e).lower():
            return False
        # Re-raise if it's a different error
        raise


def main():
    """Check tables and guide user"""
    print("=" * 60)
    print("Commercial Tables Setup Check")
    print("=" * 60)
    print(f"Supabase URL: {SUPABASE_URL}")
    print("=" * 60)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Check required tables
    required_tables = [
        'business_statistics',
        'sales_statistics',
        'store_statistics',
        'foot_traffic_statistics',
        'district_characteristics',
    ]

    print("\nChecking tables...")
    missing_tables = []

    for table in required_tables:
        try:
            exists = check_table_exists(supabase, table)
            if exists:
                print(f"  OK {table}")
            else:
                print(f"  X {table} (missing)")
                missing_tables.append(table)
        except Exception as e:
            print(f"  X {table} (error: {e})")
            missing_tables.append(table)

    if missing_tables:
        print("\n" + "=" * 60)
        print("Tables Missing - Running Migrations")
        print("=" * 60)
        print("\nPlease apply migrations via Supabase Dashboard:")
        print("1. Go to: https://app.supabase.com")
        print("2. Select your project")
        print("3. Go to: SQL Editor")
        print("4. Run these SQL files in order:")
        print("   a) supabase/migrations/015_create_commercial_analysis_tables.sql")
        print("   b) supabase/migrations/016_add_commercial_demographics.sql")
        print("\nOr run the SQL files here:")

        # Print file paths
        migrations_dir = Path(__file__).parent.parent.parent / 'supabase' / 'migrations'
        for migration in ['015_create_commercial_analysis_tables.sql', '016_add_commercial_demographics.sql']:
            migration_file = migrations_dir / migration
            if migration_file.exists():
                print(f"   - {migration_file}")

        print("\nAfter applying migrations, run:")
        print("  python ml-api/scripts/generate_commercial_sample_data.py")
        sys.exit(1)
    else:
        print("\n" + "=" * 60)
        print("✓ All tables exist!")
        print("=" * 60)
        print("\nNext steps:")
        print("1. Generate sample data:")
        print("   python ml-api/scripts/generate_commercial_sample_data.py")
        print("\n2. Prepare training data:")
        print("   python ml-api/scripts/prepare_business_training_data.py")
        print("\n3. Train model:")
        print("   python -m scripts.train_business_model --data scripts/business_training_data.csv")


if __name__ == '__main__':
    main()
