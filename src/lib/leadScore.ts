// ─────────────────────────────────────────────────────────────────────────────
// Taxa de Qualificação — a nota 0–100 de propensão a fechar ASSESSORIA
//
// Duas versões vivas, porque existem dois formulários vivos:
//   · v2.3     — o quiz de 14 passos (/quiz). Seis fatores, teto 100, corte 73.
//   · v3-form  — o formulário curto da landing (17/09/2026). Só faturamento e
//                mercado, renormalizado para 0–100, corte 67. Ver
//                `calcularNotaFormulario` no fim deste arquivo.
// O corte de cada uma mora em `hql.ts`, e NENHUM lugar do sistema pode ter o
// número escrito na mão.
//
// FONTE DA VERDADE. Este arquivo é copiado sem alteração para
// `supabase/functions/admin-data/leadScore.ts` (edge function não importa de
// src/) — com UMA exceção, a linha de `import` do `hql` logo abaixo, que no
// backend aponta para `../_shared/hql.ts`. Mudou aqui, copie lá — o painel e o
// quiz precisam dar a mesma nota,
// que é exatamente o que estava quebrado antes: existiam três contas
// diferentes (backend, leadScoring.ts e a coluna leads.score) e elas
// discordavam em mais de 10 pontos no mesmo lead.
//
// ── O que a nota mede ────────────────────────────────────────────────────────
// "O quanto aquele lead pode fechar com a gente quando a gente mandar uma
// mensagem pra ele" (Rodger, 25/08/2026). Propensão a FECHAR ASSESSORIA, não
// tamanho de operação e não propensão a marcar reunião — são coisas
// diferentes, e o quiz tem fatores que puxam forte para uma e nada para a
// outra ("criativos que aguentam escala" é o caso extremo: maior taxa de
// agendamento do quiz, 29% de conversão em venda contra 67% de "delegar").
//
// O Sprint tem perfil OPOSTO ao da Assessoria — 11 das 18 vendas de Sprint
// vieram de leads abaixo de R$ 10 mil, com a dor "criativos que não vendem",
// que nunca fechou uma assessoria. Por isso esta nota não serve para o Sprint,
// e de propósito: quem fatura menos de R$ 10 mil já é roteado para a página do
// Sprint pelo próprio quiz.
//
// ── Como os pesos foram calibrados ───────────────────────────────────────────
// Contra 2.150 leads de fev a ago/2026, cruzados com as vendas do Champion Hub
// (billing_model = recorrente é assessoria; tcv é Sprint/avulso) e as 17
// reuniões do painel. Universo real: 6 assessorias rastreáveis até o lead.
// AUC de assessoria: 0,959 na coorte com o quiz completo, contra 0,773 do
// algoritmo anterior. Amostra pequena — os pesos são para ser revisados quando
// o histórico do Kommo entrar no banco.
//
// ── O que saiu da conta, e por quê ───────────────────────────────────────────
// - LGPD (valia 3): `true` em 100% da base. Constante não ordena nada.
// - Estágio do negócio (valia 12): campo vazio em 100% dos leads.
// - Operações ativas (valia 6): o efeito sumiu ao controlar por faturamento.
// - Quer vender mais (valia 5): 98,5% respondem "sim". Virou desconto de 15.
// ─────────────────────────────────────────────────────────────────────────────

import {
  SCORE_VERSION_FORM,
  SCORE_VERSION_QUIZ,
  LIMIAR_HQL_FORM,
  ehScoreDeFormulario,
} from "./hql";

export {
  SCORE_VERSION_FORM,
  SCORE_VERSION_QUIZ,
  LIMIAR_HQL_FORM,
  LIMIAR_HQL_QUIZ,
  LIMIARES_HQL,
  ehScoreDeFormulario,
  limiarHql,
  ehHighQualityLead,
} from "./hql";

/** A versão do score do QUIZ. Mantido pelo nome antigo: é o que o quiz grava. */
export const SCORE_VERSION = SCORE_VERSION_QUIZ;

/** Faixas de faturamento, na ordem em que aparecem no quiz. */
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
] as const;

/**
 * Faturamento — 30 pontos, com pico entre R$ 50 mil e R$ 1 milhão.
 *
 * Antes saturava em 35 pontos a partir de R$ 100 mil: quem faturava R$ 500 mil
 * pontuava igual a quem faturava R$ 100 mil. Agora cada faixa vale mais que a
 * anterior até R$ 1 milhão, e cai acima disso.
 *
 * A queda no topo não é palpite. Acima de R$ 1 milhão são 49 leads, ZERO
 * assessoria fechada, e o único que chegou a agendar reunião não compareceu.
 * A taxa de no-show cresce com o porte — 0% entre R$ 50 e 100 mil, 33% entre
 * 100 e 300 mil, 67% entre 300 mil e 1 milhão, 100% acima disso. O lead grande
 * quer a call (a faixa de 300 mil a 1 milhão tem a MAIOR taxa de agendamento
 * de toda a base, 8,11%), ele só não consegue juntar o sócio nela.
 *
 * A queda começa em R$ 1 milhão e não antes porque o ticket compensa a
 * conversão menor: a receita por lead da faixa de 300 mil a 1 milhão é a maior
 * da base (R$ 811 contra R$ 611 de 50 a 100 mil).
 */
const PONTOS_FATURAMENTO: Record<string, number> = {
  "Não vendo ainda (R$0/mês)": 0,
  "Até R$ 5 mil": 3,
  "De R$ 5 mil a R$ 10 mil": 5,
  "De R$ 10 mil a R$ 20 mil": 8,
  "De R$ 20 mil a R$ 30 mil": 11,
  "De R$ 30 mil a R$ 50 mil": 14,
  "De R$ 50 mil a R$ 75 mil": 22,
  "De R$ 75 mil a R$ 100 mil": 26,
  "De R$ 100 mil a R$ 150 mil": 28,
  "De R$ 150 mil a R$ 200 mil": 29,
  "De R$ 200 mil a R$ 300 mil": 29,
  "De R$ 300 mil a R$ 500 mil": 30,
  "De R$ 500 mil a R$ 750 mil": 30,
  "De R$ 750 mil a R$ 1 milhão": 29,
  "De R$ 1 milhão a R$ 2 milhões": 18,
  "De R$ 2 milhões a R$ 3 milhões": 15,
  "De R$ 3 milhões a R$ 5 milhões": 13,
  "De R$ 5 milhões a R$ 10 milhões": 11,
  "Acima de R$ 10 milhões": 10,
  // Faixas do quiz antigo, que falava de investimento em tráfego e não de
  // faturamento. Convertidas pelo múltiplo de ~2,5x que já era usado no
  // mapeamento de tier.
  "R$ 0 – 2k": 3,
  "R$ 2k – 8k": 5,
  "R$ 8k – 20k": 8,
  "R$ 20k – 50k": 14,
  "R$ 50k – 100k": 26,
};

/** A faixa acima da qual o quiz pede confirmação do faturamento declarado. */
const FAIXAS_QUE_PEDEM_CONFIRMACAO = new Set([
  "De R$ 500 mil a R$ 750 mil",
  "De R$ 750 mil a R$ 1 milhão",
  "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões",
  "De R$ 3 milhões a R$ 5 milhões",
  "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
]);

/** Teto de pontos de faturamento para quem declara faixa alta mas admite que é projeção. */
const PONTOS_FATURAMENTO_PROJETADO = 28; // o mesmo de "R$ 100 mil a R$ 150 mil"

/**
 * Mercado — 25 pontos. Era 8, e com a tabela invertida.
 *
 * O código antigo tratava Infoproduto, SaaS, Serviços e Agência como o melhor
 * fit (8 pontos) e Dropshipping e Nutra gringa como fit médio (5). Os desfechos
 * dizem o contrário, e não por pouco: em 2.150 leads, Nutra gringa fechou
 * assessoria em 3,92% e Dropshipping em 2,15%, enquanto Serviços (195 leads),
 * SaaS (123) e Agência (109) somam 427 leads e nenhuma reunião sequer.
 *
 * Nutra Produtor BR é a única linha que anda contra o dado (0 em 53 leads).
 * Fica em 18 por decisão do Rodger em 25/08/2026, baseada na entrega — é o
 * primeiro item a revisitar quando houver mais casos.
 */
const PONTOS_MERCADO: Record<string, number> = {
  "Afiliado Nutra Gringa": 25,
  "Dropshipping": 25,
  "E-commerce": 22,
  "Nutra / Encapsulado Produtor": 18,
  "Nutra / Encapsulado": 18,
  "Infoproduto": 12,
  "Lowticket": 8,
  "Igaming": 8,
  "Afiliado BR": 4,
  "Afiliado": 4,
  "SaaS / Software": 3,
  "Serviços / Consultoria": 3,
  "Agência": 3,
  "Outro": 3,
  "X1 WhatsApp": 2,
  "Hot": 2,

  /*
   * Segmentos da página nichada em e-commerce (MERCADO_OPTIONS_ECOMMERCE).
   *
   * Estes pontos são HERDADOS, não medidos: cada linha recebe o valor do
   * mercado que ela desmembra — Dropshipping (25), E-commerce (22) e Nutra
   * Produtor (18). Nenhum deles tem desfecho próprio ainda, porque a lista
   * nasceu em 21/09/2026 e não existe lead fechado com ela.
   *
   * Herdar é o que mantém o score comparável com o histórico: um COD Brasil
   * pontua hoje o mesmo que um "Dropshipping" pontuava ontem, então a série de
   * MQL e de HQL73 não dá um degrau artificial no dia em que a lista muda.
   * Quando cada linha tiver desfecho próprio, aí sim ela se separa do pai —
   * e é aí que a abertura passa a valer alguma coisa.
   */
  "Drop nacional (fornecedor no Brasil)": 25,
  "Drop global (fornecedor gringa)": 25,
  "COD Brasil": 25,
  "COD LATAM": 25,
  "COD Europa / Oriente Médio": 25,
  "Réplica": 25,
  "E-commerce marca própria (estoque próprio)": 22,
  "E-commerce de nicho com estoque (moda, pet, casa, beleza)": 22,
  "E-commerce gringa": 22,
  "Print on demand (POD)": 22,
  "E-commerce nutra / suplemento (Brasil)": 18,
  // Marketplace puro não roda criativo em vídeo: é o descarte da lista e
  // pontua como "Outro".
  "Só marketplace (ML, Shopee, Amazon)": 3,
};
const PONTOS_MERCADO_DESCONHECIDO = 3;

/**
 * Dor / desejo — 15 pontos. Era 5, e contados por NÚMERO DE CARACTERES do
 * texto, o que fazia "Lead qualificado" (16 caracteres) valer 2 pontos e
 * "Otimizações com base em métricas" (32) valer 4. Puro ruído.
 *
 * Agora vale a dor em si. "Delegar para ganhar mais tempo" está em 4 das 6
 * assessorias e converte 6,06%; nenhuma outra opção da lista fechou uma
 * assessoria sequer. E "criativos que aguentam escala" caiu para 6 porque é o
 * perfil que marca reunião e não compra: 6 das 8 reuniões perdidas marcaram
 * essa dor, e ela converte 29% da reunião em venda contra 67% de "delegar".
 */
const PONTOS_DOR: Record<string, number> = {
  "Delegar para ganhar mais tempo": 15,
  "Criativos que aguentam escala": 6,
  "Reprovação de criativos": 4,
  "Criativos que não vendem": 4,
  "Otimizações com base em métricas": 3,
  "Lead qualificado": 2,
  "Falta de conhecimento": 2,
};
/** Quem escreve a própria dor com detalhe fecha 8,3%: melhor que metade da lista. */
const PONTOS_DOR_TEXTO_PROPRIO = 6;
const PONTOS_DOR_TEXTO_CURTO = 2;
/** Marcar tudo é indecisão: 0 assessoria em 43 leads que marcaram 3 ou mais. */
const PONTOS_DOR_MARCOU_TUDO = 2;

/** Compromisso no WhatsApp — 13 pontos. Ver `pontosCompromisso`. */
const PONTOS_COMPROMISSO = { sim: 13, talvez: 5, nao: 0, presumido: 13 };

/** Aceite da call de diagnóstico — 12 pontos. 13,8% dizem "não" e nenhum fechou. */
const PONTOS_ACEITA_CALL = 12;

/** Desconto de quem responde que não quer vender mais. Ver `calcularNota`. */
const PENALIDADE_NAO_QUER_VENDER = 15;

/** Entendimento do site — 5 pontos, só como piso. Ver `pontosEntendimento`. */
const PONTOS_NPS = { alto: 5, medio: 2, baixo: 0, ausente: 2 };

export type FaixaNota = "Frio" | "Morno" | "Quente" | "Hot";

export interface DetalheNota {
  faturamento: number;
  mercado: number;
  dor_desejo: number;
  compromisso_whatsapp: number;
  aceita_call: number;
  entendimento_site: number;
}

export interface ResultadoNota {
  score: number;
  band: FaixaNota;
  version: string;
  breakdown: DetalheNota;
  /** Motivos que limitaram a nota, para o comercial entender de onde ela veio. */
  flags: string[];
}

export interface EntradaNota {
  investimento_faixa?: string | null;
  mercado?: string | null;
  dor_desejo?: string | null;
  nps_score?: number | null;
  quer_vender_mais?: string | boolean | null;
  compromisso_whatsapp?: string | boolean | null;
  aceita_call_diagnostico?: string | boolean | null;
  /** Pergunta condicional para faixas acima de R$ 500 mil. */
  faturamento_confirmado?: string | null;
  raw_answers_json?: Record<string, unknown> | null;
}

/**
 * Conserta texto que foi gravado com a codificação trocada.
 *
 * 68 leads têm `ServiÃ§os / Consultoria` ou `AgÃªncia` no lugar do nome certo
 * do mercado, e a dor tem o mesmo problema. Como a pontuação casa texto
 * exato, esses leads caíam no balde "outro" e perdiam pontos por um bug de
 * gravação, não por mérito.
 */
export function corrigirTexto(v?: string | null): string {
  if (!v) return "";
  if (!/[ÃÂ]/.test(v)) return v;
  const trocas: Array<[RegExp, string]> = [
    [/Ã£/g, "ã"], [/Ã§/g, "ç"], [/Ãµ/g, "õ"], [/Ã©/g, "é"], [/Ãª/g, "ê"],
    [/Ã¡/g, "á"], [/Ã³/g, "ó"], [/Ã­/g, "í"], [/Ãº/g, "ú"], [/Ã¢/g, "â"],
    [/Ã´/g, "ô"], [/Ã /g, "à"], [/Ã‡/g, "Ç"], [/Ã‰/g, "É"], [/Ã•/g, "Õ"],
    [/Ã‡/g, "Ç"], [/Â/g, ""],
  ];
  return trocas.reduce((s, [de, para]) => s.replace(de, para), v);
}

/** "Sim", "sim", true → true. Qualquer outra coisa → false. */
function ehSim(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") return corrigirTexto(v).trim().toLowerCase() === "sim";
  return false;
}

/** "Não", "nao", "NÃ£o", false → true. */
function ehNao(v: unknown): boolean {
  if (v === false) return true;
  if (typeof v !== "string") return false;
  const t = corrigirTexto(v).trim().toLowerCase();
  return t === "não" || t === "nao";
}

export function pontosFaturamento(faixa?: string | null, confirmacao?: string | null): number {
  const f = corrigirTexto(faixa);
  const base = PONTOS_FATURAMENTO[f] ?? 0;
  // A confirmação só existe para as faixas altas. Quem admite que o número é
  // projeção e não caixa cai para a pontuação de R$ 100 a 150 mil: continua
  // sendo um lead bom, deixa de ser o melhor da fila com base numa expectativa.
  if (FAIXAS_QUE_PEDEM_CONFIRMACAO.has(f) && confirmacao === "espera") {
    return Math.min(base, PONTOS_FATURAMENTO_PROJETADO);
  }
  return base;
}

export function pontosMercado(mercado?: string | null): number {
  const m = corrigirTexto(mercado);
  if (!m) return 0;
  return PONTOS_MERCADO[m] ?? PONTOS_MERCADO_DESCONHECIDO;
}

export function pontosDor(texto?: string | null): number {
  const t = corrigirTexto(texto).trim();
  if (!t) return 0;
  const marcadas = Object.keys(PONTOS_DOR).filter((d) => t.includes(d));
  if (marcadas.length === 0) {
    // Não bateu com nenhuma opção da lista: o lead escreveu a própria dor.
    return t.length >= 25 ? PONTOS_DOR_TEXTO_PROPRIO : PONTOS_DOR_TEXTO_CURTO;
  }
  if (marcadas.length >= 3) return PONTOS_DOR_MARCOU_TUDO;
  const melhor = Math.max(...marcadas.map((d) => PONTOS_DOR[d]));
  // Duas dores ainda é foco, mas menos que uma: vale 60% da melhor.
  return marcadas.length === 2 ? Math.round(melhor * 0.6) : melhor;
}

/**
 * Compromisso no WhatsApp.
 *
 * Até 25/08/2026 esta pergunta NÃO EXISTIA: a tela de carregamento final do
 * quiz marcava `compromisso_whatsapp = true` sozinha, para 100% dos leads, e
 * ainda assim valia 10 pontos. Agora é uma pergunta de verdade, com três
 * respostas.
 *
 * `presumido` é o histórico: todo lead anterior à pergunta recebe o mesmo que
 * recebia antes. Sem isso, recalcular a base inteira derrubaria a nota de todo
 * mundo de uma vez e quebraria a comparação com o passado.
 */
export function pontosCompromisso(v: unknown): number {
  if (typeof v === "string") {
    const t = corrigirTexto(v).trim().toLowerCase();
    if (t === "talvez" || t.startsWith("talvez")) return PONTOS_COMPROMISSO.talvez;
    if (t === "não" || t === "nao") return PONTOS_COMPROMISSO.nao;
    if (t === "sim") return PONTOS_COMPROMISSO.sim;
  }
  if (v === false) return PONTOS_COMPROMISSO.nao;
  return PONTOS_COMPROMISSO.presumido;
}

/**
 * O lead respondeu a pergunta, ou herdou os pontos?
 *
 * O booleano `true` é a assinatura do preenchimento automático que existia até
 * 25/08/2026 — ninguém nunca respondeu isso. A pergunta de verdade grava
 * texto ("Sim" / "Talvez" / "Não"). A distinção importa na tela: sem ela o
 * comercial lê "Compromisso 13/13" e acha que o lead se comprometeu.
 */
export function compromissoFoiRespondido(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const t = corrigirTexto(v).trim().toLowerCase();
  return t === "sim" || t === "talvez" || t === "não" || t === "nao";
}

/**
 * Entendimento do site (o NPS de 0 a 10 no fim do quiz).
 *
 * Valia 30 pontos no front e 4 no backend, e não merece nem um nem outro: a
 * relação com fechamento não é crescente (quem responde 7 ou 8 converte mais
 * que quem responde 9 ou 10). O que o dado sustenta é só o piso — quem
 * responde de 0 a 3 converte três vezes menos. Vira piso, não escada.
 */
export function pontosEntendimento(nps?: number | null): number {
  if (nps === null || nps === undefined || Number.isNaN(nps)) return PONTOS_NPS.ausente;
  if (nps >= 7) return PONTOS_NPS.alto;
  if (nps >= 4) return PONTOS_NPS.medio;
  return PONTOS_NPS.baixo;
}

export function faixaDaNota(score: number): FaixaNota {
  if (score >= 70) return "Hot";
  if (score >= 50) return "Quente";
  if (score >= 30) return "Morno";
  return "Frio";
}

/**
 * A nota de 0 a 100 do lead.
 *
 * Duas travas antes da soma (a "camada porteiro"):
 *  - quem responde que NÃO quer vender mais está fora da fila, nota 0;
 *  - quem não vende ainda tem a nota limitada a 20, porque é público de
 *    Sprint e não de Assessoria, e o quiz já o roteia para lá.
 */
export function calcularNota(entrada: EntradaNota): ResultadoNota {
  const raw = (entrada.raw_answers_json && typeof entrada.raw_answers_json === "object")
    ? entrada.raw_answers_json as Record<string, unknown>
    : {};
  // O campo pode vir da coluna do lead ou de dentro do JSON das respostas,
  // conforme a época do quiz. A coluna manda quando as duas existem.
  const pegar = <T,>(coluna: T | null | undefined, chave: string): T | undefined => {
    if (coluna !== null && coluna !== undefined && (coluna as unknown) !== "") return coluna;
    const v = raw[chave];
    return v === undefined ? undefined : (v as T);
  };

  const faturamento = pegar(entrada.investimento_faixa, "investimento_faixa") as string | undefined;
  const mercado = pegar(entrada.mercado, "mercado") as string | undefined;
  const dor = pegar(entrada.dor_desejo, "dor_desejo") as string | undefined;
  const nps = pegar<number>(entrada.nps_score ?? null, "nps_score");
  const querVender = pegar(entrada.quer_vender_mais, "quer_vender_mais");
  const compromisso = pegar(entrada.compromisso_whatsapp, "compromisso_whatsapp");
  const aceitaCall = pegar(entrada.aceita_call_diagnostico, "aceita_call_diagnostico");
  const confirmacao = pegar(entrada.faturamento_confirmado, "faturamento_confirmado") as string | undefined;

  const flags: string[] = [];

  const breakdown: DetalheNota = {
    faturamento: pontosFaturamento(faturamento, confirmacao),
    mercado: pontosMercado(mercado),
    dor_desejo: pontosDor(dor),
    compromisso_whatsapp: pontosCompromisso(compromisso),
    aceita_call: ehSim(aceitaCall) ? PONTOS_ACEITA_CALL : 0,
    entendimento_site: pontosEntendimento(typeof nps === "number" ? nps : null),
  };

  let total = Object.values(breakdown).reduce((s, v) => s + v, 0);

  // "Não quero vender mais" desconta, não zera.
  //
  // Até 28/08/2026 esta resposta zerava a nota inteira, e estava errado. São 21
  // leads em 2.168 que responderam "não", e entre eles havia gente como um
  // Nutra gringa de R$ 500 a 750 mil que aceitou a call e pediu para delegar:
  // nota 97 virando zero por um clique na primeira pergunta do quiz, que é
  // retórica e tem dois botões grandes.
  //
  // O argumento a favor do zero era que nenhum deles fechou. Só que são 5 MQL
  // em cinco meses, e na taxa de conversão da casa o esperado nesse volume é
  // ZERO venda mesmo que a resposta não signifique nada. O dado não sustentava
  // a regra; sustenta um desconto.
  if (ehNao(querVender)) {
    flags.push("Respondeu que NÃO quer vender mais");
    total -= PENALIDADE_NAO_QUER_VENDER;
  }

  if (corrigirTexto(faturamento) === "Não vendo ainda (R$0/mês)" && total > 20) {
    flags.push("Público de Sprint, não de Assessoria");
    total = 20;
  }
  if (confirmacao === "espera") flags.push("Faturamento declarado é projeção, não caixa");
  if (!compromissoFoiRespondido(compromisso)) flags.push("Compromisso no WhatsApp presumido (lead anterior à pergunta)");
  if (ehNao(aceitaCall)) flags.push("Recusou a call de diagnóstico");

  const score = Math.max(0, Math.min(100, Math.round(total)));
  return { score, band: faixaDaNota(score), version: SCORE_VERSION, breakdown, flags };
}

// ─────────────────────────────────────────────────────────────────────────────
// v3-form — a nota do FORMULÁRIO CURTO da landing (17/09/2026)
//
// O formulário pergunta seis coisas e só duas delas pontuam: faixa de
// faturamento e mercado. Rodar a v2.3 nele dava um teto de 70 (55 do que ele
// respondeu + 13 de "compromisso presumido" + 2 de "NPS ausente"), o que
// deixava o corte de 73 inalcançável e apagava o HQL da base nova.
//
// A conta nova não inventa fator nenhum: é a MESMA tabela de pontos de
// faturamento (0–30) e de mercado (0–25) da v2.3, dividida pelo máximo
// possível (55) e multiplicada por 100. Quem faz 55 de 55 tira 100. O corte de
// lead bom é 67, o que equivale a 37 dos 55 pontos brutos.
//
// O que NÃO entra, e é o ponto inteiro desta versão: dor, compromisso no
// WhatsApp, aceite da call e NPS. Eles não são zero — eles não existem neste
// lead, e dar ponto (ou tirar) por pergunta não feita é fabricar nota. Por
// isso o breakdown tem duas linhas e a flag de "compromisso presumido" não
// aparece aqui.
// ─────────────────────────────────────────────────────────────────────────────

/** Soma máxima das duas perguntas que pontuam: 30 de faturamento + 25 de mercado. */
export const MAX_PONTOS_FORMULARIO = 55;

export interface DetalheNotaFormulario {
  faturamento: number;
  mercado: number;
}

export interface ResultadoNotaFormulario {
  score: number;
  band: FaixaNota;
  version: string;
  breakdown: DetalheNotaFormulario;
  flags: string[];
}

export type ResultadoNotaQualquer = ResultadoNota | ResultadoNotaFormulario;

/**
 * A faixa (Frio/Morno/Quente/Hot) na régua da versão.
 *
 * A v2.3 fica exatamente como estava — mexer nela mudaria a cor de leads
 * antigos sem que nada tenha acontecido com eles. No formulário, "Hot" começa
 * no próprio corte de HQL: um badge verde que não bate com o corte da Meta é
 * a mesma mentira que este trabalho inteiro veio consertar.
 */
export function faixaDaNotaPorVersao(score: number, scoreVersion?: string | null): FaixaNota {
  if (!ehScoreDeFormulario(scoreVersion)) return faixaDaNota(score);
  if (score >= LIMIAR_HQL_FORM) return "Hot";
  if (score >= 50) return "Quente";
  if (score >= 30) return "Morno";
  return "Frio";
}

/** A nota 0–100 de um lead que veio pelo formulário curto. */
export function calcularNotaFormulario(entrada: EntradaNota): ResultadoNotaFormulario {
  const raw = (entrada.raw_answers_json && typeof entrada.raw_answers_json === "object")
    ? entrada.raw_answers_json as Record<string, unknown>
    : {};
  const pegar = <T,>(coluna: T | null | undefined, chave: string): T | undefined => {
    if (coluna !== null && coluna !== undefined && (coluna as unknown) !== "") return coluna;
    const v = raw[chave];
    return v === undefined ? undefined : (v as T);
  };

  const faturamento = pegar(entrada.investimento_faixa, "investimento_faixa") as string | undefined;
  const mercado = pegar(entrada.mercado, "mercado") as string | undefined;

  const flags: string[] = [];
  const breakdown: DetalheNotaFormulario = {
    faturamento: pontosFaturamento(faturamento),
    mercado: pontosMercado(mercado),
  };

  const bruto = breakdown.faturamento + breakdown.mercado;
  let total = Math.round((bruto / MAX_PONTOS_FORMULARIO) * 100);

  // Mesma camada porteiro da v2.3: quem não vende ainda é público de Sprint, e
  // o teto dele é 20. Sem isso, um "não vendo ainda" de Dropshipping tiraria 45
  // só pelo mercado. Não muda quem é HQL (45 e 20 estão os dois abaixo de 67),
  // muda o que o comercial lê na fila.
  if (corrigirTexto(faturamento) === "Não vendo ainda (R$0/mês)" && total > 20) {
    flags.push("Público de Sprint, não de Assessoria");
    total = 20;
  }
  if (!corrigirTexto(mercado)) flags.push("Mercado não informado");

  const score = Math.max(0, Math.min(100, total));
  return {
    score,
    band: faixaDaNotaPorVersao(score, SCORE_VERSION_FORM),
    version: SCORE_VERSION_FORM,
    breakdown,
    flags,
  };
}

/**
 * Recalcula a nota de um lead JÁ GRAVADO, na régua da versão dele.
 *
 * Usado pelo painel (modal do lead e média por criativo). Recalcular um lead
 * de formulário com a v2.3 devolveria uma nota que a Meta nunca viu.
 */
export function calcularNotaPorVersao(
  entrada: EntradaNota,
  scoreVersion?: string | null,
): ResultadoNotaQualquer {
  return ehScoreDeFormulario(scoreVersion) ? calcularNotaFormulario(entrada) : calcularNota(entrada);
}

export function ehResultadoDeFormulario(r: ResultadoNotaQualquer): r is ResultadoNotaFormulario {
  return ehScoreDeFormulario(r.version);
}

/**
 * As linhas do breakdown para a tela, na régua da versão.
 *
 * Existe para o painel não ter duas listas de rótulos escritas na mão (a aba
 * Leads e a aba Relatórios tinham a mesma lista duplicada, e a do formulário
 * mostraria "Dor/desejo: 0/15" para uma pergunta que nunca foi feita).
 */
export function linhasDoBreakdown(
  r: ResultadoNotaQualquer,
): Array<{ rotulo: string; valor: number; max: number }> {
  // Sem narrowing por type guard de propósito: o breakdown da v2.3 tem TODAS
  // as chaves do breakdown do formulário, então para o TypeScript um é subtipo
  // estrutural do outro e a narrow deixaria o outro ramo como `never`. Quem
  // decide aqui é a versão, que é o mesmo critério do resto do sistema.
  const b = r.breakdown as Partial<DetalheNota> & DetalheNotaFormulario;
  const linhas = [
    { rotulo: "Faturamento", valor: b.faturamento, max: 30 },
    { rotulo: "Mercado", valor: b.mercado, max: 25 },
  ];
  if (ehScoreDeFormulario(r.version)) return linhas;
  return [
    ...linhas,
    { rotulo: "Dor/desejo", valor: b.dor_desejo ?? 0, max: 15 },
    { rotulo: "Compromisso WA", valor: b.compromisso_whatsapp ?? 0, max: 13 },
    { rotulo: "Aceita call", valor: b.aceita_call ?? 0, max: 12 },
    { rotulo: "Entendimento do site", valor: b.entendimento_site ?? 0, max: 5 },
  ];
}

/** Classe de cor da faixa, para o painel. */
export function corDaFaixa(band: FaixaNota): string {
  switch (band) {
    case "Hot": return "text-emerald-400";
    case "Quente": return "text-amber-400";
    case "Morno": return "text-blue-400";
    default: return "text-muted-foreground";
  }
}
