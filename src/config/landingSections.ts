/**
 * Seções da landing na ordem da página.
 *
 * Fonte única para todo lugar do admin que mostra a estrutura da página: o
 * funil por seção (Métricas Funil), o mapa de atenção e a jornada individual do
 * lead. Antes cada tela carregava sua própria lista e elas divergiam — uma
 * mostrava seção que a outra não conhecia, e a ordem saía diferente.
 *
 * A ordem vem daqui, do código, e NÃO do `section_order` gravado no banco:
 * dados antigos carregam a numeração de versões anteriores da landing e
 * embaralham o funil. Espelha LANDING_SECTIONS em
 * supabase/functions/admin-data/index.ts e a ordem real de src/pages/Index.tsx.
 */
export interface LandingSection {
  id: string;
  order: number;
  label: string;
}

/**
 * A ordem é a de src/pages/Index.tsx, e cada `order` é ÚNICO.
 *
 * Até 17/09/2026 `social_proof` e `success_cases` tinham os dois o order 20. A
 * ordenação do funil por seção é feita por esse número, e com empate o
 * desempate virava a ordem de inserção do Map — que muda conforme quais seções
 * o período tem. Duas aberturas da mesma tela podiam listar as seções em ordens
 * diferentes. `social_proof` saiu da página (não existe `data-track-id` dela em
 * Index.tsx desde a reforma do topo) e por isso saiu daqui: seção sem render
 * nenhum entrava no funil com 0 e fazia parecer queda de leitura onde não há
 * nada para ler. O dado antigo dela continua legível pelo rótulo legado abaixo.
 */
export const LANDING_SECTIONS: LandingSection[] = [
  { id: "hero", order: 10, label: "Headline inicial" },
  { id: "success_cases", order: 20, label: "Casos de sucesso" },
  // Só existe na versão "prova" da página (28/09/2026). Nas outras versões a
  // seção não renderiza e o funil simplesmente não a vê.
  { id: "garantia", order: 25, label: "Garantia do primeiro mês" },
  { id: "dor", order: 30, label: "Dor / problema" },
  { id: "metodo", order: 40, label: "Método Champion" },
  { id: "criativos", order: 60, label: "Criativos (vídeos)" },
  { id: "cta_intermediario", order: 70, label: "CTA intermediário" },
  // Idem: só na versão "prova".
  { id: "quem_atende", order: 75, label: "Quem atende" },
  { id: "como_funciona", order: 80, label: "Como funciona" },
  { id: "faq", order: 90, label: "FAQ" },
  { id: "cta_final", order: 100, label: "CTA final" },
];

/** Seções que já existiram na página e ainda aparecem em dados antigos. */
export const LEGACY_SECTION_LABELS: Record<string, string> = {
  portfolio: "Portfólio",
  gancho_corpo: "Gancho & Corpo",
  diagnostico: "Diagnóstico",
  feedbacks: "Depoimentos",
  cases: "Cases",
  // Saiu da página em 17/09/2026, junto com a reforma do topo.
  social_proof: "Prova social",
};

export const SECTION_LABELS: Record<string, string> = {
  ...Object.fromEntries(LANDING_SECTIONS.map((s) => [s.id, s.label])),
  ...LEGACY_SECTION_LABELS,
};

export function sectionLabel(id: string): string {
  return SECTION_LABELS[id] || id;
}
