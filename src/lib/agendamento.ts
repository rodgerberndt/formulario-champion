/**
 * Cliente do agendamento automático (edge function `agendamento`).
 *
 * A regra da grade mora em supabase/functions/_shared/agenda-grade.ts e é a
 * mesma aqui e no servidor. O front só a executa na PRÉVIA LOCAL: em dev
 * (import.meta.env.DEV), quando a função ainda não está publicada ou não
 * responde, os horários e a reserva são simulados e a tela avisa. Em produção
 * nunca se simula: falhou, o lead segue para /obrigadomql.
 */
import {
  GRADE_PADRAO,
  agruparPorDia,
  faixaPermiteAgendamento,
  filtrarLivres,
  gerarCandidatos,
  instanteLocal,
  partesNoFuso,
} from "../../supabase/functions/_shared/agenda-grade.ts";

export { faixaPermiteAgendamento };

/** Reunião confirmada, lida por /obrigadomql. Presa ao lead_id. */
export const AGENDAMENTO_STORAGE_KEY = "champion_agendamento";

/** Lead de prévia (só dev, /agendar?previa=1). */
export const PREVIA_LEAD_PREFIX = "previa-";

export interface SlotApi {
  inicio: string;
  hora: string;
}

export interface DiaApi {
  data: string;
  dia_semana_iso: number;
  slots: SlotApi[];
}

export interface ReuniaoConfirmada {
  lead_id: string;
  meeting_id: string | null;
  inicio: string;
  duracao_minutos: number;
  meet_link: string | null;
  previa?: boolean;
}

export type RespostaSlots =
  | { tipo: "ok"; dias: DiaApi[]; duracao_minutos: number; previa: boolean }
  | { tipo: "ja_agendado"; reuniao: ReuniaoConfirmada }
  | { tipo: "erro"; codigo: string; mensagem: string };

export type RespostaReserva =
  | { tipo: "ok"; reuniao: ReuniaoConfirmada }
  | { tipo: "ocupado"; mensagem: string }
  | { tipo: "ja_agendado"; reuniao: ReuniaoConfirmada | null }
  | { tipo: "erro"; codigo: string; mensagem: string };

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agendamento`;

/** JSON devolvido pela função; os campos variam por rota e por erro. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CorpoFuncao = Record<string, any>;

function headers(): HeadersInit {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/**
 * Chama a função. `null` quando quem respondeu NÃO foi a função (rede caiu,
 * 404 do gateway para função não publicada, corpo que não é dela): é esse caso,
 * e só ele, que habilita a prévia em dev.
 */
async function chamar(caminho: string, init: RequestInit = {}): Promise<{ status: number; corpo: CorpoFuncao } | null> {
  try {
    const res = await fetch(`${BASE}${caminho}`, { ...init, headers: headers() });
    const corpo = await res.json().catch(() => null);
    if (!corpo || corpo.servico !== "agendamento") return null;
    return { status: res.status, corpo };
  } catch {
    return null;
  }
}

function paraReuniao(leadId: string, j: CorpoFuncao | null | undefined, duracaoPadrao = GRADE_PADRAO.duracao_minutos): ReuniaoConfirmada | null {
  if (!j?.inicio) return null;
  return {
    lead_id: leadId,
    meeting_id: j.meeting_id ?? null,
    inicio: j.inicio,
    duracao_minutos: j.duracao_minutos ?? duracaoPadrao,
    meet_link: j.meet_link ?? null,
  };
}

export async function buscarSlots(leadId: string): Promise<RespostaSlots> {
  if (import.meta.env.DEV && leadId.startsWith(PREVIA_LEAD_PREFIX)) return slotsDePrevia();

  const r = await chamar(`/slots?lead_id=${encodeURIComponent(leadId)}`, { method: "GET" });
  if (!r) {
    if (import.meta.env.DEV) return slotsDePrevia();
    return { tipo: "erro", codigo: "indisponivel", mensagem: "Não conseguimos carregar a agenda agora." };
  }
  const j = r.corpo;
  if (j.ja_agendado) {
    const reuniao = paraReuniao(leadId, j.ja_agendado);
    if (reuniao) return { tipo: "ja_agendado", reuniao };
  }
  if (r.status >= 400) {
    return { tipo: "erro", codigo: j.erro ?? "erro", mensagem: j.mensagem ?? "Não conseguimos carregar a agenda agora." };
  }
  return { tipo: "ok", dias: Array.isArray(j.dias) ? j.dias : [], duracao_minutos: j.duracao_minutos ?? GRADE_PADRAO.duracao_minutos, previa: false };
}

export async function reservarHorario(leadId: string, inicio: string): Promise<RespostaReserva> {
  if (import.meta.env.DEV && leadId.startsWith(PREVIA_LEAD_PREFIX)) return reservaDePrevia(leadId, inicio);

  const r = await chamar("/reservar", { method: "POST", body: JSON.stringify({ lead_id: leadId, inicio }) });
  if (!r) {
    if (import.meta.env.DEV) return reservaDePrevia(leadId, inicio);
    return { tipo: "erro", codigo: "indisponivel", mensagem: "Não conseguimos confirmar agora." };
  }
  const j = r.corpo;
  if (r.status === 200 && j.ok) {
    const reuniao = paraReuniao(leadId, j);
    if (reuniao) return { tipo: "ok", reuniao };
  }
  if (j.erro === "slot_ocupado" || j.erro === "horario_invalido") {
    return { tipo: "ocupado", mensagem: j.mensagem ?? "Esse horário acabou de ser ocupado." };
  }
  if (j.erro === "lead_ja_agendado") {
    return { tipo: "ja_agendado", reuniao: paraReuniao(leadId, j.ja_agendado) };
  }
  return { tipo: "erro", codigo: j.erro ?? "erro", mensagem: j.mensagem ?? "Não conseguimos confirmar agora." };
}

// ── Prévia local (só dev) ───────────────────────────────────────────────────

/**
 * Mesma grade do servidor, com UMA reunião fictícia amanhã às 14:00 para a
 * regra de espaçamento aparecer na tela (13:00, 14:00 e 15:00 somem; 11:00 e
 * 18:00 ficam) e um bloco "ocupado no Google" depois de amanhã das 10:00 às
 * 11:30 (10:00 e 11:00 somem).
 */
function slotsDePrevia(): RespostaSlots {
  const cfg = GRADE_PADRAO;
  const agora = Date.now();
  const hoje = partesNoFuso(agora, cfg.fuso);
  const amanha = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + 1));
  const depois = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + 2));
  const reuniaoFicticia = instanteLocal(amanha.getUTCFullYear(), amanha.getUTCMonth() + 1, amanha.getUTCDate(), 14, 0, cfg.fuso);
  const ocupadoInicio = instanteLocal(depois.getUTCFullYear(), depois.getUTCMonth() + 1, depois.getUTCDate(), 10, 0, cfg.fuso);
  const livres = filtrarLivres(
    gerarCandidatos(cfg, agora),
    [reuniaoFicticia],
    [{ inicioMs: ocupadoInicio, fimMs: ocupadoInicio + 90 * 60 * 1000 }],
    cfg,
  );
  return {
    tipo: "ok",
    previa: true,
    duracao_minutos: cfg.duracao_minutos,
    dias: agruparPorDia(livres).map((d) => ({
      data: d.data,
      dia_semana_iso: d.diaSemanaIso,
      slots: d.slots.map((s) => ({ inicio: s.inicio, hora: s.hora })),
    })),
  };
}

async function reservaDePrevia(leadId: string, inicio: string): Promise<RespostaReserva> {
  await new Promise((r) => setTimeout(r, 700));
  return {
    tipo: "ok",
    reuniao: {
      lead_id: leadId,
      meeting_id: null,
      inicio,
      duracao_minutos: GRADE_PADRAO.duracao_minutos,
      meet_link: null,
      previa: true,
    },
  };
}

// ── Formatação e armazenamento ──────────────────────────────────────────────

const FUSO = GRADE_PADRAO.fuso;

/** "quinta-feira, 18/09" */
export function rotuloDia(dataIso: string): string {
  const [a, m, d] = dataIso.split("-").map(Number);
  // Meio-dia UTC: nunca cai no dia vizinho em fuso nenhum das Américas.
  const ms = Date.UTC(a, m - 1, d, 12);
  const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(ms);
  return `${semana}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** "quinta-feira, 18/09 às 14:00" no horário de Brasília. */
export function rotuloReuniao(inicioIso: string): string {
  const ms = Date.parse(inicioIso);
  const p = partesNoFuso(ms, FUSO);
  const data = `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
  return `${rotuloDia(data)} às ${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
}

export function salvarReuniaoConfirmada(r: ReuniaoConfirmada) {
  try { localStorage.setItem(AGENDAMENTO_STORAGE_KEY, JSON.stringify(r)); } catch { /* ignore */ }
}

/** A reunião confirmada DESTE lead (outro lead no mesmo navegador não vale). */
export function lerReuniaoConfirmada(leadId: string | null): ReuniaoConfirmada | null {
  if (!leadId) return null;
  try {
    const r = JSON.parse(localStorage.getItem(AGENDAMENTO_STORAGE_KEY) || "null");
    return r && r.lead_id === leadId && typeof r.inicio === "string" ? r : null;
  } catch {
    return null;
  }
}
