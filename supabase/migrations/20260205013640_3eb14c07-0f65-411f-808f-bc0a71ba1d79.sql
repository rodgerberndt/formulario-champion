-- Add UTM tracking columns to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS utm_source text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS utm_medium text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS utm_campaign text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS utm_content text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS utm_term text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fbclid text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS gclid text DEFAULT NULL;

-- Create index for UTM analytics queries
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON public.leads(utm_source);
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON public.leads(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at);