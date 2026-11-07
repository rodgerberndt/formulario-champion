-- Push por pessoa e o SLA de 5 minutos no lead.
--
-- Regra do negócio: todo lead tem que ser chamado no WhatsApp em até 5 minutos.
-- Para isso funcionar faltavam três coisas no banco: saber DE QUEM é cada
-- aparelho inscrito, saber QUANDO o lead foi de fato chamado, e ter onde
-- guardar até que degrau da escalação já foi avisado.
--
-- Nada é apagado aqui. `first_opened_at` continua existindo e continua
-- significando o que sempre significou (abertura do card); `contacted_at` é
-- outra coisa, e é justamente a diferença entre as duas que mede o SLA.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. De quem é o aparelho
--
-- `user_label` guardava o user agent do navegador, então a tabela sabia que
-- existia "um Chrome no Windows" e não sabia se ele era do Miguel ou do Caio.
-- Mandar push para uma pessoa específica era impossível por construção.
--
-- `pessoa` passa a ser quem recebe; `user_label` continua sendo o aparelho, que
-- é o que permite a pessoa reconhecer e desligar um celular antigo na lista.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS pessoa TEXT;

COMMENT ON COLUMN public.push_subscriptions.pessoa IS
  'Quem recebe o push neste aparelho: Miguel, Caio, Guguinha, Rodger. Preenchido no momento de ativar as notificações.';
COMMENT ON COLUMN public.push_subscriptions.user_label IS
  'O APARELHO (user agent abreviado), não a pessoa. Serve para alguém reconhecer e remover um celular antigo da lista.';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_pessoa
  ON public.push_subscriptions (pessoa)
  WHERE pessoa IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Quando o lead foi chamado de verdade
--
-- `first_opened_at` marca quando alguém ABRIU o card no painel, que não é a
-- mesma coisa que ter chamado a pessoa. Dá para abrir dez cards em vinte
-- segundos e não falar com ninguém — e era assim que o tempo de resposta ficava
-- bonito sem que nada tivesse acontecido.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contacted_by TEXT;

COMMENT ON COLUMN public.leads.contacted_at IS
  'Quando o lead foi CHAMADO no WhatsApp. Diferente de first_opened_at, que é só a abertura do card no painel.';
COMMENT ON COLUMN public.leads.contacted_by IS
  'Quem clicou em Chamei.';

CREATE INDEX IF NOT EXISTS idx_leads_contacted_at
  ON public.leads (contacted_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O relógio da escalação
--
-- `sla_stage` é o último degrau JÁ AVISADO (0, 3, 5 ou 15). É ele que impede o
-- cron de 1 minuto de repetir o mesmo aviso sessenta vezes por hora — sem esse
-- registro, escalação vira spam e o time desliga a notificação, que é o pior
-- resultado possível.
--
-- `sla_owner` é congelado no momento em que o lead cai. O roteamento pode mudar
-- (mudou três vezes em 2026), e um lead de agosto não pode ser recobrado de
-- quem nem trabalhava aqui na época.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sla_owner TEXT,
  ADD COLUMN IF NOT EXISTS sla_stage SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_last_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.sla_owner IS
  'Dono do lead no momento em que ele caiu, congelado. O roteamento muda; a responsabilidade daquele dia, não.';
COMMENT ON COLUMN public.leads.sla_stage IS
  'Último degrau de escalação já avisado: 0 nenhum, 3 lembrete ao dono, 5 backup, 15 gestão, 99 fora do relógio (lead sem dono ou fora do recorte). Impede o cron de repetir o mesmo aviso.';
COMMENT ON COLUMN public.leads.sla_breached_at IS
  'Quando o lead passou de 5 minutos sem ser chamado. É a métrica do SLA.';

-- O cron varre a cada minuto procurando lead sem contato. Sem este índice a
-- varredura é um seq scan na tabela inteira 1.440 vezes por dia.
CREATE INDEX IF NOT EXISTS idx_leads_sla_pendentes
  ON public.leads (created_at)
  WHERE contacted_at IS NULL AND sla_stage < 15;

-- Leads que já existiam não entram na escalação retroativa: eles nasceram sem
-- relógio, e acordar o time às 9h da manhã por causa de um lead de agosto seria
-- a primeira impressão do sistema novo. Marcados como já escalados até o fim.
UPDATE public.leads
SET sla_stage = 99
WHERE sla_stage = 0
  AND contacted_at IS NULL
  AND created_at < NOW() - INTERVAL '1 hour';
