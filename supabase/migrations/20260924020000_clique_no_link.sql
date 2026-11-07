-- ============================================================================
-- CLIQUE NO LINK, SEPARADO DE CLIQUE TOTAL  (D-019)
-- ============================================================================
--
-- `ad_spend.clicks` é o `clicks` da Meta: TODO clique no anúncio — curtida,
-- comentário, compartilhamento, "ver mais", clique na foto do perfil, clique no
-- link. Nunca foi clique de link, e foi lido como se fosse.
--
-- A prova está no próprio banco: em 12 dos 27 criativos de setembro/2026 o
-- `landing_page_views` SUPERA o `clicks` (chega a 139% dele). Isso é impossível
-- se `clicks` fosse clique no link, porque ninguém chega na página sem clicar
-- nela. O que acontece é o contrário: a Meta conta cliques que não vão a lugar
-- nenhum, e o CTR calculado daí fica bem acima do CTR de link do gerenciador —
-- que é sobre o qual a régua da casa (1% / 1,5% / 2%) foi escrita.
--
-- Por que duas colunas e não uma conta:
--
--   `inline_link_clicks` é o numerador honesto e soma entre linhas, então toda
--   agregação (por criativo, por conta, por período) recalcula o CTR a partir
--   dele e de `impressions`. É ele que manda.
--
--   `inline_link_click_ctr` é o número que a META reportou para ESTA linha, e
--   existe para conferência: quando o painel e o gerenciador discordarem, é a
--   coluna que diz de qual lado está o erro. NÃO some, NÃO tire média dela
--   entre linhas — CTR de vários dias é `sum(inline_link_clicks) /
--   sum(impressions)`, nunca a média dos CTRs diários.
--
-- Ambas nascem NULL de propósito. Zero significaria "ninguém clicou no link";
-- NULL significa "esta linha é anterior à sincronização do campo". Confundir os
-- dois criaria um CTR 0% falso em todo o histórico, que é pior que a ausência:
-- o histórico só ganha valor quando o `meta-ads-cron?days=N` for rodado para
-- trás, e até lá a tela precisa mostrar "—", não "0%".
ALTER TABLE public.ad_spend
  ADD COLUMN IF NOT EXISTS inline_link_clicks INTEGER,
  ADD COLUMN IF NOT EXISTS inline_link_click_ctr NUMERIC(8,4);

COMMENT ON COLUMN public.ad_spend.inline_link_clicks IS
  'Cliques no LINK do anuncio (Meta: inline_link_clicks). Numerador do CTR de link. NULL = linha anterior a sincronizacao do campo, nao zero.';

COMMENT ON COLUMN public.ad_spend.inline_link_click_ctr IS
  'CTR de link em % que a Meta reportou para ESTA linha (Meta: inline_link_click_ctr). Valor de conferencia; agregacao recalcula por sum(inline_link_clicks)/sum(impressions). NULL = linha anterior a sincronizacao do campo.';

COMMENT ON COLUMN public.ad_spend.clicks IS
  'Cliques TOTAIS no anuncio (Meta: clicks): inclui curtida, comentario, compartilhamento e ver-mais. NAO e clique de link e nao serve para CTR -- use inline_link_clicks.';
