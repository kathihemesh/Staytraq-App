ALTER TABLE public.tenants_table ADD COLUMN IF NOT EXISTS identity_msg_failed boolean NOT NULL DEFAULT false;;
