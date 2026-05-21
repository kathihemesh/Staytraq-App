-- Updates onboard_new_owner to also persist owner contact info
-- from Supabase Auth JWT claims (email/phone).
--
-- Supabase JWT required claims reference:
-- - email: auth.jwt() ->> 'email' (may be empty string)
-- - phone: auth.jwt() ->> 'phone' (may be empty string)
--
-- This function is called from the Next.js onboarding page:
-- `supabase.rpc('onboard_new_owner', { p_full_name, p_pg_name, p_address, p_city })`

create or replace function public.onboard_new_owner(
  p_full_name text,
  p_pg_name text,
  p_address text,
  p_city text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_email text := nullif(auth.jwt() ->> 'email', '');
  v_phone text := nullif(auth.jwt() ->> 'phone', '');
begin
  if v_owner_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 1) Owner profile (public.pg_owners)
  -- Hosted schema (confirmed):
  -- - pg_owners(id, name, email, mobile_number, is_onboarded, ...)
  insert into public.pg_owners (
    id,
    name,
    email,
    mobile_number,
    is_onboarded
  )
  values (
    v_owner_id,
    p_full_name,
    v_email,
    v_phone,
    true
  )
  on conflict (id) do update
  set
    name = excluded.name,
    is_onboarded = true,
    -- Persist contact info from the current auth session when present.
    email = coalesce(excluded.email, public.pg_owners.email),
    mobile_number = coalesce(excluded.mobile_number, public.pg_owners.mobile_number);

  -- 2) PG details (public.pg_details)
  -- Hosted schema (confirmed):
  -- - pg_details(owner_id unique, pg_name, address, city, ...)
  insert into public.pg_details (
    owner_id,
    pg_name,
    address,
    city
  )
  values (
    v_owner_id,
    p_pg_name,
    p_address,
    p_city
  )
  on conflict (owner_id) do update
  set
    pg_name = excluded.pg_name,
    address = excluded.address,
    city = excluded.city;
end;
$$;

