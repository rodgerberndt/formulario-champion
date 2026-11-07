-- ============================================================================
-- SQL — O LEAD QUE O COMERCIAL ACEITOU
-- ============================================================================
--
-- Sales Qualified Lead: o SDR falou com a pessoa e confirmou que ela tem
-- perfil e momento. É a PRIMEIRA etapa da cascata que depende de alguém
-- julgar; tudo antes dela (MQL por faixa de faturamento, HQL por score) sai de
-- regra automática sobre o que a própria pessoa declarou no formulário.
--
-- Por que a etapa precisa existir, e por que agora: hoje a cascata pula de HQL
-- direto para "reunião marcada", e nesse pulo mora o buraco que a leitura de
-- 20/09 encontrou — o funil vaza no MEIO, com 13 MQL virando 1 reunião. Sem o
-- SQL não dá para saber de que lado está a perda:
--
--   MQL alto, SQL baixo   → o lead qualifica no papel e não sustenta conversa:
--                           o problema está na régua de qualificação ou no
--                           criativo que promete o que a call não confirma.
--   SQL alto, reunião baixa → o lead é bom e o comercial não converte em
--                           agenda: o problema está na operação, não na mídia.
--
-- Hoje esses dois casos produzem exatamente o mesmo número, e é por isso que a
-- discussão sobre "a mídia está ruim" nunca fecha.
--
-- Segue o padrão da perda (`perdido_at`/`perda_motivo`/`perda_por`, 08/09):
-- data, quem, e o porquê quando houver — nunca um booleano solto, que não diz
-- quando virou nem quem decidiu.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sql_at     timestamptz,
  ADD COLUMN IF NOT EXISTS sql_por    text,
  ADD COLUMN IF NOT EXISTS sql_motivo text;

-- A lista é curta de propósito. Motivo de SQL não é diagnóstico de venda: é só
-- o que o SDR ouviu que o fez aceitar. Diagnóstico mora na reunião.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_sql_motivo_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_sql_motivo_check
  CHECK (sql_motivo IS NULL OR sql_motivo IN (
    'perfil_e_momento',   -- tem o problema e quer resolver agora
    'perfil_sem_momento', -- é o cliente certo, mas não é agora
    'indicado',           -- chegou por indicação e já vem aquecido
    'outro'
  ));

-- Data e autor andam juntos. Um SQL sem autor não pode ser cobrado nem
-- auditado, e a etapa inteira existe para ser cobrada.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_sql_coerente;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_sql_coerente
  CHECK ((sql_at IS NULL) = (sql_por IS NULL));

-- Um lead não pode estar aceito pelo comercial e perdido ao mesmo tempo SEM
-- que a perda seja posterior. Aceitar e depois perder é normal; nascer perdido
-- e aceito no mesmo instante é erro de registro.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_sql_antes_da_perda;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_sql_antes_da_perda
  CHECK (sql_at IS NULL OR perdido_at IS NULL OR sql_at <= perdido_at);

CREATE INDEX IF NOT EXISTS leads_sql_aceitos
  ON public.leads (sql_at) WHERE sql_at IS NOT NULL;

COMMENT ON COLUMN public.leads.sql_at IS
  'Quando o comercial ACEITOU o lead (Sales Qualified Lead). Etapa manual, entre HQL e reuniao marcada. NULL = ainda nao avaliado OU recusado; recusa se registra na perda.';
COMMENT ON COLUMN public.leads.sql_por IS
  'Quem aceitou. Sem autor a etapa nao e auditavel.';
COMMENT ON COLUMN public.leads.sql_motivo IS
  'O que o SDR ouviu que o fez aceitar. Diagnostico de venda mora na reuniao, nao aqui.';
