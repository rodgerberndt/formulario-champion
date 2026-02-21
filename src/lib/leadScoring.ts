// Lead Scoring System - Champion
// Simple points-based scoring: Mercado + Estágio + Investimento

export const MERCADO_OPTIONS = [
  "Infoproduto",
  "E-commerce",
  "SaaS / Software",
  "Serviços / Consultoria",
  "Agência",
  "Dropshipping",
  "Afiliado",
  "Nutra / Encapsulado",
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

// Points mapping - Mercado (1 ponto cada, Nutra = 2 pontos)
const MERCADO_POINTS: Record<string, number> = {
  "Infoproduto": 1,
  "E-commerce": 1,
  "SaaS / Software": 1,
  "Serviços / Consultoria": 1,
  "Agência": 1,
  "Dropshipping": 1,
  "Afiliado": 1,
  "Nutra / Encapsulado": 2,
  "Outro": 1,
};

// Points mapping - Estágio (1-4 pontos)
const ESTAGIO_POINTS: Record<string, number> = {
  "Iniciando do zero": 1,
  "Validação (primeiras vendas)": 2,
  "Pré-escala (vendas constantes)": 3,
  "Escala (buscando otimização)": 4,
};

// Points mapping - Faturamento (1-6 pontos)
const INVESTIMENTO_POINTS: Record<string, number> = {
  "Não vendo ainda (R$0/mês)": 1,
  "Até R$ 5 mil": 1,
  "De R$ 5 mil a R$ 10 mil": 2,
  "De R$ 10 mil a R$ 20 mil": 2,
  "De R$ 20 mil a R$ 30 mil": 3,
  "De R$ 30 mil a R$ 50 mil": 3,
  "De R$ 50 mil a R$ 75 mil": 4,
  "De R$ 75 mil a R$ 100 mil": 4,
  "De R$ 100 mil a R$ 150 mil": 5,
  "De R$ 150 mil a R$ 200 mil": 5,
  "De R$ 200 mil a R$ 300 mil": 5,
  "De R$ 300 mil a R$ 500 mil": 5,
  "De R$ 500 mil a R$ 750 mil": 6,
  "De R$ 750 mil a R$ 1 milhão": 6,
  "De R$ 1 milhão a R$ 2 milhões": 6,
  "De R$ 2 milhões a R$ 3 milhões": 6,
  "De R$ 3 milhões a R$ 5 milhões": 6,
  "De R$ 5 milhões a R$ 10 milhões": 6,
  "Acima de R$ 10 milhões": 6,
};

// Tier thresholds
// Enterprise: > 12 pontos
// Large: 9-12 pontos
// Medium: 5-8 pontos
// Small: < 5 pontos

type TierType = "Small" | "Medium" | "Large" | "Enterprise";

function getTierFromScore(score: number): TierType {
  if (score > 12) return "Enterprise";
  if (score >= 9) return "Large";
  if (score >= 5) return "Medium";
  return "Small";
}

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
  dor_desejo?: string; // Not scored, just stored
}

export function calculateLeadScore(answers: QuizAnswers): LeadScoreResult {
  const mercadoPoints = MERCADO_POINTS[answers.mercado || ""] || 1;
  const estagioPoints = ESTAGIO_POINTS[answers.estagio_negocio || ""] || 0;
  const investimentoPoints = INVESTIMENTO_POINTS[answers.investimento_faixa || ""] || 1;

  const totalScore = mercadoPoints + estagioPoints + investimentoPoints;
  const tier = getTierFromScore(totalScore);

  return {
    score: totalScore,
    tier,
    tierLabel: tier,
    breakdown: {
      mercado: mercadoPoints,
      estagio: estagioPoints,
      investimento: investimentoPoints,
    },
  };
}
