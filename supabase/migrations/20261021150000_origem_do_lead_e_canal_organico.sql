-- 21/10/2026 · Origem do lead e canal orgânico
--
-- Por quê:
-- 1. O lead do Champion Direct mandava CAPI para a Meta. O gatilho de atribuição
--    reescrevia attribution_source ('instagram_dm' virava 'paid_unknown') antes do
--    gatilho da CAPI olhar, e a condição de pular nunca batia. Conferido no banco:
--    o único lead do direct (16/10) saiu com Lead, Sprint e CompleteRegistration.
--    A origem agora mora numa coluna que nenhum gatilho de atribuição reescreve.
-- 2. O Rodger quer o orgânico dividido: post X, direct, link da bio, story do dia X.
--    Nascem o cadastro das peças publicadas (organico_pecas) e a visão lead_canal.
--
-- Aplicada pela Management API (NUNCA db push neste projeto).
-- As funções 2 e 4 são a definição de produção de 21/10/2026 (pg_get_functiondef)
-- com uma única mudança cada, marcada com comentário de 21/10/2026.

-- ── 1. De onde o lead nasceu ────────────────────────────────────────────────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS origem_lead text NOT NULL DEFAULT 'site';
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_origem_lead_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_origem_lead_check
  CHECK (origem_lead IN ('site', 'direct', 'prospeccao'));
CREATE INDEX IF NOT EXISTS leads_origem_lead_idx ON public.leads (origem_lead) WHERE origem_lead <> 'site';

-- ── 2. Atribuição: lead fora do site não passa pelo resgate ─────────────────
CREATE OR REPLACE FUNCTION public.recover_attribution_from_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sessao_do_lead    RECORD;
  sessao_por_ip     RECORD;
  resgatou_anuncio  BOOLEAN := FALSE;
  confianca         text    := 'nenhum';
  tem_anuncio       BOOLEAN;
  veio_de_plataforma BOOLEAN;
  -- As duas janelas, num lugar só.
  JANELA_ALTA  CONSTANT interval := interval '60 minutes';
  JANELA_MEDIA CONSTANT interval := interval '24 hours';
BEGIN
  -- Lead que não nasceu no site (Champion Direct, prospecção) não tem sessão nem
  -- anúncio a resgatar. Sem esta saída o gatilho reescrevia attribution_source
  -- de 'instagram_dm' para 'paid_unknown' e o lead do direct mandava CAPI (21/10/2026).
  IF NEW.origem_lead IS DISTINCT FROM 'site' THEN
    RETURN NEW;
  END IF;

  -- Macro não substituída pela Meta não é dado, em nenhum dos caminhos.
  NEW.placement        := public.sem_macro(NEW.placement);
  NEW.site_source_name := public.sem_macro(NEW.site_source_name);
  NEW.campaign_id      := public.sem_macro(NEW.campaign_id);
  NEW.adset_id         := public.sem_macro(NEW.adset_id);
  NEW.ad_id            := public.sem_macro(NEW.ad_id);
  NEW.utm_source       := public.sem_macro(NEW.utm_source);
  NEW.utm_medium       := public.sem_macro(NEW.utm_medium);
  NEW.utm_campaign     := public.sem_macro(NEW.utm_campaign);
  NEW.utm_content      := public.sem_macro(NEW.utm_content);
  NEW.utm_term         := public.sem_macro(NEW.utm_term);

  -- Se o anúncio já veio na URL, é dado observado. Nada a inferir.
  IF NEW.ad_id IS NOT NULL THEN
    confianca := 'url';
  END IF;

  -- ── CAMINHO 1: a sessão exata que converteu (vínculo forte) ──────────────
  IF NEW.session_id IS NOT NULL
     AND NEW.session_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    BEGIN
      SELECT s.placement_raw, s.campaign_id, s.adset_id, s.ad_id, s.creative_id,
             s.utm_content, s.utm_term, s.utm_campaign, s.fbclid, s.fbc, s.ip_address
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
          confianca := 'sessao';
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

        -- NOVO: sem `fbclid` não se monta o `fbc`, e sem `fbc` a Meta não liga
        -- a conversão ao clique. O caminho por IP já fazia isso; este não.
        NEW.fbclid := COALESCE(NEW.fbclid, sessao_do_lead.fbclid);

        -- O IP da sessão vale mais que o do insert: é o IP de quem navegou.
        IF NEW.ip_address IS NULL OR NEW.ip_address = '' OR NEW.ip_address = 'unknown' THEN
          NEW.ip_address := sessao_do_lead.ip_address;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Um lead nunca pode ser perdido por causa da telemetria dele.
      RAISE WARNING 'recover_attribution (sessao): %', SQLERRM;
    END;
  END IF;

  -- ── CAMINHO 2: mesmo IP, dentro da janela ────────────────────────────────
  -- Roda mesmo havendo `session_id` — mas SÓ quando ainda não há anúncio algum
  -- e SÓ dentro da janela. É a diferença entre evidência e chute.
  IF public.sem_macro(NEW.ad_id) IS NULL
     AND NEW.ip_address IS NOT NULL
     AND NEW.ip_address <> ''
     AND NEW.ip_address <> 'unknown' THEN
    BEGIN
      SELECT s.campaign_id, s.adset_id, s.ad_id, s.creative_id,
             s.utm_content, s.utm_term, s.utm_campaign,
             s.utm_source, s.utm_medium, s.fbclid, s.placement_raw,
             s.created_at
        INTO sessao_por_ip
        FROM public.lead_sessions s
       WHERE s.ip_address = NEW.ip_address
         AND s.ad_id IS NOT NULL
         AND s.ad_id NOT LIKE '%{{%'
         AND s.created_at >= now() - JANELA_MEDIA
         AND (NEW.session_id IS NULL OR s.id::text <> NEW.session_id)
       ORDER BY s.created_at DESC
       LIMIT 1;

      IF FOUND THEN
        NEW.campaign_id := COALESCE(public.sem_macro(NEW.campaign_id), sessao_por_ip.campaign_id);
        NEW.adset_id    := COALESCE(public.sem_macro(NEW.adset_id),    sessao_por_ip.adset_id);
        NEW.ad_id       := COALESCE(public.sem_macro(NEW.ad_id),       sessao_por_ip.ad_id);
        NEW.utm_term    := COALESCE(public.sem_macro(NEW.utm_term),    sessao_por_ip.utm_term);
        NEW.fbclid      := COALESCE(NEW.fbclid,                        sessao_por_ip.fbclid);
        NEW.placement   := COALESCE(NEW.placement, public.sem_macro(sessao_por_ip.placement_raw));

        IF public.sem_macro(NULLIF(NEW.utm_content, 'link_in_bio')) IS NULL THEN
          NEW.utm_content := sessao_por_ip.utm_content;
        END IF;
        IF public.sem_macro(NEW.utm_campaign) IS NULL THEN
          NEW.utm_campaign := sessao_por_ip.utm_campaign;
        END IF;

        resgatou_anuncio := TRUE;
        confianca := CASE
          WHEN sessao_por_ip.created_at >= now() - JANELA_ALTA THEN 'ip_60min'
          ELSE 'ip_24h'
        END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'recover_attribution (ip): %', SQLERRM;
    END;
  END IF;

  -- Última rede: macro que tenha vindo de qualquer sessão morre aqui.
  NEW.campaign_id := public.sem_macro(NEW.campaign_id);
  NEW.adset_id    := public.sem_macro(NEW.adset_id);
  NEW.ad_id       := public.sem_macro(NEW.ad_id);

  -- ── A CLASSIFICAÇÃO ──────────────────────────────────────────────────────
  tem_anuncio := (NEW.ad_id IS NOT NULL)
                 OR (NEW.utm_medium IN ('paid_social', 'cpc', 'paid', 'ppc'));

  veio_de_plataforma := (
    NEW.utm_source IS NOT NULL
    AND NEW.utm_source <> ''
    AND NEW.utm_source <> 'direct'
    AND lower(NEW.utm_source) IN ('ig','fb','instagram','facebook','meta','tiktok','google','yt','youtube','linkedin')
  );

  NEW.attribution_source := CASE
    -- anúncio veio na URL do clique: observado, sem inferência
    WHEN NEW.ad_id IS NOT NULL AND confianca = 'url'   THEN 'direct_ad'
    -- anúncio foi resgatado (sessão ou IP)
    WHEN resgatou_anuncio                               THEN 'bio_recovery'
    -- sem anúncio, mas com utm de anúncio na URL
    WHEN tem_anuncio                                    THEN 'direct_ad'
    -- veio de plataforma paga e NÃO dá para dizer qual anúncio
    WHEN veio_de_plataforma                             THEN 'paid_unknown'
    ELSE 'organic'
  END;

  NEW.attribution_confidence := confianca;

  RETURN NEW;
END;
$function$;

-- Os leads do direct que já existem voltam a dizer de onde vieram
-- (depois da função nova, para o UPDATE não passar pelo resgate de novo).
UPDATE public.leads
   SET origem_lead = 'direct', attribution_source = 'instagram_dm'
 WHERE raw_answers_json->>'fonte' = 'champion_direct';

-- ── 3. CAPI: só lead do site vai para a Meta ────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_capi_on_lead_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.origem_lead IS DISTINCT FROM 'site' OR NEW.attribution_source = 'instagram_dm' THEN
    INSERT INTO public.capi_dispatch_log (origem, lead_id, status, detalhe)
    VALUES ('trigger', NEW.id, 'ignorado', 'lead fora do site (origem_lead=' || coalesce(NEW.origem_lead, '?') || ')');
    RETURN NEW;
  END IF;
  PERFORM public.despachar_capi_lead(NEW.id, 'trigger');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_capi_on_lead_insert: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- ── 4. Reconciliação de 5 em 5 minutos: mesma regra ─────────────────────────
CREATE OR REPLACE FUNCTION public.reconciliar_capi_leads(p_horas integer DEFAULT 48, p_max integer DEFAULT 20)
 RETURNS TABLE(pendentes integer, despachados integer, orfas_soltas integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- Lead do direct e da prospecção não vai para a Meta (21/10/2026).
      AND l.origem_lead = 'site'
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
$function$;

-- ── 5. As peças orgânicas publicadas ────────────────────────────────────────
-- Quem publica cadastra (agent de postagem do Instagram). É o que transforma
-- "o link do post" em "S5-C3 · O comercial mais proibido da TV".
CREATE TABLE IF NOT EXISTS public.organico_pecas (
  id            bigserial PRIMARY KEY,
  midia_id      text UNIQUE,                 -- id da mídia na Graph API (post, reel ou story)
  shortcode     text UNIQUE,                 -- o pedaço do link: instagram.com/p/<shortcode>/
  permalink     text,
  tipo          text NOT NULL CHECK (tipo IN ('carrossel', 'reel', 'story', 'post')),
  codigo        text,                        -- S5-C3, R12, story-2026-10-21
  titulo        text,
  palavra       text,                        -- a palavra do CTA (DIAGNÓSTICO, GANCHO...)
  funil         text,                        -- pagina | isca | bio | nenhum
  publicado_em  timestamptz NOT NULL DEFAULT now(),
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organico_pecas_publicado_idx ON public.organico_pecas (publicado_em DESC);
ALTER TABLE public.organico_pecas ENABLE ROW LEVEL SECURITY;  -- só service role

CREATE OR REPLACE FUNCTION public.shortcode_do_link(p text)
 RETURNS text LANGUAGE sql IMMUTABLE
AS $sc$ SELECT substring(p from '/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)') $sc$;

-- ── 6. O canal de cada lead ─────────────────────────────────────────────────
-- canal: direct_comentario | direct_story | direct_dm | direct_seguidor | direct_link
--        | story_link | bio | pago | pago_sem_anuncio | prospeccao | sem_origem
-- peca_confianca: observado (veio no próprio lead) | janela (post da bio da semana) | null
CREATE OR REPLACE VIEW public.lead_canal WITH (security_invoker = true) AS
WITH b AS (
  SELECT l.id AS lead_id, l.created_at, l.origem_lead, l.attribution_source,
         l.raw_answers_json->'origem_detalhe' AS det,
         l.utm_campaign,
         CASE
           WHEN l.origem_lead = 'prospeccao' THEN 'prospeccao'
           WHEN l.origem_lead = 'direct' THEN
             CASE l.raw_answers_json->>'origem'
               WHEN 'comentario' THEN 'direct_comentario'
               WHEN 'story'      THEN 'direct_story'
               WHEN 'seguidor'   THEN 'direct_seguidor'
               WHEN 'ref'        THEN 'direct_link'
               ELSE 'direct_dm' END
           WHEN l.attribution_source IN ('direct_ad', 'bio_recovery') THEN 'pago'
           WHEN lower(coalesce(l.utm_medium, '')) = 'story' THEN 'story_link'
           WHEN lower(coalesce(l.utm_content, '')) = 'link_in_bio' THEN 'bio'
           WHEN l.attribution_source = 'paid_unknown' THEN 'pago_sem_anuncio'
           ELSE 'sem_origem'
         END AS canal
  FROM public.leads l
)
SELECT b.lead_id, b.created_at, b.origem_lead, b.canal,
       coalesce(p.codigo, b.det->>'automacao', CASE WHEN b.canal = 'story_link' THEN b.utm_campaign END) AS peca_codigo,
       p.titulo AS peca_titulo,
       p.tipo   AS peca_tipo,
       coalesce(p.permalink, b.det->>'permalink') AS peca_link,
       CASE WHEN p.id IS NOT NULL AND b.canal = 'bio' THEN 'janela'
            WHEN p.id IS NOT NULL OR b.det->>'permalink' IS NOT NULL OR b.det->>'story' IS NOT NULL
                 OR (b.canal = 'story_link' AND b.utm_campaign IS NOT NULL) THEN 'observado'
       END AS peca_confianca
FROM b
LEFT JOIN LATERAL (
  SELECT op.* FROM public.organico_pecas op
  WHERE (b.canal = 'direct_comentario' AND (op.shortcode = public.shortcode_do_link(b.det->>'permalink') OR op.midia_id = b.det->>'midia'))
     OR (b.canal = 'direct_story' AND op.midia_id = b.det->>'story')
     OR (b.canal = 'story_link' AND op.codigo = b.utm_campaign)
     OR (b.canal = 'bio' AND op.funil = 'bio' AND op.publicado_em <= b.created_at AND op.publicado_em > b.created_at - interval '8 days')
  ORDER BY op.publicado_em DESC
  LIMIT 1
) p ON true;
