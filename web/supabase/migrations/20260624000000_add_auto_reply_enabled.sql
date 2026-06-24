-- Add auto_reply_enabled column to pg_owners table
ALTER TABLE public.pg_owners
ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT true;
