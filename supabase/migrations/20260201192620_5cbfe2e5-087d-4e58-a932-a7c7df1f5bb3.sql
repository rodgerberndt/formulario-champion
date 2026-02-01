-- Adicionar novos campos para scoring e qualificação na tabela leads
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS empresa text,
ADD COLUMN IF NOT EXISTS segmento text,
ADD COLUMN IF NOT EXISTS decisor boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS faturamento_faixa text,
ADD COLUMN IF NOT EXISTS trafego_faixa text,
ADD COLUMN IF NOT EXISTS ticket_faixa text,
ADD COLUMN IF NOT EXISTS gargalo text,
ADD COLUMN IF NOT EXISTS objetivo text,
ADD COLUMN IF NOT EXISTS timing text,
ADD COLUMN IF NOT EXISTS orcamento_faixa text,
ADD COLUMN IF NOT EXISTS score integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tier text,
ADD COLUMN IF NOT EXISTS raw_answers_json jsonb;