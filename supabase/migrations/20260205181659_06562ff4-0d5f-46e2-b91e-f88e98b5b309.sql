-- Add investimento_faixa column to leads table for ad spend tracking
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS investimento_faixa text;