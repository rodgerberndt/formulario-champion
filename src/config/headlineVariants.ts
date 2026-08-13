/**
 * Variantes de headline da landing (teste A/B/C/D/E).
 *
 * Cada variante é a MESMA página, mudando só o bloco de headline do Hero. A
 * variante é identificada pelo próprio path, que vira o `page` do tracking
 * (section_views, click_events, scroll_*) e o `first_page` da lead_session —
 * é isso que permite comparar funil, tempo de leitura e conversão de cada uma
 * separadamente no admin.
 *
 * Ao adicionar/remover variante aqui, atualizar também LANDING_PATHS em
 * supabase/functions/admin-data/index.ts.
 */
export interface HeadlineVariant {
  /** path da rota; "/" é a headline original */
  path: string;
  /** nome curto pro admin */
  label: string;
  /** trecho inicial, com o efeito shimmer */
  lead: string;
  /** trecho em destaque dourado (opcional) */
  highlight?: string;
  /** trecho depois do destaque (opcional) */
  tail?: string;
  /** linha menor abaixo da headline, pra depoimento (opcional) */
  attribution?: string;
}

export const HEADLINE_VARIANTS: HeadlineVariant[] = [
  {
    path: "/",
    label: "HD original",
    lead: "APLIQUE CRIATIVOS ANDRÔMEDA NA SUA OPERAÇÃO E TENHA ATÉ ",
    highlight: "3X MAIS LUCRO.",
  },
  {
    path: "/HD1",
    label: "HD1 · assertividade e CPA",
    lead: "Aumente a assertividade e abaixe o CPA dos seus criativos com a ",
    highlight: "Assessoria de criativos da Champion.",
  },
  {
    path: "/HD2",
    label: "HD2 · prejuízo no front",
    lead: "Como parar de ter prejuízo no front, usando o método Champion, e aumente até ",
    highlight: "3x o lucro da sua operação.",
    tail: " (Sem gastar tempo com criativos)",
  },
  {
    path: "/HD3",
    label: "HD3 · 3MI em 1 mês",
    lead: "Como a Champion gerou ",
    highlight: "+ de 3MI em faturamento",
    tail: " para nossos clientes em apenas 1 mês",
  },
  {
    path: "/HD4",
    label: "HD4 · depoimento",
    lead: '"Escalei absurdo? Não. Mas todos os criativos que vocês fizeram, ',
    highlight: 'venderam."',
    attribution:
      "Depoimento de um cliente que saiu do 0 a 100k no primeiro mês com a Assessoria de Criativos",
  },
];

/** Variantes de teste (todas menos a original) */
export const HEADLINE_TEST_VARIANTS = HEADLINE_VARIANTS.filter((v) => v.path !== "/");

export function getVariantByPath(path: string): HeadlineVariant {
  return HEADLINE_VARIANTS.find((v) => v.path === path) ?? HEADLINE_VARIANTS[0];
}
