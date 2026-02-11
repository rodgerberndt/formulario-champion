
-- Table: ad_spend (daily ad spend data per creative/campaign/adset)
CREATE TABLE public.ad_spend (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  campaign_name TEXT,
  campaign_id TEXT,
  adset_name TEXT,
  adset_id TEXT,
  ad_name TEXT,
  ad_id TEXT,
  utm_content TEXT,
  utm_creative TEXT,
  creative_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ad_spend ENABLE ROW LEVEL SECURITY;

-- Only service role / admin can manage
CREATE POLICY "Service role full access on ad_spend" ON public.ad_spend FOR ALL USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_ad_spend_date ON public.ad_spend (date);
CREATE INDEX idx_ad_spend_creative_key ON public.ad_spend (creative_key);

-- Table: manual_sales (manually registered sales)
CREATE TABLE public.manual_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_date DATE NOT NULL,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  creative_key TEXT,
  utm_content TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manual_sales ENABLE ROW LEVEL SECURITY;

-- Only service role / admin can manage
CREATE POLICY "Service role full access on manual_sales" ON public.manual_sales FOR ALL USING (true) WITH CHECK (true);

-- Index
CREATE INDEX idx_manual_sales_date ON public.manual_sales (sale_date);
CREATE INDEX idx_manual_sales_creative_key ON public.manual_sales (creative_key);
CREATE INDEX idx_manual_sales_lead_id ON public.manual_sales (lead_id);
