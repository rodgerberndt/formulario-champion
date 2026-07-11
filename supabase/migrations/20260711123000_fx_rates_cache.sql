-- Cache diário de cotação de câmbio. O cron de gasto do Meta Ads roda a
-- cada 5 minutos; sem cache, cada execução batia na AwesomeAPI e isso
-- disparava rate limit (429), derrubando o sync inteiro. Como só
-- precisamos da cotação "de hoje", basta buscar 1x por dia por moeda.
CREATE TABLE IF NOT EXISTS public.fx_rates (
  currency TEXT NOT NULL,
  date DATE NOT NULL,
  rate NUMERIC(12,6) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (currency, date)
);

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
