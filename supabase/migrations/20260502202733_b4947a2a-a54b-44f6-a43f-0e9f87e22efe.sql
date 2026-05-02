ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS nps_score smallint NULL;

ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS leads_nps_score_range;

ALTER TABLE public.leads
ADD CONSTRAINT leads_nps_score_range
CHECK (nps_score IS NULL OR (nps_score >= 0 AND nps_score <= 10));

COMMENT ON COLUMN public.leads.nps_score IS 'Nota 0-10 que o lead deu ao quiz (feedback de bugs/UX). NULL = não respondeu.';