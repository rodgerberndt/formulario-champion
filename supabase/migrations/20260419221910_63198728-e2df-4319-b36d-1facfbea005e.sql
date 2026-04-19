-- Section views: tracks which sections of the landing each session reached
CREATE TABLE public.section_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  section_id TEXT NOT NULL,
  section_order INTEGER NOT NULL,
  page TEXT NOT NULL DEFAULT '/',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  time_spent_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_section_views_session ON public.section_views(session_id);
CREATE INDEX idx_section_views_created ON public.section_views(created_at DESC);
CREATE INDEX idx_section_views_section ON public.section_views(section_id);
CREATE UNIQUE INDEX idx_section_views_unique ON public.section_views(session_id, section_id, page);

ALTER TABLE public.section_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert section views"
  ON public.section_views FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update own section views"
  ON public.section_views FOR UPDATE
  USING (true);

-- Scroll milestones: tracks 25/50/75/100 % depth
CREATE TABLE public.scroll_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  page TEXT NOT NULL DEFAULT '/',
  milestone INTEGER NOT NULL CHECK (milestone IN (25, 50, 75, 100)),
  reached_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scroll_session ON public.scroll_milestones(session_id);
CREATE INDEX idx_scroll_created ON public.scroll_milestones(reached_at DESC);
CREATE UNIQUE INDEX idx_scroll_unique ON public.scroll_milestones(session_id, page, milestone);

ALTER TABLE public.scroll_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert scroll milestones"
  ON public.scroll_milestones FOR INSERT
  WITH CHECK (true);

-- Click events: tracks CTAs, WhatsApp, anchors, external links etc
CREATE TABLE public.click_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  page TEXT NOT NULL DEFAULT '/',
  click_type TEXT NOT NULL,
  click_id TEXT,
  section_id TEXT,
  href TEXT,
  label TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_click_session ON public.click_events(session_id);
CREATE INDEX idx_click_created ON public.click_events(created_at DESC);
CREATE INDEX idx_click_type ON public.click_events(click_type);

ALTER TABLE public.click_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert click events"
  ON public.click_events FOR INSERT
  WITH CHECK (true);