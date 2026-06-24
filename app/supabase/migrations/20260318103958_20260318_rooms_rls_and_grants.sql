begin;

grant usage on schema public to authenticated;

grant select on table public.pg_details to authenticated;
grant select, insert, update, delete on table public.rooms_table to authenticated;

grant usage, select on all sequences in schema public to authenticated;

alter table public.pg_details enable row level security;
alter table public.rooms_table enable row level security;

drop policy if exists "pg_details_select_own" on public.pg_details;
create policy "pg_details_select_own"
on public.pg_details
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "rooms_select_own_pg" on public.rooms_table;
create policy "rooms_select_own_pg"
on public.rooms_table
for select
to authenticated
using (
  exists (
    select 1
    from public.pg_details p
    where p.id = rooms_table.pg_id
      and p.owner_id = auth.uid()
  )
);

drop policy if exists "rooms_insert_own_pg" on public.rooms_table;
create policy "rooms_insert_own_pg"
on public.rooms_table
for insert
to authenticated
with check (
  exists (
    select 1
    from public.pg_details p
    where p.id = rooms_table.pg_id
      and p.owner_id = auth.uid()
  )
);

drop policy if exists "rooms_update_own_pg" on public.rooms_table;
create policy "rooms_update_own_pg"
on public.rooms_table
for update
to authenticated
using (
  exists (
    select 1
    from public.pg_details p
    where p.id = rooms_table.pg_id
      and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.pg_details p
    where p.id = rooms_table.pg_id
      and p.owner_id = auth.uid()
  )
);

drop policy if exists "rooms_delete_own_pg" on public.rooms_table;
create policy "rooms_delete_own_pg"
on public.rooms_table
for delete
to authenticated
using (
  exists (
    select 1
    from public.pg_details p
    where p.id = rooms_table.pg_id
      and p.owner_id = auth.uid()
  )
);

commit;
;
