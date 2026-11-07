-- Assessoria Parceria: a venda que não tem TCV.
--
-- Existe um terceiro modelo comercial que o sistema não sabia registrar. Nele a
-- Champion não cobra contrato: trabalha por COMISSÃO sobre o resultado do
-- cliente. Não há valor a receber no fechamento, não há parcela, não há Pix.
--
-- Isso não é detalhe de cadastro. Até aqui só existiam dois tipos, e todo
-- `sale_type` que não fosse 'assessoria' era tratado como Sprint em cinco
-- lugares do backend. Uma parceria lançada como está entraria no ticket médio
-- do Sprint com R$ 0 e derrubaria a média de um produto que não tem nada a ver
-- com ela.
--
-- Por que vale a pena ter: parceria costuma ser cliente grande. É a venda que
-- mais diz sobre a operação e a única que hoje não aparece em lugar nenhum.

ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(6,3);

COMMENT ON COLUMN public.manual_sales.commission_pct IS
  'Percentual de comissão da parceria (ex.: 10 = 10% sobre o resultado do cliente). Só se aplica a sale_type = parceria.';

COMMENT ON COLUMN public.manual_sales.sale_type IS
  'Produto vendido: sprint | assessoria | parceria. Parceria é comissionada, não tem TCV no fechamento — revenue nasce zero e amount_received cresce conforme a comissão entra.';

COMMENT ON COLUMN public.manual_sales.revenue IS
  'TCV do contrato. Em parceria começa em zero de propósito: não existe valor contratado, e inventar um faria o faturamento previsto mentir.';

-- Nenhuma linha existente muda de tipo. A parceria só passa a existir daqui
-- para frente, e nada é reclassificado retroativamente sem o Rodger mandar.
