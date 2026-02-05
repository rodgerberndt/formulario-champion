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
  "R$ 0 – 2k",
  "R$ 2k – 8k",
  "R$ 8k – 20k",
  "R$ 20k – 50k",
  "R$ 50k – 100k",
  "R$ 100k+",
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

// Points mapping - Investimento (1-6 pontos)
const INVESTIMENTO_POINTS: Record<string, number> = {
  "R$ 0 – 2k": 1,
  "R$ 2k – 8k": 2,
  "R$ 8k – 20k": 3,
  "R$ 20k – 50k": 4,
  "R$ 50k – 100k": 5,
  "R$ 100k+": 6,
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
  const estagioPoints = ESTAGIO_POINTS[answers.estagio_negocio || ""] || 1;
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
