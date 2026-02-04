# -*- coding: utf-8 -*-
"""
빠른 가격 분석 CLI

사용법:
  python quick_price.py --name "안산고잔푸르지오5차" --area 89 --floor 15 --year 2003
"""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))


def quick_analyze(name: str, area: float, floor: int, total_floors: int,
                  built_year: int, sigungu: str, base_price: int):
    """빠른 가격 분석"""

    building_age = 2026 - built_year
    floor_ratio = floor / total_floors

    # 기준가 (만원)
    base = base_price * 10000  # 원 단위

    adjustments = []

    # 1. 층수 프리미엄
    if floor_ratio >= 0.9:  # 최상층
        adj = base * 0.05
        adjustments.append(("최상층 프리미엄", adj, "+5%"))
    elif floor_ratio >= 0.6:  # 로열층
        adj = base * 0.03
        adjustments.append(("로열층 프리미엄", adj, "+3%"))
    elif floor_ratio <= 0.2:  # 저층
        adj = base * -0.02
        adjustments.append(("저층 디스카운트", adj, "-2%"))

    # 2. 연식
    if building_age >= 25:
        adj = base * -0.04
        adjustments.append(("구축 디스카운트", adj, "-4%"))
    elif building_age >= 20:
        adj = base * -0.03
        adjustments.append(("구축 디스카운트", adj, "-3%"))
    elif building_age <= 5:
        adj = base * 0.05
        adjustments.append(("신축 프리미엄", adj, "+5%"))
    elif building_age <= 10:
        adj = base * 0.03
        adjustments.append(("준신축 프리미엄", adj, "+3%"))

    # 3. 조망 (최상층)
    if floor_ratio >= 0.9:
        adj = base * 0.02
        adjustments.append(("조망 프리미엄", adj, "+2%"))

    # 총 조정
    total_adj = sum(a[1] for a in adjustments)
    final_price = base + total_adj

    # 출력
    print(f"\n{'='*50}")
    print(f"[참값] {name} 가격 분석")
    print(f"{'='*50}")
    print(f"면적: {area}m2 ({area/3.3:.0f}평) | 층수: {floor}/{total_floors}층 | 연식: {building_age}년")
    print(f"\n기준가: {base/1e8:.2f}억원")
    print("-" * 40)

    for label, adj, pct in adjustments:
        sign = "+" if adj >= 0 else ""
        print(f"  {label}: {sign}{adj/1e8:.3f}억 ({pct})")

    print("-" * 40)
    print(f"적정가: {final_price/1e8:.2f}억원")
    print(f"범위: {final_price*0.95/1e8:.2f}억 ~ {final_price*1.05/1e8:.2f}억원")
    print(f"{'='*50}\n")

    return final_price


def main():
    parser = argparse.ArgumentParser(description="빠른 아파트 가격 분석")
    parser.add_argument("--name", "-n", required=True, help="아파트명")
    parser.add_argument("--area", "-a", type=float, required=True, help="전용면적(m2)")
    parser.add_argument("--floor", "-f", type=int, required=True, help="층수")
    parser.add_argument("--total", "-t", type=int, default=15, help="총층수 (기본: 15)")
    parser.add_argument("--year", "-y", type=int, required=True, help="건축년도")
    parser.add_argument("--sigungu", "-s", default="안산시", help="시군구")
    parser.add_argument("--base", "-b", type=int, required=True, help="기준가(만원, 예: 52000)")

    args = parser.parse_args()

    quick_analyze(
        name=args.name,
        area=args.area,
        floor=args.floor,
        total_floors=args.total,
        built_year=args.year,
        sigungu=args.sigungu,
        base_price=args.base
    )


if __name__ == "__main__":
    # 예시 실행 (인자 없을 때)
    if len(sys.argv) == 1:
        # 안산고잔푸르지오5차 508동 1502호 예시
        quick_analyze(
            name="안산고잔푸르지오5차 508동 1502호",
            area=89,
            floor=15,
            total_floors=15,
            built_year=2003,
            sigungu="안산시",
            base_price=52000  # 5.2억
        )
    else:
        main()
