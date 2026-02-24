#!/usr/bin/env python3
"""Seed and deterministic generators for school analysis datasets."""

from __future__ import annotations

import hashlib
from datetime import datetime
from datetime import date
from typing import Any, Dict, Iterable, List


DISTRICTS: List[Dict[str, str]] = [
    {
        "district_code": "11680",
        "district_name": "Seoul Gangnam-gu",
        "sido_code": "11",
        "sigungu_code": "11680",
    },
    {
        "district_code": "11440",
        "district_name": "Seoul Mapo-gu",
        "sido_code": "11",
        "sigungu_code": "11440",
    },
    {
        "district_code": "41135",
        "district_name": "Gyeonggi Bundang-gu",
        "sido_code": "41",
        "sigungu_code": "41135",
    },
    {
        "district_code": "28177",
        "district_name": "Incheon Yeonsu-gu",
        "sido_code": "28",
        "sigungu_code": "28177",
    },
    {
        "district_code": "26440",
        "district_name": "Busan Haeundae-gu",
        "sido_code": "26",
        "sigungu_code": "26440",
    },
]


SUBJECTS = [
    "math",
    "english",
    "science",
    "korean",
    "coding",
    "essay",
    "interview",
]


SCHOOL_LEVELS = [
    ("elementary", "E"),
    ("middle", "M"),
    ("high", "H"),
]


def _hash_fraction(key: str) -> float:
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    value = int.from_bytes(digest[:8], "big")
    return value / ((1 << 64) - 1)


def deterministic_value(
    key: str,
    min_value: float,
    max_value: float,
    precision: int = 2,
) -> float:
    ratio = _hash_fraction(key)
    value = min_value + (max_value - min_value) * ratio
    return round(value, precision)


def chunked(rows: Iterable[Dict[str, Any]], size: int = 500) -> Iterable[List[Dict[str, Any]]]:
    bucket: List[Dict[str, Any]] = []
    for row in rows:
        bucket.append(row)
        if len(bucket) >= size:
            yield bucket
            bucket = []
    if bucket:
        yield bucket


def build_school_rows(source: str = "seed_public_dataset") -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    now = datetime.utcnow().isoformat()
    for district in DISTRICTS:
        district_code = district["district_code"]
        for index, (level, suffix) in enumerate(SCHOOL_LEVELS, start=1):
            school_id = f"{district_code}-{suffix}{index}"
            school_name = f"{district['district_name']} {level.title()} School {index}"
            rows.append(
                {
                    "school_id": school_id,
                    "school_name": school_name,
                    "school_level": level,
                    "district_code": district_code,
                    "sido_code": district["sido_code"],
                    "sigungu_code": district["sigungu_code"],
                    "address": f"{district['district_name']} Education-ro {index * 7}",
                    "is_active": True,
                    "source": source,
                    "source_updated_at": now,
                }
            )
    return rows


def build_school_map_rows(school_rows: Iterable[Dict[str, Any]], source: str = "seed_public_dataset") -> List[Dict[str, Any]]:
    return [
        {
            "district_code": row["district_code"],
            "school_id": row["school_id"],
            "mapping_source": source,
        }
        for row in school_rows
    ]


def build_district_rows(source: str = "seed_public_dataset") -> List[Dict[str, Any]]:
    now = datetime.utcnow().isoformat()
    return [
        {
            "district_code": district["district_code"],
            "district_name": district["district_name"],
            "sido_code": district["sido_code"],
            "sigungu_code": district["sigungu_code"],
            "source": source,
            "source_updated_at": now,
        }
        for district in DISTRICTS
    ]


def build_metrics_rows(
    school_ids: Iterable[str],
    metric_year: int,
    metric_term: str = "annual",
    source: str = "seed_official_metrics",
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    now = datetime.utcnow().isoformat()
    for school_id in school_ids:
        metrics = {
            "achievement_score": deterministic_value(f"{school_id}:achievement:{metric_year}", 60, 96),
            "progression_outcome_score": deterministic_value(f"{school_id}:progression:{metric_year}", 58, 94),
            "education_environment_score": deterministic_value(
                f"{school_id}:environment:{metric_year}", 55, 93
            ),
            "safety_life_score": deterministic_value(f"{school_id}:safety:{metric_year}", 62, 97),
            "program_score": deterministic_value(f"{school_id}:program:{metric_year}", 52, 91),
        }
        rows.append(
            {
                "school_id": school_id,
                "metric_year": metric_year,
                "metric_term": metric_term,
                "metrics": metrics,
                "source": source,
                "source_url": None,
                "source_updated_at": now,
            }
        )
    return rows


def build_progression_rows(
    school_ids: Iterable[str],
    base_year: int,
    source: str = "seed_progression_stats",
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    now = datetime.utcnow().isoformat()
    for school_id in school_ids:
        general = deterministic_value(f"{school_id}:general:{base_year}", 45, 82)
        special = deterministic_value(f"{school_id}:special:{base_year}", 3, 18)
        autonomy = deterministic_value(f"{school_id}:autonomy:{base_year}", 2, 16)
        college = deterministic_value(f"{school_id}:college:{base_year}", 53, 91)

        rates = {
            "general_highschool": general,
            "special_purpose_highschool": special,
            "autonomy_highschool": autonomy,
            "college": college,
        }
        for destination_type, rate in rates.items():
            rows.append(
                {
                    "school_id": school_id,
                    "base_year": base_year,
                    "destination_type": destination_type,
                    "progression_rate": rate,
                    "student_count": int(deterministic_value(f"{school_id}:{destination_type}:n", 120, 460, 0)),
                    "metric_provenance": "official"
                    if destination_type != "college"
                    else "inferred",
                    "source": source,
                    "source_url": None,
                    "source_updated_at": now,
                }
            )
    return rows


def build_academy_rows(
    per_district: int = 10,
    source: str = "seed_academy_directory",
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    now = datetime.utcnow().isoformat()
    for district in DISTRICTS:
        sigungu = district["sigungu_code"]
        district_name = district["district_name"]
        for idx in range(1, per_district + 1):
            subject = SUBJECTS[(idx - 1) % len(SUBJECTS)]
            rows.append(
                {
                    "academy_id": f"ACA-{sigungu}-{idx:03d}",
                    "academy_name": f"{district_name} {subject.title()} Academy {idx}",
                    "sigungu_code": sigungu,
                    "address": f"{district_name} Study-ro {idx}",
                    "subject_category": subject,
                    "is_active": True,
                    "source": source,
                    "source_updated_at": now,
                }
            )
    return rows


def build_academy_fee_rows(
    academy_rows: Iterable[Dict[str, Any]],
    as_of: date | None = None,
    source: str = "seed_academy_fees",
) -> List[Dict[str, Any]]:
    as_of_date = (as_of or date.today()).isoformat()
    rows: List[Dict[str, Any]] = []
    now = datetime.utcnow().isoformat()
    for academy in academy_rows:
        academy_id = academy["academy_id"]
        subject = academy.get("subject_category") or "general"
        for grade_band in ["elementary", "middle", "high"]:
            fee = deterministic_value(
                f"{academy_id}:{grade_band}:{as_of_date}",
                120000,
                520000,
                0,
            )
            rows.append(
                {
                    "academy_id": academy_id,
                    "subject_name": subject,
                    "grade_band": grade_band,
                    "billing_cycle": "monthly",
                    "fee_amount": int(fee),
                    "currency": "KRW",
                    "metric_provenance": "official",
                    "as_of_date": as_of_date,
                    "source": source,
                    "source_updated_at": now,
                }
            )
    return rows
