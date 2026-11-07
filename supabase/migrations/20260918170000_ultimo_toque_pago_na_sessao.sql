-- ============================================================================
-- O ÚLTIMO TOQUE PAGO MANDA NA SESSÃO — E A PRECEDÊNCIA DO GATILHO
-- 18/09/2026
--
-- NÃO APLICADA por quem escreveu. Roteiro de aplicação no fim do arquivo.
--
-- ── O defeito, medido ───────────────────────────────────────────────────────
-- `lead_sessions` nascia no PRIMEIRO toque e nunca era atualizada nos campos de
-- anúncio. O `session_id` mora no localStorage e sobrevive a aba nova, a
-- fechamento do app e a dias inteiros, então o segundo clique em anúncio
-- devolvia 409 no insert da sessão e ia embora: a linha continuava com o
-- anúncio do primeiro clique.
--
-- Como o resgate do gatilho lê JUSTAMENTE essa linha, o lead era carimbado com
-- o anúncio errado — não "sem anúncio", ERRADO, que é pior: envenena a
-- comparação de criativos do experimento das 3 contas.
--
--   • Tiago  — clicou Nulle #5 (13:29) e Nulle #6 (15:24); gravado Nulle #5,
--              com o conjunto e o placement do toque velho.
--   • Emerson — último clique Case Ighor #7; gravado Nulle #7.
--   • André villa (14/09) — mesmo padrão.
--
-- A regra da casa é `reference_atribuicao_meta`: vale o ÚLTIMO clique ATÉ o
-- lead nascer. A sessão estava implementando o PRIMEIRO.
--
-- ── O que esta migration faz ────────────────────────────────────────────────
-- 1. Quatro colunas em `lead_sessions` para não perder o primeiro toque:
--    `primeiro_toque_pago` (jsonb), `primeiro_toque_em`, `ultimo_toque_pago_em`
--    e `toques_pagos`.
-- 2. `atualizar_anuncio_da_sessao(...)`: a RPC que o navegador chama quando
--    chega um toque com identificador PAGO. Reescreve o bloco de anúncio da
--    sessão e arquiva o bloco anterior na primeira troca.
-- 3. `recover_attribution_from_session()` reescrita inteira, com a precedência
--    corrigida:
--       valor do LEAD (navegador) > sessão por session_id > nada.
--       NUNCA o caminho por IP quando existe session_id.
--
-- ── Por que uma RPC e não um UPDATE do PostgREST ────────────────────────────
-- `lead_sessions` tem policy de INSERT e de UPDATE mas NENHUMA de SELECT. Sem
-- SELECT o Postgres não localiza a linha para avaliar o WHERE, o UPDATE afeta
-- zero linhas e o PostgREST responde 204 — sem erro nenhum. Foi assim que
-- `started_quiz`, `completed` e `lead_whatsapp` ficaram vazios em TODAS as
-- sessões desde julho (ver 20260821190000). Mesma armadilha, mesmo remédio:
-- SECURITY DEFINER.
--
-- ── Superfície exposta ao anônimo ───────────────────────────────────────────
-- A RPC é chamada pelo navegador com a chave anônima, igual à
-- `update_lead_session` que já existe. Ela só toca em colunas de atribuição de
-- UMA sessão, só com valor que passa no teste de "é pago", e só em sessão
-- criada nos últimos 7 dias — a mesma janela da RPC de progresso. Não devolve
-- nada além de true/false: não vira canal de leitura de uma tabela que de
-- propósito não tem SELECT público.
-- ============================================================================

-- ── 1. Onde o primeiro toque fica guardado ──────────────────────────────────
-- jsonb e não oito colunas `*_primeiro`: o bloco é lido inteiro ou não é lido,
-- ninguém filtra por ele, e assim uma etiqueta nova no futuro não pede outra
-- migration.
ALTER TABLE public.lead_sessions
  ADD COLUMN IF NOT EXISTS primeiro_toque_pago  JSONB,
  ADD COLUMN IF NOT EXISTS primeiro_toque_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultimo_toque_pago_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS toques_pagos         INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.lead_sessions.primeiro_toque_pago IS
  'Bloco de anuncio do PRIMEIRO toque pago, arquivado quando um toque pago diferente o substitui. A linha guarda sempre o ULTIMO (reference_atribuicao_meta); o primeiro vive aqui para nao se perder.';
COMMENT ON COLUMN public.lead_sessions.toques_pagos IS
  'Quantos cliques pagos DIFERENTES esta sessao viu. 2 ou mais = a pessoa clicou em mais de um anuncio antes de virar lead.';

-- ── 2. Macro da Meta nunca é dado ───────────────────────────────────────────
-- Um `{{ad.id}}` literal é pior que NULL: ele CASA, por igualdade, com um
-- anúncio inexistente em toda leitura que fizer join. As duas pontas são
-- testadas separadamente porque valor truncado no caminho chega com só `{{`.
CREATE OR REPLACE FUNCTION public.sem_macro(v TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
           WHEN v IS NULL THEN NULL
           WHEN btrim(v) = '' THEN NULL
           WHEN v = '(not set)' THEN NULL
           WHEN v LIKE '%{{%' OR v LIKE '%}}%' THEN NULL
           ELSE v
         END;
$$;

COMMENT ON FUNCTION public.sem_macro(TEXT) IS
  'Devolve NULL para vazio, "(not set)" e macro nao substituida da Meta. Uma regua so para os dois lados do banco.';

-- ── 3. `utm_medium` que a casa usa em trafego pago ──────────────────────────
-- Espelho de MEDIUMS_PAGOS em src/lib/atribuicaoPaga.ts. `social` NÃO entra:
-- é exatamente o que o link da bio do Instagram manda.
CREATE OR REPLACE FUNCTION public.medium_pago(v TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(btrim(coalesce(v, ''))) IN
    ('paid_social', 'paidsocial', 'cpc', 'ppc', 'paid', 'paid_search');
$$;

-- ── 4. A RPC do navegador ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.atualizar_anuncio_da_sessao(
  p_session_id    uuid,
  p_campaign_id   text DEFAULT NULL,
  p_adset_id      text DEFAULT NULL,
  p_ad_id         text DEFAULT NULL,
  p_creative_id   text DEFAULT NULL,
  p_utm_source    text DEFAULT NULL,
  p_utm_medium    text DEFAULT NULL,
  p_utm_campaign  text DEFAULT NULL,
  p_utm_content   text DEFAULT NULL,
  p_utm_term      text DEFAULT NULL,
  p_placement_raw text DEFAULT NULL,
  p_fbclid        text DEFAULT NULL,
  p_gclid         text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s            RECORD;
  v_campaign   text := public.sem_macro(p_campaign_id);
  v_adset      text := public.sem_macro(p_adset_id);
  v_ad         text := public.sem_macro(p_ad_id);
  v_creative   text := public.sem_macro(p_creative_id);
  v_source     text := public.sem_macro(p_utm_source);
  v_medium     text := public.sem_macro(p_utm_medium);
  v_campanha   text := public.sem_macro(p_utm_campaign);
  v_content    text := public.sem_macro(p_utm_content);
  v_term       text := public.sem_macro(p_utm_term);
  v_placement  text := public.sem_macro(p_placement_raw);
  v_fbclid     text := public.sem_macro(p_fbclid);
  v_gclid      text := public.sem_macro(p_gclid);
  v_pago       boolean;
  v_tem_id     boolean;
  v_mesmo      boolean;
BEGIN
  IF p_session_id IS NULL THEN RETURN FALSE; END IF;

  -- É PAGO? A mesma régua do front (`temIdentificadorPago`): identificador de
  -- anúncio, gclid, ou medium de mídia paga. `utm_source` sozinho não conta —
  -- a bio manda `ig`. `fbclid` sozinho não conta — o app do Instagram anexa
  -- fbclid a qualquer link externo, inclusive o da bio.
  v_tem_id := (v_campaign IS NOT NULL OR v_adset IS NOT NULL
               OR v_ad IS NOT NULL OR v_gclid IS NOT NULL);
  v_pago := (v_tem_id OR public.medium_pago(v_medium));
  IF NOT v_pago THEN
    RETURN FALSE;
  END IF;

  -- Janela de 7 dias, a mesma de `update_lead_session`: sessão velha não volta
  -- a ser escrita por uma aba que ficou dias aberta.
  SELECT * INTO s
    FROM public.lead_sessions
   WHERE id = p_session_id
     AND created_at > now() - interval '7 days'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- MESMO ANÚNCIO? Compara por ID, nunca por nome (`feedback_anuncio_nao_e_criativo`:
  -- ID manda, nome é apresentação). Sem ad_id dos dois lados, cai na campanha.
  --
  -- SEM ID NENHUM o toque é "pago" só pelo `utm_medium` — é o caso do clique em
  -- PRÉVIA dentro do Gerenciador, que chega com as macros cruas e vira NULL
  -- aqui. Um toque assim não identifica anúncio nenhum e por isso NÃO tem
  -- direito de apagar o anúncio que a sessão já tinha: cai no caminho
  -- conservador de só completar o que está vazio.
  v_mesmo := CASE
               WHEN NOT v_tem_id THEN TRUE
               WHEN v_ad IS NOT NULL AND s.ad_id IS NOT NULL THEN v_ad = s.ad_id
               WHEN v_campaign IS NOT NULL AND s.campaign_id IS NOT NULL THEN v_campaign = s.campaign_id
               ELSE FALSE
             END;

  IF v_mesmo THEN
    -- Recarregar a página não é clique novo. Só completa o que estiver vazio
    -- (o placement, por exemplo, que às vezes chega só no segundo carregamento).
    UPDATE public.lead_sessions SET
      campaign_id   = COALESCE(public.sem_macro(campaign_id), v_campaign),
      ad_id         = COALESCE(public.sem_macro(ad_id), v_ad),
      adset_id      = COALESCE(adset_id, v_adset),
      creative_id   = COALESCE(creative_id, v_creative),
      utm_source    = COALESCE(public.sem_macro(utm_source), v_source),
      utm_medium    = COALESCE(public.sem_macro(utm_medium), v_medium),
      utm_campaign  = COALESCE(public.sem_macro(utm_campaign), v_campanha),
      utm_content   = COALESCE(public.sem_macro(utm_content), v_content),
      utm_term      = COALESCE(public.sem_macro(utm_term), v_term),
      placement_raw = COALESCE(public.sem_macro(placement_raw), v_placement),
      fbclid        = COALESCE(fbclid, v_fbclid),
      gclid         = COALESCE(gclid, v_gclid),
      ultimo_toque_pago_em = now(),
      last_seen_at  = now()
    WHERE id = p_session_id;
    RETURN TRUE;
  END IF;

  -- ANÚNCIO DIFERENTE: troca o BLOCO INTEIRO.
  --
  -- Campo a campo seria um Frankenstein — campanha de um toque, conjunto de
  -- outro, placement de um terceiro — e ninguém conseguiria dizer depois de
  -- qual anúncio veio o lead. O bloco antigo não some: vai para
  -- `primeiro_toque_pago` se ainda não houver nada lá (é o PRIMEIRO que fica
  -- guardado, não o penúltimo).
  UPDATE public.lead_sessions SET
    primeiro_toque_pago = CASE
      WHEN primeiro_toque_pago IS NOT NULL THEN primeiro_toque_pago
      ELSE jsonb_strip_nulls(jsonb_build_object(
             'campaign_id',   s.campaign_id,
             'adset_id',      s.adset_id,
             'ad_id',         s.ad_id,
             'creative_id',   s.creative_id,
             'utm_source',    s.utm_source,
             'utm_medium',    s.utm_medium,
             'utm_campaign',  s.utm_campaign,
             'utm_content',   s.utm_content,
             'utm_term',      s.utm_term,
             'placement_raw', s.placement_raw,
             'fbclid',        s.fbclid,
             'gclid',         s.gclid,
             'em',            to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
           ))
    END,
    primeiro_toque_em = COALESCE(primeiro_toque_em, s.created_at),
    campaign_id   = v_campaign,
    adset_id      = v_adset,
    ad_id         = v_ad,
    creative_id   = v_creative,
    utm_source    = COALESCE(v_source, utm_source),
    utm_medium    = COALESCE(v_medium, utm_medium),
    utm_campaign  = v_campanha,
    utm_content   = v_content,
    utm_term      = v_term,
    placement_raw = v_placement,
    -- `fbclid`/`gclid` vão junto do bloco: eles são o clique, e o clique
    -- mudou. Manter o fbclid do anúncio anterior mandaria o Meta atribuir a
    -- conversão ao anúncio velho por outro caminho.
    fbclid        = v_fbclid,
    gclid         = v_gclid,
    toques_pagos  = GREATEST(toques_pagos, 1) + 1,
    ultimo_toque_pago_em = now(),
    last_seen_at  = now()
  WHERE id = p_session_id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  -- Telemetria nunca derruba a visita.
  RAISE WARNING 'atualizar_anuncio_da_sessao: %', SQLERRM;
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_anuncio_da_sessao(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) TO anon, authenticated;

COMMENT ON FUNCTION public.atualizar_anuncio_da_sessao IS
  'Reescreve o bloco de anuncio da sessao quando chega um toque PAGO diferente (ultimo clique vence, reference_atribuicao_meta). Arquiva o primeiro toque em primeiro_toque_pago. Toque organico nao muda nada. Existe como RPC porque lead_sessions nao tem policy de SELECT e o UPDATE direto afeta zero linhas em silencio.';

-- ── 5. O gatilho, com a precedência certa ───────────────────────────────────
--
-- Ordem, do mais forte para o mais fraco:
--   1. o que o NAVEGADOR mandou no insert do lead;
--   2. a sessão ligada por `session_id` (vínculo exato);
--   3. nada.
-- O caminho por IP deixa de existir quando há `session_id`. Ele é heurística —
-- dois leads atrás do mesmo NAT pegam a sessão um do outro — e só se justifica
-- quando não há vínculo nenhum. Antes ele rodava mesmo com session_id presente
-- e, pior, com o COALESCE invertido: `COALESCE(matched_session.utm_content,
-- NEW.utm_content)` dava precedência à SESSÃO sobre o valor do navegador.
--
-- Substitui integralmente a versão de 20260918150000 (que pode nunca ter sido
-- aplicada): esta função é o estado final desejado, e é CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.recover_attribution_from_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_session   RECORD;
  has_valid_utm     BOOLEAN;
  sessao_do_lead    RECORD;
  resgatou_anuncio  BOOLEAN := FALSE;
BEGIN
  -- Macro não substituída pela Meta não é dado, em nenhum dos caminhos.
  NEW.placement        := public.sem_macro(NEW.placement);
  NEW.site_source_name := public.sem_macro(NEW.site_source_name);
  NEW.campaign_id      := public.sem_macro(NEW.campaign_id);
  NEW.adset_id         := public.sem_macro(NEW.adset_id);
  NEW.ad_id            := public.sem_macro(NEW.ad_id);

  -- ── RESGATE PELA SESSÃO EXATA QUE CONVERTEU ──────────────────────────────
  -- Roda ANTES do caminho curto (`utm_source` válido), porque é justamente o
  -- caminho curto — `utm_source=ig` do link da bio — que fazia a sessão nunca
  -- ser consultada. Só preenche coluna VAZIA: o valor do navegador manda.
  IF NEW.session_id IS NOT NULL
     AND NEW.session_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    BEGIN
      SELECT s.placement_raw, s.campaign_id, s.adset_id, s.ad_id, s.creative_id,
             s.utm_content, s.utm_term, s.utm_campaign
        INTO sessao_do_lead
        FROM public.lead_sessions s
       WHERE s.id = NEW.session_id::uuid
       LIMIT 1;

      IF FOUND THEN
        IF NEW.placement IS NULL AND public.sem_macro(sessao_do_lead.placement_raw) IS NOT NULL THEN
          NEW.placement := sessao_do_lead.placement_raw;
        END IF;

        IF public.sem_macro(NEW.campaign_id) IS NULL
           AND public.sem_macro(sessao_do_lead.campaign_id) IS NOT NULL THEN
          NEW.campaign_id := sessao_do_lead.campaign_id;
          resgatou_anuncio := TRUE;
        END IF;

        IF public.sem_macro(NEW.adset_id) IS NULL
           AND public.sem_macro(sessao_do_lead.adset_id) IS NOT NULL THEN
          NEW.adset_id := sessao_do_lead.adset_id;
          resgatou_anuncio := TRUE;
        END IF;

        IF public.sem_macro(NEW.ad_id) IS NULL
           AND public.sem_macro(sessao_do_lead.ad_id) IS NOT NULL THEN
          NEW.ad_id := sessao_do_lead.ad_id;
          resgatou_anuncio := TRUE;
        END IF;

        -- `utm_content` é o NOME do anúncio. `link_in_bio` conta como vazio
        -- aqui: é literalmente "não sei qual anúncio".
        IF public.sem_macro(NULLIF(NEW.utm_content, 'link_in_bio')) IS NULL
           AND public.sem_macro(NULLIF(sessao_do_lead.utm_content, 'link_in_bio')) IS NOT NULL THEN
          NEW.utm_content := sessao_do_lead.utm_content;
          resgatou_anuncio := TRUE;
        END IF;

        IF public.sem_macro(NEW.utm_term) IS NULL
           AND public.sem_macro(sessao_do_lead.utm_term) IS NOT NULL THEN
          NEW.utm_term := sessao_do_lead.utm_term;
        END IF;

        IF public.sem_macro(NEW.utm_campaign) IS NULL
           AND public.sem_macro(sessao_do_lead.utm_campaign) IS NOT NULL THEN
          NEW.utm_campaign := sessao_do_lead.utm_campaign;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Um lead nunca pode ser perdido por causa da telemetria dele.
      RAISE WARNING 'recover_attribution_from_session (sessao): %', SQLERRM;
    END;
  END IF;

  has_valid_utm := (
    NEW.utm_source IS NOT NULL
    AND NEW.utm_source != ''
    AND NEW.utm_source != 'direct'
    AND NEW.utm_source NOT LIKE '%{{%'
  );

  IF has_valid_utm THEN
    NEW.attribution_source := 'direct_ad';
    RETURN NEW;
  END IF;

  NEW.utm_source   := public.sem_macro(NEW.utm_source);
  NEW.utm_medium   := public.sem_macro(NEW.utm_medium);
  NEW.utm_campaign := public.sem_macro(NEW.utm_campaign);
  NEW.utm_content  := public.sem_macro(NEW.utm_content);
  NEW.utm_term     := public.sem_macro(NEW.utm_term);

  -- NUNCA IP QUANDO HÁ SESSION_ID. O vínculo exato já foi consultado acima; se
  -- ele não tinha o dado, o IP é palpite — e palpite que já colou sessão de
  -- outra pessoa atrás do mesmo NAT.
  IF NEW.session_id IS NOT NULL THEN
    NEW.attribution_source := CASE WHEN resgatou_anuncio THEN 'bio_recovery' ELSE 'organic' END;
    RETURN NEW;
  END IF;

  IF (NEW.ip_address IS NULL OR NEW.ip_address = '' OR NEW.ip_address = 'unknown') THEN
    NEW.attribution_source := 'organic';
    RETURN NEW;
  END IF;

  SELECT utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         fbclid, gclid, campaign_id, adset_id, ad_id, creative_id
    INTO matched_session
    FROM public.lead_sessions
   WHERE ip_address = NEW.ip_address
     AND utm_source IS NOT NULL
     AND utm_source != ''
     AND utm_source != 'direct'
     AND utm_source NOT LIKE '%{{%'
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    -- PRECEDÊNCIA CORRIGIDA EM 18/09/2026: o valor do LEAD vem primeiro em
    -- TODOS os campos. Antes, `NEW.utm_source := matched_session.utm_source`
    -- (sem COALESCE) e `COALESCE(matched_session.X, NEW.X)` nos demais faziam a
    -- sessão achada por IP sobrescrever o que o navegador tinha entregado.
    NEW.utm_source   := COALESCE(public.sem_macro(NEW.utm_source),   matched_session.utm_source);
    NEW.utm_medium   := COALESCE(public.sem_macro(NEW.utm_medium),   matched_session.utm_medium);
    NEW.utm_campaign := COALESCE(public.sem_macro(NEW.utm_campaign), matched_session.utm_campaign);
    NEW.utm_content  := COALESCE(public.sem_macro(NEW.utm_content),  matched_session.utm_content);
    NEW.utm_term     := COALESCE(public.sem_macro(NEW.utm_term),     matched_session.utm_term);
    NEW.fbclid       := COALESCE(NEW.fbclid,                         matched_session.fbclid);
    NEW.gclid        := COALESCE(NEW.gclid,                          matched_session.gclid);
    NEW.campaign_id  := COALESCE(public.sem_macro(NEW.campaign_id),  matched_session.campaign_id);
    NEW.adset_id     := COALESCE(public.sem_macro(NEW.adset_id),     matched_session.adset_id);
    NEW.ad_id        := COALESCE(public.sem_macro(NEW.ad_id),        matched_session.ad_id);
    NEW.attribution_source := 'bio_recovery';
  ELSE
    NEW.attribution_source := 'organic';
  END IF;

  -- Última rede: macro que tenha vindo da sessão morre aqui.
  NEW.campaign_id := public.sem_macro(NEW.campaign_id);
  NEW.adset_id    := public.sem_macro(NEW.adset_id);
  NEW.ad_id       := public.sem_macro(NEW.ad_id);

  RETURN NEW;
END;
$function$;

-- O gatilho já existe desde 20260328175421 e não é recriado por acidente aqui:
-- recriá-lo trocaria a ordem de disparo entre os BEFORE INSERT de `leads` (o
-- Postgres dispara em ordem alfabética de nome, e `trg_recover_attribution`
-- roda depois de `trigger_navegacao_do_lead`, que é quem empresta o IP). Esta
-- linha só garante que ele exista, com o mesmo nome de sempre.
DO $garante$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_recover_attribution'
       AND tgrelid = 'public.leads'::regclass
  ) THEN
    CREATE TRIGGER trg_recover_attribution
      BEFORE INSERT ON public.leads
      FOR EACH ROW
      EXECUTE FUNCTION public.recover_attribution_from_session();
  END IF;
END;
$garante$;

COMMENT ON FUNCTION public.recover_attribution_from_session() IS
  'Precedencia: valor do lead (navegador) > sessao por session_id > nada. O caminho por IP so roda quando NAO ha session_id, e nele o valor do lead continua mandando. Resgata anuncio, campanha, conjunto, utm_content/term/campaign e placement da sessao exata antes de decidir attribution_source. Nunca copia macro nao substituida da Meta.';

-- ============================================================================
-- COMO APLICAR  (nesta ordem, e só isto)
-- ============================================================================
--
-- PASSO 0 — Fotografia do "antes". Só SELECT:
--
--   SELECT count(*) FILTER (WHERE l.session_id IS NOT NULL) AS com_sessao,
--          count(*) FILTER (WHERE l.ad_id IS NOT NULL AND s.ad_id IS NOT NULL
--                             AND l.ad_id <> s.ad_id)       AS divergem,
--          count(*)                                         AS leads
--     FROM public.leads l
--     LEFT JOIN public.lead_sessions s
--       ON l.session_id ~ '^[0-9a-f-]{36}$' AND s.id = l.session_id::uuid
--    WHERE l.created_at >= now() - interval '30 days';
--
-- PASSO 1 — Ensaio em transação ABORTADA, no banco de verdade, sem rastro:
--
--   BEGIN;
--     \i supabase/migrations/20260918170000_ultimo_toque_pago_na_sessao.sql
--     -- pegue uma sessão real recente com ad_id:
--     --   SELECT id, ad_id, campaign_id, utm_content FROM public.lead_sessions
--     --    WHERE ad_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
--     SELECT public.atualizar_anuncio_da_sessao(
--       '<SESSION_ID>', '999', '888', '777', NULL,
--       'ig', 'paid_social', 'CAMPANHA NOVA', 'ANUNCIO NOVO', 'CONJUNTO NOVO',
--       'Instagram_Stories', 'fbclid_novo', NULL);           -- deve devolver true
--     SELECT ad_id, campaign_id, utm_content, placement_raw,
--            toques_pagos, primeiro_toque_pago
--       FROM public.lead_sessions WHERE id = '<SESSION_ID>'; -- bloco novo, antigo no jsonb
--     SELECT public.atualizar_anuncio_da_sessao(
--       '<SESSION_ID>', NULL, NULL, NULL, NULL,
--       'ig', 'social', NULL, 'link_in_bio', NULL, NULL, 'fbclid_da_bio', NULL);
--                                                            -- deve devolver FALSE
--     SELECT ad_id, utm_content FROM public.lead_sessions WHERE id = '<SESSION_ID>';
--                                                            -- intocado
--   ROLLBACK;
--
-- PASSO 2 — Idempotência: rode o `\i` duas vezes dentro da mesma transação do
-- passo 1. Nenhum erro, nenhum resultado diferente.
--
-- PASSO 3 — Aplicar de verdade:
--
--   SUPABASE_ACCESS_TOKEN="sbp_..." node scripts/aplicar-migrations.mjs \
--     20260918170000_ultimo_toque_pago_na_sessao.sql
--
-- PASSO 4 — Depois do deploy do SITE (a RPC só é chamada pelo navegador novo),
-- conferir o primeiro caso real:
--
--   SELECT id, ad_id, utm_content, toques_pagos, primeiro_toque_pago->>'ad_id' AS ad_id_anterior
--     FROM public.lead_sessions
--    WHERE toques_pagos >= 2 ORDER BY ultimo_toque_pago_em DESC LIMIT 10;
--
-- ATENÇÃO — NÃO aplicar `20260918150000_resgate_de_anuncio_do_touch.sql` depois
-- desta: aquela versão da função não tem a precedência corrigida e reverteria
-- metade do conserto. Esta migration contém tudo o que aquela fazia.
