ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_first_opened_at ON public.leads(first_opened_at) WHERE first_opened_at IS NOT NULL;

-- Permitir que o painel admin (anon) marque o primeiro acesso ao lead.
-- Restrito: só permite UPDATE quando first_opened_at ainda é NULL (proteção contra sobrescrever).
CREATE POLICY "Allow first open timestamp update"
ON public.leads
FOR UPDATE
TO anon, authenticated
USING (first_opened_at IS NULL)
WITH CHECK (true);