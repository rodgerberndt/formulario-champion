/**
 * REVERTIDO EM 02/09/2026. Em 31/08 a SH0 virou padrão de todas as páginas e
 * todas as variantes ficaram sem subheadline; no dia seguinte o Rodger pediu o
 * estado anterior de volta, com cada página servindo a sua própria variante.
 * As campanhas já tinham sido reapontadas por ele, então o teste voltou a
 * existir na conta e as páginas precisavam voltar a diferir.
 *
 * A leitura que levou à SH0 continua válida e está registrada abaixo; o que
 * mudou foi a decisão de encerrar o teste, não o dado.
 *
 * O que decidiu, na cascata de 19 a 31/08 (SH0 contra SH5, as duas finalistas):
 *
 *              gasto   MQL  R$/MQL  reunião  R$/reunião
 *   SH0       R$ 561     5   R$ 112       3      R$ 187
 *   SH5       R$ 708     7   R$ 101       1      R$ 708
 *
 * A SH5 puxava o dobro de gente para o quiz (8,8% contra 4,1%) e ganhava por
 * pouco em custo por MQL. A SH0 ganhava por MUITO no degrau seguinte: 60% dos
 * MQL dela agendaram reunião, contra 14% da SH5, e as reuniões eram de faixa
 * maior. Nenhuma das duas gerou venda, então a decisão parou no melhor degrau
 * disponível: custo por reunião, onde a SH0 é quase 4x melhor.
 *
 * Os textos continuam abaixo de propósito: são o registro do que foi testado, e
 * o mecanismo (`kind` text/video) segue de pé para o próximo teste.
 *
 * ── histórico ──────────────────────────────────────────────────────────────
 * Teste de subheadline (SH0 a SH5).
 *
 * A headline é a MESMA em todas: a HD3, vencedora do teste anterior — 5 MQL,
 * 3 reuniões, as 3 únicas realizadas e a única venda da semana de 14 a 20/08.
 * Só o bloco abaixo dela muda. Testar headline e subheadline na mesma rodada
 * mudaria duas variáveis e nenhum resultado seria legível.
 *
 * Cada variante representa um EIXO diferente de argumento, nunca a mesma
 * promessa reescrita:
 *   SH0  ausência    — a headline se sustenta sozinha?
 *   SH1  prova social (texto)
 *   SH2  facilidade + número novo
 *   SH3  longevidade / anti-clonagem
 *   SH4  prova social ao vivo (vídeo)
 *   SH5  atalho / velocidade
 *
 * Copy do João Oton (20/08/2026), com correção apenas de digitação e
 * pontuação — o conteúdo é dele, palavra por palavra.
 *
 * Ao adicionar/remover variante aqui, atualizar LANDING_PATHS em
 * supabase/functions/admin-data/index.ts, que é o que autoriza o filtro por
 * página no admin.
 */
/**
 * O texto que era a subheadline padrão até 31/08/2026.
 *
 * NÃO É MAIS RENDERIZADO. Fica aqui como registro do que foi testado, e porque
 * ele é o controle do teste (SH6). Se um dia a decisão for revista, é este o
 * texto que estava no ar antes.
 */
export const DEFAULT_SUBHEADLINE =
  "A assessoria de criativos da Champion já ajudou centenas de operações do mercado digital, seja de infoprodutos, nutracêuticos, X1 do WhatsApp, mercado na gringa ou no Brasil, a escalar em múltiplos 6, 7 e até 8 dígitos.";

export interface SubheadlineVariant {
  /** path da rota; vira o `page` de todo evento de tracking */
  path: string;
  /** nome curto pro admin */
  label: string;
  /** o que aparece abaixo da headline */
  kind: "none" | "text" | "video";
  text?: string;
  /** linha menor de crédito, para depoimento */
  attribution?: string;
  /**
   * Player Vturb (mesmo do carrossel de criativos da página). É o caminho de
   * produção: carrega sob demanda, dá autoplay e não estampa marca de terceiro.
   */
  vturbPlayerId?: string;
  /** Proporção do player; depoimento gravado no celular costuma ser 9/16. */
  videoAspect?: string;
  /** URL de embed genérica (iframe). Só para prévia — ver nota na SH4. */
  videoUrl?: string;
  /** o eixo que esta variante testa — aparece no relatório, não na página */
  axis: string;
}

export const SUBHEADLINE_VARIANTS: SubheadlineVariant[] = [
  {
    path: "/SH0",
    label: "SH0 · sem subheadline",
    kind: "none",
    axis: "Ausência — a headline se sustenta sozinha",
  },
  {
    path: "/SH1",
    label: "SH1 · depoimento",
    kind: "text",
    text: '"Escalei absurdo? Não. Mas todos os criativos que vocês fizeram, venderam."',
    attribution:
      "Depoimento de um cliente que saiu do 0 a 100k no primeiro mês com a Assessoria de Criativos",
    axis: "Prova social em texto",
  },
  {
    path: "/SH2",
    label: "SH2 · ROI 3.75",
    kind: "text",
    text:
      'Como escalar qualquer criativo "medíocre" com um ROI de 3.75 no front, mesmo que você não saiba absolutamente nada de copy e edição.',
    axis: "Facilidade + número novo",
  },
  {
    path: "/SH3",
    label: "SH3 · anti-clonagem",
    kind: "text",
    text:
      "Os “criativos champion” são a maneira mais rápida de triplicar o lucro da sua oferta, e o mesmo método aumenta o tempo em que seu criativo campeão escala, sem ser clonado na biblioteca.",
    axis: "Longevidade / anti-clonagem",
  },
  {
    path: "/SH4",
    label: "SH4 · depoimento em vídeo",
    kind: "video",
    // Player próprio, na mesma conta Vturb do carrossel de criativos da página.
    // Entrou no lugar do embed do Google Drive, que não é player de página de
    // vendas: sem autoplay, mais lento e com a marca do Google por cima do
    // depoimento. O vídeo é vertical (o embed do Vturb vem com padding de
    // 177,7%, que é 9/16).
    vturbPlayerId: "6a889eb7520612deff162bf5",
    videoAspect: "9 / 16",
    attribution: "Depoimento de cliente da Assessoria de Criativos",
    axis: "Prova social ao vivo (vídeo)",
  },
  {
    path: "/SH5",
    label: "SH5 · atalho",
    kind: "text",
    text:
      "Os “criativos champion” são a maneira mais rápida de triplicar o lucro da sua oferta, sem precisar perder tempo produzindo e editando criativos.",
    axis: "Atalho / velocidade",
  },
  {
    path: "/SH6",
    label: "SH6 · subheadline original",
    kind: "text",
    text: DEFAULT_SUBHEADLINE,
    axis: "Controle — a subheadline que já estava no ar",
  },
];

export function getSubheadlineByPath(path: string): SubheadlineVariant | undefined {
  return SUBHEADLINE_VARIANTS.find((v) => v.path === path);
}

/**
 * Como uma página de entrada deve ser lida no admin.
 *
 * O visitante entra sempre por UMA página, mas o que ela representa depende do
 * teste em andamento: em /HDx o que varia é a headline; em /SHx a headline é
 * fixa (a HD3, vencedora) e o que varia é a subheadline. Chamar as duas de
 * "headline" faria a leitura do teste novo apontar para a variável errada.
 */
export function entryPageMeaning(path: string | null | undefined): {
  role: "headline" | "subheadline" | "desconhecida";
  label: string;
  /** Contexto que não muda dentro do teste, mostrado em letra menor. */
  fixedPart?: string;
} {
  if (!path) return { role: "desconhecida", label: "Não identificada" };
  const sub = SUBHEADLINE_VARIANTS.find((v) => v.path === path);
  if (sub) {
    return {
      role: "subheadline",
      label: sub.label,
      fixedPart: "headline HD3 · 3MI em 1 mês",
    };
  }
  return { role: "headline", label: path };
}

/**
 * Rótulo curto da variante para caber numa coluna de tabela.
 *
 * A raiz e as páginas de headline não fazem parte do teste em andamento, mas
 * precisam aparecer com nome próprio: um lead que entrou na raiz NÃO viu a
 * mesma página de quem entrou numa /SHx (a raiz tem a headline original, as
 * /SHx têm a HD3), e tratar os dois como "sem variante" esconde exatamente a
 * diferença que o teste está medindo.
 */
export function variantShortLabel(path: string | null | undefined): {
  short: string;
  full: string;
  inTest: boolean;
} {
  if (!path) return { short: "—", full: "Página de entrada não identificada", inTest: false };
  const sub = SUBHEADLINE_VARIANTS.find((v) => v.path === path);
  if (sub) {
    return {
      short: sub.path.replace("/", ""),
      full: `${sub.label} · ${sub.axis}`,
      inTest: true,
    };
  }
  if (path === "/") return { short: "raiz", full: "Raiz — headline original, fora do teste", inTest: false };
  return { short: path.replace("/", ""), full: `Página ${path} — fora do teste de subheadline`, inTest: false };
}
