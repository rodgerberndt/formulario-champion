-- HERMES — agente de tráfego que sobe criativos novos no Meta automaticamente.
--
-- Fluxo: arquivo cai no bucket `hermes-criativos` -> Hermes ingere -> gera N
-- variações de copy (Claude) -> sobe a mídia no Meta -> cria 1 anúncio PAUSADO
-- por variação dentro do adset de destino -> avisa no WhatsApp -> o Rodger
-- aprova e o anúncio sobe.
--
-- Um anúncio por variação de copy (e não um flexible ad com várias headlines)
-- porque a régua da casa é CPMQL por anúncio: dentro de um asset_feed_spec o
-- Meta não separa métrica por headline, e o teste perde o sentido.

-- Destino e regras de subida. Uma linha por conta de anúncios.
CREATE TABLE IF NOT EXISTS public.hermes_config (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label              TEXT NOT NULL,
  ad_account_id      TEXT NOT NULL UNIQUE,       -- act_XXXXXXXX
  page_id            TEXT NOT NULL,              -- página do Facebook do anúncio
  instagram_actor_id TEXT,                       -- conta do IG (opcional)
  default_campaign_id TEXT,
  default_adset_id   TEXT,                       -- destino no modo 'fixo'
  -- 'duplicar' espelha a estrutura que a casa já usa na campanha de TESTE AB:
  -- a headline é a variável do CONJUNTO (HD1..HDn), não do anúncio. Cada
  -- headline gerada vira um conjunto clonado do modelo, com o mesmo público,
  -- pixel, orçamento e lance, e o criativo entra em todos eles.
  adset_mode         TEXT NOT NULL DEFAULT 'fixo' CHECK (adset_mode IN ('fixo','duplicar')),
  template_adset_id  TEXT,                       -- conjunto-modelo a clonar
  adset_name_pattern TEXT NOT NULL DEFAULT 'HD{n}',
  link_url           TEXT NOT NULL,              -- {slot} vira o nome do conjunto
  cta_type           TEXT NOT NULL DEFAULT 'LEARN_MORE',
  copies_per_creative SMALLINT NOT NULL DEFAULT 3 CHECK (copies_per_creative BETWEEN 1 AND 10),
  auto_activate      BOOLEAN NOT NULL DEFAULT false,  -- false = sobe pausado e espera aprovação
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Cada modo exige o seu destino. Sem isto, uma config pela metade só
  -- aparece como erro do Meta lá na frente, depois do upload já pago.
  CONSTRAINT hermes_config_destino CHECK (
    (adset_mode = 'fixo'      AND default_adset_id  IS NOT NULL) OR
    (adset_mode = 'duplicar'  AND template_adset_id IS NOT NULL AND default_campaign_id IS NOT NULL)
  )
);

-- Fila de criativos.
CREATE TABLE IF NOT EXISTS public.hermes_creatives (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path   TEXT NOT NULL UNIQUE,    -- caminho dentro do bucket hermes-criativos
  file_name      TEXT NOT NULL,
  media_type     TEXT NOT NULL CHECK (media_type IN ('video','image')),
  angle          TEXT,                    -- ângulo lido do nome do arquivo
  briefing       TEXT,                    -- contexto extra que o editor deixou no .txt irmão
  config_id      UUID REFERENCES public.hermes_config(id) ON DELETE SET NULL,
  adset_id       TEXT,                    -- sobrescreve o padrão da config
  status         TEXT NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente','processando','no_ar','ativo','erro','ignorado')),
  meta_video_id  TEXT,
  meta_image_hash TEXT,
  thumbnail_url  TEXT,
  attempts       SMALLINT NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Variações de copy geradas, uma linha por anúncio criado.
CREATE TABLE IF NOT EXISTS public.hermes_copies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id     UUID NOT NULL REFERENCES public.hermes_creatives(id) ON DELETE CASCADE,
  variant         SMALLINT NOT NULL,
  primary_text    TEXT NOT NULL,
  headline        TEXT NOT NULL,
  description     TEXT,
  angle_used      TEXT,          -- de qual referência de performance saiu
  rationale       TEXT,          -- por que o modelo escreveu assim
  ad_name         TEXT,
  -- No modo 'duplicar' cada variação ganha o seu próprio conjunto clonado.
  meta_adset_id   TEXT,
  adset_name      TEXT,
  meta_creative_id TEXT,
  meta_ad_id      TEXT,
  status          TEXT NOT NULL DEFAULT 'gerada'
                  CHECK (status IN ('gerada','pausado','ativo','rejeitado','erro')),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creative_id, variant)
);

-- Trilha de execução: cada passo de cada criativo, para depurar sem adivinhar.
CREATE TABLE IF NOT EXISTS public.hermes_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID REFERENCES public.hermes_creatives(id) ON DELETE CASCADE,
  step        TEXT NOT NULL,
  ok          BOOLEAN NOT NULL,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hermes_creatives_status ON public.hermes_creatives (status, created_at);
CREATE INDEX IF NOT EXISTS idx_hermes_copies_creative ON public.hermes_copies (creative_id);
CREATE INDEX IF NOT EXISTS idx_hermes_runs_creative ON public.hermes_runs (creative_id, created_at DESC);

ALTER TABLE public.hermes_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hermes_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hermes_copies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hermes_runs      ENABLE ROW LEVEL SECURITY;

-- Sem policy para anon/authenticated: tudo passa pela edge function com service
-- role. Os dados incluem destino de campanha e copy não publicada.
CREATE POLICY "service role hermes_config"    ON public.hermes_config    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role hermes_creatives" ON public.hermes_creatives FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role hermes_copies"    ON public.hermes_copies    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role hermes_runs"      ON public.hermes_runs      FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Bucket privado dos criativos. O Meta recebe a mídia por signed URL de curta duração.
INSERT INTO storage.buckets (id, name, public)
VALUES ('hermes-criativos', 'hermes-criativos', false)
ON CONFLICT (id) DO NOTHING;
