"""
전국 유동인구/상권 데이터 수집 스크립트 (GitHub Actions용)

소상공인시장진흥공단 상가(상권)정보 API를 사용하여
전국의 상권 데이터를 수집합니다.
"""
import os
import sys
from pathlib import Path

# 상위 디렉토리 import를 위한 경로 추가
sys.path.insert(0, str(Path(__file__).parent))

from collect_footfall_data import FootfallDataCollector, SEOUL_GU_CODES


# 주요 도시 구/군 목록
MAJOR_CITIES = {
    "서울특별시": list(SEOUL_GU_CODES.keys()),
    "부산광역시": ["해운대구", "수영구", "부산진구", "동래구", "남구", "연제구"],
    "대구광역시": ["수성구", "중구", "달서구", "북구"],
    "인천광역시": ["연수구", "남동구", "부평구", "계양구"],
    "광주광역시": ["서구", "북구", "광산구"],
    "대전광역시": ["유성구", "서구", "중구"],
    "울산광역시": ["남구", "중구"],
    "경기도": ["성남시", "수원시", "용인시", "고양시", "부천시", "안양시", "화성시"],
}


def main():
    """전국 주요 도시 상권 데이터 수집"""
    print("=" * 60)
    print("전국 유동인구/상권 데이터 수집")
    print("=" * 60)

    api_key = os.environ.get("SBIZ_API_KEY") or os.environ.get("PUBLIC_DATA_API_KEY")

    if not api_key:
        print("경고: API 키가 없습니다. Mock 데이터로 진행합니다.")
        # Mock 모드로 진행

    try:
        collector = FootfallDataCollector(api_key=api_key)
    except ValueError as e:
        print(f"Collector 초기화 실패 (Mock 모드): {e}")
        # Mock 데이터 생성
        _generate_mock_footfall_data()
        return

    all_results = []

    for sido, sigungu_list in MAJOR_CITIES.items():
        print(f"\n[{sido}] 수집 시작...")

        for sigungu in sigungu_list:
            print(f"  - {sigungu}")

            try:
                result = collector.collect_region_data(
                    sido=sido,
                    sigungu=sigungu,
                    save_csv=False,
                    include_transit=False,  # 속도를 위해 생략
                    include_poi=False
                )

                if not result.empty:
                    all_results.append(result)

            except Exception as e:
                print(f"    오류: {e}")
                continue

    # 결과 저장
    if all_results:
        import pandas as pd
        from datetime import datetime

        combined = pd.concat(all_results, ignore_index=True)

        output_dir = Path(__file__).parent.parent / "data"
        output_dir.mkdir(exist_ok=True)

        filename = f"footfall_nationwide_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        filepath = output_dir / filename

        combined.to_csv(filepath, index=False, encoding="utf-8-sig")
        print(f"\n저장 완료: {filepath}")
        print(f"총 {len(combined)}개 지역 수집")
    else:
        print("\n수집된 데이터 없음")
        _generate_mock_footfall_data()


def _generate_mock_footfall_data():
    """Mock 유동인구 데이터 생성"""
    import pandas as pd
    from datetime import datetime
    import random

    print("\nMock 유동인구 데이터 생성 중...")

    data = []

    for sido, sigungu_list in MAJOR_CITIES.items():
        for sigungu in sigungu_list:
            data.append({
                "sido": sido,
                "sigungu": sigungu,
                "total_stores": random.randint(500, 5000),
                "category_count": random.randint(30, 80),
                "category_diversity": round(random.uniform(5, 15), 2),
                "franchise_ratio": round(random.uniform(5, 25), 2),
                "footfall_score": round(random.uniform(40, 90), 2),
                "avg_latitude": round(random.uniform(35.0, 38.0), 6),
                "avg_longitude": round(random.uniform(126.5, 129.5), 6),
                "collected_at": datetime.now().isoformat(),
            })

    df = pd.DataFrame(data)

    output_dir = Path(__file__).parent.parent / "data"
    output_dir.mkdir(exist_ok=True)

    filename = f"footfall_nationwide_mock_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    filepath = output_dir / filename

    df.to_csv(filepath, index=False, encoding="utf-8-sig")
    print(f"Mock 데이터 저장: {filepath}")
    print(f"총 {len(df)}개 지역 생성")


if __name__ == "__main__":
    main()
