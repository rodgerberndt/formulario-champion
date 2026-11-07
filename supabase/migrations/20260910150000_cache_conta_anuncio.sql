-- ============================================================================
-- meta_ads_cache ganha a CONTA
-- ============================================================================
--
-- O catálogo já guardava campaign/adset/ad/creative, mas não a conta dona do
-- anúncio. Sem ela, o card "Origem do Anúncio" não consegue mostrar o primeiro
-- nível da hierarquia (CONTA → CAMPANHA → CONJUNTO → ANÚNCIO) e um mesmo nome
-- de campanha em duas contas fica indistinguível.
--
-- `ad_account_id` aponta para o cadastro permanente criado em
-- 20260910120000_meta_ad_accounts.sql. ON DELETE SET NULL, e não RESTRICT: o
-- cache é derivado e descartável, diferente do `ad_spend`, que é dinheiro.
ALTER TABLE public.meta_ads_cache
  ADD COLUMN IF NOT EXISTS ad_account_id TEXT;

ALTER TABLE public.meta_ads_cache
  DROP CONSTRAINT IF EXISTS meta_ads_cache_conta_fk;
ALTER TABLE public.meta_ads_cache
  ADD CONSTRAINT meta_ads_cache_conta_fk
  FOREIGN KEY (ad_account_id) REFERENCES public.meta_ad_accounts(ad_account_id)
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON COLUMN public.meta_ads_cache.ad_account_id IS
  'Conta dona do anuncio, resolvida pelo campo account_id do Graph. Permite exibir CONTA -> CAMPANHA -> CONJUNTO -> ANUNCIO sem casar nada por nome.';

COMMENT ON COLUMN public.meta_ads_cache.creative_name IS
  'Nome do CRIATIVO na Meta. ATENCAO: quando o criativo nasce de um post, a Meta o nomeia com o TEXTO DA COPY (ex.: "Nao adianta nada fazer tudo na sua operacao... 2026-09-09-00552b7c"). NAO e o nome do anuncio e NAO identifica o anuncio: dois anuncios diferentes podem ter o mesmo creative_name. Para identificar o anuncio use ad_name.';

COMMENT ON COLUMN public.meta_ads_cache.ad_name IS
  'Nome oficial do ANUNCIO na Meta. E o nome canonico para exibicao. Historicamente muitos anuncios ficavam como "Ad"/"Ad — Copia", o que levou o painel a preferir creative_name; a estrutura mudou e os anuncios passaram a ter nome proprio.';
