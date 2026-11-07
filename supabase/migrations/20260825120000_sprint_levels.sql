-- Quantidade de sprints vendidos numa venda de Sprint.
--
-- Até aqui cada linha de `manual_sales` do tipo "sprint" contava como UMA
-- venda, mas o Sprint é vendido por nível: uma venda de R$ 797 é um "Sprint
-- nível 4" (16 ads, quatro sprints), não um sprint só. Contar linhas em vez de
-- níveis subestimava o volume vendido e inflava o ticket médio do produto, que
-- aparecia como R$ 804 quando o preço unitário é ~R$ 200.
--
-- A coluna é preenchida no formulário de venda. Fica NULL para assessoria, que
-- não tem nível, e para vendas antigas que ninguém revisitar — quem lê deve
-- tratar NULL como "uma unidade", nunca como zero.
ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS sprint_levels integer;

COMMENT ON COLUMN public.manual_sales.sprint_levels IS
  'Quantidade de sprints da venda (nível). NULL = não informado, trate como 1. Só se aplica a sale_type = sprint.';

-- Preenche o histórico pelo preço unitário praticado (~R$ 200 por nível).
-- Só toca em linhas de sprint ainda sem nível, e nunca grava menos que 1.
UPDATE public.manual_sales
SET sprint_levels = GREATEST(1, ROUND(revenue / 200.0)::int)
WHERE sale_type = 'sprint'
  AND sprint_levels IS NULL
  AND revenue > 0;
