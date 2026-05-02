ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS instagram_follow_dispatched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_ig_follow_pending
ON public.leads (created_at)
WHERE instagram_follow_dispatched_at IS NULL
  AND instagram IS NOT NULL
  AND instagram <> '';