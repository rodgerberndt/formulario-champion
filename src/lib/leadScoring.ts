// Lead Scoring System - Champion
// Direct tier mapping based on monthly revenue (investimento_faixa)

export const MERCADO_OPTIONS = [
  "Infoproduto",
  "Lowticket",
  "Afiliado BR",
  "E-commerce",
  "Dropshipping",
  "SaaS / Software",
  "Serviços / Consultoria",
  "Agência",
  "Afiliado Nutra Gringa",
  "Nutra / Encapsulado Produtor",
  "Igaming",
  "X1 WhatsApp",
  "Hot",
  "Outro",
];

export const ESTAGIO_OPTIONS = [
  "Iniciando do zero",
  "Validação (primeiras vendas)",
  "Pré-escala (vendas constantes)",
  "Escala (buscando otimização)",
];

export const INVESTIMENTO_OPTIONS = [
  "Não vendo ainda (R$0/mês)",
  "Até R$ 5 mil",
  "De R$ 5 mil a R$ 10 mil",
  "De R$ 10 mil a R$ 20 mil",
  "De R$ 20 mil a R$ 30 mil",
  "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil",
  "De R$ 75 mil a R$ 100 mil",
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

// Direct tier mapping by revenue range
export type TierType = "Desqualificado" | "Small" | "Medium" | "Large" | "Enterprise" | "Enterprise+";

const FATURAMENTO_TIER: Record<string, TierType> = {
  "Não vendo ainda (R$0/mês)": "Desqualificado",
  "Até R$ 5 mil": "Small",
  "De R$ 5 mil a R$ 10 mil": "Medium",
  "De R$ 10 mil a R$ 20 mil": "Medium",
  "De R$ 20 mil a R$ 30 mil": "Medium",
  "De R$ 30 mil a R$ 50 mil": "Large",
  "De R$ 50 mil a R$ 75 mil": "Large",
  "De R$ 75 mil a R$ 100 mil": "Large",
  "De R$ 100 mil a R$ 150 mil": "Enterprise",
  "De R$ 150 mil a R$ 200 mil": "Enterprise",
  "De R$ 200 mil a R$ 300 mil": "Enterprise",
  "De R$ 300 mil a R$ 500 mil": "Enterprise",
  "De R$ 500 mil a R$ 750 mil": "Enterprise",
  "De R$ 750 mil a R$ 1 milhão": "Enterprise",
  "De R$ 1 milhão a R$ 2 milhões": "Enterprise+",
  "De R$ 2 milhões a R$ 3 milhões": "Enterprise+",
  "De R$ 3 milhões a R$ 5 milhões": "Enterprise+",
  "De R$ 5 milhões a R$ 10 milhões": "Enterprise+",
  "Acima de R$ 10 milhões": "Enterprise+",
  // Legacy traffic investment values (~2.5x multiplier to estimate revenue)
  "R$ 0 – 2k": "Small",        // ~R$0-5k revenue
  "R$ 2k – 8k": "Medium",      // ~R$5-20k revenue
  "R$ 8k – 20k": "Large",      // ~R$20-50k revenue
  "R$ 20k – 50k": "Enterprise", // ~R$50-125k revenue
  "R$ 50k – 100k": "Enterprise", // ~R$125-250k revenue
};

// Numeric order for tiers (used for score field compatibility)
const TIER_SCORE: Record<TierType, number> = {
  "Desqualificado": 0,
  "Small": 1,
  "Medium": 2,
  "Large": 3,
  "Enterprise": 4,
  "Enterprise+": 5,
};

export interface LeadScoreResult {
  score: number;
  tier: TierType;
  tierLabel: string;
  breakdown: {
    mercado: number;
    estagio: number;
    investimento: number;
  };
}

interface QuizAnswers {
  mercado?: string;
  estagio_negocio?: string;
  investimento_faixa?: string;
  dor_desejo?: string;
}

export function calculateLeadScore(answers: QuizAnswers): LeadScoreResult {
  const tier = FATURAMENTO_TIER[answers.investimento_faixa || ""] || "Desqualificado";
  const score = TIER_SCORE[tier];

  return {
    score,
    tier,
    tierLabel: tier,
    breakdown: {
      mercado: 0,
      estagio: 0,
      investimento: score,
    },
  };
}

export function getTierFromFaturamento(faturamento: string | null | undefined): TierType {
  return FATURAMENTO_TIER[faturamento || ""] || "Desqualificado";
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead Score 0–100 (uses ALL quiz questions)
// Weights (total = 100):
//   Faturamento (investimento_faixa): 25
//   Entendimento do site (NPS 0–10):  30
//   Aceita call de diagnóstico:        8
//   Compromisso WhatsApp:             10
//   Mercado (fit):                     8
//   Operações ativas:                  6
//   Quer vender mais:                  5
//   Dor/desejo (qualidade do texto):   5
//   LGPD aceito:                       3
//   Estágio do negócio:                0 (desativado)
// ─────────────────────────────────────────────────────────────────────────────

const FATURAMENTO_POINTS: Record<string, number> = {
  "Não vendo ainda (R$0/mês)": 0,
  "Até R$ 5 mil": 4,
  "De R$ 5 mil a R$ 10 mil": 11,
  "De R$ 10 mil a R$ 20 mil": 16,
  "De R$ 20 mil a R$ 30 mil": 19,
  "De R$ 30 mil a R$ 50 mil": 21,
  "De R$ 50 mil a R$ 75 mil": 23,
  "De R$ 75 mil a R$ 100 mil": 24,
  "De R$ 100 mil a R$ 150 mil": 25,
  "De R$ 150 mil a R$ 200 mil": 25,
  "De R$ 200 mil a R$ 300 mil": 25,
  "De R$ 300 mil a R$ 500 mil": 25,
  "De R$ 500 mil a R$ 750 mil": 25,
  "De R$ 750 mil a R$ 1 milhão": 25,
  "De R$ 1 milhão a R$ 2 milhões": 25,
  "De R$ 2 milhões a R$ 3 milhões": 25,
  "De R$ 3 milhões a R$ 5 milhões": 25,
  "De R$ 5 milhões a R$ 10 milhões": 25,
  "Acima de R$ 10 milhões": 25,
};

const ESTAGIO_POINTS: Record<string, number> = {
  "Iniciando do zero": 2,
  "Validação (primeiras vendas)": 6,
  "Pré-escala (vendas constantes)": 10,
  "Escala (buscando otimização)": 12,
};

const MERCADO_FIT_ALTO = new Set([
  "Infoproduto", "E-commerce", "SaaS / Software",
  "Serviços / Consultoria", "Agência", "Nutra / Encapsulado Produtor",
]);
const MERCADO_FIT_MEDIO = new Set([
  "Dropshipping", "Afiliado BR", "Afiliado Nutra Gringa", "Lowticket",
]);

function pointsMercado(m?: string | null): number {
  if (!m) return 0;
  if (MERCADO_FIT_ALTO.has(m)) return 8;
  if (MERCADO_FIT_MEDIO.has(m)) return 5;
  return 3; // Igaming, X1, Hot, Outro
}

function pointsOperacoes(n?: number | null): number {
  if (n == null) return 0;
  if (n <= 0) return 1;
  if (n === 1) return 4;
  if (n === 2) return 5;
  return 6; // 3+
}

function pointsDor(text?: string | null): number {
  const len = (text || "").trim().length;
  if (len < 10) return 0;
  if (len < 30) return 2;
  if (len < 80) return 4;
  return 5;
}

function pointsNps(n?: number | null): number {
  if (n == null || isNaN(n)) return 0;
  // 0 = não leu, 10 = leu e entendeu → vale até 30 pontos
  return Math.round(Math.max(0, Math.min(10, n)) * 3);
}

function asBool(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") return v.trim().toLowerCase() === "sim";
  return false;
}

export interface LeadScoreBreakdown {
  faturamento: number;
  estagio: number;
  mercado: number;
  operacoes: number;
  quer_vender_mais: number;
  compromisso_whatsapp: number;
  aceita_call: number;
  dor_desejo: number;
  nps: number;
  lgpd: number;
}

export type LeadScoreBand = "Frio" | "Morno" | "Quente" | "Hot";

export interface LeadScore100Result {
  score: number;
  band: LeadScoreBand;
  breakdown: LeadScoreBreakdown;
}

export interface LeadScoreInput {
  investimento_faixa?: string | null;
  estagio_negocio?: string | null;
  mercado?: string | null;
  operacoes_ativas?: number | null;
  quer_vender_mais?: string | boolean | null;
  compromisso_whatsapp?: string | boolean | null;
  aceita_call_diagnostico?: string | boolean | null;
  dor_desejo?: string | null;
  nps_score?: number | null;
  lgpd?: string | boolean | null;
  raw_answers_json?: Record<string, unknown> | null;
}

export function bandFromScore(score: number): LeadScoreBand {
  if (score >= 75) return "Hot";
  if (score >= 50) return "Quente";
  if (score >= 25) return "Morno";
  return "Frio";
}

/**
 * Compute a 0–100 lead score using every quiz answer available on the lead.
 * Missing fields contribute 0 (a lead who didn't answer simply doesn't earn points).
 */
export function computeLeadScore100(input: LeadScoreInput): LeadScore100Result {
  const raw = (input.raw_answers_json && typeof input.raw_answers_json === "object")
    ? input.raw_answers_json as Record<string, unknown>
    : {};

  const pick = <T,>(top: T | null | undefined, key: string): T | undefined => {
    if (top !== null && top !== undefined && top !== "" as unknown as T) return top;
    const v = raw[key];
    return v === undefined ? undefined : (v as T);
  };

  const faturamento = pick(input.investimento_faixa, "investimento_faixa") as string | undefined;
  const estagio = pick(input.estagio_negocio, "estagio_negocio") as string | undefined;
  const mercado = pick(input.mercado, "mercado") as string | undefined;
  const operacoes = pick<number>(input.operacoes_ativas ?? null, "operacoes_ativas");
  const quer = pick(input.quer_vender_mais, "quer_vender_mais");
  const compromisso = pick(input.compromisso_whatsapp, "compromisso_whatsapp");
  const aceitaCall = pick(input.aceita_call_diagnostico, "aceita_call_diagnostico");
  const dor = pick(input.dor_desejo, "dor_desejo") as string | undefined;
  const nps = pick<number>(input.nps_score ?? null, "nps_score");
  const lgpd = pick(input.lgpd, "lgpd");

  const breakdown: LeadScoreBreakdown = {
    faturamento: FATURAMENTO_POINTS[faturamento || ""] ?? 0,
    estagio: 0,
    mercado: pointsMercado(mercado),
    operacoes: pointsOperacoes(typeof operacoes === "number" ? operacoes : null),
    quer_vender_mais: asBool(quer) ? 5 : 0,
    compromisso_whatsapp: asBool(compromisso) ? 10 : 0,
    aceita_call: asBool(aceitaCall) ? 8 : 0,
    dor_desejo: pointsDor(dor),
    nps: pointsNps(typeof nps === "number" ? nps : null),
    lgpd: asBool(lgpd) ? 3 : 0,
  };

  const total = Object.values(breakdown).reduce((s, v) => s + v, 0);
  const score = Math.max(0, Math.min(100, Math.round(total)));
  return { score, band: bandFromScore(score), breakdown };
}

/** Tailwind text color class for a score band (semantic-friendly). */
export function bandColorClass(band: LeadScoreBand): string {
  switch (band) {
    case "Hot": return "text-emerald-400";
    case "Quente": return "text-amber-400";
    case "Morno": return "text-blue-400";
    default: return "text-muted-foreground";
  }
}
