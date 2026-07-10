-- Migration to update public.get_dashboard_monthly_collection and public.get_payment_month_summary
-- Ensures legacy or fully paid payments (where amount_paid might be 0 or less than total_amount but status is 'paid') are summed correctly as collected/paid.
-- Correctly handles partial payments when calculating pending values.

CREATE OR REPLACE FUNCTION public.get_dashboard_monthly_collection(owner_id uuid, months_back integer DEFAULT 6, p_pg_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      $1 AS owner_id,
      $3 AS pg_id,
      GREATEST(1, LEAST(COALESCE($2, 6), 24)) AS months_back
    WHERE $1 = auth.uid()
  ),
  month_windows AS (
    SELECT
      gs.idx,
      month_start::date AS month_start,
      EXTRACT(MONTH FROM month_start)::int AS month_number,
      EXTRACT(YEAR FROM month_start)::int AS year_number,
      to_char(month_start, 'Mon') AS month_label
    FROM params p
    CROSS JOIN LATERAL generate_series(p.months_back - 1, 0, -1) WITH ORDINALITY AS gs(month_offset, idx)
    CROSS JOIN LATERAL (
      SELECT date_trunc('month', CURRENT_DATE) - (gs.month_offset::int * interval '1 month') AS month_start
    ) d
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'month', mw.month_label,
        'month_number', mw.month_number,
        'year', mw.year_number,
        'collected', COALESCE(pay.collected, 0),
        'pending', COALESCE(pay.pending, 0)
      )
      ORDER BY mw.idx
    ),
    '[]'::jsonb
  )
  FROM month_windows mw
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.total_amount ELSE p.amount_paid END), 0) AS collected,
      COALESCE(SUM(GREATEST(p.total_amount - p.amount_paid, 0)) FILTER (WHERE p.status IN ('pending', 'late', 'submitted', 'rejected')), 0) AS pending
    FROM public.payments p
    JOIN params prm ON prm.owner_id = p.owner_id
    LEFT JOIN public.tenants_table t ON p.tenant_id = t.id
    WHERE p.month = mw.month_number
      AND p.year = mw.year_number
      AND (prm.pg_id IS NULL OR t.pg_id = prm.pg_id)
  ) pay ON true;
$$;


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
        'total_collected', COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.total_amount ELSE p.amount_paid END), 0),
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
