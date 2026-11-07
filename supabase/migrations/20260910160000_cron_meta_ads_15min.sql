-- ============================================================================
-- O AGENDAMENTO DO SYNC DE MÍDIA, VERSIONADO — e a cada 15 minutos
-- ============================================================================
--
-- Este job existia desde sempre FORA do versionamento: foi criado direto no
-- banco, sem migration, sem revisão e sem documentação. Em 10/09/2026 isso
-- custou quatro dias de gasto invisível no painel — não por culpa do job, que
-- rodava certinho, mas porque ninguém sabia o que ele fazia nem contra quais
-- contas. Um relógio que sustenta todas as métricas de dinheiro precisa ter
-- fonte de verdade legível.
--
-- ── Duas correções ─────────────────────────────────────────────────────────
--
-- 1. O NOME MENTIA. `meta-ads-sync-5min` aponta para `/meta-ads-cron`, não para
--    a função `meta-ads-sync` (aposentada em 10/09/2026). Passei uma auditoria
--    inteira convencido de que o cron estava morto por causa desse nome. Agora
--    se chama `meta-ads-cron-15min`, que é o que ele de fato faz.
--
-- 2. 5 MINUTOS NÃO COMPRAVA NADA. A janela do sync é de 3 dias, então cada
--    execução reescrevia as mesmas linhas: 288 chamadas por dia por conta, para
--    um número que a própria Meta não atualiza nesse ritmo. Com 7 contas
--    cadastradas seriam 2.016 chamadas/dia de um endpoint pesado.
--
--    A 15 minutos: 96 execuções/dia, 672 com as 7 contas — um terço da cota
--    anterior. O "gasto de hoje" fica no máximo 15 minutos defasado, o que é
--    invisível para uma decisão de verba, e o health check SYNC_STALE continua
--    com folga larga no seu limiar de 36h.
--
-- O câmbio saiu da conta: desde 10/09 a cotação é cacheada por MOEDA com uma
-- linha por dia, então são ~1 chamada/dia por moeda em vez das ~576 que
-- mantinham a AwesomeAPI em 429 permanente.
--
-- ── O que este job NÃO decide ──────────────────────────────────────────────
-- Quais contas sincronizam. Isso é `meta_ad_accounts.sync_enabled`. O job só
-- bate na porta; quem responde é o cadastro.

-- O nome antigo sai. `cron.unschedule` lança se o job não existir, então o
-- bloco tolera a ausência — a migration precisa poder rodar num banco limpo.
DO $$
BEGIN
  PERFORM cron.unschedule('meta-ads-sync-5min');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'job meta-ads-sync-5min nao existia, seguindo';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('meta-ads-cron-15min');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'job meta-ads-cron-15min nao existia, seguindo';
END;
$$;

SELECT cron.schedule(
  'meta-ads-cron-15min',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://qzzyfohzoxiefwbmtclt.supabase.co/functions/v1/meta-ads-cron',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);

DO $$
DECLARE agendado INTEGER;
BEGIN
  SELECT count(*) INTO agendado FROM cron.job
   WHERE jobname = 'meta-ads-cron-15min' AND schedule = '*/15 * * * *' AND active;
  IF agendado <> 1 THEN
    RAISE EXCEPTION 'esperava 1 job meta-ads-cron-15min ativo, encontrei %', agendado;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-ads-sync-5min') THEN
    RAISE EXCEPTION 'o job antigo meta-ads-sync-5min ainda existe';
  END IF;
END;
$$;
