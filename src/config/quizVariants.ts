/**
 * Teste A/B do quiz (Q1 a Q5).
 *
 * O teste de headline acabou e a HD4, o depoimento, venceu. A landing passa a
 * ser a mesma para todo mundo e a variável agora é o quiz.
 *
 * O que orienta as variantes é onde as pessoas desistem. Entre 21 e 31/08,
 * de 262 sessões que abriram o quiz:
 *
 *   48%  pararam na PRIMEIRA tela (o aviso de 10s + "Você quer vender mais?")
 *    9%  pararam na pergunta do mercado
 *   25%  concluíram
 *
 * Por isso três das cinco variantes mexem na primeira tela e só uma mexe no
 * mercado. Cada uma muda UMA coisa em relação ao controle — testar duas de
 * uma vez tornaria o resultado ilegível.
 *
 * A célula é sorteada no clique da landing e gravada em
 * `lead_sessions.quiz_variant`. Ao mexer aqui, conferir também as rotas em
 * App.tsx.
 */

import { getStoredUtm } from "@/hooks/useUtmCapture";

/**
 * Só o tráfego DESTAS campanhas entra no sorteio.
 *
 * Sem esta trava o teste rodava no site inteiro, e a primeira leitura de 31/08
 * mostrou o problema na prática: três sessões sorteadas, nenhuma da campanha do
 * teste — vieram do Case Ighor, de uma cópia da campanha de headlines e de um
 * acesso direto. Isso mistura populações que a gente não controla e enche as
 * células de gente que veio de outro criativo, outra oferta e outra landing.
 *
 * A comparação é por SUBSTRING e sem caixa: o `utm_campaign` chega do Meta pela
 * macro `{{campaign.name}}`, e o nome da campanha pode ganhar sufixo (" — Cópia"
 * é o que o Meta gruda ao duplicar) sem deixar de ser a mesma campanha.
 */
const CAMPANHAS_NO_TESTE = ["TESTE AB (Quiz)"];

/** O nome da campanha desta visita, já decodificado. */
function campanhaDaVisita(): string {
  try {
    const daUrl = new URLSearchParams(window.location.search).get("utm_campaign");
    const bruto = daUrl || getStoredUtm().utm_campaign || "";
    // Parte do tráfego chega com a query ainda codificada; sem decodificar, o
    // nome não bate com nada e a campanha do teste ficaria de fora dela mesma.
    return /%[0-9A-Fa-f]{2}/.test(bruto)
      ? decodeURIComponent(bruto.replace(/\+/g, " "))
      : bruto.replace(/\+/g, " ");
  } catch {
    return "";
  }
}

/** Esta visita participa do teste de quiz? */
export function visitaNoTeste(): boolean {
  const campanha = campanhaDaVisita().toLowerCase();
  if (!campanha) return false;
  return CAMPANHAS_NO_TESTE.some((c) => campanha.includes(c.toLowerCase()));
}

export interface QuizVariant {
  /** Path da rota. O controle é a própria /quiz. */
  path: string;
  /** Código curto; é o que grava na sessão e aparece no relatório. */
  codigo: string;
  label: string;
  /** O eixo que esta célula testa. Aparece no relatório, nunca na página. */
  eixo: string;
  /**
   * Se entra no sorteio agora. A Q2 nasce desligada de propósito: ela ataca
   * 9% do abandono, então tem teto baixo e leitura lenta, e rodar junto só
   * atrasaria as três que atacam os 48%. Entra na onda 2.
   */
  ativa: boolean;

  /** Título da tela de abertura. */
  introTitulo: string;
  /** Quando presente, o título é lido como depoimento (itálico + crédito). */
  introCredito?: string;
  /** Trecho do título que fica em dourado. */
  introDestaque?: string;
  /** O aviso abaixo do título. `curto` corta a segunda frase. */
  introAviso: "completo" | "curto";

  /** Pergunta de abertura. `null` remove o passo: o quiz abre no mercado. */
  perguntaEngajamento: string | null;
  /** Pergunta do mercado. Muda quando a de engajamento muda ou some. */
  perguntaMercado: string;
  /** Print do gerenciador acima da pergunta do mercado. */
  provaNoMercado: boolean;
}

/** Texto do controle, repetido nas células que não mexem naquele ponto. */
const ENGAJAMENTO_PADRAO = "Você quer vender mais?";
const MERCADO_PADRAO = "Se você quer vender mais, então qual o seu mercado hoje?";
/**
 * Sem a pergunta de engajamento antes dela, o "se você quer vender mais" fica
 * órfão: encadeia numa resposta que a pessoa nunca deu.
 */
const MERCADO_SOLTO = "Qual é o seu mercado hoje?";

export const QUIZ_VARIANTS: QuizVariant[] = [
  {
    path: "/quiz",
    codigo: "Q5",
    label: "Q5 · controle",
    eixo: "Nenhum — é a referência",
    ativa: true,
    introTitulo: "Atenção antes de continuar",
    introAviso: "completo",
    perguntaEngajamento: ENGAJAMENTO_PADRAO,
    perguntaMercado: MERCADO_PADRAO,
    provaNoMercado: false,
  },
  {
    path: "/quiz/q1",
    codigo: "Q1",
    label: "Q1 · prova na abertura",
    eixo: "O tom da abertura",
    ativa: true,
    // A headline vencedora da landing entra no lugar do "Atenção antes de
    // continuar". O aviso do digital continua embaixo, encurtado: ele filtra,
    // e tirá-lo junto mudaria duas coisas de uma vez.
    introTitulo: '"Escalei absurdo? Não. Mas todos os criativos que vocês fizeram, venderam."',
    introDestaque: 'venderam."',
    introCredito:
      "Depoimento de um cliente que saiu do 0 a 100k no primeiro mês com a Assessoria de Criativos",
    introAviso: "curto",
    perguntaEngajamento: ENGAJAMENTO_PADRAO,
    perguntaMercado: MERCADO_PADRAO,
    provaNoMercado: false,
  },
  {
    path: "/quiz/q2",
    codigo: "Q2",
    label: "Q2 · prova no mercado",
    eixo: "Prova no meio do preenchimento",
    ativa: false, // onda 2
    introTitulo: "Atenção antes de continuar",
    introAviso: "completo",
    perguntaEngajamento: ENGAJAMENTO_PADRAO,
    perguntaMercado: MERCADO_PADRAO,
    provaNoMercado: true,
  },
  {
    path: "/quiz/q3",
    codigo: "Q3",
    label: "Q3 · sem engajamento",
    eixo: "Existir ou não a pergunta de abertura",
    ativa: true,
    introTitulo: "Atenção antes de continuar",
    introAviso: "completo",
    perguntaEngajamento: null,
    perguntaMercado: MERCADO_SOLTO,
    provaNoMercado: false,
  },
  {
    path: "/quiz/q4",
    codigo: "Q4",
    label: "Q4 · engajamento novo",
    eixo: "A promessa da abertura",
    ativa: true,
    introTitulo: "Atenção antes de continuar",
    introAviso: "completo",
    // "Vender mais" é genérico e todo mundo responde sim no automático. Esta
    // fala do serviço que a Champion vende.
    perguntaEngajamento: "Você quer parar de perder tempo fazendo criativo?",
    perguntaMercado: MERCADO_SOLTO,
    provaNoMercado: false,
  },
];

export const QUIZ_CONTROLE = QUIZ_VARIANTS[0];

/** As células que estão no ar agora. */
export const QUIZ_VARIANTS_ATIVAS = QUIZ_VARIANTS.filter((v) => v.ativa);

export function getQuizVariantByPath(path: string): QuizVariant {
  const limpo = path.replace(/\/+$/, "").toLowerCase() || "/quiz";
  return QUIZ_VARIANTS.find((v) => v.path === limpo) ?? QUIZ_CONTROLE;
}

const CHAVE_SORTEIO = "champion_quiz_variant";

/**
 * Célula pedida na própria URL: `?q=q3` na landing ou no link do anúncio.
 *
 * Existe para dois usos. O primeiro é conferência: dá para abrir cada célula
 * de propósito e ver a tela, sem depender da sorte. O segundo é dirigir
 * tráfego — um anúncio pode mandar todo mundo para uma célula específica.
 *
 * Vale mais que o sorteio e mais que o que já estava guardado: link explícito
 * é ordem, não sugestão.
 */
function celulaPedidaNaUrl(): QuizVariant | null {
  if (typeof window === "undefined") return null;
  try {
    const pedido = new URLSearchParams(window.location.search).get("q");
    if (!pedido) return null;
    const alvo = pedido.trim().toLowerCase();
    return (
      QUIZ_VARIANTS.find(
        (v) => v.codigo.toLowerCase() === alvo || v.path === `/quiz/${alvo}`,
      ) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * A célula desta pessoa: a pedida na URL, ou uma sorteada e guardada.
 *
 * O sorteio precisa ser estável: quem sai da landing, volta e clica de novo
 * tem que cair na mesma versão, senão a sessão aparece em duas células e as
 * duas ficam sujas. Em navegador que bloqueia storage, cai no controle —
 * melhor concentrar o erro numa célula conhecida do que espalhá-lo por todas.
 */
export function sortearQuizVariant(): QuizVariant {
  // `?q=` continua valendo acima de tudo: é como se confere cada célula na mão
  // e como se dirige tráfego de propósito.
  const pedida = celulaPedidaNaUrl();
  if (pedida) {
    try {
      localStorage.setItem(CHAVE_SORTEIO, pedida.codigo);
    } catch {
      // segue na célula pedida mesmo sem conseguir guardar
    }
    return pedida;
  }

  // Fora das campanhas do teste, ninguém é sorteado: vê o quiz de sempre. Não
  // basta devolver o controle, é preciso NÃO gravar célula nenhuma, senão a
  // sessão entra na contagem do Q5 e infla o controle com gente que nunca
  // esteve no teste.
  if (!visitaNoTeste()) return QUIZ_CONTROLE;

  let guardado: string | null = null;
  try {
    guardado = localStorage.getItem(CHAVE_SORTEIO);
  } catch {
    return QUIZ_CONTROLE;
  }

  if (guardado) {
    const achado = QUIZ_VARIANTS.find((v) => v.codigo === guardado);
    // Célula desligada no meio do teste (fim de uma onda): a pessoa que já
    // tinha sido sorteada nela segue nela, para não perder o histórico dela.
    if (achado) return achado;
  }

  const pool = QUIZ_VARIANTS_ATIVAS.length > 0 ? QUIZ_VARIANTS_ATIVAS : [QUIZ_CONTROLE];
  const escolhida = pool[Math.floor(Math.random() * pool.length)];
  try {
    localStorage.setItem(CHAVE_SORTEIO, escolhida.codigo);
  } catch {
    // Sem storage o sorteio não gruda; segue mesmo assim nesta visita.
  }
  return escolhida;
}

/** Para onde os botões da landing devem levar. */
export function caminhoDoQuiz(): string {
  return sortearQuizVariant().path;
}
