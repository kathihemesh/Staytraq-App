CREATE OR REPLACE FUNCTION update_payment_due_dates_on_tenant_change()
RETURNS TRIGGER AS $$
DECLARE
  today_date DATE := CURRENT_DATE;
  new_calculated_due_date DATE;
  r RECORD;
BEGIN
  IF (OLD.rent_due_day IS DISTINCT FROM NEW.rent_due_day) THEN
    -- Loop through all active/unpaid payments (pending and late) for this tenant
    FOR r IN 
      SELECT id, month, year 
      FROM public.payments 
      WHERE tenant_id = NEW.id 
        AND status IN ('pending', 'late')
    LOOP
      -- Calculate the new due date safely
      new_calculated_due_date := make_date(
        r.year, 
        r.month, 
        LEAST(
          NEW.rent_due_day, 
          EXTRACT(DAY FROM (make_date(r.year, r.month, 1) + interval '1 month' - interval '1 day'))::integer
        )
      );

      -- Update both due_date and status based on whether it is now in the future or past
      UPDATE public.payments
      SET due_date = new_calculated_due_date,
          status = CASE 
            WHEN new_calculated_due_date < today_date THEN 'late'
            ELSE 'pending'
          END
      WHERE id = r.id;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;;
