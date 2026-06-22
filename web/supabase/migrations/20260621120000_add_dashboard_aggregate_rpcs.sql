-- Dashboard aggregate RPCs for production-scale owner dashboards.
-- These functions return pre-aggregated dashboard data so web/mobile clients do
-- not need to fetch full tenants/payments/reminders/complaints datasets for
-- summary cards, payment status charts, collection charts, or recent activity.
--
-- ============================================================================
-- VERIFICATION NOTES (spec: dashboard-server-aggregation, task 1.1)
-- Verified against design.md "Components & Interfaces" RPC contract.
-- Requirements: 8.1, 8.2, 8.3, 4.1, 4.2, 14.1
--
-- Three functions present and verified (NO SQL semantics changed):
--   1. get_dashboard_summary(owner_id uuid) -> jsonb
--   2. get_dashboard_monthly_collection(owner_id uuid, months_back integer DEFAULT 6) -> jsonb
--   3. get_dashboard_recent_activity(owner_id uuid, limit_count integer DEFAULT 7) -> jsonb
--
-- Each function confirmed:
--   * LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public  (Req 14.1, 8.1)
--   * Owner-isolation guard "WHERE $1 = auth.uid()" inside the params CTE, so a
--     JWT subject mismatch yields the empty/zero default rather than another
--     owner's data (Req 4.1, 4.2).
--   * GRANT EXECUTE ... TO authenticated present at end of file (Req 8.2):
--       - public.get_dashboard_summary(uuid)
--       - public.get_dashboard_monthly_collection(uuid, integer)
--       - public.get_dashboard_recent_activity(uuid, integer)
--
-- Status definitions (pending/late/submitted/paid/rejected) and the
-- month/year billing window are used unchanged. This is documentation only;
-- no business logic or SQL semantics were modified by task 1.1.
-- ============================================================================

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
          SELECT COALESCE(SUM(pay.total_amount), 0)
          FROM public.payments pay
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
            AND pay.status = 'paid'
        ),
        'pending_payment_count_this_month', (
          SELECT COUNT(*)::int
          FROM public.payments pay
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
            AND pay.status = 'pending'
        ),
        'pending_amount_this_month', (
          SELECT COALESCE(SUM(pay.total_amount), 0)
          FROM public.payments pay
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
            AND pay.status = 'pending'
        ),
        'late_payment_count_this_month', (
          SELECT COUNT(*)::int
          FROM public.payments pay
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
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

CREATE OR REPLACE FUNCTION public.get_dashboard_monthly_collection(owner_id uuid, months_back integer DEFAULT 6)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      $1 AS owner_id,
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
      SUM(p.total_amount) FILTER (WHERE p.status = 'paid') AS collected,
      SUM(p.total_amount) FILTER (WHERE p.status IN ('pending', 'late')) AS pending
    FROM public.payments p
    JOIN params prm ON prm.owner_id = p.owner_id
    WHERE p.month = mw.month_number
      AND p.year = mw.year_number
  ) pay ON true;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity(owner_id uuid, limit_count integer DEFAULT 7)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      $1 AS owner_id,
      GREATEST(1, LEAST(COALESCE($2, 7), 50)) AS limit_count
    WHERE $1 = auth.uid()
  ),
  payment_activity AS (
    SELECT
      ('pay-' || p.id::text) AS id,
      'payment' AS type,
      COALESCE(t.name, 'Unknown Tenant') AS tenant,
      CASE
        WHEN p.status = 'late' THEN 'Late payment'
        WHEN p.status = 'pending' THEN 'Payment pending'
        WHEN p.status = 'submitted' THEN 'Payment under review'
        WHEN p.status = 'paid' THEN 'Rent paid'
        ELSE 'Payment processed'
      END AS action,
      CASE
        WHEN p.status = 'late' THEN 'late'
        WHEN p.status IN ('pending', 'submitted', 'rejected') THEN 'pending'
        ELSE 'success'
      END AS status,
      CASE
        WHEN p.total_amount IS NULL THEN NULL
        ELSE '₹' || trim(to_char(p.total_amount, 'FM999G999G999G999G990'))
      END AS amount,
      COALESCE(p.submitted_at, p.paid_at, p.created_at) AS occurred_at,
      jsonb_build_object(
        'id', p.id,
        'tenant_id', p.tenant_id,
        'owner_id', p.owner_id,
        'month', p.month,
        'year', p.year,
        'total_amount', p.total_amount,
        'amount', p.total_amount,
        'due_date', p.due_date,
        'status', p.status,
        'paid_at', p.paid_at,
        'submitted_at', p.submitted_at,
        'screenshot_path', p.screenshot_path,
        'utr_number', p.utr_number,
        'verification_notes', p.verification_notes,
        'payment_method', p.payment_method,
        'payment_code', p.payment_code,
        'tenants_table', jsonb_build_object(
          'name', COALESCE(t.name, 'Unknown Tenant'),
          'mobile_number', t.mobile_number,
          'rooms_table', jsonb_build_object('room_number', r.room_number, 'rent_amount', r.rent_amount)
        )
      ) AS raw_item
    FROM params prm
    JOIN public.payments p ON p.owner_id = prm.owner_id
    LEFT JOIN public.tenants_table t ON t.id = p.tenant_id
    LEFT JOIN public.rooms_table r ON r.id = t.room_id
    WHERE COALESCE(p.submitted_at, p.paid_at, p.created_at) >= now() - interval '7 days'
  ),
  reminder_activity AS (
    SELECT
      ('rem-' || r.id::text) AS id,
      'reminder' AS type,
      COALESCE(t.name, 'Unknown Tenant') AS tenant,
      'Reminder sent' || CASE WHEN r.sent_via IS NOT NULL THEN ' via ' || r.sent_via::text ELSE '' END AS action,
      'pending' AS status,
      NULL::text AS amount,
      COALESCE(r.sent_at, r.updated_at)::timestamp with time zone AS occurred_at,
      jsonb_build_object(
        'id', r.id,
        'tenant_id', r.tenant_id,
        'message', r.message,
        'sent_via', r.sent_via,
        'sent_at', r.sent_at,
        'status', r.status
      ) AS raw_item
    FROM params prm
    JOIN public.reminders r ON r.owner_id = prm.owner_id
    LEFT JOIN public.tenants_table t ON t.id = r.tenant_id
    WHERE COALESCE(r.sent_at, r.updated_at)::timestamp with time zone >= now() - interval '7 days'
  ),
  complaint_activity AS (
    SELECT
      ('comp-' || c.id::text) AS id,
      'complaint' AS type,
      'Anonymous Complaint' AS tenant,
      c.complaint_message AS action,
      'pending' AS status,
      NULL::text AS amount,
      c.created_at AS occurred_at,
      jsonb_build_object(
        'id', c.id,
        'owner_id', c.owner_id,
        'complaint_message', c.complaint_message,
        'status', c.status,
        'owner_response', c.owner_response,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'tenant_phone', c.tenant_phone
      ) AS raw_item
    FROM params prm
    JOIN public.complaints c ON c.owner_id = prm.owner_id
    WHERE c.status = 'Under Working'
      AND c.created_at >= now() - interval '7 days'
  ),
  combined AS (
    SELECT * FROM payment_activity
    UNION ALL
    SELECT * FROM reminder_activity
    UNION ALL
    SELECT * FROM complaint_activity
  ),
  limited AS (
    SELECT combined.*
    FROM combined
    ORDER BY occurred_at DESC
    LIMIT (SELECT limit_count FROM params)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'type', type,
        'tenant', tenant,
        'action', action,
        'amount', amount,
        'status', status,
        'occurred_at', occurred_at,
        'raw_item', raw_item
      )
      ORDER BY occurred_at DESC
    ),
    '[]'::jsonb
  )
  FROM limited;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_monthly_collection(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_recent_activity(uuid, integer) TO authenticated;
