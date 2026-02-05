#!/usr/bin/env python3
"""
Apply Supabase migrations using direct PostgreSQL connection
"""
import os
import sys
from pathlib import Path

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    project_root = Path(__file__).parent.parent.parent
    env_file = project_root / '.env'
    if env_file.exists():
        load_dotenv(env_file)
        print(f"Loaded environment variables from {env_file}")
except ImportError:
    print("python-dotenv not installed, skipping .env loading")

try:
    import psycopg2
except ImportError:
    print("Installing psycopg2-binary...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'psycopg2-binary'])
    import psycopg2

# Supabase credentials
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables required")
    sys.exit(1)

# Extract database connection details from Supabase URL
# Format: https://xxxxx.supabase.co
project_ref = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
DB_HOST = f"{project_ref}.supabase.co"
DB_PORT = 5432
DB_NAME = "postgres"
DB_USER = "postgres"
# The service role key is not the DB password, we need SUPABASE_DB_PASSWORD
DB_PASSWORD = os.environ.get('SUPABASE_DB_PASSWORD', '')

# Migration files to apply
MIGRATIONS = [
    '015_create_commercial_analysis_tables.sql',
    '016_add_commercial_demographics.sql',
]


def get_connection_string():
    """Build PostgreSQL connection string"""
    if DB_PASSWORD:
        return f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    else:
        # Try to connect using service role key (not ideal but worth a try)
        print("Warning: SUPABASE_DB_PASSWORD not set. Migration may fail.")
        print("Please set SUPABASE_DB_PASSWORD environment variable.")
        print("You can find it in Supabase Dashboard -> Settings -> Database -> Connection string")
        return None


def apply_migration(conn, migration_file: Path):
    """Apply a single migration file"""
    print(f"\nApplying migration: {migration_file.name}")

    with open(migration_file, 'r', encoding='utf-8') as f:
        sql_content = f.read()

    try:
        cursor = conn.cursor()
        cursor.execute(sql_content)
        conn.commit()
        cursor.close()
        print(f"✓ Migration {migration_file.name} applied successfully")
        return True

    except psycopg2.Error as e:
        # Check if it's a "table already exists" error
        if 'already exists' in str(e).lower():
            print(f"✓ Migration {migration_file.name}: Tables already exist (OK)")
            conn.rollback()
            return True
        else:
            print(f"✗ Error applying migration {migration_file.name}:")
            print(f"  {e}")
            conn.rollback()
            return False


def main():
    """Apply all migrations"""
    print("=" * 60)
    print("Applying Supabase Migrations")
    print("=" * 60)
    print(f"Supabase URL: {SUPABASE_URL}")
    print(f"Database Host: {DB_HOST}")
    print("=" * 60)

    # Get connection string
    conn_string = get_connection_string()
    if not conn_string:
        print("\n" + "=" * 60)
        print("Manual Migration Required")
        print("=" * 60)
        print("Please apply migrations manually via Supabase Dashboard:")
        print("1. Go to https://app.supabase.com")
        print("2. Select your project")
        print("3. Go to SQL Editor")
        print("4. Copy and paste the contents of:")
        for migration in MIGRATIONS:
            print(f"   - supabase/migrations/{migration}")
        print("=" * 60)
        return

    # Connect to database
    try:
        print("\nConnecting to database...")
        conn = psycopg2.connect(conn_string)
        print("✓ Connected successfully")
    except psycopg2.Error as e:
        print(f"✗ Connection failed: {e}")
        print("\nPlease apply migrations manually via Supabase Dashboard (see instructions above)")
        sys.exit(1)

    # Get migrations directory
    project_root = Path(__file__).parent.parent.parent
    migrations_dir = project_root / 'supabase' / 'migrations'

    if not migrations_dir.exists():
        print(f"Error: Migrations directory not found: {migrations_dir}")
        sys.exit(1)

    # Apply each migration
    success_count = 0
    for migration_name in MIGRATIONS:
        migration_file = migrations_dir / migration_name

        if not migration_file.exists():
            print(f"Warning: Migration file not found: {migration_file}")
            continue

        if apply_migration(conn, migration_file):
            success_count += 1

    # Close connection
    conn.close()

    print("\n" + "=" * 60)
    print(f"Migrations applied: {success_count}/{len(MIGRATIONS)}")
    print("=" * 60)


if __name__ == '__main__':
    main()

