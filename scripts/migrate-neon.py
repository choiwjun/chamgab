"""Initialize an empty Neon database from the repository's SQL migrations.

Requires psycopg and DATABASE_URL. Applied files are recorded, so interrupted
runs can safely resume. Existing application data is never dropped.
"""

import os
import re
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]


def connect():
    url = os.getenv('DATABASE_URL')
    if not url:
        for line in (ROOT / '.env.local').read_text().splitlines():
            if line.startswith('DATABASE_URL='):
                url = line.split('=', 1)[1].strip().strip('"\'')
                break
    if not url:
        raise RuntimeError('DATABASE_URL is required')
    return psycopg.connect(url)


def adapt(sql):
    sql = sql.replace('REFERENCES auth.users(id)', 'REFERENCES neon_auth."user"(id)')
    sql = sql.replace('ON auth.users', 'ON neon_auth."user"')
    sql = sql.replace('auth.users', 'public.neon_auth_users')
    sql = sql.replace('auth.role()', 'public.neon_request_role()')
    sql = sql.replace('extensions.digest(', 'public.digest(')
    sql = sql.replace("COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))", "COALESCE(NEW.name, split_part(NEW.email, '@', 1))")
    return sql


with connect() as conn:
    conn.execute('''
        DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
                CREATE ROLE anon NOLOGIN;
            END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN
                CREATE ROLE service_role NOLOGIN;
            END IF;
        END $$;
        GRANT anon, service_role TO authenticator;
        GRANT anon TO anonymous;
        CREATE OR REPLACE FUNCTION public.neon_request_role() RETURNS text
        LANGUAGE plpgsql STABLE AS $$ DECLARE request_role text := auth.jwt()->>'role'; BEGIN
            IF request_role IN ('anon', 'anonymous', 'authenticated', 'service_role') THEN RETURN request_role; END IF;
            IF session_user = current_database() || '_owner' THEN RETURN 'service_role'; END IF;
            RETURN COALESCE(request_role, current_user::text);
        END $$;
        CREATE OR REPLACE VIEW public.neon_auth_users AS
        SELECT id, email, "createdAt" AS created_at,
            CASE WHEN "emailVerified" THEN "createdAt" ELSE NULL END AS email_confirmed_at,
            CASE WHEN "emailVerified" THEN "createdAt" ELSE NULL END AS confirmed_at,
            jsonb_build_object('name', name, 'full_name', name, 'avatar_url', image) AS raw_user_meta_data,
            jsonb_build_object('role', role) AS raw_app_meta_data,
            "banExpires" AS banned_until
        FROM neon_auth."user";
        CREATE TABLE IF NOT EXISTS public.chamgab_schema_migrations (
            name text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        );
    ''')
    conn.commit()

    for path in sorted((ROOT / 'supabase/migrations').glob('[0-9][0-9][0-9]_*.sql')):
        if path.name == '014_seed_data.sql':
            continue  # Example prices and properties are not production data.
        if conn.execute('SELECT 1 FROM public.chamgab_schema_migrations WHERE name=%s', (path.name,)).fetchone():
            continue
        sql = adapt(path.read_text(encoding='utf-8-sig'))
        if path.name == '051_update_school_analysis_quality_views.sql':
            sql = 'DROP VIEW IF EXISTS public.vw_school_analysis_preview CASCADE; DROP VIEW IF EXISTS public.vw_academy_ecosystem_by_sigungu CASCADE;\n' + sql
        try:
            conn.execute(sql)
            conn.execute('INSERT INTO public.chamgab_schema_migrations(name) VALUES (%s)', (path.name,))
            conn.commit()
            print('Applied:', path.name, flush=True)
        except Exception:
            conn.rollback()
            print('Failed:', path.name, flush=True)
            raise

    conn.execute('''
        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
        DO $$ DECLARE item record; BEGIN
            FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tableowner=current_user LOOP
                EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.tablename);
                EXECUTE format('DROP POLICY IF EXISTS neon_service_access ON public.%I', item.tablename);
                EXECUTE format('CREATE POLICY neon_service_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', item.tablename);
            END LOOP;
            FOR item IN SELECT viewname FROM pg_views WHERE schemaname='public' AND viewowner=current_user AND viewname <> 'neon_auth_users' LOOP
                EXECUTE format('ALTER VIEW public.%I SET (security_invoker=true)', item.viewname);
            END LOOP;
        END $$;
        REVOKE ALL ON public.chamgab_schema_migrations FROM anon, authenticated;
        REVOKE ALL ON public.neon_auth_users FROM anon, authenticated;
    ''')
    # Preserve the original per-table/column restrictions after the initial
    # grants. In particular, members must never edit their plan or credit limit.
    for path in sorted((ROOT / 'supabase/migrations').glob('[0-9][0-9][0-9]_*.sql')):
        if path.name == '014_seed_data.sql':
            continue
        for statement in re.findall(r'^(?:GRANT|REVOKE)\b[^;]*;', path.read_text(encoding='utf-8-sig'), re.MULTILINE):
            if re.search(r'\bON\s+(?:TABLE\s+)?public\.\w+', statement):
                conn.execute(statement)
    conn.commit()
    print('Neon grants and row-level access policies configured.', flush=True)
