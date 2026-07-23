-- Quantidade de meses de entrega (25 bodys/mês, copy + edição) atribuídos a uma
-- venda — usada no painel de margem pra calcular o custo de produção acumulado.
ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS delivery_months numeric;
