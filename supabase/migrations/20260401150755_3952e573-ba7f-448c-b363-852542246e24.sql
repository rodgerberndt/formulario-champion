
-- Create a trigger to fire CAPI events independently after lead insert
CREATE OR REPLACE FUNCTION public.notify_capi_on_lead_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  internal_secret TEXT;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  internal_secret := current_setting('app.settings.internal_webhook_secret', true);
  
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/fire-capi-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', internal_secret,
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'lead_db_id', NEW.id
    )
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to call fire-capi-events: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger on leads table
DROP TRIGGER IF EXISTS trigger_capi_on_lead_insert ON public.leads;
CREATE TRIGGER trigger_capi_on_lead_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_capi_on_lead_insert();

-- Remove the old Kommo trigger so it stops firing
DROP TRIGGER IF EXISTS trigger_kommo_on_lead_insert ON public.leads;
