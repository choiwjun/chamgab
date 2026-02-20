-- Phase 7: School Analysis analytical views

DROP VIEW IF EXISTS public.vw_school_analysis_preview;
DROP VIEW IF EXISTS public.vw_academy_ecosystem_by_sigungu;
DROP VIEW IF EXISTS public.vw_school_quality_latest;

CREATE VIEW public.vw_school_quality_latest AS
WITH latest_metric AS (
  SELECT DISTINCT ON (smo.school_id)
    smo.school_id,
    smo.metric_year,
    smo.metric_term,
    smo.metrics,
    COALESCE(smo.source_updated_at, smo.updated_at) AS source_updated_at
  FROM public.school_metrics_official smo
  ORDER BY smo.school_id, smo.metric_year DESC, smo.metric_term DESC, smo.updated_at DESC
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
  lm.source_updated_at
FROM public.schools s
LEFT JOIN latest_metric lm
  ON lm.school_id = s.school_id
LEFT JOIN latest_progression lp
  ON lp.school_id = s.school_id;

CREATE VIEW public.vw_academy_ecosystem_by_sigungu AS
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
  data_freshness
FROM agg;

CREATE VIEW public.vw_school_analysis_preview AS
WITH district_rollup AS (
  SELECT
    sd.district_code,
    sd.district_name,
    sd.sigungu_code,
    COUNT(DISTINCT s.school_id) AS school_count,
    COUNT(DISTINCT CASE WHEN q.achievement_score IS NOT NULL THEN s.school_id END) AS schools_with_official,
    AVG(
      (
        COALESCE(q.achievement_score, 0) * 0.30 +
        COALESCE(q.progression_outcome_score, 0) * 0.25 +
        COALESCE(q.education_environment_score, 0) * 0.15 +
        COALESCE(q.safety_life_score, 0) * 0.15 +
        COALESCE(q.program_score, 0) * 0.15
      )
    )::NUMERIC(6, 2) AS school_quality_score,
    MAX(q.source_updated_at) AS quality_freshness
  FROM public.school_districts sd
  LEFT JOIN public.schools s
    ON s.district_code = sd.district_code
  LEFT JOIN public.vw_school_quality_latest q
    ON q.school_id = s.school_id
  GROUP BY sd.district_code, sd.district_name, sd.sigungu_code
)
SELECT
  dr.district_code,
  dr.district_name,
  dr.school_count,
  ROUND(COALESCE(dr.school_quality_score, 0), 2) AS school_quality_score,
  ROUND(
    COALESCE(
      ae.density_score * 0.35 +
      ae.subject_diversity_score * 0.25 +
      70 * 0.20 +
      COALESCE(ae.fee_affordability_score, 55) * 0.20,
      0
    ),
    2
  ) AS academy_ecosystem_score,
  70::NUMERIC(5, 2) AS commute_safety_score,
  ROUND(
    COALESCE(dr.school_quality_score, 0) * 0.45 +
    COALESCE(
      ae.density_score * 0.35 +
      ae.subject_diversity_score * 0.25 +
      70 * 0.20 +
      COALESCE(ae.fee_affordability_score, 55) * 0.20,
      0
    ) * 0.35 +
    70 * 0.20,
    2
  ) AS overall_score,
  ROUND(
    CASE
      WHEN dr.school_count = 0 THEN 0
      ELSE LEAST(100, (dr.schools_with_official::NUMERIC / dr.school_count) * 100)
    END,
    2
  ) AS official_confidence,
  ROUND(
    LEAST(
      100,
      GREATEST(
        25,
        COALESCE(ae.subject_diversity_score, 40)
      )
    ),
    2
  ) AS inferred_confidence,
  ROUND(
    (
      CASE
        WHEN dr.school_count = 0 THEN 0
        ELSE LEAST(100, (dr.schools_with_official::NUMERIC / dr.school_count) * 100)
      END
    ) * 0.7
    +
    LEAST(100, GREATEST(25, COALESCE(ae.subject_diversity_score, 40))) * 0.3,
    2
  ) AS confidence_score,
  'v1.0.0'::TEXT AS formula_version,
  GREATEST(
    COALESCE(dr.quality_freshness, to_timestamp(0)),
    COALESCE(ae.data_freshness, to_timestamp(0)),
    COALESCE(sd.source_updated_at, sd.updated_at, to_timestamp(0))
  ) AS data_freshness
FROM district_rollup dr
JOIN public.school_districts sd
  ON sd.district_code = dr.district_code
LEFT JOIN public.vw_academy_ecosystem_by_sigungu ae
  ON ae.sigungu_code = dr.sigungu_code;
