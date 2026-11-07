-- ============================================================================
-- CAPI: gatilho de servidor no nascimento do lead + reconciliação periódica
-- 09/09/2026
--
-- MOTIVO (caso real, lead 77d9204a "Gustavo Berndt", 09/09 16:46):
-- o lead completou o quiz, chegou em /obrigadosprint, o pixel do navegador
-- disparou os eventos, e a chamada de `fire-capi-events` NUNCA saiu do
-- navegador. Resultado: zero linha em `capi_events_log`, zero reserva em
-- `capi_event_claims`, e `leads.capi_events_sent` vazio. O `/capi-retry`
-- não recupera esse caso porque ele relê FALHAS REGISTRADAS, e aqui não há
-- registro nenhum — a falha é a ausência.
--
-- O QUE ESTA MIGRATION FAZ
--   1. `capi_infra_config`: configuração EM TABELA, não em `app.settings.*`.
--   2. `capi_dispatch_log`: toda tentativa de despacho vira linha, inclusive
--      a que não aconteceu por falta de configuração.
--   3. BEFORE INSERT: propaga ip_address/user_agent da sessão para o lead.
--   4. AFTER INSERT: despacha `fire-capi-events` com caller='trigger'.
--   5. `reconciliar_capi_leads()`: varre leads SEM o evento Lead enviado e
--      reprocessa. Solta reserva órfã antes, senão o id fica travado.
--   6. pg_cron a cada 5 minutos.
--   7. Backfill do IP nos leads antigos que já têm sessão com IP.
--
-- POR QUE FALHOU EM ABRIL: a migration 20260401150755 lia
-- `current_setting('app.settings.service_role_key')`, que nunca foi definido.
-- `current_setting(..., true)` devolve NULL sem erro, o `net.http_post` falhava,
-- e o EXCEPTION engolia. Morreu em silêncio por 5 meses. A configuração em
-- tabela + o log de despacho existem exatamente para isso não repetir.
--
-- POR QUE A CHAVE ANÔNIMA E NÃO A SERVICE ROLE: `fire-capi-events` aceita
-- qualquer POST vindo do gateway (é assim que o front o chama hoje). A chave
-- anônima já é pública, vai no bundle do site. Guardar a service role no banco
-- para isso seria risco sem ganho.
--
-- SEGURANÇA: RLS não protege VIEW e não protege tabela sem policy. As duas
-- tabelas novas nascem com RLS e REVOKE explícito de anon/authenticated.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 1. Configuração ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.capi_infra_config (
  id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  function_base_url TEXT        NOT NULL,
  anon_key          TEXT        NOT NULL,
  gatilho_ativo     BOOLEAN     NOT NULL DEFAULT TRUE,
  reconcilia_ativa  BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Quando preenchido, TODO evento despachado daqui vai para o Test Events do
  -- Gerenciador em vez do conjunto de dados vivo. É o que permite exercitar o
  -- gatilho e a reconciliação em produção sem inventar conversão para o Meta.
  -- Deixar NULL fora de teste.
  test_event_code   TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.capi_infra_config (id, function_base_url, anon_key)
VALUES (1, 'https://qzzyfohzoxiefwbmtclt.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6enlmb2h6b3hpZWZ3Ym10Y2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MTE2MDksImV4cCI6MjA5OTE4NzYwOX0._L9p8zxoF2SkPnoqjcuGn5SpZl7eoKxKZEcijCXgeAg')
ON CONFLICT (id) DO UPDATE
  SET function_base_url = EXCLUDED.function_base_url,
      anon_key          = EXCLUDED.anon_key,
      updated_at        = now();

ALTER TABLE public.capi_infra_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.capi_infra_config FROM anon, authenticated;

-- ── 2. Log de despacho ──────────────────────────────────────────────────────
-- Uma linha por tentativa de DESPACHO (não de envio ao Meta — isso é o
-- capi_events_log). É o que torna "o gatilho não rodou" visível.
CREATE TABLE IF NOT EXISTS public.capi_dispatch_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  origem      TEXT        NOT NULL,
  lead_id     UUID,
  status      TEXT        NOT NULL,
  detalhe     TEXT,
  request_id  BIGINT
);

ALTER TABLE public.capi_dispatch_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.capi_dispatch_log FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_capi_dispatch_log_created ON public.capi_dispatch_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capi_dispatch_log_lead    ON public.capi_dispatch_log (lead_id) WHERE lead_id IS NOT NULL;

COMMENT ON TABLE public.capi_dispatch_log IS
  'Heartbeat do despacho de eventos de nascimento. status: despachado | sem_config | erro | nada_a_fazer. Se a última linha for antiga, a automação está morta — foi assim que o gatilho de abril passou 5 meses sem ninguém notar.';

-- ── 3. BEFORE INSERT: a sessão empresta IP e user agent ao lead ─────────────
-- O front tenta pegar o IP com `get-client-ip` numa Promise.race de 800 ms.
-- Quem está em rede lenta ou no navegador embutido do Instagram perde a
-- corrida e o lead nasce com ip_address NULL — 15 de 102 leads desde 25/08.
-- O dado nunca esteve perdido: `lead_sessions` já tinha o IP, e o lead já
-- aponta para a sessão. Faltava alguém ligar os dois.
CREATE OR REPLACE FUNCTION public.preencher_navegacao_do_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s RECORD;
BEGIN
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ARMADILHA DE TIPO: `lead_sessions.id` é uuid e `leads.session_id` é TEXT
  -- (guarda o champion_session_id do navegador, que nem sempre é uuid).
  -- Comparar os dois direto levanta "operator does not exist: uuid = text", e o
  -- EXCEPTION lá embaixo engoliria — o gatilho viraria no-op silencioso, que é
  -- exatamente o que aconteceu com a versão de abril. Só compara o que tem
  -- cara de uuid.
  IF NEW.session_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN NEW;
  END IF;

  IF NEW.ip_address IS NOT NULL AND NEW.user_agent IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT ip_address, user_agent INTO s
  FROM public.lead_sessions
  WHERE id = NEW.session_id::uuid;

  IF FOUND THEN
    NEW.ip_address := COALESCE(NEW.ip_address, s.ip_address);
    NEW.user_agent := COALESCE(NEW.user_agent, s.user_agent);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Enriquecer NUNCA pode derrubar o insert do lead. O lead vale mais que o IP.
  RAISE WARNING 'preencher_navegacao_do_lead: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_navegacao_do_lead ON public.leads;
CREATE TRIGGER trigger_navegacao_do_lead
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.preencher_navegacao_do_lead();

-- ── 4. Despacho compartilhado ───────────────────────────────────────────────
-- Usado pelo gatilho e pela reconciliação. Sempre grava em capi_dispatch_log,
-- inclusive quando NÃO despacha.
CREATE OR REPLACE FUNCTION public.despachar_capi_lead(p_lead_id UUID, p_origem TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg RECORD;
  req_id BIGINT;
BEGIN
  SELECT * INTO cfg FROM public.capi_infra_config WHERE id = 1;

  IF NOT FOUND OR cfg.function_base_url IS NULL OR cfg.anon_key IS NULL THEN
    INSERT INTO public.capi_dispatch_log (origem, lead_id, status, detalhe)
    VALUES (p_origem, p_lead_id, 'sem_config', 'capi_infra_config ausente ou incompleta');
    RETURN NULL;
  END IF;

  IF p_origem = 'trigger' AND NOT cfg.gatilho_ativo THEN
    INSERT INTO public.capi_dispatch_log (origem, lead_id, status, detalhe)
    VALUES (p_origem, p_lead_id, 'desligado', 'gatilho_ativo = false');
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := cfg.function_base_url || '/functions/v1/fire-capi-events',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'apikey', cfg.anon_key,
                 'Authorization', 'Bearer ' || cfg.anon_key
               ),
    body    := jsonb_build_object('lead_db_id', p_lead_id, 'caller', p_origem)
                 || CASE WHEN cfg.test_event_code IS NOT NULL
                         THEN jsonb_build_object('test_event_code', cfg.test_event_code)
                         ELSE '{}'::jsonb END,
    timeout_milliseconds := 8000
  ) INTO req_id;

  INSERT INTO public.capi_dispatch_log (origem, lead_id, status, request_id)
  VALUES (p_origem, p_lead_id, 'despachado', req_id);

  RETURN req_id;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.capi_dispatch_log (origem, lead_id, status, detalhe)
    VALUES (p_origem, p_lead_id, 'erro', SQLERRM);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END;
$$;

-- ── 5. AFTER INSERT: o caminho garantido ────────────────────────────────────
-- O front continua sendo o fast path (dispara em ~1 s, com os event_ids que o
-- pixel também usa). Este gatilho é a rede: não depende de o navegador
-- sobreviver. Os dois chegam ao MESMO event_id determinístico, e o meta-capi
-- reserva antes de enviar — quem chega segundo recebe `deduplicated`.
CREATE OR REPLACE FUNCTION public.notify_capi_on_lead_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.despachar_capi_lead(NEW.id, 'trigger');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_capi_on_lead_insert: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_capi_on_lead_insert ON public.leads;
CREATE TRIGGER trigger_capi_on_lead_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_capi_on_lead_insert();

-- ── 6. Reconciliação ────────────────────────────────────────────────────────
-- O `/capi-retry` do admin-data relê FALHAS REGISTRADAS no capi_events_log.
-- Ele não enxerga o caso do Gustavo, onde não existe registro nenhum. Esta
-- rotina é complementar: varre LEADS, não logs.
--
-- Critério de pendência: falta a chave 'Lead' em capi_events_sent. Só ela.
-- O `Lead` é o único evento que TODO lead gera, e o `fire-capi-events` já
-- decide sozinho o resto (tier, MQL ou Sprint) e pula o que já foi. Repetir a
-- régua de faixa aqui em SQL criaria uma segunda fonte de verdade — que é
-- exatamente o bug do `kommo_status` que o CRM evitou.
CREATE OR REPLACE FUNCTION public.reconciliar_capi_leads(
  p_horas INT DEFAULT 48,
  p_max   INT DEFAULT 20
)
RETURNS TABLE (pendentes INT, despachados INT, orfas_soltas INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg          RECORD;
  n_orfas      INT := 0;
  n_pendentes  INT := 0;
  n_despachou  INT := 0;
  r            RECORD;
BEGIN
  SELECT * INTO cfg FROM public.capi_infra_config WHERE id = 1;
  IF NOT FOUND OR NOT cfg.reconcilia_ativa THEN
    INSERT INTO public.capi_dispatch_log (origem, status, detalhe)
    VALUES ('reconciliacao', 'desligado', 'reconcilia_ativa = false ou sem config');
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  -- Reserva órfã trava o event_id para sempre: quem morreu entre reservar e
  -- enviar deixa a linha sem sent_at, e nenhum chamador consegue reenviar.
  WITH soltas AS (
    DELETE FROM public.capi_event_claims
    WHERE sent_at IS NULL
      AND claimed_at < now() - INTERVAL '10 minutes'
    RETURNING 1
  )
  SELECT count(*)::INT INTO n_orfas FROM soltas;

  FOR r IN
    SELECT l.id
    FROM public.leads l
    WHERE l.created_at >= now() - (p_horas || ' hours')::INTERVAL
      -- 2 minutos de carência: o front e o gatilho já estão a caminho.
      AND l.created_at <= now() - INTERVAL '2 minutes'
      AND NOT (COALESCE(l.capi_events_sent, '{}'::jsonb) ? 'Lead')
      -- Não insistir em quem já foi despachado agora há pouco.
      AND NOT EXISTS (
        SELECT 1 FROM public.capi_dispatch_log d
        WHERE d.lead_id = l.id
          AND d.origem = 'reconciliacao'
          AND d.status = 'despachado'
          AND d.created_at > now() - INTERVAL '15 minutes'
      )
    ORDER BY l.created_at DESC
    LIMIT p_max
  LOOP
    n_pendentes := n_pendentes + 1;
    IF public.despachar_capi_lead(r.id, 'reconciliacao') IS NOT NULL THEN
      n_despachou := n_despachou + 1;
    END IF;
  END LOOP;

  -- Batimento cardíaco: grava SEMPRE, inclusive quando não havia nada.
  -- Sem isso, "a rotina morreu" e "não havia lead pendente" ficam idênticos.
  INSERT INTO public.capi_dispatch_log (origem, status, detalhe)
  VALUES ('reconciliacao', CASE WHEN n_pendentes = 0 THEN 'nada_a_fazer' ELSE 'varredura' END,
          format('pendentes=%s despachados=%s orfas=%s janela=%sh', n_pendentes, n_despachou, n_orfas, p_horas));

  RETURN QUERY SELECT n_pendentes, n_despachou, n_orfas;
END;
$$;

REVOKE ALL ON FUNCTION public.reconciliar_capi_leads(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliar_capi_leads(INT, INT) TO service_role;
REVOKE ALL ON FUNCTION public.despachar_capi_lead(UUID, TEXT)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.despachar_capi_lead(UUID, TEXT) TO service_role;

-- ── 7. Cron a cada 5 minutos ────────────────────────────────────────────────
-- Versionado aqui de propósito: a auditoria de 07/09 achou que NENHUM cron do
-- projeto está em migration, todos foram criados na mão no painel e somem se o
-- projeto for restaurado.
DO $cron$
BEGIN
  PERFORM cron.unschedule('capi-reconciliacao');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$cron$;

SELECT cron.schedule(
  'capi-reconciliacao',
  '*/5 * * * *',
  $cron$ SELECT public.reconciliar_capi_leads(48, 20); $cron$
);

-- ── 8. Backfill do IP que já existia na sessão ──────────────────────────────
-- Os 15 leads que nasceram sem IP desde 25/08 já tinham o dado na sessão.
UPDATE public.leads l
SET ip_address = s.ip_address
FROM public.lead_sessions s
WHERE l.session_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND s.id = l.session_id::uuid
  AND l.ip_address IS NULL
  AND s.ip_address IS NOT NULL;

UPDATE public.leads l
SET user_agent = s.user_agent
FROM public.lead_sessions s
WHERE l.session_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND s.id = l.session_id::uuid
  AND l.user_agent IS NULL
  AND s.user_agent IS NOT NULL;
