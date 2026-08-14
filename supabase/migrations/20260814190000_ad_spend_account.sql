-- Conta de anúncios de origem de cada linha de gasto.
--
-- Até aqui o sync lia UMA conta só (env META_AD_ACCOUNT_ID). Quando o teste de
-- headline passou a rodar numa conta nova, o painel ficou cego pro gasto dele:
-- media entrada no quiz por variante, mas não custo por lead. Com o sync
-- puxando várias contas, a coluna diz de qual conta veio cada linha — sem ela
-- não dá pra separar "conta de teste" de "conta principal" no relatório.
ALTER TABLE public.ad_spend
  ADD COLUMN IF NOT EXISTS ad_account_id text;

CREATE INDEX IF NOT EXISTS idx_ad_spend_account ON public.ad_spend (ad_account_id);
