
-- Add Kommo tracking columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS kommo_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kommo_contact_id BIGINT,
  ADD COLUMN IF NOT EXISTS kommo_lead_id BIGINT,
  ADD COLUMN IF NOT EXISTS last_kommo_error TEXT,
  ADD COLUMN IF NOT EXISTS kommo_retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kommo_synced_at TIMESTAMPTZ;

-- Add stage column to kommo_webhook_logs
ALTER TABLE public.kommo_webhook_logs
  ADD COLUMN IF NOT EXISTS stage TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'trigger',
  ADD COLUMN IF NOT EXISTS lead_name TEXT;

-- Recreate the trigger function to pass lead ID
CREATE OR REPLACE FUNCTION public.notify_kommo_on_lead_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  webhook_secret TEXT;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  webhook_secret := current_setting('app.settings.internal_webhook_secret', true);
  
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/kommo-webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret,
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'lead_db_id', NEW.id,
      'nome_completo', NEW.nome_completo,
      'whatsapp', NEW.whatsapp,
      'instagram', NEW.instagram,
      'mercado', NEW.mercado,
      'estagio_negocio', NEW.estagio_negocio,
      'investimento_faixa', NEW.investimento_faixa,
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
      'orcamento_faixa', NEW.orcamento_faixa,
      'utm_source', NEW.utm_source,
      'utm_campaign', NEW.utm_campaign,
      'utm_content', NEW.utm_content,
      'utm_medium', NEW.utm_medium,
      'utm_term', NEW.utm_term
    )
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to call Kommo webhook: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- CREATE THE TRIGGER (this was missing!)
DROP TRIGGER IF EXISTS trigger_kommo_on_lead_insert ON public.leads;
CREATE TRIGGER trigger_kommo_on_lead_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_kommo_on_lead_insert();

-- Also create trigger for lead_sessions completion -> notify-lead
DROP TRIGGER IF EXISTS trigger_notify_on_lead_complete ON public.lead_sessions;
CREATE TRIGGER trigger_notify_on_lead_complete
  AFTER UPDATE ON public.lead_sessions
  FOR EACH ROW
  WHEN (NEW.completed = true AND (OLD.completed IS DISTINCT FROM true))
  EXECUTE FUNCTION public.notify_on_lead_complete();
