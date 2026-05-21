-- Ensure RLS is enabled
ALTER TABLE public.tenants_table ENABLE ROW LEVEL SECURITY;

-- Select Policy
DROP POLICY IF EXISTS "tenants_select_own" ON public.tenants_table;
CREATE POLICY "tenants_select_own" ON public.tenants_table
FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- Insert Policy
DROP POLICY IF EXISTS "tenants_insert_own" ON public.tenants_table;
CREATE POLICY "tenants_insert_own" ON public.tenants_table
FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

-- Update Policy
DROP POLICY IF EXISTS "tenants_update_own" ON public.tenants_table;
CREATE POLICY "tenants_update_own" ON public.tenants_table
FOR UPDATE TO authenticated USING (owner_id = auth.uid());

-- Delete Policy
DROP POLICY IF EXISTS "tenants_delete_own" ON public.tenants_table;
CREATE POLICY "tenants_delete_own" ON public.tenants_table
FOR DELETE TO authenticated USING (owner_id = auth.uid());
