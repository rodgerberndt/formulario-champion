-- Drop the problematic trigger and function
DROP TRIGGER IF EXISTS on_lead_insert_notify_kommo ON public.leads;
DROP FUNCTION IF EXISTS public.notify_kommo_on_new_lead();