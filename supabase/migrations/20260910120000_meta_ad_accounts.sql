-- ============================================================================
-- CADASTRO PERMANENTE DE CONTAS DE ANÚNCIO
-- ============================================================================
--
-- Por que esta migration existe, em uma frase: em 06/09/2026 10:41:33 alguém
-- editou o secret `META_AD_ACCOUNT_IDS_EXTRA` e a conta que respondia por 100%
-- do gasto de setembro saiu do sync. A última linha de `ad_spend` tinha sido
-- gravada 80 segundos antes. O cron continuou rodando de 5 em 5 minutos,
-- devolvendo `total_fetched: 0` com HTTP 200, e ninguém percebeu por 4 dias.
--
-- A causa não foi o cron nem a Meta. Foi o cadastro de contas morar num campo
-- de texto sem histórico, sem revisão e sem dono. Esta migration tira o
-- cadastro do secret e o coloca numa tabela, com a integridade garantida pelo
-- banco em vez de por disciplina.
--
-- Três invariantes que passam a ser estruturais:
--
--   1. Conta com histórico NÃO PODE ser apagada  → FK ON DELETE RESTRICT
--   2. Duas linhas para a mesma (conta, dia, anúncio) NÃO PODEM coexistir
--                                                 → UNIQUE
--   3. Linha NOVA de gasto NÃO PODE nascer sem conta
--                                                 → CHECK datado
--
-- O que esta migration deliberadamente NÃO faz: não inventa moeda, não deduz
-- conta por nome ou por padrão de ID, e não liga o sync de ninguém. Todas as
-- contas entram com `sync_enabled = false`.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. A TABELA
-- ────────────────────────────────────────────────────────────────────────────
--
-- `ad_account_id` é a PRIMARY KEY, e não um id surrogate: a chave natural já é
-- única e estável na Meta, e vira a FK do `ad_spend` sem indireção nenhuma.
--
-- `account_name` é RÓTULO, nunca identidade. O nome muda no Gerenciador e o ID
-- não. Toda tela deve exibir o nome e AGRUPAR PELO ID — foi agrupar por nome
-- que fez R$ 6.916,88 de duas contas virarem uma linha só no painel.
CREATE TABLE IF NOT EXISTS public.meta_ad_accounts (
  ad_account_id           TEXT PRIMARY KEY,
  account_name            TEXT,

  -- A moeda pertence à CONTA. Nasce NULA de propósito: até a Meta confirmar,
  -- ela é desconhecida, e desconhecido não vira palpite. O sync recusa
  -- sincronizar conta sem moeda resolvida.
  currency                TEXT,
  currency_source         TEXT,          -- 'graph' | 'manual'
  currency_verified_at    TIMESTAMPTZ,

  account_status          INTEGER,       -- código cru da Meta
  account_status_txt      TEXT,          -- 1=ACTIVE 2=DISABLED 3=UNSETTLED ...
  business_id             TEXT,
  business_name           TEXT,

  -- O interruptor do sync. Desligar NÃO esconde e NÃO apaga histórico:
  -- só para de consultar a Meta sobre esta conta.
  sync_enabled            BOOLEAN NOT NULL DEFAULT false,
  sync_notes              TEXT,

  -- Estes três são coisas DIFERENTES e confundi-los foi como o incidente de
  -- 06/09 ficou invisível:
  --   first_seen_at            quando entrou no cadastro
  --   last_seen_at             última vez que a Meta respondeu sobre ela
  --   last_successful_sync_at  última vez que ela TROUXE linha de gasto
  -- Uma conta pode responder perfeitamente e não trazer nada há uma semana.
  first_seen_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at            TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  last_sync_error         TEXT,
  last_sync_error_at      TIMESTAMPTZ,

  -- Arquivar tira dos seletores da tela. NÃO tira dos relatórios históricos:
  -- em 2027 julho/2026 continua abrindo com esta conta dentro.
  archived_at             TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT meta_ad_accounts_id_formato CHECK (ad_account_id ~ '^act_[0-9]+$'),
  CONSTRAINT meta_ad_accounts_moeda_formato CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  -- Moeda sem procedência é palpite. Se há moeda, há de onde ela veio.
  CONSTRAINT meta_ad_accounts_moeda_tem_origem CHECK (currency IS NULL OR currency_source IS NOT NULL)
);

COMMENT ON TABLE public.meta_ad_accounts IS
  'Cadastro PERMANENTE de contas de anúncio. Fonte de verdade do sync, no lugar dos secrets META_AD_ACCOUNT_ID/_IDS_EXTRA. Conta inativa nunca é apagada: sync_enabled=false para de consultar, archived_at some dos seletores, e o histórico continua consultável nos dois casos.';
COMMENT ON COLUMN public.meta_ad_accounts.account_name IS
  'Rótulo de exibição, NUNCA chave de agrupamento. Agrupar por nome funde contas diferentes.';
COMMENT ON COLUMN public.meta_ad_accounts.currency IS
  'Moeda da conta, confirmada pela Meta. NULA enquanto desconhecida — o sync recusa conta sem moeda em vez de assumir BRL.';
COMMENT ON COLUMN public.meta_ad_accounts.last_seen_at IS
  'Última resposta da Meta sobre a conta. Diferente de last_successful_sync_at, que é a última vez que ela trouxe gasto.';

CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_sync
  ON public.meta_ad_accounts (sync_enabled) WHERE archived_at IS NULL;

-- updated_at automático.
CREATE OR REPLACE FUNCTION public.set_meta_ad_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_ad_accounts_updated_at ON public.meta_ad_accounts;
CREATE TRIGGER trg_meta_ad_accounts_updated_at
  BEFORE UPDATE ON public.meta_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_meta_ad_accounts_updated_at();

-- Sem policy alguma: RLS ligada e nenhuma regra pública significa que só o
-- service_role (que ignora RLS) enxerga. Cadastro de conta não é dado de
-- navegador.
ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. CADASTRO INICIAL — as 7 contas com prova visual no Gerenciador (10/09/2026)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Todas entram com sync_enabled = false. Ligar é um UPDATE de uma coluna, e é
-- uma decisão explícita — não um efeito colateral de uma migration.
--
-- currency fica NULA em todas. A moeda vem da Meta, pela função `meta-accounts`.
-- Há registro em docs/HERMES.md de que act_1107952820265255 seria BRL e as CA02
-- e CA04 seriam USD, mas isso é documento, não leitura confirmada — e uma moeda
-- errada multiplica ou divide o gasto por ~5.
INSERT INTO public.meta_ad_accounts (ad_account_id, account_name, sync_enabled, sync_notes)
VALUES
  ('act_1592493385874898', 'CA 05 - BMsss',  false, 'Entrega ativa desde 07/09/2026. Aguardando moeda confirmada e liberação explícita para sincronizar.'),
  ('act_1965417164121284', 'CA 03 - BMsss',  false, 'Responde por 100% do gasto de setembro/2026 (R$ 14.209,86). Saiu do sync em 06/09 por edição de secret. Pausada, NAO morta.'),
  ('act_1733204057869041', 'CA 02 - BMsss',  false, 'Historico de junho a agosto/2026. Sem entrega desde 15/08.'),
  ('act_4571654849820572', 'CA 04 - BMsss',  false, 'Estava no sync em 10/09/2026 com gasto zero. Erro de pagamento desde julho.'),
  ('act_1107952820265255', 'CA03 BM NOVA',   false, 'R$ 128 mil de historico fora deste banco. Fatura em aberto.'),
  ('act_3706010813006692', 'BR 1',           false, 'Cadastrada pela prova visual do Gerenciador. Uso desconhecido.'),
  ('act_938115981694308',  'Conta 03',       false, 'Cadastrada pela prova visual do Gerenciador. Uso desconhecido.')
ON CONFLICT (ad_account_id) DO UPDATE
  SET account_name = COALESCE(public.meta_ad_accounts.account_name, EXCLUDED.account_name);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. BACKFILL NÍVEL 1 — dedução determinística pelo campaign_id
-- ────────────────────────────────────────────────────────────────────────────
--
-- 162 linhas (julho inteiro e parte de agosto, R$ 4.936,76) ficaram sem conta
-- porque a coluna `ad_account_id` só nasceu em 14/08/2026.
--
-- Um campaign_id pertence a UMA conta na Meta. Quando o mesmo campaign_id
-- aparece em linhas que JÁ têm conta, a dona da linha órfã está determinada.
-- Não é heurística: é a mesma campanha.
--
-- O HAVING é a trava: se um campaign_id aparecesse sob duas contas diferentes,
-- ele não seria determinístico e a linha continua nula. Prefiro nulo a chute.
UPDATE public.ad_spend AS alvo
SET ad_account_id = dono.conta
FROM (
  SELECT campaign_id, MIN(ad_account_id) AS conta
  FROM public.ad_spend
  WHERE ad_account_id IS NOT NULL AND campaign_id IS NOT NULL
  GROUP BY campaign_id
  HAVING COUNT(DISTINCT ad_account_id) = 1
) AS dono
WHERE alvo.ad_account_id IS NULL
  AND alvo.campaign_id = dono.campaign_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. INTEGRIDADE DO ad_spend
-- ────────────────────────────────────────────────────────────────────────────

-- 4a. Colunas de auditoria de câmbio.
--
-- `spend_original`, `spend_currency`, `exchange_rate` e `spend` já existem e já
-- permitem refazer a conta. O que faltava era saber DE QUANDO era a taxa: é por
-- isso que uma cotação de 11/07/2026 ficou dois meses em uso sem ninguém notar.
ALTER TABLE public.ad_spend
  ADD COLUMN IF NOT EXISTS fx_rate_date DATE,
  ADD COLUMN IF NOT EXISTS fx_source    TEXT,
  ADD COLUMN IF NOT EXISTS fx_status    TEXT,
  ADD COLUMN IF NOT EXISTS synced_at    TIMESTAMPTZ;

COMMENT ON COLUMN public.ad_spend.fx_rate_date IS
  'Data da cotacao usada nesta linha. Permite auditar em 2027 qual taxa converteu este gasto.';
COMMENT ON COLUMN public.ad_spend.fx_status IS
  'fresh = cotacao do dia; stale = cotacao antiga dentro da tolerancia; n/a = moeda ja era BRL.';
COMMENT ON COLUMN public.ad_spend.synced_at IS
  'Quando o sync gravou esta linha. Separado de created_at para sobreviver a upsert.';

-- 4b. A conta precisa existir no cadastro.
--
-- ON DELETE RESTRICT é o coração desta migration: o banco passa a RECUSAR
-- apagar uma conta que tenha uma única linha de gasto. "Não perca o histórico"
-- deixa de ser combinado e vira regra.
--
-- NULL em coluna com FK é sempre válido, então isto convive com o legado ainda
-- não resolvido.
ALTER TABLE public.ad_spend
  DROP CONSTRAINT IF EXISTS ad_spend_conta_fk;
ALTER TABLE public.ad_spend
  ADD CONSTRAINT ad_spend_conta_fk
  FOREIGN KEY (ad_account_id) REFERENCES public.meta_ad_accounts(ad_account_id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4c. Uma linha por conta + dia + anúncio.
--
-- Confirmado contra os dados antes de criar: 0 repetições de
-- (ad_account_id, date, ad_id) e 0 de (date, ad_id) em 1024 linhas; nenhum
-- ad_id nulo ou vazio; nenhum ad_id sob mais de um adset ou campanha. Não há
-- dimensão escondida — a query do sync pede `level=ad&time_increment=1`, que é
-- exatamente esta granularidade.
--
-- Isto é o que faltava para o DELETE+INSERT do sync poder virar UPSERT atômico.
CREATE UNIQUE INDEX IF NOT EXISTS ad_spend_conta_data_ad_uniq
  ON public.ad_spend (ad_account_id, date, ad_id);

-- 4d. Linha NOVA não nasce sem conta.
--
-- NOT NULL é impossível enquanto houver legado irresolvido, e falsificar
-- account_id histórico para conseguir NOT NULL seria pior que o problema.
--
-- A saída é um CHECK datado: linhas gravadas ANTES do marco podem ter conta
-- nula (é o legado, e a última delas foi criada em 10/08/2026 23:55 UTC);
-- linhas gravadas DEPOIS, não. Como `created_at` tem DEFAULT now(), qualquer
-- INSERT novo sem `ad_account_id` é rejeitado pelo banco — inclusive pela rota
-- manual `POST /admin-data/ad-spend`, que hoje insere sem conta e sem ad_id.
--
-- Quando o legado for todo resolvido, isto vira NOT NULL e o CHECK cai.
ALTER TABLE public.ad_spend
  DROP CONSTRAINT IF EXISTS ad_spend_conta_obrigatoria_apos_marco;
ALTER TABLE public.ad_spend
  ADD CONSTRAINT ad_spend_conta_obrigatoria_apos_marco
  CHECK (ad_account_id IS NOT NULL OR created_at < TIMESTAMPTZ '2026-09-10 00:00:00+00');

-- ────────────────────────────────────────────────────────────────────────────
-- 5. FX — cache por moeda, com procedência
-- ────────────────────────────────────────────────────────────────────────────
--
-- `fx_rates` tinha UMA linha: USD, 11/07/2026, 5.1064. A AwesomeAPI vinha
-- devolvendo 429 em toda tentativa porque o cron pedia cotação POR CONTA a cada
-- 5 minutos — ~576 chamadas por dia. O `catch` usava a última cotação conhecida
-- e seguia em silêncio. Dois meses de métricas em real com câmbio de julho.
ALTER TABLE public.fx_rates
  ADD COLUMN IF NOT EXISTS source     TEXT,
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;

COMMENT ON COLUMN public.fx_rates.source IS 'De onde veio a cotacao (ex.: awesomeapi).';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. VERIFICAÇÃO — falha alto se algo saiu diferente do previsto
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  contas       INTEGER;
  orfas        INTEGER;
  duplicadas   INTEGER;
BEGIN
  SELECT COUNT(*) INTO contas FROM public.meta_ad_accounts;
  IF contas < 7 THEN
    RAISE EXCEPTION 'Esperava ao menos 7 contas cadastradas, encontrei %', contas;
  END IF;

  SELECT COUNT(*) INTO orfas
  FROM public.ad_spend s
  WHERE s.ad_account_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.meta_ad_accounts c WHERE c.ad_account_id = s.ad_account_id);
  IF orfas > 0 THEN
    RAISE EXCEPTION 'ad_spend tem % linhas apontando para conta fora do cadastro', orfas;
  END IF;

  SELECT COUNT(*) INTO duplicadas FROM (
    SELECT 1 FROM public.ad_spend
    WHERE ad_account_id IS NOT NULL
    GROUP BY ad_account_id, date, ad_id HAVING COUNT(*) > 1
  ) x;
  IF duplicadas > 0 THEN
    RAISE EXCEPTION 'ad_spend tem % combinacoes (conta, dia, anuncio) repetidas', duplicadas;
  END IF;

  RAISE NOTICE 'meta_ad_accounts: % contas. ad_spend ainda sem conta: %',
    contas,
    (SELECT COUNT(*) FROM public.ad_spend WHERE ad_account_id IS NULL);
END;
$$;
