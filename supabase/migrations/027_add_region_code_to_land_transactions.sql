-- @TASK P6-LAND-DATA-1 - Align land_transactions schema with collector script
-- The land transaction collector stores the 5-digit lawd code ("LAWD_CD").

ALTER TABLE public.land_transactions
  ADD COLUMN IF NOT EXISTS region_code VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_land_transactions_region_code
  ON public.land_transactions (region_code);

COMMENT ON COLUMN public.land_transactions.region_code IS '법정동 코드 (5자리) - LAWD_CD';

