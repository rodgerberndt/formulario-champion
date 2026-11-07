-- Reunião tinha DOIS estados onde o negócio tem três.
--
-- `meetings.attended` é booleano desde abril: ou a pessoa compareceu, ou não.
-- Só que o registro nasce no instante em que o SDR AGENDA, dias antes da call
-- acontecer — e nasce com `attended = false`. Resultado: toda reunião marcada
-- para o futuro entra na conta como no-show.
--
-- Em 28/08/2026 isso valia 6 das 10 reuniões "não realizadas" de agosto: todas
-- criadas nos últimos 7 dias, duas no próprio dia. O comparecimento do mês
-- estava medido em 58%, e é esse número que sustenta a meta de setembro.
--
-- Passa a ter três: agendada · realizada · no_show. E ganha `scheduled_at`, a
-- data em que a call de fato acontece — `created_at` sempre foi a data do
-- agendamento, nunca a da reunião, e por isso não havia como saber se uma call
-- já tinha passado.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'agendada',
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_status_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_status_check
  CHECK (status IN ('agendada', 'realizada', 'no_show'));

COMMENT ON COLUMN public.meetings.status IS
  'agendada = ainda vai acontecer (fora do denominador do comparecimento) · realizada = a pessoa apareceu · no_show = a pessoa faltou.';
COMMENT ON COLUMN public.meetings.scheduled_at IS
  'Data e hora da call. Diferente de created_at, que é quando o SDR registrou o agendamento.';

-- Backfill. `attended = true` é resultado registrado à mão, vale como verdade.
-- Para as `false`, a única evidência disponível é a idade do registro: reunião
-- agendada há mais de 7 dias e ainda não marcada como realizada é no-show de
-- fato; as recentes ainda podem acontecer e voltam a ser 'agendada'.
UPDATE public.meetings
SET status = CASE
  WHEN attended THEN 'realizada'
  WHEN created_at < NOW() - INTERVAL '7 days' THEN 'no_show'
  ELSE 'agendada'
END;

-- `attended` continua existindo e continua correto. Há código lendo e escrevendo
-- nele (o assistente de IA, entre outros), e uma coluna que some é um bug em
-- produção; uma que mente é pior ainda. O gatilho mantém os dois lados iguais,
-- venha a escrita por `status` ou por `attended`.
CREATE OR REPLACE FUNCTION public.meetings_sync_attended()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.attended AND NEW.status = 'agendada' THEN
      NEW.status := 'realizada';
    END IF;
    NEW.attended := (NEW.status = 'realizada');
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.attended := (NEW.status = 'realizada');
    ELSIF NEW.attended IS DISTINCT FROM OLD.attended THEN
      -- Escrita legada: marcar presença promove para realizada; desmarcar uma
      -- realizada vira falta, e não volta a "ainda vai acontecer".
      NEW.status := CASE
        WHEN NEW.attended THEN 'realizada'
        WHEN OLD.status = 'realizada' THEN 'no_show'
        ELSE OLD.status
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meetings_sync_attended_trg ON public.meetings;
CREATE TRIGGER meetings_sync_attended_trg
  BEFORE INSERT OR UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.meetings_sync_attended();

CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings (status);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON public.meetings (scheduled_at);
