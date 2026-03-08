-- Migration 061: align school official coverage semantics across API and quality views

CREATE OR REPLACE VIEW public.vw_school_quality_latest AS
WITH metric_ranked AS (
  SELECT
    smo.school_id,
    smo.metric_year,
    smo.metric_term,
    smo.metrics,
    COALESCE(smo.source_updated_at, smo.updated_at) AS source_updated_at,
    (
      CASE WHEN NULLIF(smo.metrics->>'achievement_score', '') IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN NULLIF(smo.metrics->>'progression_outcome_score', '') IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN NULLIF(smo.metrics->>'education_environment_score', '') IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN NULLIF(smo.metrics->>'safety_life_score', '') IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN NULLIF(smo.metrics->>'program_score', '') IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN NULLIF(smo.metrics->>'grad_rate', '') IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN NULLIF(smo.metrics->>'avg_class_size', '') IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN NULLIF(smo.metrics->>'total_students', '') IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN NULLIF(smo.metrics->>'schoolinfo_schul_code', '') IS NOT NULL THEN 1 ELSE 0 END
    ) AS metric_completeness,
    CASE
      WHEN
        NULLIF(smo.metrics->>'achievement_score', '') IS NOT NULL
        OR NULLIF(smo.metrics->>'progression_outcome_score', '') IS NOT NULL
        OR NULLIF(smo.metrics->>'education_environment_score', '') IS NOT NULL
        OR NULLIF(smo.metrics->>'safety_life_score', '') IS NOT NULL
        OR NULLIF(smo.metrics->>'grad_rate', '') IS NOT NULL
        OR NULLIF(smo.metrics->>'avg_class_size', '') IS NOT NULL
        OR NULLIF(smo.metrics->>'total_students', '') IS NOT NULL
        OR NULLIF(smo.metrics->>'schoolinfo_schul_code', '') IS NOT NULL
      THEN 1
      ELSE 0
    END AS has_official_metric_int
  FROM public.school_metrics_official smo
),
latest_metric AS (
  SELECT DISTINCT ON (mr.school_id)
    mr.school_id,
    mr.metric_year,
    mr.metric_term,
    mr.metrics,
    mr.source_updated_at,
    mr.metric_completeness,
    mr.has_official_metric_int
  FROM metric_ranked mr
  ORDER BY
    mr.school_id,
    mr.has_official_metric_int DESC,
    mr.metric_completeness DESC,
    mr.metric_year DESC,
    mr.metric_term DESC,
    mr.source_updated_at DESC
),
latest_progression_year AS (
  SELECT
    school_id,
    MAX(base_year) AS base_year
  FROM public.school_progression_stats
  GROUP BY school_id
),
latest_progression AS (
  SELECT
    sps.school_id,
    MAX(CASE WHEN sps.destination_type = 'general_highschool' THEN sps.progression_rate END) AS general_highschool_rate,
    MAX(CASE WHEN sps.destination_type = 'special_purpose_highschool' THEN sps.progression_rate END) AS special_purpose_highschool_rate,
    MAX(CASE WHEN sps.destination_type = 'autonomy_highschool' THEN sps.progression_rate END) AS autonomy_highschool_rate,
    MAX(CASE WHEN sps.destination_type = 'college' THEN sps.progression_rate END) AS college_progression_rate
  FROM public.school_progression_stats sps
  JOIN latest_progression_year lpy
    ON lpy.school_id = sps.school_id
   AND lpy.base_year = sps.base_year
  GROUP BY sps.school_id
)
SELECT
  s.school_id,
  s.school_name,
  s.school_level,
  s.district_code,
  s.sigungu_code,
  lm.metric_year,
  lm.metric_term,
  NULLIF(lm.metrics->>'achievement_score', '')::NUMERIC(5, 2) AS achievement_score,
  NULLIF(lm.metrics->>'progression_outcome_score', '')::NUMERIC(5, 2) AS progression_outcome_score,
  NULLIF(lm.metrics->>'education_environment_score', '')::NUMERIC(5, 2) AS education_environment_score,
  NULLIF(lm.metrics->>'safety_life_score', '')::NUMERIC(5, 2) AS safety_life_score,
  NULLIF(lm.metrics->>'program_score', '')::NUMERIC(5, 2) AS program_score,
  lp.general_highschool_rate,
  lp.special_purpose_highschool_rate,
  lp.autonomy_highschool_rate,
  lp.college_progression_rate,
  lm.source_updated_at,
  COALESCE(lm.metric_completeness, 0) AS metric_completeness,
  (COALESCE(lm.has_official_metric_int, 0) = 1) AS has_official_metric
FROM public.schools s
LEFT JOIN latest_metric lm
  ON lm.school_id = s.school_id
LEFT JOIN latest_progression lp
  ON lp.school_id = s.school_id;


CREATE OR REPLACE VIEW public.vw_school_analysis_preview AS
WITH district_base AS (
  SELECT
    sd.district_code,
    sd.district_name,
    sd.sigungu_code,
    COUNT(DISTINCT s.school_id) AS school_count,
    COUNT(DISTINCT CASE WHEN COALESCE(q.has_official_metric, FALSE) THEN s.school_id END) AS schools_with_official,
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
