-- Create a unique index on whatsapp + nome_completo to prevent exact duplicates
-- Using a partial approach: prevent same person submitting within 60 seconds
CREATE OR REPLACE FUNCTION public.prevent_duplicate_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM leads
    WHERE whatsapp = NEW.whatsapp
      AND nome_completo = NEW.nome_completo
      AND created_at > (now() - interval '60 seconds')
  ) THEN
    RAISE EXCEPTION 'Duplicate lead detected for % within 60 seconds', NEW.whatsapp;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_duplicate_lead_trigger
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_lead();