CREATE OR REPLACE FUNCTION update_payment_due_dates_on_tenant_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.rent_due_day IS DISTINCT FROM NEW.rent_due_day) THEN
    UPDATE public.payments
    SET due_date = make_date(
      year, 
      month, 
      LEAST(
        NEW.rent_due_day, 
        EXTRACT(DAY FROM (make_date(year, month, 1) + interval '1 month' - interval '1 day'))::integer
      )
    )
    WHERE tenant_id = NEW.id 
      AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tenant_rent_due_day_update_trigger
AFTER UPDATE ON public.tenants_table
FOR EACH ROW
EXECUTE FUNCTION update_payment_due_dates_on_tenant_change();;
