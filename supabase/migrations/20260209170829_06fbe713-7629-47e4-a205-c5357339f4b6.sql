
-- Table to log Kommo ingest results for debugging
CREATE TABLE public.kommo_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lead_phone TEXT,
  external_key TEXT,
  contact_id BIGINT,
  lead_id BIGINT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, success, error
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB
);

-- Enable RLS but allow inserts from edge functions (service role)
ALTER TABLE public.kommo_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/read (edge functions use service role)
CREATE POLICY "Service role full access" ON public.kommo_webhook_logs
  FOR ALL USING (true) WITH CHECK (true);

-- Index for debugging lookups
CREATE INDEX idx_kommo_logs_phone ON public.kommo_webhook_logs(lead_phone);
CREATE INDEX idx_kommo_logs_external_key ON public.kommo_webhook_logs(external_key);
CREATE INDEX idx_kommo_logs_created ON public.kommo_webhook_logs(created_at DESC);
