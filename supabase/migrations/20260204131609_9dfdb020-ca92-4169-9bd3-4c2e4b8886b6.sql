-- Add WhatsApp notification tracking columns to lead_sessions
ALTER TABLE public.lead_sessions 
ADD COLUMN IF NOT EXISTS rodger_whatsapp_notified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rodger_whatsapp_notified_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rodger_whatsapp_message_id text,
ADD COLUMN IF NOT EXISTS rodger_whatsapp_last_error text;

-- Create index for faster lookup of unnotified completed sessions
CREATE INDEX IF NOT EXISTS idx_lead_sessions_notification_pending 
ON public.lead_sessions (completed, rodger_whatsapp_notified) 
WHERE completed = true AND rodger_whatsapp_notified = false;