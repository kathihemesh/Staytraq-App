-- Drop unique index and unique constraint to allow multiple payments per tenant in the same billing cycle
DROP INDEX IF EXISTS public.idx_payments_tenant_month_year;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS unique_payment_per_month;
