ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS skipped_queue boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skipped_queue_at timestamptz NULL;

CREATE POLICY "Allow skipped_queue update"
ON public.leads
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);