-- Fix get_payments_page RPC to include amount_paid in its return type and SELECT.
-- The original CREATE OR REPLACE missed this column, causing partial payment UI
-- to always see 0 for amount_paid on both web and mobile.

DROP FUNCTION IF EXISTS public.get_payments_page(uuid, integer, integer, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_payments_page(
  owner_id uuid,
  p_month integer,
  p_year integer,
  status_filter text DEFAULT 'all',
  search_term text DEFAULT '',
  page_size integer DEFAULT 50,
  page_offset integer DEFAULT 0
)
RETURNS TABLE(
  id bigint,
  tenant_id bigint,
  month integer,
  year integer,
  rent_amount numeric,
  extra_charges numeric,
  total_amount numeric,
  amount_paid numeric,
  due_date date,
  status text,
  paid_at timestamp with time zone,
  submitted_at timestamp with time zone,
  verified_at timestamp with time zone,
  reminder_sent boolean,
  payment_token text,
  payment_method text,
  payment_code text,
  screenshot_path text,
  utr_number text,
  verification_notes text,
  tenant_name text,
  tenant_mobile_number text,
  room_number text,
  rent_amount_room numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT
      $1 AS owner_id,
      $2 AS month,
      $3 AS year,
      COALESCE(NULLIF(btrim($4), ''), 'all') AS status_filter,
      replace(
        replace(
          replace(NULLIF(btrim($5), ''), '\', '\\'),
          '%', '\%'
        ),
        '_', '\_'
      ) AS search_pattern,
      NULLIF(btrim($5), '') AS search_term_raw,
      LEAST(GREATEST(COALESCE($6, 50), 0), 50) AS page_size,
      GREATEST(COALESCE($7, 0), 0) AS page_offset
    WHERE $1 = auth.uid()
  )
  SELECT
    p.id,
    p.tenant_id,
    p.month,
    p.year,
    p.rent_amount,
    p.extra_charges,
    p.total_amount,
    p.amount_paid,
    p.due_date,
    p.status,
    p.paid_at,
    p.submitted_at,
    p.verified_at,
    p.reminder_sent,
    p.payment_token::text,
    p.payment_method,
    p.payment_code,
    p.screenshot_path,
    p.utr_number,
    p.verification_notes,
    t.name AS tenant_name,
    t.mobile_number AS tenant_mobile_number,
    r.room_number,
    r.rent_amount AS rent_amount_room
  FROM params prm
  JOIN public.payments p ON p.owner_id = prm.owner_id
  LEFT JOIN public.tenants_table t ON t.id = p.tenant_id
  LEFT JOIN public.rooms_table r ON r.id = t.room_id
  WHERE p.month = prm.month
    AND p.year = prm.year
    AND (prm.status_filter = 'all' OR p.status = prm.status_filter)
    AND (
      prm.search_pattern IS NULL
      OR t.name ILIKE '%' || prm.search_pattern || '%' ESCAPE '\'
      OR lower(r.room_number) = lower(prm.search_term_raw)
      OR t.mobile_number ILIKE '%' || prm.search_pattern || '%' ESCAPE '\'
      OR t.mobile_number_normalized ILIKE '%' || prm.search_pattern || '%' ESCAPE '\'
      OR p.utr_number ILIKE '%' || prm.search_pattern || '%' ESCAPE '\'
      OR p.payment_code ILIKE '%' || prm.search_pattern || '%' ESCAPE '\'
    )
  ORDER BY p.due_date DESC, p.id DESC
  LIMIT (SELECT page_size FROM params)
  OFFSET (SELECT page_offset FROM params);
$function$;
