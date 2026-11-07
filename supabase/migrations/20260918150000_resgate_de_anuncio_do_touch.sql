-- ============================================================================
-- RESGATE DO ANÚNCIO PELA SESSÃO, MESMO QUANDO utm_source É "VÁLIDO"
-- ============================================================================
--
-- NÃO APLICADA. Este arquivo existe para ser revisado e rodado à mão. O teste
-- que deve ser feito ANTES está no fim do arquivo.
--
-- ⚠ SUPERADA POR `20260918170000_ultimo_toque_pago_na_sessao.sql` (18/09, fim
-- do dia). Aquela migration contém TUDO o que esta faz, mais a precedência
-- corrigida (valor do lead > sessão > nada; nunca IP quando há session_id).
-- Aplicar ESTE arquivo DEPOIS daquele reverteria metade do conserto, porque a
-- função aqui ainda tem o COALESCE invertido no caminho por IP. Se a de
-- 170000 já foi aplicada, este arquivo é história: não rode.
--
-- ── O mecanismo da perda, medido em 18/09/2026 ──────────────────────────────
-- `recover_attribution_from_session` tem um CAMINHO CURTO: se `utm_source` é
-- válido (≠ vazio, ≠ 'direct', sem macro), ela marca `attribution_source =
-- 'direct_ad'` e RETORNA na hora, sem olhar a sessão.
--
-- A URL do link da bio do Instagram é
--   /HD3?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=...
-- e `utm_source=ig` passa nesse teste. Resultado: em toda volta pela bio o
-- gatilho nunca consultou a sessão, e o `campaign_id`/`adset_id`/`ad_id`/
-- `utm_content`/`utm_term` do clique pago anterior morreram ali — mesmo quando
-- a linha em `lead_sessions` os tinha inteiros.
--
-- A prova de que o caminho é esse: o `placement` do Emerson Araujo (18/09
-- 06:54) veio CERTO e os utm_* vieram errados. A única diferença entre eles é
-- que o resgate de placement (migration 20260911150000) roda ANTES do caminho
-- curto e o dos outros campos não rodava em lugar nenhum.
--
-- ── O que esta migration faz ────────────────────────────────────────────────
-- Promove o mesmo resgate por `session_id` (vínculo EXATO, não heurística de
-- IP) de `placement` para os campos de anúncio:
--   campaign_id, adset_id, ad_id, utm_content, utm_term, utm_campaign
-- e move o bloco para ANTES do caminho curto, junto com o de placement.
--
-- Três invariantes, todas conservadoras:
--   1. NUNCA SOBRESCREVE. Só preenche coluna vazia ('' e '(not set)' contam
--      como vazias). Valor entregue pelo navegador sempre manda.
--   2. NUNCA COPIA MACRO. Valor da sessão contendo '{{' ou '}}' é ignorado —
--      o lead do Vic (16/09) provou que a macro crua chega até a sessão.
--   3. IDEMPOTENTE. Rodar de novo com as mesmas linhas não muda nada: o
--      segundo passe encontra as colunas já preenchidas e não toca em nada.
--      Como é um gatilho BEFORE INSERT, "rodar de novo" é reinstalar a função,
--      o que esta migration faz com CREATE OR REPLACE.
--
-- ── O que esta migration NÃO faz, de propósito ──────────────────────────────
-- - NÃO mexe em `attribution_source`. Um lead que chega pela bio com o anúncio
--   resgatado continua sendo marcado 'direct_ad' pelo caminho curto. Mudar a
--   semântica dessa coluna é outra decisão, com outro impacto (ela alimenta
--   relatórios de "caminho" desde agosto), e misturar as duas numa migration
--   só tornaria impossível reverter uma sem a outra.
-- - NÃO mexe em `utm_medium`. Mesmo motivo: `utm_medium` é o que decide
--   pago × orgânico em várias leituras, e reescrevê-lo aqui mudaria números
--   históricos sem aviso.
-- - NÃO toca no caminho longo por IP. Ele continua como está, como última
--   instância — e continua sendo heurística: dois leads atrás do mesmo NAT
--   podem colar a sessão um do outro.
--
-- ── O limite honesto desta rede ─────────────────────────────────────────────
-- Só 40 de 169 leads desde 19/08 têm `session_id` (76% não têm). A partir de
-- 12/09 a cobertura é quase total (11/12, 5/5, 7/7, 7/7, 3/3, 2/2), então esta
-- rede vale para daqui pra frente, NÃO para o histórico. Ela também não faz
-- backfill: é um gatilho BEFORE INSERT e só age em lead novo.

CREATE OR REPLACE FUNCTION public.recover_attribution_from_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_session RECORD;
  has_valid_utm BOOLEAN;
  sessao_do_lead RECORD;
BEGIN
  -- Macro não substituída pela Meta nunca é dado, em nenhum dos caminhos.
  IF NEW.placement IS NOT NULL AND NEW.placement LIKE '%{{%' THEN NEW.placement := NULL; END IF;
  IF NEW.site_source_name IS NOT NULL AND NEW.site_source_name LIKE '%{{%' THEN NEW.site_source_name := NULL; END IF;

  -- NOVO EM 18/09/2026: a macro também chega nos IDs. O lead do Vic (16/09,
  -- score 89) nasceu com campaign_id/adset_id/ad_id = '{{campaign.id}}' /
  -- '{{adset.id}}' / '{{ad.id}}' literais no banco, entrou na tabela de
  -- criativos como tráfego e poluiu `meta_ads_cache` com um ad_id que não
  -- existe. Um ID que não identifica nada é pior que nenhum ID: ele CASA, por
  -- igualdade, com um anúncio inexistente em toda leitura que fizer join.
  IF NEW.campaign_id IS NOT NULL AND (NEW.campaign_id LIKE '%{{%' OR NEW.campaign_id LIKE '%}}%') THEN
    NEW.campaign_id := NULL;
  END IF;
  IF NEW.adset_id IS NOT NULL AND (NEW.adset_id LIKE '%{{%' OR NEW.adset_id LIKE '%}}%') THEN
    NEW.adset_id := NULL;
  END IF;
  IF NEW.ad_id IS NOT NULL AND (NEW.ad_id LIKE '%{{%' OR NEW.ad_id LIKE '%}}%') THEN
    NEW.ad_id := NULL;
  END IF;

  -- ── RESGATE PELA SESSÃO EXATA QUE CONVERTEU ──────────────────────────────
  --
  -- Roda ANTES dos dois desfechos, porque o anúncio se perde nos dois — e é
  -- justamente o caminho curto (utm_source='ig' da bio) que fazia a sessão
  -- nunca ser consultada. O vínculo é `lead_sessions.id = NEW.session_id`:
  -- exato, não a heurística de IP do caminho longo. Sem isso o risco seria
  -- montar um Frankenstein, campanha de um toque e anúncio de outro.
  --
  -- COALESCE com NULLIF: preenche só o que está vazio, e '' e '(not set)'
  -- contam como vazio (é o que a captura do navegador grava quando não sabe).
  IF NEW.session_id IS NOT NULL THEN
    BEGIN
      SELECT
        s.placement_raw, s.campaign_id, s.adset_id, s.ad_id,
        s.utm_content, s.utm_term, s.utm_campaign
      INTO sessao_do_lead
        FROM public.lead_sessions s
       WHERE s.id::text = NEW.session_id
       LIMIT 1;

      IF FOUND THEN
        IF NEW.placement IS NULL
           AND sessao_do_lead.placement_raw IS NOT NULL
           AND sessao_do_lead.placement_raw NOT LIKE '%{{%' THEN
          NEW.placement := sessao_do_lead.placement_raw;
        END IF;

        IF NULLIF(NULLIF(NEW.campaign_id, ''), '(not set)') IS NULL
           AND sessao_do_lead.campaign_id IS NOT NULL
           AND sessao_do_lead.campaign_id NOT LIKE '%{{%'
           AND sessao_do_lead.campaign_id NOT LIKE '%}}%' THEN
          NEW.campaign_id := sessao_do_lead.campaign_id;
        END IF;

        IF NULLIF(NULLIF(NEW.adset_id, ''), '(not set)') IS NULL
           AND sessao_do_lead.adset_id IS NOT NULL
           AND sessao_do_lead.adset_id NOT LIKE '%{{%'
           AND sessao_do_lead.adset_id NOT LIKE '%}}%' THEN
          NEW.adset_id := sessao_do_lead.adset_id;
        END IF;

        IF NULLIF(NULLIF(NEW.ad_id, ''), '(not set)') IS NULL
           AND sessao_do_lead.ad_id IS NOT NULL
           AND sessao_do_lead.ad_id NOT LIKE '%{{%'
           AND sessao_do_lead.ad_id NOT LIKE '%}}%' THEN
          NEW.ad_id := sessao_do_lead.ad_id;
        END IF;

        -- `utm_content` é o NOME do anúncio, e é a coluna que a tabela de
        -- criativos usava como chave até 18/09. Continua valendo resgatar: é
        -- ela que dá o rótulo quando não há ad_id, e `link_in_bio` conta como
        -- vazio aqui porque é literalmente "não sei qual anúncio".
        IF NULLIF(NULLIF(NULLIF(NEW.utm_content, ''), '(not set)'), 'link_in_bio') IS NULL
           AND sessao_do_lead.utm_content IS NOT NULL
           AND sessao_do_lead.utm_content NOT LIKE '%{{%'
           AND sessao_do_lead.utm_content NOT LIKE '%}}%'
           AND sessao_do_lead.utm_content <> 'link_in_bio' THEN
          NEW.utm_content := sessao_do_lead.utm_content;
        END IF;

        IF NULLIF(NULLIF(NEW.utm_term, ''), '(not set)') IS NULL
           AND sessao_do_lead.utm_term IS NOT NULL
           AND sessao_do_lead.utm_term NOT LIKE '%{{%'
           AND sessao_do_lead.utm_term NOT LIKE '%}}%' THEN
          NEW.utm_term := sessao_do_lead.utm_term;
        END IF;

        IF NULLIF(NULLIF(NEW.utm_campaign, ''), '(not set)') IS NULL
           AND sessao_do_lead.utm_campaign IS NOT NULL
           AND sessao_do_lead.utm_campaign NOT LIKE '%{{%'
           AND sessao_do_lead.utm_campaign NOT LIKE '%}}%' THEN
          NEW.utm_campaign := sessao_do_lead.utm_campaign;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Um lead nunca pode ser perdido por causa da telemetria dele.
      NULL;
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

  IF NEW.utm_source IS NOT NULL AND NEW.utm_source LIKE '%{{%' THEN NEW.utm_source := NULL; END IF;
  IF NEW.utm_medium IS NOT NULL AND NEW.utm_medium LIKE '%{{%' THEN NEW.utm_medium := NULL; END IF;
  IF NEW.utm_campaign IS NOT NULL AND NEW.utm_campaign LIKE '%{{%' THEN NEW.utm_campaign := NULL; END IF;
  IF NEW.utm_content IS NOT NULL AND NEW.utm_content LIKE '%{{%' THEN NEW.utm_content := NULL; END IF;
  IF NEW.utm_term IS NOT NULL AND NEW.utm_term LIKE '%{{%' THEN NEW.utm_term := NULL; END IF;

  IF (NEW.ip_address IS NULL OR NEW.ip_address = '' OR NEW.ip_address = 'unknown') THEN
    NEW.attribution_source := 'organic';
    RETURN NEW;
  END IF;

  SELECT
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
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
    NEW.utm_source := matched_session.utm_source;
    NEW.utm_medium := matched_session.utm_medium;
    NEW.utm_campaign := matched_session.utm_campaign;
    NEW.utm_content := COALESCE(matched_session.utm_content, NEW.utm_content);
    NEW.utm_term := COALESCE(matched_session.utm_term, NEW.utm_term);
    NEW.fbclid := COALESCE(matched_session.fbclid, NEW.fbclid);
    NEW.gclid := COALESCE(matched_session.gclid, NEW.gclid);
    NEW.campaign_id := COALESCE(matched_session.campaign_id, NEW.campaign_id);
    NEW.adset_id := COALESCE(matched_session.adset_id, NEW.adset_id);
    NEW.ad_id := COALESCE(matched_session.ad_id, NEW.ad_id);
    NEW.attribution_source := 'bio_recovery';
  ELSE
    NEW.attribution_source := 'organic';
  END IF;

  -- Última rede: se o caminho longo trouxe macro da sessão, ela morre aqui.
  IF NEW.campaign_id IS NOT NULL AND (NEW.campaign_id LIKE '%{{%' OR NEW.campaign_id LIKE '%}}%') THEN
    NEW.campaign_id := NULL;
  END IF;
  IF NEW.adset_id IS NOT NULL AND (NEW.adset_id LIKE '%{{%' OR NEW.adset_id LIKE '%}}%') THEN
    NEW.adset_id := NULL;
  END IF;
  IF NEW.ad_id IS NOT NULL AND (NEW.ad_id LIKE '%{{%' OR NEW.ad_id LIKE '%}}%') THEN
    NEW.ad_id := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.recover_attribution_from_session() IS
  'Resgata anuncio, campanha, conjunto, utm_content/term/campaign e placement da SESSAO EXATA (lead_sessions.id = leads.session_id) antes de decidir attribution_source. So preenche coluna vazia e nunca copia macro nao substituida da Meta. O caminho por IP segue como ultima instancia e continua sendo heuristica.';

-- ============================================================================
-- O TESTE A RODAR ANTES DE APLICAR  (nesta ordem)
-- ============================================================================
--
-- PASSO 1 — Quanto isto pode mexer, e em quê. Só SELECT, roda agora:
--
--   SELECT COUNT(*) FILTER (WHERE l.session_id IS NOT NULL)                  AS com_sessao,
--          COUNT(*) FILTER (WHERE l.session_id IS NOT NULL AND l.ad_id IS NULL
--                             AND s.ad_id IS NOT NULL)                       AS ganhariam_ad_id,
--          COUNT(*) FILTER (WHERE l.ad_id IS NOT NULL AND s.ad_id IS NOT NULL
--                             AND l.ad_id <> s.ad_id)                        AS divergem,
--          COUNT(*)                                                          AS leads
--     FROM public.leads l
--     LEFT JOIN public.lead_sessions s ON s.id::text = l.session_id
--    WHERE l.created_at >= now() - interval '30 days';
--
--   O número que importa é `divergem`: ele DEVE ser irrelevante para o
--   resultado (a função não sobrescreve), mas se for alto significa que lead e
--   sessão discordam com frequência e vale entender por quê antes de confiar
--   na rede. `ganhariam_ad_id` é o tamanho do ganho.
--
-- PASSO 2 — Ensaio em transação ABORTADA, no banco de verdade, sem deixar
-- rastro. Aplica a função, insere três leads sintéticos e confere as três
-- invariantes; o ROLLBACK desfaz TUDO, inclusive a troca da função:
--
--   BEGIN;
--     \i supabase/migrations/20260918150000_resgate_de_anuncio_do_touch.sql
--
--     -- pegue uma sessão real que tenha ad_id preenchido:
--     --   SELECT id, ad_id, campaign_id, utm_content FROM public.lead_sessions
--     --    WHERE ad_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
--
--     -- (a) lead da BIO, sem ad_id: DEVE sair com o ad_id da sessão
--     -- (b) lead com ad_id PRÓPRIO diferente: DEVE manter o dele (não sobrescreve)
--     -- (c) lead com ad_id = '{{ad.id}}': DEVE sair com ad_id NULO
--     INSERT INTO public.leads (nome_completo, email, whatsapp, session_id,
--                               utm_source, utm_medium, utm_content, ad_id)
--     VALUES ('TESTE A', 'a@teste.local', '11999999999', '<SESSION_ID>',
--             'ig', 'social', 'link_in_bio', NULL),
--            ('TESTE B', 'b@teste.local', '11999999998', '<SESSION_ID>',
--             'ig', 'social', 'link_in_bio', '999999999999999'),
--            ('TESTE C', 'c@teste.local', '11999999997', '<SESSION_ID>',
--             'ig', 'social', 'link_in_bio', '{{ad.id}}');
--
--     SELECT nome_completo, ad_id, campaign_id, adset_id, utm_content,
--            placement, attribution_source
--       FROM public.leads WHERE email LIKE '%@teste.local';
--   ROLLBACK;
--
--   Esperado: A com o ad_id da sessão; B com 999999999999999 (o dele);
--   C com ad_id NULO. Nos três, `attribution_source = 'direct_ad'` — esta
--   migration NÃO muda essa coluna, de propósito.
--
-- PASSO 3 — Idempotência: rode o `\i` do arquivo DUAS vezes seguidas dentro da
-- mesma transação do passo 2. O segundo CREATE OR REPLACE não pode falhar nem
-- alterar o resultado dos três leads.
--
-- PASSO 4 — Depois de aplicar de verdade, confira o PRIMEIRO lead real que
-- entrar com session_id e sem ad_id próprio:
--
--   SELECT l.id, l.created_at, l.ad_id, s.ad_id AS ad_id_da_sessao,
--          l.utm_content, l.placement, l.attribution_source
--     FROM public.leads l JOIN public.lead_sessions s ON s.id::text = l.session_id
--    ORDER BY l.created_at DESC LIMIT 5;
--
--   Se `l.ad_id` estiver igual a `ad_id_da_sessao`, a rede pegou.
