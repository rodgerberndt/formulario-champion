-- Resgata o placement do TOUCH quando o navegador não o entregou.
--
-- ── O mecanismo da perda, provado em 11/09/2026 ─────────────────────────────
-- `utm_placement` chega na URL: 451 de 960 visitas em 30 dias, com valores
-- reais. Mesmo assim `leads.placement` estava em 1 de 210.
--
-- A pista que fechou o diagnóstico: os leads que perderam o placement perderam
-- JUNTO o `campaign_id` — 149 leads `direct_ad`, apenas 3 com campaign_id e
-- apenas 1 com placement. E o único que manteve um, manteve o outro.
--
-- A causa é o caminho curto deste mesmo trigger. Quando o lead chega com
-- `utm_source` válido, ele marca `direct_ad` e RETORNA na hora, sem consultar
-- a sessão. O que o navegador não mandou naquele instante, morre ali. E o
-- navegador não manda quando a sessão de conversão começou numa URL parcial —
-- outra aba, outra entrada, link sem os parâmetros completos.
--
-- Para `campaign_id` isso é uma decisão de atribuição existente, e NÃO é
-- alterada aqui. Para `placement` não era decisão nenhuma: o campo
-- simplesmente não tinha de onde ser resgatado, porque `lead_sessions` não
-- tinha a coluna até a migration 20260911140000.
--
-- ── Por que pelo session_id, e não pelo IP ──────────────────────────────────
-- O resgate por IP que existe no caminho longo é uma heurística de última
-- instância. Aqui o vínculo é EXATO: `lead_sessions.id = NEW.session_id` é a
-- mesma sessão de conversão que originou o lead. Sem isso o risco seria montar
-- um Frankenstein — campanha de um toque e posicionamento de outro.
--
-- ── O que este arquivo NÃO faz ─────────────────────────────────────────────
-- Não altera a recuperação de utm_source, utm_campaign, campaign_id, adset_id
-- nem ad_id. Não muda o modelo de atribuição. Não inventa valor: se a sessão
-- também não tiver placement, o campo continua NULL.

CREATE OR REPLACE FUNCTION public.recover_attribution_from_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_session RECORD;
  has_valid_utm BOOLEAN;
  placement_do_touch TEXT;
BEGIN
  -- Macro não substituída pela Meta nunca é dado, em nenhum dos caminhos.
  IF NEW.placement IS NOT NULL AND NEW.placement LIKE '%{{%' THEN NEW.placement := NULL; END IF;
  IF NEW.site_source_name IS NOT NULL AND NEW.site_source_name LIKE '%{{%' THEN NEW.site_source_name := NULL; END IF;

  -- RESGATE DO POSICIONAMENTO, pela sessão EXATA que converteu.
  --
  -- Roda antes dos dois desfechos porque o placement se perde nos dois. Só
  -- preenche o que está vazio: valor vindo do navegador sempre manda.
  IF NEW.placement IS NULL AND NEW.session_id IS NOT NULL THEN
    BEGIN
      SELECT s.placement_raw INTO placement_do_touch
        FROM public.lead_sessions s
       WHERE s.id::text = NEW.session_id
       LIMIT 1;
      IF placement_do_touch IS NOT NULL AND placement_do_touch NOT LIKE '%{{%' THEN
        NEW.placement := placement_do_touch;
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

  RETURN NEW;
END;
$function$;
