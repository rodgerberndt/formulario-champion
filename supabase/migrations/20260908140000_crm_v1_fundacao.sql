-- CRM V1 — fundação de dados (Etapa 1).
--
-- Cria a entidade que faltava no sistema: a INTERAÇÃO. Entre "lead entrou" e
-- "reunião marcada" o banco tinha um único carimbo (`contacted_at`) que, desde
-- a decisão de 04/09/2026, significa "abriu o card" — não "falou com alguém".
-- Das 15 perguntas comerciais que o Rodger levantou, o sistema respondia 1.
--
-- Esta migration é ADITIVA e INVISÍVEL para a operação: nenhuma tabela
-- existente é alterada além de três colunas novas em `leads`, nenhuma função
-- edge lê estas tabelas ainda, e nenhuma tela mudou. Se for revertida hoje,
-- produção fica exatamente como está.
--
-- Especificação: 02-Areas/Empresa/V1 Congelada do CRM Interno (08-09-2026).md
-- Pré-mortem:    02-Areas/Empresa/Pré-mortem do CRM Interno (08-09-2026).md
--
-- ── As três entidades, e por que exatamente três ────────────────────────────
--   channel_accounts   os números e perfis pelos quais se fala com o lead
--   lead_interactions  o que já aconteceu (fato, imutável, datado)
--   lead_tasks         o que vai acontecer (intenção, uma por lead)
--
-- `meetings` e `manual_sales` NÃO são tocadas: reunião e venda continuam sendo
-- delas. Nada de ciclo de vida entra em `lead_interactions` — duplicar produz
-- contagem dupla, que é o modo de falha que este CRM existe para eliminar.
--
-- ── O que NÃO existe aqui, de propósito ─────────────────────────────────────
-- Conteúdo de mensagem, tabela de mensagens, conversas/threads, identidades,
-- tokens, cron, automação, estado comercial armazenado. Ver o documento.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. channel_accounts — as contas e números
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por que tabela e não enum: um enum exige migration para cada número novo e
-- não sabe morrer. Um número que cai precisa CONTINUAR EXISTINDO para as
-- interações antigas apontarem para ele.
--
-- Três status, e a diferença entre os dois últimos importa:
--   ativa         em uso, aparece nos botões
--   inativa       aposentada de propósito (trocamos de plano, de número)
--   desconectada  CAIU ou foi bloqueada — exige ação, e a taxa de queda por
--                 conta é uma métrica que vamos querer

CREATE TABLE IF NOT EXISTS public.channel_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  kind                text NOT NULL,
  label               text NOT NULL,
  identifier          text,
  owner               text,
  is_personal         boolean NOT NULL DEFAULT false,
  is_default          boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'ativa',
  sort_order          smallint NOT NULL DEFAULT 0,

  -- Nascem nulos. Existem para que a chegada de um provedor de mensageria não
  -- exija migration, e para que "um channel_account é uma identidade de
  -- NEGÓCIO, não uma conexão técnica" continue verdadeiro: trocar de provedor
  -- ATUALIZA a linha, nunca cria outra. Criar outra racharia o histórico do
  -- número em dois e quebraria "conversão por número".
  provider            text,
  provider_account_id text,
  health_status       text,
  last_seen_at        timestamptz,

  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- Carimbar a data, e não só virar o status, é o que permite responder depois
  -- "esse número já estava desativado quando isso aconteceu?". Sem ela a
  -- pergunta fica permanentemente sem resposta.
  deactivated_at      timestamptz,

  CONSTRAINT channel_accounts_kind_check
    CHECK (kind IN ('whatsapp', 'instagram', 'telefone', 'email')),
  CONSTRAINT channel_accounts_status_check
    CHECK (status IN ('ativa', 'inativa', 'desconectada')),
  CONSTRAINT channel_accounts_label_unico UNIQUE (label),

  -- Coerência entre o status e o carimbo: conta ativa não tem data de baixa, e
  -- conta fora do ar sem data é justamente o buraco de auditoria acima.
  CONSTRAINT channel_accounts_baixa_coerente
    CHECK ((status = 'ativa') = (deactivated_at IS NULL))
);

-- Um só padrão. Sem isto, dois "is_default" e o botão principal do card fica
-- não-determinístico.
CREATE UNIQUE INDEX IF NOT EXISTS channel_accounts_um_padrao
  ON public.channel_accounts (is_default) WHERE is_default;

CREATE INDEX IF NOT EXISTS channel_accounts_ativas
  ON public.channel_accounts (sort_order) WHERE status = 'ativa';

ALTER TABLE public.channel_accounts ENABLE ROW LEVEL SECURITY;
-- Sem policy: só a service role (edge functions) lê e escreve, como as demais
-- tabelas comerciais. Estas linhas descrevem a operação da casa.

COMMENT ON TABLE public.channel_accounts IS
  'Contas e números por onde se fala com o lead. Uma linha = uma IDENTIDADE DE NEGÓCIO (um número, um perfil), nunca uma conexão de provedor: trocar de provedor atualiza a linha. Nunca deletar — o histórico aponta para cá.';
COMMENT ON COLUMN public.channel_accounts.label IS
  'Texto do botão no painel. A lista de botões sai daqui, nunca de código.';
COMMENT ON COLUMN public.channel_accounts.owner IS
  'Pessoa dona da conta, ou NULL para conta da casa. SEM CHECK de propósito: contratar alguém não pode exigir migration. Validado na aplicação contra PESSOAS de _shared/roteamento.ts.';
COMMENT ON COLUMN public.channel_accounts.status IS
  'ativa | inativa (aposentada de propósito) | desconectada (caiu ou foi bloqueada — exige ação).';
COMMENT ON COLUMN public.channel_accounts.deactivated_at IS
  'Quando saiu do ar. Preencher SEMPRE que o status deixar de ser ativa: é o que responde "esse número já estava desativado quando isso aconteceu?".';
COMMENT ON COLUMN public.channel_accounts.provider IS
  'Provedor de mensageria. NULO na V1 — nenhuma integração existe ainda.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. lead_interactions — o fato comercial
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Uma linha = um ATO de comunicação com o lead, ou uma nota comercial.
-- NÃO é uma linha por mensagem: cinco mensagens às 08:40 são UMA tentativa, que
-- é como qualquer humano contaria. Cinco linhas quebrariam "tentativas até
-- resposta" no primeiro dia.
--
-- O que NÃO entra aqui, e a lista vale tanto quanto a do que entra:
--   · abrir o card             já existe `leads.first_opened_at`
--   · reunião / no-show        é de `meetings`
--   · venda / reembolso        é de `manual_sales`
--   · lead entrou / MQL / SLA  é de `leads`, com data própria
--   · follow automático do IG  ação de robô, não tentativa comercial; contá-la
--                              inflaria "% contatados" com trabalho que ninguém fez
--
-- ── Por que `kind` e `direction` separados, e por que não existe `type` ─────
-- "tentativa" NÃO é um tipo: é a LEITURA de uma saída sem entrada posterior.
-- Misturar direção dentro do tipo produz explosão combinatória e combinações
-- sem sentido ("tentativa" + entrada). `kind` é o MEIO; `direction` é quem
-- começou.
--
-- ── Por que não existe coluna `channel` ────────────────────────────────────
-- Deriva de `channel_accounts.kind`. Duas fontes para o mesmo fato é a classe
-- de bug que fez `kommo_status` dizer 'pending' para a base inteira enquanto a
-- realidade era outra. Custa um join por chave primária.

CREATE TABLE IF NOT EXISTS public.lead_interactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE RESTRICT: ver o bloco "DESTRUIÇÃO DE HISTÓRICO" no fim do arquivo.
  lead_id             uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,

  -- Dois tempos, e a diferença entre eles é uma métrica de saúde do sistema.
  -- Uma coluna só faria toda métrica de tempo mentir quando alguém registrasse
  -- às 19h uma ligação das 9h.
  occurred_at         timestamptz NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),

  direction           text NOT NULL,
  kind                text NOT NULL,

  channel_account_id  uuid REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,

  actor               text NOT NULL,
  outcome             text,
  observacao          text,

  source              text NOT NULL DEFAULT 'manual',
  external_id         text,

  -- Decisão 1 do pré-mortem. Ver o bloco "IDEMPOTÊNCIA" no fim do arquivo.
  client_request_id   uuid,

  -- Decisão 2 do pré-mortem. Anulação em vez de DELETE.
  voided_at           timestamptz,
  voided_by           text,
  void_reason         text,

  CONSTRAINT lead_interactions_direction_check
    CHECK (direction IN ('saida', 'entrada', 'interno')),
  CONSTRAINT lead_interactions_kind_check
    CHECK (kind IN ('mensagem', 'ligacao', 'nota')),
  CONSTRAINT lead_interactions_source_check
    CHECK (source IN ('manual', 'webhook', 'sistema', 'import')),
  CONSTRAINT lead_interactions_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('nao_atendeu', 'caixa_postal', 'numero_invalido', 'nao_existe')),

  -- Nota é sempre interna e interna é sempre nota. Fecha a porta para
  -- "nota de saída" e "mensagem interna", que não querem dizer nada.
  CONSTRAINT lead_interactions_nota_eh_interna
    CHECK ((direction = 'interno') = (kind = 'nota')),

  -- Comunicação sempre tem conta. É o que garante que "conversão por número"
  -- nunca tenha buraco.
  CONSTRAINT lead_interactions_comunicacao_tem_conta
    CHECK (direction = 'interno' OR channel_account_id IS NOT NULL),

  -- Desfecho só existe em ligação: "não atendeu" não quer dizer nada numa
  -- mensagem enviada.
  CONSTRAINT lead_interactions_outcome_so_em_ligacao
    CHECK (outcome IS NULL OR kind = 'ligacao'),

  -- Anulação sempre tem autor. Anular sem saber quem anulou destrói
  -- exatamente a auditoria que a anulação existe para preservar.
  CONSTRAINT lead_interactions_anulacao_tem_autor
    CHECK ((voided_at IS NULL) = (voided_by IS NULL))
);

-- ── Idempotência do webhook (ainda sem provedor, pronta desde já) ───────────
-- Acrescentar este índice DEPOIS exigiria primeiro limpar duplicados já
-- criados. Custa nada agora e torna o replay do provedor seguro por construção.
CREATE UNIQUE INDEX IF NOT EXISTS lead_interactions_external_unico
  ON public.lead_interactions (channel_account_id, external_id)
  WHERE external_id IS NOT NULL;

-- ── Idempotência da escrita manual (decisão 1) ─────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS lead_interactions_client_request_unico
  ON public.lead_interactions (client_request_id)
  WHERE client_request_id IS NOT NULL;

-- Índices parciais em `voided_at IS NULL` porque TODA consulta de fila,
-- timeline e métrica filtra anuladas. Um índice sem o mesmo recorte faria a
-- decisão 2 custar desempenho em vez de custar três colunas.
CREATE INDEX IF NOT EXISTS lead_interactions_por_lead
  ON public.lead_interactions (lead_id, occurred_at DESC)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS lead_interactions_por_data
  ON public.lead_interactions (occurred_at)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS lead_interactions_por_conta
  ON public.lead_interactions (channel_account_id, occurred_at);

CREATE INDEX IF NOT EXISTS lead_interactions_por_ator
  ON public.lead_interactions (actor, occurred_at);

ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;
-- Sem policy: só a service role. Estas linhas descrevem conversas com leads.

COMMENT ON TABLE public.lead_interactions IS
  'Um ATO de comunicação com o lead, ou uma nota comercial. NÃO é uma linha por mensagem: mensagens seguidas do mesmo ato contam como uma. Ciclo de vida (reunião, venda, MQL, SLA, abertura de card) NÃO entra aqui — pertence a quem já é dono dele, e duplicar produz contagem dupla.';
COMMENT ON COLUMN public.lead_interactions.occurred_at IS
  'Quando o ato ACONTECEU. Toda métrica de tempo usa esta coluna.';
COMMENT ON COLUMN public.lead_interactions.recorded_at IS
  'Quando foi REGISTRADO. A diferença para occurred_at é métrica de saúde: se a mediana subir, o registro saiu do fluxo de trabalho.';
COMMENT ON COLUMN public.lead_interactions.kind IS
  'O MEIO: mensagem | ligacao | nota. "tentativa" não é kind — é a leitura de uma saída sem entrada posterior.';
COMMENT ON COLUMN public.lead_interactions.direction IS
  'saida (nós falamos) | entrada (o lead falou) | interno (nota, sem canal).';
COMMENT ON COLUMN public.lead_interactions.actor IS
  'Quem executou o ato. DIFERENTE do dono do lead (esse é derivado de responsaveisDoLead + sdr_override). SEM CHECK de propósito: validado na aplicação, para que contratar alguém não exija migration.';
COMMENT ON COLUMN public.lead_interactions.observacao IS
  'Nota comercial curta. NÃO é conteúdo de mensagem: a V1 registra o ato, não a conversa (decisão de privacidade nível A). Se um dia guardarmos texto de conversa, ele vai para uma tabela própria, não para cá.';
COMMENT ON COLUMN public.lead_interactions.source IS
  'manual (painel) | webhook (provedor) | sistema | import. Permite comparar e não somar duas fontes durante a transição para captura automática.';
COMMENT ON COLUMN public.lead_interactions.client_request_id IS
  'Idempotência da escrita manual. O front gera UM uuid por AÇÃO DO USUÁRIO (não por requisição) e reenvia o mesmo em cada retry; fetchAdminData repete a escrita até 6x em 502/503/504 e erro de rede. Identidade da REQUISIÇÃO, nunca semelhança de conteúdo — duas ligações reais iguais podem acontecer.';
COMMENT ON COLUMN public.lead_interactions.external_id IS
  'Id da mensagem no provedor. NULO na V1. Torna o replay do webhook seguro sem mudar schema.';
COMMENT ON COLUMN public.lead_interactions.voided_at IS
  'Anulação. A linha continua existindo para auditoria e é IGNORADA por fila, timeline e métricas. Corrigir clique errado nunca apaga: apagar torna "por que o sistema diz que este lead foi contatado?" irrespondível.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. lead_tasks — a intenção futura
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Interação, tarefa e estado são três coisas diferentes que costumam virar a
-- mesma coluna:
--   INTERAÇÃO  fato passado, imutável, datado      → lead_interactions
--   TAREFA     intenção futura, com dono e prazo   → esta tabela
--   ESTADO     leitura dos dois, agora             → view, nunca coluna

CREATE TABLE IF NOT EXISTS public.lead_tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,

  due_at              timestamptz NOT NULL,
  owner               text NOT NULL,
  note                text,
  status              text NOT NULL DEFAULT 'aberta',

  done_at             timestamptz,
  done_by             text,
  -- SET NULL, e não RESTRICT: a interação que cumpriu a tarefa pode ser
  -- anulada; a tarefa continua cumprida, só perde o ponteiro.
  done_interaction_id uuid REFERENCES public.lead_interactions(id) ON DELETE SET NULL,
  cancel_reason       text,

  client_request_id   uuid,

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text NOT NULL,

  CONSTRAINT lead_tasks_status_check
    CHECK (status IN ('aberta', 'concluida', 'cancelada')),
  CONSTRAINT lead_tasks_conclusao_coerente
    CHECK ((status = 'concluida') = (done_at IS NOT NULL))
);

-- ── A constraint que impede isto de virar um gerenciador de tarefas ────────
-- Um lead tem no máximo UMA próxima ação. É a definição de "próxima". Sem
-- isto, em três semanas existem sub-tarefas por lead, campo de prioridade, e um
-- app de to-do dentro do CRM. Relaxar depois é remover um índice; apertar
-- depois é migrar dados sujos.
CREATE UNIQUE INDEX IF NOT EXISTS lead_tasks_uma_aberta_por_lead
  ON public.lead_tasks (lead_id) WHERE status = 'aberta';

-- É este índice que faz os baldes "vencido" e "de hoje" serem instantâneos.
CREATE INDEX IF NOT EXISTS lead_tasks_abertas_por_prazo
  ON public.lead_tasks (due_at) WHERE status = 'aberta';

CREATE UNIQUE INDEX IF NOT EXISTS lead_tasks_client_request_unico
  ON public.lead_tasks (client_request_id)
  WHERE client_request_id IS NOT NULL;

ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lead_tasks IS
  'A PRÓXIMA AÇÃO de um lead — intenção futura, com dono e prazo. No máximo uma aberta por lead, por definição de "próxima".';
COMMENT ON COLUMN public.lead_tasks.status IS
  'aberta | concluida | cancelada. Cancelada existe em vez de DELETE porque "foi planejado e abandonado" é sinal, e apagar perderia esse sinal.';
COMMENT ON COLUMN public.lead_tasks.done_interaction_id IS
  'A interação que cumpriu a tarefa. É o que faz tarefa e interação virarem UMA linha na timeline; sem isso todo follow-up apareceria duas vezes e a contagem de tentativas ficaria errada.';
COMMENT ON COLUMN public.lead_tasks.owner IS
  'SEM CHECK de propósito — validado na aplicação. Ver lead_interactions.actor.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. leads — a perda anterior à reunião
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Regra de ouro: A PERDA MORA ONDE ESTÁ O FATO MAIS RICO.
--   houve reunião realizada  → `meetings.motivo_categoria` (JÁ EXISTE, não duplicar)
--   não houve                → estas três colunas
--
-- Desqualificação e desistência NÃO ganham campos separados: são dois valores
-- da mesma lista. Separá-los criaria duas colunas que respondem a mesma
-- pergunta e que um dia vão discordar.
--
-- A perda é a ÚNICA entrada humana de estado. Todo o resto é derivado, porque
-- ausência de atividade não é desistência — um lead parado há 20 dias pode ser
-- esquecimento, e esquecimento é justamente o que a fila existe para expor.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS perdido_at   timestamptz,
  ADD COLUMN IF NOT EXISTS perda_motivo text,
  ADD COLUMN IF NOT EXISTS perda_por    text;

-- Reaproveita o vocabulário de `meetings.motivo_categoria` onde faz sentido,
-- para permitir agregação conjunta. Fora da lista de propósito: fechou,
-- reembolso, decisor, preco, nao_percebeu_valor — todos exigem uma conversa que
-- só acontece na call.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_perda_motivo_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_perda_motivo_check
  CHECK (perda_motivo IS NULL OR perda_motivo IN (
    'sem_resposta',    -- nunca respondeu (só existe antes da reunião)
    'sumiu',           -- respondeu e parou
    'desqualificado',  -- não é o cliente que a Champion atende
    'sem_verba',
    'timing',
    'concorrente',
    'numero_invalido',
    'duplicado',
    'outro'
  ));

-- Perda tem data e motivo juntos, ou nenhum dos dois. Uma data sem motivo é
-- um lead perdido que não ensina nada.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_perda_coerente;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_perda_coerente
  CHECK ((perdido_at IS NULL) = (perda_motivo IS NULL));

CREATE INDEX IF NOT EXISTS leads_perdidos
  ON public.leads (perdido_at) WHERE perdido_at IS NOT NULL;

COMMENT ON COLUMN public.leads.perdido_at IS
  'Lead dado por perdido ANTES de existir reunião realizada. Se houve reunião realizada, a perda pertence a meetings.motivo_categoria — a rota recusa preencher esta coluna nesse caso (Etapa 2). Um lead nunca tem dois motivos de perda.';
COMMENT ON COLUMN public.leads.perda_motivo IS
  'Motivo da perda pré-reunião. Vocabulário compartilhado com meetings.motivo_categoria onde faz sentido, para agregação conjunta.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. lead_crm_state — o estado, que é LIDO e não escrito
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sete estados por prioridade (o primeiro que casar vence) e oito flags. Um
-- lead tem UM estado e VÁRIAS flags ao mesmo tempo.
--
-- Estado não vira coluna. É por isso que corrigir a regra de "quem precisa de
-- ação" — e ela vai estar errada — custa reescrever esta view, não migrar
-- dados. Quem quiser acelerar, materialize ESTA view; nunca crie uma coluna de
-- estado em `leads`, que é o que `kommo_status` virou.
--
-- Repare no que NÃO está aqui: o DONO do lead. A regra de roteamento vive em
-- `_shared/roteamento.ts` e é a mesma que o SLA usa. Reescrevê-la em SQL criaria
-- uma segunda fonte de verdade — exatamente o que o desenho proíbe. O backend
-- resolve o dono com a função que já existe.
--
-- VIEW, não MATERIALIZED VIEW: com 2.244 leads o Postgres resolve sem esforço,
-- e materializar exigiria decidir quando atualizar. Virar materializada é troca
-- de uma linha, sem mudar quem consome.

CREATE OR REPLACE VIEW public.lead_crm_state AS
SELECT
  l.id AS lead_id,

  -- ── Estado, por prioridade ───────────────────────────────────────────────
  CASE
    WHEN v.tem_venda                          THEN 'GANHO'
    WHEN l.perdido_at IS NOT NULL
      OR (m.tem_desfecho_ruim AND NOT m.tem_agendada)
                                              THEN 'PERDIDO'
    WHEN m.tem_agendada                       THEN 'AGENDADO'
    WHEN m.tem_realizada                      THEN 'REUNIAO_FEITA'
    WHEN i.primeira_entrada_at IS NOT NULL    THEN 'RESPONDEU'
    WHEN i.primeira_saida_at IS NOT NULL      THEN 'EM_CONTATO'
    ELSE 'NOVO'
  END AS estado,

  -- ── Flags — operacionais, nunca estados ──────────────────────────────────
  -- Um lead que respondeu e está esperando é o mais caro de perder: o trabalho
  -- de fazer a pessoa responder já foi pago.
  (i.ultima_direcao = 'entrada')                        AS esperando_resposta_nossa,
  (i.ultima_direcao = 'saida' AND t.proxima_acao_at > now()) AS aguardando_lead,
  (t.tem_aberta AND t.proxima_acao_at < now())          AS followup_vencido,
  (t.tem_aberta AND (t.proxima_acao_at AT TIME ZONE 'America/Sao_Paulo')::date
                  = (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS followup_hoje,
  -- O vazamento: contatado, sem resposta pendente nossa, sem próxima ação e sem
  -- desfecho. Hoje é 100% invisível.
  (i.primeira_saida_at IS NOT NULL
     AND NOT t.tem_aberta
     AND l.perdido_at IS NULL
     AND NOT m.tem_agendada
     AND NOT m.tem_realizada
     AND NOT v.tem_venda)                               AS sem_proxima_acao,
  m.tem_no_show                                         AS teve_no_show,
  m.tem_desfecho_pendente                               AS desfecho_pendente,
  (l.sla_breached_at IS NOT NULL)                       AS sla_estourado,

  -- ── Derivados que a fila e as métricas leem ──────────────────────────────
  i.primeira_saida_at,
  i.primeira_entrada_at,
  i.ultima_interacao_at,
  i.ultima_direcao,
  i.tentativas,
  t.proxima_acao_at,
  t.proxima_acao_owner

FROM public.leads l

-- LATERAL, e não CTE agregada: com `WHERE lead_id = ...` o Postgres empurra o
-- filtro para dentro e usa o índice por lead. Uma CTE materializaria a base
-- inteira antes de filtrar.
LEFT JOIN LATERAL (
  SELECT
    min(x.occurred_at) FILTER (WHERE x.direction = 'saida')   AS primeira_saida_at,
    min(x.occurred_at) FILTER (WHERE x.direction = 'entrada') AS primeira_entrada_at,
    max(x.occurred_at) FILTER (WHERE x.direction <> 'interno') AS ultima_interacao_at,
    count(*) FILTER (WHERE x.direction = 'saida')             AS tentativas,
    (
      -- A direção da última comunicação. Notas não contam: elas não mudam de
      -- quem é a vez de falar.
      SELECT y.direction FROM public.lead_interactions y
      WHERE y.lead_id = l.id AND y.voided_at IS NULL AND y.direction <> 'interno'
      ORDER BY y.occurred_at DESC, y.recorded_at DESC
      LIMIT 1
    ) AS ultima_direcao
  FROM public.lead_interactions x
  WHERE x.lead_id = l.id AND x.voided_at IS NULL
) i ON true

LEFT JOIN LATERAL (
  SELECT
    bool_or(q.status = 'agendada')  AS tem_agendada,
    bool_or(q.status = 'realizada') AS tem_realizada,
    bool_or(q.status = 'no_show')   AS tem_no_show,
    bool_or(q.status = 'realizada' AND q.motivo_categoria IS NULL) AS tem_desfecho_pendente,
    bool_or(q.motivo_categoria IS NOT NULL AND q.motivo_categoria <> 'fechou') AS tem_desfecho_ruim
  FROM public.meetings q
  WHERE q.lead_id = l.id
) m ON true

LEFT JOIN LATERAL (
  SELECT
    count(*) > 0        AS tem_aberta,
    min(k.due_at)       AS proxima_acao_at,
    min(k.owner)        AS proxima_acao_owner
  FROM public.lead_tasks k
  WHERE k.lead_id = l.id AND k.status = 'aberta'
) t ON true

LEFT JOIN LATERAL (
  SELECT count(*) > 0 AS tem_venda
  FROM public.manual_sales s
  WHERE s.lead_id = l.id
) v ON true;

COMMENT ON VIEW public.lead_crm_state IS
  'Estado comercial DERIVADO de leads + lead_interactions + lead_tasks + meetings + manual_sales. Sete estados por prioridade e oito flags. NUNCA criar coluna de estado em leads para "acelerar": duas fontes de verdade sobre o mesmo fato é o que kommo_status virou. Se precisar de cache, materialize esta view. O DONO do lead não está aqui de propósito — a regra vive em _shared/roteamento.ts e não pode ter uma segunda cópia em SQL.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Seed das contas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cinco linhas. A quinta (Telefone) existe porque toda interação de
-- comunicação aponta para uma conta, e uma ligação também é comunicação.
--
-- `identifier` fica NULO de propósito: os números reais não estão no
-- repositório, e os que aparecem no front são de código morto (blocos de
-- "pule a fila" removidos das páginas de obrigado). Preencher é um UPDATE,
-- não uma migration.
--
-- `is_default` no Champion 1 é PROVISÓRIO — depende de qual conta o Miguel
-- realmente usa como padrão.

INSERT INTO public.channel_accounts (kind, label, owner, is_personal, is_default, sort_order)
VALUES
  ('whatsapp',  'WhatsApp Champion 1', NULL,     false, true,  1),
  ('whatsapp',  'WhatsApp Champion 2', NULL,     false, false, 2),
  ('whatsapp',  'WhatsApp Miguel',     'Miguel', true,  false, 3),
  ('instagram', 'Instagram Champion',  NULL,     false, false, 4),
  ('telefone',  'Telefone',            NULL,     false, false, 5)
ON CONFLICT (label) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- NOTAS PARA A ETAPA 2 (backend) — nada disto é implementado aqui
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── IDEMPOTÊNCIA: como a rota deve tratar o conflito ───────────────────────
-- `fetchAdminData` repete a escrita até 6 vezes em 502/503/504 e em erro de
-- rede (AdminAnalytics.tsx:1235-1290) e NÃO distingue leitura de escrita —
-- escrita vai por `?_method=POST` pelo mesmo caminho. Uma escrita que chega,
-- executa e depois estoura no gateway É REPETIDA.
--
-- A rota deve fazer INSERT ... ON CONFLICT (client_request_id) DO NOTHING e,
-- quando nada for inserido, LER e DEVOLVER a linha existente com **200**.
-- Nunca 409: para o painel, repetir tem que ser indistinguível de acertar de
-- primeira, senão o retry vira erro na tela do vendedor.
--
-- A unicidade é da REQUISIÇÃO, nunca semelhança de conteúdo: duas ligações
-- reais idênticas em segundos podem acontecer e as duas são verdadeiras.
--
-- ── DESTRUIÇÃO DE HISTÓRICO: por que RESTRICT, e o que falta na rota ───────
-- DIVERGÊNCIA CONSCIENTE do documento congelado, que previa ON DELETE CASCADE
-- com a guarda apenas na rota. Motivos:
--   1. `DELETE /leads` já existe e é usado, inclusive em LOTE (admin-data:1564).
--      CASCADE + exclusão em lote é um caminho acidental óbvio para apagar
--      histórico comercial sem ninguém conferir.
--   2. As FKs existentes para `leads(id)` (meetings, manual_sales) usam
--      ON DELETE SET NULL — CASCADE seria a única exceção destrutiva do schema.
--   3. Para apagar mesmo (LGPD), o passo duplo explícito é uma vantagem numa
--      ação irreversível, não um obstáculo.
-- Reverter para o documento é uma linha:
--   ALTER TABLE public.lead_interactions
--     DROP CONSTRAINT lead_interactions_lead_id_fkey,
--     ADD CONSTRAINT lead_interactions_lead_id_fkey
--       FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
--
-- A guarda de rota da Etapa 2 CONTINUA necessária: hoje o RESTRICT devolveria
-- um erro cru de FK (500). A rota deve contar interações e tarefas do lead
-- antes de apagar e, havendo qualquer uma, recusar com 422 dizendo que o
-- caminho é marcar como perdido (ou `duplicado`), não apagar. Vale para a
-- exclusão individual E para a em lote.
--
-- ── PERDA: a regra que o banco não consegue expressar ──────────────────────
-- A rota deve RECUSAR preencher `leads.perdido_at` quando existir reunião com
-- status='realizada' para aquele lead, respondendo que o desfecho vai em
-- `meetings.motivo_categoria`. É validação de rota porque um CHECK não enxerga
-- outra tabela, e um trigger para isto seria mais caro de entender do que de
-- escrever.
--
-- ── VALIDAÇÃO DE PESSOAS ───────────────────────────────────────────────────
-- `actor`, `owner`, `created_by`, `done_by`, `voided_by` são NOT NULL onde
-- fazem sentido, mas SEM CHECK de lista. A rota valida contra PESSOAS de
-- `_shared/roteamento.ts` e recusa com 422 valor ausente ou desconhecido —
-- sem o fallback `|| "Painel"` que hoje suja `contacted_by`.
