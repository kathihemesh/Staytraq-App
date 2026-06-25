-- Feature: payment-reminders
--
-- Per-tenant payment-portal token (mirrors verification_token) backing a unique
-- payment link that skips the grouped portal's mobile-number verification and
-- shows the tenant's dues directly. Plus a once-per-calendar-day guard column
-- for the daily payment-reminder scheduler.

ALTER TABLE public.tenants_table
  ADD COLUMN IF NOT EXISTS payment_portal_token text;

-- Partial unique index: many NULLs allowed, live tokens unique.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_payment_portal_token_key
  ON public.tenants_table (payment_portal_token)
  WHERE payment_portal_token IS NOT NULL;

ALTER TABLE public.tenants_table
  ADD COLUMN IF NOT EXISTS payment_reminder_last_date date;
