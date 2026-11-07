/**
 * SOMAR POR CRIATIVO — a linha agregada, opcional e recolhida por padrão.
 *
 * ── Por que ela é opcional ─────────────────────────────────────────────────
 * Desde 18/09/2026 a tabela "Performance por Criativo" tem uma linha por par
 * (CONTA, ANÚNCIO): é a única leitura que pertence a alguém. Antes ela somava
 * contas em silêncio, e foi assim que o experimento das 3 contas passou uma
 * semana sendo lido por um R$ 176,75 por MQL que não existia em conta nenhuma
 * (as reais eram 255,50 na CA05, 150,16 na CA02 e 180,14 na CA03).
 *
 * Mas somar É legítimo quando a pergunta é sobre o CRIATIVO e não sobre a
 * conta: "quanto o Luis-Nathan V3 custou no total, rodando onde rodar?". Então
 * a soma volta como MODO EXPLÍCITO, desligado por padrão, e a linha somada diz
 * quantas contas ela está juntando.
 *
 * ── A regra da soma ────────────────────────────────────────────────────────
 * Contagens e dinheiro somam. TAXAS NUNCA: toda derivada é recalculada sobre
 * os totais. Média de taxas é a armadilha clássica — a média de "50% de 2" com
 * "10% de 200" não é 30%, é 10,4%.
 *
 * Nota média idem: cada linha traz `score_por_versao` (soma já fechada em
 * média e n por versão), então aqui a soma é ponderada por n DENTRO de cada
 * versão, e as versões continuam separadas. Quiz e formulário curto são duas
 * réguas: mesma faixa de faturamento dá 43,8 numa e 20,0 na outra.
 */

export interface LinhaCriativoSomavel {
  row_key: string;
  creative_key: string;
  creative_label: string;
  ad_id?: string | null;
  ad_account_id?: string | null;
  account_name?: string | null;
  identidade_metodo?: string;
  spend: number;
  clicks: number;
  impressions: number;
  landing_page_views: number;
  sessions_count?: number;
  quiz_views_count?: number;
  leads_count: number;
  mql_count: number;
  hql_count?: number;
  mql_agendaram?: number;
  mql_compareceram?: number;
  mql_compraram?: number;
  tier_small_count: number;
  tier_medium_count: number;
  tier_large_count: number;
  tier_enterprise_count: number;
  tier_enterprise_plus_count: number;
  leads_5_10k_count?: number;
  qualified_count: number;
  meetings_count: number;
  meetings_attended_count: number;
  sales_count: number;
  sales_sprint_count: number;
  sales_assessoria_count: number;
  sales_parceria_count?: number;
  sales_refunded_count?: number;
  sprint_units_count?: number;
  revenue: number;
  revenue_sprint: number;
  revenue_assessoria: number;
  revenue_assessoria_received?: number;
  revenue_assessoria_to_receive?: number;
  last_activity: string | null;
  is_active: boolean;
  campaigns: string[];
  leads_by_stage: Record<string, number>;
  score_por_versao?: Record<string, { media: number; n: number }>;
  [chave: string]: unknown;
}

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const dividir = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/**
 * Junta as linhas que são o MESMO criativo (mesmo `creative_key`), recalculando
 * toda derivada sobre os totais.
 *
 * Uma linha sozinha volta praticamente igual — com `contas_somadas = 1`, que é
 * como a tela sabe que ali não há fusão nenhuma para avisar.
 */
export function somarPorCriativo(linhas: LinhaCriativoSomavel[]): LinhaCriativoSomavel[] {
  const grupos = new Map<string, LinhaCriativoSomavel[]>();
  for (const linha of linhas) {
    const chave = linha.creative_key || linha.row_key;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(linha);
  }

  const saida: LinhaCriativoSomavel[] = [];
  for (const [chave, doGrupo] of grupos) {
    const somar = (campo: string): number => doGrupo.reduce((s, l) => s + num(l[campo]), 0);

    const spend = somar("spend");
    const leads = somar("leads_count");
    const mql = somar("mql_count");
    const hql = somar("hql_count");
    const clicks = somar("clicks");
    const lpv = somar("landing_page_views");
    const sessoes = somar("sessions_count");
    const quizViews = somar("quiz_views_count");
    const vendas = somar("sales_count");
    const vendasSprint = somar("sales_sprint_count");
    const vendasAssessoria = somar("sales_assessoria_count");
    const receita = somar("revenue");
    const reunioes = somar("meetings_count");
    const reunioesReal = somar("meetings_attended_count");
    const qualificados = somar("qualified_count");
    const tierSmall = somar("tier_small_count");
    const tierMedium = somar("tier_medium_count");
    const tierLarge = somar("tier_large_count");
    const tierEnterprise = somar("tier_enterprise_count");
    const tierEnterprisePlus = somar("tier_enterprise_plus_count");

    // Nota: ponderada por n DENTRO de cada versão; versões nunca se juntam.
    const porVersao: Record<string, { media: number; n: number }> = {};
    for (const l of doGrupo) {
      for (const [versao, v] of Object.entries(l.score_por_versao ?? {})) {
        const atual = (porVersao[versao] ??= { media: 0, n: 0 });
        atual.media = atual.media * atual.n + v.media * v.n;
        atual.n += v.n;
        atual.media = atual.n > 0 ? atual.media / atual.n : 0;
      }
    }
    for (const v of Object.values(porVersao)) v.media = Math.round(v.media * 10) / 10;
    let dominante: string | null = null;
    let maiorN = 0;
    let totalNota = 0;
    for (const [versao, v] of Object.entries(porVersao)) {
      totalNota += v.n;
      if (v.n > maiorN) { maiorN = v.n; dominante = versao; }
    }

    const contas = new Set(
      doGrupo.map((l) => l.ad_account_id).filter((x): x is string => !!x),
    );
    const campanhas = new Set<string>();
    doGrupo.forEach((l) => (l.campaigns ?? []).forEach((c) => campanhas.add(c)));
    const estagios: Record<string, number> = {};
    for (const l of doGrupo) {
      for (const [k, v] of Object.entries(l.leads_by_stage ?? {})) {
        estagios[k] = (estagios[k] || 0) + num(v);
      }
    }

    const principal = [...doGrupo].sort((a, b) => num(b.spend) - num(a.spend))[0];

    saida.push({
      ...principal,
      row_key: `criativo::${chave}`,
      creative_key: chave,
      creative_label: principal.creative_label,
      // A linha somada não pertence a UM anúncio nem a UMA conta: dizer que
      // pertence seria repetir o defeito num campo diferente.
      ad_id: doGrupo.length === 1 ? principal.ad_id ?? null : null,
      ad_account_id: contas.size === 1 ? [...contas][0] : null,
      account_name: contas.size === 1 ? principal.account_name ?? null : null,
      identidade_metodo: doGrupo.length === 1 ? principal.identidade_metodo : "agregado",
      spend,
      clicks,
      impressions: somar("impressions"),
      landing_page_views: lpv,
      sessions_count: sessoes,
      quiz_views_count: quizViews,
      leads_count: leads,
      mql_count: mql,
      hql_count: hql,
      mql_agendaram: somar("mql_agendaram"),
      mql_compareceram: somar("mql_compareceram"),
      mql_compraram: somar("mql_compraram"),
      tier_small_count: tierSmall,
      tier_medium_count: tierMedium,
      tier_large_count: tierLarge,
      tier_enterprise_count: tierEnterprise,
      tier_enterprise_plus_count: tierEnterprisePlus,
      leads_5_10k_count: somar("leads_5_10k_count"),
      qualified_count: qualificados,
      meetings_count: reunioes,
      meetings_attended_count: reunioesReal,
      sales_count: vendas,
      sales_sprint_count: vendasSprint,
      sales_assessoria_count: vendasAssessoria,
      sales_parceria_count: somar("sales_parceria_count"),
      sales_refunded_count: somar("sales_refunded_count"),
      sprint_units_count: somar("sprint_units_count"),
      revenue: receita,
      revenue_sprint: somar("revenue_sprint"),
      revenue_assessoria: somar("revenue_assessoria"),
      revenue_assessoria_received: somar("revenue_assessoria_received"),
      revenue_assessoria_to_receive: somar("revenue_assessoria_to_receive"),
      last_activity: doGrupo.reduce<string | null>(
        (melhor, l) => (l.last_activity && (!melhor || l.last_activity > melhor) ? l.last_activity : melhor),
        null,
      ),
      is_active: doGrupo.some((l) => l.is_active),
      campaigns: [...campanhas],
      leads_by_stage: estagios,

      // ── Derivadas: recalculadas sobre os totais, nunca médias de taxas ──
      mql_rate: leads > 0 ? mql / leads : 0,
      cost_per_mql: dividir(spend, mql),
      cost_per_small: dividir(spend, tierSmall),
      cost_per_medium: dividir(spend, tierMedium),
      cost_per_tier_large: dividir(spend, tierLarge),
      cost_per_enterprise: dividir(spend, tierEnterprise),
      cost_per_enterprise_plus: dividir(spend, tierEnterprisePlus),
      cost_per_qualified: dividir(spend, qualificados),
      cac: dividir(spend, vendas),
      cac_sprint: dividir(spend, vendasSprint),
      cac_assessoria: dividir(spend, vendasAssessoria),
      roas: dividir(receita, spend),
      cost_per_meeting: dividir(spend, reunioes),
      lead_per_view: dividir(leads, lpv),
      ctl: clicks > 0 ? (leads / clicks) * 100 : null,

      avg_lead_score: dominante ? porVersao[dominante].media : null,
      score_por_versao: porVersao,
      score_versao_dominante: dominante,
      score_misturado: Object.keys(porVersao).length > 1,
      score_leads_fora_da_media: totalNota - maiorN,

      /** Quantas LINHAS reais esta soma juntou. 1 = não juntou nada. */
      linhas_somadas: doGrupo.length,
      /** Quantas CONTAS diferentes esta soma juntou. >1 = está somando contas. */
      contas_somadas: contas.size,
      /** As contas juntadas, para a tela poder nomeá-las no aviso. */
      contas_na_soma: doGrupo
        .filter((l) => l.ad_account_id)
        .map((l) => ({
          ad_account_id: l.ad_account_id as string,
          account_name: l.account_name ?? null,
          spend: num(l.spend),
        }))
        .sort((a, b) => b.spend - a.spend),
    });
  }

  return saida;
}
