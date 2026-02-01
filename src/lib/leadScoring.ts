// Lead Scoring Configuration - Simplified for new quiz structure
// Score is calculated in background (not shown to user)

export interface LeadScoreResult {
  score: number;
  tier: "A" | "B" | "C";
  tierLabel: string;
}

interface QuizAnswers {
  mercado?: string;
  estagio_negocio?: string;
}

// Simple scoring based on business stage
const estagioScores: Record<string, number> = {
  "Iniciando do zero": 10,
  "Validação (primeiras vendas)": 30,
  "Pré-escala (vendas consistentes)": 50,
  "Escala (buscando otimização)": 70,
};

export function calculateLeadScore(answers: QuizAnswers): LeadScoreResult {
  let score = 0;

  // Estágio do negócio scoring
  if (answers.estagio_negocio) {
    score += estagioScores[answers.estagio_negocio] || 30;
  }

  // Total 0–100, with Tier (calculated silently)
  let tier: "A" | "B" | "C";
  let tierLabel: string;

  if (score >= 50) {
    tier = "A";
    tierLabel = "Qualificado";
  } else if (score >= 30) {
    tier = "B";
    tierLabel = "Potencial";
  } else {
    tier = "C";
    tierLabel = "Iniciante";
  }

  return { score, tier, tierLabel };
}

// Options for quiz dropdowns
export const MERCADO_OPTIONS = [
  "Infoproduto",
  "E-commerce",
  "SaaS / Software",
  "Serviços / Consultoria",
  "Agência",
  "Nutra / Encapsulado",
  "Dropshipping",
  "Afiliado",
  "Outro",
];

export const ESTAGIO_OPTIONS = [
  "Iniciando do zero",
  "Validação (primeiras vendas)",
  "Pré-escala (vendas consistentes)",
  "Escala (buscando otimização)",
];
