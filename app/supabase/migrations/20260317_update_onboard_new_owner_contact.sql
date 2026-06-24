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

  insert into public.pg_owners (
    id,
    full_name,
    pg_name,
    address,
    city,
    is_onboarded,
    email,
    mobile_number
  )
  values (
    v_owner_id,
    p_full_name,
    p_pg_name,
    p_address,
    p_city,
    true,
    v_email,
    v_phone
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    pg_name = excluded.pg_name,
    address = excluded.address,
    city = excluded.city,
    is_onboarded = true,
    -- If the current auth session includes email/phone, persist it during onboarding.
    -- Keep existing values only when the current session doesn't provide them.
    email = coalesce(excluded.email, public.pg_owners.email),
    mobile_number = coalesce(excluded.mobile_number, public.pg_owners.mobile_number);
end;
$$;
