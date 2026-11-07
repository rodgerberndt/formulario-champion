-- ─────────────────────────────────────────────────────────────────────────────
-- O lead que entra pelo link da bio precisa marcar o criativo certo.
--
-- O QUE FOI MEDIDO EM 21/09/2026, nos três leads que chegaram por `link_in_bio`:
--
--   Pedro Henrique  sessão da bio 04:55:46 · MESMO IP com `Nulle #7` 04:55:42
--                   → quatro segundos de diferença. É o mesmo percurso.
--   luiz godoy      sessão da bio 21/09 14:37 · MESMO IP com `Case Ighor #5`
--                   20/09 18:34 → 20 horas antes. Provável, não certo.
--   Fellipe Lopes   única sessão do IP, nenhum anúncio em lugar nenhum.
--                   → o dado NÃO EXISTE do nosso lado. Não há o que resgatar.
--
-- A Meta atribuiu exatamente 2 dos 3 — os dois que têm rastro aqui. Ou seja: o
-- dado para acertar dois deles sempre esteve no banco, e a gente não usava.
--
-- POR QUE NÃO ESTAVA SENDO USADO: a versão de 20260918170000 desligou o caminho
-- por IP sempre que existe `session_id`. O motivo era legítimo (dois leads atrás
-- do mesmo NAT pegam a sessão um do outro), mas a cura foi ampla demais: matou
-- também o caso de 4 segundos, em que o IP é praticamente certeza.
--
-- O QUE MUDA AQUI
--
--   1. O caminho por IP volta a rodar MESMO com `session_id` — porém só quando,
--      depois da sessão exata, ainda não há anúncio nenhum, e só dentro de uma
--      JANELA DE TEMPO. Sem janela, IP é chute; com janela curta, é evidência.
--
--   2. Nasce `leads.attribution_confidence`, que diz DE ONDE veio a atribuição.
--      Dado observado e dado inferido nunca mais se misturam na mesma coluna.
--
--   3. `direct_ad` deixa de ser carimbado quando não há anúncio nenhum. Hoje
--      `utm_source=ig` do link da bio passa no teste e vira `direct_ad` sem um
--      único `ad_id` — foi o que fez o painel mostrar "Ad" em lead que ninguém
--      consegue ligar a criativo.
--
--   4. Entra o estado `paid_unknown`: veio de plataforma paga, sem anúncio
--      identificável. É o caso do Fellipe. Chamar isso de `organic` esconderia
--      a contribuição da mídia; chamar de `direct_ad` inventa um anúncio.
--
--   5. O caminho por `session_id` passa a resgatar `fbclid`/`fbc`, que ele não
--      resgatava (só o caminho por IP resgatava). Sem `fbclid` não se monta o
--      `fbc`, e sem `fbc` a Meta não casa a conversão com o clique.
--
-- JANELAS ESCOLHIDAS (ajustáveis num único lugar, nas constantes abaixo):
--   ≤ 60 min  → `ip_60min`, confiança alta   (cobre o caso dos 4 segundos)
--   ≤ 24 h    → `ip_24h`,   confiança média  (cobre o caso das 20 horas)
--   > 24 h    → não resgata. Não é mais evidência, é torcida.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. A coluna que separa o observado do inferido ──────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS attribution_confidence text;

COMMENT ON COLUMN public.leads.attribution_confidence IS
  'De onde veio a atribuicao: url (veio na URL do clique) | sessao (resgatado da sessao exata que converteu) | ip_60min (mesmo IP ate 60 min antes) | ip_24h (mesmo IP ate 24h antes) | nenhum. Serve para nunca confundir dado observado com inferido.';

-- ── 2. O índice que torna a busca por IP barata ─────────────────────────────
-- Sem ele a consulta por IP varre a tabela toda a cada insert de lead.
CREATE INDEX IF NOT EXISTS idx_lead_sessions_ip_created_pago
  ON public.lead_sessions (ip_address, created_at DESC)
  WHERE ad_id IS NOT NULL;

-- ── 3. A função ─────────────────────────────────────────────────────────────
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

COMMENT ON FUNCTION public.recover_attribution_from_session() IS
  'Precedencia: valor do navegador > sessao por session_id > mesmo IP dentro da janela (60 min = alta, 24h = media) > nada. O caminho por IP so roda quando NAO ha anuncio depois dos anteriores. Grava attribution_confidence para separar observado (url) de inferido (sessao/ip). direct_ad exige anuncio de verdade; link da bio sem anuncio vira paid_unknown, nunca direct_ad nem organic.';

-- ─────────────────────────────────────────────────────────────────────────────
-- COMO CONFERIR DEPOIS DE APLICAR (só SELECT)
--
--   SELECT attribution_source, attribution_confidence, count(*)
--     FROM public.leads
--    WHERE created_at >= now() - interval '7 days'
--    GROUP BY 1,2 ORDER BY 3 DESC;
--
-- O backfill dos leads já gravados NÃO acontece aqui de propósito: este arquivo
-- só muda o comportamento daqui para a frente. O backfill vai em arquivo
-- separado, para poder ser revisto e revertido sozinho.
-- ─────────────────────────────────────────────────────────────────────────────
