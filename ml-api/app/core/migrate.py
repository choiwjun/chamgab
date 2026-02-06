# -*- coding: utf-8 -*-
"""
앱 시작 시 자동 마이그레이션 (transactions 테이블 컬럼 추가)

SUPABASE_DB_PASSWORD 환경변수가 있으면 psycopg2로 직접 ALTER TABLE 실행.
없으면 스킵 (수동 적용 안내).
"""
import os

# 필요한 ALTER TABLE SQL (멱등성 보장 - IF NOT EXISTS)
MIGRATION_SQL = """
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS region_code VARCHAR(10);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS apt_name VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS built_year INT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS jibun VARCHAR(50);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sigungu VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_transactions_region_code ON transactions(region_code);
CREATE INDEX IF NOT EXISTS idx_transactions_sigungu ON transactions(sigungu);
CREATE INDEX IF NOT EXISTS idx_transactions_apt_name ON transactions(apt_name);
CREATE INDEX IF NOT EXISTS idx_transactions_sigungu_date ON transactions(sigungu, transaction_date DESC);
"""


def auto_migrate() -> bool:
    """
    transactions 테이블에 수집 컬럼 자동 추가.

    Returns:
        True: 마이그레이션 성공 또는 이미 적용됨
        False: 실패 (DB 비밀번호 없음 등)
    """
    supabase_url = os.getenv("SUPABASE_URL", "")
    db_password = os.getenv("SUPABASE_DB_PASSWORD", "")

    if not supabase_url:
        print("[마이그레이션] SUPABASE_URL 없음, 건너뜀")
        return False

    if not db_password:
        print("[마이그레이션] SUPABASE_DB_PASSWORD 없음, 건너뜀")
        print("[마이그레이션] Supabase Dashboard > SQL Editor에서 수동 실행 필요:")
        print("[마이그레이션]   ALTER TABLE transactions ADD COLUMN IF NOT EXISTS region_code VARCHAR(10);")
        print("[마이그레이션]   ALTER TABLE transactions ADD COLUMN IF NOT EXISTS apt_name VARCHAR(100);")
        print("[마이그레이션]   ALTER TABLE transactions ADD COLUMN IF NOT EXISTS built_year INT;")
        print("[마이그레이션]   ALTER TABLE transactions ADD COLUMN IF NOT EXISTS jibun VARCHAR(50);")
        print("[마이그레이션]   ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sigungu VARCHAR(50);")
        return False

    # DB 호스트 추출
    project_ref = supabase_url.replace("https://", "").replace(".supabase.co", "")
    db_host = f"db.{project_ref}.supabase.co"

    try:
        import psycopg2

        conn = psycopg2.connect(
            host=db_host,
            port=5432,
            dbname="postgres",
            user="postgres",
            password=db_password,
            connect_timeout=10,
        )

        cursor = conn.cursor()
        cursor.execute(MIGRATION_SQL)
        conn.commit()
        cursor.close()
        conn.close()

        print("[마이그레이션] transactions 컬럼 추가 완료 (region_code, apt_name, built_year, jibun, sigungu)")
        return True

    except Exception as e:
        print(f"[마이그레이션] 자동 마이그레이션 실패: {e}")
        print("[마이그레이션] Supabase Dashboard에서 수동 적용하세요")
        return False
