-- Create a function that will be called by a trigger after lead insert
-- This function calls the kommo-webhook edge function using pg_net
CREATE OR REPLACE FUNCTION public.notify_kommo_on_lead_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  webhook_secret TEXT;
BEGIN
  -- Get environment variables
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  webhook_secret := current_setting('app.settings.internal_webhook_secret', true);
  
  -- Call the edge function using pg_net (async HTTP request)
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/kommo-webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret,
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'nome_completo', NEW.nome_completo,
      'whatsapp', NEW.whatsapp,
      'instagram', NEW.instagram,
      'mercado', NEW.mercado,
      'estagio_negocio', NEW.estagio_negocio,
      'dor_desejo', NEW.dor_desejo,
      'email', NEW.email,
      'empresa', NEW.empresa,
      'segmento', NEW.segmento,
      'score', NEW.score,
      'tier', NEW.tier,
      'decisor', NEW.decisor,
      'faturamento_faixa', NEW.faturamento_faixa,
      'trafego_faixa', NEW.trafego_faixa,
      'gargalo', NEW.gargalo,
      'timing', NEW.timing,
      'orcamento_faixa', NEW.orcamento_faixa
    )
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to call Kommo webhook: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger to call the function after each lead insert
DROP TRIGGER IF EXISTS trigger_notify_kommo_on_lead_insert ON public.leads;
CREATE TRIGGER trigger_notify_kommo_on_lead_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_kommo_on_lead_insert();