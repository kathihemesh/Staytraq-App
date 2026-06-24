-- Create the private identity_documents bucket mirroring the staytraq_docs pattern.
-- Path layout: {owner_id}/{tenant_id}/{front|back}.{ext}. Private buckets are encrypted at rest and never public.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('identity_documents', 'identity_documents', false, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Owner-scoped RLS policies: scope objects by the {owner_id} path prefix (foldername[1] = auth.uid()),
-- so only the owning owner can read/sign, upload, or delete their identity documents.
create policy "Allow authenticated uploads to identity_documents"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'identity_documents'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "Allow owners to read their own identity_documents"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'identity_documents'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "Allow owners to delete their own identity_documents"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'identity_documents'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
