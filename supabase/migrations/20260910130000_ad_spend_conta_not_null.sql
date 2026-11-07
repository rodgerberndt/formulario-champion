-- ============================================================================
-- ad_spend.ad_account_id passa a ser OBRIGATÓRIO
-- ============================================================================
--
-- A migration anterior deixou um CHECK datado como paliativo, porque havia 162
-- linhas históricas sem conta e falsificar account_id para conseguir NOT NULL
-- seria pior que o problema.
--
-- O backfill fechou em 162/162:
--   55 por dedução determinística de campaign_id já associado (SQL)
--  107 pela Meta, via GET /{campaign_id}?fields=account_id  (edge `meta-accounts`)
--    0 sem resposta
--
-- Nenhuma linha foi atribuída por nome, por sufixo de ID ou por heurística.
-- As duas campanhas órfãs (`LP4 - ABO - (04/07)` e `Teste — ABO - OBJ MQL`)
-- voltaram da Meta como `act_1733204057869041`, a CA 02.
--
-- Com zero nulos, o CHECK datado vira desnecessário e o NOT NULL passa a valer
-- para todas as linhas — inclusive as antigas. É a garantia mais forte: nenhuma
-- linha de gasto pode existir sem dono, em nenhuma época.
--
-- Efeito colateral conhecido e desejado: a rota `POST /admin-data/ad-spend`
-- insere sem `ad_account_id` e sem `ad_id`. Ela passa a falhar. Nenhum arquivo
-- do front a chama e nenhuma linha da base veio dela (0 linhas sem `ad_id` em
-- 1024). Gasto órfão deixa de ser possível de criar à mão.

DO $$
DECLARE nulas INTEGER;
BEGIN
  SELECT COUNT(*) INTO nulas FROM public.ad_spend WHERE ad_account_id IS NULL;
  IF nulas > 0 THEN
    RAISE EXCEPTION 'NAO PROMOVIDO: ainda existem % linhas de ad_spend sem ad_account_id. Resolva o backfill antes.', nulas;
  END IF;
END;
$$;

ALTER TABLE public.ad_spend
  ALTER COLUMN ad_account_id SET NOT NULL;

-- O CHECK datado era a ponte enquanto o legado existia. Cumpriu o papel.
ALTER TABLE public.ad_spend
  DROP CONSTRAINT IF EXISTS ad_spend_conta_obrigatoria_apos_marco;

COMMENT ON COLUMN public.ad_spend.ad_account_id IS
  'Conta dona do gasto. OBRIGATORIO. FK para meta_ad_accounts com ON DELETE RESTRICT: o banco recusa apagar uma conta que tenha historico.';
