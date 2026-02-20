-- Migration 046: Extend school_progression_stats destination_type CHECK constraint
-- Adds university-level breakdown types for high schools:
--   college_sky     : SKY 3개교 (서울대/연세대/고려대)
--   college_medical : 의치한약수 (의대/치대/한의대/약대/수의대)
--   college_seoul   : 인서울 4년제 (SKY·의치한약수 제외)
--   college_national: 지방거점국립대 (부산대/경북대/전남대 등)

ALTER TABLE public.school_progression_stats
  DROP CONSTRAINT IF EXISTS school_progression_stats_destination_type_check;

ALTER TABLE public.school_progression_stats
  ADD CONSTRAINT school_progression_stats_destination_type_check
  CHECK (destination_type IN (
    'general_highschool',
    'special_purpose_highschool',
    'autonomy_highschool',
    'college',
    'college_sky',
    'college_medical',
    'college_seoul',
    'college_national'
  ));
