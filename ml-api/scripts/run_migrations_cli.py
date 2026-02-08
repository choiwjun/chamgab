#!/usr/bin/env python3
"""
Run Supabase migrations via Management API
Uses Supabase service role key to execute SQL directly
"""
import os
import sys
import json
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
    import requests
except ImportError:
    print("Installing requests...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'requests'])
    import requests


# Supabase credentials
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY required")
    sys.exit(1)

# Extract project ref from URL
project_ref = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')

MIGRATIONS = [
    '015_create_commercial_analysis_tables.sql',
    '016_add_commercial_demographics.sql',
]


def execute_sql_via_rest(sql: str) -> bool:
    """
    Execute SQL using Supabase REST endpoint
    Note: This uses a workaround since PostgREST doesn't support DDL directly
    """
    # We'll use the postgrest endpoint with a raw SQL query
    # This requires the SQL to be wrapped in a function or executed differently

    # Alternative: Use rpc endpoint if a function exists
    # For now, we'll output the SQL for manual execution

    return False


def execute_sql_via_http(sql: str) -> bool:
    """
    Try to execute SQL via HTTP request to Supabase
    """
    # Unfortunately, Supabase doesn't expose a direct SQL execution endpoint
    # without using the Management API which requires Personal Access Token

    print("Direct SQL execution not available via REST API")
    return False


def output_sql_for_manual_execution():
    """Output SQL files for manual execution"""
    print("\n" + "=" * 60)
    print("SQL Migration Files")
    print("=" * 60)

    migrations_dir = Path(__file__).parent.parent.parent / 'supabase' / 'migrations'

    for migration_file in MIGRATIONS:
        file_path = migrations_dir / migration_file
        if not file_path.exists():
            print(f"\nError: File not found: {file_path}")
            continue

        print(f"\n{'=' * 60}")
        print(f"File: {migration_file}")
        print("=" * 60)

        with open(file_path, 'r', encoding='utf-8') as f:
            sql_content = f.read()

        print(sql_content)
        print("\n" + "=" * 60)

    print("\nPlease copy the SQL above and execute in:")
    print(f"https://app.supabase.com/project/{project_ref}/sql/new")


def try_create_tables_programmatically():
    """
    Try to create a simple test via Supabase client
    """
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

        # Try to check if we can create a function that executes SQL
        # This is a workaround but may not work due to permissions

        print("\nAttempting to create tables via Supabase client...")
        print("Note: This may fail due to PostgREST limitations with DDL")

        # We cannot execute DDL directly via PostgREST
        # So we return False
        return False

    except Exception as e:
        print(f"Error: {e}")
        return False


def main():
    """Main execution"""
    print("=" * 60)
    print("Supabase CLI Migration Runner")
    print("=" * 60)
    print(f"Project: {project_ref}")
    print(f"URL: {SUPABASE_URL}")
    print("=" * 60)

    print("\nChecking migration methods...")

    # Method 1: Try programmatic creation
    if try_create_tables_programmatically():
        print("SUCCESS: Tables created programmatically")
        return

    # Method 2: Output SQL for manual execution
    print("\nAutomatic migration not available.")
    print("PostgREST does not support DDL operations directly.")
    print("\nGenerating SQL output for manual execution...")

    # Ask user if they want to see the SQL or get instructions
    print("\nOptions:")
    print("1. Show SQL files content (copy to SQL Editor)")
    print("2. Show SQL Editor instructions only")
    print("3. Exit and apply migrations manually")

    choice = input("\nSelect option (1-3): ").strip()

    if choice == '1':
        output_sql_for_manual_execution()
    elif choice == '2':
        print("\n" + "=" * 60)
        print("Manual Migration Instructions")
        print("=" * 60)
        print("\n1. Open Supabase Dashboard:")
        print(f"   https://app.supabase.com/project/{project_ref}")
        print("\n2. Navigate to: SQL Editor")
        print("\n3. Create a new query and paste the contents of:")

        migrations_dir = Path(__file__).parent.parent.parent / 'supabase' / 'migrations'
        for migration in MIGRATIONS:
            file_path = migrations_dir / migration
            print(f"   - {file_path}")

        print("\n4. Run each migration in order")
        print("\n5. Return here and run:")
        print("   python ml-api/scripts/generate_commercial_sample_data.py")
    else:
        print("\nExiting. Please apply migrations manually.")
        print(f"\n Migrations location:")
        migrations_dir = Path(__file__).parent.parent.parent / 'supabase' / 'migrations'
        for migration in MIGRATIONS:
            file_path = migrations_dir / migration
            print(f"  - {file_path}")


if __name__ == '__main__':
    main()
