"""
매물 추가 피처 서비스

재건축 연한, 학군 등급, 직전 거래가, 향/뷰/리모델링 등
매물 특성에 따른 추가 피처를 제공합니다.

사용법:
    from app.services.property_features_service import PropertyFeaturesService

    service = PropertyFeaturesService()
    features = service.get_all_features(property_data)
"""
import re
from typing import Dict, Optional, List
from datetime import datetime


class PropertyFeaturesService:
    """매물 추가 피처 서비스"""

    # 학군 등급 (지역별, 1~5등급, 5가 최고)
    SCHOOL_DISTRICT_GRADES = {
        # 서울 주요 학군
        "강남구": 5, "서초구": 5, "송파구": 4, "양천구": 4,
        "노원구": 4, "광진구": 3, "마포구": 3, "성동구": 3,
        "용산구": 3, "동작구": 3, "영등포구": 2, "강동구": 3,
        "강서구": 2, "은평구": 2, "중구": 2, "종로구": 2,
        "default": 2,
    }

    # 향(방향) 프리미엄 (남향 기준 1.0)
    DIRECTION_PREMIUM = {
        "남향": 1.00,
        "남동향": 0.98,
        "남서향": 0.97,
        "동향": 0.95,
        "서향": 0.93,
        "북향": 0.90,
        "북동향": 0.92,
        "북서향": 0.91,
    }

    # 뷰 프리미엄
    VIEW_PREMIUM = {
        "한강뷰": 1.15,
        "공원뷰": 1.05,
        "산뷰": 1.03,
        "시티뷰": 1.02,
        "일반": 1.00,
    }

    # 리모델링 키워드
    REMODEL_KEYWORDS = [
        "올수리", "풀옵션", "리모델링", "인테리어", "새집",
        "신규입주", "풀리모델링", "확장형", "올리모델링",
    ]

    def __init__(self):
        self.current_year = datetime.now().year

    # ==================== 재건축 관련 ====================

    def get_reconstruction_features(self, built_year: int) -> Dict[str, float]:
        """
        재건축 관련 피처 생성

        Args:
            built_year: 건축년도

        Returns:
            {
                "building_age": 26,
                "is_old_building": 0,  # 20년 이상
                "is_reconstruction_target": 0,  # 30년 이상
                "reconstruction_premium": 0.0,  # 재건축 프리미엄
            }
        """
        age = self.current_year - built_year

        # 20년 이상 구축
        is_old = 1 if age >= 20 else 0

        # 30년 이상 재건축 대상
        is_reconstruction = 1 if age >= 30 else 0

        # 재건축 프리미엄 (30~40년이 가장 높음)
        if 30 <= age <= 40:
            reconstruction_premium = 0.15  # 15% 프리미엄
        elif 25 <= age < 30:
            reconstruction_premium = 0.05  # 5% 기대감
        elif age > 40:
            reconstruction_premium = 0.10  # 노후로 약간 감소
        else:
            reconstruction_premium = 0.0

        return {
            "is_old_building": is_old,
            "is_reconstruction_target": is_reconstruction,
            "reconstruction_premium": reconstruction_premium,
        }

    # ==================== 학군 관련 ====================

    def get_school_district_grade(self, sigungu: str) -> int:
        """학군 등급 조회 (1~5)"""
        return self.SCHOOL_DISTRICT_GRADES.get(
            sigungu, self.SCHOOL_DISTRICT_GRADES["default"]
        )

    def get_school_features(self, sigungu: str) -> Dict[str, float]:
        """
        학군 관련 피처 생성

        Args:
            sigungu: 시군구

        Returns:
            {
                "school_district_grade": 5,
                "is_premium_school_district": 1,  # 4등급 이상
            }
        """
        grade = self.get_school_district_grade(sigungu)
        is_premium = 1 if grade >= 4 else 0

        return {
            "school_district_grade": grade,
            "is_premium_school_district": is_premium,
        }

    # ==================== 직전 거래 관련 ====================

    def get_price_comparison_features(
        self,
        current_price: int,
        previous_price: Optional[int] = None,
        complex_avg_price: Optional[int] = None,
        area_avg_price: Optional[int] = None,
    ) -> Dict[str, float]:
        """
        가격 비교 피처 생성

        Args:
            current_price: 현재 가격
            previous_price: 직전 거래가 (동일 호수)
            complex_avg_price: 단지 평균가 (동일 평형)
            area_avg_price: 지역 평균가 (동일 평형)

        Returns:
            {
                "price_vs_previous": 1.05,  # 직전 대비 비율
                "price_vs_complex_avg": 0.98,  # 단지 평균 대비
                "price_vs_area_avg": 1.10,  # 지역 평균 대비
            }
        """
        features = {}

        # 직전 거래가 대비
        if previous_price and previous_price > 0:
            features["price_vs_previous"] = round(current_price / previous_price, 3)
        else:
            features["price_vs_previous"] = 1.0

        # 단지 평균 대비
        if complex_avg_price and complex_avg_price > 0:
            features["price_vs_complex_avg"] = round(current_price / complex_avg_price, 3)
        else:
            features["price_vs_complex_avg"] = 1.0

        # 지역 평균 대비
        if area_avg_price and area_avg_price > 0:
            features["price_vs_area_avg"] = round(current_price / area_avg_price, 3)
        else:
            features["price_vs_area_avg"] = 1.0

        return features

    # ==================== 향/뷰/리모델링 (텍스트 분석) ====================

    def extract_direction(self, description: str) -> str:
        """매물 설명에서 향 추출"""
        if not description:
            return "남향"  # 기본값

        direction_patterns = [
            (r"남향", "남향"),
            (r"남동향", "남동향"),
            (r"남서향", "남서향"),
            (r"동향", "동향"),
            (r"서향", "서향"),
            (r"북향", "북향"),
            (r"북동향", "북동향"),
            (r"북서향", "북서향"),
        ]

        for pattern, direction in direction_patterns:
            if re.search(pattern, description):
                return direction

        return "남향"  # 기본값

    def extract_view(self, description: str) -> str:
        """매물 설명에서 뷰 추출"""
        if not description:
            return "일반"

        view_patterns = [
            (r"한강[뷰\s]|한강조망|리버뷰", "한강뷰"),
            (r"공원[뷰\s]|공원조망", "공원뷰"),
            (r"산[뷰\s]|산조망|마운틴", "산뷰"),
            (r"시티[뷰\s]|도심조망|야경", "시티뷰"),
        ]

        for pattern, view in view_patterns:
            if re.search(pattern, description, re.IGNORECASE):
                return view

        return "일반"

    def check_remodeling(self, description: str) -> bool:
        """매물 설명에서 리모델링 여부 확인"""
        if not description:
            return False

        for keyword in self.REMODEL_KEYWORDS:
            if keyword in description:
                return True

        return False

    def get_text_features(self, description: str) -> Dict[str, float]:
        """
        매물 설명 텍스트에서 피처 추출

        Args:
            description: 매물 설명

        Returns:
            {
                "direction": "남향",
                "direction_premium": 1.0,
                "view_type": "한강뷰",
                "view_premium": 1.15,
                "is_remodeled": 1,
                "remodel_premium": 0.05,
            }
        """
        direction = self.extract_direction(description)
        view = self.extract_view(description)
        is_remodeled = self.check_remodeling(description)

        return {
            "direction_premium": self.DIRECTION_PREMIUM.get(direction, 1.0),
            "view_premium": self.VIEW_PREMIUM.get(view, 1.0),
            "is_remodeled": 1 if is_remodeled else 0,
            "remodel_premium": 0.05 if is_remodeled else 0.0,
        }

    # ==================== 종합 피처 ====================

    def get_all_features(
        self,
        built_year: int,
        sigungu: str,
        description: str = "",
        current_price: int = 0,
        previous_price: int = None,
        complex_avg_price: int = None,
        area_avg_price: int = None,
    ) -> Dict[str, float]:
        """
        모든 추가 피처 생성

        Returns:
            {
                # 재건축 관련
                "is_old_building": 0,
                "is_reconstruction_target": 0,
                "reconstruction_premium": 0.0,
                # 학군 관련
                "school_district_grade": 5,
                "is_premium_school_district": 1,
                # 가격 비교
                "price_vs_previous": 1.05,
                "price_vs_complex_avg": 0.98,
                "price_vs_area_avg": 1.10,
                # 향/뷰/리모델링
                "direction_premium": 1.0,
                "view_premium": 1.15,
                "is_remodeled": 1,
                "remodel_premium": 0.05,
            }
        """
        features = {}

        # 재건축 피처
        features.update(self.get_reconstruction_features(built_year))

        # 학군 피처
        features.update(self.get_school_features(sigungu))

        # 가격 비교 피처
        features.update(self.get_price_comparison_features(
            current_price, previous_price, complex_avg_price, area_avg_price
        ))

        # 텍스트 분석 피처
        features.update(self.get_text_features(description))

        return features


if __name__ == "__main__":
    # 테스트
    service = PropertyFeaturesService()

    print("=== 재건축 피처 테스트 ===")
    recon = service.get_reconstruction_features(1995)
    for k, v in recon.items():
        print(f"  {k}: {v}")

    print("\n=== 학군 피처 테스트 ===")
    school = service.get_school_features("강남구")
    for k, v in school.items():
        print(f"  {k}: {v}")

    print("\n=== 텍스트 분석 테스트 ===")
    desc = "남향 한강뷰 올수리 풀옵션 아파트입니다"
    text_features = service.get_text_features(desc)
    for k, v in text_features.items():
        print(f"  {k}: {v}")
