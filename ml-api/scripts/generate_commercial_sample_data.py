#!/usr/bin/env python3
"""
Generate sample commercial analysis data for testing
Creates synthetic data for districts, industries, and statistics
"""
import os
import sys
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any

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
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables required")
    sys.exit(1)

# Sample districts (상권)
SAMPLE_DISTRICTS = [
    {'code': '1168053500', 'name': '강남역', 'description': '서울 강남구 강남역 일대'},
    {'code': '1165064000', 'name': '강남대로(서초)', 'description': '서울 서초구 강남대로 일대'},
    {'code': '1171051500', 'name': '잠실역', 'description': '서울 송파구 잠실역 일대'},
    {'code': '1144036000', 'name': '홍대입구역', 'description': '서울 마포구 홍대 일대'},
    {'code': '1120062000', 'name': '성수동', 'description': '서울 성동구 성수동 일대'},
]

# Sample industries (업종)
SAMPLE_INDUSTRIES = [
    {'code': 'Q01', 'name': '한식음식점', 'category': '외식업', 'description': '한식 음식점'},
    {'code': 'Q12', 'name': '커피전문점', 'category': '외식업', 'description': '카페/커피전문점'},
    {'code': 'Q06', 'name': '치킨전문점', 'category': '외식업', 'description': '치킨 전문점'},
    {'code': 'Q04', 'name': '서양식음식점', 'category': '외식업', 'description': '양식 음식점'},
    {'code': 'D01', 'name': '편의점', 'category': '소매업', 'description': '편의점'},
]


def generate_business_statistics(district_code: str, industry_code: str, base_ym: str) -> Dict[str, Any]:
    """Generate sample business statistics"""
    open_count = random.randint(50, 200)
    close_count = random.randint(20, 100)
    operating_count = random.randint(100, 500)

    return {
        'commercial_district_code': district_code,
        'sido_code': district_code[:2],
        'sigungu_code': district_code[:5],
        'industry_large_code': industry_code[0],
        'industry_medium_code': industry_code[:2],
        'industry_small_code': industry_code,
        'industry_name': next((i['name'] for i in SAMPLE_INDUSTRIES if i['code'] == industry_code), ''),
        'open_count': open_count,
        'close_count': close_count,
        'operating_count': operating_count,
        'survival_rate': round((operating_count / (operating_count + close_count)) * 100, 2),
        'base_year_month': base_ym,
    }


def generate_sales_statistics(district_code: str, industry_code: str, base_ym: str) -> Dict[str, Any]:
    """Generate sample sales statistics"""
    monthly_avg_sales = random.randint(5_000_000, 50_000_000)
    monthly_sales_count = random.randint(100, 2000)

    return {
        'commercial_district_code': district_code,
        'sido_code': district_code[:2],
        'sigungu_code': district_code[:5],
        'industry_large_code': industry_code[0],
        'industry_medium_code': industry_code[:2],
        'industry_small_code': industry_code,
        'industry_name': next((i['name'] for i in SAMPLE_INDUSTRIES if i['code'] == industry_code), ''),
        'monthly_avg_sales': monthly_avg_sales,
        'monthly_sales_count': monthly_sales_count,
        'sales_growth_rate': round(random.uniform(-10, 20), 2),
        'weekend_sales_ratio': round(random.uniform(30, 50), 2),
        'weekday_sales_ratio': round(random.uniform(50, 70), 2),
        'base_year_month': base_ym,
    }


def generate_store_statistics(district_code: str, industry_code: str, base_ym: str) -> Dict[str, Any]:
    """Generate sample store statistics"""
    store_count = random.randint(10, 200)
    franchise_count = random.randint(0, store_count // 2)

    return {
        'commercial_district_code': district_code,
        'sido_code': district_code[:2],
        'sigungu_code': district_code[:5],
        'industry_large_code': industry_code[0],
        'industry_medium_code': industry_code[:2],
        'industry_small_code': industry_code,
        'industry_name': next((i['name'] for i in SAMPLE_INDUSTRIES if i['code'] == industry_code), ''),
        'store_count': store_count,
        'density_level': '높음' if store_count >= 50 else '중간' if store_count >= 10 else '낮음',
        'franchise_count': franchise_count,
        'independent_count': store_count - franchise_count,
        'base_year_month': base_ym,
    }


def generate_foot_traffic(district_code: str, base_yq: str) -> Dict[str, Any]:
    """Generate sample foot traffic statistics"""
    total = random.randint(50000, 200000)

    return {
        'commercial_district_code': district_code,
        'sido_code': district_code[:2],
        'sigungu_code': district_code[:5],
        'age_10s': int(total * 0.10),
        'age_20s': int(total * 0.25),
        'age_30s': int(total * 0.25),
        'age_40s': int(total * 0.20),
        'age_50s': int(total * 0.15),
        'age_60s_plus': int(total * 0.05),
        'male_count': int(total * 0.52),
        'female_count': int(total * 0.48),
        'time_00_06': int(total * 0.05),
        'time_06_11': int(total * 0.15),
        'time_11_14': int(total * 0.20),
        'time_14_17': int(total * 0.15),
        'time_17_21': int(total * 0.30),
        'time_21_24': int(total * 0.15),
        'weekday_avg': int(total * 0.6),
        'weekend_avg': int(total * 0.4),
        'total_foot_traffic': total,
        'base_year_quarter': base_yq,
    }


def generate_district_characteristics(district_code: str, district_name: str, base_yq: str) -> Dict[str, Any]:
    """Generate sample district characteristics"""
    district_types = ['대학상권', '오피스상권', '주거상권', '유흥상권', '관광상권']
    age_groups = ['20대', '30-40대', '40-50대', '전연령']
    consumption_levels = ['높음', '중간', '낮음']

    return {
        'commercial_district_code': district_code,
        'district_name': district_name,
        'district_type': random.choice(district_types),
        'primary_age_group': random.choice(age_groups),
        'primary_age_ratio': round(random.uniform(30, 50), 2),
        'office_worker_ratio': round(random.uniform(20, 60), 2),
        'resident_ratio': round(random.uniform(20, 60), 2),
        'student_ratio': round(random.uniform(5, 30), 2),
        'peak_time_start': '18:00',
        'peak_time_end': '21:00',
        'peak_time_traffic': random.randint(10000, 50000),
        'weekday_dominant': random.choice([True, False]),
        'weekend_sales_ratio': round(random.uniform(30, 50), 2),
        'avg_ticket_price': random.randint(10000, 40000),
        'consumption_level': random.choice(consumption_levels),
        'base_year_quarter': base_yq,
    }


def main():
    """Generate and insert sample data"""
    print("=" * 60)
    print("Generating Sample Commercial Data")
    print("=" * 60)
    print(f"Supabase URL: {SUPABASE_URL}")
    print("=" * 60)

    # Create Supabase client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Generate base dates (last 12 months for YYYYMM, last 4 quarters for YYYYQQ)
    now = datetime.now()
    base_months = []
    for i in range(12):
        date = now - timedelta(days=30 * i)
        base_months.append(date.strftime('%Y%m'))

    base_quarters = []
    for i in range(4):
        date = now - timedelta(days=90 * i)
        quarter = (date.month - 1) // 3 + 1
        base_quarters.append(f"{date.year}{quarter:02d}")

    # Generate data
    business_data = []
    sales_data = []
    store_data = []
    foot_traffic_data = []
    characteristics_data = []

    print("\nGenerating statistics...")
    for district in SAMPLE_DISTRICTS:
        district_code = district['code']

        # Monthly statistics (business, sales, store)
        for base_ym in base_months[:3]:  # Last 3 months
            for industry in SAMPLE_INDUSTRIES:
                industry_code = industry['code']

                business_data.append(generate_business_statistics(district_code, industry_code, base_ym))
                sales_data.append(generate_sales_statistics(district_code, industry_code, base_ym))
                store_data.append(generate_store_statistics(district_code, industry_code, base_ym))

        # Quarterly statistics (foot traffic, characteristics)
        for base_yq in base_quarters[:2]:  # Last 2 quarters
            foot_traffic_data.append(generate_foot_traffic(district_code, base_yq))
            characteristics_data.append(generate_district_characteristics(
                district_code, district['name'], base_yq
            ))

    print(f"  Business statistics: {len(business_data)} records")
    print(f"  Sales statistics: {len(sales_data)} records")
    print(f"  Store statistics: {len(store_data)} records")
    print(f"  Foot traffic: {len(foot_traffic_data)} records")
    print(f"  District characteristics: {len(characteristics_data)} records")

    # Insert data
    print("\nInserting data into Supabase...")

    try:
        print("  Inserting business statistics...")
        supabase.table('business_statistics').upsert(business_data).execute()

        print("  Inserting sales statistics...")
        supabase.table('sales_statistics').upsert(sales_data).execute()

        print("  Inserting store statistics...")
        supabase.table('store_statistics').upsert(store_data).execute()

        print("  Inserting foot traffic...")
        supabase.table('foot_traffic_statistics').upsert(foot_traffic_data).execute()

        print("  Inserting district characteristics...")
        supabase.table('district_characteristics').upsert(characteristics_data).execute()

        print("\n" + "=" * 60)
        print("✓ Sample data generated successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ Error inserting data: {e}")
        print("\nNote: Make sure migrations have been applied first.")
        print("Run the following SQL in Supabase Dashboard:")
        print("  - supabase/migrations/015_create_commercial_analysis_tables.sql")
        print("  - supabase/migrations/016_add_commercial_demographics.sql")
        sys.exit(1)


if __name__ == '__main__':
    main()
