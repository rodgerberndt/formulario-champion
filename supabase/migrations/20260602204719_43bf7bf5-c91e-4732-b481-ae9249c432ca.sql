ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'tcv_total',
  ADD COLUMN IF NOT EXISTS installments_count INTEGER,
  ADD COLUMN IF NOT EXISTS installment_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS amount_received NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.manual_sales.payment_type IS 'tcv_total | pix_parcelado | recorrencia';
COMMENT ON COLUMN public.manual_sales.installments_count IS 'Número de parcelas (Pix parcelado) ou meses (recorrência opcional)';
COMMENT ON COLUMN public.manual_sales.installment_value IS 'Valor de cada parcela / mensalidade';
COMMENT ON COLUMN public.manual_sales.amount_received IS 'Quanto já entrou na conta (caixa). revenue continua sendo o TCV.';

-- Backfill: vendas antigas tratamos como TCV à vista, já recebidas
UPDATE public.manual_sales
SET amount_received = revenue
WHERE amount_received = 0 AND payment_type = 'tcv_total';