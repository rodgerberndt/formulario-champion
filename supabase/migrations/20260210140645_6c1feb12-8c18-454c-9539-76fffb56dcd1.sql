
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
      'orcamento_faixa', NEW.orcamento_faixa
    )
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to call Kommo webhook: %', SQLERRM;
    RETURN NEW;
END;
$function$;
