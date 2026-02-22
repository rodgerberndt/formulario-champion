// Lead Scoring System - Champion
// Direct tier mapping based on monthly revenue (investimento_faixa)

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
  "De R$ 500 mil a R$ 750 mil": "Enterprise+",
  "De R$ 750 mil a R$ 1 milhão": "Enterprise+",
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
