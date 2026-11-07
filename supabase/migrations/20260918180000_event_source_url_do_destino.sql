-- ============================================================================
-- O event_source_url DO GATILHO PASSA A SER O DESTINO REAL DO LEAD
-- 18/09/2026
--
-- NÃO APLICADA por quem escreveu. Roteiro no fim do arquivo.
--
-- ── O defeito ───────────────────────────────────────────────────────────────
-- `despachar_capi_lead` (migration 20260909180000) manda só `{lead_db_id,
-- caller}` para o `fire-capi-events`. Sem `event_source_url`, a function cai no
-- palpite:
--
--   sourceUrl = base + (faixa é MQL ? '/obrigadomql' : '/obrigadosprint')
--
-- Esse palpite envelheceu em 17/09/2026, quando o formulário do topo passou a
-- mandar TODO lead para /obrigadomql (e ≥ R$ 100 mil para /agendar antes).
-- Resultado: lead de faixa abaixo de R$ 10 mil vindo do formulário vai para
-- /obrigadomql, o pixel do navegador dispara de lá, e o evento irmão do
-- SERVIDOR sai carimbado /obrigadosprint — uma página que o lead nunca viu.
--
-- O que isso custa: a desduplicação continua funcionando (ela é por `event_id`,
-- e o id é determinístico dos dois lados), mas o Meta recebe duas URLs
-- diferentes para o mesmo evento. `event_source_url` é sinal de qualidade de
-- correspondência e é o que aparece no diagnóstico do Gerenciador; URL que não
-- existe na jornada polui os dois.
--
-- ── A correção ──────────────────────────────────────────────────────────────
-- O navegador passa a gravar o destino no próprio lead (`destino_conversao`,
-- coluna nova) no MESMO insert, e o gatilho repassa esse valor. Quando a coluna
-- está vazia (lead antigo, ou site ainda não deployado), o comportamento é
-- EXATAMENTE o de hoje — nada muda para trás.
--
-- ── Por que NÃO usar `leads.page_url` ───────────────────────────────────────
-- `page_url` é a página de ORIGEM (a landing, /HD3), não o destino. Usá-la como
-- event_source_url garantiria divergência com o pixel, que dispara na página de
-- obrigado. Ela continua servindo para o que serve: dizer de onde o lead veio.
--
-- ── O que esta migration NÃO muda ───────────────────────────────────────────
-- Nada de event_id, reserva (`capi_event_claims`), regra de MQL/Sprint ou
-- valor do evento. Só a URL declarada.
-- ============================================================================

-- ── 1. Onde o destino real do lead fica ─────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS destino_conversao TEXT;

COMMENT ON COLUMN public.leads.destino_conversao IS
  'URL absoluta da pagina para onde o lead foi depois de enviar (/obrigadomql, /obrigadosprint, /agendar). Gravada pelo navegador no insert e usada como event_source_url pelo despacho do servidor, para bater com a URL onde o pixel dispara os eventos irmaos.';

-- ── 2. O despacho passa a mandar a URL ──────────────────────────────────────
-- Mesma função de 20260909180000, com duas linhas a mais. Idempotente:
-- CREATE OR REPLACE, e o corpo não depende do que havia antes.
CREATE OR REPLACE FUNCTION public.despachar_capi_lead(p_lead_id UUID, p_origem TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg      RECORD;
  req_id   BIGINT;
  v_destino TEXT;
  v_corpo  JSONB;
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

  -- O destino real, gravado pelo navegador. Caminho relativo vira absoluto;
  -- valor ausente ou estranho é ignorado e a function decide como sempre
  -- decidiu — nunca se inventa URL aqui.
  SELECT destino_conversao INTO v_destino FROM public.leads WHERE id = p_lead_id;
  IF v_destino IS NOT NULL AND btrim(v_destino) <> '' THEN
    IF v_destino LIKE '/%' THEN
      v_destino := 'https://www.championadstudio.com' || v_destino;
    ELSIF v_destino NOT LIKE 'http%' THEN
      v_destino := NULL;
    END IF;
  ELSE
    v_destino := NULL;
  END IF;

  v_corpo := jsonb_build_object('lead_db_id', p_lead_id, 'caller', p_origem)
             || CASE WHEN v_destino IS NOT NULL
                     THEN jsonb_build_object('event_source_url', v_destino)
                     ELSE '{}'::jsonb END
             || CASE WHEN cfg.test_event_code IS NOT NULL
                     THEN jsonb_build_object('test_event_code', cfg.test_event_code)
                     ELSE '{}'::jsonb END;

  SELECT net.http_post(
    url     := cfg.function_base_url || '/functions/v1/fire-capi-events',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'apikey', cfg.anon_key,
                 'Authorization', 'Bearer ' || cfg.anon_key
               ),
    body    := v_corpo,
    timeout_milliseconds := 8000
  ) INTO req_id;

  INSERT INTO public.capi_dispatch_log (origem, lead_id, status, request_id, detalhe)
  VALUES (p_origem, p_lead_id, 'despachado', req_id, v_destino);

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

REVOKE ALL ON FUNCTION public.despachar_capi_lead(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.despachar_capi_lead(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.despachar_capi_lead(UUID, TEXT) IS
  'Despacha fire-capi-events para um lead. Desde 18/09/2026 repassa leads.destino_conversao como event_source_url, para o evento do servidor declarar a MESMA pagina em que o pixel disparou. Sem a coluna preenchida, o comportamento e o anterior.';

-- ============================================================================
-- COMO APLICAR
-- ============================================================================
--
-- ORDEM IMPORTA (pouco, mas importa): aplique a migration ANTES do deploy do
-- site. Na ordem inversa, o insert do lead com a coluna inexistente cairia no
-- retry que remove colunas opcionais (HeroLeadForm.tsx e Quiz.tsx já tratam
-- `destino_conversao`), então nenhum lead se perde — o lead só nasceria sem a
-- coluna e o gatilho voltaria ao palpite antigo.
--
-- PASSO 1 — Ensaio abortado:
--
--   BEGIN;
--     \i supabase/migrations/20260918180000_event_source_url_do_destino.sql
--     -- Sem gatilho de rede: só confere que a função aceita a coluna.
--     SELECT column_name FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='leads'
--        AND column_name='destino_conversao';
--   ROLLBACK;
--
-- PASSO 2 — Aplicar:
--
--   SUPABASE_ACCESS_TOKEN="sbp_..." node scripts/aplicar-migrations.mjs \
--     20260918180000_event_source_url_do_destino.sql
--
-- PASSO 3 — Depois do deploy do site E do `fire-capi-events`, no primeiro lead
-- real:
--
--   SELECT l.created_at, l.destino_conversao, d.status, d.detalhe
--     FROM public.leads l
--     LEFT JOIN public.capi_dispatch_log d ON d.lead_id = l.id AND d.origem = 'trigger'
--    ORDER BY l.created_at DESC LIMIT 5;
--
--   `detalhe` do despacho deve ser a MESMA URL de `destino_conversao`.
--   E em `capi_events_log`, o evento do servidor e o do navegador devem ter o
--   mesmo event_id (isso não mudou) e agora a mesma URL.
