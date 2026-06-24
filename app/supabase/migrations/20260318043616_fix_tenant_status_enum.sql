
-- Add missing enum values for tenant_status
ALTER TYPE tenant_status ADD VALUE IF NOT EXISTS 'pending_move_in';
ALTER TYPE tenant_status ADD VALUE IF NOT EXISTS 'notice_period';
ALTER TYPE tenant_status ADD VALUE IF NOT EXISTS 'moved_out';
;
