// Quem é dono de qual lead, e quem cobre quando o dono não chama.
//
// Isto morava dentro do `notify-lead`, em duas listas de faixas e uma função que
// só sabia devolver o Miguel. Agora o `sla-check` precisa da mesma resposta para
// saber a quem escalar, e duas cópias da regra é como se descobre, seis meses
// depois, que o painel e a notificação discordam sobre de quem é o lead.
//
// ── O time, em 03/09/2026 ────────────────────────────────────────────────────
// Miguel é o SDR e recebe todo lead novo. Caio é closer e não recebe lead: ele
// entra depois, na reunião. Guguinha é o backup de todas as faixas. Rodger só
// aparece no degrau de 15 minutos, que é o degrau de "alguma coisa quebrou".
//
// O histórico importa aqui: Gustavo saiu, a Dara saiu, o Caio virou closer, e o
// código ainda tinha os três. Por isso o dono fica CONGELADO no lead (coluna
// `sla_owner`) no instante em que ele cai — a regra muda, e um lead de agosto
// não pode ser cobrado de quem nem trabalhava aqui.

export type Pessoa = "Miguel" | "Caio" | "Guguinha" | "Rodger";

/** Quem pode receber push. É a lista que aparece no painel ao ativar. */
export const PESSOAS: Pessoa[] = ["Miguel", "Caio", "Guguinha", "Rodger"];

/** Faixas de faturamento que contam como MQL. A régua da casa é R$ 10 mil. */
export const FAIXAS_MQL = [
  "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil",
  "De R$ 30 mil a R$ 50 mil", "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil",
  "De R$ 100 mil a R$ 150 mil", "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil",
  "De R$ 300 mil a R$ 500 mil", "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão",
  "De R$ 1 milhão a R$ 2 milhões", "De R$ 2 milhões a R$ 3 milhões",
  "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
  // Rótulos do quiz antigo, ainda presentes na base.
  "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
];

/** Faixas com dono, mas abaixo da régua de MQL. */
const FAIXAS_ABAIXO_DA_REGUA = ["Até R$ 5 mil", "De R$ 5 mil a R$ 10 mil"];

export function ehMql(faixa?: string | null): boolean {
  return !!faixa && FAIXAS_MQL.includes(faixa);
}

export interface Responsaveis {
  dono: Pessoa;
  backup: Pessoa;
  /** Vale a régua de MQL, e portanto o relógio de 5 minutos. */
  mql: boolean;
}

/**
 * De quem é este lead.
 *
 * `null` só para "Não vendo ainda (R$0/mês)" e para faixa vazia: quem não vende
 * nada não é lead de ninguém, e notificar sobre ele gasta a atenção que o
 * sistema precisa ter quando um MQL de verdade cair.
 */
export function responsaveisDoLead(faixa?: string | null): Responsaveis | null {
  if (!faixa) return null;
  if (ehMql(faixa)) return { dono: "Miguel", backup: "Guguinha", mql: true };
  if (FAIXAS_ABAIXO_DA_REGUA.includes(faixa)) {
    return { dono: "Miguel", backup: "Guguinha", mql: false };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Os degraus da escalação
//
// Aos 3 minutos é lembrete, ainda dentro do prazo. Aos 5 o prazo estourou e o
// backup entra junto. Aos 15 sobe para a gestão, porque a essa altura o
// problema não é mais o lead, é o processo.
//
// Cada degrau avisa UMA vez. O cron roda de minuto em minuto, e sem essa trava
// a mesma escalação sairia sessenta vezes por hora até alguém desligar a
// notificação — que é exatamente o fracasso que este sistema existe para evitar.
// ─────────────────────────────────────────────────────────────────────────────

export interface Degrau {
  minutos: number;
  /** Quem recebe, resolvido a partir do dono e do backup do lead. */
  quem: (r: Responsaveis) => Pessoa[];
  titulo: (nome: string) => string;
  corpo: (nome: string, minutos: number) => string;
}

export const DEGRAUS: Degrau[] = [
  {
    minutos: 3,
    quem: (r) => [r.dono],
    titulo: (nome) => `⏳ ${nome} está esperando`,
    corpo: (nome, m) => `${nome} caiu há ${m} min e ainda não foi chamado. Faltam 2 min para estourar o SLA.`,
  },
  {
    minutos: 5,
    quem: (r) => [r.dono, r.backup],
    titulo: (nome) => `🚨 SLA estourado: ${nome}`,
    corpo: (nome, m) => `${nome} está há ${m} min sem contato. Quem pegar primeiro, chama.`,
  },
  {
    minutos: 15,
    quem: (r) => [r.backup, "Rodger" as Pessoa],
    titulo: (nome) => `🔴 15 min sem contato: ${nome}`,
    corpo: (nome, m) => `${nome} caiu há ${m} min e ninguém chamou. Isso já não é atraso, é falha de processo.`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Expediente
//
// O relógio para às 20h e volta às 9h (horário de Brasília). Lead que cai de
// madrugada continua gerando o push de chegada — quem quiser atender atende —
// mas não estoura SLA nem acorda o backup: cobrar 5 minutos de resposta às 3 da
// manhã transformaria a métrica numa mentira e a notificação num incômodo.
// ─────────────────────────────────────────────────────────────────────────────

export const EXPEDIENTE_INICIO = 9;
export const EXPEDIENTE_FIM = 20;

/** Hora de Brasília (UTC-3) de um instante qualquer. */
export function horaBrasilia(d: Date): number {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).getUTCHours();
}

export function dentroDoExpediente(d: Date): boolean {
  const h = horaBrasilia(d);
  return h >= EXPEDIENTE_INICIO && h < EXPEDIENTE_FIM;
}

/**
 * Minutos de EXPEDIENTE entre dois instantes.
 *
 * Não é a diferença de relógio: um lead que cai às 19h55 e é chamado às 9h05 do
 * dia seguinte esperou 13 horas de relógio e 10 minutos de expediente. É o
 * segundo número que mede o time, e é ele que decide a escalação.
 *
 * A varredura é de 5 em 5 minutos porque o cron roda a cada minuto e os degraus
 * são de 3, 5 e 15: precisão de minuto é mais do que suficiente, e uma conta
 * fechada por integral seria mais difícil de conferir do que de escrever.
 */
export function minutosDeExpediente(de: Date, ate: Date): number {
  if (ate <= de) return 0;
  const PASSO_MS = 60 * 1000;
  let minutos = 0;
  for (let t = de.getTime(); t < ate.getTime(); t += PASSO_MS) {
    if (dentroDoExpediente(new Date(t))) minutos += 1;
  }
  return minutos;
}
