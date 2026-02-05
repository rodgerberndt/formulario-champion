// Lead Scoring Configuration - Matriz Fase x Investimento
// Tiers: Small, Medium, Large, Enterprise, Desqualificado

export interface LeadScoreResult {
  score: number;
  tier: "Small" | "Medium" | "Large" | "Enterprise" | "Desqualificado";
  tierLabel: string;
  spendLevel: string;
  phaseLevel: string;
}

interface QuizAnswers {
  mercado?: string;
  estagio_negocio?: string;
  investimento_faixa?: string;
  dor_desejo?: string;
}

// Faixas de investimento em anúncios (S0-S5)
export const INVESTIMENTO_OPTIONS = [
  "R$ 0 – R$ 2.000",
  "R$ 2.000 – R$ 8.000",
  "R$ 8.000 – R$ 20.000",
  "R$ 20.000 – R$ 50.000",
  "R$ 50.000 – R$ 100.000",
  "Acima de R$ 100.000",
];

// Mapeamento de investimento para spend level
const investimentoToSpendLevel: Record<string, number> = {
  "R$ 0 – R$ 2.000": 0,         // S0
  "R$ 2.000 – R$ 8.000": 1,     // S1
  "R$ 8.000 – R$ 20.000": 2,    // S2
  "R$ 20.000 – R$ 50.000": 3,   // S3
  "R$ 50.000 – R$ 100.000": 4,  // S4
  "Acima de R$ 100.000": 5,     // S5
};

// Mapeamento de estágio para phase level
const estagioToPhaseLevel: Record<string, number> = {
  "Iniciando do zero": 0,           // F0
  "Validação (primeiras vendas)": 1, // F1
  "Pré-escala (vendas consistentes)": 2, // F2
  "Escala (buscando otimização)": 3, // F3
};

// Matriz de classificação: [Phase][Spend] => Tier
type TierType = "Small" | "Medium" | "Large" | "Enterprise";
const classificationMatrix: Record<number, Record<number, TierType>> = {
  // F0: Iniciando do zero
  0: {
    0: "Small",      // S0
    1: "Small",      // S1
    2: "Medium",     // S2 (raro, mas capital pronto)
    3: "Large",      // S3 (desorganizado/oportunidade)
    4: "Large",      // S4
    5: "Large",      // S5
  },
  // F1: Validação
  1: {
    0: "Small",      // S0
    1: "Small",      // S1
    2: "Medium",     // S2
    3: "Large",      // S3
    4: "Large",      // S4
    5: "Large",      // S5
  },
  // F2: Pré-escala
  2: {
    0: "Small",      // S0
    1: "Small",      // S1
    2: "Medium",     // S2
    3: "Large",      // S3
    4: "Enterprise", // S4
    5: "Enterprise", // S5
  },
  // F3: Escala
  3: {
    0: "Medium",     // S0 (escala sem spend = orgânico + começando)
    1: "Medium",     // S1
    2: "Large",      // S2
    3: "Enterprise", // S3
    4: "Enterprise", // S4
    5: "Enterprise", // S5
  },
};

// Palavras-chave de desqualificação
const DESQUALIFICACAO_KEYWORDS = [
  "só quero aprender",
  "consultoria grátis",
  "só curiosidade",
  "talvez algum dia",
  "garantia de roi",
  "garantia de retorno",
  "não tenho dinheiro",
  "sem verba",
  "não tenho verba",
];

function checkDesqualificacao(answers: QuizAnswers): boolean {
  const dorDesejo = answers.dor_desejo?.toLowerCase() || "";
  
  // Verifica palavras-chave de desqualificação
  for (const keyword of DESQUALIFICACAO_KEYWORDS) {
    if (dorDesejo.includes(keyword)) {
      return true;
    }
  }
  
  // Desqualifica se F0/F1 com R$ 0 (sem verba e sem plano)
  const phase = estagioToPhaseLevel[answers.estagio_negocio || ""] ?? 0;
  const spend = investimentoToSpendLevel[answers.investimento_faixa || ""] ?? 0;
  
  if ((phase === 0 || phase === 1) && spend === 0) {
    // Poderia checar se tem plano de começar, mas por padrão não desqualifica aqui
    // Apenas marca como Small
  }
  
  return false;
}

export function calculateLeadScore(answers: QuizAnswers): LeadScoreResult {
  // Verifica desqualificação primeiro
  if (checkDesqualificacao(answers)) {
    return {
      score: 0,
      tier: "Desqualificado",
      tierLabel: "Desqualificado",
      spendLevel: "S0",
      phaseLevel: "F0",
    };
  }
  
  const phase = estagioToPhaseLevel[answers.estagio_negocio || ""] ?? 0;
  const spend = investimentoToSpendLevel[answers.investimento_faixa || ""] ?? 0;
  
  // Busca tier na matriz
  const tier = classificationMatrix[phase]?.[spend] || "Small";
  
  // Calcula score numérico (para ordenação/priorização)
  // Score base por tier + ajustes por fase e spend
  const tierScores: Record<TierType, number> = {
    "Small": 20,
    "Medium": 40,
    "Large": 70,
    "Enterprise": 100,
  };
  
  let score = tierScores[tier];
  
  // Ajustes finos baseados em fase e spend
  score += phase * 5;   // +0-15 por fase
  score += spend * 3;   // +0-15 por spend level
  
  // Cap em 100
  score = Math.min(score, 100);
  
  // Labels descritivos
  const tierLabels: Record<string, string> = {
    "Small": "Small",
    "Medium": "Medium",
    "Large": "Large",
    "Enterprise": "Enterprise",
    "Desqualificado": "Desqualificado",
  };
  
  const spendLabels = ["S0", "S1", "S2", "S3", "S4", "S5"];
  const phaseLabels = ["F0", "F1", "F2", "F3"];
  
  return {
    score,
    tier,
    tierLabel: tierLabels[tier],
    spendLevel: spendLabels[spend] || "S0",
    phaseLevel: phaseLabels[phase] || "F0",
  };
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
