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
    email = coalesce(excluded.email, public.pg_owners.email),
    mobile_number = coalesce(excluded.mobile_number, public.pg_owners.mobile_number);

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
;
