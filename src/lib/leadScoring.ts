// Lead Scoring Configuration - Updated with new scoring rules

export interface LeadScoreResult {
  score: number;
  tier: "A" | "B" | "C";
  tierLabel: string;
}

interface QuizAnswers {
  faturamento_faixa?: string;
  trafego_faixa?: string;
  timing?: string;
  decisor?: string;
}

// Updated score ranges - Faturamento: +0 a +35
const faturamentoScores: Record<string, number> = {
  "Menos de R$ 10 mil/mês": 0,
  "R$ 10 mil a R$ 30 mil/mês": 10,
  "R$ 30 mil a R$ 100 mil/mês": 20,
  "R$ 100 mil a R$ 500 mil/mês": 30,
  "Mais de R$ 500 mil/mês": 35,
};

// Updated score ranges - Tráfego: +0 a +35
const trafegoScores: Record<string, number> = {
  "Ainda não invisto": 0,
  "Menos de R$ 5 mil/mês": 10,
  "R$ 5 mil a R$ 20 mil/mês": 20,
  "R$ 20 mil a R$ 50 mil/mês": 30,
  "Mais de R$ 50 mil/mês": 35,
};

// Updated score ranges - Timing: +0 a +25
const timingScores: Record<string, number> = {
  "Imediatamente": 25,
  "Até 3 meses": 15,
  "Até 6 meses": 5,
  "Ainda não sei": 0,
};

// Decisor: +15 if "Sim" or "Sou sócio"
const decisorScores: Record<string, number> = {
  "Sim": 15,
  "Sou sócio": 15,
  "Não": 0,
};

export function calculateLeadScore(answers: QuizAnswers): LeadScoreResult {
  let score = 0;

  // Faturamento: +0 a +35
  if (answers.faturamento_faixa) {
    score += faturamentoScores[answers.faturamento_faixa] || 0;
  }

  // Tráfego mensal: +0 a +35
  if (answers.trafego_faixa) {
    score += trafegoScores[answers.trafego_faixa] || 0;
  }

  // Timing: +0 a +25
  if (answers.timing) {
    score += timingScores[answers.timing] || 0;
  }

  // Decisor: +15 se sim ou sócio
  if (answers.decisor) {
    score += decisorScores[answers.decisor] || 0;
  }

  // Total 0–110, with Tier
  let tier: "A" | "B" | "C";
  let tierLabel: string;

  if (score >= 75) {
    tier = "A";
    tierLabel = "Qualificado para SDR + Closer";
  } else if (score >= 50) {
    tier = "B";
    tierLabel = "SDR / Nurture";
  } else {
    tier = "C";
    tierLabel = "Não qualificado agora";
  }

  return { score, tier, tierLabel };
}

// Options for quiz dropdowns
export const FATURAMENTO_OPTIONS = [
  "Menos de R$ 10 mil/mês",
  "R$ 10 mil a R$ 30 mil/mês",
  "R$ 30 mil a R$ 100 mil/mês",
  "R$ 100 mil a R$ 500 mil/mês",
  "Mais de R$ 500 mil/mês",
];

export const TRAFEGO_OPTIONS = [
  "Ainda não invisto",
  "Menos de R$ 5 mil/mês",
  "R$ 5 mil a R$ 20 mil/mês",
  "R$ 20 mil a R$ 50 mil/mês",
  "Mais de R$ 50 mil/mês",
];

export const TIMING_OPTIONS = [
  "Imediatamente",
  "Até 3 meses",
  "Até 6 meses",
  "Ainda não sei",
];

export const DECISOR_OPTIONS = [
  "Sim",
  "Sou sócio",
  "Não",
];

export const SEGMENTO_OPTIONS = [
  "Infoproduto",
  "E-commerce / Dropshipping",
  "SaaS / Software",
  "Serviços / Consultoria",
  "Agência",
  "Nutra / Encapsulado",
  "Outro",
];

// Updated gargalo options matching the problem section
export const GARGALO_OPTIONS = [
  "Criativos não passam da pré-escala",
  "Funil não converte como deveria",
  "Pessoas não entregam como deveriam",
  "Leads desqualificados",
  "Tráfego caro",
  "Oferta sem contexto",
];

// Keep original market options
export const MERCADOS = [
  "Infoproduto",
  "Nutra / encapsulado (Brasil)",
  "Afiliado gringa",
  "Dropshipping",
  "Ainda não vendo",
  "Outro",
];

// Keep original stage options
export const ESTAGIOS = ["Iniciando", "Validação", "Pré escala", "Escala"];
