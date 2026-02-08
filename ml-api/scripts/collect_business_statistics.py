#!/usr/bin/env python3
"""
Real store data collection + calibrated statistics generation script.

Phase 1: Collect real store counts from SBIZ API (storeListInDong)
Phase 2: Map API industry codes to our 46 seed industry codes
Phase 3: Generate calibrated statistics anchored to real store counts
Phase 4: Save to 5 Supabase tables (upsert)

API: https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong
  - divId=signguCd&key={5-digit-sigungu-code}
  - indsLclsCd={large-category-code}
  - numOfRows=1 (just to get totalCount) or 1000 (for medium-code breakdown)

Target tables:
  1. business_statistics (monthly)
  2. sales_statistics (monthly)
  3. store_statistics (monthly)
  4. foot_traffic_statistics (quarterly)
  5. district_characteristics (quarterly)
"""
import os
import sys
import json
import asyncio
import hashlib
import logging
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

from dotenv import load_dotenv
load_dotenv()

import httpx
import numpy as np
from supabase import create_client, Client

np.random.seed(42)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────
# Region codes (130 regions) with activity levels 1-5
# ──────────────────────────────────────────────────────
MAJOR_REGIONS = {
    '서울': [
        '11110',  # 종로구
        '11140',  # 중구
        '11170',  # 용산구
        '11200',  # 성동구
        '11215',  # 광진구
        '11230',  # 동대문구
        '11260',  # 중랑구
        '11290',  # 성북구
        '11305',  # 강북구
        '11320',  # 도봉구
        '11350',  # 노원구
        '11380',  # 은평구
        '11410',  # 서대문구
        '11440',  # 마포구
        '11470',  # 양천구
        '11500',  # 강서구
        '11530',  # 구로구
        '11545',  # 금천구
        '11560',  # 영등포구
        '11590',  # 동작구
        '11620',  # 관악구
        '11650',  # 서초구
        '11680',  # 강남구
        '11710',  # 송파구
        '11740',  # 강동구
    ],
    '경기': [
        '41111',  # 수원시 장안구
        '41113',  # 수원시 권선구
        '41115',  # 수원시 팔달구
        '41117',  # 수원시 영통구
        '41131',  # 성남시 수정구
        '41133',  # 성남시 중원구
        '41135',  # 성남시 분당구
        '41150',  # 의정부시
        '41170',  # 안양시 만안구
        '41173',  # 안양시 동안구
        '41195',  # 부천시
        '41210',  # 광명시
        '41220',  # 평택시
        '41281',  # 고양시 덕양구
        '41285',  # 고양시 일산동구
        '41287',  # 고양시 일산서구
        '41360',  # 안산시 상록구
        '41370',  # 안산시 단원구
        '41390',  # 시흥시
        '41410',  # 군포시
        '41430',  # 의왕시
        '41461',  # 용인시 처인구
        '41463',  # 용인시 기흥구
        '41465',  # 용인시 수지구
        '41480',  # 파주시
        '41500',  # 이천시
        '41550',  # 김포시
        '41570',  # 화성시
        '41590',  # 광주시
    ],
    '인천': [
        '28110',  # 중구
        '28140',  # 동구
        '28177',  # 미추홀구
        '28185',  # 연수구
        '28200',  # 남동구
        '28237',  # 부평구
        '28245',  # 계양구
        '28260',  # 서구
    ],
    '부산': [
        '26110',  # 중구
        '26140',  # 서구
        '26170',  # 동구
        '26200',  # 영도구
        '26230',  # 부산진구
        '26260',  # 동래구
        '26290',  # 남구
        '26320',  # 북구
        '26350',  # 해운대구
        '26380',  # 사하구
        '26410',  # 금정구
        '26440',  # 강서구
        '26470',  # 연제구
        '26500',  # 수영구
        '26530',  # 사상구
    ],
    '대구': [
        '27110',  # 중구
        '27140',  # 동구
        '27170',  # 서구
        '27200',  # 남구
        '27230',  # 북구
        '27260',  # 수성구
        '27290',  # 달서구
    ],
    '광주': [
        '29110',  # 동구
        '29140',  # 서구
        '29155',  # 남구
        '29170',  # 북구
        '29200',  # 광산구
    ],
    '대전': [
        '30110',  # 동구
        '30140',  # 중구
        '30170',  # 서구
        '30200',  # 유성구
        '30230',  # 대덕구
    ],
    '울산': [
        '31110',  # 중구
        '31140',  # 남구
        '31170',  # 동구
        '31200',  # 북구
    ],
    '세종': [
        '36110',  # 세종시
    ],
    '강원': [
        '42110',  # 춘천시
        '42130',  # 원주시
        '42150',  # 강릉시
    ],
    '충북': [
        '43110',  # 청주시 상당구
        '43111',  # 청주시 서원구
        '43112',  # 청주시 흥덕구
        '43113',  # 청주시 청원구
        '43150',  # 충주시
    ],
    '충남': [
        '44131',  # 천안시 동남구
        '44133',  # 천안시 서북구
        '44150',  # 공주시
        '44180',  # 아산시
    ],
    '전북': [
        '45111',  # 전주시 완산구
        '45113',  # 전주시 덕진구
    ],
    '전남': [
        '46110',  # 목포시
        '46130',  # 여수시
        '46150',  # 순천시
    ],
    '경북': [
        '47110',  # 포항시 남구
        '47130',  # 경주시
        '47170',  # 구미시
    ],
    '경남': [
        '48170',  # 진주시
        '48220',  # 김해시
        '48240',  # 밀양시
        '48250',  # 거제시
        '48121',  # 창원시 의창구
        '48123',  # 창원시 성산구
        '48125',  # 창원시 마산합포구
        '48127',  # 창원시 마산회원구
        '48129',  # 창원시 진해구
    ],
    '제주': [
        '50110',  # 제주시
        '50130',  # 서귀포시
    ],
}

# ──────────────────────────────────────────────────────
# ALL_INDUSTRIES: 46 seed industry codes
# ──────────────────────────────────────────────────────
ALL_INDUSTRIES = {
    # 음식
    'Q01': '한식음식점',
    'Q02': '중식음식점',
    'Q03': '일식음식점',
    'Q04': '서양식음식점',
    'Q05': '기타외국식음식점',
    'Q06': '치킨전문점',
    'Q07': '패스트푸드점',
    'Q08': '분식전문점',
    'Q09': '호프/간이주점',
    'Q10': '제과점',
    'Q11': '피자/햄버거/샌드위치',
    'Q12': '커피전문점',
    'Q13': '카페',
    'Q14': '아이스크림/빙수',
    'Q15': '도시락/밥집',
    # 소매
    'D01': '슈퍼마켓',
    'D02': '편의점',
    'D03': '농수산물',
    'D04': '정육점',
    'D05': '반찬가게',
    'R01': '의류/패션',
    'R02': '신발/가방',
    'R03': '화장품',
    'R04': '꽃집/화원',
    'R05': '문구/팬시',
    'N01': '약국',
    'N02': '안경/콘택트렌즈',
    'N03': '건강식품',
    # 서비스
    'I01': '미용실',
    'I02': '네일아트/피부관리',
    'I03': '세탁소',
    'I04': '사진스튜디오',
    'I05': '인테리어/건축',
    'I06': '부동산중개',
    'S01': '학원/교습소',
    'S02': '헬스/피트니스',
    'S03': '노래방/오락',
    'S04': '세차/자동차정비',
    'S05': '반려동물/펫샵',
    'S06': '코인세탁/빨래방',
    # 생활
    'L01': '병원/의원',
    'L02': '치과',
    'L03': '한의원',
    'L04': '어린이집/유치원',
    'L05': '장례식장',
    'L06': '주유소',
}

# ──────────────────────────────────────────────────────
# Activity levels per sigungu (from seed_commercial_data.py)
# ──────────────────────────────────────────────────────
REGIONS: Dict[str, int] = {
    # 서울 (25구)
    '11110': 5, '11140': 5, '11170': 4, '11200': 4, '11215': 4,
    '11230': 3, '11260': 3, '11290': 3, '11305': 2, '11320': 2,
    '11350': 3, '11380': 3, '11410': 3, '11440': 5, '11470': 3,
    '11500': 3, '11530': 3, '11545': 3, '11560': 4, '11590': 3,
    '11620': 3, '11650': 5, '11680': 5, '11710': 4, '11740': 3,
    # 경기 (29)
    '41111': 3, '41113': 3, '41115': 4, '41117': 4,
    '41131': 3, '41133': 3, '41135': 5,
    '41150': 3,
    '41170': 3, '41173': 4,
    '41195': 3, '41210': 3, '41220': 3,
    '41281': 3, '41285': 4, '41287': 4,
    '41360': 3, '41370': 3,
    '41390': 3, '41410': 3, '41430': 3,
    '41461': 3, '41463': 4, '41465': 4,
    '41480': 3, '41500': 2, '41550': 3, '41570': 3, '41590': 2,
    # 인천 (8)
    '28110': 3, '28140': 2, '28177': 3, '28185': 4,
    '28200': 3, '28237': 3, '28245': 3, '28260': 3,
    # 부산 (15)
    '26110': 4, '26140': 2, '26170': 3, '26200': 2, '26230': 4,
    '26260': 3, '26290': 3, '26320': 3, '26350': 5, '26380': 3,
    '26410': 3, '26440': 2, '26470': 3, '26500': 4, '26530': 3,
    # 대구 (7)
    '27110': 4, '27140': 3, '27170': 2, '27200': 3,
    '27230': 3, '27260': 4, '27290': 3,
    # 광주 (5)
    '29110': 3, '29140': 3, '29155': 3, '29170': 3, '29200': 3,
    # 대전 (5)
    '30110': 3, '30140': 3, '30170': 3, '30200': 4, '30230': 2,
    # 울산 (4)
    '31110': 3, '31140': 3, '31170': 2, '31200': 3,
    # 세종
    '36110': 3,
    # 강원
    '42110': 3, '42130': 3, '42150': 3,
    # 충북
    '43110': 3, '43111': 3, '43112': 3, '43113': 2, '43150': 2,
    # 충남
    '44131': 3, '44133': 3, '44150': 2, '44180': 3,
    # 전북
    '45111': 3, '45113': 3,
    # 전남
    '46110': 2, '46130': 3, '46150': 3,
    # 경북
    '47110': 3, '47130': 3, '47170': 3,
    # 경남
    '48121': 3, '48123': 3, '48125': 2, '48127': 2, '48129': 2,
    '48170': 3, '48220': 3, '48240': 2, '48250': 2,
    # 제주
    '50110': 4, '50130': 3,
}

# ──────────────────────────────────────────────────────
# API Industry large codes to query
# ──────────────────────────────────────────────────────
API_LARGE_CODES = ['I2', 'G2', 'Q1', 'S2', 'P1', 'N1', 'L1']

# Top 3 large codes that get medium-code breakdown
API_LARGE_CODES_DETAILED = ['I2', 'G2', 'Q1']

# ──────────────────────────────────────────────────────
# API medium code -> seed industry code mapping
# When one API code maps to multiple seed codes,
# they are split proportionally using the weights (equal by default).
# ──────────────────────────────────────────────────────
API_MEDIUM_TO_SEED: Dict[str, List[str]] = {
    # I2 (음식)
    'I201': ['Q01'],                          # 한식
    'I202': ['Q02'],                          # 중식
    'I203': ['Q03'],                          # 일식
    'I204': ['Q04'],                          # 서양식
    'I205': ['Q07'],                          # 패스트푸드
    'I206': ['Q05'],                          # 기타외국식
    'I210': ['Q06', 'Q08', 'Q09', 'Q11', 'Q15'],  # 기타음식(치킨,분식,주점,피자,도시락)
    'I211': ['Q10', 'Q14'],                   # 제과/빙수
    'I212': ['Q12', 'Q13'],                   # 커피/카페
    # G2 (소매)
    'G204': ['D01', 'D02'],                   # 가전소매 -> 슈퍼/편의점
    'G205': ['D03', 'D04', 'D05'],            # 농수산 -> 농수산물/정육/반찬
    'G209': ['R01', 'R02'],                   # 의류패션
    'G213': ['N03', 'R05'],                   # 건강식품/문구
    'G215': ['R03', 'N01'],                   # 화장품/약국
    'G217': ['N02'],                          # 안경
    'G218': ['R04'],                          # 꽃집
    # Q1 (의료/복지)
    'Q102': ['L01', 'L02', 'L03'],            # 의원 -> 병원/치과/한의원
    # S2 (수리/개인서비스)
    'S207': ['I01', 'I02'],                   # 미용
    'S209': ['I03'],                          # 세탁
    'S203': ['S04'],                          # 자동차수리
    'S206': ['S05', 'S06'],                   # 펫/코인세탁
    # N1 (시설관리/사업지원) - maps partially
    'N104': ['S01'],                          # 학원
    'N101': ['S02'],                          # 체육시설
    # P1 (교육) -> partial overlap
    'P106': ['S03'],                          # 기타교육 -> 오락
    # L1 (부동산)
    'L102': ['I06'],                          # 부동산중개
}

# Seed codes that don't have a direct API medium code mapping
# They get estimated from the large-code total minus mapped medium codes
UNMAPPED_SEED_CODES = {'I04', 'I05', 'L04', 'L05', 'L06'}

# ──────────────────────────────────────────────────────
# Industry profiles (from seed_commercial_data.py) for calibration
# ──────────────────────────────────────────────────────
INDUSTRY_PROFILES: Dict[str, Dict[str, Any]] = {
    'Q01': {'name': '한식음식점', 'cat': '음식', 'base_stores': 450, 'survival': 62, 'monthly_sales': 3200, 'growth': -1.5, 'franchise_pct': 8},
    'Q02': {'name': '중식음식점', 'cat': '음식', 'base_stores': 85, 'survival': 58, 'monthly_sales': 3500, 'growth': -2.0, 'franchise_pct': 5},
    'Q03': {'name': '일식음식점', 'cat': '음식', 'base_stores': 55, 'survival': 60, 'monthly_sales': 4200, 'growth': 2.5, 'franchise_pct': 12},
    'Q04': {'name': '서양식음식점', 'cat': '음식', 'base_stores': 70, 'survival': 55, 'monthly_sales': 3800, 'growth': 1.0, 'franchise_pct': 15},
    'Q05': {'name': '기타외국식음식점', 'cat': '음식', 'base_stores': 40, 'survival': 50, 'monthly_sales': 3000, 'growth': 5.0, 'franchise_pct': 10},
    'Q06': {'name': '치킨전문점', 'cat': '음식', 'base_stores': 180, 'survival': 55, 'monthly_sales': 2800, 'growth': -3.0, 'franchise_pct': 75},
    'Q07': {'name': '패스트푸드점', 'cat': '음식', 'base_stores': 35, 'survival': 70, 'monthly_sales': 5500, 'growth': 2.0, 'franchise_pct': 90},
    'Q08': {'name': '분식전문점', 'cat': '음식', 'base_stores': 120, 'survival': 58, 'monthly_sales': 2200, 'growth': -1.0, 'franchise_pct': 15},
    'Q09': {'name': '호프/간이주점', 'cat': '음식', 'base_stores': 95, 'survival': 45, 'monthly_sales': 2500, 'growth': -5.0, 'franchise_pct': 20},
    'Q10': {'name': '제과점', 'cat': '음식', 'base_stores': 60, 'survival': 65, 'monthly_sales': 3500, 'growth': 1.0, 'franchise_pct': 60},
    'Q11': {'name': '피자/햄버거/샌드위치', 'cat': '음식', 'base_stores': 50, 'survival': 60, 'monthly_sales': 3000, 'growth': 0.5, 'franchise_pct': 70},
    'Q12': {'name': '커피전문점', 'cat': '음식', 'base_stores': 250, 'survival': 52, 'monthly_sales': 2800, 'growth': 3.0, 'franchise_pct': 45},
    'Q13': {'name': '카페', 'cat': '음식', 'base_stores': 150, 'survival': 48, 'monthly_sales': 2000, 'growth': 4.0, 'franchise_pct': 20},
    'Q14': {'name': '아이스크림/빙수', 'cat': '음식', 'base_stores': 25, 'survival': 45, 'monthly_sales': 1800, 'growth': 2.0, 'franchise_pct': 65},
    'Q15': {'name': '도시락/밥집', 'cat': '음식', 'base_stores': 35, 'survival': 50, 'monthly_sales': 1500, 'growth': 3.0, 'franchise_pct': 30},
    'D01': {'name': '슈퍼마켓', 'cat': '소매', 'base_stores': 80, 'survival': 72, 'monthly_sales': 4500, 'growth': -2.0, 'franchise_pct': 10},
    'D02': {'name': '편의점', 'cat': '소매', 'base_stores': 300, 'survival': 75, 'monthly_sales': 5000, 'growth': 1.5, 'franchise_pct': 95},
    'D03': {'name': '농수산물', 'cat': '소매', 'base_stores': 45, 'survival': 68, 'monthly_sales': 3800, 'growth': -1.0, 'franchise_pct': 5},
    'D04': {'name': '정육점', 'cat': '소매', 'base_stores': 30, 'survival': 70, 'monthly_sales': 4000, 'growth': 0.5, 'franchise_pct': 8},
    'D05': {'name': '반찬가게', 'cat': '소매', 'base_stores': 55, 'survival': 60, 'monthly_sales': 2500, 'growth': 2.0, 'franchise_pct': 15},
    'R01': {'name': '의류/패션', 'cat': '소매', 'base_stores': 120, 'survival': 50, 'monthly_sales': 3500, 'growth': -4.0, 'franchise_pct': 25},
    'R02': {'name': '신발/가방', 'cat': '소매', 'base_stores': 40, 'survival': 52, 'monthly_sales': 3000, 'growth': -3.0, 'franchise_pct': 30},
    'R03': {'name': '화장품', 'cat': '소매', 'base_stores': 60, 'survival': 55, 'monthly_sales': 4000, 'growth': -2.0, 'franchise_pct': 70},
    'R04': {'name': '꽃집/화원', 'cat': '소매', 'base_stores': 20, 'survival': 65, 'monthly_sales': 2000, 'growth': -1.0, 'franchise_pct': 5},
    'R05': {'name': '문구/팬시', 'cat': '소매', 'base_stores': 25, 'survival': 60, 'monthly_sales': 1800, 'growth': -5.0, 'franchise_pct': 15},
    'N01': {'name': '약국', 'cat': '소매', 'base_stores': 55, 'survival': 85, 'monthly_sales': 6000, 'growth': 2.0, 'franchise_pct': 5},
    'N02': {'name': '안경/콘택트렌즈', 'cat': '소매', 'base_stores': 30, 'survival': 75, 'monthly_sales': 3500, 'growth': -1.0, 'franchise_pct': 35},
    'N03': {'name': '건강식품', 'cat': '소매', 'base_stores': 20, 'survival': 55, 'monthly_sales': 2500, 'growth': 5.0, 'franchise_pct': 20},
    'I01': {'name': '미용실', 'cat': '서비스', 'base_stores': 200, 'survival': 65, 'monthly_sales': 2500, 'growth': 0.5, 'franchise_pct': 15},
    'I02': {'name': '네일아트/피부관리', 'cat': '서비스', 'base_stores': 80, 'survival': 50, 'monthly_sales': 2000, 'growth': 3.0, 'franchise_pct': 25},
    'I03': {'name': '세탁소', 'cat': '서비스', 'base_stores': 60, 'survival': 78, 'monthly_sales': 1500, 'growth': -2.0, 'franchise_pct': 20},
    'I04': {'name': '사진스튜디오', 'cat': '서비스', 'base_stores': 15, 'survival': 60, 'monthly_sales': 2500, 'growth': -3.0, 'franchise_pct': 10},
    'I05': {'name': '인테리어/건축', 'cat': '서비스', 'base_stores': 40, 'survival': 55, 'monthly_sales': 5000, 'growth': -1.0, 'franchise_pct': 10},
    'I06': {'name': '부동산중개', 'cat': '서비스', 'base_stores': 100, 'survival': 70, 'monthly_sales': 3000, 'growth': -2.0, 'franchise_pct': 15},
    'S01': {'name': '학원/교습소', 'cat': '서비스', 'base_stores': 150, 'survival': 60, 'monthly_sales': 3500, 'growth': 0.0, 'franchise_pct': 20},
    'S02': {'name': '헬스/피트니스', 'cat': '서비스', 'base_stores': 40, 'survival': 50, 'monthly_sales': 3000, 'growth': 2.0, 'franchise_pct': 35},
    'S03': {'name': '노래방/오락', 'cat': '서비스', 'base_stores': 30, 'survival': 45, 'monthly_sales': 2000, 'growth': -8.0, 'franchise_pct': 40},
    'S04': {'name': '세차/자동차정비', 'cat': '서비스', 'base_stores': 35, 'survival': 65, 'monthly_sales': 3500, 'growth': 1.0, 'franchise_pct': 25},
    'S05': {'name': '반려동물/펫샵', 'cat': '서비스', 'base_stores': 25, 'survival': 55, 'monthly_sales': 2500, 'growth': 8.0, 'franchise_pct': 30},
    'S06': {'name': '코인세탁/빨래방', 'cat': '서비스', 'base_stores': 20, 'survival': 70, 'monthly_sales': 800, 'growth': 10.0, 'franchise_pct': 60},
    'L01': {'name': '병원/의원', 'cat': '생활', 'base_stores': 120, 'survival': 82, 'monthly_sales': 8000, 'growth': 2.0, 'franchise_pct': 5},
    'L02': {'name': '치과', 'cat': '생활', 'base_stores': 50, 'survival': 80, 'monthly_sales': 7000, 'growth': 1.5, 'franchise_pct': 10},
    'L03': {'name': '한의원', 'cat': '생활', 'base_stores': 35, 'survival': 78, 'monthly_sales': 4500, 'growth': -1.0, 'franchise_pct': 5},
    'L04': {'name': '어린이집/유치원', 'cat': '생활', 'base_stores': 40, 'survival': 75, 'monthly_sales': 3000, 'growth': -2.0, 'franchise_pct': 10},
    'L05': {'name': '장례식장', 'cat': '생활', 'base_stores': 5, 'survival': 90, 'monthly_sales': 15000, 'growth': 0.5, 'franchise_pct': 20},
    'L06': {'name': '주유소', 'cat': '생활', 'base_stores': 15, 'survival': 85, 'monthly_sales': 25000, 'growth': -1.0, 'franchise_pct': 40},
}

# ──────────────────────────────────────────────────────
# Seasonal profiles (month index 0=Jan, 11=Dec)
# ──────────────────────────────────────────────────────
SEASONAL_PROFILES: Dict[str, List[float]] = {
    '음식': [0.92, 0.88, 0.98, 1.02, 1.05, 1.02, 0.95, 0.90, 1.00, 1.05, 1.08, 1.15],
    '소매': [1.05, 0.82, 0.92, 0.98, 1.02, 0.95, 0.88, 0.85, 0.98, 1.08, 1.15, 1.25],
    '서비스': [0.95, 0.90, 1.00, 1.02, 1.05, 1.00, 0.95, 0.90, 1.00, 1.05, 1.08, 1.05],
    '생활': [1.00, 0.95, 1.00, 1.00, 1.02, 1.00, 0.98, 0.95, 1.00, 1.02, 1.05, 1.02],
}

# Regional trends (annual growth rate by sido code)
REGIONAL_TRENDS: Dict[str, float] = {
    '11': 1.02, '41': 1.03, '28': 1.01, '26': 0.99, '27': 0.98,
    '29': 1.00, '30': 1.01, '31': 0.99, '36': 1.05, '42': 0.98,
    '43': 0.99, '44': 1.00, '45': 0.98, '46': 0.97, '47': 0.98,
    '48': 0.99, '50': 1.04,
}

# Cache file path
CACHE_FILE = Path(__file__).parent / 'real_store_counts.json'


# ======================================================
# Phase 1: API Collection
# ======================================================

async def fetch_store_total_count(
    client: httpx.AsyncClient,
    api_key: str,
    sigungu_code: str,
    large_code: str,
) -> int:
    """Call storeListInDong with numOfRows=1 to get totalCount only."""
    url = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong"
    params = {
        'serviceKey': api_key,
        'divId': 'signguCd',
        'key': sigungu_code,
        'indsLclsCd': large_code,
        'pageNo': '1',
        'numOfRows': '1',
        'type': 'json',
    }
    try:
        await asyncio.sleep(0.5)
        resp = await client.get(url, params=params, timeout=30.0)
        resp.raise_for_status()
        data = resp.json()
        if 'body' in data and 'totalCount' in data['body']:
            return int(data['body']['totalCount'])
        return 0
    except Exception as e:
        logger.warning(f"  API error {sigungu_code}/{large_code}: {e}")
        return -1  # signal error for retry


async def fetch_medium_code_breakdown(
    client: httpx.AsyncClient,
    api_key: str,
    sigungu_code: str,
    large_code: str,
) -> Dict[str, int]:
    """Fetch up to 1000 items and count by medium code."""
    url = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong"
    medium_counts: Dict[str, int] = {}
    page = 1
    max_pages = 50  # safety: max 50*1000 = 50K items

    while page <= max_pages:
        params = {
            'serviceKey': api_key,
            'divId': 'signguCd',
            'key': sigungu_code,
            'indsLclsCd': large_code,
            'pageNo': str(page),
            'numOfRows': '1000',
            'type': 'json',
        }
        try:
            await asyncio.sleep(0.5)
            resp = await client.get(url, params=params, timeout=30.0)
            resp.raise_for_status()
            data = resp.json()

            if 'body' not in data or 'items' not in data['body']:
                break

            items = data['body']['items']
            if not items:
                break

            for item in items:
                mcls = item.get('indsMclsCd', 'UNKNOWN')
                medium_counts[mcls] = medium_counts.get(mcls, 0) + 1

            total_count = int(data['body'].get('totalCount', 0))
            fetched_so_far = page * 1000
            if fetched_so_far >= total_count:
                break

            page += 1
        except Exception as e:
            logger.warning(f"  API error breakdown {sigungu_code}/{large_code} p{page}: {e}")
            break

    return medium_counts


async def collect_real_store_data(
    api_key: str,
    target_codes: Optional[List[str]] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Phase 1: Collect real store counts from SBIZ API.

    Returns:
        {sigungu_code: {
            'large_counts': {large_code: total_count},
            'medium_counts': {large_code: {medium_code: count}},
        }}
    """
    all_codes = []
    for codes in MAJOR_REGIONS.values():
        all_codes.extend(codes)

    if target_codes:
        all_codes = [c for c in all_codes if c in target_codes]

    total = len(all_codes)
    logger.info(f"Phase 1: Collecting real store counts for {total} regions...")

    results: Dict[str, Dict[str, Any]] = {}

    async with httpx.AsyncClient() as client:
        for idx, sigungu_code in enumerate(all_codes):
            if (idx + 1) % 10 == 0 or idx == 0:
                logger.info(f"  Region {idx + 1}/{total}: {sigungu_code}")

            region_data: Dict[str, Any] = {
                'large_counts': {},
                'medium_counts': {},
            }

            # Step 1: Get total counts per large code
            for large_code in API_LARGE_CODES:
                count = await fetch_store_total_count(client, api_key, sigungu_code, large_code)

                # Retry once on error
                if count == -1:
                    logger.info(f"    Retrying {sigungu_code}/{large_code}...")
                    await asyncio.sleep(2.0)
                    count = await fetch_store_total_count(client, api_key, sigungu_code, large_code)
                    if count == -1:
                        logger.warning(f"    Skipping {sigungu_code}/{large_code} after retry failure")
                        count = 0

                region_data['large_counts'][large_code] = count

            # Step 2: Get medium-code breakdown for top 3 industries
            for large_code in API_LARGE_CODES_DETAILED:
                large_total = region_data['large_counts'].get(large_code, 0)
                if large_total > 0:
                    medium = await fetch_medium_code_breakdown(
                        client, api_key, sigungu_code, large_code
                    )
                    region_data['medium_counts'][large_code] = medium
                else:
                    region_data['medium_counts'][large_code] = {}

            results[sigungu_code] = region_data

    logger.info(f"Phase 1 complete: {len(results)} regions collected")
    return results


def save_cache(data: Dict[str, Dict[str, Any]], path: Path) -> None:
    """Save API results to JSON cache file."""
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"Cache saved to {path} ({path.stat().st_size / 1024:.1f} KB)")


def load_cache(path: Path) -> Optional[Dict[str, Dict[str, Any]]]:
    """Load API results from JSON cache file."""
    if not path.exists():
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        logger.info(f"Cache loaded from {path} ({len(data)} regions)")
        return data
    except Exception as e:
        logger.warning(f"Cache load failed: {e}")
        return None


# ======================================================
# Phase 2: Map API codes to seed industry codes
# ======================================================

def map_api_to_seed_counts(
    real_data: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, int]]:
    """
    Phase 2: Convert real API store data to per-seed-industry-code counts.

    Returns:
        {sigungu_code: {seed_industry_code: estimated_store_count}}
    """
    mapped: Dict[str, Dict[str, int]] = {}

    for sigungu_code, region_data in real_data.items():
        seed_counts: Dict[str, int] = {}
        medium_data = region_data.get('medium_counts', {})

        # For each API medium code -> seed codes mapping
        for api_mcls, seed_codes in API_MEDIUM_TO_SEED.items():
            # Find which large code this medium code belongs to
            large_code = None
            for lc in API_LARGE_CODES_DETAILED:
                if lc in medium_data and api_mcls in medium_data[lc]:
                    large_code = lc
                    break

            if large_code and api_mcls in medium_data[large_code]:
                api_count = medium_data[large_code][api_mcls]
            else:
                # No detailed data: estimate from large code total
                api_count = 0

            if api_count > 0 and len(seed_codes) > 0:
                # Split proportionally by base_stores weights
                total_weight = sum(
                    INDUSTRY_PROFILES[sc]['base_stores'] for sc in seed_codes
                    if sc in INDUSTRY_PROFILES
                )
                for sc in seed_codes:
                    if sc in INDUSTRY_PROFILES and total_weight > 0:
                        weight = INDUSTRY_PROFILES[sc]['base_stores'] / total_weight
                        seed_counts[sc] = seed_counts.get(sc, 0) + max(1, int(api_count * weight))

        # For seed codes not yet assigned (no medium-code match or UNMAPPED):
        # Use large-code totals to estimate via profile base_stores ratios
        large_counts = region_data.get('large_counts', {})

        # Build a mapping of seed codes to their "expected" API large code
        seed_to_api_large: Dict[str, str] = {
            # 음식
            'Q01': 'I2', 'Q02': 'I2', 'Q03': 'I2', 'Q04': 'I2', 'Q05': 'I2',
            'Q06': 'I2', 'Q07': 'I2', 'Q08': 'I2', 'Q09': 'I2', 'Q10': 'I2',
            'Q11': 'I2', 'Q12': 'I2', 'Q13': 'I2', 'Q14': 'I2', 'Q15': 'I2',
            # 소매
            'D01': 'G2', 'D02': 'G2', 'D03': 'G2', 'D04': 'G2', 'D05': 'G2',
            'R01': 'G2', 'R02': 'G2', 'R03': 'G2', 'R04': 'G2', 'R05': 'G2',
            'N01': 'G2', 'N02': 'G2', 'N03': 'G2',
            # 의료
            'L01': 'Q1', 'L02': 'Q1', 'L03': 'Q1',
            # 서비스 (수리/개인)
            'I01': 'S2', 'I02': 'S2', 'I03': 'S2',
            'S04': 'S2', 'S05': 'S2', 'S06': 'S2',
            # 교육
            'S01': 'P1', 'S02': 'N1', 'S03': 'P1',
            # 부동산
            'I06': 'L1',
            # Others (no direct API large code)
            'I04': 'S2', 'I05': 'N1',
            'L04': 'P1', 'L05': 'Q1', 'L06': 'G2',
        }

        for seed_code in INDUSTRY_PROFILES:
            if seed_code in seed_counts and seed_counts[seed_code] > 0:
                continue  # already mapped from medium code

            api_lc = seed_to_api_large.get(seed_code)
            if not api_lc:
                continue

            large_total = large_counts.get(api_lc, 0)
            if large_total <= 0:
                # Fallback: use profile base_stores with activity scaling
                activity = REGIONS.get(sigungu_code, 3)
                factor = 0.2 + activity * 0.32
                seed_counts[seed_code] = max(1, int(
                    INDUSTRY_PROFILES[seed_code]['base_stores'] * factor
                ))
                continue

            # Estimate: this seed code's share of the large-code total
            # based on the ratio of its base_stores to the sum of all seed codes
            # mapped to this large code
            same_large_seeds = [
                sc for sc, lc in seed_to_api_large.items() if lc == api_lc
            ]
            total_base = sum(
                INDUSTRY_PROFILES[sc]['base_stores'] for sc in same_large_seeds
                if sc in INDUSTRY_PROFILES
            )
            if total_base > 0:
                ratio = INDUSTRY_PROFILES[seed_code]['base_stores'] / total_base
                estimated = max(1, int(large_total * ratio))
                seed_counts[seed_code] = estimated

        mapped[sigungu_code] = seed_counts

    logger.info(f"Phase 2 complete: mapped {len(mapped)} regions to seed industry codes")

    # Log sample
    sample_code = list(mapped.keys())[0] if mapped else None
    if sample_code:
        sample = mapped[sample_code]
        total = sum(sample.values())
        logger.info(f"  Sample {sample_code}: {total} total stores across {len(sample)} industries")
        top5 = sorted(sample.items(), key=lambda x: x[1], reverse=True)[:5]
        for code, count in top5:
            logger.info(f"    {code} ({ALL_INDUSTRIES.get(code, '?')}): {count}")

    return mapped


# ======================================================
# Phase 3: Generate calibrated statistics
# ======================================================

def stochastic_variation(seed_str: str, base_val: float, pct_range: float = 0.25, noise_std: float = 0.15) -> float:
    """Hash-based variation + Gaussian noise for realistic distribution."""
    h = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)
    rng = np.random.RandomState(h % (2**31))
    ratio = (h % 10000) / 10000.0
    deterministic_part = (ratio * 2 - 1) * pct_range
    noise_part = rng.normal(0, noise_std)
    return base_val * (1 + deterministic_part + noise_part)


def generate_monthly_data(
    base_year_month: str,
    month_index: int,
    real_store_map: Dict[str, Dict[str, int]],
) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """
    Phase 3: Generate calibrated monthly data for 3 tables.

    Uses real store counts from API as anchor. Statistics are derived
    from the real counts with industry-specific calibration.
    """
    business_data: List[Dict] = []
    sales_data: List[Dict] = []
    store_data: List[Dict] = []

    month_num = int(base_year_month[4:6])  # 1-12

    for sigungu_code, activity_level in REGIONS.items():
        sido_code = sigungu_code[:2]
        activity_factor = 0.2 + activity_level * 0.32
        trend_factor = REGIONAL_TRENDS.get(sido_code, 1.0) ** (month_index / 12)

        real_stores = real_store_map.get(sigungu_code, {})

        for ind_code, profile in INDUSTRY_PROFILES.items():
            seed = f"{sigungu_code}_{ind_code}_{base_year_month}"
            category = profile['cat']
            seasonal_factor = SEASONAL_PROFILES[category][month_num - 1]

            # -- Store count: use real API count as anchor --
            base_real_count = real_stores.get(ind_code, 0)
            if base_real_count > 0:
                # Real data available: add monthly variation (+/-5%) and trend
                store_count = max(1, int(
                    base_real_count * trend_factor *
                    stochastic_variation(seed + '_st_var', 1.0, 0.05, 0.02)
                ))
            else:
                # Fallback: use profile base_stores with activity scaling
                store_count = max(1, int(stochastic_variation(
                    seed + '_stores',
                    profile['base_stores'] * activity_factor * trend_factor,
                    0.25, 0.05
                )))

            # Franchise count
            franchise_count = max(0, int(
                store_count * profile['franchise_pct'] / 100 *
                stochastic_variation(seed + '_fc', 1.0, 0.15, 0.03)
            ))
            franchise_count = min(franchise_count, store_count)

            # Survival rate (anchored to KOSIS national averages by industry)
            survival_base = profile['survival'] + (activity_level - 3) * 1.5
            survival_rate = round(max(20, min(95, stochastic_variation(
                seed + '_surv', survival_base, 0.08, 0.02
            ))), 2)

            # Confounding factors (10% shock, 5% bonus)
            confound_h = int(hashlib.md5(f"{seed}_confound".encode()).hexdigest()[:8], 16)
            if confound_h % 100 < 10:
                survival_rate = round(max(20, survival_rate - 15 * (confound_h % 10) / 10), 2)
            elif confound_h % 100 < 15:
                survival_rate = round(min(95, survival_rate + 10 * (confound_h % 10) / 10), 2)

            # Open/close counts derived from store_count and survival
            monthly_churn = max(1, int(store_count * 0.02))
            open_count = max(0, int(stochastic_variation(
                seed + '_open', monthly_churn * survival_rate / 100, 0.3, 0.05
            )))
            close_count = max(0, int(stochastic_variation(
                seed + '_close', monthly_churn * (100 - survival_rate) / 100, 0.3, 0.05
            )))

            # Monthly sales (activity + seasonal + trend)
            monthly_sales_man = profile['monthly_sales']
            monthly_sales = max(0, int(stochastic_variation(
                seed + '_sales',
                monthly_sales_man * activity_factor * seasonal_factor * trend_factor * 10000,
                0.20, 0.05
            )))

            # Sales growth rate
            growth_base = profile['growth'] + (activity_level - 3) * 0.5
            growth_rate = round(stochastic_variation(
                seed + '_growth', growth_base, 0.30, 0.05
            ), 2)

            # Counter-intuitive outliers (7%)
            anomaly_h = int(hashlib.md5(f"{seed}_anomaly".encode()).hexdigest()[:8], 16)
            if anomaly_h % 100 < 7:
                if anomaly_h % 2 == 0 and survival_rate > 70:
                    growth_rate = round(-(5.0 + anomaly_h % 10), 2)
                elif survival_rate < 50:
                    growth_rate = round(8.0 + anomaly_h % 10, 2)

            # Weekend/weekday sales ratio
            weekend_base = 35
            if category == '음식':
                weekend_base = 42
            elif ind_code in ('S02', 'S03', 'S05'):
                weekend_base = 55
            elif ind_code in ('N01', 'L01', 'L02', 'L03'):
                weekend_base = 15
            elif ind_code in ('S01',):
                weekend_base = 25
            weekend_ratio = round(max(10, min(70, stochastic_variation(
                seed + '_weekend', weekend_base, 0.10, 0.03
            ))), 2)
            weekday_ratio = round(100 - weekend_ratio, 2)

            # Density level
            if store_count >= 50:
                density = '높음'
            elif store_count >= 10:
                density = '중간'
            else:
                density = '낮음'

            # Commercial district code (VARCHAR(10): sigungu 5 + hash 5)
            district_hash = hashlib.md5(seed.encode()).hexdigest()[:5]
            commercial_district_code = f"{sigungu_code}{district_hash}"

            large_code = ind_code[0]
            medium_code = ind_code

            business_data.append({
                'commercial_district_code': commercial_district_code,
                'sido_code': sido_code,
                'sigungu_code': sigungu_code,
                'industry_large_code': large_code,
                'industry_medium_code': medium_code,
                'industry_small_code': ind_code,
                'industry_name': profile['name'],
                'open_count': open_count,
                'close_count': close_count,
                'operating_count': store_count,
                'survival_rate': survival_rate,
                'base_year_month': base_year_month,
            })

            sales_data.append({
                'commercial_district_code': commercial_district_code,
                'sido_code': sido_code,
                'sigungu_code': sigungu_code,
                'industry_large_code': large_code,
                'industry_medium_code': medium_code,
                'industry_small_code': ind_code,
                'industry_name': profile['name'],
                'monthly_avg_sales': monthly_sales,
                'monthly_sales_count': max(100, int(
                    store_count * stochastic_variation(seed + '_cnt', 25, 0.3, 0.05)
                )),
                'sales_growth_rate': growth_rate,
                'weekend_sales_ratio': weekend_ratio,
                'weekday_sales_ratio': weekday_ratio,
                'base_year_month': base_year_month,
            })

            store_data.append({
                'commercial_district_code': commercial_district_code,
                'sido_code': sido_code,
                'sigungu_code': sigungu_code,
                'industry_large_code': large_code,
                'industry_medium_code': medium_code,
                'industry_small_code': ind_code,
                'industry_name': profile['name'],
                'store_count': store_count,
                'density_level': density,
                'franchise_count': franchise_count,
                'independent_count': store_count - franchise_count,
                'base_year_month': base_year_month,
            })

    return business_data, sales_data, store_data


def generate_foot_traffic_data(
    base_year_quarter: str,
    real_store_map: Dict[str, Dict[str, int]],
) -> List[Dict]:
    """Generate foot traffic statistics (quarterly) anchored to real store density."""
    foot_traffic_data: List[Dict] = []

    base_total_map = {1: 30000, 2: 60000, 3: 100000, 4: 160000, 5: 250000}
    time_dist_commercial = [0.03, 0.12, 0.22, 0.18, 0.30, 0.15]
    time_dist_residential = [0.05, 0.15, 0.18, 0.15, 0.28, 0.19]

    age_dist_seoul_premium = [0.05, 0.30, 0.28, 0.20, 0.12, 0.05]
    age_dist_other_premium = [0.08, 0.25, 0.25, 0.22, 0.13, 0.07]
    age_dist_default = [0.10, 0.18, 0.22, 0.22, 0.18, 0.10]

    for sigungu_code, activity_level in REGIONS.items():
        sido_code = sigungu_code[:2]
        seed = f"{sigungu_code}_ft_{base_year_quarter}"

        ft_hash = hashlib.md5(f"{sigungu_code}_ft".encode()).hexdigest()[:3]
        commercial_district_code = f"{sigungu_code}FT{ft_hash}"

        # Anchor foot traffic to real store density if available
        real_stores = real_store_map.get(sigungu_code, {})
        total_real_stores = sum(real_stores.values()) if real_stores else 0

        if total_real_stores > 0:
            # Scale base foot traffic by ratio of real stores to expected stores
            expected_stores_base = sum(
                p['base_stores'] for p in INDUSTRY_PROFILES.values()
            ) * (0.2 + activity_level * 0.32)
            store_density_ratio = total_real_stores / expected_stores_base if expected_stores_base > 0 else 1.0
            store_density_ratio = max(0.3, min(3.0, store_density_ratio))  # clamp
            base_total = int(base_total_map[activity_level] * store_density_ratio)
        else:
            base_total = base_total_map[activity_level]

        total = max(1000, int(stochastic_variation(seed + '_total', base_total, 0.20, 0.08)))

        time_dist = time_dist_commercial if activity_level >= 4 else time_dist_residential

        time_values_raw = []
        for i, ratio in enumerate(time_dist):
            val = max(0, int(stochastic_variation(seed + f'_time{i}', total * ratio, 0.10, 0.03)))
            time_values_raw.append(val)
        time_sum = sum(time_values_raw)
        if time_sum > 0:
            time_values = [max(0, int(v * total / time_sum)) for v in time_values_raw]
        else:
            time_values = time_values_raw

        if sido_code == '11' and activity_level >= 4:
            age_dist = age_dist_seoul_premium
        elif activity_level >= 4:
            age_dist = age_dist_other_premium
        else:
            age_dist = age_dist_default

        age_values_raw = []
        for i, ratio in enumerate(age_dist):
            val = max(0, int(stochastic_variation(seed + f'_age{i}', total * ratio, 0.10, 0.03)))
            age_values_raw.append(val)
        age_sum = sum(age_values_raw)
        if age_sum > 0:
            age_values = [max(0, int(v * total / age_sum)) for v in age_values_raw]
        else:
            age_values = age_values_raw

        male_ratio = stochastic_variation(seed + '_male', 0.48, 0.05, 0.02)
        male_ratio = max(0.40, min(0.60, male_ratio))
        male_count = max(0, int(total * male_ratio))
        female_count = max(0, total - male_count)

        weekday_avg = max(0, int(total * stochastic_variation(seed + '_wkday', 0.58, 0.05, 0.02)))
        weekend_avg = max(0, int(total * stochastic_variation(seed + '_wkend', 0.42, 0.05, 0.02)))

        foot_traffic_data.append({
            'commercial_district_code': commercial_district_code,
            'sido_code': sido_code,
            'sigungu_code': sigungu_code,
            'age_10s': age_values[0],
            'age_20s': age_values[1],
            'age_30s': age_values[2],
            'age_40s': age_values[3],
            'age_50s': age_values[4],
            'age_60s_plus': age_values[5],
            'male_count': male_count,
            'female_count': female_count,
            'time_00_06': time_values[0],
            'time_06_11': time_values[1],
            'time_11_14': time_values[2],
            'time_14_17': time_values[3],
            'time_17_21': time_values[4],
            'time_21_24': time_values[5],
            'weekday_avg': weekday_avg,
            'weekend_avg': weekend_avg,
            'total_foot_traffic': total,
            'base_year_quarter': base_year_quarter,
        })

    return foot_traffic_data


def generate_district_characteristics(
    base_year_quarter: str,
    foot_traffic_map: Dict[str, Dict],
) -> List[Dict]:
    """Generate district characteristics (quarterly) from foot traffic data."""
    characteristics_data: List[Dict] = []

    district_names = {
        '11110': '종로', '11140': '중구', '11170': '용산', '11200': '성동',
        '11215': '광진', '11230': '동대문', '11260': '중랑', '11290': '성북',
        '11305': '강북', '11320': '도봉', '11350': '노원', '11380': '은평',
        '11410': '서대문', '11440': '마포', '11470': '양천', '11500': '강서',
        '11530': '구로', '11545': '금천', '11560': '영등포', '11590': '동작',
        '11620': '관악', '11650': '서초', '11680': '강남', '11710': '송파',
        '11740': '강동',
    }

    age_group_labels = ['10대', '20대', '30대', '40대', '50대', '60대이상']

    for sigungu_code, activity_level in REGIONS.items():
        sido_code = sigungu_code[:2]
        seed = f"{sigungu_code}_char_{base_year_quarter}"

        ft_hash = hashlib.md5(f"{sigungu_code}_ft".encode()).hexdigest()[:3]
        commercial_district_code = f"{sigungu_code}FT{ft_hash}"

        district_name = district_names.get(sigungu_code, sigungu_code) + '상권'

        h = int(hashlib.md5(seed.encode()).hexdigest()[:4], 16)
        if activity_level == 5 and sido_code == '11':
            district_type = '오피스상권' if h % 2 == 0 else '유흥상권'
        elif activity_level == 4:
            district_type = '주거상권' if h % 3 == 0 else '오피스상권'
        elif activity_level == 3:
            district_type = '주거상권'
        else:
            district_type = '주거상권'

        ft_data = foot_traffic_map.get(commercial_district_code)
        if ft_data:
            age_counts = [
                ft_data['age_10s'], ft_data['age_20s'], ft_data['age_30s'],
                ft_data['age_40s'], ft_data['age_50s'], ft_data['age_60s_plus'],
            ]
        else:
            age_counts = [10, 20, 25, 22, 15, 8]

        total_age = sum(age_counts)
        if total_age > 0:
            max_idx = age_counts.index(max(age_counts))
            primary_age_group = age_group_labels[max_idx]
            primary_age_ratio = round(age_counts[max_idx] / total_age * 100, 2)
        else:
            primary_age_group = '30대'
            primary_age_ratio = 25.0

        if district_type == '오피스상권':
            office_worker_ratio = round(stochastic_variation(seed + '_owr', 55.0, 0.15, 0.05), 2)
            resident_ratio = round(stochastic_variation(seed + '_rr', 25.0, 0.15, 0.05), 2)
            student_ratio = round(stochastic_variation(seed + '_sr', 10.0, 0.15, 0.05), 2)
        elif district_type == '유흥상권':
            office_worker_ratio = round(stochastic_variation(seed + '_owr', 35.0, 0.15, 0.05), 2)
            resident_ratio = round(stochastic_variation(seed + '_rr', 20.0, 0.15, 0.05), 2)
            student_ratio = round(stochastic_variation(seed + '_sr', 15.0, 0.15, 0.05), 2)
        else:
            office_worker_ratio = round(stochastic_variation(seed + '_owr', 20.0, 0.15, 0.05), 2)
            resident_ratio = round(stochastic_variation(seed + '_rr', 55.0, 0.15, 0.05), 2)
            student_ratio = round(stochastic_variation(seed + '_sr', 12.0, 0.15, 0.05), 2)

        office_worker_ratio = max(0.0, min(100.0, office_worker_ratio))
        resident_ratio = max(0.0, min(100.0, resident_ratio))
        student_ratio = max(0.0, min(100.0, student_ratio))

        if district_type in ('오피스상권', '유흥상권'):
            peak_time_start = '17:00'
            peak_time_end = '21:00'
        else:
            peak_time_start = '11:00'
            peak_time_end = '14:00'

        if ft_data:
            if peak_time_start == '17:00':
                peak_time_traffic = ft_data.get('time_17_21', 0)
            else:
                peak_time_traffic = ft_data.get('time_11_14', 0)
        else:
            peak_time_traffic = max(1000, int(stochastic_variation(seed + '_peak', 50000, 0.3, 0.1)))

        weekday_dominant = district_type == '오피스상권'

        if weekday_dominant:
            weekend_sales_ratio = round(stochastic_variation(seed + '_wsr', 30.0, 0.10, 0.03), 2)
        elif district_type == '유흥상권':
            weekend_sales_ratio = round(stochastic_variation(seed + '_wsr', 55.0, 0.10, 0.03), 2)
        else:
            weekend_sales_ratio = round(stochastic_variation(seed + '_wsr', 42.0, 0.10, 0.03), 2)
        weekend_sales_ratio = max(10.0, min(80.0, weekend_sales_ratio))

        if activity_level == 5:
            avg_ticket_price = max(15000, int(stochastic_variation(seed + '_ticket', 30000, 0.20, 0.08)))
            consumption_level = '높음'
        elif activity_level >= 3:
            avg_ticket_price = max(8000, int(stochastic_variation(seed + '_ticket', 15000, 0.20, 0.08)))
            consumption_level = '중간'
        else:
            avg_ticket_price = max(5000, int(stochastic_variation(seed + '_ticket', 11500, 0.20, 0.08)))
            consumption_level = '낮음'

        characteristics_data.append({
            'commercial_district_code': commercial_district_code,
            'district_name': district_name,
            'district_type': district_type,
            'primary_age_group': primary_age_group,
            'primary_age_ratio': primary_age_ratio,
            'office_worker_ratio': office_worker_ratio,
            'resident_ratio': resident_ratio,
            'student_ratio': student_ratio,
            'peak_time_start': peak_time_start,
            'peak_time_end': peak_time_end,
            'peak_time_traffic': peak_time_traffic,
            'weekday_dominant': weekday_dominant,
            'weekend_sales_ratio': weekend_sales_ratio,
            'avg_ticket_price': avg_ticket_price,
            'consumption_level': consumption_level,
            'base_year_quarter': base_year_quarter,
        })

    return characteristics_data


# ======================================================
# Phase 4: Save to Supabase
# ======================================================

def save_to_supabase(
    supabase: Client,
    table_name: str,
    data_list: List[Dict],
    on_conflict: str,
) -> int:
    """Batch upsert to Supabase (500 per batch)."""
    if not data_list:
        return 0

    total = 0
    batch_size = 500

    for i in range(0, len(data_list), batch_size):
        batch = data_list[i:i + batch_size]
        try:
            result = supabase.table(table_name).upsert(
                batch,
                on_conflict=on_conflict,
            ).execute()
            count = len(result.data) if result.data else 0
            total += count
            if (i // batch_size) % 10 == 0:
                logger.info(f"  {table_name} batch {i // batch_size + 1}: {count}건")
        except Exception as e:
            logger.error(f"  Save error ({table_name} batch {i // batch_size + 1}): {e}")

    return total


# ======================================================
# Main
# ======================================================

async def main():
    parser = argparse.ArgumentParser(
        description='Collect real store data from SBIZ API + generate calibrated statistics'
    )
    parser.add_argument('--months', type=int, default=24, help='Number of months to generate (default: 24)')
    parser.add_argument('--regions', nargs='*', help='Specific region names to process (e.g. 서울 경기)')
    parser.add_argument('--skip-api', action='store_true', help='Skip API collection, use cached data')
    parser.add_argument('--dry-run', action='store_true', help='Generate data without saving to DB')
    parser.add_argument('--api-only', action='store_true', help='Only collect API data, do not generate/save')
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("Real Store Data Collection + Calibrated Statistics Generation")
    logger.info("=" * 60)
    logger.info(f"  Regions: {len(REGIONS)} sigungu")
    logger.info(f"  Industries: {len(INDUSTRY_PROFILES)} seed codes")
    logger.info(f"  Months: {args.months}")
    logger.info(f"  Skip API: {args.skip_api}")
    logger.info(f"  Dry run: {args.dry_run}")

    # Determine target region codes
    target_codes: Optional[List[str]] = None
    if args.regions:
        target_codes = []
        for r in args.regions:
            if r in MAJOR_REGIONS:
                target_codes.extend(MAJOR_REGIONS[r])
            else:
                logger.warning(f"Unknown region: {r}")
        if not target_codes:
            logger.error("No valid regions specified")
            sys.exit(1)
        logger.info(f"  Target regions: {args.regions} ({len(target_codes)} codes)")

    # ── Phase 1: API Collection ──
    api_key = os.environ.get('SBIZ_API_KEY')
    real_data: Optional[Dict[str, Dict[str, Any]]] = None

    if args.skip_api:
        logger.info("\nPhase 1: Skipped (--skip-api). Loading cache...")
        real_data = load_cache(CACHE_FILE)
        if not real_data:
            logger.warning("No cache found. Will use fallback profile-based estimates.")
    else:
        if not api_key:
            logger.error("SBIZ_API_KEY environment variable required for API collection")
            logger.info("Use --skip-api to skip API collection and use cached/fallback data")
            sys.exit(1)

        real_data = await collect_real_store_data(api_key, target_codes)
        save_cache(real_data, CACHE_FILE)

    if args.api_only:
        logger.info("\n--api-only: Exiting after API collection.")
        return

    # ── Phase 2: Map API codes to seed codes ──
    if real_data:
        real_store_map = map_api_to_seed_counts(real_data)
    else:
        logger.info("\nPhase 2: No real data. Using profile-based fallback for all regions.")
        real_store_map = {}

    # ── Phase 3: Generate calibrated statistics ──
    logger.info(f"\nPhase 3: Generating {args.months} months of calibrated statistics...")

    now = datetime.now()
    months: List[str] = []
    for i in range(args.months - 1, -1, -1):
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        months.append(f"{year:04d}{month:02d}")

    all_business: List[Dict] = []
    all_sales: List[Dict] = []
    all_store: List[Dict] = []

    for month_index, ym in enumerate(months):
        if (month_index + 1) % 6 == 0 or month_index == 0:
            logger.info(f"  Generating {ym} (month {month_index + 1}/{len(months)})...")
        biz, sales, store = generate_monthly_data(ym, month_index, real_store_map)
        all_business.extend(biz)
        all_sales.extend(sales)
        all_store.extend(store)

    logger.info(f"  Monthly totals: business={len(all_business)}, sales={len(all_sales)}, store={len(all_store)}")

    # Quarterly data
    quarters_seen = set()
    quarters: List[str] = []
    for ym in months:
        year = ym[:4]
        m = int(ym[4:6])
        q = (m - 1) // 3 + 1
        quarter_str = f"{year}{q:02d}"
        if quarter_str not in quarters_seen:
            quarters_seen.add(quarter_str)
            quarters.append(quarter_str)

    logger.info(f"  Quarters ({len(quarters)}): {quarters}")

    all_foot_traffic: List[Dict] = []
    all_characteristics: List[Dict] = []

    for quarter in quarters:
        ft_data = generate_foot_traffic_data(quarter, real_store_map)
        all_foot_traffic.extend(ft_data)

        ft_map = {row['commercial_district_code']: row for row in ft_data}
        char_data = generate_district_characteristics(quarter, ft_map)
        all_characteristics.extend(char_data)

    logger.info(f"  Quarterly totals: foot_traffic={len(all_foot_traffic)}, characteristics={len(all_characteristics)}")

    # ── Phase 4: Save to Supabase ──
    if args.dry_run:
        logger.info("\nDry run mode - printing samples, not saving.")
        for label, data in [
            ('business_statistics', all_business),
            ('sales_statistics', all_sales),
            ('store_statistics', all_store),
            ('foot_traffic_statistics', all_foot_traffic),
            ('district_characteristics', all_characteristics),
        ]:
            logger.info(f"\n[{label}] sample:")
            for item in data[:2]:
                logger.info(f"  {item}")
        return

    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_SERVICE_KEY')
    if not supabase_url or not supabase_key:
        logger.error("SUPABASE_URL, SUPABASE_SERVICE_KEY environment variables required")
        sys.exit(1)

    supabase = create_client(supabase_url, supabase_key)

    logger.info("\nPhase 4: Saving to Supabase...")

    monthly_conflict = 'commercial_district_code,industry_small_code,base_year_month'
    quarterly_conflict = 'commercial_district_code,base_year_quarter'

    biz_count = save_to_supabase(supabase, 'business_statistics', all_business, monthly_conflict)
    sales_count = save_to_supabase(supabase, 'sales_statistics', all_sales, monthly_conflict)
    store_count = save_to_supabase(supabase, 'store_statistics', all_store, monthly_conflict)
    ft_count = save_to_supabase(supabase, 'foot_traffic_statistics', all_foot_traffic, quarterly_conflict)
    char_count = save_to_supabase(supabase, 'district_characteristics', all_characteristics, quarterly_conflict)

    logger.info("\n" + "=" * 60)
    logger.info("Complete!")
    logger.info(f"  business_statistics: {biz_count}")
    logger.info(f"  sales_statistics: {sales_count}")
    logger.info(f"  store_statistics: {store_count}")
    logger.info(f"  foot_traffic_statistics: {ft_count}")
    logger.info(f"  district_characteristics: {char_count}")

    # Summary of real data coverage
    if real_store_map:
        regions_with_data = sum(1 for v in real_store_map.values() if sum(v.values()) > 0)
        logger.info(f"  Real API data anchored: {regions_with_data}/{len(REGIONS)} regions")
    else:
        logger.info(f"  Real API data anchored: 0/{len(REGIONS)} regions (fallback only)")

    logger.info("=" * 60)


if __name__ == '__main__':
    asyncio.run(main())
