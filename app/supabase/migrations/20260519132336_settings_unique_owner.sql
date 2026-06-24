-- Remove duplicate settings, keeping only the one with the maximum ID for each owner_id
DELETE FROM public.settings
WHERE id NOT IN (
  SELECT MAX(id)
  FROM public.settings
  GROUP BY owner_id
);

-- Add unique constraint on owner_id in public.settings
ALTER TABLE public.settings
ADD CONSTRAINT settings_owner_id_key UNIQUE (owner_id);;
