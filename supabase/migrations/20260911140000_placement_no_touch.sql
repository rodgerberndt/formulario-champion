-- Placement no TOUCH, não só no lead.
--
-- Diagnóstico de 11/09/2026: `utm_placement` chega na URL em 451 de 960 visitas
-- dos últimos 30 dias, com valores reais (`Instagram_Reels`, `an`), e apenas 3
-- trazem a macro `{{placement}}` sem expandir. Ou seja, o dado existe.
--
-- Ele morria em dois lugares, ambos no navegador:
--
--   1. `useAttribution` nunca capturou `placement` nem `site_source_name`.
--   2. A recuperação por bio em `useUtmCapture` sobrescrevia o sessionStorage
--      com `placement: null` e `site_source_name: null` CRAVADOS, enquanto
--      recuperava utm_source, campaign_id, adset_id e ad_id.
--
-- A assinatura do defeito está nos números: de julho a setembro, `placement` e
-- `site_source_name` são os ÚNICOS dois campos em 0/210, enquanto `utm_source`
-- está em 210/210.
--
-- ── Por que a coluna vai para as tabelas de TOUCH ───────────────────────────
-- `landing_hits` é append-only: cada linha é uma visita, com a URL daquela
-- visita. Guardar o placement ali significa que o valor pertence ao mesmo
-- toque que trouxe a campanha e o anúncio — sem risco de montar um Frankenstein
-- com campanha de um toque e posicionamento de outro.
--
-- ── Por que RAW ─────────────────────────────────────────────────────────────
-- `placement_raw` guarda o literal da Meta (`Instagram_Reels`, `Facebook_Feed`,
-- `an`). NÃO derivamos publisher_platform nem platform_position aqui: a URL não
-- manda essas dimensões, e `an` não diz se foi `an_classic` ou `rewarded_video`.
-- Inventar a decomposição transformaria suposição em dado observado.

ALTER TABLE public.landing_hits
  ADD COLUMN IF NOT EXISTS placement_raw TEXT;

ALTER TABLE public.lead_sessions
  ADD COLUMN IF NOT EXISTS placement_raw TEXT;

COMMENT ON COLUMN public.landing_hits.placement_raw IS
  'Valor LITERAL de utm_placement na URL daquela visita (ex.: Instagram_Reels, an). Macro {{placement}} não expandida é descartada. Não derivar publisher_platform/platform_position daqui.';
COMMENT ON COLUMN public.lead_sessions.placement_raw IS
  'Valor LITERAL de utm_placement na primeira URL da sessão. Mesmo campo de leads.placement, guardado no toque.';
COMMENT ON COLUMN public.leads.placement IS
  'Valor LITERAL de utm_placement no momento em que o lead nasceu (conversion session). Preenchido a partir de 11/09/2026; antes disso a recuperação por bio o zerava.';

-- A leitura por posicionamento sempre vem junto com um recorte de data.
CREATE INDEX IF NOT EXISTS idx_landing_hits_placement
  ON public.landing_hits (placement_raw, created_at DESC)
  WHERE placement_raw IS NOT NULL;
