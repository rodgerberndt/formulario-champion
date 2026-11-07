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

/**
 * Segmentos da página nichada em e-commerce (`/HD3`).
 *
 * Aqui não existe "Infoproduto", "SaaS" nem "Agência": a página inteira fala
 * com quem vende produto, e oferecer o resto é convidar o lead que a operação
 * não quer. Em troca, os dois mercados que sobram vêm abertos, porque
 * "Dropshipping" numa linha só empilha um drop nacional de R$ 80 mil e um COD
 * na LATAM, que não têm o mesmo criativo, a mesma margem nem o mesmo fit.
 *
 * O que NÃO está aqui, de propósito: white, gray e black. Isso é regime de
 * conta, não mercado — um drop nacional pode ser qualquer um dos três. Posto
 * lado a lado com "COD Brasil", quem marcasse "loja black" deixaria de dizer
 * de onde opera, e quem marcasse "COD Brasil" deixaria de dizer se aguenta a
 * política: duas perguntas perdidas de uma vez. Se esse dado for necessário,
 * ele é um segundo campo, curto, não uma opção desta lista.
 *
 * "Só marketplace" existe para FILTRAR: quem vende só dentro de ML/Shopee não
 * roda criativo em vídeo, e é melhor saber disso no formulário do que na call.
 *
 * Toda string nova aqui precisa de uma linha em PONTOS_MERCADO (leadScore.ts),
 * senão o lead cai nos 3 pontos de mercado desconhecido e perde ~22 pontos de
 * score sem ninguém perceber.
 */
export const MERCADO_OPTIONS_ECOMMERCE = [
  "E-commerce marca própria (estoque próprio)",
  "E-commerce nutra / suplemento (Brasil)",
  "E-commerce de nicho com estoque (moda, pet, casa, beleza)",
  "E-commerce gringa",
  "Drop nacional (fornecedor no Brasil)",
  "Drop global (fornecedor gringa)",
  "COD Brasil",
  "COD LATAM",
  "COD Europa / Oriente Médio",
  "Réplica",
  "Print on demand (POD)",
  "Só marketplace (ML, Shopee, Amazon)",
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
// Lead Score 0–100 — a Taxa de Qualificação
//
// A conta em si mudou de casa em 25/08/2026: mora em `leadScore.ts`, que é o
// mesmo arquivo usado pela edge function do painel. Antes existiam três contas
// diferentes (esta, a do backend e a coluna leads.score) e elas discordavam em
// mais de dez pontos no mesmo lead.
//
// O que fica aqui é só a casca antiga, para os quatro pontos do app que já
// importavam daqui não precisarem mudar. Código novo deve importar direto de
// `@/lib/leadScore`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  calcularNota,
  calcularNotaFormulario,
  calcularNotaPorVersao,
  faixaDaNota,
  corDaFaixa,
  type EntradaNota,
  type FaixaNota,
  type DetalheNota,
} from "./leadScore";

// O corte de HQL mora em `hql.ts` e é POR VERSÃO de score (73 no quiz, 67 no
// formulário curto). Reexportado aqui só para quem já importava desta casca —
// código novo importa de `@/lib/hql`.
export {
  ehHighQualityLead,
  limiarHql,
  ehScoreDeFormulario,
  LIMIARES_HQL,
  SCORE_VERSION_FORM,
  SCORE_VERSION_QUIZ,
} from "./hql";
export {
  calcularNotaFormulario,
  calcularNotaPorVersao,
  linhasDoBreakdown,
  faixaDaNotaPorVersao,
  type ResultadoNotaFormulario,
  type ResultadoNotaQualquer,
} from "./leadScore";

export type LeadScoreBand = FaixaNota;
export type LeadScoreBreakdown = DetalheNota;
export type LeadScoreInput = EntradaNota;

export interface LeadScore100Result {
  score: number;
  band: LeadScoreBand;
  breakdown: LeadScoreBreakdown;
  /** Motivos que limitaram a nota. Novo na v2.2. */
  flags: string[];
  version: string;
}

export function bandFromScore(score: number): LeadScoreBand {
  return faixaDaNota(score);
}

export function computeLeadScore100(input: LeadScoreInput): LeadScore100Result {
  const r = calcularNota(input);
  return { score: r.score, band: r.band, breakdown: r.breakdown, flags: r.flags, version: r.version };
}

/**
 * A nota do formulário curto (v3-form): só faturamento + mercado, 0–100.
 * O breakdown tem DUAS linhas — ver `calcularNotaFormulario`.
 */
export function computeLeadScoreFormulario(input: LeadScoreInput) {
  return calcularNotaFormulario(input);
}

/** Recalcula um lead já gravado na régua da versão dele. */
export function computeLeadScorePorVersao(input: LeadScoreInput, scoreVersion?: string | null) {
  return calcularNotaPorVersao(input, scoreVersion);
}

/** Classe de cor do Tailwind para a faixa da nota. */
export function bandColorClass(band: LeadScoreBand): string {
  return corDaFaixa(band);
}
