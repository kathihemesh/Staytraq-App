
-- Allow owners to INSERT rooms for their own PG
CREATE POLICY "rooms_insert" ON public.rooms_table
  FOR INSERT
  TO public
  WITH CHECK (
    pg_id IN (
      SELECT id FROM pg_details WHERE owner_id = auth.uid()
    )
  );

-- Allow owners to UPDATE rooms in their own PG
CREATE POLICY "rooms_update" ON public.rooms_table
  FOR UPDATE
  TO public
  USING (
    pg_id IN (
      SELECT id FROM pg_details WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    pg_id IN (
      SELECT id FROM pg_details WHERE owner_id = auth.uid()
    )
  );
;
