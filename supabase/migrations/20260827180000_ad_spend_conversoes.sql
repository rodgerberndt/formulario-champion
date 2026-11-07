-- Conversões que o Meta atribui a cada anúncio.
--
-- O `meta-ads-cron` já pedia `actions` ao Marketing API, mas só usava para
-- contar visualizações de página. Compra e valor de compra iam junto na mesma
-- resposta e eram descartados, então o banco nunca soube de faturamento vindo
-- do pixel: a única visão de receita por criativo era o que o time digita à mão
-- em `manual_sales`.
--
-- Em 27/08/2026 isso custou caro: um conjunto do teste de subheadline foi
-- pausado por "não ter resultado" enquanto o gerenciador mostrava duas compras
-- nele. O dado existia no Meta e não existia aqui, então nenhuma análise feita
-- sobre este banco poderia tê-lo visto.

ALTER TABLE public.ad_spend
  ADD COLUMN IF NOT EXISTS purchases INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_value_original NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_leads INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ad_spend.purchases IS
  'Compras atribuídas pelo Meta a este anúncio no dia. Atribuição do Meta, não do nosso funil: pode contar view-through e não bate necessariamente com manual_sales.';
COMMENT ON COLUMN public.ad_spend.purchase_value IS
  'Valor das compras atribuídas, convertido para BRL pela mesma taxa do spend do dia.';
COMMENT ON COLUMN public.ad_spend.meta_leads IS
  'Eventos de lead atribuídos pelo Meta. Serve de contraprova do lead que chega pelo formulário.';
