-- ============================================================================
-- PROCEDÊNCIA DA COTAÇÃO
-- ============================================================================
--
-- `fx_rates` tinha UMA linha em 10/09/2026: USD, 2026-07-11, 5.1064. A
-- AwesomeAPI vinha devolvendo 429 em toda tentativa, porque o cron pedia
-- cotação POR CONTA a cada 5 minutos (~576 chamadas/dia, muito acima do que o
-- plano gratuito aceita). O `catch` reaproveitava a última cotação conhecida e
-- seguia em silêncio: dois meses de métricas em real com câmbio de 11 de julho.
--
-- `origem_date` resolve o conflito entre as duas coisas que precisam ser
-- verdade ao mesmo tempo:
--
--   a) precisa existir uma linha para HOJE, senão toda execução tenta buscar de
--      novo e o 429 nunca sai;
--   b) a linha de hoje não pode fingir que a cotação é de hoje.
--
-- Com `origem_date`, a linha de hoje diz "esta é a taxa de 11/07 sendo
-- reaproveitada", o `ad_spend.fx_rate_date` grava 11/07 (não hoje), e
-- `fx_status` marca `stale`. A auditoria de 2027 vê a data real.
ALTER TABLE public.fx_rates
  ADD COLUMN IF NOT EXISTS origem_date DATE;

COMMENT ON COLUMN public.fx_rates.origem_date IS
  'Data em que esta cotacao foi realmente obtida da fonte. Igual a `date` quando fresca; anterior quando a linha do dia e reaproveitamento de uma cotacao antiga.';

-- A única linha existente é cotação genuína do dia dela.
UPDATE public.fx_rates SET origem_date = date WHERE origem_date IS NULL;
