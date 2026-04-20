CREATE TABLE public.landing_hits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  session_id uuid,
  click_id text,
  path text NOT NULL DEFAULT '/',
  referrer text,
  user_agent text,
  device_type text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  gclid text,
  ttclid text,
  ip_address text
);

CREATE INDEX idx_landing_hits_created_at ON public.landing_hits (created_at DESC);
CREATE INDEX idx_landing_hits_session_id ON public.landing_hits (session_id);
CREATE INDEX idx_landing_hits_click_id ON public.landing_hits (click_id);
CREATE INDEX idx_landing_hits_device ON public.landing_hits (device_type, created_at DESC);

ALTER TABLE public.landing_hits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert landing_hits"
ON public.landing_hits FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Service role full access on landing_hits"
ON public.landing_hits FOR ALL
TO public
USING (true)
WITH CHECK (true);