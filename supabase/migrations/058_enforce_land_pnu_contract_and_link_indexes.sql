-- Enforce operational PNU contract and speed up land linking workloads.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'land_parcels_pnu_19_digits_chk'
      AND conrelid = 'public.land_parcels'::regclass
  ) THEN
    ALTER TABLE public.land_parcels
      ADD CONSTRAINT land_parcels_pnu_19_digits_chk
      CHECK (pnu ~ '^[0-9]{19}$')
      NOT VALID;
  END IF;
END;
$$;

COMMENT ON CONSTRAINT land_parcels_pnu_19_digits_chk ON public.land_parcels
  IS 'Operational contract: 19-digit PNU only (법정동코드10 + 산여부1 + 본번4 + 부번4)';

CREATE INDEX IF NOT EXISTS idx_land_transactions_unlinked_lookup
  ON public.land_transactions (sigungu, transaction_date DESC, id)
  WHERE parcel_id IS NULL
    AND is_cancelled = FALSE
    AND is_partial_sale = FALSE;

CREATE INDEX IF NOT EXISTS idx_land_parcels_link_key
  ON public.land_parcels (sigungu, sido, eupmyeondong, jibun, id);
