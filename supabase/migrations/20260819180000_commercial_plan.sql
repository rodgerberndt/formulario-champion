-- Premissas do redimensionamento comercial (aba "Metas Comercial").
--
-- O forecast em si NUNCA é salvo: ele é recalculado a cada abertura a partir do
-- histórico real (ad_spend, leads, meetings, manual_sales). O que fica gravado
-- aqui são só as PREMISSAS que o time escolheu — investimento, split de verba
-- entre teste e escala, esteira de criativos e a fila de testes A/B — porque
-- essas são decisão, não medição.
--
-- Linha única (id = 'default'). Versionar por mês seria dado morto: quando a
-- premissa muda, ela muda para o plano inteiro.
CREATE TABLE IF NOT EXISTS public.commercial_plan (
  id text PRIMARY KEY DEFAULT 'default',
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commercial_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on commercial_plan"
ON public.commercial_plan
FOR ALL
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.commercial_plan IS
  'Premissas do plano comercial de 6 meses. O forecast é derivado do histórico real a cada requisição.';
