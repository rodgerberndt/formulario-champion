// Desempenho por conta → campanha → conjunto → anúncio → lead.
//
// IDENTIDADE É SEMPRE O ID. Nome é só o rótulo que aparece na tela.
//
// Em 12/09/2026 o mesmo "Luis-Nathan Case #2 - V3" passou a rodar em três
// contas de anúncio, com três `ad_id` e a mesma `creative_key`. Toda soma por
// nome juntava os três braços do experimento CA02 × CA03 × CA05 numa linha só.
// Aqui um anúncio é o seu `ad_id`, e a conta dele é a conta em que o `ad_spend`
// o registrou — nunca a conta "que parece" pelo nome.
//
// Função pura: recebe as linhas já lidas do banco e devolve o que a tela usa.
// A rota `/contas-desempenho` em index.ts só busca. O teste
// scripts/testar-desempenho-conta.mjs alimenta ESTA função com dados reais.

import { isRealizada, type MeetingRow } from "./meetings.ts";
import { ehHighQualityLead, LIMIAR_HQL_QUIZ, LIMIAR_HQL_FORM, LIMIARES_HQL } from "../_shared/hql.ts";
import { sanitizarIdentificador } from "./identidade_criativo.ts";

/**
 * HQL = score GRAVADO no lead acima do corte DA VERSÃO DELE — 73 no quiz
 * (v2.3, e em todo lead histórico sem versão), 67 no formulário curto
 * (v3-form, 17/09/2026). Mesmo campo, mesma função e mesmo corte do evento
 * HighQualityLead (fire-capi-events), para que o painel e o Gerenciador contem
 * a mesma coisa.
 */
export { LIMIAR_HQL_QUIZ, LIMIAR_HQL_FORM, LIMIARES_HQL };
/** Compatibilidade: o corte do quiz, que era o corte único até 17/09/2026. */
export const LIMIAR_HQL = LIMIAR_HQL_QUIZ;

/**
 * A regra de MQL do painel, idêntica à da rota /creatives: faixa de faturamento
 * a partir de R$ 10 mil, e o override manual de SDR para Dara ou Miguel tira o
 * lead de MQL. Mantida igual de propósito — dois números de MQL diferentes na
 * mesma aba seriam piores que qualquer um dos dois.
 */
const FAIXAS_MQL_PAINEL = new Set([
  "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
  "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
]);

export function ehMqlDoPainel(faixa: string | null | undefined, override?: string | null): boolean {
  if (override === "Dara" || override === "Miguel") return false;
  return !!faixa && FAIXAS_MQL_PAINEL.has(faixa);
}

type Num = number | string | null | undefined;

export interface LinhaGastoBruta {
  ad_account_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string;
  ad_name: string | null;
  date?: string | null;
  spend?: Num;
  impressions?: Num;
  clicks?: Num;
  /** Clique no LINK. `null` quando a linha é anterior à sincronização do campo. */
  inline_link_clicks?: Num;
  landing_page_views?: Num;
  meta_leads?: Num;
}

export interface LeadBruto {
  /** Carimbo de quando o comercial aceitou o lead; `null` enquanto não aceitou. */
  sql_at?: string | null;
  id: string;
  created_at: string;
  nome_completo: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  placement: string | null;
  score: number | null;
  /** Versão da fórmula que gerou `score`. Define o corte de HQL deste lead. */
  score_version: string | null;
  investimento_faixa: string | null;
  sdr_override: string | null;
  faturamento_declarado: Num;
}

export interface ReuniaoBruta extends MeetingRow {
  lead_id: string | null;
}

export interface VendaBruta {
  lead_id: string | null;
  revenue: Num;
  refunded_at: string | null;
}

export interface ContaBruta {
  ad_account_id: string;
  account_name: string | null;
  currency: string | null;
  sync_enabled: boolean | null;
}

export interface EntradaDesempenho {
  /** `ad_spend` do período. */
  gasto: LinhaGastoBruta[];
  /**
   * Identidade dos anúncios que tiveram lead mas não gasto no período
   * (`ad_spend` de outra data ou `meta_ads_cache`). Só preenche ad_id ausente.
   */
  identidadesExtras: LinhaGastoBruta[];
  /** Leads criados no período. */
  leads: LeadBruto[];
  /** Reuniões e vendas desses leads, de qualquer data. */
  reunioes: ReuniaoBruta[];
  vendas: VendaBruta[];
  contas: ContaBruta[];
}

export interface AnuncioDesempenho {
  ad_account_id: string | null;
  account_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string;
  ad_name: string | null;
  spend: number;
  impressions: number;
  /** Clique TOTAL: curtida, comentário, ver-mais. Não serve para CTR. */
  clicks: number;
  /** Clique no LINK somado só das linhas que têm o dado. `null` = nenhuma tinha. */
  link_clicks: number | null;
  /**
   * Impressões APENAS das linhas que trouxeram clique de link.
   *
   * O CTR de link tem que dividir por este número, não por `impressions`.
   * Enquanto o histórico não for re-sincronizado, o período mistura linhas com e
   * sem o campo: dividir um numerador parcial pelo total de impressões
   * devolveria um CTR baixo e plausível — o tipo de número errado que ninguém
   * questiona.
   */
  link_impressions: number;
  lpv: number;
  meta_leads: number;
  tem_gasto: boolean;
}

export interface LeadDesempenho {
  id: string;
  created_at: string;
  nome: string | null;
  ad_account_id: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string;
  placement: string | null;
  score: number | null;
  score_version: string | null;
  mql: boolean;
  hql: boolean;
  /** O comercial aceitou este lead (Sales Qualified Lead). Etapa manual. */
  sql: boolean;
  faturamento: number | null;
  investimento_faixa: string | null;
  reunioes: number;
  shows: number;
  vendas: number;
  receita: number;
}

export interface SaidaDesempenho {
  /**
   * O corte do QUIZ (73). A chave é antiga e a tela já a consome, por isso
   * continua existindo com o mesmo nome e o mesmo valor. O corte de verdade é
   * por versão — ver `limiares_hql`.
   */
  limiar_hql: number;
  /** Corte por versão de score: { "v2.3": 73, "v3-form": 67 }. */
  limiares_hql: Record<string, number>;
  contas: ContaBruta[];
  anuncios: AnuncioDesempenho[];
  leads: LeadDesempenho[];
  /** Leads do período sem `ad_id`: não entram na hierarquia, e a tela avisa quantos. */
  leads_sem_id: number;
  /** Leads com `ad_id` cuja conta não foi encontrada em `ad_spend` nem no cache. */
  leads_sem_conta: number;
  /**
   * Leads cujo `ad_id` era a MACRO LITERAL da Meta (`{{ad.id}}`): clique em
   * prévia de anúncio dentro do Gerenciador. Nem tráfego pago nem orgânico —
   * balde próprio, para não sumir nem se disfarçar.
   */
  leads_previa: number;
}

const numero = (v: Num): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function montarDesempenho(e: EntradaDesempenho): SaidaDesempenho {
  const nomeDaConta = new Map(e.contas.map((c) => [c.ad_account_id, c.account_name]));

  // Identidade de cada ad_id: a linha de gasto MAIS RECENTE manda, porque nome
  // de campanha e de conjunto mudam com o tempo e a tela deve mostrar o atual.
  const identidade = new Map<string, LinhaGastoBruta>();
  for (const g of e.gasto) {
    const atual = identidade.get(g.ad_id);
    if (!atual || String(g.date ?? "") >= String(atual.date ?? "")) identidade.set(g.ad_id, g);
  }
  for (const x of e.identidadesExtras) {
    if (!identidade.has(x.ad_id)) identidade.set(x.ad_id, x);
  }

  const porAnuncio = new Map<string, AnuncioDesempenho>();
  const linhaDe = (adId: string): AnuncioDesempenho => {
    let linha = porAnuncio.get(adId);
    if (!linha) {
      const id = identidade.get(adId);
      linha = {
        ad_account_id: id?.ad_account_id ?? null,
        account_name: null,
        campaign_id: id?.campaign_id ?? null,
        campaign_name: id?.campaign_name ?? null,
        adset_id: id?.adset_id ?? null,
        adset_name: id?.adset_name ?? null,
        ad_id: adId,
        ad_name: id?.ad_name ?? null,
        spend: 0,
        impressions: 0,
        clicks: 0,
        link_clicks: null,
        link_impressions: 0,
        lpv: 0,
        meta_leads: 0,
        tem_gasto: false,
      };
      porAnuncio.set(adId, linha);
    }
    return linha;
  };

  for (const g of e.gasto) {
    const l = linhaDe(g.ad_id);
    l.spend += numero(g.spend);
    l.impressions += numero(g.impressions);
    l.clicks += numero(g.clicks);
    // Ausente continua ausente: só entra na soma a linha que realmente trouxe o
    // campo, e a impressão dela entra junto para o CTR fechar com o numerador.
    if (g.inline_link_clicks !== null && g.inline_link_clicks !== undefined) {
      l.link_clicks = (l.link_clicks ?? 0) + numero(g.inline_link_clicks);
      l.link_impressions += numero(g.impressions);
    }
    l.lpv += numero(g.landing_page_views);
    l.meta_leads += numero(g.meta_leads);
    l.tem_gasto = true;
  }

  const reunioesPorLead = new Map<string, { reunioes: number; shows: number }>();
  for (const m of e.reunioes) {
    if (!m.lead_id) continue;
    const r = reunioesPorLead.get(m.lead_id) ?? { reunioes: 0, shows: 0 };
    r.reunioes += 1;
    if (isRealizada(m)) r.shows += 1;
    reunioesPorLead.set(m.lead_id, r);
  }

  // Venda reembolsada não conta: o dinheiro voltou.
  const vendasPorLead = new Map<string, { vendas: number; receita: number }>();
  for (const v of e.vendas) {
    if (!v.lead_id || v.refunded_at) continue;
    const r = vendasPorLead.get(v.lead_id) ?? { vendas: 0, receita: 0 };
    r.vendas += 1;
    r.receita += numero(v.revenue);
    vendasPorLead.set(v.lead_id, r);
  }

  let semId = 0;
  let semConta = 0;
  let previa = 0;
  const leads: LeadDesempenho[] = [];
  for (const l of e.leads) {
    // MACRO LITERAL NÃO É ID (18/09/2026). O lead do Vic (16/09, score 89)
    // tem `ad_id = "{{ad.id}}"` no banco — clique em PRÉVIA de anúncio dentro
    // do Gerenciador, não tráfego — e virava uma "conta não identificada" com
    // 1 HQL e nota 89 no topo da tela. Ele sai da hierarquia e é CONTADO à
    // parte, para não sumir nem se disfarçar de lead orgânico.
    const adId = sanitizarIdentificador(l.ad_id);
    if (!adId) {
      if (l.ad_id) previa += 1;
      else semId += 1;
      continue;
    }
    const linha = linhaDe(adId);
    // Anúncio sem identidade conhecida herda campanha e conjunto do próprio
    // lead (vieram na URL, também são ids). A conta, não: ela nunca é deduzida.
    const campanhaDoLead = sanitizarIdentificador(l.campaign_id);
    const conjuntoDoLead = sanitizarIdentificador(l.adset_id);
    if (!linha.campaign_id && campanhaDoLead) linha.campaign_id = campanhaDoLead;
    if (!linha.adset_id && conjuntoDoLead) linha.adset_id = conjuntoDoLead;
    if (!linha.ad_account_id) semConta += 1;

    const r = reunioesPorLead.get(l.id);
    const v = vendasPorLead.get(l.id);
    const fat = l.faturamento_declarado;
    leads.push({
      id: l.id,
      created_at: l.created_at,
      nome: l.nome_completo,
      ad_account_id: linha.ad_account_id,
      campaign_id: linha.campaign_id,
      adset_id: linha.adset_id,
      ad_id: adId,
      placement: l.placement,
      score: l.score,
      score_version: l.score_version ?? null,
      mql: ehMqlDoPainel(l.investimento_faixa, l.sdr_override),
      // O corte é o da VERSÃO do score do lead, nunca um número fixo: um 70 de
      // formulário é HQL e um 70 de quiz não é.
      hql: ehHighQualityLead(l.score, l.score_version),
      // Só a DATA prova que alguém aceitou. Ausência é "ainda não avaliado" ou
      // "recusado" — e a recusa se registra na perda, não aqui.
      sql: !!l.sql_at,
      faturamento: fat === null || fat === undefined || fat === "" ? null : numero(fat),
      investimento_faixa: l.investimento_faixa,
      reunioes: r?.reunioes ?? 0,
      shows: r?.shows ?? 0,
      vendas: v?.vendas ?? 0,
      receita: v?.receita ?? 0,
    });
  }

  const anuncios = [...porAnuncio.values()].map((a) => ({
    ...a,
    account_name: a.ad_account_id ? nomeDaConta.get(a.ad_account_id) ?? null : null,
    spend: Math.round(a.spend * 100) / 100,
  }));

  return {
    limiar_hql: LIMIAR_HQL,
    limiares_hql: LIMIARES_HQL,
    contas: e.contas,
    anuncios,
    leads,
    leads_sem_id: semId,
    leads_sem_conta: semConta,
    leads_previa: previa,
  };
}
