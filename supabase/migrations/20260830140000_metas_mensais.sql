-- Metas mensais, uma linha por mês.
--
-- Substitui a aba Metas Comercial, que misturava simular e acompanhar. Aqui não
-- há forecast: a meta é um número decidido, e o painel mostra o realizado ao
-- lado. Quem quiser refazer a cascata refaz em documento, não em simulador.
--
-- A quebra semanal NÃO é gravada: ela é derivada do calendário, proporcional aos
-- dias úteis de cada semana. Gravar cinco linhas por mês seria criar cinco
-- lugares para o número divergir.

CREATE TABLE IF NOT EXISTS public.commercial_goals (
  -- 'YYYY-MM'. Chave natural: uma meta por mês, e o mês é como todo mundo fala.
  month                TEXT PRIMARY KEY CHECK (month ~ '^\d{4}-\d{2}$'),
  midia                NUMERIC(12,2),
  mql                  INTEGER,
  reunioes_agendadas   INTEGER,
  reunioes_realizadas  INTEGER,
  contratos_assessoria NUMERIC(6,1),
  vendas_sprint        NUMERIC(6,1),
  tcv_assessoria       NUMERIC(12,2),
  tcv_sprint           NUMERIC(12,2),
  tcv_total            NUMERIC(12,2),
  caixa                NUMERIC(12,2),
  -- Sem meta ainda: o custo fixo mudou com as contratações e não foi refeito.
  -- Nulo aqui significa "mostrar o realizado e deixar a meta em branco".
  margem_contribuicao  NUMERIC(12,2),
  observacao           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.commercial_goals IS
  'Meta por mês. O realizado é calculado na leitura, nunca gravado aqui.';
COMMENT ON COLUMN public.commercial_goals.midia IS
  'Meta de investimento em BRL. A conta de anúncios é em dólar: comparar sempre com ad_spend.spend, que já vem convertido.';
COMMENT ON COLUMN public.commercial_goals.margem_contribuicao IS
  'Nulo = sem meta definida. A linha aparece no painel mostrando só o realizado.';

CREATE OR REPLACE FUNCTION public.set_commercial_goals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commercial_goals_updated_at ON public.commercial_goals;
CREATE TRIGGER commercial_goals_updated_at
  BEFORE UPDATE ON public.commercial_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_commercial_goals_updated_at();

ALTER TABLE public.commercial_goals ENABLE ROW LEVEL SECURITY;

-- Meta de setembro de 2026, cascata de 30/08 com verba de R$ 25 mil:
-- CPMQL R$ 165 e R$ 613 por reunião agendada (medidos em agosto, com 3,9% de
-- encarecimento pela escala de verba), comparecimento de 85,7% e fechamento de
-- 30% na call — este último por decisão, não por medição.
INSERT INTO public.commercial_goals (
  month, midia, mql, reunioes_agendadas, reunioes_realizadas,
  contratos_assessoria, vendas_sprint, tcv_assessoria, tcv_sprint, tcv_total, caixa, observacao
) VALUES (
  '2026-09', 25000, 151, 41, 35, 10.5, 11, 220266, 9551, 229817, 153977,
  'Cascata de 30/08/2026. Condição: 2 editores e 1 copy produzindo até 05/09, senão segurar a verba em R$ 20 mil.'
)
ON CONFLICT (month) DO UPDATE SET
  midia = EXCLUDED.midia, mql = EXCLUDED.mql,
  reunioes_agendadas = EXCLUDED.reunioes_agendadas,
  reunioes_realizadas = EXCLUDED.reunioes_realizadas,
  contratos_assessoria = EXCLUDED.contratos_assessoria,
  vendas_sprint = EXCLUDED.vendas_sprint,
  tcv_assessoria = EXCLUDED.tcv_assessoria,
  tcv_sprint = EXCLUDED.tcv_sprint,
  tcv_total = EXCLUDED.tcv_total,
  caixa = EXCLUDED.caixa,
  observacao = EXCLUDED.observacao;
