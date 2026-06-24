begin;

alter table public.pg_details
  alter column no_floors set default 0;

create index if not exists pg_details_owner_id_idx
  on public.pg_details (owner_id);

create index if not exists rooms_table_pg_id_idx
  on public.rooms_table (pg_id);

commit;
;
