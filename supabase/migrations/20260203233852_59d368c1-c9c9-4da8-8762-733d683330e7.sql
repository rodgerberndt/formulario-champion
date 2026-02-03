-- Add ip_address column to lead_sessions
ALTER TABLE public.lead_sessions 
ADD COLUMN IF NOT EXISTS ip_address text;

-- Add ip_address column to leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS ip_address text;

-- Add is_duplicate_ip column to leads for flagging duplicates
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS is_duplicate_ip boolean DEFAULT false;

-- Create index for faster IP lookups
CREATE INDEX IF NOT EXISTS idx_lead_sessions_ip ON public.lead_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_leads_ip ON public.leads(ip_address);