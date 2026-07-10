-- 1. Recreate get_payments_page to support optional pg_id parameter
DROP FUNCTION IF EXISTS public.get_payments_page(uuid, integer, integer, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_payments_page(
  owner_id uuid,
  p_month integer,
  p_year integer,
  status_filter text DEFAULT 'all',
  search_term text DEFAULT '',
  page_size integer DEFAULT 50,
  page_offset integer DEFAULT 0,
  p_pg_id integer DEFAULT NULL
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
      $8 AS p_pg_id
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
    AND (prm.p_pg_id IS NULL OR t.pg_id = prm.p_pg_id)
    AND (prm.status_filter = 'all' OR p.status = prm.status_filter)
    AND (
      prm.search_pattern IS NULL
      OR t.name ILIKE '%' || prm.search_pattern || '%' ESCAPE '\'
      OR lower(r.room_number) = lower(prm.search_term_raw)
    )
  ORDER BY p.due_date DESC, p.id DESC
  LIMIT LEAST(GREATEST(COALESCE($6, 50), 0), 50)
  OFFSET GREATEST(COALESCE($7, 0), 0);
$function$;

GRANT EXECUTE ON FUNCTION public.get_payments_page(uuid, integer, integer, text, text, integer, integer, integer) TO authenticated;

-- 2. Recreate get_payment_month_summary to support optional pg_id parameter
DROP FUNCTION IF EXISTS public.get_payment_month_summary(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_payment_month_summary(owner_id uuid, p_month integer, p_year integer, p_pg_id integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT $1 AS owner_id, $2 AS month, $3 AS year, $4 AS p_pg_id
    WHERE $1 = auth.uid()
  )
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'month', prm.month,
        'year', prm.year,
        'total_collected', COALESCE(SUM(COALESCE(p.amount_paid, 0)), 0),
        'total_pending', COALESCE(SUM(GREATEST(p.total_amount - COALESCE(p.amount_paid, 0), 0)) FILTER (WHERE p.status = 'pending'), 0),
        'total_late', COALESCE(SUM(GREATEST(p.total_amount - COALESCE(p.amount_paid, 0), 0)) FILTER (WHERE p.status = 'late'), 0),
        'total_submitted', COALESCE(SUM(GREATEST(p.total_amount - COALESCE(p.amount_paid, 0), 0)) FILTER (WHERE p.status = 'submitted'), 0)
      )
      FROM params prm
      LEFT JOIN public.payments p
        ON p.owner_id = prm.owner_id
        AND p.month = prm.month
        AND p.year = prm.year
      LEFT JOIN public.tenants_table t ON t.id = p.tenant_id
      WHERE (prm.p_pg_id IS NULL OR t.pg_id = prm.p_pg_id)
      GROUP BY prm.month, prm.year
    ),
    jsonb_build_object(
      'month', p_month, 'year', p_year,
      'total_collected', 0, 'total_pending', 0, 'total_late', 0, 'total_submitted', 0
    )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.get_payment_month_summary(uuid, integer, integer, integer) TO authenticated;
