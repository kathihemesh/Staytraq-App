-- Add soft delete support to tenants_table
-- This allows preserving tenant and payment data for analytics while hiding deleted tenants from the owner's view

ALTER TABLE public.tenants_table
  ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for efficient querying of non-deleted tenants
CREATE INDEX idx_tenants_deleted_at ON public.tenants_table (deleted_at) WHERE deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tenants_table.deleted_at IS 'Timestamp when tenant was soft-deleted. NULL means tenant is active/visible.';
