
CREATE TABLE public.meetings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creative_key text NULL,
  utm_content text NULL,
  notes text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on meetings"
ON public.meetings
FOR ALL
USING (true)
WITH CHECK (true);
