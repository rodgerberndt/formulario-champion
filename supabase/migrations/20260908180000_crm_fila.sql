-- CRM V1 — a fila comercial (Etapa 4).
--
-- Duas mudanças, as duas em VIEW. Nenhuma tabela é alterada, nenhum dado é
-- escrito, nada é materializado.
--
--   1. `lead_crm_state` ganha `ultimo_no_show_at` — sem ele não há como ordenar
--      o balde de recuperação por "mais antigo sem recuperação primeiro", e
--      inventar uma ordem seria pior que não ter o balde.
--   2. Nasce `lead_fila`, que classifica cada lead em UM balde, com precedência
--      explícita e a chave de ordenação já resolvida.
--
-- ── Por que a classificação mora em SQL e não no TypeScript ─────────────────
-- Se o balde fosse decidido na edge function, a regra existiria em dois lugares
-- assim que alguém precisasse contar os baldes sem carregar as linhas — e duas
-- cópias de uma regra é como se descobre, meses depois, que a contagem e a
-- lista discordam. Aqui a contagem é `GROUP BY bucket` sobre a mesma view que
-- devolve os cards.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. lead_crm_state — mais um derivado, nenhum estado novo
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.lead_crm_state
WITH (security_invoker = on) AS
SELECT
  b.lead_id,
  b.estado,
  b.esperando_resposta_nossa,
  b.aguardando_lead,
  b.followup_vencido,
  b.followup_hoje,
  (b.estado IN ('EM_CONTATO', 'RESPONDEU') AND NOT b.tem_aberta) AS sem_proxima_acao,
  b.teve_no_show,
  b.desfecho_pendente,
  b.sla_estourado,
  b.primeira_saida_at,
  b.primeira_entrada_at,
  b.ultima_interacao_at,
  b.ultima_direcao,
  b.tentativas,
  b.proxima_acao_at,
  b.proxima_acao_owner,
  -- Acrescentada no fim de propósito: CREATE OR REPLACE VIEW só permite
  -- APENDAR coluna, nunca inserir no meio. Trocar a ordem exigiria DROP, e
  -- derrubar a view por estética não se paga.
  b.ultimo_no_show_at
FROM (
  SELECT
    l.id AS lead_id,
    CASE
      WHEN v.tem_venda                          THEN 'GANHO'
      WHEN l.perdido_at IS NOT NULL
        OR (m.tem_desfecho_ruim AND NOT m.tem_agendada)
                                                THEN 'PERDIDO'
      WHEN m.tem_agendada                       THEN 'AGENDADO'
      WHEN m.tem_realizada                      THEN 'REUNIAO_FEITA'
      WHEN i.primeira_entrada_at IS NOT NULL    THEN 'RESPONDEU'
      WHEN i.primeira_saida_at IS NOT NULL
        OR m.tem_reuniao                        THEN 'EM_CONTATO'
      ELSE 'NOVO'
    END AS estado,
    (i.ultima_direcao = 'entrada')                             AS esperando_resposta_nossa,
    (i.ultima_direcao = 'saida' AND t.proxima_acao_at > now()) AS aguardando_lead,
    (t.tem_aberta AND t.proxima_acao_at < now())               AS followup_vencido,
    (t.tem_aberta AND (t.proxima_acao_at AT TIME ZONE 'America/Sao_Paulo')::date
                    = (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS followup_hoje,
    coalesce(t.tem_aberta, false)                              AS tem_aberta,
    m.tem_no_show                                              AS teve_no_show,
    m.ultimo_no_show_at,
    m.tem_desfecho_pendente                                    AS desfecho_pendente,
    (l.sla_breached_at IS NOT NULL)                            AS sla_estourado,
    i.primeira_saida_at,
    i.primeira_entrada_at,
    i.ultima_interacao_at,
    i.ultima_direcao,
    coalesce(i.tentativas, 0) AS tentativas,
    t.proxima_acao_at,
    t.proxima_acao_owner
  FROM public.leads l
  LEFT JOIN LATERAL (
    SELECT
      min(x.occurred_at) FILTER (WHERE x.direction = 'saida')    AS primeira_saida_at,
      min(x.occurred_at) FILTER (WHERE x.direction = 'entrada')  AS primeira_entrada_at,
      max(x.occurred_at) FILTER (WHERE x.direction <> 'interno') AS ultima_interacao_at,
      count(*) FILTER (WHERE x.direction = 'saida')              AS tentativas,
      (
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
      count(*) > 0                    AS tem_reuniao,
      bool_or(q.status = 'agendada')  AS tem_agendada,
      bool_or(q.status = 'realizada') AS tem_realizada,
      bool_or(q.status = 'no_show')   AS tem_no_show,
      -- Quando foi o no-show mais recente. `scheduled_at` é a hora da call e
      -- some em 27 das 32 reuniões antigas; `created_at` é quando alguém
      -- registrou. Usa a primeira que existir, nesta ordem, e nunca inventa.
      max(coalesce(q.scheduled_at, q.created_at)) FILTER (WHERE q.status = 'no_show') AS ultimo_no_show_at,
      bool_or(q.status = 'realizada' AND q.motivo_categoria IS NULL) AS tem_desfecho_pendente,
      bool_or(q.motivo_categoria IS NOT NULL AND q.motivo_categoria <> 'fechou') AS tem_desfecho_ruim
    FROM public.meetings q
    WHERE q.lead_id = l.id
  ) m ON true
  LEFT JOIN LATERAL (
    SELECT count(*) > 0 AS tem_aberta, min(k.due_at) AS proxima_acao_at, min(k.owner) AS proxima_acao_owner
    FROM public.lead_tasks k WHERE k.lead_id = l.id AND k.status = 'aberta'
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT count(*) > 0 AS tem_venda FROM public.manual_sales s WHERE s.lead_id = l.id
  ) v ON true
) b;

REVOKE ALL ON public.lead_crm_state FROM anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. lead_fila — quem precisa de ação AGORA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Não é pipeline: é fila de trabalho. Estado comercial diz ONDE o lead está;
-- balde diz O QUE fazer com ele agora. São coisas diferentes, e por isso o
-- balde não é coluna nem estado novo — é leitura.
--
-- ── PRECEDÊNCIA (o primeiro que casar vence; um lead sai em UM balde só) ────
--   0. Fora da fila:  GANHO · PERDIDO · AGENDADO
--   1. RESPONDEU      a última comunicação foi do lead: a bola está conosco
--   2. FOLLOWUP       tarefa aberta vencendo hoje ou já vencida
--   3. NO_SHOW        faltou à call, sem reunião nova e sem próxima ação
--   4. NUNCA          nunca trabalhado — e criado DEPOIS do marco do CRM
--   5. SEM_ACAO       já trabalhado, sem próxima ação definida
--   —  fora da fila:  quem tem tarefa aberta no futuro (está sendo cuidado)
--
-- ── O MARCO DO CRM, e por que ele existe ───────────────────────────────────
-- `NUNCA CONTATADO` é o único balde que se apoia na AUSÊNCIA de dado, e
-- ausência de interação em lead anterior ao CRM não prova nada — só prova que o
-- CRM não existia. Sem esta trava, os 2.208 leads históricos inundariam a fila
-- no primeiro dia e a tornariam inútil.
--
-- O marco é `min(channel_accounts.created_at)`: o instante em que a fundação do
-- CRM foi criada. É um fato do banco, não uma constante escrita à mão, e não
-- pode divergir da realidade.
--
-- Consequência medida em 08/09/2026: ZERO leads da base atual são posteriores
-- ao marco, então este balde nasce vazio e passa a encher a partir do próximo
-- lead que entrar. Vazio aqui significa "ainda não temos dado", não "não há
-- trabalho" — e é por isso que a rota devolve a cobertura junto.

CREATE OR REPLACE VIEW public.lead_fila
WITH (security_invoker = on) AS
WITH marco AS (SELECT min(created_at) AS em FROM public.channel_accounts)
SELECT
  l.id                    AS lead_id,
  l.nome_completo,
  l.whatsapp,
  l.instagram,
  l.investimento_faixa,
  l.tier,
  l.score,
  l.created_at,
  l.sdr_override,
  s.estado,
  s.tentativas,
  s.ultima_interacao_at,
  s.ultima_direcao,
  s.primeira_saida_at,
  s.proxima_acao_at,
  s.proxima_acao_owner,
  s.teve_no_show,
  s.ultimo_no_show_at,
  s.desfecho_pendente,
  s.sla_estourado,

  CASE
    WHEN s.estado IN ('GANHO', 'PERDIDO', 'AGENDADO')            THEN NULL
    WHEN s.esperando_resposta_nossa                               THEN 'RESPONDEU'
    -- Vence hoje ou ja venceu: due_at antes da meia-noite que vem, em Brasilia.
    -- Os parenteses nao sao estilo: `AT TIME ZONE` liga mais forte que `+`, e
    -- sem eles o Postgres tenta aplicar fuso a um intervalo.
    WHEN s.proxima_acao_at IS NOT NULL
     AND s.proxima_acao_at < ((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
                               + interval '1 day') AT TIME ZONE 'America/Sao_Paulo')
                                                                  THEN 'FOLLOWUP'
    WHEN s.teve_no_show AND s.proxima_acao_at IS NULL             THEN 'NO_SHOW'
    WHEN s.estado = 'NOVO' AND l.created_at >= (SELECT em FROM marco) THEN 'NUNCA'
    WHEN s.sem_proxima_acao                                       THEN 'SEM_ACAO'
    ELSE NULL
  END AS bucket,

  -- A chave de ordenação de cada balde, resolvida aqui para a rota não precisar
  -- de um ORDER BY diferente por balde. Em todos, MAIS ANTIGO PRIMEIRO.
  CASE
    WHEN s.esperando_resposta_nossa                               THEN s.ultima_interacao_at
    WHEN s.proxima_acao_at IS NOT NULL                            THEN s.proxima_acao_at
    WHEN s.teve_no_show AND s.proxima_acao_at IS NULL             THEN s.ultimo_no_show_at
    WHEN s.estado = 'NOVO'                                        THEN l.created_at
    ELSE coalesce(s.ultima_interacao_at, l.created_at)
  END AS ordenar_por

FROM public.leads l
JOIN public.lead_crm_state s ON s.lead_id = l.id;

REVOKE ALL ON public.lead_fila FROM anon, authenticated;

COMMENT ON VIEW public.lead_fila IS
  'Fila de trabalho comercial: classifica cada lead em UM balde (RESPONDEU > FOLLOWUP > NO_SHOW > NUNCA > SEM_ACAO), com precedência explícita e chave de ordenação pronta. bucket NULL = fora da fila (ganho, perdido, reunião agendada, ou tarefa aberta no futuro). O balde NUNCA só aceita leads criados após o marco do CRM (min(channel_accounts.created_at)), porque ausência de interação em lead histórico não prova ausência de trabalho — prova que o CRM não existia.';
