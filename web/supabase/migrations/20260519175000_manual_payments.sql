-- 1. Alter `payments` table
ALTER TABLE public.payments
  ADD COLUMN payment_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN screenshot_path TEXT,
  ADD COLUMN utr_number TEXT,
  ADD COLUMN submitted_at TIMESTAMPTZ,
  ADD COLUMN verified_at TIMESTAMPTZ,
  ADD COLUMN verification_notes TEXT,
  ADD COLUMN payment_method TEXT DEFAULT 'upi';

ALTER TABLE public.payments
  ADD CONSTRAINT payments_token_unique UNIQUE (payment_token);

CREATE INDEX idx_payments_token ON public.payments (payment_token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tenant_month_year
  ON public.payments (tenant_id, month, year);

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
    CHECK (status IN ('pending', 'late', 'submitted', 'paid', 'rejected'));

-- 2. Alter `settings` table
ALTER TABLE public.settings
  ADD COLUMN upi_id TEXT,
  ADD COLUMN upi_name TEXT,
  ADD COLUMN payment_instructions TEXT,
  ADD COLUMN screenshot_required BOOLEAN DEFAULT true,
  ADD COLUMN utr_required BOOLEAN DEFAULT true;

-- Ensure settings can be inserted and updated by the owner
CREATE POLICY "settings_insert_own" ON public.settings
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "settings_update_own" ON public.settings
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());

-- 3. Create `payment_audit_log` table
CREATE TABLE public.payment_audit_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id BIGINT NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  owner_id   UUID REFERENCES auth.users(id),
  action     TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  notes      TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_payment_id ON public.payment_audit_log (payment_id);
CREATE INDEX idx_audit_owner_id ON public.payment_audit_log (owner_id);

ALTER TABLE public.payment_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_read_audit_log"
  ON public.payment_audit_log FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- 4. Clean up duplicate settings rows and enforce uniqueness of owner_id
DELETE FROM public.settings
WHERE id NOT IN (
  SELECT MAX(id)
  FROM public.settings
  GROUP BY owner_id
);

ALTER TABLE public.settings
  ADD CONSTRAINT settings_owner_id_key UNIQUE (owner_id);

