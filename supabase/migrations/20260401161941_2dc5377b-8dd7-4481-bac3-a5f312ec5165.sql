DROP TRIGGER IF EXISTS trigger_capi_on_lead_insert ON public.leads;
DROP TRIGGER IF EXISTS trigger_notify_kommo_on_lead_insert ON public.leads;
DROP FUNCTION IF EXISTS notify_capi_on_lead_insert() CASCADE;
DROP FUNCTION IF EXISTS notify_kommo_on_lead_insert() CASCADE;