-- Performance + defaults for Rooms flow
-- - Make pg_details.no_floors default to 0 (Ground floor only)
-- - Add indexes to speed RLS ownership checks and room lookups

begin;

-- Default floors: 0 => only Ground Floor
alter table public.pg_details
  alter column no_floors set default 0;

-- Indexes used by RLS policies / app queries
create index if not exists pg_details_owner_id_idx
  on public.pg_details (owner_id);

create index if not exists rooms_table_pg_id_idx
  on public.rooms_table (pg_id);

commit;

