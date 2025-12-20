-- Fix function search_path security
CREATE OR REPLACE FUNCTION public.notify_kommo_on_new_lead()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  payload jsonb;
  supabase_url text;
  anon_key text;
BEGIN
  -- Build the payload
  payload := jsonb_build_object(
    'id', NEW.id,
    'nome_completo', NEW.nome_completo,
    'whatsapp', NEW.whatsapp,
    'instagram', NEW.instagram,
    'mercado', NEW.mercado,
    'estagio_negocio', NEW.estagio_negocio,
    'dor_desejo', NEW.dor_desejo,
    'created_at', NEW.created_at
  );

  -- Get Supabase URL from environment
  supabase_url := 'https://troqylihudenqjsxsnwy.supabase.co';
  anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyb3F5bGlodWRlbnFqc3hzbnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNTMwMjYsImV4cCI6MjA4MTgyOTAyNn0.yA6Wl37g-0ZHB20YL8fIwB9GtfyIbSoGr_HHbJz20tM';

  -- Call the edge function asynchronously
  PERFORM extensions.http_post(
    url := supabase_url || '/functions/v1/kommo-webhook',
    body := payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    )
  );

  RETURN NEW;
END;
$$;