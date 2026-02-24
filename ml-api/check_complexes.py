"""Complexes 테이블 데이터 수집 상황 확인"""
from app.core.database import get_supabase_client

client = get_supabase_client()

# complexes 테이블의 전체 레코드 수 확인
result = client.table('complexes').select('id', count='exact').execute()
total_count = result.count
print(f'Complexes 총 레코드 수: {total_count:,}건')

# 샘플 데이터 확인 (최초 5건)
sample = client.table('complexes').select('*').limit(5).execute()
if sample.data:
    print(f'\n샘플 데이터 ({len(sample.data)}건):')
    for i, row in enumerate(sample.data, 1):
        print(f'  {i}. id={row.get("id")}, name={row.get("name")}, sido={row.get("sido")}, total_units={row.get("total_units")}')
else:
    print('\n샘플 데이터 없음')

# 결측치 확인
columns_to_check = ['name', 'sido', 'sigungu', 'total_units', 'total_buildings', 'built_year', 'parking_ratio', 'brand']
print(f'\n주요 컬럼별 결측치 현황:')
for col in columns_to_check:
    result = client.table('complexes').select(col, count='exact', head=True).execute()
    print(f'  {col}: {result.count}건')
