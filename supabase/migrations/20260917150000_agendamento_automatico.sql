-- Agendamento automático da call de diagnóstico (17/09/2026).
--
-- Lead com faturamento declarado >= R$ 100 mil sai do formulário para /agendar,
-- escolhe um horário livre do Caio e a reunião nasce aqui, sem SDR no meio.
-- Quem decide o que é "livre" é a edge function `agendamento`; esta migration dá
-- a ela três coisas:
--
--   1. `agendamento_config`  a grade em TABELA (dias, horários, duração,
--      espaçamento, antecedência, horizonte, agendas do Google), para mudar sem
--      redeploy.
--   2. `meetings.agendado_por`  separa a reunião que o lead marcou sozinho da
--      que o SDR registrou no painel. NÃO usa `origem`: `origem` é o funil
--      (midia_paga · indicacao · social_selling) e entra no CAC.
--   3. `reservar_reuniao_auto()`  a reserva atômica: trava, rechecagem e insert
--      na mesma transação, para dois leads não levarem o mesmo horário.
--
-- Idempotente: pode rodar mais de uma vez.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Configuração
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agendamento_config (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  -- Desligado = /slots devolve lista vazia e o lead segue para /obrigadomql.
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  -- ISO: 1 = segunda … 7 = domingo.
  dias_semana SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  -- Horários de INÍCIO candidatos, "HH:MM", no fuso abaixo.
  horarios_inicio TEXT[] NOT NULL DEFAULT '{10:00,11:00,13:00,14:00,15:00,18:00,19:00,19:30}',
  duracao_minutos INTEGER NOT NULL DEFAULT 45,
  -- Distância mínima entre o INÍCIO de duas calls, para frente e para trás.
  espacamento_minutos INTEGER NOT NULL DEFAULT 120,
  antecedencia_minima_minutos INTEGER NOT NULL DEFAULT 120,
  horizonte_dias INTEGER NOT NULL DEFAULT 7,
  fuso TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  -- Gravado em meetings.closer.
  closer TEXT NOT NULL DEFAULT 'Caio',
  -- Agendas consultadas no freeBusy do Google. 'primary' = a conta organizadora
  -- conectada em calendar_integrations; o e-mail do Caio só responde se ele
  -- compartilhar a agenda (livre/ocupado) com essa conta.
  agendas_ocupacao TEXT[] NOT NULL DEFAULT '{primary,caio6328@gmail.com}',
  -- Proteção básica contra abuso: só lead criado há menos disso pode agendar.
  lead_validade_horas INTEGER NOT NULL DEFAULT 24,
  -- Neste fluxo o lead é convidado e o evento ganha Google Meet, mesmo com
  -- calendar_integrations.invite_lead = false (que continua valendo para o painel).
  convidar_lead BOOLEAN NOT NULL DEFAULT TRUE,
  criar_meet BOOLEAN NOT NULL DEFAULT TRUE,
  -- Última falha do Google na consulta de ocupação. O lead nunca trava por ela:
  -- a função cai para só a regra de espaçamento e grava o motivo aqui.
  ultimo_erro_google TEXT,
  ultimo_erro_google_em TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agendamento_config_linha_unica CHECK (id = 1),
  CONSTRAINT agendamento_config_duracao_check CHECK (duracao_minutos >= 15),
  CONSTRAINT agendamento_config_espacamento_check CHECK (espacamento_minutos >= 0),
  CONSTRAINT agendamento_config_horizonte_check CHECK (horizonte_dias BETWEEN 1 AND 60)
);

INSERT INTO public.agendamento_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Só as edge functions (service role) leem e escrevem. RLS ligado sem policy.
ALTER TABLE public.agendamento_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_agendamento_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agendamento_config_updated_at ON public.agendamento_config;
CREATE TRIGGER agendamento_config_updated_at
  BEFORE UPDATE ON public.agendamento_config
  FOR EACH ROW EXECUTE FUNCTION public.set_agendamento_config_updated_at();

COMMENT ON TABLE public.agendamento_config IS
  'Grade do agendamento automático da call de diagnóstico (lead >= R$ 100 mil). Uma linha só (id = 1). Lida pela edge function agendamento.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Quem marcou a reunião
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS agendado_por TEXT NOT NULL DEFAULT 'painel';

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_agendado_por_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_agendado_por_check
  CHECK (agendado_por IN ('painel', 'auto'));

COMMENT ON COLUMN public.meetings.agendado_por IS
  'painel = registrada pelo time; auto = o próprio lead escolheu o horário em /agendar. Reunião auto convida o lead e tem Google Meet no evento.';

-- Um lead não pode ter duas reuniões automáticas em pé ao mesmo tempo. A função
-- já checa; o índice é a rede de baixo se duas abas reservarem no mesmo instante.
CREATE UNIQUE INDEX IF NOT EXISTS uq_meetings_auto_lead_agendada
  ON public.meetings (lead_id)
  WHERE agendado_por = 'auto' AND status = 'agendada' AND lead_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Reserva atômica
--
-- O advisory lock serializa as reservas automáticas entre si: a segunda espera
-- a primeira gravar e então enxerga a reunião dela na rechecagem. O espaçamento
-- vem da tabela, nunca de parâmetro, para o cliente não conseguir encolher.
--
-- Não serializa com o POST /meetings do painel (que checa e grava fora de
-- transação); esse cruzamento exige alguém registrando a mão no mesmo segundo.
--
-- Erros viram mensagens estáveis que a função traduz:
--   lead_ja_agendado · slot_ocupado
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reservar_reuniao_auto(
  p_lead_id UUID,
  p_inicio TIMESTAMPTZ,
  p_closer TEXT,
  p_lead_nome TEXT,
  p_notes TEXT,
  p_utm_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_espacamento INTEGER;
  v_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('agendamento_automatico'));

  SELECT COALESCE(espacamento_minutos, 120) INTO v_espacamento
  FROM public.agendamento_config WHERE id = 1;
  v_espacamento := COALESCE(v_espacamento, 120);

  IF EXISTS (
    SELECT 1 FROM public.meetings
    WHERE lead_id = p_lead_id
      AND status = 'agendada'
      AND (scheduled_at IS NULL OR scheduled_at > NOW())
  ) THEN
    RAISE EXCEPTION 'lead_ja_agendado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.meetings
    WHERE status IN ('agendada', 'realizada')
      AND scheduled_at IS NOT NULL
      AND scheduled_at > p_inicio - make_interval(mins => v_espacamento)
      AND scheduled_at < p_inicio + make_interval(mins => v_espacamento)
  ) THEN
    RAISE EXCEPTION 'slot_ocupado';
  END IF;

  INSERT INTO public.meetings (
    lead_id, lead_nome, notes, utm_content, origem, closer, status, scheduled_at, agendado_por
  ) VALUES (
    p_lead_id, p_lead_nome, p_notes, p_utm_content, 'midia_paga', p_closer, 'agendada', p_inicio, 'auto'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_reuniao_auto(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_reuniao_auto(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_reuniao_auto(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.reservar_reuniao_auto(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) IS
  'Reserva atômica do agendamento automático: lock + rechecagem (lead sem reunião futura, nenhuma call agendada/realizada a menos de espacamento_minutos) + insert em meetings com agendado_por = auto.';
