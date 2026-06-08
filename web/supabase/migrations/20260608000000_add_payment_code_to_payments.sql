-- Add unique payment_code column to payments table
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_code text;

UPDATE public.payments 
SET payment_code = ('PAY-' || upper(substring(gen_random_uuid()::text from 1 for 6)))
WHERE payment_code IS NULL;

ALTER TABLE public.payments ALTER COLUMN payment_code SET DEFAULT ('PAY-' || upper(substring(gen_random_uuid()::text from 1 for 6)));
ALTER TABLE public.payments ALTER COLUMN payment_code SET NOT NULL;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_code_unique UNIQUE (payment_code);
