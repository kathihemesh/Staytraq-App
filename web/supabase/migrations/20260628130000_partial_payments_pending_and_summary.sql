-- Drop the separate 'partially_paid' status: partial records stay 'pending'
-- (the owner UI derives a "Partial" badge from amount_paid). Make the month
-- summary partial-aware (collected counts amount_paid; buckets count balances).

-- 1. Migrate any existing partially_paid rows back to pending.
UPDATE public.payments SET status = 'pending' WHERE status = 'partially_paid';

-- 2. Remove 'partially_paid' from the allowed statuses.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'late'::text, 'submitted'::text, 'paid'::text, 'rejected'::text]));

-- 3. Partial-aware month summary:
--    collected = sum of amount actually received (amount_paid) across all rows;
--    pending/late/submitted = remaining balance (total_amount - amount_paid).
CREATE OR REPLACE FUNCTION public.get_payment_month_summary(owner_id uuid, p_month integer, p_year integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT $1 AS owner_id, $2 AS month, $3 AS year
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
      GROUP BY prm.month, prm.year
    ),
    jsonb_build_object(
      'month', p_month, 'year', p_year,
      'total_collected', 0, 'total_pending', 0, 'total_late', 0, 'total_submitted', 0
    )
  );
$function$;
