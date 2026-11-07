// Grade do agendamento automático da call de diagnóstico (17/09/2026).
//
// Arquivo PURO, sem import nenhum e sem API do Deno: é lido pela edge function
// `agendamento` (fonte da verdade) e pelo front (`src/lib/agendamento.ts`), que
// só o usa para a prévia local quando a função ainda não está publicada. A regra
// mora num lugar só para a prévia nunca mostrar um horário que o servidor
// recusaria.
//
// Os VALORES da grade vêm da tabela `agendamento_config` (migration
// 20260917150000). `GRADE_PADRAO` é o espelho dos defaults dela e só vale quando
// a linha não existe.

export interface GradeConfig {
  /** Dias da semana ISO: 1 = segunda … 7 = domingo. */
  dias_semana: number[];
  /** Horários de INÍCIO candidatos, "HH:MM", no fuso abaixo. */
  horarios_inicio: string[];
  duracao_minutos: number;
  /** Distância mínima entre o INÍCIO de duas calls, para frente e para trás. */
  espacamento_minutos: number;
  antecedencia_minima_minutos: number;
  horizonte_dias: number;
  fuso: string;
}

export const GRADE_PADRAO: GradeConfig = {
  dias_semana: [1, 2, 3, 4, 5, 6],
  horarios_inicio: ["10:00", "11:00", "13:00", "14:00", "15:00", "18:00", "19:00", "19:30"],
  duracao_minutos: 45,
  espacamento_minutos: 120,
  antecedencia_minima_minutos: 120,
  horizonte_dias: 7,
  fuso: "America/Sao_Paulo",
};

/**
 * Faixas que podem agendar sozinhas: faturamento declarado ≥ R$ 100 mil.
 * Rótulos idênticos a INVESTIMENTO_OPTIONS (src/lib/leadScore.ts).
 */
export const FAIXAS_AGENDAMENTO = [
  "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil",
  "De R$ 200 mil a R$ 300 mil",
  "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil",
  "De R$ 750 mil a R$ 1 milhão",
  "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões",
  "De R$ 3 milhões a R$ 5 milhões",
  "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
];

/** Tolera espaço duro, caixa e espaços repetidos. Não tolera rótulo diferente. */
function normalizarFaixa(v: string): string {
  return v.replace(/ /g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
const FAIXAS_AGENDAMENTO_NORM = new Set(FAIXAS_AGENDAMENTO.map(normalizarFaixa));

export function faixaPermiteAgendamento(faixa: string | null | undefined): boolean {
  return !!faixa && FAIXAS_AGENDAMENTO_NORM.has(normalizarFaixa(faixa));
}

const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;

/** Linha do banco (ou nada) → configuração válida, com o padrão no que faltar. */
export function normalizarGrade(row: Partial<Record<keyof GradeConfig, unknown>> | null | undefined): GradeConfig {
  const r = row ?? {};
  const num = (v: unknown, padrao: number, min: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? Math.floor(n) : padrao;
  };
  const dias = Array.isArray(r.dias_semana)
    ? (r.dias_semana as unknown[]).map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    : GRADE_PADRAO.dias_semana;
  const horarios = Array.isArray(r.horarios_inicio)
    ? (r.horarios_inicio as unknown[]).map(String).filter((h) => parseHora(h) !== null)
    : GRADE_PADRAO.horarios_inicio;
  return {
    dias_semana: dias.length ? dias : GRADE_PADRAO.dias_semana,
    horarios_inicio: horarios.length ? horarios : GRADE_PADRAO.horarios_inicio,
    duracao_minutos: num(r.duracao_minutos, GRADE_PADRAO.duracao_minutos, 15),
    espacamento_minutos: num(r.espacamento_minutos, GRADE_PADRAO.espacamento_minutos, 0),
    antecedencia_minima_minutos: num(r.antecedencia_minima_minutos, GRADE_PADRAO.antecedencia_minima_minutos, 0),
    horizonte_dias: num(r.horizonte_dias, GRADE_PADRAO.horizonte_dias, 1),
    fuso: typeof r.fuso === "string" && r.fuso ? r.fuso : GRADE_PADRAO.fuso,
  };
}

function parseHora(h: string): { hh: number; mm: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h).trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return { hh, mm };
}

// ── Fuso ────────────────────────────────────────────────────────────────────
// Sem biblioteca: o Intl do Deno e dos navegadores conhece os fusos IANA. São
// Paulo não tem horário de verão desde 2019, mas a conta abaixo não presume isso.

const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatadores.set(fuso, f);
  }
  return f;
}

export function partesNoFuso(ms: number, fuso: string) {
  const p: Record<string, number> = {};
  for (const parte of formatador(fuso).formatToParts(new Date(ms))) {
    if (parte.type !== "literal") p[parte.type] = Number(parte.value);
  }
  return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour % 24, minuto: p.minute, segundo: p.second };
}

function deslocamentoMs(ms: number, fuso: string): number {
  const p = partesNoFuso(ms, fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUtc - Math.floor(ms / 1000) * 1000;
}

/** Instante (ms UTC) do horário de parede `dia/mes/ano hh:mm` no fuso. */
export function instanteLocal(ano: number, mes: number, dia: number, hh: number, mm: number, fuso: string): number {
  const alvo = Date.UTC(ano, mes - 1, dia, hh, mm);
  let ms = alvo - deslocamentoMs(alvo, fuso);
  const ajuste = deslocamentoMs(ms, fuso);
  if (alvo - ajuste !== ms) ms = alvo - ajuste;
  return ms;
}

// ── Grade ───────────────────────────────────────────────────────────────────

export interface SlotCandidato {
  /** ISO em UTC, com milissegundos zerados. É o que viaja entre front e função. */
  inicio: string;
  inicioMs: number;
  /** Data local "AAAA-MM-DD" no fuso da grade. */
  data: string;
  /** Hora local "HH:MM". */
  hora: string;
  /** 1 = segunda … 7 = domingo. */
  diaSemanaIso: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Todos os horários da grade entre agora + antecedência e agora + horizonte,
 * sem olhar ocupação. O horizonte é contado em horas corridas (7 × 24 h a
 * partir de agora), não em datas de calendário.
 */
export function gerarCandidatos(cfg: GradeConfig, agoraMs: number): SlotCandidato[] {
  const hoje = partesNoFuso(agoraMs, cfg.fuso);
  const minimo = agoraMs + cfg.antecedencia_minima_minutos * MIN;
  const maximo = agoraMs + cfg.horizonte_dias * DIA;
  const horarios = cfg.horarios_inicio.map(parseHora).filter((h): h is { hh: number; mm: number } => !!h);
  const vistos = new Set<number>();
  const saida: SlotCandidato[] = [];

  for (let d = 0; d <= cfg.horizonte_dias; d++) {
    // Data de calendário local somando dias em UTC puro (sem fuso na conta).
    const base = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + d));
    const ano = base.getUTCFullYear();
    const mes = base.getUTCMonth() + 1;
    const dia = base.getUTCDate();
    const diaSemanaIso = base.getUTCDay() === 0 ? 7 : base.getUTCDay();
    if (!cfg.dias_semana.includes(diaSemanaIso)) continue;

    for (const h of horarios) {
      const ms = instanteLocal(ano, mes, dia, h.hh, h.mm, cfg.fuso);
      if (ms < minimo || ms > maximo || vistos.has(ms)) continue;
      vistos.add(ms);
      saida.push({
        inicio: new Date(ms).toISOString(),
        inicioMs: ms,
        data: `${ano}-${pad(mes)}-${pad(dia)}`,
        hora: `${pad(h.hh)}:${pad(h.mm)}`,
        diaSemanaIso,
      });
    }
  }
  return saida.sort((a, b) => a.inicioMs - b.inicioMs);
}

export interface Intervalo {
  inicioMs: number;
  fimMs: number;
}

export type MotivoIndisponivel = "espacamento" | "agenda";

/**
 * Por que o horário não pode ser oferecido, ou null se está livre.
 *
 * (a) espaçamento: alguma call existente (agendada ou realizada) começa a MENOS
 *     de `espacamento_minutos` deste início, para frente ou para trás. Exatamente
 *     no limite (2 h cravadas) é permitido: call às 13:00 bloqueia 11:01–14:59 e
 *     libera 11:00 e 15:00.
 * (b) agenda: algum período ocupado do Google sobrepõe a janela da call
 *     [início, início + duração).
 */
export function motivoIndisponivel(
  inicioMs: number,
  iniciosExistentesMs: number[],
  ocupados: Intervalo[],
  cfg: GradeConfig,
): MotivoIndisponivel | null {
  const raio = cfg.espacamento_minutos * MIN;
  for (const t of iniciosExistentesMs) {
    if (Math.abs(t - inicioMs) < raio) return "espacamento";
  }
  const fim = inicioMs + cfg.duracao_minutos * MIN;
  for (const o of ocupados) {
    if (o.inicioMs < fim && o.fimMs > inicioMs) return "agenda";
  }
  return null;
}

export function filtrarLivres(
  candidatos: SlotCandidato[],
  iniciosExistentesMs: number[],
  ocupados: Intervalo[],
  cfg: GradeConfig,
): SlotCandidato[] {
  return candidatos.filter((s) => motivoIndisponivel(s.inicioMs, iniciosExistentesMs, ocupados, cfg) === null);
}

/** O início pedido pelo cliente é EXATAMENTE um horário da grade de agora? */
export function slotDaGrade(inicioIso: string, cfg: GradeConfig, agoraMs: number): SlotCandidato | null {
  const ms = Date.parse(inicioIso);
  if (!Number.isFinite(ms)) return null;
  return gerarCandidatos(cfg, agoraMs).find((s) => s.inicioMs === ms) ?? null;
}

export interface DiaComSlots {
  data: string;
  diaSemanaIso: number;
  slots: SlotCandidato[];
}

export function agruparPorDia(slots: SlotCandidato[]): DiaComSlots[] {
  const mapa = new Map<string, DiaComSlots>();
  for (const s of slots) {
    let d = mapa.get(s.data);
    if (!d) {
      d = { data: s.data, diaSemanaIso: s.diaSemanaIso, slots: [] };
      mapa.set(s.data, d);
    }
    d.slots.push(s);
  }
  return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/** Janela que a busca de ocupação precisa cobrir para esta lista de candidatos. */
export function janelaDeBusca(candidatos: SlotCandidato[], cfg: GradeConfig): Intervalo | null {
  if (!candidatos.length) return null;
  const raio = Math.max(cfg.espacamento_minutos, cfg.duracao_minutos) * MIN;
  return {
    inicioMs: candidatos[0].inicioMs - raio,
    fimMs: candidatos[candidatos.length - 1].inicioMs + raio,
  };
}
