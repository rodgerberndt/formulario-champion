
ALTER TABLE public.leads ADD COLUMN sdr_override text DEFAULT NULL;
COMMENT ON COLUMN public.leads.sdr_override IS 'Manual SDR override. NULL = automatic assignment based on tier';
