-- Por que a call não virou venda.
--
-- O sistema sabia dizer QUANTAS reuniões aconteceram e quantas fecharam. Não
-- sabia dizer POR QUE as outras não fecharam — e é essa a informação que muda
-- oferta, página e roteiro, não a contagem.
--
-- ── Duas colunas, e as duas são necessárias ──────────────────────────────────
-- `motivo_categoria` é o balde, e existe para poder AGREGAR: "preço" apareceu
-- em 6 das 10 calls perdidas é uma frase acionável; ler dez textos livres não é.
-- `motivo_detalhe` é o texto do Caio, e existe porque o balde perde o caso: "a
-- esposa não deixou" e "o sócio vetou" caem os dois em `decisor`, mas a
-- conversa que cada um pede é diferente.
--
-- Sem a categoria, isto vira um diário que ninguém lê. Sem o texto, vira uma
-- estatística que não ensina nada. As duas juntas é que servem.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS motivo_categoria TEXT,
  ADD COLUMN IF NOT EXISTS motivo_detalhe TEXT,
  ADD COLUMN IF NOT EXISTS motivo_por TEXT,
  ADD COLUMN IF NOT EXISTS motivo_at TIMESTAMPTZ;

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_motivo_categoria_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_motivo_categoria_check
  CHECK (motivo_categoria IS NULL OR motivo_categoria IN (
    'fechou',      -- virou venda: o desfecho bom também é um motivo
    'preco',       -- achou caro, ou não tem caixa agora
    'decisor',     -- depende de sócio, esposa, ou de quem não estava na call
    'timing',      -- quer, mas não agora
    'sem_fit',     -- não é o cliente que a Champion atende
    'concorrente', -- foi para outro fornecedor
    'sumiu',       -- parou de responder depois da call
    'outro'
  ));

COMMENT ON COLUMN public.meetings.motivo_categoria IS
  'Balde do desfecho da call, para agregação: fechou, preco, decisor, timing, sem_fit, concorrente, sumiu, outro.';
COMMENT ON COLUMN public.meetings.motivo_detalhe IS
  'O que o closer escreveu sobre a call. O balde perde o caso; este campo guarda o caso.';
COMMENT ON COLUMN public.meetings.motivo_por IS
  'Quem registrou o motivo. Normalmente o Caio, que é quem faz a call.';

-- O que o painel procura: call que já aconteceu e ainda não tem desfecho
-- escrito. É a fila de trabalho do closer.
CREATE INDEX IF NOT EXISTS idx_meetings_motivo_pendente
  ON public.meetings (scheduled_at)
  WHERE status = 'realizada' AND motivo_categoria IS NULL;
