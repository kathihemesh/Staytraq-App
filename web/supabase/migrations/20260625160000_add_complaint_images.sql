-- Feature: complaint image attachments
--
-- Tenants can attach image(s) to a complaint on the public submission portal;
-- the owner views them in the app. Image storage paths are kept on the complaint
-- row, and the files live in a private, owner-scoped bucket.

ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS image_paths text[];

-- Private bucket for tenant-submitted complaint images (path: {owner_id}/{folder}/{i}.{ext}).
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('complaint_images', 'complaint_images', false, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Owner-scoped RLS: only the owning owner (auth.uid() = first path segment) can
-- read/sign or delete. Public submission uploads use the service-role admin
-- client and bypass RLS.
drop policy if exists "Allow authenticated uploads to complaint_images" on storage.objects;
create policy "Allow authenticated uploads to complaint_images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'complaint_images' and (storage.foldername(name))[1] = (auth.uid())::text);

drop policy if exists "Allow owners to read their own complaint_images" on storage.objects;
create policy "Allow owners to read their own complaint_images" on storage.objects
  for select to authenticated
  using (bucket_id = 'complaint_images' and (storage.foldername(name))[1] = (auth.uid())::text);

drop policy if exists "Allow owners to delete their own complaint_images" on storage.objects;
create policy "Allow owners to delete their own complaint_images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'complaint_images' and (storage.foldername(name))[1] = (auth.uid())::text);
