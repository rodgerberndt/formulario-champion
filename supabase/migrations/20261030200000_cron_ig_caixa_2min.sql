-- ============================================================================
-- LEITOR DA CAIXA DO CHAMPION DIRECT, A CADA 2 MINUTOS (30/10/2026)
-- ============================================================================
--
-- As conversas que o ManyChat abre (boas-vindas do novo seguidor e o clique
-- "Simm") não chegam no webhook do Instagram. De 14 a 30/10 a caixa tinha 26
-- boas-vindas e 3 cliques; o webhook viu 2 boas-vindas e nenhum clique, e o
-- fluxo "Novo seguidor · Sim" nunca disparou. A função ig-caixa lê a caixa pela
-- API de conversas e entrega ao motor o que faltou.
--
-- 2 minutos: o clique precisa virar a pergunta do nome enquanto a pessoa ainda
-- está no direct. São 720 execuções/dia, cada uma com 1 chamada de lista e 1 por
-- conversa que mudou.

DO $$
BEGIN
  PERFORM cron.unschedule('ig-caixa-2min');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'job ig-caixa-2min nao existia, seguindo';
END;
$$;

SELECT cron.schedule(
  'ig-caixa-2min',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := 'https://qzzyfohzoxiefwbmtclt.supabase.co/functions/v1/ig-caixa',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);

DO $$
DECLARE agendado INTEGER;
BEGIN
  SELECT count(*) INTO agendado FROM cron.job
   WHERE jobname = 'ig-caixa-2min' AND schedule = '*/2 * * * *' AND active;
  IF agendado <> 1 THEN
    RAISE EXCEPTION 'esperava 1 job ig-caixa-2min ativo, encontrei %', agendado;
  END IF;
END;
$$;
