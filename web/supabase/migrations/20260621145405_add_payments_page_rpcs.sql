-- Payments-page RPCs for production-scale owner payment lists.
-- These functions return one bounded page of payment records and the month-level
-- payment summary so web/mobile clients no longer fetch an owner's full payment
-- history to render the payments list or its summary cards.
--
-- ============================================================================
-- VERIFICATION NOTES (spec: payments-loading-performance, task 1.1)
-- Verified against design.md "Components and Interfaces" RPC contract.
-- Requirements: 1.1-1.7, 2.1-2.3, 3.1-3.9, 5.1-5.4, 5.6-5.9, 8.1-8.4
--
-- Two functions present and verified (NO SQL/business semantics changed):
--   1. get_payments_page(owner_id uuid, p_month int, p_year int,
--        status_filter text DEFAULT 'all', search_term text DEFAULT '',
--        page_size int DEFAULT 50, page_offset int DEFAULT 0)
--        -> TABLE(payment fields + tenant_name, tenant_mobile_number,
--                 room_number, rent_amount_room)
--   2. get_payment_month_summary(owner_id uuid, p_month int, p_year int)
--        -> jsonb { month, year, total_collected, total_pending,
--                   total_late, total_submitted }
--
-- Each function confirmed:
--   * LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public  (Req 8.1)
--   * Owner-isolation guard "WHERE $1 = auth.uid()" inside the params CTE, so a
--     JWT subject mismatch yields zero rows / an all-zero summary object rather
--     than another owner's data (Req 1.1, 1.7, 5.9).
--   * GRANT EXECUTE ... TO authenticated present at end of file (Req 8.4):
--       - public.get_payments_page(uuid, integer, integer, text, text, integer, integer)
--       - public.get_payment_month_summary(uuid, integer, integer)
--
-- get_payments_page restricts to the owner's records for the requested
-- month/year (Req 1.2), applies the status filter where 'all' means no status
-- restriction (Req 2.1-2.3), applies a case-insensitive OR search across tenant
-- name, room number, tenant mobile (raw and normalized), UTR, and payment code
-- with %/_/\ escaped (Req 3.1-3.9), orders deterministically by due_date DESC,
-- id DESC (Req 1.4), and returns a bounded page via
-- LIMIT LEAST(GREATEST(page_size,0),50) OFFSET GREATEST(page_offset,0)
-- (Req 1.3, 8.1). LEFT JOINs to tenants_table/rooms_table keep payments with a
-- missing tenant/room and surface absent joined fields as NULL (Req 1.5, 1.6).
--
-- get_payment_month_summary sums total_amount per status using
-- COALESCE(SUM(...) FILTER (WHERE status = ...), 0) so an empty month yields all
-- zeros (Req 5.1-5.4, 5.6, 5.7) using the existing paid/pending/late/submitted
-- status definitions unchanged (Req 5.8).
--
-- The optional payments_owner_month_year_due_date_idx covering index supports
-- the (owner_id, month, year) filter followed by the due_date DESC ordering
-- without a separate sort step at scale (Req 8.3). The existing owner-scoped
-- payment indexes (20260621000000) already cover the remaining filter/order
-- columns. Status definitions and the month/year billing window are used
-- unchanged; this migration adds read-only RPCs and one index only.
-- ============================================================================

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
      -- Escape ILIKE wildcards so a literal %, _, or \ in the search term is
      -- matched literally (Req 3.x). NULL means "no search restriction".
      replace(
        replace(
          replace(NULLIF(btrim($5), ''), '\', '\\'),
          '%', '\%'
        ),
        '_', '\_'
      ) AS search_pattern,
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
      OR r.room_number ILIKE '%' || prm.search_pattern || '%' ESCAPE '\'
      OR t.mobile_number ILIKE '%' || prm.search_pattern || '%' ESCAPE '\'
      OR t.mobile_number_normalized ILIKE '%' || prm.search_pattern || '%' ESCAPE '\'
      OR p.utr_number ILIKE '%' || prm.search_pattern || '%' ESCAPE '\'
      OR p.payment_code ILIKE '%' || prm.search_pattern || '%' ESCAPE '\'
    )
  ORDER BY p.due_date DESC, p.id DESC
  LIMIT (SELECT page_size FROM params)
  OFFSET (SELECT page_offset FROM params);
$$;

CREATE OR REPLACE FUNCTION public.get_payment_month_summary(
  owner_id uuid,
  p_month integer,
  p_year integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      $1 AS owner_id,
      $2 AS month,
      $3 AS year
    WHERE $1 = auth.uid()
  )
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'month', prm.month,
        'year', prm.year,
        'total_collected', COALESCE(SUM(p.total_amount) FILTER (WHERE p.status = 'paid'), 0),
        'total_pending', COALESCE(SUM(p.total_amount) FILTER (WHERE p.status = 'pending'), 0),
        'total_late', COALESCE(SUM(p.total_amount) FILTER (WHERE p.status = 'late'), 0),
        'total_submitted', COALESCE(SUM(p.total_amount) FILTER (WHERE p.status = 'submitted'), 0)
      )
      FROM params prm
      LEFT JOIN public.payments p
        ON p.owner_id = prm.owner_id
        AND p.month = prm.month
        AND p.year = prm.year
      GROUP BY prm.month, prm.year
    ),
    jsonb_build_object(
      'month', p_month,
      'year', p_year,
      'total_collected', 0,
      'total_pending', 0,
      'total_late', 0,
      'total_submitted', 0
    )
  );
$$;

-- Optional covering index: supports the (owner_id, month, year) filter followed
-- by due_date DESC ordering in get_payments_page without a separate sort step.
CREATE INDEX IF NOT EXISTS payments_owner_month_year_due_date_idx
  ON public.payments (owner_id, month, year, due_date DESC);

GRANT EXECUTE ON FUNCTION public.get_payments_page(uuid, integer, integer, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_month_summary(uuid, integer, integer) TO authenticated;
