"""
게이미피케이션 API - 배지 시스템 + 리더보드

엔드포인트:
- GET  /api/gamification/badges - 전체 배지 목록 조회
- GET  /api/gamification/users/{user_id}/badges - 사용자 배지 및 진행도 조회
- POST /api/gamification/users/{user_id}/activity - 사용자 활동 기록
- GET  /api/gamification/users/{user_id}/points - 사용자 포인트 요약
- GET  /api/gamification/leaderboard/weekly - 주간 TOP 10 리더보드
- GET  /api/gamification/leaderboard/category/{category} - 카테고리별 랭킹
- GET  /api/gamification/users/{user_id}/rank - 사용자 현재 랭킹

캐싱:
- 리더보드 캐싱 (5분) - 랭킹 업데이트 빈도 고려
- 배지 정의 캐싱 (1시간) - 변경 빈도 낮음
"""
from typing import Optional, List, Dict
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import uuid
import random


router = APIRouter(prefix="/api/gamification", tags=["gamification"])


# ============================================================================
# 캐싱 유틸리티
# ============================================================================

class SimpleCache:
    """간단한 시간 기반 캐시"""

    def __init__(self, ttl_seconds: int = 3600):
        self.ttl_seconds = ttl_seconds
        self.cache = {}

    def get(self, key: str):
        """캐시에서 값 조회"""
        if key in self.cache:
            value, timestamp = self.cache[key]
            if datetime.now() - timestamp < timedelta(seconds=self.ttl_seconds):
                return value
            else:
                # 만료된 캐시 삭제
                del self.cache[key]
        return None

    def set(self, key: str, value):
        """캐시에 값 저장"""
        self.cache[key] = (value, datetime.now())

    def clear(self):
        """캐시 초기화"""
        self.cache.clear()


# 캐시 인스턴스
badge_cache = SimpleCache(ttl_seconds=3600)  # 배지 정의: 1시간
leaderboard_cache = SimpleCache(ttl_seconds=300)  # 리더보드: 5분


# ============================================================================
# Pydantic 응답 모델
# ============================================================================

class Badge(BaseModel):
    """배지 정의"""
    id: str
    name: str
    description: str
    icon: str
    category: str
    condition_type: str
    condition_value: int
    points_reward: int


class UserBadge(BaseModel):
    """사용자 획득 배지"""
    badge_id: str
    earned_at: Optional[str] = None
    progress_current: int
    progress_target: int


class UserBadgeResponse(BaseModel):
    """사용자 배지 응답"""
    user_id: str
    total_points: int
    level: int
    level_name: str
    badges: List[UserBadge]
    available_badges: List[Badge]


class LeaderboardEntry(BaseModel):
    """리더보드 항목"""
    rank: int
    user_id: str
    nickname: str
    total_points: int
    level: int
    level_name: str
    badge_count: int
    top_badge: Optional[str] = None


class UserPointSummary(BaseModel):
    """사용자 포인트 요약"""
    user_id: str
    nickname: str
    total_points: int
    level: int
    level_name: str
    points_this_week: int
    next_level_points: Optional[int] = None
    activity_breakdown: Dict[str, int]


class ActivityRecord(BaseModel):
    """활동 기록"""
    activity_type: str
    points_earned: int
    timestamp: str


class ActivityRequest(BaseModel):
    """활동 기록 요청"""
    activity_type: str


class ActivityResponse(BaseModel):
    """활동 기록 응답"""
    user_id: str
    activity_type: str
    points_earned: int
    total_points: int
    new_badges: List[Badge]
    timestamp: str


# ============================================================================
# 상수 정의
# ============================================================================

# 활동별 포인트
ACTIVITY_POINTS: Dict[str, int] = {
    "property_search": 5,
    "chamgab_analysis": 20,
    "comparison": 15,
    "investment_score": 20,
    "commercial_analysis": 25,
    "future_prediction": 30,
    "bookmark": 5,
    "report_generation": 40,
    "daily_login": 10,
}

# 레벨 시스템 (총 포인트 기준)
LEVEL_THRESHOLDS = [
    (0, 1, "새싹"),
    (100, 2, "탐색자"),
    (300, 3, "분석가"),
    (600, 4, "전문가"),
    (1000, 5, "마스터"),
]

# 카테고리별 관련 활동 매핑
CATEGORY_ACTIVITIES: Dict[str, List[str]] = {
    "analysis": ["chamgab_analysis", "future_prediction", "investment_score"],
    "commercial": ["commercial_analysis"],
    "investment": ["investment_score", "comparison", "report_generation"],
}


# ============================================================================
# 배지 정의 (10개)
# ============================================================================

BADGE_DEFINITIONS: List[Dict] = [
    {
        "id": "first_step",
        "name": "첫 발걸음",
        "description": "첫 매물 검색 완료",
        "icon": "footprints",
        "category": "beginner",
        "condition_type": "property_search",
        "condition_value": 1,
        "points_reward": 50,
    },
    {
        "id": "analyst",
        "name": "분석가",
        "description": "참값 분석 5회 이상 수행",
        "icon": "chart_bar",
        "category": "analysis",
        "condition_type": "chamgab_analysis",
        "condition_value": 5,
        "points_reward": 100,
    },
    {
        "id": "compare_king",
        "name": "비교왕",
        "description": "매물 비교 3회 이상",
        "icon": "balance_scale",
        "category": "comparison",
        "condition_type": "comparison",
        "condition_value": 3,
        "points_reward": 80,
    },
    {
        "id": "investment_master",
        "name": "투자 마스터",
        "description": "투자 점수 분석 10회 이상",
        "icon": "trending_up",
        "category": "investment",
        "condition_type": "investment_score",
        "condition_value": 10,
        "points_reward": 150,
    },
    {
        "id": "commercial_expert",
        "name": "상권 전문가",
        "description": "상권 분석 5회 이상",
        "icon": "store",
        "category": "commercial",
        "condition_type": "commercial_analysis",
        "condition_value": 5,
        "points_reward": 120,
    },
    {
        "id": "future_seer",
        "name": "미래를 보는 눈",
        "description": "미래 예측 분석 3회 이상",
        "icon": "crystal_ball",
        "category": "prediction",
        "condition_type": "future_prediction",
        "condition_value": 3,
        "points_reward": 100,
    },
    {
        "id": "bookmark_collector",
        "name": "북마크 수집가",
        "description": "관심 매물 10개 이상 등록",
        "icon": "bookmark",
        "category": "collection",
        "condition_type": "bookmark",
        "condition_value": 10,
        "points_reward": 80,
    },
    {
        "id": "report_creator",
        "name": "리포트 생성자",
        "description": "리포트 3개 이상 생성",
        "icon": "description",
        "category": "report",
        "condition_type": "report_generation",
        "condition_value": 3,
        "points_reward": 120,
    },
    {
        "id": "all_rounder",
        "name": "올라운더",
        "description": "모든 분석 유형 1회 이상 사용",
        "icon": "stars",
        "category": "master",
        "condition_type": "all_activities",
        "condition_value": 1,
        "points_reward": 200,
    },
    {
        "id": "explorer",
        "name": "열정적인 탐험가",
        "description": "7일 연속 접속",
        "icon": "explore",
        "category": "engagement",
        "condition_type": "daily_login",
        "condition_value": 7,
        "points_reward": 150,
    },
]


# ============================================================================
# 인메모리 데이터 저장소 (데모/프로토타입용)
# ============================================================================

# 사용자 활동 카운트: {user_id: {activity_type: count}}
USER_ACTIVITY_COUNTS: Dict[str, Dict[str, int]] = {}

# 사용자 총 포인트: {user_id: total_points}
USER_TOTAL_POINTS: Dict[str, int] = {}

# 사용자 주간 포인트: {user_id: weekly_points}
USER_WEEKLY_POINTS: Dict[str, int] = {}

# 사용자 획득 배지: {user_id: {badge_id: earned_at}}
USER_EARNED_BADGES: Dict[str, Dict[str, str]] = {}

# 사용자 활동 기록: {user_id: [ActivityRecord]}
USER_ACTIVITY_LOG: Dict[str, List[Dict]] = {}

# 사용자 닉네임: {user_id: nickname}
USER_NICKNAMES: Dict[str, str] = {}

# 사용자 연속 접속 일수: {user_id: consecutive_days}
USER_LOGIN_STREAK: Dict[str, int] = {}


# ============================================================================
# 목 데이터 초기화 (15명 이상의 샘플 사용자)
# ============================================================================

def _initialize_mock_data():
    """데모용 목 데이터 초기화"""
    mock_users = [
        {
            "user_id": "user-001",
            "nickname": "부동산킹",
            "activities": {
                "property_search": 25,
                "chamgab_analysis": 12,
                "comparison": 8,
                "investment_score": 15,
                "commercial_analysis": 7,
                "future_prediction": 5,
                "bookmark": 20,
                "report_generation": 6,
                "daily_login": 30,
            },
            "login_streak": 15,
        },
        {
            "user_id": "user-002",
            "nickname": "강남불패",
            "activities": {
                "property_search": 18,
                "chamgab_analysis": 10,
                "comparison": 6,
                "investment_score": 12,
                "commercial_analysis": 9,
                "future_prediction": 4,
                "bookmark": 15,
                "report_generation": 4,
                "daily_login": 25,
            },
            "login_streak": 10,
        },
        {
            "user_id": "user-003",
            "nickname": "투자고수",
            "activities": {
                "property_search": 30,
                "chamgab_analysis": 8,
                "comparison": 12,
                "investment_score": 20,
                "commercial_analysis": 3,
                "future_prediction": 6,
                "bookmark": 25,
                "report_generation": 8,
                "daily_login": 28,
            },
            "login_streak": 12,
        },
        {
            "user_id": "user-004",
            "nickname": "분석왕",
            "activities": {
                "property_search": 15,
                "chamgab_analysis": 20,
                "comparison": 5,
                "investment_score": 8,
                "commercial_analysis": 12,
                "future_prediction": 10,
                "bookmark": 8,
                "report_generation": 5,
                "daily_login": 22,
            },
            "login_streak": 8,
        },
        {
            "user_id": "user-005",
            "nickname": "상권전문가",
            "activities": {
                "property_search": 10,
                "chamgab_analysis": 6,
                "comparison": 4,
                "investment_score": 5,
                "commercial_analysis": 18,
                "future_prediction": 3,
                "bookmark": 12,
                "report_generation": 3,
                "daily_login": 20,
            },
            "login_streak": 7,
        },
        {
            "user_id": "user-006",
            "nickname": "미래예측자",
            "activities": {
                "property_search": 8,
                "chamgab_analysis": 7,
                "comparison": 3,
                "investment_score": 6,
                "commercial_analysis": 4,
                "future_prediction": 15,
                "bookmark": 5,
                "report_generation": 2,
                "daily_login": 18,
            },
            "login_streak": 5,
        },
        {
            "user_id": "user-007",
            "nickname": "초보투자자",
            "activities": {
                "property_search": 5,
                "chamgab_analysis": 2,
                "comparison": 1,
                "investment_score": 1,
                "commercial_analysis": 0,
                "future_prediction": 0,
                "bookmark": 3,
                "report_generation": 0,
                "daily_login": 5,
            },
            "login_streak": 2,
        },
        {
            "user_id": "user-008",
            "nickname": "리포트매니아",
            "activities": {
                "property_search": 12,
                "chamgab_analysis": 5,
                "comparison": 4,
                "investment_score": 7,
                "commercial_analysis": 3,
                "future_prediction": 2,
                "bookmark": 10,
                "report_generation": 12,
                "daily_login": 15,
            },
            "login_streak": 6,
        },
        {
            "user_id": "user-009",
            "nickname": "북마크왕",
            "activities": {
                "property_search": 20,
                "chamgab_analysis": 4,
                "comparison": 2,
                "investment_score": 3,
                "commercial_analysis": 2,
                "future_prediction": 1,
                "bookmark": 35,
                "report_generation": 1,
                "daily_login": 12,
            },
            "login_streak": 4,
        },
        {
            "user_id": "user-010",
            "nickname": "비교분석가",
            "activities": {
                "property_search": 14,
                "chamgab_analysis": 6,
                "comparison": 15,
                "investment_score": 9,
                "commercial_analysis": 5,
                "future_prediction": 4,
                "bookmark": 7,
                "report_generation": 3,
                "daily_login": 16,
            },
            "login_streak": 7,
        },
        {
            "user_id": "user-011",
            "nickname": "꾸준한탐색",
            "activities": {
                "property_search": 22,
                "chamgab_analysis": 3,
                "comparison": 2,
                "investment_score": 4,
                "commercial_analysis": 1,
                "future_prediction": 1,
                "bookmark": 18,
                "report_generation": 2,
                "daily_login": 35,
            },
            "login_streak": 20,
        },
        {
            "user_id": "user-012",
            "nickname": "데이터사냥꾼",
            "activities": {
                "property_search": 16,
                "chamgab_analysis": 9,
                "comparison": 7,
                "investment_score": 11,
                "commercial_analysis": 6,
                "future_prediction": 3,
                "bookmark": 9,
                "report_generation": 4,
                "daily_login": 19,
            },
            "login_streak": 9,
        },
        {
            "user_id": "user-013",
            "nickname": "아파트헌터",
            "activities": {
                "property_search": 35,
                "chamgab_analysis": 4,
                "comparison": 6,
                "investment_score": 5,
                "commercial_analysis": 2,
                "future_prediction": 2,
                "bookmark": 22,
                "report_generation": 1,
                "daily_login": 14,
            },
            "login_streak": 3,
        },
        {
            "user_id": "user-014",
            "nickname": "전략가",
            "activities": {
                "property_search": 11,
                "chamgab_analysis": 8,
                "comparison": 5,
                "investment_score": 14,
                "commercial_analysis": 8,
                "future_prediction": 7,
                "bookmark": 6,
                "report_generation": 5,
                "daily_login": 21,
            },
            "login_streak": 11,
        },
        {
            "user_id": "user-015",
            "nickname": "신입분석가",
            "activities": {
                "property_search": 3,
                "chamgab_analysis": 1,
                "comparison": 0,
                "investment_score": 0,
                "commercial_analysis": 0,
                "future_prediction": 0,
                "bookmark": 1,
                "report_generation": 0,
                "daily_login": 3,
            },
            "login_streak": 1,
        },
        {
            "user_id": "user-016",
            "nickname": "올라운더김씨",
            "activities": {
                "property_search": 13,
                "chamgab_analysis": 7,
                "comparison": 5,
                "investment_score": 8,
                "commercial_analysis": 6,
                "future_prediction": 4,
                "bookmark": 11,
                "report_generation": 4,
                "daily_login": 17,
            },
            "login_streak": 8,
        },
        {
            "user_id": "user-017",
            "nickname": "주말투자자",
            "activities": {
                "property_search": 9,
                "chamgab_analysis": 5,
                "comparison": 3,
                "investment_score": 6,
                "commercial_analysis": 4,
                "future_prediction": 2,
                "bookmark": 8,
                "report_generation": 2,
                "daily_login": 10,
            },
            "login_streak": 3,
        },
        {
            "user_id": "user-018",
            "nickname": "부린이",
            "activities": {
                "property_search": 2,
                "chamgab_analysis": 0,
                "comparison": 0,
                "investment_score": 0,
                "commercial_analysis": 0,
                "future_prediction": 0,
                "bookmark": 0,
                "report_generation": 0,
                "daily_login": 2,
            },
            "login_streak": 1,
        },
    ]

    for user in mock_users:
        uid = user["user_id"]
        USER_NICKNAMES[uid] = user["nickname"]
        USER_ACTIVITY_COUNTS[uid] = user["activities"].copy()
        USER_LOGIN_STREAK[uid] = user["login_streak"]

        # 총 포인트 계산
        total = 0
        for activity_type, count in user["activities"].items():
            points_per = ACTIVITY_POINTS.get(activity_type, 0)
            total += points_per * count
        USER_TOTAL_POINTS[uid] = total

        # 주간 포인트 (총 포인트의 15~35% 범위로 시뮬레이션)
        random.seed(hash(uid))
        weekly_ratio = random.uniform(0.15, 0.35)
        USER_WEEKLY_POINTS[uid] = int(total * weekly_ratio)

        # 배지 획득 판정
        USER_EARNED_BADGES[uid] = {}
        _check_and_award_badges(uid)

        # 활동 로그 (최근 항목 샘플)
        USER_ACTIVITY_LOG[uid] = []


# 서버 시작 시 목 데이터 초기화
_initialize_mock_data()


# ============================================================================
# 헬퍼 함수
# ============================================================================

def _get_level_info(total_points: int) -> tuple:
    """
    포인트 기반 레벨 정보 반환

    Args:
        total_points: 총 포인트

    Returns:
        (level, level_name, next_level_points) 튜플
    """
    level = 1
    level_name = "새싹"
    next_level_points = 100

    for threshold, lvl, name in LEVEL_THRESHOLDS:
        if total_points >= threshold:
            level = lvl
            level_name = name

    # 다음 레벨 포인트 계산
    for threshold, lvl, name in LEVEL_THRESHOLDS:
        if threshold > total_points:
            next_level_points = threshold
            break
    else:
        # 최고 레벨 도달
        next_level_points = None

    return level, level_name, next_level_points


def _check_badge_condition(user_id: str, badge_def: Dict) -> tuple:
    """
    배지 획득 조건 확인

    Args:
        user_id: 사용자 ID
        badge_def: 배지 정의

    Returns:
        (is_earned, current_progress, target) 튜플
    """
    activities = USER_ACTIVITY_COUNTS.get(user_id, {})
    condition_type = badge_def["condition_type"]
    condition_value = badge_def["condition_value"]

    if condition_type == "all_activities":
        # 올라운더: 모든 분석 유형을 1회 이상 사용
        required_activities = [
            "property_search",
            "chamgab_analysis",
            "comparison",
            "investment_score",
            "commercial_analysis",
            "future_prediction",
            "bookmark",
            "report_generation",
        ]
        completed = sum(
            1 for act in required_activities
            if activities.get(act, 0) >= condition_value
        )
        target = len(required_activities)
        return completed >= target, completed, target

    elif condition_type == "daily_login":
        # 연속 접속: 연속 로그인 일수로 판정
        streak = USER_LOGIN_STREAK.get(user_id, 0)
        return streak >= condition_value, streak, condition_value

    else:
        # 일반 활동 횟수 기반 배지
        current = activities.get(condition_type, 0)
        return current >= condition_value, current, condition_value


def _check_and_award_badges(user_id: str) -> List[Dict]:
    """
    배지 획득 조건 확인 후 새로 획득한 배지 반환

    Args:
        user_id: 사용자 ID

    Returns:
        새로 획득한 배지 목록
    """
    new_badges = []
    earned = USER_EARNED_BADGES.setdefault(user_id, {})

    for badge_def in BADGE_DEFINITIONS:
        badge_id = badge_def["id"]

        # 이미 획득한 배지는 건너뜀
        if badge_id in earned:
            continue

        is_earned, _, _ = _check_badge_condition(user_id, badge_def)

        if is_earned:
            earned_at = datetime.now().isoformat()
            earned[badge_id] = earned_at
            new_badges.append(badge_def)

            # 배지 보상 포인트 추가
            USER_TOTAL_POINTS[user_id] = (
                USER_TOTAL_POINTS.get(user_id, 0) + badge_def["points_reward"]
            )
            USER_WEEKLY_POINTS[user_id] = (
                USER_WEEKLY_POINTS.get(user_id, 0) + badge_def["points_reward"]
            )

    return new_badges


def _build_leaderboard(
    user_ids: Optional[List[str]] = None,
    limit: int = 10,
) -> List[LeaderboardEntry]:
    """
    리더보드 구성

    Args:
        user_ids: 대상 사용자 ID 목록 (None이면 전체)
        limit: 상위 N명

    Returns:
        LeaderboardEntry 리스트
    """
    if user_ids is None:
        user_ids = list(USER_TOTAL_POINTS.keys())

    # 포인트 기준 정렬
    sorted_users = sorted(
        user_ids,
        key=lambda uid: USER_TOTAL_POINTS.get(uid, 0),
        reverse=True,
    )

    entries = []
    for rank, uid in enumerate(sorted_users[:limit], start=1):
        total_points = USER_TOTAL_POINTS.get(uid, 0)
        level, level_name, _ = _get_level_info(total_points)

        earned_badges = USER_EARNED_BADGES.get(uid, {})
        badge_count = len(earned_badges)

        # 가장 최근 획득 배지를 대표 배지로 선정
        top_badge = None
        if earned_badges:
            latest_badge_id = max(earned_badges, key=earned_badges.get)
            badge_def = next(
                (b for b in BADGE_DEFINITIONS if b["id"] == latest_badge_id),
                None,
            )
            if badge_def:
                top_badge = badge_def["name"]

        entries.append(LeaderboardEntry(
            rank=rank,
            user_id=uid,
            nickname=USER_NICKNAMES.get(uid, f"사용자_{uid[-3:]}"),
            total_points=total_points,
            level=level,
            level_name=level_name,
            badge_count=badge_count,
            top_badge=top_badge,
        ))

    return entries


# ============================================================================
# API 엔드포인트 - 배지 시스템
# ============================================================================

@router.get("/badges", response_model=List[Badge])
async def get_all_badges():
    """
    전체 배지 목록 조회 (캐싱 적용)

    Returns:
        배지 정의 목록 (10개)
    """
    cache_key = "all_badges"
    cached = badge_cache.get(cache_key)
    if cached is not None:
        return cached

    badges = [Badge(**b) for b in BADGE_DEFINITIONS]

    badge_cache.set(cache_key, badges)
    return badges


@router.get("/users/{user_id}/badges", response_model=UserBadgeResponse)
async def get_user_badges(user_id: str):
    """
    사용자 배지 및 진행도 조회

    Args:
        user_id: 사용자 ID

    Returns:
        사용자의 획득 배지, 진행도, 미획득 배지 목록

    Raises:
        HTTPException: 사용자를 찾을 수 없는 경우
    """
    if user_id not in USER_TOTAL_POINTS and user_id not in USER_NICKNAMES:
        raise HTTPException(
            status_code=404,
            detail=f"사용자를 찾을 수 없습니다: {user_id}"
        )

    total_points = USER_TOTAL_POINTS.get(user_id, 0)
    level, level_name, _ = _get_level_info(total_points)
    earned = USER_EARNED_BADGES.get(user_id, {})

    # 사용자 배지 목록 (획득 + 미획득 진행도 포함)
    user_badges = []
    available_badges = []

    for badge_def in BADGE_DEFINITIONS:
        badge_id = badge_def["id"]
        is_earned, current, target = _check_badge_condition(user_id, badge_def)

        if badge_id in earned:
            # 획득한 배지
            user_badges.append(UserBadge(
                badge_id=badge_id,
                earned_at=earned[badge_id],
                progress_current=target,  # 달성 완료
                progress_target=target,
            ))
        else:
            # 미획득 배지 (진행도 표시)
            user_badges.append(UserBadge(
                badge_id=badge_id,
                earned_at=None,
                progress_current=current,
                progress_target=target,
            ))
            available_badges.append(Badge(**badge_def))

    return UserBadgeResponse(
        user_id=user_id,
        total_points=total_points,
        level=level,
        level_name=level_name,
        badges=user_badges,
        available_badges=available_badges,
    )


# ============================================================================
# API 엔드포인트 - 활동 기록
# ============================================================================

@router.post("/users/{user_id}/activity", response_model=ActivityResponse)
async def record_activity(user_id: str, request: ActivityRequest):
    """
    사용자 활동 기록

    활동 유형에 따라 포인트를 부여하고, 배지 획득 조건을 확인합니다.

    Args:
        user_id: 사용자 ID
        request: 활동 기록 요청 (activity_type)

    Returns:
        활동 기록 결과 (획득 포인트, 새 배지 등)

    Raises:
        HTTPException: 유효하지 않은 활동 유형인 경우
    """
    activity_type = request.activity_type

    # 활동 유형 검증
    if activity_type not in ACTIVITY_POINTS:
        raise HTTPException(
            status_code=400,
            detail=f"유효하지 않은 활동 유형입니다: {activity_type}. "
                   f"허용된 유형: {list(ACTIVITY_POINTS.keys())}"
        )

    # 신규 사용자 초기화
    if user_id not in USER_NICKNAMES:
        USER_NICKNAMES[user_id] = f"사용자_{user_id[-3:]}"

    # 활동 카운트 증가
    if user_id not in USER_ACTIVITY_COUNTS:
        USER_ACTIVITY_COUNTS[user_id] = {}
    USER_ACTIVITY_COUNTS[user_id][activity_type] = (
        USER_ACTIVITY_COUNTS[user_id].get(activity_type, 0) + 1
    )

    # 연속 로그인 처리
    if activity_type == "daily_login":
        USER_LOGIN_STREAK[user_id] = USER_LOGIN_STREAK.get(user_id, 0) + 1

    # 포인트 부여
    points_earned = ACTIVITY_POINTS[activity_type]
    USER_TOTAL_POINTS[user_id] = USER_TOTAL_POINTS.get(user_id, 0) + points_earned
    USER_WEEKLY_POINTS[user_id] = USER_WEEKLY_POINTS.get(user_id, 0) + points_earned

    # 활동 로그 기록
    timestamp = datetime.now().isoformat()
    if user_id not in USER_ACTIVITY_LOG:
        USER_ACTIVITY_LOG[user_id] = []
    USER_ACTIVITY_LOG[user_id].append({
        "activity_type": activity_type,
        "points_earned": points_earned,
        "timestamp": timestamp,
    })

    # 배지 획득 조건 확인
    new_badge_defs = _check_and_award_badges(user_id)
    new_badges = [Badge(**b) for b in new_badge_defs]

    # 리더보드 캐시 무효화 (포인트 변경됨)
    leaderboard_cache.clear()

    return ActivityResponse(
        user_id=user_id,
        activity_type=activity_type,
        points_earned=points_earned,
        total_points=USER_TOTAL_POINTS[user_id],
        new_badges=new_badges,
        timestamp=timestamp,
    )


# ============================================================================
# API 엔드포인트 - 포인트 요약
# ============================================================================

@router.get("/users/{user_id}/points", response_model=UserPointSummary)
async def get_user_points(user_id: str):
    """
    사용자 포인트 요약 조회

    Args:
        user_id: 사용자 ID

    Returns:
        총 포인트, 레벨, 주간 포인트, 활동별 포인트 분석

    Raises:
        HTTPException: 사용자를 찾을 수 없는 경우
    """
    if user_id not in USER_TOTAL_POINTS and user_id not in USER_NICKNAMES:
        raise HTTPException(
            status_code=404,
            detail=f"사용자를 찾을 수 없습니다: {user_id}"
        )

    total_points = USER_TOTAL_POINTS.get(user_id, 0)
    level, level_name, next_level_points = _get_level_info(total_points)

    # 활동별 포인트 분석
    activities = USER_ACTIVITY_COUNTS.get(user_id, {})
    activity_breakdown = {}
    for activity_type, count in activities.items():
        points_per = ACTIVITY_POINTS.get(activity_type, 0)
        activity_breakdown[activity_type] = points_per * count

    return UserPointSummary(
        user_id=user_id,
        nickname=USER_NICKNAMES.get(user_id, f"사용자_{user_id[-3:]}"),
        total_points=total_points,
        level=level,
        level_name=level_name,
        points_this_week=USER_WEEKLY_POINTS.get(user_id, 0),
        next_level_points=next_level_points,
        activity_breakdown=activity_breakdown,
    )


# ============================================================================
# API 엔드포인트 - 리더보드
# ============================================================================

@router.get("/leaderboard/weekly", response_model=List[LeaderboardEntry])
async def get_weekly_leaderboard():
    """
    주간 TOP 10 리더보드 (캐싱 적용)

    주간 포인트 기준 상위 10명의 랭킹을 반환합니다.

    Returns:
        주간 리더보드 (최대 10명)
    """
    cache_key = "leaderboard:weekly"
    cached = leaderboard_cache.get(cache_key)
    if cached is not None:
        return cached

    # 주간 포인트 기준 정렬
    all_user_ids = list(USER_WEEKLY_POINTS.keys())
    sorted_users = sorted(
        all_user_ids,
        key=lambda uid: USER_WEEKLY_POINTS.get(uid, 0),
        reverse=True,
    )

    entries = []
    for rank, uid in enumerate(sorted_users[:10], start=1):
        total_points = USER_TOTAL_POINTS.get(uid, 0)
        level, level_name, _ = _get_level_info(total_points)

        earned_badges = USER_EARNED_BADGES.get(uid, {})
        badge_count = len(earned_badges)

        top_badge = None
        if earned_badges:
            latest_badge_id = max(earned_badges, key=earned_badges.get)
            badge_def = next(
                (b for b in BADGE_DEFINITIONS if b["id"] == latest_badge_id),
                None,
            )
            if badge_def:
                top_badge = badge_def["name"]

        entries.append(LeaderboardEntry(
            rank=rank,
            user_id=uid,
            nickname=USER_NICKNAMES.get(uid, f"사용자_{uid[-3:]}"),
            total_points=USER_WEEKLY_POINTS.get(uid, 0),
            level=level,
            level_name=level_name,
            badge_count=badge_count,
            top_badge=top_badge,
        ))

    leaderboard_cache.set(cache_key, entries)
    return entries


@router.get("/leaderboard/category/{category}", response_model=List[LeaderboardEntry])
async def get_category_leaderboard(category: str):
    """
    카테고리별 리더보드 (캐싱 적용)

    특정 분석 카테고리의 활동 포인트 기준으로 랭킹을 산출합니다.

    Args:
        category: 카테고리 (analysis, commercial, investment)

    Returns:
        카테고리별 리더보드 (최대 10명)

    Raises:
        HTTPException: 유효하지 않은 카테고리인 경우
    """
    if category not in CATEGORY_ACTIVITIES:
        raise HTTPException(
            status_code=400,
            detail=f"유효하지 않은 카테고리입니다: {category}. "
                   f"허용된 카테고리: {list(CATEGORY_ACTIVITIES.keys())}"
        )

    cache_key = f"leaderboard:category:{category}"
    cached = leaderboard_cache.get(cache_key)
    if cached is not None:
        return cached

    related_activities = CATEGORY_ACTIVITIES[category]

    # 카테고리 포인트 계산
    category_points: Dict[str, int] = {}
    for uid, activities in USER_ACTIVITY_COUNTS.items():
        cat_total = 0
        for act_type in related_activities:
            count = activities.get(act_type, 0)
            points_per = ACTIVITY_POINTS.get(act_type, 0)
            cat_total += count * points_per
        category_points[uid] = cat_total

    # 포인트 기준 정렬
    sorted_users = sorted(
        category_points.keys(),
        key=lambda uid: category_points[uid],
        reverse=True,
    )

    entries = []
    for rank, uid in enumerate(sorted_users[:10], start=1):
        total_points = USER_TOTAL_POINTS.get(uid, 0)
        level, level_name, _ = _get_level_info(total_points)

        earned_badges = USER_EARNED_BADGES.get(uid, {})
        badge_count = len(earned_badges)

        top_badge = None
        if earned_badges:
            latest_badge_id = max(earned_badges, key=earned_badges.get)
            badge_def = next(
                (b for b in BADGE_DEFINITIONS if b["id"] == latest_badge_id),
                None,
            )
            if badge_def:
                top_badge = badge_def["name"]

        entries.append(LeaderboardEntry(
            rank=rank,
            user_id=uid,
            nickname=USER_NICKNAMES.get(uid, f"사용자_{uid[-3:]}"),
            total_points=category_points[uid],
            level=level,
            level_name=level_name,
            badge_count=badge_count,
            top_badge=top_badge,
        ))

    leaderboard_cache.set(cache_key, entries)
    return entries


@router.get("/users/{user_id}/rank", response_model=LeaderboardEntry)
async def get_user_rank(user_id: str):
    """
    사용자 현재 랭킹 조회

    전체 사용자 중 해당 사용자의 포인트 기반 순위를 반환합니다.

    Args:
        user_id: 사용자 ID

    Returns:
        사용자의 랭킹 정보

    Raises:
        HTTPException: 사용자를 찾을 수 없는 경우
    """
    if user_id not in USER_TOTAL_POINTS and user_id not in USER_NICKNAMES:
        raise HTTPException(
            status_code=404,
            detail=f"사용자를 찾을 수 없습니다: {user_id}"
        )

    # 전체 사용자 포인트 기준 정렬
    sorted_users = sorted(
        USER_TOTAL_POINTS.keys(),
        key=lambda uid: USER_TOTAL_POINTS.get(uid, 0),
        reverse=True,
    )

    # 사용자 순위 찾기
    rank = 1
    for uid in sorted_users:
        if uid == user_id:
            break
        rank += 1

    total_points = USER_TOTAL_POINTS.get(user_id, 0)
    level, level_name, _ = _get_level_info(total_points)

    earned_badges = USER_EARNED_BADGES.get(user_id, {})
    badge_count = len(earned_badges)

    top_badge = None
    if earned_badges:
        latest_badge_id = max(earned_badges, key=earned_badges.get)
        badge_def = next(
            (b for b in BADGE_DEFINITIONS if b["id"] == latest_badge_id),
            None,
        )
        if badge_def:
            top_badge = badge_def["name"]

    return LeaderboardEntry(
        rank=rank,
        user_id=user_id,
        nickname=USER_NICKNAMES.get(user_id, f"사용자_{user_id[-3:]}"),
        total_points=total_points,
        level=level,
        level_name=level_name,
        badge_count=badge_count,
        top_badge=top_badge,
    )
