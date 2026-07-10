-- Database migration to support multiple PGs per owner.
-- Applied on: 2026-07-10

-- 1) Drop UNIQUE constraint on pg_details.owner_id to allow one owner to own multiple PGs.
ALTER TABLE public.pg_details DROP CONSTRAINT IF EXISTS pg_details_owner_id_key;

-- 2) Update settings table to be PG-specific rather than owner-wide.
-- Add pg_id column (initially nullable) referencing pg_details(id).
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS pg_id integer REFERENCES public.pg_details(id) ON DELETE CASCADE;

-- Migrate existing settings rows to target their owner's first PG detail record.
UPDATE public.settings s
SET pg_id = p.id
FROM public.pg_details p
WHERE s.owner_id = p.owner_id AND s.pg_id IS NULL;

-- If there are any settings without pg_id (due to orphaned owners), we can either associate them or delete.
-- For safety, we delete any settings that couldn't be associated with a valid PG.
DELETE FROM public.settings WHERE pg_id IS NULL;

-- Now make pg_id NOT NULL and UNIQUE (1 settings row per PG).
ALTER TABLE public.settings ALTER COLUMN pg_id SET NOT NULL;
ALTER TABLE public.settings ADD CONSTRAINT settings_pg_id_key UNIQUE (pg_id);

-- Drop the old unique constraint on owner_id since an owner can now have multiple PGs/settings.
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_owner_id_key;

-- 3) Add pg_id column to complaints table.
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS pg_id integer REFERENCES public.pg_details(id) ON DELETE SET NULL;

-- Update existing complaints where possible by looking up the tenant's pg_id based on phone number and owner_id.
UPDATE public.complaints c
SET pg_id = t.pg_id
FROM public.tenants_table t
WHERE c.owner_id = t.owner_id 
  AND substring(regexp_replace(c.tenant_phone, '\D', '', 'g') from '.{10}$') = substring(regexp_replace(t.mobile_number, '\D', '', 'g') from '.{10}$')
  AND c.pg_id IS NULL;

-- 4) Add pg_id column to leads table.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pg_id integer REFERENCES public.pg_details(id) ON DELETE SET NULL;

-- Migrate existing leads where possible. If there's only one PG, use it.
UPDATE public.leads l
SET pg_id = (SELECT id FROM public.pg_details pg WHERE pg.owner_id = l.owner_id LIMIT 1)
WHERE l.pg_id IS NULL;


-- 5) Recreate public.onboard_new_owner to support multi-PG creation and avoid conflicts
CREATE OR REPLACE FUNCTION public.onboard_new_owner(
  p_full_name text,
  p_pg_name text,
  p_address text,
  p_city text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid := auth.uid();
  v_email text := nullif(auth.jwt() ->> 'email', '');
  v_phone text := nullif(auth.jwt() ->> 'phone', '');
  v_pg_id integer;
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1) Owner profile
  INSERT INTO public.pg_owners (
    id,
    name,
    email,
    mobile_number,
    is_onboarded
  )
  VALUES (
    v_owner_id,
    p_full_name,
    v_email,
    v_phone,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = excluded.name,
    is_onboarded = true,
    email = coalesce(excluded.email, public.pg_owners.email),
    mobile_number = coalesce(excluded.mobile_number, public.pg_owners.mobile_number);

  -- 2) Check if owner already has a PG
  SELECT id INTO v_pg_id FROM public.pg_details WHERE owner_id = v_owner_id LIMIT 1;

  IF v_pg_id IS NOT NULL THEN
    -- Update existing first PG
    UPDATE public.pg_details
    SET
      pg_name = p_pg_name,
      address = p_address,
      city = p_city
    WHERE id = v_pg_id;
  ELSE
    -- Insert new PG
    INSERT INTO public.pg_details (
      owner_id,
      pg_name,
      address,
      city
    )
    VALUES (
      v_owner_id,
      p_pg_name,
      p_address,
      p_city
    )
    RETURNING id INTO v_pg_id;

    -- Insert default settings row for the new PG
    INSERT INTO public.settings (
      owner_id,
      pg_id,
      rent_due_day,
      default_deposit_fees,
      refund_deposit
    )
    VALUES (
      v_owner_id,
      v_pg_id,
      5,
      0,
      0
    )
    ON CONFLICT (pg_id) DO NOTHING;
  END IF;
END;
$$;


-- 6) Recreate dashboard aggregate RPCs with optional pg_id filtering
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(owner_id uuid, p_pg_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      $1 AS owner_id,
      $2 AS pg_id,
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
            AND (p.pg_id IS NULL OR t.pg_id = p.pg_id)
            AND t.deleted_at IS NULL
        ),
        'paid_amount_this_month', (
          SELECT COALESCE(SUM(pay.total_amount), 0)
          FROM public.payments pay
          LEFT JOIN public.tenants_table t ON pay.tenant_id = t.id
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
            AND pay.status = 'paid'
            AND (p.pg_id IS NULL OR t.pg_id = p.pg_id)
        ),
        'pending_payment_count_this_month', (
          SELECT COUNT(*)::int
          FROM public.payments pay
          LEFT JOIN public.tenants_table t ON pay.tenant_id = t.id
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
            AND pay.status = 'pending'
            AND (p.pg_id IS NULL OR t.pg_id = p.pg_id)
        ),
        'pending_amount_this_month', (
          SELECT COALESCE(SUM(pay.total_amount), 0)
          FROM public.payments pay
          LEFT JOIN public.tenants_table t ON pay.tenant_id = t.id
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
            AND pay.status = 'pending'
            AND (p.pg_id IS NULL OR t.pg_id = p.pg_id)
        ),
        'late_payment_count_this_month', (
          SELECT COUNT(*)::int
          FROM public.payments pay
          LEFT JOIN public.tenants_table t ON pay.tenant_id = t.id
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
            AND pay.status = 'late'
            AND (p.pg_id IS NULL OR t.pg_id = p.pg_id)
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
          LEFT JOIN public.tenants_table t ON pay.tenant_id = t.id
          WHERE pay.owner_id = p.owner_id
            AND pay.month = p.current_month
            AND pay.year = p.current_year
            AND (p.pg_id IS NULL OR t.pg_id = p.pg_id)
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
            AND (p.pg_id IS NULL OR pg.id = p.pg_id)
        ),
        'pending_complaints_count', (
          SELECT COUNT(*)::int
          FROM public.complaints c
          WHERE c.owner_id = p.owner_id
            AND c.status = 'Under Working'
            AND (p.pg_id IS NULL OR c.pg_id = p.pg_id)
        ),
        'chatbot_enabled', (
          SELECT COALESCE(o.chatbot_enabled, false)
          FROM public.pg_owners o
          WHERE o.id = p.owner_id
        ),
        'pg_id', COALESCE(
          p.pg_id,
          (
            SELECT pg.id
            FROM public.pg_details pg
            WHERE pg.owner_id = p.owner_id
            LIMIT 1
          )
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
      SUM(p.total_amount) FILTER (WHERE p.status = 'paid') AS collected,
      SUM(p.total_amount) FILTER (WHERE p.status IN ('pending', 'late')) AS pending
    FROM public.payments p
    JOIN params prm ON prm.owner_id = p.owner_id
    LEFT JOIN public.tenants_table t ON p.tenant_id = t.id
    WHERE p.month = mw.month_number
      AND p.year = mw.year_number
      AND (prm.pg_id IS NULL OR t.pg_id = prm.pg_id)
  ) pay ON true;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity(owner_id uuid, limit_count integer DEFAULT 7, p_pg_id integer DEFAULT NULL)
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
        ELSE '₹' || trim(to_char(p.total_amount, 'FM999G999G999G990'))
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
      AND (prm.pg_id IS NULL OR t.pg_id = prm.pg_id)
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
      AND (prm.pg_id IS NULL OR t.pg_id = prm.pg_id)
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
      AND (prm.pg_id IS NULL OR c.pg_id = prm.pg_id)
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

GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_monthly_collection(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_recent_activity(uuid, integer, integer) TO authenticated;
