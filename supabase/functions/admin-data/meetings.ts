// Os três estados de uma reunião, num lugar só.
//
// `meetings.attended` é booleano e nasce `false` no agendamento, então uma call
// marcada para semana que vem entrava no denominador do comparecimento como
// falta. A migration `20260828140000` criou `status` (agendada · realizada ·
// no_show) e `scheduled_at`; estas funções são a única leitura desses campos,
// para que backend e painel nunca divirjam de conta.

export type MeetingStatus = "agendada" | "realizada" | "no_show";

export interface MeetingRow {
  attended?: boolean | null;
  status?: string | null;
  scheduled_at?: string | null;
  created_at?: string;
}

/** Status efetivo, com `attended` como reserva para linha anterior à migration. */
export function statusDaReuniao(m: MeetingRow): MeetingStatus {
  const s = m.status;
  if (s === "realizada" || s === "no_show" || s === "agendada") return s;
  return m.attended ? "realizada" : "agendada";
}

export function isRealizada(m: MeetingRow): boolean {
  return statusDaReuniao(m) === "realizada";
}

export function isNoShow(m: MeetingRow): boolean {
  return statusDaReuniao(m) === "no_show";
}

/**
 * A reunião já teve desfecho — compareceu ou faltou. É o denominador honesto do
 * comparecimento. Reunião ainda agendada fica de fora: ela não é presença nem
 * falta, é futuro.
 */
export function jaAconteceu(m: MeetingRow): boolean {
  return statusDaReuniao(m) !== "agendada";
}

/**
 * Agendada cuja hora já passou e ninguém marcou o desfecho. Não entra em taxa
 * nenhuma — o que se sabe dela é que falta alguém preencher — mas precisa
 * aparecer na tela, senão o show rate sobe simplesmente porque pararam de
 * registrar as faltas.
 */
export function pendenteDeMarcacao(m: MeetingRow, agora = new Date()): boolean {
  if (statusDaReuniao(m) !== "agendada") return false;
  if (!m.scheduled_at) return false;
  return Date.parse(m.scheduled_at) < agora.getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// Funil de origem
//
// Até 03/09/2026 toda venda e toda reunião do painel eram mídia paga, porque o
// formulário era a única porta. Indicação e social selling passaram a entrar
// aqui, e precisam ficar SEPARADOS de mídia paga em qualquer conta de custo:
// eles não gastaram mídia, e somá-los ao tráfego faria o CAC despencar por um
// motivo que não tem nada a ver com o tráfego.
// ─────────────────────────────────────────────────────────────────────────────

export const ORIGENS_VALIDAS = new Set(["midia_paga", "indicacao", "social_selling"]);

export const ROTULO_ORIGEM: Record<string, string> = {
  midia_paga: "Mídia paga",
  indicacao: "Indicação",
  social_selling: "Social selling",
};

// ─────────────────────────────────────────────────────────────────────────────
// Processo Abóbora
//
// As perguntas que o SDR precisa ter respondido antes de a call chegar ao
// closer. A reunião só pode ser registrada com elas preenchidas — é essa a
// trava, e ela existe porque uma call sem essas respostas custa uma hora de
// closer para descobrir que a pessoa não decide nada.
// ─────────────────────────────────────────────────────────────────────────────

export interface Abobora {
  abobora_posicao?: string | null;
  abobora_segmento?: string | null;
  abobora_decide?: string | null;
  abobora_quem_decide?: string | null;
  abobora_investimento?: string | null;
}

const vazio = (v: unknown) => !String(v ?? "").trim();

/**
 * O que falta no Processo Abóbora. Lista vazia significa completo.
 *
 * "Quem decide" só é exigido de quem respondeu que NÃO decide sozinho: quem
 * decide não tem essa resposta para dar, e cobrá-la travaria justamente a
 * reunião boa.
 */
export function faltasNoAbobora(a: Abobora): string[] {
  const faltas: string[] = [];
  if (vazio(a.abobora_posicao)) faltas.push("posição do lead na operação");
  if (vazio(a.abobora_segmento)) faltas.push("segmento e nicho da operação");
  if (a.abobora_decide !== "sim" && a.abobora_decide !== "nao") {
    faltas.push("se ele decide sim ou não na call");
  }
  if (a.abobora_decide === "nao" && vazio(a.abobora_quem_decide)) {
    faltas.push("quem decide e se vem à call");
  }
  if (vazio(a.abobora_investimento)) faltas.push("investimento em tráfego e faturamento");
  return faltas;
}

export function aboboraCompleta(a: Abobora): boolean {
  return faltasNoAbobora(a).length === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Espaçamento mínimo entre calls
//
// Duas reuniões do MESMO closer precisam de 3 horas de distância. A regra é do
// Rodger (03/09/2026) e a razão é operacional: uma call de diagnóstico não
// termina quando acaba — tem o atraso do lead, o overtime da conversa boa e o
// registro depois. Marcar duas com uma hora de intervalo garante que a segunda
// comece atrasada ou que a primeira seja cortada.
//
// É por CLOSER, não global: Caio e Rodger podem ter calls no mesmo horário,
// porque são duas pessoas diferentes. Trocar para global é mudar uma linha.
//
// No-show não bloqueia: se o lead não apareceu, o horário está livre de fato.
// ─────────────────────────────────────────────────────────────────────────────

export const INTERVALO_MINIMO_HORAS = 3;

export interface ReuniaoAgendada {
  id: string;
  scheduled_at: string | null;
  closer: string | null;
  notes: string | null;
  status?: string | null;
  attended?: boolean | null;
}

/**
 * A reunião que impede este horário, ou null quando está livre.
 *
 * `ignorarId` existe para o remarcar: uma reunião não conflita consigo mesma.
 */
export function conflitoDeAgenda(
  quando: string,
  closer: string | null,
  existentes: ReuniaoAgendada[],
  ignorarId?: string,
): ReuniaoAgendada | null {
  const alvo = Date.parse(quando);
  if (Number.isNaN(alvo)) return null;
  const janela = INTERVALO_MINIMO_HORAS * 60 * 60 * 1000;

  for (const m of existentes) {
    if (!m.scheduled_at) continue;
    if (ignorarId && m.id === ignorarId) continue;
    // Closer diferente é agenda diferente. Reunião sem closer definido entra na
    // conta de todo mundo: não dá para saber de quem é, e o risco de sobrepor
    // é maior do que o incômodo de bloquear.
    if (m.closer && closer && m.closer !== closer) continue;
    if (statusDaReuniao(m) === "no_show") continue;
    const t = Date.parse(m.scheduled_at);
    if (Number.isNaN(t)) continue;
    if (Math.abs(t - alvo) < janela) return m;
  }
  return null;
}

/** Mensagem pronta para a tela, dizendo com o que o horário bate. */
export function mensagemDeConflito(m: ReuniaoAgendada): string {
  const quando = m.scheduled_at
    ? new Date(Date.parse(m.scheduled_at) - 3 * 60 * 60 * 1000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 16)
    : "horário desconhecido";
  const quem = (m.notes || "").split(" — ")[0] || "outra reunião";
  return `Já existe call de ${m.closer || "closer não definido"} às ${quando} (${quem}). ` +
    `São necessárias ${INTERVALO_MINIMO_HORAS} horas entre uma call e outra.`;
}
