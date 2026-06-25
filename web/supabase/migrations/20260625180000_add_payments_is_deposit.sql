-- Feature: distinguish deposit vs rent payment records
--
-- The rent generator dedupes by tenant+month+year. Without a type marker, a
-- security-deposit record for the current month would block rent generation for
-- that month (and vice versa). This flag lets the generator scope its dedupe to
-- rent records only.

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS is_deposit boolean NOT NULL DEFAULT false;

-- Backfill historical deposit records (previously labelled via verification_notes).
UPDATE public.payments SET is_deposit = true WHERE verification_notes = 'Security Deposit Fee';
