-- Add Meta Ads tracking columns to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS campaign_id text,
ADD COLUMN IF NOT EXISTS adset_id text,
ADD COLUMN IF NOT EXISTS ad_id text,
ADD COLUMN IF NOT EXISTS placement text,
ADD COLUMN IF NOT EXISTS site_source_name text;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON public.leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_adset_id ON public.leads(adset_id);
CREATE INDEX IF NOT EXISTS idx_leads_ad_id ON public.leads(ad_id);