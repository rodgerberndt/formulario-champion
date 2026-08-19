-- Bodys por mês contratados, quando o contrato é fechado em bodys e não em ads.
--
-- É assim que a maioria dos contratos é vendida ("25B mês"). O do Enzo Garcia
-- foi fechado em criativos (150 ads em 3 meses), que a 4 ganchos por body dá 12
-- bodys por mês. Os dois formatos convivem, então cada venda guarda o que foi
-- efetivamente combinado em vez de herdar um padrão fixo.
ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS bodies_per_month integer;

COMMENT ON COLUMN public.manual_sales.bodies_per_month IS
  'Bodys por mês do contrato. Usado quando ads_contracted não está preenchido.';

-- Os quatro contratos de assessoria anteriores ao Enzo são de 25 bodys/mês.
UPDATE public.manual_sales
   SET bodies_per_month = 25
 WHERE sale_type = 'assessoria'
   AND ads_contracted IS NULL
   AND bodies_per_month IS NULL
   AND delivery_months IS NOT NULL;
