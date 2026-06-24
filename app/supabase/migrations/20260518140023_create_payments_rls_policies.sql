alter table public.payments enable row level security;

create policy "Owners can read their own payments"
on public.payments
for select
to authenticated
using (owner_id = auth.uid());

create policy "Owners can insert their own payments"
on public.payments
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Owners can update their own payments"
on public.payments
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Owners can delete their own payments"
on public.payments
for delete
to authenticated
using (owner_id = auth.uid());;
