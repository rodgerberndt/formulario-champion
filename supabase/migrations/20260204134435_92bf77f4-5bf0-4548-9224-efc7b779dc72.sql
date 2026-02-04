-- Update the trigger function to use INTERNAL_WEBHOOK_SECRET instead of lead_notify_secret
-- since INTERNAL_WEBHOOK_SECRET is already configured in app.settings
CREATE OR REPLACE FUNCTION public.notify_on_lead_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  internal_secret TEXT;
BEGIN
  -- Only trigger when completed changes from false to true
  IF NEW.completed = true AND (OLD.completed IS NULL OR OLD.completed = false) THEN
    -- Get environment variables
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);
    internal_secret := current_setting('app.settings.internal_webhook_secret', true);
    
    -- Call the edge function using pg_net (async HTTP request)
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/notify-lead',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', internal_secret,
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