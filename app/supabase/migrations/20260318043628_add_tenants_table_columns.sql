
ALTER TABLE public.tenants_table
  ADD COLUMN IF NOT EXISTS allocated_room text,
  ADD COLUMN IF NOT EXISTS alternate_mobile_number text,
  ADD COLUMN IF NOT EXISTS rent_due_day integer,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS id_documents jsonb,
  ADD COLUMN IF NOT EXISTS exit_date date,
  ADD COLUMN IF NOT EXISTS extra_charges numeric,
  ADD COLUMN IF NOT EXISTS deposit_refund_amount numeric;
;
