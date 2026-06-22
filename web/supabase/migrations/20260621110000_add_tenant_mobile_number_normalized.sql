-- Normalize tenant mobile numbers for direct public portal identity lookup.
-- Stores the last 10 digits only, matching the existing JavaScript comparison behavior.
-- This migration backfills existing tenants and keeps the column current with a trigger.

CREATE OR REPLACE FUNCTION public.normalize_mobile_last10(p_mobile text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN digits.clean_digits IS NULL OR length(digits.clean_digits) < 10 THEN NULL
    ELSE right(digits.clean_digits, 10)
  END
  FROM (
    SELECT NULLIF(regexp_replace(p_mobile, '\D', '', 'g'), '') AS clean_digits
  ) AS digits;
$$;

ALTER TABLE public.tenants_table
  ADD COLUMN IF NOT EXISTS mobile_number_normalized text;

UPDATE public.tenants_table
SET mobile_number_normalized = public.normalize_mobile_last10(mobile_number)
WHERE mobile_number IS NOT NULL
  AND mobile_number_normalized IS DISTINCT FROM public.normalize_mobile_last10(mobile_number);

CREATE OR REPLACE FUNCTION public.set_tenant_mobile_number_normalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.mobile_number_normalized := public.normalize_mobile_last10(NEW.mobile_number);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tenant_mobile_number_normalized ON public.tenants_table;

CREATE TRIGGER set_tenant_mobile_number_normalized
BEFORE INSERT OR UPDATE OF mobile_number ON public.tenants_table
FOR EACH ROW
EXECUTE FUNCTION public.set_tenant_mobile_number_normalized();

CREATE INDEX IF NOT EXISTS tenants_table_owner_mobile_normalized_status_idx
  ON public.tenants_table (owner_id, mobile_number_normalized, status);

COMMENT ON COLUMN public.tenants_table.mobile_number_normalized
  IS 'Last 10 digits of mobile_number for direct tenant identity lookup in public payment and complaint portals.';
