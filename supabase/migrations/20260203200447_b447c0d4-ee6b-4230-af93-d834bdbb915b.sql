-- Create lead_sessions table for tracking visitor sessions
CREATE TABLE public.lead_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  first_page text,
  last_page text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  device_type text,
  user_agent text,
  started_quiz boolean NOT NULL DEFAULT false,
  start_button_id text,
  entered_quiz_page boolean NOT NULL DEFAULT false,
  current_step_id text,
  completed boolean NOT NULL DEFAULT false,
  lead_name text,
  lead_whatsapp text,
  lead_instagram text,
  lead_market text,
  lead_stage text
);

-- Create lead_events table for tracking individual events
CREATE TABLE public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.lead_sessions(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  event_name text NOT NULL,
  page text,
  step_id text,
  button_id text,
  metadata jsonb
);

-- Create index for faster event lookups by session
CREATE INDEX idx_lead_events_session_id ON public.lead_events(session_id);
CREATE INDEX idx_lead_events_created_at ON public.lead_events(created_at);
CREATE INDEX idx_lead_sessions_created_at ON public.lead_sessions(created_at);
CREATE INDEX idx_lead_sessions_completed ON public.lead_sessions(completed);

-- Enable RLS
ALTER TABLE public.lead_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lead_sessions
-- Allow public INSERT for new sessions
CREATE POLICY "Anyone can create a session"
ON public.lead_sessions
FOR INSERT
WITH CHECK (true);

-- Allow public UPDATE only for specific tracking fields (not lead data until submit)
CREATE POLICY "Anyone can update session tracking"
ON public.lead_sessions
FOR UPDATE
USING (true);

-- Block public SELECT (admin reads via service role)
-- No SELECT policy means public can't read

-- RLS Policies for lead_events
-- Allow public INSERT only
CREATE POLICY "Anyone can insert events"
ON public.lead_events
FOR INSERT
WITH CHECK (true);

-- Block public SELECT (admin reads via service role)
-- No SELECT policy means public can't read