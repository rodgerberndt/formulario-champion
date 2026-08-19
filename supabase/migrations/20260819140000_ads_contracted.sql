-- Quantidade de criativos (ads) contratados na venda.
--
-- O custo de entrega era calculado com 25 bodys por mês FIXO para todo cliente,
-- o que não tem relação com o que foi vendido. O contrato do Enzo Garcia, por
-- exemplo, é de 150 ads em 3 meses: 50 criativos por mês, e como cada body
-- rende 4 ganchos, são 12 bodys por mês, 36 no total. O sistema contava 75.
--
-- Com o número de ads registrado, o custo de entrega passa a sair do contrato:
--   bodys por mês = piso( (ads / meses) / 4 )
--   bodys totais  = bodys por mês × meses
ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS ads_contracted integer;

COMMENT ON COLUMN public.manual_sales.ads_contracted IS
  'Criativos (ads) contratados no total do contrato. Base do custo de entrega: cada 4 ganchos = 1 body.';

-- Backfill do único contrato em que a quantidade estava anotada na observação.
UPDATE public.manual_sales
   SET ads_contracted = 150
 WHERE notes ILIKE '%Enzo garcia%' AND ads_contracted IS NULL;
