#!/usr/bin/env python3
"""Check Supabase data counts"""
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

from supabase import create_client

# Supabase credentials
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY required")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

tables = [
    'business_statistics',
    'sales_statistics',
    'store_statistics',
    'foot_traffic_statistics',
    'district_characteristics'
]

print("=" * 60)
print("Supabase Data Count")
print("=" * 60)

for table in tables:
    try:
        result = supabase.table(table).select('*', count='exact').execute()
        count = result.count if hasattr(result, 'count') else len(result.data)
        print(f"{table:30} {count:>5} records")
    except Exception as e:
        print(f"{table:30} ERROR: {e}")

print("=" * 60)

# Show sample data from business_statistics
print("\nSample Data (business_statistics):")
print("-" * 60)
result = supabase.table('business_statistics').select('*').limit(3).execute()
if result.data:
    for i, record in enumerate(result.data[:3], 1):
        print(f"\nRecord {i}:")
        print(f"  District: {record.get('commercial_district_code')}")
        print(f"  Industry: {record.get('industry_small_code')} - {record.get('industry_name')}")
        print(f"  Survival Rate: {record.get('survival_rate')}%")
        print(f"  Open: {record.get('open_count')}, Close: {record.get('close_count')}")
        print(f"  Base YM: {record.get('base_year_month')}")
