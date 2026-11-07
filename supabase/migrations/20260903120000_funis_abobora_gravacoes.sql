-- Três mudanças que o comercial pediu em 03/09/2026, todas na mesma fatia do
-- funil: de onde veio a venda, o que precisa estar sabido antes da call, e onde
-- fica a gravação depois dela.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O funil de origem
--
-- Até aqui TODA venda e TODA reunião do painel eram tratadas como mídia paga,
-- porque era o único jeito de entrar: o formulário é a porta. Só que existem
-- dois outros funis rodando fora dele — indicação e social selling — e hoje eles
-- ou ficam fora do sistema, ou entram fingindo ser tráfego e sujam o CAC.
--
-- Nenhum dos dois passa pelo quiz, então nenhum dos dois tem `lead_id`. Por isso
-- `lead_nome`: é o único jeito de saber de quem é a venda quando não existe lead.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'midia_paga',
  ADD COLUMN IF NOT EXISTS lead_nome TEXT;

ALTER TABLE public.manual_sales DROP CONSTRAINT IF EXISTS manual_sales_origem_check;
ALTER TABLE public.manual_sales
  ADD CONSTRAINT manual_sales_origem_check
  CHECK (origem IN ('midia_paga', 'indicacao', 'social_selling'));

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'midia_paga',
  ADD COLUMN IF NOT EXISTS lead_nome TEXT;

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_origem_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_origem_check
  CHECK (origem IN ('midia_paga', 'indicacao', 'social_selling'));

COMMENT ON COLUMN public.manual_sales.origem IS
  'Funil que gerou a venda: midia_paga (veio do formulário) - indicacao - social_selling. Indicação e social selling não passam pelo quiz e por isso costumam vir sem lead_id.';
COMMENT ON COLUMN public.meetings.origem IS
  'Funil que gerou a reunião. Mesmo domínio de manual_sales.origem.';
COMMENT ON COLUMN public.manual_sales.lead_nome IS
  'Nome de quem comprou quando não há lead no sistema (indicação e social selling). Para midia_paga o nome vem do lead.';
COMMENT ON COLUMN public.meetings.lead_nome IS
  'Nome de quem tem a call quando não há lead no sistema.';

-- Todo histórico é mídia paga: até esta migration não havia outra forma de
-- registrar. Explicitar em vez de deixar no DEFAULT deixa o dado auditável.
UPDATE public.manual_sales SET origem = 'midia_paga' WHERE origem IS NULL;
UPDATE public.meetings SET origem = 'midia_paga' WHERE origem IS NULL;

CREATE INDEX IF NOT EXISTS idx_manual_sales_origem ON public.manual_sales (origem);
CREATE INDEX IF NOT EXISTS idx_meetings_origem ON public.meetings (origem);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Processo Abóbora
--
-- O que o SDR precisa ter descoberto ANTES de passar a call para o closer. Não
-- é formulário burocrático: as quatro perguntas existem para não gastar uma hora
-- de closer com quem não decide, não tem caixa, ou não é da operação certa.
--
-- Colunas separadas, e não um JSON, porque a graça está em cruzar isto com o
-- desfecho: quem decide sozinho fecha mais? qual faixa de investimento fecha?
-- Dentro de um jsonb cada uma dessas perguntas vira um scan de tabela.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS abobora_posicao TEXT,
  ADD COLUMN IF NOT EXISTS abobora_segmento TEXT,
  ADD COLUMN IF NOT EXISTS abobora_decide TEXT,
  ADD COLUMN IF NOT EXISTS abobora_quem_decide TEXT,
  ADD COLUMN IF NOT EXISTS abobora_investimento TEXT;

COMMENT ON COLUMN public.meetings.abobora_posicao IS
  'Posição do lead na operação: dono/decisor final, ou head que leva o projeto ao CEO.';
COMMENT ON COLUMN public.meetings.abobora_segmento IS
  'Segmento e nicho da operação.';
COMMENT ON COLUMN public.meetings.abobora_decide IS
  'Ele consegue dizer sim ou não à assessoria na própria call: sim | nao.';
COMMENT ON COLUMN public.meetings.abobora_quem_decide IS
  'Quando ele não decide: quem decide, e se essa pessoa vem à call. Obrigatório só quando abobora_decide = nao.';
COMMENT ON COLUMN public.meetings.abobora_investimento IS
  'Investimento em tráfego e faturamento declarados na qualificação.';

-- A reunião só está pronta para o closer quando o abóbora está completo. A
-- coluna é gerada: não dá para gravar "completa" sem ter preenchido, e quem lê
-- (painel, IA, relatório) nunca precisa repetir a regra.
--
-- A quarta pergunta é condicional de propósito: quem decide sozinho não tem
-- "quem mais decide" para informar, e exigir isso dele travaria a reunião certa.
ALTER TABLE public.meetings DROP COLUMN IF EXISTS abobora_completa;
ALTER TABLE public.meetings
  ADD COLUMN abobora_completa BOOLEAN
  GENERATED ALWAYS AS (
    NULLIF(BTRIM(abobora_posicao), '') IS NOT NULL
    AND NULLIF(BTRIM(abobora_segmento), '') IS NOT NULL
    AND abobora_decide IN ('sim', 'nao')
    AND NULLIF(BTRIM(abobora_investimento), '') IS NOT NULL
    AND (
      abobora_decide = 'sim'
      OR NULLIF(BTRIM(abobora_quem_decide), '') IS NOT NULL
    )
  ) STORED;

COMMENT ON COLUMN public.meetings.abobora_completa IS
  'Calculada. Verdadeira quando as quatro perguntas do Processo Abóbora estão respondidas (a de quem decide só é exigida quando o lead não decide sozinho).';

CREATE INDEX IF NOT EXISTS idx_meetings_abobora_completa ON public.meetings (abobora_completa);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A gravação da call
--
-- A gravação já existe no Drive, mas cada uma para num lugar diferente e ninguém
-- reencontra depois. Sem o link preso à reunião não há como olhar dez calls do
-- mesmo criativo e achar o padrão, que é o ponto inteiro de gravar.
--
-- `recording_folder` é o balde: por criativo validado, campanha ou variante de
-- página. Fica gravado na reunião e não recalculado na leitura, porque o
-- criativo do lead pode ser renomeado depois e a gravação continua onde está.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS recording_folder TEXT,
  ADD COLUMN IF NOT EXISTS recording_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recording_by TEXT;

COMMENT ON COLUMN public.meetings.recording_url IS
  'Link da gravação no Drive.';
COMMENT ON COLUMN public.meetings.recording_folder IS
  'Balde de organização no Drive, congelado no momento do upload.';

CREATE INDEX IF NOT EXISTS idx_meetings_recording_folder ON public.meetings (recording_folder);

-- Onde fica cada balde no Drive. Uma linha por balde, criada na primeira vez que
-- alguém sobe gravação daquele criativo/campanha. Enquanto o Drive não estiver
-- conectado por OAuth, o Caio cola o link da pasta uma vez e as próximas calls
-- do mesmo balde já abrem direto nela.
CREATE TABLE IF NOT EXISTS public.drive_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL,
  label TEXT,
  folder_url TEXT NOT NULL,
  folder_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT drive_folders_bucket_unique UNIQUE (bucket)
);

ALTER TABLE public.drive_folders ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.drive_folders IS
  'Pasta do Drive de cada balde de gravação. RLS ligado e sem policy: só as edge functions (service role) leem e escrevem.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Leitura da call pela IA
--
-- Guardada na própria reunião, com o modelo e a data. Reanálise sobrescreve, e
-- a data é o que diz se a leitura é anterior ou posterior ao desfecho.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS analise_ia JSONB,
  ADD COLUMN IF NOT EXISTS analise_ia_at TIMESTAMPTZ;

COMMENT ON COLUMN public.meetings.analise_ia IS
  'Leitura da IA sobre a call: por que fechou ou não fechou, sinais do Processo Abóbora e o que repetir. Opinião gerada, nunca fato registrado.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Faturamento declarado em número
--
-- A faixa continua sendo a régua de MQL e todo o histórico está nela, então ela
-- fica. O número é o que o lead digita agora: é ele que permite ver que "de 10 a
-- 20 mil" é quase sempre 10, e é ele que a IA usa para qualificar.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS faturamento_declarado NUMERIC(14,2);

COMMENT ON COLUMN public.leads.faturamento_declarado IS
  'Faturamento total mensal em reais, digitado pelo lead. A partir de 03/09/2026 a faixa (investimento_faixa) é derivada deste número, não escolhida.';

CREATE INDEX IF NOT EXISTS idx_leads_faturamento_declarado
  ON public.leads (faturamento_declarado)
  WHERE faturamento_declarado IS NOT NULL;
