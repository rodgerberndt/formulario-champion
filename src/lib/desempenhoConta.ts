// Agregação da hierarquia conta → campanha → conjunto → anúncio, no navegador.
//
// O backend (`/contas-desempenho`) devolve uma linha por anúncio e uma linha
// por lead, já com os ids dos pais. Tudo daqui para cima é soma — e soma por
// ID, nunca por nome: o mesmo nome de anúncio existe em três contas.
//
// Funções puras, testadas em scripts/testar-desempenho-conta.mjs.

export const TODAS = "__todas__";
/** Chave dos itens cujo id do nível não é conhecido (ex.: conta não identificada). */
export const SEM_ID = "__sem_id__";

export type Nivel = "conta" | "campanha" | "conjunto" | "anuncio";
export const NIVEIS: Nivel[] = ["conta", "campanha", "conjunto", "anuncio"];

export interface Selecao {
  conta: string;
  campanha: string;
  conjunto: string;
  anuncio: string;
}

export const SELECAO_INICIAL: Selecao = { conta: TODAS, campanha: TODAS, conjunto: TODAS, anuncio: TODAS };

export interface ComIds {
  ad_account_id: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
}

export interface Anuncio extends ComIds {
  account_name: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  ad_id: string;
  ad_name: string | null;
  spend: number;
  impressions: number;
  /** Clique TOTAL no anúncio. Não é clique de link e não vira CTR. */
  clicks: number;
  /** Clique no LINK. `null` quando nenhuma linha do período tinha o campo. */
  link_clicks: number | null;
  /** Impressões só das linhas que trouxeram clique de link — denominador do CTR. */
  link_impressions: number;
  lpv: number;
  meta_leads: number;
  tem_gasto: boolean;
}

export interface LeadResumo extends ComIds {
  id: string;
  created_at: string;
  nome: string | null;
  placement: string | null;
  score: number | null;
  /** Versão da fórmula do score. Define o corte de HQL deste lead (73 ou 67). */
  score_version?: string | null;
  mql: boolean;
  hql: boolean;
  /** O comercial aceitou o lead (SQL). Primeira etapa que depende de julgamento. */
  sql?: boolean;
  faturamento: number | null;
  investimento_faixa: string | null;
  reunioes: number;
  shows: number;
  vendas: number;
  receita: number;
}

export interface Agregado {
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number | null;
  link_impressions: number;
  lpv: number;
  meta_leads: number;
  leads: number;
  mql: number;
  hql: number;
  sql: number;
  reunioes: number;
  shows: number;
  vendas: number;
  receita: number;
  score_medio: number | null;
  score_mediano: number | null;
  score_maximo: number | null;
}

const CAMPO_DO_NIVEL: Record<Nivel, keyof ComIds> = {
  conta: "ad_account_id",
  campanha: "campaign_id",
  conjunto: "adset_id",
  anuncio: "ad_id",
};

export function chaveNoNivel(item: ComIds, nivel: Nivel): string {
  return item[CAMPO_DO_NIVEL[nivel]] ?? SEM_ID;
}

export function dentroDaSelecao(item: ComIds, s: Selecao): boolean {
  return NIVEIS.every((n) => s[n] === TODAS || chaveNoNivel(item, n) === s[n]);
}

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/**
 * CTR de link em %, ou `null` quando o período não tem o dado.
 *
 * Fica aqui, e não na tela, porque foi o cálculo espalhado que produziu o
 * D-019: cada lugar dividia por `clicks` e cada um chegava a um CTR diferente
 * do gerenciador. `null` é resposta legítima e a tela tem que mostrar "—".
 */
export function ctrDeLink(a: { link_clicks: number | null; link_impressions: number }): number | null {
  if (a.link_clicks === null || a.link_impressions <= 0) return null;
  return (a.link_clicks / a.link_impressions) * 100;
}

export function agregar(anuncios: Anuncio[], leads: LeadResumo[]): Agregado {
  const a: Agregado = {
    spend: 0, impressions: 0, clicks: 0, link_clicks: null, link_impressions: 0, lpv: 0, meta_leads: 0,
    leads: 0, mql: 0, hql: 0, sql: 0, reunioes: 0, shows: 0, vendas: 0, receita: 0,
    score_medio: null, score_mediano: null, score_maximo: null,
  };
  for (const x of anuncios) {
    a.spend += x.spend;
    a.impressions += x.impressions;
    a.clicks += x.clicks;
    // `typeof` e não `!== null`: estes dois campos nasceram em 24/09/2026 e o
    // painel fala com uma edge function que pode ainda não ter subido. Nessa
    // janela eles chegam `undefined`, e `undefined + 0` daria NaN — que na tela
    // não aparece como erro, aparece como número vazio.
    if (typeof x.link_clicks === "number") {
      a.link_clicks = (a.link_clicks ?? 0) + x.link_clicks;
      a.link_impressions += (typeof x.link_impressions === "number" ? x.link_impressions : 0);
    }
    a.lpv += x.lpv;
    a.meta_leads += x.meta_leads;
  }
  const scores: number[] = [];
  for (const l of leads) {
    a.leads += 1;
    if (l.mql) a.mql += 1;
    if (l.hql) a.hql += 1;
    if (l.sql) a.sql += 1;
    a.reunioes += l.reunioes;
    a.shows += l.shows;
    a.vendas += l.vendas;
    a.receita += l.receita;
    if (typeof l.score === "number") scores.push(l.score);
  }
  a.spend = Math.round(a.spend * 100) / 100;
  if (scores.length) {
    a.score_medio = scores.reduce((s, n) => s + n, 0) / scores.length;
    a.score_mediano = mediana(scores);
    a.score_maximo = Math.max(...scores);
  }
  return a;
}

/** O nível que aparece na tabela abaixo da seleção atual; null no anúncio. */
export function nivelDosFilhos(s: Selecao): Nivel | null {
  if (s.conta === TODAS) return "conta";
  if (s.campanha === TODAS) return "campanha";
  if (s.conjunto === TODAS) return "conjunto";
  if (s.anuncio === TODAS) return "anuncio";
  return null;
}

const ROTULO_VAZIO: Record<Nivel, string> = {
  conta: "Conta não identificada",
  campanha: "Campanha não identificada",
  conjunto: "Conjunto não identificado",
  anuncio: "Anúncio não identificado",
};

export function rotuloNoNivel(a: Anuncio, nivel: Nivel): string {
  const nome =
    nivel === "conta" ? a.account_name :
    nivel === "campanha" ? a.campaign_name :
    nivel === "conjunto" ? a.adset_name :
    a.ad_name;
  const id = chaveNoNivel(a, nivel);
  if (nome) return nome;
  return id === SEM_ID ? ROTULO_VAZIO[nivel] : `${ROTULO_VAZIO[nivel].split(" ")[0]} ${id}`;
}

export interface Filho {
  chave: string;
  rotulo: string;
  agregado: Agregado;
}

/** Os filhos da seleção atual, cada um com o seu agregado, do maior gasto para o menor. */
export function filhos(anuncios: Anuncio[], leads: LeadResumo[], s: Selecao): Filho[] {
  const nivel = nivelDosFilhos(s);
  if (!nivel) return [];
  const grupos = new Map<string, { rotulo: string; anuncios: Anuncio[]; leads: LeadResumo[] }>();
  for (const a of anuncios) {
    if (!dentroDaSelecao(a, s)) continue;
    const k = chaveNoNivel(a, nivel);
    const g = grupos.get(k) ?? { rotulo: rotuloNoNivel(a, nivel), anuncios: [], leads: [] };
    // O rótulo fica com o primeiro anúncio que tiver nome.
    if (g.rotulo.startsWith(ROTULO_VAZIO[nivel].split(" ")[0]) && rotuloNoNivel(a, nivel) !== g.rotulo) {
      const candidato = rotuloNoNivel(a, nivel);
      if (!candidato.startsWith(ROTULO_VAZIO[nivel].split(" ")[0])) g.rotulo = candidato;
    }
    g.anuncios.push(a);
    grupos.set(k, g);
  }
  for (const l of leads) {
    if (!dentroDaSelecao(l, s)) continue;
    const k = chaveNoNivel(l, nivel);
    const g = grupos.get(k) ?? { rotulo: ROTULO_VAZIO[nivel], anuncios: [], leads: [] };
    g.leads.push(l);
    grupos.set(k, g);
  }
  return [...grupos.entries()]
    .map(([chave, g]) => ({ chave, rotulo: g.rotulo, agregado: agregar(g.anuncios, g.leads) }))
    .sort((x, y) => y.agregado.spend - x.agregado.spend || y.agregado.leads - x.agregado.leads);
}

/** Opções de um seletor, respeitando os níveis ACIMA dele. */
export function opcoes(anuncios: Anuncio[], s: Selecao, nivel: Nivel): { valor: string; rotulo: string }[] {
  const idx = NIVEIS.indexOf(nivel);
  const acima: Selecao = { ...SELECAO_INICIAL };
  for (const n of NIVEIS.slice(0, idx)) acima[n] = s[n];
  const vistos = new Map<string, string>();
  for (const a of anuncios) {
    if (!dentroDaSelecao(a, acima)) continue;
    const k = chaveNoNivel(a, nivel);
    const r = rotuloNoNivel(a, nivel);
    if (!vistos.has(k) || vistos.get(k)!.startsWith(ROTULO_VAZIO[nivel].split(" ")[0])) vistos.set(k, r);
  }
  return [...vistos.entries()]
    .map(([valor, rotulo]) => ({ valor, rotulo }))
    .sort((x, y) => x.rotulo.localeCompare(y.rotulo, "pt-BR"));
}

/** Mudar um nível zera os que estão abaixo dele. */
export function selecionar(s: Selecao, nivel: Nivel, valor: string): Selecao {
  const idx = NIVEIS.indexOf(nivel);
  const nova: Selecao = { ...s, [nivel]: valor };
  for (const n of NIVEIS.slice(idx + 1)) nova[n] = TODAS;
  return nova;
}
