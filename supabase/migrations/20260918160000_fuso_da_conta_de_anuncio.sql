-- ============================================================================
-- O FUSO DA CONTA DE ANÚNCIO — declarado em vez de presumido
-- ============================================================================
--
-- NÃO APLICADA. Opcional: o painel funciona sem ela (cai no padrão
-- America/Sao_Paulo e o leitor de `meta_ad_accounts` já trata a ausência da
-- coluna sem erro). Aplique quando quiser que o fuso seja DADO em vez de
-- suposição.
--
-- ── O problema, medido em 18/09/2026 ────────────────────────────────────────
-- `ad_spend.date` é o `date_start` que a Meta devolve com `time_increment=1`:
-- o dia NO FUSO DA CONTA. Leads e sessões são filtrados por `created_at` em
-- UTC, contra um `from`/`to` que a tela já converteu do fuso do NAVEGADOR.
--
-- São dois relógios diferentes, e o código nunca leu nenhum dos dois. Hoje não
-- há deslocamento porque as três contas que gastam são UTC−3 (CA05 e CA03 em
-- `Brazil/East`, CA02 em `America/Belem`), idênticas ao BRT do dono. Isso é
-- coincidência de cadastro: basta uma conta nova fora de UTC−3, ou o dono
-- abrindo o painel em viagem, para gasto e leads passarem a falar de dias
-- diferentes — sem aviso nenhum, com os totais continuando plausíveis.
--
-- ── O que esta migration faz ────────────────────────────────────────────────
-- Cria a coluna e carrega o que já se sabe, marcando a PROCEDÊNCIA. `Brazil/East`
-- e `America/Belem` vêm do registro da construção das contas (memória
-- project_snapshot_ca05_builds, 12/09/2026), NÃO de leitura viva da Graph API —
-- e por isso entram como 'memoria', não como 'graph'. Quem quiser o valor
-- confirmado deve ler `timezone_name` no endpoint da conta e atualizar com
-- `timezone_source = 'graph'`.
--
-- As contas sem informação ficam NULAS. Nulo aqui é honesto: o painel usa o
-- padrão documentado e diz que está usando.

ALTER TABLE public.meta_ad_accounts
  ADD COLUMN IF NOT EXISTS timezone_name   TEXT,
  ADD COLUMN IF NOT EXISTS timezone_source TEXT;

COMMENT ON COLUMN public.meta_ad_accounts.timezone_name IS
  'Fuso IANA declarado pela Meta para a conta (ex.: America/Sao_Paulo). E o fuso em que ad_spend.date e contado. NULO = desconhecido; o painel usa America/Sao_Paulo e declara que esta usando o padrao.';
COMMENT ON COLUMN public.meta_ad_accounts.timezone_source IS
  'De onde veio o fuso: graph (lido da API) ou memoria (registro da construcao da conta). Fuso sem procedencia e palpite.';

-- Procedência obrigatória, mesma regra já usada para `currency`.
ALTER TABLE public.meta_ad_accounts
  DROP CONSTRAINT IF EXISTS meta_ad_accounts_fuso_tem_origem;
ALTER TABLE public.meta_ad_accounts
  ADD CONSTRAINT meta_ad_accounts_fuso_tem_origem
  CHECK (timezone_name IS NULL OR timezone_source IS NOT NULL);

-- Só preenche o que está vazio: um valor já lido da Graph API nunca é
-- sobrescrito pelo que está na memória. Idempotente por construção.
UPDATE public.meta_ad_accounts
   SET timezone_name = 'America/Sao_Paulo', timezone_source = 'memoria'
 WHERE ad_account_id IN ('act_1592493385874898', 'act_1965417164121284')
   AND timezone_name IS NULL;

UPDATE public.meta_ad_accounts
   SET timezone_name = 'America/Belem', timezone_source = 'memoria'
 WHERE ad_account_id = 'act_1733204057869041'
   AND timezone_name IS NULL;

DO $$
DECLARE com_fuso INTEGER;
BEGIN
  SELECT COUNT(*) INTO com_fuso FROM public.meta_ad_accounts WHERE timezone_name IS NOT NULL;
  RAISE NOTICE 'meta_ad_accounts com fuso declarado: % (as demais usam America/Sao_Paulo como padrao documentado)', com_fuso;
END;
$$;

-- ============================================================================
-- TESTE ANTES DE APLICAR
-- ============================================================================
--
--   SELECT ad_account_id, account_name, timezone_name, timezone_source
--     FROM public.meta_ad_accounts ORDER BY account_name;
--
-- Depois de aplicar, o painel passa a devolver em `/creatives` o bloco `fuso`,
-- com `divergencia: false` enquanto as três contas ativas forem UTC−3.
-- Confirmar o valor real na Meta:
--   GET /v21.0/act_XXXX?fields=timezone_name,timezone_offset_hours_utc
-- e, batendo, trocar `timezone_source` para 'graph'.
