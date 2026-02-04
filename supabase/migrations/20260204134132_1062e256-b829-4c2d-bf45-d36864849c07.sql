-- Create function to notify on lead completion
CREATE OR REPLACE FUNCTION public.notify_on_lead_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  lead_notify_secret TEXT;
BEGIN
  -- Only trigger when completed changes from false to true
  IF NEW.completed = true AND (OLD.completed IS NULL OR OLD.completed = false) THEN
    -- Get environment variables
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);
    lead_notify_secret := current_setting('app.settings.lead_notify_secret', true);
    
    -- Call the edge function using pg_net (async HTTP request)
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/notify-lead',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-lead-secret', lead_notify_secret,
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object(
        'sessionId', NEW.id
      )
    );
    
    RAISE NOTICE 'Triggered notify-lead for session: %', NEW.id;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the update
    RAISE WARNING 'Failed to call notify-lead: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- Create trigger on lead_sessions for completed=true
DROP TRIGGER IF EXISTS trigger_notify_on_lead_complete ON public.lead_sessions;

CREATE TRIGGER trigger_notify_on_lead_complete
AFTER UPDATE ON public.lead_sessions
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_lead_complete();