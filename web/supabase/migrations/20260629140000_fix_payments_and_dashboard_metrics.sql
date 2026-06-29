-- Migration to support amount_paid in payments page and correct dashboard aggregates
-- Matches requirements: 2, 3, 5, 6, 7

CREATE OR REPLACE FUNCTION public.get_payments_page(
  owner_id uuid,
  p_month integer,
  p_year integer,
  status_filter text DEFAULT 'all',
  search_term text DEFAULT '',
  page_size integer DEFAULT 50,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
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
  paid_at timestamptz,
  submitted_at timestamptz,
  verified_at timestamptz,
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
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_payments_page(uuid, integer, integer, text, text, integer, integer) TO authenticated;


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
            AND pay.month = p.current_month
            AND pay.year = p.current_year
            AND pay.status IN ('pending', 'late', 'submitted', 'rejected')
        ),
        'pending_amount_this_month', (
          SELECT COALESCE(SUM(GREATEST(pay.total_amount - pay.amount_paid, 0)), 0)
          FROM public.payments pay
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
            AND pay.status IN ('pending', 'late', 'submitted', 'rejected')
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

GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(uuid) TO authenticated;


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
        ELSE '₹' || trim(to_char(p.total_amount - p.amount_paid, 'FM999G999G999G999G990'))
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
        'amount_paid', p.amount_paid,
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
    JOIN public.reminders_table r ON r.owner_id = prm.owner_id
    LEFT JOIN public.tenants_table t ON t.id = r.tenant_id
    WHERE COALESCE(r.sent_at, r.updated_at) >= now() - interval '7 days'
  ),
  complaint_activity AS (
    SELECT
      ('comp-' || c.id::text) AS id,
      'complaint' AS type,
      COALESCE(t.name, 'Anonymous Complaint') AS tenant,
      c.complaint_message AS action,
      CASE
        WHEN c.status = 'Resolved' THEN 'success'
        ELSE 'late'
      END AS status,
      NULL::text AS amount,
      c.created_at AS occurred_at,
      jsonb_build_object(
        'id', c.id,
        'owner_id', c.owner_id,
        'tenant_phone', c.tenant_phone,
        'complaint_message', c.complaint_message,
        'status', c.status,
        'owner_response', c.owner_response,
        'created_at', c.created_at,
        'updated_at', c.updated_at
      ) AS raw_item
    FROM params prm
    JOIN public.complaints c ON c.owner_id = prm.owner_id
    LEFT JOIN public.tenants_table t ON t.mobile_number = c.tenant_phone
    WHERE c.created_at >= now() - interval '7 days'
  ),
  all_activities AS (
    SELECT id, type, tenant, action, status, amount, occurred_at, raw_item FROM payment_activity
    UNION ALL
    SELECT id, type, tenant, action, status, amount, occurred_at, raw_item FROM reminder_activity
    UNION ALL
    SELECT id, type, tenant, action, status, amount, occurred_at, raw_item FROM complaint_activity
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', act.id,
        'type', act.type,
        'tenant', act.tenant,
        'action', act.action,
        'status', act.status,
        'amount', act.amount,
        'occurred_at', act.occurred_at,
        'raw_item', act.raw_item
      )
      ORDER BY act.occurred_at DESC
      LIMIT (SELECT limit_count FROM params)
    ),
    '[]'::jsonb
  )
  FROM all_activities act;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_recent_activity(uuid, integer) TO authenticated;
