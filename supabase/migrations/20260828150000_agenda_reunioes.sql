-- Agendar reunião no painel passa a criar o evento no Google Calendar.
--
-- Hoje o painel só oferece um LINK para a agenda do closer: o SDR registra a
-- reunião aqui e vai marcar de novo, na mão, do outro lado. Duas fontes de
-- verdade para a mesma call — e a data da call nem existia nesta tabela.
--
-- Mesmo modelo já em produção no Champion Hub: UMA conta Google conectada é a
-- organizadora de todos os eventos, e quem precisa ver a call (Rodger, Miguel,
-- Caio) entra como convidado. Ninguém precisa conectar a própria conta, e o
-- evento aparece na agenda de todo mundo.

CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'google_calendar',
  status TEXT NOT NULL DEFAULT 'disconnected',   -- connected | disconnected | error
  connected_email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  -- Em qual agenda o evento é criado ('primary' = agenda principal da conta
  -- conectada) e quem entra como convidado em toda reunião.
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  attendee_emails TEXT[] NOT NULL DEFAULT '{}',
  -- Convidar o próprio lead pelo e-mail do quiz. Fica desligado por padrão:
  -- ligar isso faz o Google mandar convite para o cliente, e essa é uma decisão
  -- comercial, não técnica.
  invite_lead BOOLEAN NOT NULL DEFAULT FALSE,
  default_duration_minutes INTEGER NOT NULL DEFAULT 45,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_integrations_provider_unique UNIQUE (provider)
);

-- Liga cada reunião ao evento correspondente no Google. Sem isso, remarcar uma
-- call criaria um evento novo em vez de mover o que já existe.
CREATE TABLE IF NOT EXISTS public.meeting_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google_calendar',
  external_event_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  html_link TEXT,
  meet_link TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status TEXT NOT NULL DEFAULT 'ok',        -- ok | error | pending
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meeting_calendar_events_meeting_provider_unique UNIQUE (meeting_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_meeting_calendar_events_meeting
  ON public.meeting_calendar_events (meeting_id);

-- As duas tabelas são lidas e escritas só pelas edge functions, que usam service
-- role e passam por cima de RLS. RLS ligado e SEM policy é o que impede o anon
-- key do site público de chegar perto de um refresh token.
ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_calendar_integrations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calendar_integrations_updated_at ON public.calendar_integrations;
CREATE TRIGGER calendar_integrations_updated_at
  BEFORE UPDATE ON public.calendar_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_calendar_integrations_updated_at();

COMMENT ON TABLE public.calendar_integrations IS
  'Conta Google organizadora dos eventos de reunião. Uma linha só (provider único).';
COMMENT ON COLUMN public.calendar_integrations.attendee_emails IS
  'Quem é convidado em toda reunião criada pelo painel: Rodger, Miguel, Caio.';
