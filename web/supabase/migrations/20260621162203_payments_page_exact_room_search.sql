-- Refine get_payments_page search semantics for room number.
--
-- ============================================================================
-- CONTEXT (spec: payments-loading-performance)
-- The original get_payments_page (20260622000000) matched the search term as a
-- case-insensitive SUBSTRING across tenant name, room number, tenant mobile
-- (raw + normalized), UTR, and payment code. For a numeric query like "201",
-- the substring match also returned rooms 104 / 301 etc. because those digits
-- appear inside the tenants' mobile numbers, UTR, or payment codes.
--
-- This migration changes ONLY the room-number predicate to an EXACT,
-- case-insensitive match (e.g. "201" -> only room "201"), while keeping
-- substring matching for tenant name, mobile number (raw + normalized), UTR,
-- and payment code. No other behavior (owner isolation, month/year window,
-- status filter, deterministic order, offset/limit, joins, null handling) is
-- changed. This is a performance/UX refinement only; no payment status
-- definitions, transitions, or workflows change.
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
      -- Raw trimmed term (NOT wildcard-escaped) used for the EXACT room-number
      -- comparison. NULL when the term is empty/whitespace.
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
      -- Room number is matched EXACTLY (case-insensitive), so "201" no longer
      -- matches "104"/"301" via digits appearing in other fields.
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
