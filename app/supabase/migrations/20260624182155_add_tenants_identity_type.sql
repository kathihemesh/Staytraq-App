ALTER TABLE public.tenants_table ADD COLUMN IF NOT EXISTS identity_type text CONSTRAINT tenants_identity_type_check CHECK (identity_type IN ('Aadhaar','PAN'));;
