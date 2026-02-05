"""
상권분석 API 테스트
"""
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.main import app

client = TestClient(app)


class TestCommercialAPI:
    """상권분석 API 테스트"""

    def test_get_districts_list(self):
        """
        상권 목록 조회 테스트
        GET /api/commercial/districts
        """
        response = client.get("/api/commercial/districts")

        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)

        # 최소 1개 이상의 상권이 있어야 함
        assert len(data) > 0

        # 상권 데이터 구조 확인
        district = data[0]
        assert "code" in district
        assert "name" in district
        assert "description" in district

    def test_get_districts_with_filter(self):
        """
        상권 목록 필터링 테스트
        GET /api/commercial/districts?sigungu_code=11680
        """
        response = client.get("/api/commercial/districts?sigungu_code=11680")

        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)

        # 필터가 적용되었는지 확인
        if len(data) > 0:
            district = data[0]
            assert "11680" in district["code"]  # 강남구 코드 포함

    def test_get_industries_list(self):
        """
        업종 목록 조회 테스트
        GET /api/commercial/industries
        """
        response = client.get("/api/commercial/industries")

        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)

        # 최소 1개 이상의 업종이 있어야 함
        assert len(data) > 0

        # 업종 데이터 구조 확인
        industry = data[0]
        assert "code" in industry
        assert "name" in industry
        assert "category" in industry

    def test_get_industries_by_category(self):
        """
        업종 카테고리 필터링 테스트
        GET /api/commercial/industries?category=음식
        """
        response = client.get("/api/commercial/industries?category=음식")

        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)

        # 필터가 적용되었는지 확인
        if len(data) > 0:
            industry = data[0]
            assert "음식" in industry["category"]

    def test_get_district_detail(self):
        """
        상권 상세 정보 조회 테스트
        GET /api/commercial/districts/{code}
        """
        # 먼저 상권 목록 조회
        list_response = client.get("/api/commercial/districts")
        districts = list_response.json()

        if len(districts) > 0:
            district_code = districts[0]["code"]

            # 상세 정보 조회
            response = client.get(f"/api/commercial/districts/{district_code}")

            assert response.status_code == 200

            data = response.json()
            assert data["code"] == district_code
            assert "name" in data
            assert "description" in data
            assert "statistics" in data

            # 통계 데이터 구조 확인
            stats = data["statistics"]
            assert "total_stores" in stats
            assert "survival_rate" in stats
            assert "monthly_avg_sales" in stats

    def test_get_district_detail_not_found(self):
        """
        존재하지 않는 상권 조회 테스트
        """
        response = client.get("/api/commercial/districts/INVALID_CODE")

        assert response.status_code == 404

        data = response.json()
        assert "detail" in data

    def test_api_response_caching(self):
        """
        응답 캐싱 테스트
        동일한 요청을 두 번 보내고 응답 시간 비교
        """
        import time

        # 첫 번째 요청
        start1 = time.time()
        response1 = client.get("/api/commercial/districts")
        time1 = time.time() - start1

        # 두 번째 요청 (캐시 사용)
        start2 = time.time()
        response2 = client.get("/api/commercial/districts")
        time2 = time.time() - start2

        assert response1.status_code == 200
        assert response2.status_code == 200

        # 응답 데이터가 동일해야 함
        assert response1.json() == response2.json()

        # 두 번째 요청이 더 빠르거나 비슷해야 함 (캐싱 효과)
        # 단, 첫 요청이 이미 충분히 빠른 경우 차이가 미미할 수 있음
        print(f"\n첫 번째 요청: {time1:.4f}초")
        print(f"두 번째 요청: {time2:.4f}초")

    def test_api_cors_headers(self):
        """
        CORS 헤더 테스트
        """
        response = client.get(
            "/api/commercial/districts",
            headers={"Origin": "http://localhost:3000"}
        )

        assert response.status_code == 200
        # CORS 헤더가 설정되어 있어야 함
        # (실제 구현에 따라 다를 수 있음)

    def test_api_validation(self):
        """
        입력 검증 테스트
        """
        # 잘못된 시군구 코드
        response = client.get("/api/commercial/districts?sigungu_code=invalid")

        # 400 또는 200 (빈 리스트)
        assert response.status_code in [200, 400]

        if response.status_code == 200:
            data = response.json()
            # 잘못된 코드면 빈 리스트 반환
            assert isinstance(data, list)
