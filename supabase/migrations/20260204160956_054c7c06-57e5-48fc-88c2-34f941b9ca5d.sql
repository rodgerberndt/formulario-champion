-- Add campaign tracking columns to lead_sessions
ALTER TABLE public.lead_sessions
ADD COLUMN IF NOT EXISTS fbclid text,
ADD COLUMN IF NOT EXISTS gclid text,
ADD COLUMN IF NOT EXISTS ttclid text,
ADD COLUMN IF NOT EXISTS campaign_id text,
ADD COLUMN IF NOT EXISTS adset_id text,
ADD COLUMN IF NOT EXISTS ad_id text,
ADD COLUMN IF NOT EXISTS creative_id text;

-- Create indexes for campaign analytics queries
CREATE INDEX IF NOT EXISTS idx_lead_sessions_campaign_id ON public.lead_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lead_sessions_adset_id ON public.lead_sessions(adset_id);
CREATE INDEX IF NOT EXISTS idx_lead_sessions_ad_id ON public.lead_sessions(ad_id);
CREATE INDEX IF NOT EXISTS idx_lead_sessions_utm_campaign ON public.lead_sessions(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_lead_sessions_utm_source ON public.lead_sessions(utm_source);

-- Create meta_ads_cache table for Layer B (Meta API resolution)
CREATE TABLE IF NOT EXISTS public.meta_ads_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  campaign_id text,
  adset_id text,
  ad_id text UNIQUE,
  creative_id text,
  campaign_name text,
  adset_name text,
  ad_name text,
  creative_name text,
  creative_thumbnail_url text,
  last_synced_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for meta_ads_cache
CREATE INDEX IF NOT EXISTS idx_meta_ads_cache_campaign_id ON public.meta_ads_cache(campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_cache_adset_id ON public.meta_ads_cache(adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_cache_creative_id ON public.meta_ads_cache(creative_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_cache_last_synced ON public.meta_ads_cache(last_synced_at);

-- Enable RLS on meta_ads_cache
ALTER TABLE public.meta_ads_cache ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users (admin dashboard)
CREATE POLICY "Allow read access for meta_ads_cache"
ON public.meta_ads_cache
FOR SELECT
USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_meta_ads_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_meta_ads_cache_updated_at ON public.meta_ads_cache;
CREATE TRIGGER update_meta_ads_cache_updated_at
BEFORE UPDATE ON public.meta_ads_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_meta_ads_cache_updated_at();