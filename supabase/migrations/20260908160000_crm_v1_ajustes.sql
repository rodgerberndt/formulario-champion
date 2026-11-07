-- CRM V1 — dois ajustes na fundação, antes da Etapa 2.
--
-- 1. NOVO deixa de significar "sem interação" e passa a significar "sem
--    nenhuma prova de que o lead já foi trabalhado".
-- 2. FECHA UM BURACO DE SEGURANÇA na view: view não tem RLS.
--
-- Nenhuma tabela é alterada. Nenhum dado é escrito.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SEGURANÇA — a view estava aberta para a chave anônima
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Achado ao verificar RLS a pedido do Rodger em 08/09/2026.
--
-- As três tabelas do CRM estão com RLS habilitado e ZERO policies, o que fecha
-- `anon` e `authenticated`. Mas `anon` e `authenticated` recebem GRANT total no
-- schema `public` por padrão do Supabase — e **VIEW não tem RLS**. Uma view
-- criada sem `security_invoker` roda com as permissões do DONO, então
-- `lead_crm_state` estava servindo o estado comercial dos 2.244 leads para a
-- chave anônima, que vai no bundle do site.
--
-- Não vazava nome nem telefone (a view só devolve ids, estado, flags e datas),
-- mas permitia enumerar os leads e ler a operação inteira sem autenticação.
--
-- Duas travas, de propósito, porque cada uma cobre a falha da outra:
--   · security_invoker faz a view respeitar o RLS de quem consulta;
--   · o REVOKE tira o acesso mesmo que alguém crie uma policy no futuro.

REVOKE ALL ON public.lead_crm_state    FROM anon, authenticated;
REVOKE ALL ON public.channel_accounts  FROM anon, authenticated;
REVOKE ALL ON public.lead_interactions FROM anon, authenticated;
REVOKE ALL ON public.lead_tasks        FROM anon, authenticated;

-- Nas tabelas o RLS já bloqueava; o REVOKE é defesa em profundidade, para que
-- a segurança não dependa de o RLS continuar configurado certo para sempre.


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. NOVO — o que significa "nunca trabalhado"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A primeira versão definia NOVO como "sem interação". Isso classificou como
-- NOVO 6 leads que têm reunião com no-show e nenhuma interação registrada —
-- gente que foi trabalhada a ponto de marcar uma call, e que a fila mostraria
-- no balde "nunca contatado".
--
-- Regra nova: NOVO exige AUSÊNCIA DE PROVA de trabalho — nenhuma interação E
-- nenhuma reunião. Qualquer reunião, em qualquer situação, prova contato.
--
-- No-show continua sendo FLAG, não estado: o lead volta para EM_CONTATO e
-- carrega `teve_no_show`. Nenhum estado novo é criado.
--
-- Efeito colateral conferido antes de aplicar: reuniões `agendada` e
-- `realizada` já são capturadas ANTES, por AGENDADO / REUNIAO_FEITA / GANHO /
-- PERDIDO. A única situação que chegava ao fim da cascata era `no_show`. Logo,
-- a mudança move exatamente os leads cujas reuniões são todas no-show e que não
-- têm interação — e não toca em mais nenhum estado.
--
-- `sem_proxima_acao` passa a se ancorar no ESTADO, e não em `primeira_saida_at`.
-- É o que o documento congelado sempre disse ("estado ∈ {EM_CONTATO,
-- RESPONDEU}, sem tarefa aberta, sem perda"); a primeira versão implementou
-- diferente. Como consequência, esses 6 leads passam a aparecer no balde
-- "sem próxima ação" — que é exatamente onde deviam estar.

CREATE OR REPLACE VIEW public.lead_crm_state
WITH (security_invoker = on) AS
SELECT
  b.lead_id,
  b.estado,

  -- ── Flags — operacionais, nunca estados ──────────────────────────────────
  b.esperando_resposta_nossa,
  b.aguardando_lead,
  b.followup_vencido,
  b.followup_hoje,
  (b.estado IN ('EM_CONTATO', 'RESPONDEU') AND NOT b.tem_aberta) AS sem_proxima_acao,
  b.teve_no_show,
  b.desfecho_pendente,
  b.sla_estourado,

  -- ── Derivados que a fila e as métricas leem ──────────────────────────────
  b.primeira_saida_at,
  b.primeira_entrada_at,
  b.ultima_interacao_at,
  b.ultima_direcao,
  b.tentativas,
  b.proxima_acao_at,
  b.proxima_acao_owner
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
      -- Interação de saída OU qualquer reunião: as duas provam que o lead foi
      -- trabalhado. É esta linha que corrige a borda do no-show.
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
      bool_or(q.status = 'realizada' AND q.motivo_categoria IS NULL) AS tem_desfecho_pendente,
      bool_or(q.motivo_categoria IS NOT NULL AND q.motivo_categoria <> 'fechou') AS tem_desfecho_ruim
    FROM public.meetings q
    WHERE q.lead_id = l.id
  ) m ON true

  LEFT JOIN LATERAL (
    SELECT
      count(*) > 0  AS tem_aberta,
      min(k.due_at) AS proxima_acao_at,
      min(k.owner)  AS proxima_acao_owner
    FROM public.lead_tasks k
    WHERE k.lead_id = l.id AND k.status = 'aberta'
  ) t ON true

  LEFT JOIN LATERAL (
    SELECT count(*) > 0 AS tem_venda
    FROM public.manual_sales s
    WHERE s.lead_id = l.id
  ) v ON true
) b;

REVOKE ALL ON public.lead_crm_state FROM anon, authenticated;

COMMENT ON VIEW public.lead_crm_state IS
  'Estado comercial DERIVADO de leads + lead_interactions + lead_tasks + meetings + manual_sales. Sete estados por prioridade e oito flags. NOVO = nenhuma prova de trabalho (sem interação E sem reunião); no-show é FLAG e devolve o lead para EM_CONTATO. security_invoker=on + REVOKE de anon/authenticated: view não tem RLS própria, e sem isso a chave anônima leria a operação inteira. NUNCA criar coluna de estado em leads. O DONO do lead não está aqui de propósito — a regra vive em _shared/roteamento.ts.';
