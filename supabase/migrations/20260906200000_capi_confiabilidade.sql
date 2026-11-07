-- Confiabilidade do envio de eventos para o Meta (06/09/2026, noite).
--
-- Vem da "Auditoria do Envio de Eventos para o Meta (fluxo real, 06-09-2026)"
-- no vault. Três problemas de estrutura que o código sozinho não resolve:
--
-- 1. Nada guardava a resposta do Meta. `leads.capi_events_sent` é um booleano
--    por chave, sem data, sem status, sem erro. Não dava para dizer quantos
--    eventos foram gerados, enviados, aceitos ou recusados.
--    → `capi_events_log`: uma linha por tentativa.
--
-- 2. Corrida entre os chamadores do nascimento do lead (front e kommo-webhook;
--    o gatilho de banco não existe em produção): os dois liam `capi_events_sent` vazio ao mesmo
--    tempo e mandavam o mesmo evento. O Meta NÃO desduplica servidor ×
--    servidor, só pixel × servidor (doc "Deduplicate Pixel and Server Events").
--    → `capi_event_claims`: reserva atômica de (event_id, event_name) ANTES
--      do envio. Quem perde a inserção não envia.
--
-- 3. `UPDATE leads SET capi_events_sent = <mapa inteiro lido antes>` era
--    last-writer-wins: um chamador lento sobrescrevia a marca de outro.
--    → `mark_capi_event`: merge atômico de chaves no jsonb.

-- ── 1. Log de tentativas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.capi_events_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  lead_id uuid,
  event_name text NOT NULL,
  event_id text NOT NULL,
  -- Quem pediu o envio: front, trigger, kommo, admin, retro, assistente,
  -- landing-hit, retry, unknown.
  caller text NOT NULL DEFAULT 'unknown',
  action_source text,
  -- sent = Meta respondeu 2xx · failed = rede/5xx/4xx · rejected = recusado
  -- antes de enviar (ex.: event_time > 7 dias) · deduplicated = id já tinha
  -- sido reservado por outro chamador · skipped = chave já marcada no lead.
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'rejected', 'deduplicated', 'skipped')),
  http_status integer,
  events_received integer,
  fbtrace_id text,
  error_message text,
  -- Resposta crua do Meta (pequena: events_received, messages, fbtrace_id).
  meta_response jsonb,
  -- O que foi pedido, SEM dados pessoais: ids, valor, custom_data, event_time.
  request jsonb,
  -- Quais campos de identidade foram (true/false), nunca os valores.
  identity jsonb,
  test_event_code text,
  attempt integer NOT NULL DEFAULT 1,
  retry_of uuid REFERENCES public.capi_events_log(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS capi_events_log_created_idx ON public.capi_events_log (created_at DESC);
CREATE INDEX IF NOT EXISTS capi_events_log_lead_idx ON public.capi_events_log (lead_id);
CREATE INDEX IF NOT EXISTS capi_events_log_event_idx ON public.capi_events_log (event_id, event_name);
CREATE INDEX IF NOT EXISTS capi_events_log_status_idx ON public.capi_events_log (status, created_at DESC);

ALTER TABLE public.capi_events_log ENABLE ROW LEVEL SECURITY;
-- Sem policy: só a service role (edge functions) lê e escreve.

COMMENT ON TABLE public.capi_events_log IS
  'Uma linha por tentativa de envio de evento ao Meta (CAPI). Fonte de verdade para gerado → enviado → aceito → falhou.';

-- ── 2. Reserva atômica por evento ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.capi_event_claims (
  event_id text NOT NULL,
  event_name text NOT NULL,
  lead_id uuid,
  caller text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  -- Preenchido quando o Meta aceitou. Reserva sem sent_at e mais velha que
  -- alguns minutos é de um envio que morreu no meio: o retry pode limpar.
  sent_at timestamptz,
  PRIMARY KEY (event_id, event_name)
);

CREATE INDEX IF NOT EXISTS capi_event_claims_pending_idx
  ON public.capi_event_claims (claimed_at) WHERE sent_at IS NULL;

ALTER TABLE public.capi_event_claims ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.capi_event_claims IS
  'Reserva de (event_id, event_name) antes do envio. Resolve a corrida entre front, gatilho e kommo no nascimento do lead.';

-- ── 3. Marcação atômica no lead ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_capi_event(p_lead_id uuid, p_keys text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_add jsonb := '{}'::jsonb;
  v_key text;
  v_result jsonb;
BEGIN
  IF p_lead_id IS NULL OR p_keys IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH v_key IN ARRAY p_keys LOOP
    IF v_key IS NOT NULL AND v_key <> '' THEN
      v_add := v_add || jsonb_build_object(v_key, true);
    END IF;
  END LOOP;
  UPDATE public.leads
     SET capi_events_sent = COALESCE(capi_events_sent, '{}'::jsonb) || v_add
   WHERE id = p_lead_id
   RETURNING capi_events_sent INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_capi_event(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_capi_event(uuid, text[]) TO service_role;

COMMENT ON FUNCTION public.mark_capi_event IS
  'Marca chaves em leads.capi_events_sent com merge atômico. Substitui o UPDATE do mapa inteiro, que perdia marcas de chamadores concorrentes.';

-- Nota (revisão 06/09 à noite): o gatilho `trigger_capi_on_lead_insert` e a
-- função `notify_capi_on_lead_insert` da migration 20260401150755 NÃO existem
-- em produção (confirmado em pg_trigger/pg_proc), e as `app.settings.*` que
-- ele leria estão nulas. Os chamadores reais do nascimento do lead são o
-- front e o kommo-webhook. Nada aqui recria o gatilho.
