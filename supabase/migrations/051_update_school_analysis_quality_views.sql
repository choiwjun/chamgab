-- Migration 051: school-analysis quality-first preview view update

CREATE OR REPLACE VIEW public.vw_academy_ecosystem_by_sigungu AS
WITH latest_fees AS (
  SELECT DISTINCT ON (af.academy_id)
    af.academy_id,
    af.fee_amount,
    af.as_of_date,
    COALESCE(af.source_updated_at, af.updated_at) AS source_updated_at
  FROM public.academy_fees af
  ORDER BY af.academy_id, af.as_of_date DESC, af.updated_at DESC
),
agg AS (
  SELECT
    a.sigungu_code,
    COUNT(DISTINCT a.academy_id) AS academy_count,
    COUNT(DISTINCT COALESCE(a.subject_category, 'unknown')) AS subject_diversity_count,
    AVG(lf.fee_amount)::NUMERIC(12, 2) AS avg_monthly_fee,
    MAX(COALESCE(a.source_updated_at, a.updated_at, lf.source_updated_at)) AS data_freshness
  FROM public.academies a
  LEFT JOIN latest_fees lf
    ON lf.academy_id = a.academy_id
  WHERE a.is_active = TRUE
  GROUP BY a.sigungu_code
)
SELECT
  sigungu_code,
  academy_count,
  subject_diversity_count,
  avg_monthly_fee,
  LEAST(100, ROUND(academy_count::NUMERIC * 2.5, 2)) AS density_score,
  LEAST(100, ROUND(subject_diversity_count::NUMERIC * 7.5, 2)) AS subject_diversity_score,
  CASE
    WHEN avg_monthly_fee IS NULL THEN NULL
    ELSE LEAST(100, GREATEST(0, ROUND(100 - ((avg_monthly_fee - 250000) / 5000), 2)))
  END AS fee_affordability_score,
  data_freshness,
  LEAST(
    100,
    ROUND(
      40 + LN(GREATEST(academy_count, 1)::NUMERIC) * 12 + subject_diversity_count::NUMERIC * 1.2,
      2
    )
  ) AS accessibility_score
FROM agg;

CREATE OR REPLACE VIEW public.vw_school_analysis_preview AS
WITH district_base AS (
  SELECT
    sd.district_code,
    sd.district_name,
    sd.sigungu_code,
    COUNT(DISTINCT s.school_id) AS school_count,
    COUNT(DISTINCT CASE WHEN q.achievement_score IS NOT NULL THEN s.school_id END) AS schools_with_official,
    COUNT(DISTINCT CASE WHEN s.location IS NOT NULL THEN s.school_id END) AS schools_with_location,
    AVG(q.achievement_score)::NUMERIC(6, 2) AS avg_achievement,
    AVG(q.progression_outcome_score)::NUMERIC(6, 2) AS avg_progression,
    AVG(q.education_environment_score)::NUMERIC(6, 2) AS avg_environment,
    AVG(q.safety_life_score)::NUMERIC(6, 2) AS avg_safety,
    AVG(q.program_score)::NUMERIC(6, 2) AS avg_program,
    MAX(q.source_updated_at) AS quality_freshness,
    MAX(COALESCE(sd.source_updated_at, sd.updated_at)) AS district_freshness
  FROM public.school_districts sd
  LEFT JOIN public.schools s
    ON s.district_code = sd.district_code
   AND s.is_active = TRUE
  LEFT JOIN public.vw_school_quality_latest q
    ON q.school_id = s.school_id
  GROUP BY sd.district_code, sd.district_name, sd.sigungu_code
),
score_base AS (
  SELECT
    db.*,
    ae.density_score,
    ae.subject_diversity_score,
    ae.accessibility_score,
    ae.fee_affordability_score,
    ae.data_freshness AS academy_freshness,
    (
      CASE WHEN db.avg_achievement IS NOT NULL THEN db.avg_achievement * 0.30 ELSE 0 END +
      CASE WHEN db.avg_progression IS NOT NULL THEN db.avg_progression * 0.25 ELSE 0 END +
      CASE WHEN db.avg_environment IS NOT NULL THEN db.avg_environment * 0.15 ELSE 0 END +
      CASE WHEN db.avg_safety IS NOT NULL THEN db.avg_safety * 0.15 ELSE 0 END +
      CASE WHEN db.avg_program IS NOT NULL THEN db.avg_program * 0.15 ELSE 0 END
    )::NUMERIC(10, 4) AS school_weighted_sum,
    (
      CASE WHEN db.avg_achievement IS NOT NULL THEN 0.30 ELSE 0 END +
      CASE WHEN db.avg_progression IS NOT NULL THEN 0.25 ELSE 0 END +
      CASE WHEN db.avg_environment IS NOT NULL THEN 0.15 ELSE 0 END +
      CASE WHEN db.avg_safety IS NOT NULL THEN 0.15 ELSE 0 END +
      CASE WHEN db.avg_program IS NOT NULL THEN 0.15 ELSE 0 END
    )::NUMERIC(10, 4) AS school_weight_sum,
    (
      CASE WHEN ae.density_score IS NOT NULL THEN ae.density_score * 0.35 ELSE 0 END +
      CASE WHEN ae.subject_diversity_score IS NOT NULL THEN ae.subject_diversity_score * 0.25 ELSE 0 END +
      CASE WHEN ae.accessibility_score IS NOT NULL THEN ae.accessibility_score * 0.20 ELSE 0 END +
      CASE WHEN ae.fee_affordability_score IS NOT NULL THEN ae.fee_affordability_score * 0.20 ELSE 0 END
    )::NUMERIC(10, 4) AS academy_weighted_sum,
    (
      CASE WHEN ae.density_score IS NOT NULL THEN 0.35 ELSE 0 END +
      CASE WHEN ae.subject_diversity_score IS NOT NULL THEN 0.25 ELSE 0 END +
      CASE WHEN ae.accessibility_score IS NOT NULL THEN 0.20 ELSE 0 END +
      CASE WHEN ae.fee_affordability_score IS NOT NULL THEN 0.20 ELSE 0 END
    )::NUMERIC(10, 4) AS academy_weight_sum
  FROM district_base db
  LEFT JOIN public.vw_academy_ecosystem_by_sigungu ae
    ON ae.sigungu_code = db.sigungu_code
),
score_calc AS (
  SELECT
    sb.*,
    CASE
      WHEN sb.school_weight_sum > 0 THEN ROUND((sb.school_weighted_sum / sb.school_weight_sum)::NUMERIC, 2)
      ELSE NULL
    END AS school_quality_score,
    CASE
      WHEN sb.academy_weight_sum > 0 THEN ROUND((sb.academy_weighted_sum / sb.academy_weight_sum)::NUMERIC, 2)
      ELSE NULL
    END AS academy_ecosystem_score,
    CASE
      WHEN sb.school_count > 0 THEN ROUND((sb.schools_with_location::NUMERIC / sb.school_count::NUMERIC) * 100, 2)
      ELSE NULL
    END AS location_coverage_pct
  FROM score_base sb
),
final_base AS (
  SELECT
    sc.district_code,
    sc.district_name,
    sc.school_count,
    sc.school_quality_score,
    sc.academy_ecosystem_score,
    CASE
      WHEN sc.location_coverage_pct IS NULL THEN NULL
      ELSE LEAST(100, GREATEST(0, ROUND(40 + sc.location_coverage_pct * 0.6, 2)))
    END AS commute_safety_score,
    CASE
      WHEN sc.school_count = 0 THEN 0
      ELSE ROUND((sc.schools_with_official::NUMERIC / sc.school_count::NUMERIC) * 100, 2)
    END AS official_coverage_pct,
    GREATEST(
      COALESCE(sc.quality_freshness, to_timestamp(0)),
      COALESCE(sc.academy_freshness, to_timestamp(0)),
      COALESCE(sc.district_freshness, to_timestamp(0))
    ) AS data_freshness,
    sc.density_score,
    sc.subject_diversity_score,
    sc.accessibility_score,
    sc.fee_affordability_score
  FROM score_calc sc
),
scored AS (
  SELECT
    fb.*,
    LEAST(100, GREATEST(0, ROUND(100 - fb.official_coverage_pct, 2))) AS inferred_ratio_pct,
    (
      CASE WHEN fb.school_quality_score IS NOT NULL THEN fb.school_quality_score * 0.45 ELSE 0 END +
      CASE WHEN fb.academy_ecosystem_score IS NOT NULL THEN fb.academy_ecosystem_score * 0.35 ELSE 0 END +
      CASE WHEN fb.commute_safety_score IS NOT NULL THEN fb.commute_safety_score * 0.20 ELSE 0 END
    )::NUMERIC(10, 4) AS overall_weighted_sum,
    (
      CASE WHEN fb.school_quality_score IS NOT NULL THEN 0.45 ELSE 0 END +
      CASE WHEN fb.academy_ecosystem_score IS NOT NULL THEN 0.35 ELSE 0 END +
      CASE WHEN fb.commute_safety_score IS NOT NULL THEN 0.20 ELSE 0 END
    )::NUMERIC(10, 4) AS overall_weight_sum
  FROM final_base fb
)
SELECT
  s.district_code,
  s.district_name,
  s.school_count,
  s.school_quality_score,
  s.academy_ecosystem_score,
  s.commute_safety_score,
  CASE
    WHEN s.overall_weight_sum > 0 THEN ROUND((s.overall_weighted_sum / s.overall_weight_sum)::NUMERIC, 2)
    ELSE NULL
  END AS overall_score,
  ROUND(s.official_coverage_pct, 2) AS official_confidence,
  ROUND(GREATEST(0, 100 - s.inferred_ratio_pct * 1.5), 2) AS inferred_confidence,
  ROUND(
    s.official_coverage_pct * 0.7 + GREATEST(0, 100 - s.inferred_ratio_pct * 1.5) * 0.3,
    2
  ) AS confidence_score,
  'v2.0.0'::TEXT AS formula_version,
  s.data_freshness,
  ROUND(s.official_coverage_pct, 2) AS official_coverage_pct,
  ROUND(s.inferred_ratio_pct, 2) AS inferred_ratio_pct,
  ARRAY_REMOVE(
    ARRAY[
      CASE WHEN s.school_count = 0 THEN 'missing_metrics' END,
      CASE WHEN s.official_coverage_pct < 95 THEN 'insufficient_official_data' END,
      CASE WHEN s.inferred_ratio_pct > 20 THEN 'high_inferred_ratio' END,
      CASE WHEN s.data_freshness < NOW() - INTERVAL '45 days' THEN 'stale_data' END
    ],
    NULL
  )::TEXT[] AS quality_flags
FROM scored s;

CREATE OR REPLACE FUNCTION public.get_school_analysis_preview(
  p_district_code TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS SETOF public.vw_school_analysis_preview
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.vw_school_analysis_preview
  WHERE p_district_code IS NULL OR district_code = p_district_code
  ORDER BY overall_score DESC NULLS LAST, district_code
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
$$;

REVOKE ALL ON FUNCTION public.get_school_analysis_preview(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_analysis_preview(TEXT, INT) TO anon, authenticated, service_role;
