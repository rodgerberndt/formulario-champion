ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS clicked_whatsapp boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS clicked_whatsapp_at timestamptz NULL;