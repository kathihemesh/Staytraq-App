-- Owner-scoped performance indexes for high-volume dashboards and list views.
-- These indexes do not change table data, constraints, RLS policies, or business logic.
--
-- ============================================================================
-- VERIFICATION NOTES (spec: dashboard-server-aggregation, task 1.1)
-- Verified against design.md "Data Models -> Indexes".
-- Requirements: 8.1, 8.2, 8.3, 14.1
--
-- All owner-scoped indexes named in the design are present below as
-- idempotent CREATE INDEX IF NOT EXISTS statements (NO semantics changed):
--   * payments_owner_month_year_idx            (owner_id, month, year)
--   * payments_owner_status_month_year_idx     (owner_id, status, month, year)
--   * payments_owner_status_idx                (owner_id, status)
--   * payments_owner_due_date_idx              (owner_id, due_date)
--   * complaints_owner_status_created_at_idx   (owner_id, status, created_at)
--   * reminders_owner_status_sent_at_idx       (owner_id, status, sent_at)
--   * reminders_owner_sent_at_idx              (owner_id, sent_at)
--   * tenants_table_owner_status_deleted_at_idx(owner_id, status, deleted_at)
--   * leads_owner_created_at_idx               (owner_id, created_at)
--   * rooms_table_pg_id_room_number_idx        (pg_id, room_number)
-- These cover the exact filter/group columns (owner_id, Payment_Status, date)
-- used by the dashboard RPCs (Req 8.3, 14.1). Additional supporting indexes
-- (tenant search, tenant_id history, monthly_payment_links) are also present.
-- No new indexes are required. This is documentation only.
-- ============================================================================

-- Tenants: owner dashboards, tenant list filtering/search, room occupancy lookups,
-- reminder recipient queries, and tenant profile joins.
CREATE INDEX IF NOT EXISTS tenants_table_owner_status_deleted_at_idx
  ON public.tenants_table (owner_id, status, deleted_at);

CREATE INDEX IF NOT EXISTS tenants_table_owner_mobile_number_idx
  ON public.tenants_table (owner_id, mobile_number);

CREATE INDEX IF NOT EXISTS tenants_table_owner_room_id_idx
  ON public.tenants_table (owner_id, room_id);

CREATE INDEX IF NOT EXISTS tenants_table_owner_name_idx
  ON public.tenants_table (owner_id, name);

-- Payments: payment dashboard aggregation, month/year billing windows,
-- status filters, due-date ordering, and tenant payment history.
CREATE INDEX IF NOT EXISTS payments_owner_month_year_idx
  ON public.payments (owner_id, month, year);

CREATE INDEX IF NOT EXISTS payments_owner_status_idx
  ON public.payments (owner_id, status);

CREATE INDEX IF NOT EXISTS payments_owner_due_date_idx
  ON public.payments (owner_id, due_date);

CREATE INDEX IF NOT EXISTS payments_owner_status_month_year_idx
  ON public.payments (owner_id, status, month, year);

CREATE INDEX IF NOT EXISTS payments_tenant_month_year_idx
  ON public.payments (tenant_id, month, year);

-- Reminders: reminder history lists and status/date filtered reminder reporting.
CREATE INDEX IF NOT EXISTS reminders_owner_sent_at_idx
  ON public.reminders (owner_id, sent_at);

CREATE INDEX IF NOT EXISTS reminders_owner_status_sent_at_idx
  ON public.reminders (owner_id, status, sent_at);

-- Complaints and leads: owner dashboards and newest-first list views.
CREATE INDEX IF NOT EXISTS complaints_owner_status_created_at_idx
  ON public.complaints (owner_id, status, created_at);

CREATE INDEX IF NOT EXISTS leads_owner_created_at_idx
  ON public.leads (owner_id, created_at);

-- Rooms: room list ordering and room-number lookups within an owner's PG.
CREATE INDEX IF NOT EXISTS rooms_table_pg_id_room_number_idx
  ON public.rooms_table (pg_id, room_number);

-- Monthly payment links already have this unique index from the portal-link
-- constraint. Reusing the existing name avoids adding a duplicate when present.
CREATE INDEX IF NOT EXISTS monthly_payment_links_owner_id_month_year_key
  ON public.monthly_payment_links (owner_id, month, year);
