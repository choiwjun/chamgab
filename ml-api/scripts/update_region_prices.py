#!/usr/bin/env python3
"""
regions 테이블의 avg_price NULL인 지역에 대해
transactions 테이블에서 평균가격을 계산하여 업데이트합니다.

- regions.code (10자리) -> 앞5자리 = transactions.region_code (5자리)
- transactions.price (만원 단위) -> avg_price (원 단위)
- NULL인 지역만 업데이트 (기존 값 유지)
"""
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

sb = create_client(SUPABASE_URL, SUPABASE_KEY)


def main():
    # 1. avg_price가 NULL인 level=2 (시군구) 지역 조회
    null_regions = (
        sb.table("regions")
        .select("id, code, name")
        .eq("level", 2)
        .is_("avg_price", "null")
        .execute()
    ).data
    print(f"avg_price NULL regions: {len(null_regions)}")

    if not null_regions:
        print("All regions have avg_price. Nothing to do.")
        return

    # 2. 전체 지역도 확인
    all_regions = (
        sb.table("regions")
        .select("id, code, name, avg_price")
        .eq("level", 2)
        .execute()
    ).data
    print(f"Total level=2 regions: {len(all_regions)}")
    has_price = sum(1 for r in all_regions if r.get("avg_price") is not None)
    print(f"Already have avg_price: {has_price}")

    updated = 0
    no_data = 0
    errors = 0

    for region in null_regions:
        code = region["code"]  # 10-digit (e.g., 1168000000)
        name = region["name"]
        region_code_5 = code[:5]  # 5-digit (e.g., 11680)

        try:
            # transactions에서 해당 지역 가격 조회
            # region_code가 5자리 sigungu 코드
            txns = (
                sb.table("transactions")
                .select("price")
                .eq("region_code", region_code_5)
                .not_.is_("price", "null")
                .limit(1000)
                .execute()
            ).data

            if not txns:
                # region_code 말고 sigungu 이름으로도 시도
                txns = (
                    sb.table("transactions")
                    .select("price")
                    .eq("sigungu", name)
                    .not_.is_("price", "null")
                    .limit(1000)
                    .execute()
                ).data

            if not txns:
                print(f"  [{name}] ({region_code_5}) - No transactions found")
                no_data += 1
                continue

            prices = [t["price"] for t in txns if t.get("price")]
            if not prices:
                print(f"  [{name}] ({region_code_5}) - No valid prices")
                no_data += 1
                continue

            # price는 이미 원(won) 단위
            avg_price_won = int(sum(prices) / len(prices))

            # regions 업데이트
            sb.table("regions").update({
                "avg_price": avg_price_won,
                "updated_at": "now()"
            }).eq("id", region["id"]).execute()

            print(f"  [{name}] ({region_code_5}) - {len(prices)} txns, avg_price={avg_price_won:,}won ({avg_price_won/100000000:.1f}억)")
            updated += 1

        except Exception as e:
            print(f"  [{name}] ERROR: {e}")
            errors += 1

    print(f"\n=== Results ===")
    print(f"Updated: {updated}")
    print(f"No transaction data: {no_data}")
    print(f"Errors: {errors}")
    print(f"Total processed: {updated + no_data + errors}/{len(null_regions)}")

    # 최종 커버리지
    final = (
        sb.table("regions")
        .select("id, avg_price")
        .eq("level", 2)
        .execute()
    ).data
    final_has = sum(1 for r in final if r.get("avg_price") is not None)
    print(f"\nFinal coverage: {final_has}/{len(final)} ({final_has/len(final)*100:.1f}%)")


if __name__ == "__main__":
    main()
