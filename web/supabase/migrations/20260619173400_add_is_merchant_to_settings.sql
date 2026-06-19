-- Add is_merchant column to settings table
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS is_merchant BOOLEAN DEFAULT false;
