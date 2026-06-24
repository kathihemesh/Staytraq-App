
-- Add owner_id to reminders for proper RLS scoping
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

-- Enable RLS if not already
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Owners can manage their own reminders" ON public.reminders;

-- Create RLS policy
CREATE POLICY "Owners can manage their own reminders"
  ON public.reminders
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
;
