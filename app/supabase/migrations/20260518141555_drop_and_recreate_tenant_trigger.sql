DROP TRIGGER IF EXISTS tenant_rent_due_day_update_trigger ON public.tenants_table;
CREATE TRIGGER tenant_rent_due_day_update_trigger
AFTER UPDATE ON public.tenants_table
FOR EACH ROW
EXECUTE FUNCTION update_payment_due_dates_on_tenant_change();;
