-- Reembolso é um estado da venda, não um apagamento.
--
-- O caso que motivou: a venda do Jean Brondani (lead de 30/08, faixa de R$ 300
-- a 500 mil, Case Ighor #8) foi reembolsada e a linha foi EXCLUÍDA do painel.
-- Apagar resolveu a receita e quebrou tudo o mais:
--
--   - o criativo perdeu a atribuição: o Case Ighor #8 fechou uma venda grande e
--     o painel passou a dizer que ele nunca fechou nada;
--   - a reunião ficou "realizada" sem desfecho, porque o desfecho verdadeiro —
--     fechou e devolveu — não existia como opção;
--   - o Meta já tinha recebido o Purchase pelo CAPI, e isso não se desfaz. Ele
--     aprendeu que aquele anúncio vende, e continua otimizando para isso;
--   - e a pergunta que mais importa, "por que a gente perde venda depois de
--     fechar?", ficou sem nenhum registro para responder.
--
-- A regra que fica: venda reembolsada CONTINUA na tabela, com data, valor
-- devolvido e motivo. Sai da receita, do TCV, do caixa, da meta e do CAC — mas
-- continua contando como fechamento na atribuição do criativo e na taxa do
-- closer, porque foi isso que aconteceu: o anúncio trouxe e a call fechou.

ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS refunded_at DATE,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS refund_reason TEXT;

COMMENT ON COLUMN public.manual_sales.refunded_at IS
  'Data do reembolso. Preenchida = a venda NÃO conta em receita, TCV, caixa, meta nem CAC. Continua contando como fechamento na atribuição.';
COMMENT ON COLUMN public.manual_sales.refund_amount IS
  'Quanto foi devolvido. Pode ser menor que amount_received (reembolso parcial).';
COMMENT ON COLUMN public.manual_sales.refund_reason IS
  'Por que devolveu, nas palavras de quem atendeu. É o que responde por que a venda não se sustentou.';

CREATE INDEX IF NOT EXISTS idx_manual_sales_refunded
  ON public.manual_sales (refunded_at)
  WHERE refunded_at IS NOT NULL;

-- O desfecho da call ganha a opção que faltava. "Fechou" e "fechou e devolveu"
-- são resultados diferentes e pedem conversas diferentes.
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_motivo_categoria_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_motivo_categoria_check
  CHECK (motivo_categoria IS NULL OR motivo_categoria IN (
    'fechou', 'reembolso', 'preco', 'decisor', 'timing', 'sem_fit', 'concorrente', 'sumiu', 'outro'
  ));

COMMENT ON COLUMN public.meetings.motivo_categoria IS
  'Balde do desfecho da call: fechou, reembolso (fechou e devolveu), preco, decisor, timing, sem_fit, concorrente, sumiu, outro.';
