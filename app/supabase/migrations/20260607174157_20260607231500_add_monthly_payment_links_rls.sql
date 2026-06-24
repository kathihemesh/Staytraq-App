-- Ensure RLS is enabled
ALTER TABLE public.monthly_payment_links ENABLE ROW LEVEL SECURITY;

-- Select Policy
DROP POLICY IF EXISTS "monthly_payment_links_select_own" ON public.monthly_payment_links;
CREATE POLICY "monthly_payment_links_select_own" ON public.monthly_payment_links
FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- Insert Policy
DROP POLICY IF EXISTS "monthly_payment_links_insert_own" ON public.monthly_payment_links;
CREATE POLICY "monthly_payment_links_insert_own" ON public.monthly_payment_links
FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

-- Update Policy
DROP POLICY IF EXISTS "monthly_payment_links_update_own" ON public.monthly_payment_links;
CREATE POLICY "monthly_payment_links_update_own" ON public.monthly_payment_links
FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Delete Policy
DROP POLICY IF EXISTS "monthly_payment_links_delete_own" ON public.monthly_payment_links;
CREATE POLICY "monthly_payment_links_delete_own" ON public.monthly_payment_links
FOR DELETE TO authenticated USING (owner_id = auth.uid());;
