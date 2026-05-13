-- Add operacoes_ativas column to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS operacoes_ativas smallint;

-- Add comment for documentation
COMMENT ON COLUMN public.leads.operacoes_ativas IS 'Numero de operacoes ativas ou em construcao (0-10)';