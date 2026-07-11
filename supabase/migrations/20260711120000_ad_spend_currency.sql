-- ad_spend.spend era gravado com o valor bruto retornado pelo Meta Ads API,
-- sem conversão de moeda. A conta de anúncios fatura em USD, então todo o
-- funil (CPL, CPMQL, ROAS, CAC etc.) estava tratando dólares como se fossem
-- reais. Guardamos o valor original + moeda + taxa usada para auditoria,
-- e `spend` passa a ser sempre o valor já convertido para BRL.
ALTER TABLE public.ad_spend
  ADD COLUMN IF NOT EXISTS spend_original NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS spend_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,6);
