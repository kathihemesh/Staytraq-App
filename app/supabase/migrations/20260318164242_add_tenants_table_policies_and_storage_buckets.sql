
-- 1. Add missing RLS policies for tenants_table
ALTER TABLE public.tenants_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_insert" ON public.tenants_table
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "tenants_update" ON public.tenants_table
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "tenants_delete" ON public.tenants_table
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- 2. Ensure storage bucket exists and has correct policies
-- We saw 'staytraq_docs' in the bucket list.

-- Allow authenticated users to upload to staytraq_docs
-- Assuming the folder structure is {owner_id}/{tenant_id}/{filename}

CREATE POLICY "Allow authenticated uploads to staytraq_docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'staytraq_docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Allow owners to read their own docs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'staytraq_docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Allow owners to delete their own docs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'staytraq_docs' AND (storage.foldername(name))[1] = auth.uid()::text);
;
