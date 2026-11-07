-- Experimento de qualificação (07/09/2026) — três variáveis que hoje são cegas.
--
-- A análise da coorte de julho a setembro mostrou o limite do que o banco sabe
-- responder: o score separa bem quem chega à reunião, e não explica quem fecha.
-- Duas causas foram observadas nas calls e NÃO existem no banco (capacidade de
-- investimento e poder de decisão), e o motivo de perda está preenchido em 3 de
-- 17 reuniões sem venda.
--
-- Esta migration só CRIA ESPAÇO para o dado. Nada aqui altera score, MQL,
-- roteamento, ou o envio de eventos ao Meta. Nenhum valor histórico é migrado.
--
-- ATENÇÃO: NÃO APLICADA. Criada em 07/09/2026 e deixada pendente de propósito,
-- junto com o front que a acompanha. Aplicar com o mesmo procedimento das
-- outras: conferir `supabase migration list` antes do push.

-- ── 1. Investimento mensal em tráfego (no lead) ─────────────────────────────
--
-- A coluna `leads.trafego_faixa` já existe desde 20260201192620 e tinha
-- exatamente esta semântica no quiz antigo. Foi conferido antes de reusar:
-- **zero linhas preenchidas em toda a base** (2.244 leads). Não há histórico
-- com as faixas antigas para se misturar com as novas, então reusar é seguro e
-- evita duas colunas para a mesma pergunta.
--
-- As faixas novas (definidas em 07/09/2026) são:
--   Não invisto ainda · Até R$ 2 mil · R$ 2 mil a R$ 10 mil ·
--   R$ 10 mil a R$ 30 mil · R$ 30 mil a R$ 100 mil · Acima de R$ 100 mil
--
-- Sem CHECK de propósito: se a lista mudar durante o experimento, uma resposta
-- nova não pode derrubar o insert do lead. A régua fica no front.

COMMENT ON COLUMN public.leads.trafego_faixa IS
  'Investimento MENSAL em tráfego pago, declarado no quiz (pergunta q13_trafego, criada em 07/09/2026). Coluna criada em fevereiro para a mesma pergunta e nunca preenchida; reusada em 07/09/2026 com faixas novas. EXPERIMENTO: não entra no score, não define MQL, não muda roteamento. Existe para cruzar investimento x faturamento x score x reunião x venda.';

CREATE INDEX IF NOT EXISTS idx_leads_trafego_faixa
  ON public.leads (trafego_faixa)
  WHERE trafego_faixa IS NOT NULL;

-- ── 2. Quem mais participa da decisão (NO LEAD) ─────────────────────────────
--
-- Fica em `leads`, e não em `meetings`, porque o dado precisa existir ANTES da
-- reunião: o objetivo é o SDR saber que aquela call pede o sócio. E o time
-- registra a reunião quase sempre depois que ela já aconteceu (27 das 32 sem
-- data de call), então uma coluna em `meetings` chegaria tarde demais.
--
-- Não reusei `leads.decisor`, que já existe: é BOOLEAN com default false e vale
-- false em 203 de 203 leads. Semântica incompatível — ele responde "é decisor?"
-- e esta pergunta responde "quem MAIS decide". Reusar misturaria um campo morto
-- com dado novo e ainda exigiria trocar o tipo da coluna.
--
-- Opcional por definição: nada no funil depende dela, e todo lead histórico
-- fica NULL, que o CHECK permite.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS decisao_processo TEXT;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_decisao_processo_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_decisao_processo_check
  CHECK (decisao_processo IS NULL OR decisao_processo IN (
    'sozinho',       -- decide sozinho
    'socio',         -- decide junto com o sócio: a call precisa dos dois
    'acima',         -- participa, mas outra pessoa também precisa aprovar
    'outra_pessoa',  -- não é ele quem decide esse tipo de coisa
    'nao_sabe'       -- fora da tela desde 07/09/2026; mantido por compatibilidade
  ));

COMMENT ON COLUMN public.leads.decisao_processo IS
  'Quem mais participa da decisão de contratar, perguntado pelo SDR na conversa antes de existir reunião (experimento de 07/09/2026). OPCIONAL e sem efeito em score, MQL ou roteamento: serve para testar se a ausência do segundo decisor explica a faixa de R$ 150 mil a R$ 1 milhão, que agenda 43% e fecha 20%.';

CREATE INDEX IF NOT EXISTS idx_leads_decisao_processo
  ON public.leads (decisao_processo)
  WHERE decisao_processo IS NOT NULL;

-- ── 3. Motivo de perda: duas categorias novas ───────────────────────────────
--
-- `preco` juntava dois casos opostos: quem não tem dinheiro e quem achou caro.
-- O primeiro é problema de qualificação, o segundo é de oferta, e a conversa
-- que cada um exige é diferente. `nao_percebeu_valor` entra pelo mesmo motivo:
-- estava caindo em `outro` e sumindo da agregação.
--
-- Nenhum valor existente é removido, então nenhuma linha histórica é invalidada.
-- `fechou`, `reembolso` e `concorrente` continuam válidos.

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_motivo_categoria_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_motivo_categoria_check
  CHECK (motivo_categoria IS NULL OR motivo_categoria IN (
    'fechou',
    'reembolso',
    'sem_verba',           -- NOVO: quer e entendeu, não tem como pagar agora
    'preco',               -- passa a significar só: tem caixa, achou caro
    'decisor',             -- quem estava na call não podia decidir
    'timing',
    'sem_fit',
    'nao_percebeu_valor',  -- NOVO: tem condições, não se convenceu
    'concorrente',
    'sumiu',
    'outro'
  ));

COMMENT ON COLUMN public.meetings.motivo_categoria IS
  'Desfecho da call, para agregação: fechou, reembolso, sem_verba, preco, decisor, timing, sem_fit, nao_percebeu_valor, concorrente, sumiu, outro. Em 07/09/2026 "preco" foi partido em sem_verba (não tem caixa) e preco (tem caixa, achou caro), e nao_percebeu_valor saiu de dentro de "outro".';
