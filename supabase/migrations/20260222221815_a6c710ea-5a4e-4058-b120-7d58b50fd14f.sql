
-- Add column to track which CAPI events have been sent per lead (deduplication)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS capi_events_sent jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.leads.capi_events_sent IS 'Tracks which Meta CAPI events have been sent for this lead, e.g. {"CompleteRegistration": true, "Lead_Medium": true}';
