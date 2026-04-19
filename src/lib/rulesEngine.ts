// Rules Engine determinístico — gera alertas e relatório markdown
// Não usa IA; só compara métricas atuais vs período anterior.

export type Severity = "ALTA" | "MÉDIA" | "BAIXA";
export type Area = "FUNIL" | "TRACKING" | "CRIATIVOS" | "MQL" | "VENDAS" | "DADOS";

export interface Alert {
  id: string;
  area: Area;
  severity: Severity;
  title: string;
  evidence: string;
  signal: string;
  impact: string;
  hypotheses: string[];
  checks: string[];
  next_action: string;
}

export interface PeriodMetrics {
  // visitantes / sessões / quiz
  visitors: number;
  sessions: number;
  entered_quiz: number;
  completed: number;
  conversion_rate: number; // visitors -> completed
  drop_off_total: number; // visitors - completed
  // funil
  step_funnel: Array<{ step_id: string; count: number }>;
  // leads / mql
  leads: number;
  mql: number;
  mql_rate: number; // mql/leads
  // vendas
  sales: number;
  revenue: number;
  // ads
  spend: number;
  cpl: number | null;
  cpmql: number | null;
  roas: number | null;
  // tracking
  leads_with_creative_key: number;
  leads_without_utms: number;
  sales_without_creative_key: number;
  direct_bio_leads: number;
  // criativos top
  top_creatives_leads: Array<{ key: string; leads: number; mql: number; spend: number; cpl: number | null; cpmql: number | null; sales: number; revenue: number; roas: number | null }>;
  top_creatives_mql: Array<{ key: string; leads: number; mql: number; mql_rate: number; spend: number; cpmql: number | null }>;
  top_creatives_revenue: Array<{ key: string; leads: number; sales: number; revenue: number; roas: number | null }>;
}

export interface RulesEngineResult {
  alerts: Alert[];
  report_markdown: string;
  has_comparison: boolean;
}

interface RuleContext {
  current: PeriodMetrics;
  previous: PeriodMetrics | null;
  period_label: string;
  previous_label: string;
  filters_label: string;
  generated_at: string;
}

// Helpers ─────────────────────────────────────────────────
const fmtN = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const fmtMoney = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function pctVar(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}
function deltaArrow(v: number): string { return v > 0 ? "↑" : v < 0 ? "↓" : "→"; }
function fmtDelta(curr: number, prev: number, kind: "n" | "money" | "pct" = "n"): string {
  const fmt = kind === "money" ? fmtMoney : kind === "pct" ? fmtPct : fmtN;
  const pv = pctVar(curr, prev);
  return `${fmt(curr)} (anterior: ${fmt(prev)}, ${pv >= 0 ? "+" : ""}${pv.toFixed(1)}%)`;
}

// Rules ───────────────────────────────────────────────────
function runRules(ctx: RuleContext): Alert[] {
  const { current: c, previous: p } = ctx;
  const alerts: Alert[] = [];
  if (!p) return alerts;

  // FUNIL ───────────────────────────────────────────
  const completionVar = pctVar(c.conversion_rate, p.conversion_rate);
  if (p.conversion_rate > 0 && completionVar < -15) {
    alerts.push({
      id: "funnel-completion-drop",
      area: "FUNIL",
      severity: "ALTA",
      title: "Queda forte na taxa de conclusão do quiz",
      evidence: `Conversão atual ${fmtPct(c.conversion_rate)} vs anterior ${fmtPct(p.conversion_rate)} (${completionVar.toFixed(1)}%)`,
      signal: "↓ menos visitantes estão chegando ao final do quiz — gargalo dentro do fluxo.",
      impact: `Perda estimada de ${fmtN(Math.round((Math.abs(completionVar) / 100) * c.completed))} leads se a conversão tivesse se mantido.`,
      hypotheses: [
        "Etapa específica do quiz pode ter quebrado ou ficado mais pesada",
        "Mudança recente em copy/CTA da landing aumentou fricção",
        "Mix de tráfego mudou: mais audiência fria/menos qualificada",
      ],
      checks: [
        "Abrir aba Criativos → comparar fontes vs período anterior",
        "Testar o quiz no mobile e desktop",
        "Verificar se algum criativo novo trouxe muito tráfego não-ICP",
      ],
      next_action: "Revisar funil etapa por etapa e identificar onde está o maior drop-off novo.",
    });
  }

  const dropVar = pctVar(c.drop_off_total, p.drop_off_total);
  if (p.drop_off_total > 0 && dropVar > 15) {
    alerts.push({
      id: "funnel-dropoff-up",
      area: "FUNIL",
      severity: "ALTA",
      title: "Drop-off total da landing aumentou",
      evidence: `Drop-off ${fmtN(c.drop_off_total)} vs ${fmtN(p.drop_off_total)} (${dropVar >= 0 ? "+" : ""}${dropVar.toFixed(1)}%)`,
      signal: "↑ mais pessoas entram e saem sem completar.",
      impact: "Mais gasto de mídia diluído, menos leads no fim.",
      hypotheses: [
        "Hero/copy menos persuasivo no momento atual",
        "Tempo de carregamento subiu (mobile)",
        "Tráfego frio em volume desproporcional",
      ],
      checks: [
        "Verificar comportamento por seção (Insights da landing)",
        "Olhar criativos recentes com CPL alto",
        "Comparar dispositivo mobile vs desktop",
      ],
      next_action: "Identificar a seção da landing com maior queda nova vs período anterior.",
    });
  }

  // Funil etapas — pior etapa nova
  if (c.step_funnel.length > 1 && p.step_funnel.length > 1) {
    let worstStepDelta = 0;
    let worstStepId = "";
    for (let i = 1; i < c.step_funnel.length; i++) {
      const cPrev = c.step_funnel[i - 1].count;
      const cCurr = c.step_funnel[i].count;
      const pPrev = p.step_funnel[i - 1]?.count || 0;
      const pCurr = p.step_funnel[i]?.count || 0;
      const cDrop = cPrev > 0 ? ((cPrev - cCurr) / cPrev) * 100 : 0;
      const pDrop = pPrev > 0 ? ((pPrev - pCurr) / pPrev) * 100 : 0;
      const delta = cDrop - pDrop;
      if (delta > worstStepDelta) {
        worstStepDelta = delta;
        worstStepId = c.step_funnel[i].step_id;
      }
    }
    if (worstStepDelta > 20) {
      alerts.push({
        id: `funnel-step-${worstStepId}`,
        area: "FUNIL",
        severity: "ALTA",
        title: `Drop-off subiu na etapa "${worstStepId}"`,
        evidence: `Drop-off da etapa aumentou ${worstStepDelta.toFixed(1)}pp vs período anterior.`,
        signal: "↓ etapa específica está perdendo mais gente.",
        impact: "Esse é o ponto-chave a corrigir antes de qualquer outra mudança.",
        hypotheses: [
          "Pergunta mudou ou ficou confusa",
          "Validação ou input com bug",
          "Tempo da etapa anterior subiu (cansaço)",
        ],
        checks: [
          "Testar a etapa diretamente no quiz",
          "Conferir se houve deploy recente alterando a etapa",
          "Olhar tempo médio gasto por etapa",
        ],
        next_action: `Inspecionar e testar a etapa "${worstStepId}" do quiz.`,
      });
    }
  }

  // LEADS / MQL ──────────────────────────────────────
  const leadsVar = pctVar(c.leads, p.leads);
  if (p.leads > 0 && leadsVar < -15) {
    alerts.push({
      id: "leads-down",
      area: "MQL",
      severity: "ALTA",
      title: "Total de leads caiu",
      evidence: `Leads: ${fmtDelta(c.leads, p.leads)}`,
      signal: "↓ menos volume de leads — pode ser mídia, sazonalidade ou funil.",
      impact: "Pipeline reduzido para o time comercial nos próximos dias.",
      hypotheses: [
        "Spend caiu no período",
        "Criativos performando pior",
        "Conversão da landing piorou",
      ],
      checks: [
        "Olhar evolução do spend dia a dia",
        "Conferir top criativos perdendo volume",
        "Validar se a conversão da landing sustentou",
      ],
      next_action: "Confirmar se foi queda de spend ou queda de conversão antes de agir.",
    });
  }

  const mqlRateVar = pctVar(c.mql_rate, p.mql_rate);
  if (p.mql_rate > 0 && mqlRateVar < -20) {
    alerts.push({
      id: "mql-rate-down",
      area: "MQL",
      severity: "ALTA",
      title: "Taxa de MQL despencou",
      evidence: `Taxa MQL: ${fmtPct(c.mql_rate)} vs ${fmtPct(p.mql_rate)} (${mqlRateVar.toFixed(1)}%)`,
      signal: "↓ proporção de leads qualificados (faturamento ≥ 10k) caiu.",
      impact: "Mesmo volume de leads, menos oportunidades reais de venda.",
      hypotheses: [
        "Criativo novo está atraindo audiência menos qualificada",
        "Mudança no público/segmentação no Meta Ads",
        "Tráfego direto/bio aumentou desproporcionalmente",
      ],
      checks: [
        "Top criativos por %MQL — quais caíram?",
        "Verificar se algum criativo de alto volume tem %MQL baixa",
        "Olhar mix Direct/Bio vs Ads",
      ],
      next_action: "Pausar ou ajustar criativos com %MQL muito abaixo da média.",
    });
  }

  const mqlVar = pctVar(c.mql, p.mql);
  if (p.mql > 0 && mqlVar < -20) {
    alerts.push({
      id: "mql-total-down",
      area: "MQL",
      severity: "ALTA",
      title: "Total de MQL caiu",
      evidence: `MQL: ${fmtDelta(c.mql, p.mql)}`,
      signal: "↓ volume absoluto de leads qualificados caiu.",
      impact: "Diretamente impacta receita futura.",
      hypotheses: [
        "Combinação de menos leads + menos taxa MQL",
        "Criativos voltados para MQL pararam de performar",
        "Otimização do Meta para MQL precisa de novos eventos",
      ],
      checks: [
        "Histórico de eventos MQL no Pixel/CAPI",
        "Top criativos por MQL — quem sumiu?",
        "Spend da campanha MQL específica",
      ],
      next_action: "Investigar campanha MQL e criativos de maior MQL histórico.",
    });
  }

  // CRIATIVOS / GASTO ────────────────────────────────
  const spendVar = pctVar(c.spend, p.spend);
  if (p.spend > 0 && spendVar > 20 && leadsVar < -10) {
    alerts.push({
      id: "spend-up-leads-down",
      area: "CRIATIVOS",
      severity: "ALTA",
      title: "Spend aumentou e leads caíram",
      evidence: `Spend: ${fmtDelta(c.spend, p.spend, "money")} | Leads: ${fmtDelta(c.leads, p.leads)}`,
      signal: "↑ gasto e ↓ resultado — pior cenário possível em mídia.",
      impact: `CPL subiu de ${p.cpl ? fmtMoney(p.cpl) : "—"} para ${c.cpl ? fmtMoney(c.cpl) : "—"}.`,
      hypotheses: [
        "Criativo cansou (frequência alta)",
        "Concorrência subiu o CPM",
        "Audiência ficou saturada",
      ],
      checks: [
        "Frequência por criativo no Meta",
        "CPM diário",
        "Necessidade de novos criativos imediatos",
      ],
      next_action: "Pausar criativos com CPL acima da média e subir variações novas.",
    });
  }

  if (c.cpl !== null && p.cpl !== null && p.cpl > 0) {
    const cplVar = pctVar(c.cpl, p.cpl);
    if (cplVar > 20) {
      alerts.push({
        id: "cpl-up",
        area: "CRIATIVOS",
        severity: "ALTA",
        title: "CPL aumentou",
        evidence: `CPL: ${fmtMoney(c.cpl)} vs ${fmtMoney(p.cpl)} (${cplVar >= 0 ? "+" : ""}${cplVar.toFixed(1)}%)`,
        signal: "↑ está custando mais para gerar cada lead.",
        impact: "Impacto direto em margem e ROAS.",
        hypotheses: [
          "Criativos cansados / fadiga",
          "Landing perdeu conversão",
          "Tráfego mais frio recente",
        ],
        checks: [
          "CPL por criativo (qual subiu mais?)",
          "Conversão da landing no mesmo período",
          "Frequência média no Meta",
        ],
        next_action: "Renovar criativos top e cortar piores em CPL.",
      });
    }
  }

  if (c.cpmql !== null && p.cpmql !== null && p.cpmql > 0) {
    const cpmqlVar = pctVar(c.cpmql, p.cpmql);
    if (cpmqlVar > 25) {
      alerts.push({
        id: "cpmql-up",
        area: "CRIATIVOS",
        severity: "ALTA",
        title: "CPMQL aumentou",
        evidence: `CPMQL: ${fmtMoney(c.cpmql)} vs ${fmtMoney(p.cpmql)} (${cpmqlVar >= 0 ? "+" : ""}${cpmqlVar.toFixed(1)}%)`,
        signal: "↑ cada MQL ficou mais caro.",
        impact: "Receita por real investido cai.",
        hypotheses: [
          "Mix de leads ficou menos qualificado",
          "Criativos de MQL específico pararam de performar",
          "Otimização do Meta perdeu sinal",
        ],
        checks: [
          "Top criativos por CPMQL",
          "Eventos MQL chegando no Meta (CAPI)",
          "%MQL por criativo",
        ],
        next_action: "Reforçar criativos de MQL alto e enviar mais sinais via CAPI.",
      });
    }
  }

  if (c.roas !== null && p.roas !== null && p.roas > 0) {
    const roasVar = pctVar(c.roas, p.roas);
    if (roasVar < -20) {
      alerts.push({
        id: "roas-down",
        area: "VENDAS",
        severity: roasVar < -35 ? "ALTA" : "MÉDIA",
        title: "ROAS caiu",
        evidence: `ROAS: ${c.roas.toFixed(2)}x vs ${p.roas.toFixed(2)}x (${roasVar.toFixed(1)}%)`,
        signal: "↓ retorno por real investido caiu.",
        impact: "Lucro operacional por venda cai diretamente.",
        hypotheses: [
          "Receita caiu (menos vendas / ticket menor)",
          "Spend subiu sem proporção",
          "Vendas ainda não foram registradas no painel",
        ],
        checks: [
          "Vendas registradas vs vendas reais",
          "Receita por criativo",
          "Spend por campanha",
        ],
        next_action: "Validar se todas as vendas foram lançadas no painel antes de mexer em mídia.",
      });
    }
  }

  // TRACKING ─────────────────────────────────────────
  const leadsNoUtmRate = c.leads > 0 ? (c.leads_without_utms / c.leads) * 100 : 0;
  const leadsNoUtmRatePrev = p.leads > 0 ? (p.leads_without_utms / p.leads) * 100 : 0;
  if (leadsNoUtmRate - leadsNoUtmRatePrev > 20) {
    alerts.push({
      id: "leads-no-utm-up",
      area: "TRACKING",
      severity: "MÉDIA",
      title: "Leads sem UTM aumentaram muito",
      evidence: `${fmtPct(leadsNoUtmRate)} sem UTM vs ${fmtPct(leadsNoUtmRatePrev)} antes`,
      signal: "↑ atribuição quebrada — não dá pra saber a origem.",
      impact: "Decisões de mídia ficam às cegas.",
      hypotheses: [
        "Novos canais sem UTM (orgânico, indicação)",
        "Algum link com UTM quebrado",
        "Aumento de tráfego direto / link in bio",
      ],
      checks: [
        "Conferir links em bio do Instagram",
        "Validar UTMs nos criativos do Meta",
        "Olhar fonte 'direct' nas sessões",
      ],
      next_action: "Padronizar UTM em todos os pontos de entrada (bio, ads, links).",
    });
  }

  const ckRate = c.leads > 0 ? (c.leads_with_creative_key / c.leads) * 100 : 0;
  const ckRatePrev = p.leads > 0 ? (p.leads_with_creative_key / p.leads) * 100 : 0;
  if (ckRatePrev > 0 && ckRate - ckRatePrev < -10) {
    alerts.push({
      id: "creative-key-down",
      area: "TRACKING",
      severity: "ALTA",
      title: "Atribuição por creative_key piorou",
      evidence: `${fmtPct(ckRate)} dos leads têm creative_key vs ${fmtPct(ckRatePrev)} antes`,
      signal: "↓ menos leads conseguem ser ligados a um criativo específico.",
      impact: "Análise de criativos fica imprecisa, decisões pioram.",
      hypotheses: [
        "Variável dinâmica do Meta {{ad.name}} não substituiu",
        "Novos criativos sem padrão de utm_content",
        "Tráfego orgânico aumentou",
      ],
      checks: [
        "Verificar utm_content dos novos criativos",
        "Buscar leads com placeholder {{...}} no UTM",
        "Confirmar setup de URL no Meta",
      ],
      next_action: "Corrigir utm_content nos criativos sem creative_key.",
    });
  }

  const directVar = pctVar(c.direct_bio_leads, p.direct_bio_leads);
  if (p.direct_bio_leads > 0 && directVar > 50 && c.direct_bio_leads > 5) {
    alerts.push({
      id: "direct-bio-up",
      area: "TRACKING",
      severity: "MÉDIA",
      title: "Tráfego Direct/Link in Bio subiu muito",
      evidence: `Direct/Bio leads: ${fmtDelta(c.direct_bio_leads, p.direct_bio_leads)}`,
      signal: "↑ pode ser tracking quebrando OU genuíno aumento orgânico.",
      impact: "Difícil saber se é receita orgânica real ou ad sendo desatribuído.",
      hypotheses: [
        "UTMs sumiram nos ads do Meta",
        "Aumento real de tráfego de bio do Instagram",
        "Link sharing manual (whatsapp/comunidade)",
      ],
      checks: [
        "Comparar com volume de spend (subiu junto?)",
        "Olhar sessões com referrer instagram",
        "Validar UTMs na bio",
      ],
      next_action: "Confirmar se UTMs dos ads estão chegando antes de investir em orgânico.",
    });
  }

  // Sort by severity
  const order: Record<Severity, number> = { ALTA: 0, "MÉDIA": 1, BAIXA: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  return alerts;
}

// Markdown report ─────────────────────────────────────────
function buildMarkdown(ctx: RuleContext, alerts: Alert[]): string {
  const { current: c, previous: p } = ctx;
  const lines: string[] = [];

  // Header
  lines.push(`# 📊 Relatório Champion — Insights (Rules Engine)`);
  lines.push("");
  lines.push(`- **Período analisado:** ${ctx.period_label}`);
  lines.push(`- **Período de comparação:** ${ctx.previous_label}`);
  lines.push(`- **Filtros:** ${ctx.filters_label}`);
  lines.push(`- **Gerado em:** ${ctx.generated_at}`);
  lines.push("");

  // Resumo executivo
  lines.push(`## 🎯 Resumo executivo`);
  lines.push("");
  if (!p) {
    lines.push(`- ⚠️ Sem dados suficientes para comparar com o período anterior.`);
  } else {
    const high = alerts.filter((a) => a.severity === "ALTA").length;
    const med = alerts.filter((a) => a.severity === "MÉDIA").length;
    if (high === 0 && med === 0) {
      lines.push(`- ✅ Nenhuma anomalia crítica detectada vs período anterior.`);
    } else {
      lines.push(`- ${high} alerta(s) ALTA + ${med} MÉDIA detectados`);
    }
    const conv = pctVar(c.conversion_rate, p.conversion_rate);
    lines.push(`- Conversão landing → quiz finalizado: ${fmtPct(c.conversion_rate)} (${conv >= 0 ? "+" : ""}${conv.toFixed(1)}% vs anterior)`);
    const lv = pctVar(c.leads, p.leads);
    lines.push(`- Leads: ${fmtN(c.leads)} (${lv >= 0 ? "+" : ""}${lv.toFixed(1)}%) | MQL: ${fmtN(c.mql)} (${pctVar(c.mql, p.mql).toFixed(1)}%)`);
    if (c.spend > 0 || p.spend > 0) {
      const sv = pctVar(c.spend, p.spend);
      lines.push(`- Spend: ${fmtMoney(c.spend)} (${sv >= 0 ? "+" : ""}${sv.toFixed(1)}%) | CPL: ${c.cpl ? fmtMoney(c.cpl) : "—"} | CPMQL: ${c.cpmql ? fmtMoney(c.cpmql) : "—"}`);
    }
    if (c.revenue > 0 || p.revenue > 0) {
      lines.push(`- Receita: ${fmtMoney(c.revenue)} (${pctVar(c.revenue, p.revenue).toFixed(1)}%) | ROAS: ${c.roas ? `${c.roas.toFixed(2)}x` : "—"}`);
    }
    const urgency = high >= 3 ? "🚨 ALTA" : high >= 1 ? "⚠️ MÉDIA" : "🟢 BAIXA";
    lines.push(`- **Urgência:** ${urgency}`);
  }
  lines.push("");

  // Alertas
  lines.push(`## 🚨 Alertas priorizados`);
  lines.push("");
  if (alerts.length === 0) {
    lines.push(`*Nenhum alerta disparado nesse período.*`);
    lines.push("");
  } else {
    alerts.forEach((a, i) => {
      const sev = a.severity === "ALTA" ? "🔴 ALTA" : a.severity === "MÉDIA" ? "🟡 MÉDIA" : "🟢 BAIXA";
      lines.push(`### ${i + 1}. [${sev}] • [${a.area}] ${a.title}`);
      lines.push("");
      lines.push(`**Evidência:** ${a.evidence}`);
      lines.push("");
      lines.push(`**Sinal:** ${a.signal}`);
      lines.push("");
      lines.push(`**Impacto estimado:** ${a.impact}`);
      lines.push("");
      lines.push(`**Hipóteses:**`);
      a.hypotheses.forEach((h) => lines.push(`- ${h}`));
      lines.push("");
      lines.push(`**Checks:**`);
      a.checks.forEach((ch) => lines.push(`- ${ch}`));
      lines.push("");
      lines.push(`**Próxima ação:** ${a.next_action}`);
      lines.push("");
      lines.push(`---`);
      lines.push("");
    });
  }

  // Métricas-base
  lines.push(`## 📈 Base de métricas`);
  lines.push("");
  lines.push(`| Métrica | Atual | Anterior | Δ abs | Δ % |`);
  lines.push(`|---|---|---|---|---|`);
  function row(label: string, curr: number, prev: number | null, kind: "n" | "money" | "pct" = "n") {
    const fmt = kind === "money" ? fmtMoney : kind === "pct" ? fmtPct : fmtN;
    if (prev === null) {
      lines.push(`| ${label} | ${fmt(curr)} | — | — | — |`);
    } else {
      const dabs = curr - prev;
      const dpct = pctVar(curr, prev);
      lines.push(`| ${label} | ${fmt(curr)} | ${fmt(prev)} | ${dabs >= 0 ? "+" : ""}${kind === "money" ? fmtMoney(dabs) : kind === "pct" ? `${dabs.toFixed(1)}pp` : fmtN(dabs)} | ${dpct >= 0 ? "+" : ""}${dpct.toFixed(1)}% |`);
    }
  }
  row("Visitantes únicos", c.visitors, p?.visitors ?? null);
  row("Sessões", c.sessions, p?.sessions ?? null);
  row("Entraram no quiz", c.entered_quiz, p?.entered_quiz ?? null);
  row("Concluíram", c.completed, p?.completed ?? null);
  row("Taxa de conversão", c.conversion_rate, p?.conversion_rate ?? null, "pct");
  row("Drop-off total", c.drop_off_total, p?.drop_off_total ?? null);
  row("Total Leads", c.leads, p?.leads ?? null);
  row("Total MQL", c.mql, p?.mql ?? null);
  row("Taxa MQL", c.mql_rate, p?.mql_rate ?? null, "pct");
  row("Total Vendas", c.sales, p?.sales ?? null);
  row("Receita", c.revenue, p?.revenue ?? null, "money");
  row("Spend", c.spend, p?.spend ?? null, "money");
  if (c.cpl !== null) row("CPL", c.cpl, p?.cpl ?? null, "money");
  if (c.cpmql !== null) row("CPMQL", c.cpmql, p?.cpmql ?? null, "money");
  if (c.roas !== null) row("ROAS", c.roas, p?.roas ?? null);
  lines.push("");

  // Funil etapas
  if (c.step_funnel.length > 0) {
    lines.push(`## 🪜 Funil — drop-off por etapa`);
    lines.push("");
    lines.push(`| # | Etapa | Atual | Anterior | Drop atual | Drop anterior | Δ drop |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    let worstDrop = -Infinity;
    let worstId = "";
    let worstNew = -Infinity;
    let worstNewId = "";
    for (let i = 0; i < c.step_funnel.length; i++) {
      const step = c.step_funnel[i];
      const prevStep = p?.step_funnel[i];
      const cPrev = i > 0 ? c.step_funnel[i - 1].count : step.count;
      const cDrop = cPrev > 0 && i > 0 ? ((cPrev - step.count) / cPrev) * 100 : 0;
      const pPrev = i > 0 ? p?.step_funnel[i - 1]?.count ?? 0 : prevStep?.count ?? 0;
      const pDrop = pPrev > 0 && i > 0 ? ((pPrev - (prevStep?.count ?? 0)) / pPrev) * 100 : 0;
      const dDrop = cDrop - pDrop;
      if (cDrop > worstDrop) { worstDrop = cDrop; worstId = step.step_id; }
      if (dDrop > worstNew) { worstNew = dDrop; worstNewId = step.step_id; }
      lines.push(`| ${i + 1} | ${step.step_id} | ${fmtN(step.count)} | ${prevStep ? fmtN(prevStep.count) : "—"} | ${i > 0 ? fmtPct(cDrop) : "—"} | ${i > 0 && prevStep ? fmtPct(pDrop) : "—"} | ${i > 0 && prevStep ? `${dDrop >= 0 ? "+" : ""}${dDrop.toFixed(1)}pp` : "—"} |`);
    }
    if (worstId) lines.push("");
    if (worstId) lines.push(`> ⚠️ **Pior etapa (drop atual):** ${worstId} (${fmtPct(worstDrop)})`);
    if (worstNewId && worstNew > 5) lines.push(`> 📉 **Etapa que mais piorou vs anterior:** ${worstNewId} (+${worstNew.toFixed(1)}pp)`);
    lines.push("");
  }

  // Criativos
  if (c.top_creatives_leads.length > 0) {
    lines.push(`## 🎬 Top criativos`);
    lines.push("");
    lines.push(`### Top 5 por Leads`);
    lines.push(`| Criativo | Spend | Leads | MQL | %MQL | CPL | CPMQL | Vendas | Receita | ROAS |`);
    lines.push(`|---|---|---|---|---|---|---|---|---|---|`);
    c.top_creatives_leads.slice(0, 5).forEach((cr) => {
      const mqlRate = cr.leads > 0 ? (cr.mql / cr.leads) * 100 : 0;
      lines.push(`| ${cr.key} | ${fmtMoney(cr.spend)} | ${fmtN(cr.leads)} | ${fmtN(cr.mql)} | ${fmtPct(mqlRate)} | ${cr.cpl ? fmtMoney(cr.cpl) : "—"} | ${cr.cpmql ? fmtMoney(cr.cpmql) : "—"} | ${fmtN(cr.sales)} | ${fmtMoney(cr.revenue)} | ${cr.roas ? `${cr.roas.toFixed(2)}x` : "—"} |`);
    });
    lines.push("");

    if (c.top_creatives_mql.length > 0) {
      lines.push(`### Top 5 por MQL`);
      lines.push(`| Criativo | Leads | MQL | %MQL | Spend | CPMQL |`);
      lines.push(`|---|---|---|---|---|---|`);
      c.top_creatives_mql.slice(0, 5).forEach((cr) => {
        lines.push(`| ${cr.key} | ${fmtN(cr.leads)} | ${fmtN(cr.mql)} | ${fmtPct(cr.mql_rate)} | ${fmtMoney(cr.spend)} | ${cr.cpmql ? fmtMoney(cr.cpmql) : "—"} |`);
      });
      lines.push("");
    }

    if (c.top_creatives_revenue.length > 0) {
      lines.push(`### Top 5 por Receita`);
      lines.push(`| Criativo | Leads | Vendas | Receita | ROAS |`);
      lines.push(`|---|---|---|---|---|`);
      c.top_creatives_revenue.slice(0, 5).forEach((cr) => {
        lines.push(`| ${cr.key} | ${fmtN(cr.leads)} | ${fmtN(cr.sales)} | ${fmtMoney(cr.revenue)} | ${cr.roas ? `${cr.roas.toFixed(2)}x` : "—"} |`);
      });
      lines.push("");
    }

    // Anomalias
    const anomalies: string[] = [];
    const avgMqlRate = c.leads > 0 ? (c.mql / c.leads) * 100 : 0;
    c.top_creatives_leads.forEach((cr) => {
      if (cr.spend > 100 && cr.leads < 5) anomalies.push(`⚠️ "${cr.key}" gastou ${fmtMoney(cr.spend)} e gerou só ${cr.leads} leads`);
      const mr = cr.leads > 0 ? (cr.mql / cr.leads) * 100 : 0;
      if (cr.leads >= 10 && avgMqlRate > 0 && mr < avgMqlRate * 0.5) {
        anomalies.push(`⚠️ "${cr.key}" tem %MQL ${fmtPct(mr)} (média: ${fmtPct(avgMqlRate)})`);
      }
    });
    if (anomalies.length > 0) {
      lines.push(`**Anomalias detectadas:**`);
      anomalies.forEach((a) => lines.push(`- ${a}`));
      lines.push("");
    }
  }

  // Qualidade dos dados
  lines.push(`## 🔍 Qualidade dos dados / tracking`);
  lines.push("");
  const ckRate = c.leads > 0 ? (c.leads_with_creative_key / c.leads) * 100 : 0;
  const utmRate = c.leads > 0 ? ((c.leads - c.leads_without_utms) / c.leads) * 100 : 0;
  lines.push(`- **% leads com creative_key:** ${fmtPct(ckRate)} (${fmtN(c.leads_with_creative_key)}/${fmtN(c.leads)})`);
  lines.push(`- **% leads com UTM:** ${fmtPct(utmRate)} (${fmtN(c.leads_without_utms)} sem UTM)`);
  lines.push(`- **Vendas sem creative_key:** ${fmtN(c.sales_without_creative_key)}`);
  lines.push(`- **Leads Direct/Link in Bio:** ${fmtN(c.direct_bio_leads)}`);
  lines.push("");

  // Checklist final
  if (alerts.length > 0) {
    lines.push(`## ✅ Ações recomendadas (checklist)`);
    lines.push("");
    const byArea: Record<Area, Alert[]> = { FUNIL: [], TRACKING: [], CRIATIVOS: [], MQL: [], VENDAS: [], DADOS: [] };
    alerts.forEach((a) => byArea[a.area].push(a));
    (["FUNIL", "CRIATIVOS", "MQL", "VENDAS", "TRACKING", "DADOS"] as Area[]).forEach((area) => {
      if (byArea[area].length === 0) return;
      lines.push(`### ${area}`);
      byArea[area].forEach((a) => {
        const tag = a.severity === "ALTA" ? "🔴" : a.severity === "MÉDIA" ? "🟡" : "🟢";
        lines.push(`- ${tag} ${a.next_action}`);
      });
      lines.push("");
    });
  }

  return lines.join("\n");
}

export function runRulesEngine(
  current: PeriodMetrics,
  previous: PeriodMetrics | null,
  meta: { period_label: string; previous_label: string; filters_label: string }
): RulesEngineResult {
  const ctx: RuleContext = {
    current,
    previous,
    period_label: meta.period_label,
    previous_label: meta.previous_label,
    filters_label: meta.filters_label,
    generated_at: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  };
  const alerts = runRules(ctx);
  const report_markdown = buildMarkdown(ctx, alerts);
  return { alerts, report_markdown, has_comparison: previous !== null };
}
