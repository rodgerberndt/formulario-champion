ALTER TABLE public.manual_sales 
ADD COLUMN sale_type TEXT NOT NULL DEFAULT 'sprint';

COMMENT ON COLUMN public.manual_sales.sale_type IS 'Tipo da venda: sprint ou assessoria';