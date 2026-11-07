// ── De qual anúncio e de qual página o lead veio ─────────────────────────────
//
// O lead é gravado pelo SERVIDOR (tabela `leads`) e a navegação pelo NAVEGADOR
// (`lead_sessions` + `lead_events`), em tabelas sem chave estrangeira entre si.
// Ligar as duas pontas é o que permite dizer "este lead veio deste criativo,
// nesta variante da página" — e é o que alimenta a leitura de todo teste A/B.
//
// A cascata, em ordem de confiança:
//
//   1. submit — o evento `submit` da sessão e a criação do lead acontecem no
//      MESMO instante (diferença medida em produção: 0 a 1 segundo). É
//      atribuição exata, não heurística.
//   2. fbp — o cookie `_fbp` é do navegador: mesmo dispositivo, embora possa
//      apontar para uma visita anterior em vez da que converteu.
//   3. ip — último recurso. O IP do lead vem do servidor e o da sessão do
//      navegador: divergem para a mesma pessoa (proxy, IPv6 contra IPv4, rede
//      móvel trocando de saída) e colidem entre pessoas na mesma rede. Serve
//      para não perder o dado, nunca para decidir um teste sozinho.
//
// Por que NÃO se filtra `completed = true`: `lead_sessions` tem policy de
// INSERT e UPDATE e nenhuma de SELECT; sem SELECT o Postgres não localiza a
// linha para avaliar o WHERE e o UPDATE afeta zero linhas, respondendo 204 sem
// erro. `completed` ficou FALSE em todo o histórico. Além disso o filtro nunca
// foi necessário: sessão que não terminou o quiz também carrega o utm_content
// do clique que a originou.
//
// ── Por que a busca é feita de trás para frente ──
//
// A versão anterior lia TODAS as sessões do período e depois procurava as que
// interessavam. Em agosto isso era varrer 4.091 sessões, em cinco páginas
// sequenciais de mil, para atribuir 41 leads — quando só existem 42 eventos de
// submit no mesmo período. Agora parte-se do que é escasso: primeiro os
// submits, depois as sessões DESSES submits por id. As buscas por fbp e ip só
// acontecem para os leads que sobraram, e filtradas pelos valores deles.

/** Tolerância entre o `submit` da sessão e a criação do lead. */
export const SUBMIT_TOLERANCE_MS = 3 * 60_000;

const PAGE_SIZE = 1000;

/** Quantos valores por `.in(...)`: acima disso a querystring fica grande demais. */
const IN_CHUNK = 150;

const SESSION_COLUMNS = "id, ip_address, fbp, utm_content, utm_campaign, first_page, created_at";

export type AttributionMethod = "submit" | "fbp" | "ip";

export interface LeadAttribution {
  utm_content: string | null;
  utm_campaign: string | null;
  first_page: string | null;
  method: AttributionMethod;
}

interface LeadLike {
  id: string;
  created_at: string;
  fbp?: string | null;
  ip_address?: string | null;
}

/**
 * Um UTM só serve se identificar alguma coisa.
 *
 * Além do placeholder do Meta que não resolveu (`{{ad.name}}`), há os valores
 * que o PRÓPRIO front grava quando não chega parâmetro nenhum na URL:
 * `utm_source = "direct"`, `utm_medium = "none"` e `utm_campaign = "(not set)"`
 * são os defaults de `useUtmCapture`. Eles não são nulos, então passavam por
 * qualquer teste de "está preenchido?" e bloqueavam a recuperação: a campanha
 * ficava eternamente como "(not set)" mesmo existindo o valor real na sessão.
 */
const PLACEHOLDERS = new Set(["(not set)", "direct", "none", "undefined", "null", "-"]);

export function isUsableUtm(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const limpo = v.trim();
  if (!limpo) return false;
  if (PLACEHOLDERS.has(limpo.toLowerCase())) return false;
  // As duas pontas testadas SEPARADAMENTE desde 18/09/2026: valor truncado no
  // caminho (URL cortada, limite de coluna) chega com só `{{` ou só `}}` e
  // continua não sendo dado. O padrão anterior (`\{\{.*\}\}`) deixava passar.
  return !/\{\{|\}\}/.test(limpo);
}

/** Busca linhas por uma lista de valores, em lotes paralelos. */
async function readIn(supabase: any, table: string, columns: string, coluna: string, valores: string[]): Promise<any[]> {
  const unicos = [...new Set(valores.filter(Boolean))];
  if (!unicos.length) return [];
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += IN_CHUNK) lotes.push(unicos.slice(i, i + IN_CHUNK));
  const partes = await Promise.all(
    lotes.map(async (lote) => {
      const { data, error } = await supabase.from(table).select(columns).in(coluna, lote);
      if (error) throw error;
      return data || [];
    }),
  );
  return partes.flat();
}

/**
 * Resolve, em LOTE, a origem de vários leads de uma vez.
 *
 * Em lote de propósito: uma consulta por lead seria um N+1 que sozinho põe
 * segundos na tela da lista. O casamento por tempo usa busca binária sobre os
 * submits ordenados.
 */
export async function resolveLeadAttribution(
  supabase: any,
  leads: LeadLike[],
  janela: { from?: string | null; to?: string | null },
): Promise<Map<string, LeadAttribution>> {
  const resultado = new Map<string, LeadAttribution>();
  if (!leads.length) return resultado;

  // A janela é alargada pela tolerância nas duas pontas: o submit de um lead
  // criado no primeiro segundo do período pode estar logo antes dele.
  const from = janela.from
    ? new Date(Date.parse(janela.from) - SUBMIT_TOLERANCE_MS).toISOString()
    : null;
  const to = janela.to
    ? new Date(Date.parse(janela.to) + SUBMIT_TOLERANCE_MS).toISOString()
    : null;

  // ── 1+2. Os submits do período JÁ com a sessão de cada um, em uma ida ──
  //
  // Eram duas consultas em fila: os `submit` do período, depois as sessões
  // desses submits por id. Um join — que o Postgres resolve em microssegundos —
  // custando duas travessias até us-west-2: 951 ms medidos em 18/09/2026, para
  // uma consulta que EXECUTA em 14 ms.
  //
  // `submits_com_sessao` (migration 20260918200000) faz o join no banco. A
  // equivalência foi provada linha a linha antes da troca: 216 de 216
  // idênticas, zero divergências, zero submits perdidos pelo join.
  //
  // O casamento lead×submit continua aqui embaixo, em TypeScript: é ele que
  // tem a tolerância de 3 minutos e a busca binária, e mexer nisso mudaria
  // atribuição. Só o join saiu daqui.
  const { data: linhasSubmit, error: erroSubmit } = await supabase.rpc("submits_com_sessao", {
    p_from: from,
    p_to: to,
  });
  if (erroSubmit) throw erroSubmit;

  const ordenados = ((linhasSubmit || []) as any[])
    .filter((l) => l.session_id && l.submit_at)
    .map((l) => ({ t: Date.parse(l.submit_at), sid: l.session_id as string }))
    .filter((e) => !Number.isNaN(e.t))
    .sort((a, b) => a.t - b.t);

  // A função devolve uma linha por SUBMIT, e a mesma sessão pode ter enviado
  // mais de um. O Map colapsa por id, que é exatamente o que o passo antigo
  // fazia ao buscar as sessões por id distinto.
  const porId = new Map<string, any>(
    ((linhasSubmit || []) as any[]).map((l) => [l.session_id, {
      id: l.session_id,
      ip_address: l.ip_address,
      fbp: l.fbp,
      utm_content: l.utm_content,
      utm_campaign: l.utm_campaign,
      first_page: l.first_page,
      created_at: l.sessao_em,
    }]),
  );

  const submitMaisProximo = (alvo: number): string | null => {
    if (!ordenados.length) return null;
    let lo = 0;
    let hi = ordenados.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ordenados[mid].t < alvo) lo = mid + 1;
      else hi = mid;
    }
    let melhor: { t: number; sid: string } | null = null;
    for (const i of [lo - 1, lo, lo + 1]) {
      const c = ordenados[i];
      if (!c) continue;
      if (!melhor || Math.abs(c.t - alvo) < Math.abs(melhor.t - alvo)) melhor = c;
    }
    if (!melhor || Math.abs(melhor.t - alvo) > SUBMIT_TOLERANCE_MS) return null;
    return melhor.sid;
  };

  const guardar = (leadId: string, sessao: any, method: AttributionMethod) => {
    resultado.set(leadId, {
      utm_content: isUsableUtm(sessao.utm_content) ? sessao.utm_content : null,
      utm_campaign: isUsableUtm(sessao.utm_campaign) ? sessao.utm_campaign : null,
      first_page: sessao.first_page || null,
      method,
    });
  };

  const semMatch: LeadLike[] = [];
  for (const lead of leads) {
    if (!lead.created_at) continue;
    const alvo = Date.parse(lead.created_at);
    if (Number.isNaN(alvo)) continue;
    const sid = submitMaisProximo(alvo);
    const sessao = sid ? porId.get(sid) : null;
    if (sessao) guardar(lead.id, sessao, "submit");
    else semMatch.push(lead);
  }

  if (!semMatch.length) return resultado;

  // ── 3. Fallbacks, só para quem sobrou e só pelos valores desses leads ──
  const [porFbpRows, porIpRows] = await Promise.all([
    readIn(supabase, "lead_sessions", SESSION_COLUMNS, "fbp",
      semMatch.map((l) => l.fbp).filter(Boolean) as string[]),
    readIn(supabase, "lead_sessions", SESSION_COLUMNS, "ip_address",
      semMatch.map((l) => l.ip_address).filter(Boolean) as string[]),
  ]);

  // Mais recente vence: é a visita mais próxima da conversão.
  const maisRecente = (rows: any[], chave: string) => {
    const m = new Map<string, any>();
    for (const s of rows) {
      const k = s[chave];
      if (!k) continue;
      const atual = m.get(k);
      if (!atual || s.created_at > atual.created_at) m.set(k, s);
    }
    return m;
  };
  const porFbp = maisRecente(porFbpRows, "fbp");
  const porIp = maisRecente(porIpRows, "ip_address");

  for (const lead of semMatch) {
    const s = (lead.fbp && porFbp.get(lead.fbp)) || (lead.ip_address && porIp.get(lead.ip_address));
    if (!s) continue;
    guardar(lead.id, s, lead.fbp && porFbp.get(lead.fbp) ? "fbp" : "ip");
  }

  return resultado;
}
