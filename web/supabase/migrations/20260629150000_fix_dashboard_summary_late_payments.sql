-- Migration to update public.get_dashboard_summary
-- Ensures late payments from previous months are counted in pending amount, pending count, and late count.

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(owner_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      $1 AS owner_id,
      EXTRACT(MONTH FROM CURRENT_DATE)::int AS current_month,
      EXTRACT(YEAR FROM CURRENT_DATE)::int AS current_year
    WHERE $1 = auth.uid()
  )
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'current_month', p.current_month,
        'current_year', p.current_year,
        'total_active_tenants', (
          SELECT COUNT(*)::int
          FROM public.tenants_table t
          WHERE t.owner_id = p.owner_id
            AND t.status = 'active'
        ),
        'paid_amount_this_month', (
          SELECT COALESCE(SUM(pay.amount_paid), 0)
          FROM public.payments pay
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
        ),
        'pending_payment_count_this_month', (
          SELECT COUNT(*)::int
          FROM public.payments pay
          WHERE pay.owner_id = p.owner_id
            AND (
              (pay.month = p.current_month AND pay.year = p.current_year AND pay.status IN ('pending', 'submitted', 'rejected'))
              OR pay.status = 'late'
            )
        ),
        'pending_amount_this_month', (
          SELECT COALESCE(SUM(GREATEST(pay.total_amount - pay.amount_paid, 0)), 0)
          FROM public.payments pay
          WHERE pay.owner_id = p.owner_id
            AND (
              (pay.month = p.current_month AND pay.year = p.current_year AND pay.status IN ('pending', 'submitted', 'rejected'))
              OR pay.status = 'late'
            )
        ),
        'late_payment_count_this_month', (
          SELECT COUNT(*)::int
          FROM public.payments pay
          WHERE pay.owner_id = p.owner_id
            AND pay.status = 'late'
        ),
        'payment_status_counts', (
          SELECT jsonb_build_object(
            'paid', COUNT(*) FILTER (WHERE pay.status = 'paid')::int,
            'pending', COUNT(*) FILTER (WHERE pay.status = 'pending')::int,
            'late', COUNT(*) FILTER (WHERE pay.status = 'late')::int,
            'submitted', COUNT(*) FILTER (WHERE pay.status = 'submitted')::int,
            'rejected', COUNT(*) FILTER (WHERE pay.status = 'rejected')::int
          )
          FROM public.payments pay
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
        ),
        'bed_stats', (
          SELECT jsonb_build_object(
            'total', COALESCE(SUM(r.total_beds), 0),
            'occupied', COALESCE(SUM(r.occupied_beds), 0),
            'vacant', GREATEST(COALESCE(SUM(r.total_beds), 0) - COALESCE(SUM(r.occupied_beds), 0), 0)
          )
          FROM public.pg_details pg
          JOIN public.rooms_table r ON r.pg_id = pg.id
          WHERE pg.owner_id = p.owner_id
        ),
        'pending_complaints_count', (
          SELECT COUNT(*)::int
          FROM public.complaints c
          WHERE c.owner_id = p.owner_id
            AND c.status = 'Under Working'
        ),
        'chatbot_enabled', (
          SELECT COALESCE(o.chatbot_enabled, false)
          FROM public.pg_owners o
          WHERE o.id = p.owner_id
        ),
        'pg_id', (
          SELECT pg.id
          FROM public.pg_details pg
          WHERE pg.owner_id = p.owner_id
          LIMIT 1
        )
      )
      FROM params p
    ),
    jsonb_build_object(
      'current_month', EXTRACT(MONTH FROM CURRENT_DATE)::int,
      'current_year', EXTRACT(YEAR FROM CURRENT_DATE)::int,
      'total_active_tenants', 0,
      'paid_amount_this_month', 0,
      'pending_payment_count_this_month', 0,
      'pending_amount_this_month', 0,
      'late_payment_count_this_month', 0,
      'payment_status_counts', jsonb_build_object('paid', 0, 'pending', 0, 'late', 0, 'submitted', 0, 'rejected', 0),
      'bed_stats', jsonb_build_object('total', 0, 'occupied', 0, 'vacant', 0),
      'pending_complaints_count', 0,
      'chatbot_enabled', false,
      'pg_id', NULL
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(uuid) TO authenticated;
