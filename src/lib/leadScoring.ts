// Lead Scoring Configuration

export interface LeadScoreResult {
  score: number;
  tier: "A" | "B" | "C";
  tierLabel: string;
}

interface QuizAnswers {
  faturamento_faixa?: string;
  trafego_faixa?: string;
  timing?: string;
  decisor?: boolean;
  orcamento_faixa?: string;
}

// Score ranges for each field
const faturamentoScores: Record<string, number> = {
  "Menos de R$ 10 mil/mês": 0,
  "R$ 10 mil a R$ 30 mil/mês": 10,
  "R$ 30 mil a R$ 100 mil/mês": 20,
  "R$ 100 mil a R$ 500 mil/mês": 25,
  "Mais de R$ 500 mil/mês": 30,
};

const trafegoScores: Record<string, number> = {
  "Ainda não invisto": 0,
  "Menos de R$ 5 mil/mês": 10,
  "R$ 5 mil a R$ 20 mil/mês": 20,
  "R$ 20 mil a R$ 50 mil/mês": 25,
  "Mais de R$ 50 mil/mês": 30,
};

const timingScores: Record<string, number> = {
  "Imediato": 20,
  "Próximos 3 meses": 10,
  "Próximos 6 meses": 5,
  "Não sei ainda": 0,
};

const orcamentoScores: Record<string, number> = {
  "Menos de R$ 3 mil/mês": 0,
  "R$ 3 mil a R$ 10 mil/mês": 5,
  "R$ 10 mil a R$ 30 mil/mês": 10,
  "Mais de R$ 30 mil/mês": 15,
};

export function calculateLeadScore(answers: QuizAnswers): LeadScoreResult {
  let score = 0;

  // Faturamento: +0 a +30
  if (answers.faturamento_faixa) {
    score += faturamentoScores[answers.faturamento_faixa] || 0;
  }

  // Tráfego mensal: +0 a +30
  if (answers.trafego_faixa) {
    score += trafegoScores[answers.trafego_faixa] || 0;
  }

  // Timing: +0 a +20
  if (answers.timing) {
    score += timingScores[answers.timing] || 0;
  }

  // Decisor: +15 se sim
  if (answers.decisor === true) {
    score += 15;
  }

  // Orçamento: +0 a +15
  if (answers.orcamento_faixa) {
    score += orcamentoScores[answers.orcamento_faixa] || 0;
  }

  // Determine tier
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
  "Imediato",
  "Próximos 3 meses",
  "Próximos 6 meses",
  "Não sei ainda",
];

export const ORCAMENTO_OPTIONS = [
  "Menos de R$ 3 mil/mês",
  "R$ 3 mil a R$ 10 mil/mês",
  "R$ 10 mil a R$ 30 mil/mês",
  "Mais de R$ 30 mil/mês",
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

export const GARGALO_OPTIONS = [
  "Criativos que não performam",
  "Funil que não converte",
  "WhatsApp sem processo",
  "Reuniões que não fecham",
  "Falta de leads qualificados",
  "Escala travada",
  "Outro",
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
