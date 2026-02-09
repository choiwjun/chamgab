"""
누락된 5개 시도(강원, 전북, 전남, 경북, 경남)의 regions 테이블 시딩
- level=1 (시도) + level=2 (시군구) 레코드 생성
- 10자리 법정동코드 형식 (e.g., 4211000000)
"""
import os
import sys
from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

# 누락된 시도 정의
MISSING_SIDO = {
    '42': {'name': '강원특별자치도', 'code10': '4200000000'},
    '45': {'name': '전북특별자치도', 'code10': '4500000000'},
    '46': {'name': '전라남도', 'code10': '4600000000'},
    '47': {'name': '경상북도', 'code10': '4700000000'},
    '48': {'name': '경상남도', 'code10': '4800000000'},
}

# 누락된 시군구 정의 (5자리 코드, 이름)
MISSING_SIGUNGU = {
    # 강원특별자치도
    '42110': '춘천시', '42130': '원주시', '42150': '강릉시',
    '42170': '동해시', '42190': '태백시', '42210': '속초시',
    '42230': '삼척시', '42720': '홍천군', '42730': '횡성군',
    '42750': '영월군', '42760': '평창군', '42770': '정선군',
    '42780': '철원군', '42790': '화천군', '42800': '양구군',
    '42810': '인제군', '42820': '고성군', '42830': '양양군',
    # 전북특별자치도
    '45111': '전주시 완산구', '45113': '전주시 덕진구', '45130': '군산시',
    '45140': '익산시', '45150': '정읍시', '45180': '남원시',
    '45190': '김제시', '45710': '완주군', '45720': '진안군',
    '45730': '무주군', '45740': '장수군', '45750': '임실군',
    '45770': '순창군', '45790': '고창군', '45800': '부안군',
    # 전라남도
    '46110': '목포시', '46130': '여수시', '46150': '순천시',
    '46170': '나주시', '46230': '광양시', '46710': '담양군',
    '46720': '곡성군', '46730': '구례군', '46770': '고흥군',
    '46780': '보성군', '46790': '화순군', '46800': '장흥군',
    '46810': '강진군', '46820': '해남군', '46830': '영암군',
    '46840': '무안군', '46860': '함평군', '46870': '영광군',
    '46880': '장성군', '46890': '완도군', '46900': '진도군',
    '46910': '신안군',
    # 경상북도
    '47111': '포항시 남구', '47113': '포항시 북구', '47130': '경주시',
    '47150': '김천시', '47170': '안동시', '47190': '구미시',
    '47210': '영주시', '47230': '영천시', '47250': '상주시',
    '47280': '문경시', '47290': '경산시', '47720': '군위군',
    '47730': '의성군', '47750': '청송군', '47760': '영양군',
    '47770': '영덕군', '47820': '청도군', '47830': '고령군',
    '47840': '성주군', '47850': '칠곡군', '47900': '예천군',
    '47920': '봉화군', '47930': '울진군', '47940': '울릉군',
    # 경상남도
    '48121': '창원시 의창구', '48123': '창원시 성산구',
    '48125': '창원시 마산합포구', '48127': '창원시 마산회원구',
    '48129': '창원시 진해구', '48170': '진주시', '48220': '통영시',
    '48240': '사천시', '48250': '김해시', '48270': '밀양시',
    '48310': '거제시', '48330': '양산시', '48720': '의령군',
    '48730': '함안군', '48740': '창녕군', '48820': '고성군',
    '48840': '남해군', '48850': '하동군', '48860': '산청군',
    '48870': '함양군', '48880': '거창군', '48890': '합천군',
}


def main():
    print("=== Seeding missing regions ===\n")

    # 1. 시도 (level=1) 추가
    sido_records = []
    for prefix, info in MISSING_SIDO.items():
        sido_records.append({
            'code': info['code10'],
            'name': info['name'],
            'level': 1,
            'parent_code': None,
        })

    print(f"Upserting {len(sido_records)} sido records...")
    for rec in sido_records:
        sb.table("regions").upsert(rec, on_conflict="code").execute()
        print(f"  + {rec['code']} {rec['name']}")

    # 2. 시군구 (level=2) 추가
    sigungu_records = []
    for code5, name in MISSING_SIGUNGU.items():
        sido_prefix = code5[:2]
        sido_code10 = MISSING_SIDO[sido_prefix]['code10']
        code10 = f"{code5}00000" if len(code5) == 5 else f"{code5}0000"
        # 10자리로 맞추기
        code10 = code10[:10].ljust(10, '0')

        sigungu_records.append({
            'code': code10,
            'name': name,
            'level': 2,
            'parent_code': sido_code10,
        })

    print(f"\nUpserting {len(sigungu_records)} sigungu records...")
    # batch upsert
    batch_size = 50
    for i in range(0, len(sigungu_records), batch_size):
        batch = sigungu_records[i:i + batch_size]
        sb.table("regions").upsert(batch, on_conflict="code").execute()
        for rec in batch:
            print(f"  + {rec['code']} {rec['name']}")

    print(f"\nDone! Added {len(sido_records)} sido + {len(sigungu_records)} sigungu = {len(sido_records) + len(sigungu_records)} total")

    # 3. 검증
    total = sb.table("regions").select("id", count="exact").execute().count
    sido_count = sb.table("regions").select("id", count="exact").eq("level", 1).execute().count
    sigungu_count = sb.table("regions").select("id", count="exact").eq("level", 2).execute().count
    print(f"\nVerification: {total} total regions ({sido_count} sido, {sigungu_count} sigungu)")


if __name__ == "__main__":
    main()
