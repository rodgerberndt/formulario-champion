// ── Metas Comercial — histórico real e baseline do forecast ──────────────────
//
// Regra da casa: meta futura só vale se sair de dado passado real. Este módulo
// não projeta nada. Ele apenas lê o que aconteceu (ad_spend, leads, meetings,
// manual_sales), fecha por mês e devolve as taxas de conversão da janela de
// baseline. A projeção acontece no front, onde as premissas são editáveis.
//
// Fuso: as colunas de data (`sale_date`, `ad_spend.date`) já são civis; as de
// timestamp são UTC e viram mês pelo horário de Brasília (-03:00, fixo — o país
// não usa mais horário de verão). Sem isso todo evento entre 21h e 00h cairia
// no mês seguinte, que foi exatamente o bug já corrigido no bloco semanal.

import { isRealizada, jaAconteceu, pendenteDeMarcacao, type MeetingRow } from "./meetings.ts";

const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Mês civil brasileiro (YYYY-MM) de um timestamp UTC. */
export function monthOfTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t - SAO_PAULO_OFFSET_MS).toISOString().slice(0, 7);
}

/** Mês civil de uma coluna DATE (já sem fuso). */
export function monthOfDate(d: string | null | undefined): string | null {
  return d ? d.slice(0, 7) : null;
}

// Mesma régua de MQL do resto do painel: faturamento declarado ≥ R$ 10 mil/mês.
// Duplicada de propósito (o endpoint /creatives tem a sua) para que mudar a
// régua de uma análise nunca reescreva a meta comercial sem alguém perceber.
const MQL_FAIXAS = [
  "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
  "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
];

function isMqlLead(lead: { investimento_faixa?: string | null; sdr_override?: string | null }): boolean {
  if (lead.sdr_override === "Dara" || lead.sdr_override === "Miguel") return false;
  return lead.investimento_faixa ? MQL_FAIXAS.includes(lead.investimento_faixa) : false;
}

// Cada body rende 4 ganchos. Espelha bodiesForSale do CreativesTab — a mesma
// conta que transforma contrato em custo de produção.
const HOOKS_PER_BODY = 4;
const FALLBACK_BODIES_PER_MONTH = 25;

export function bodiesForSale(sale: {
  delivery_months?: number | null;
  ads_contracted?: number | null;
  bodies_per_month?: number | null;
}): { bodies: number; perMonth: number; estimated: boolean } {
  const months = Number(sale.delivery_months) || 0;
  const ads = Number(sale.ads_contracted) || 0;
  const bpm = Number(sale.bodies_per_month) || 0;
  if (ads > 0 && months > 0) {
    const perMonth = Math.floor(ads / months / HOOKS_PER_BODY);
    return { bodies: perMonth * months, perMonth, estimated: false };
  }
  if (ads > 0) {
    const perMonth = Math.floor(ads / HOOKS_PER_BODY);
    return { bodies: perMonth, perMonth, estimated: false };
  }
  if (bpm > 0 && months > 0) return { bodies: bpm * months, perMonth: bpm, estimated: false };
  return { bodies: months * FALLBACK_BODIES_PER_MONTH, perMonth: FALLBACK_BODIES_PER_MONTH, estimated: months > 0 };
}

interface MonthBucket {
  ym: string;
  spend: number;
  leads: number;
  mql: number;
  meetings: number;
  meetings_attended: number;
  meetings_decided: number;
  /** MQL DESTE mês que agendaram reunião, em qualquer data. Base da taxa. */
  mql_agendaram: number;
  sales: number;
  sales_sprint: number;
  sales_assessoria: number;
  revenue: number;
  revenue_sprint: number;
  revenue_assessoria: number;
  received: number;
  delivery_bodies: number;
}

function emptyMonth(ym: string): MonthBucket {
  return {
    ym, spend: 0, leads: 0, mql: 0, meetings: 0, meetings_attended: 0, meetings_decided: 0, mql_agendaram: 0,
    sales: 0, sales_sprint: 0, sales_assessoria: 0,
    revenue: 0, revenue_sprint: 0, revenue_assessoria: 0, received: 0, delivery_bodies: 0,
  };
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Quantos sprints a venda representa. O Sprint é vendido por nível — "nível 4"
 * são quatro sprints numa linha só — e contar linhas subestima o volume.
 * Nulo vale 1: venda antiga sem o campo é uma unidade, não zero.
 */
function sprintsDaVenda(v: { sprint_levels?: number | null }): number {
  const n = Number(v?.sprint_levels);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

export interface CommercialGoalsResult {
  today: string;
  current_month: string;
  months: Array<MonthBucket & {
    label: string;
    partial: boolean;
    cpl: number | null;
    cpmql: number | null;
    mql_rate: number | null;
    meeting_rate: number | null;
    show_rate: number | null;
    close_rate: number | null;
    close_rate_assessoria: number | null;
    cost_per_attended: number | null;
    cac: number | null;
    ticket: number | null;
    ticket_assessoria: number | null;
    received_share: number | null;
    roas: number | null;
    spend_tracked: boolean;
  }>;
  baseline: {
    from: string;
    to: string;
    days: number;
    cost_from: string;
    cost_days: number;
    cost_totals: MonthBucket;
    totals: MonthBucket;
    rates: Record<string, number | null>;
    sources: Record<string, string>;
    samples: Record<string, number>;
    confidence: string;
    warnings: string[];
  };
  all_time: { totals: MonthBucket; rates: Record<string, number | null> };
  committed_revenue: Array<{ ym: string; amount: number }>;
  backlog_unscheduled: number;
  contracts: Array<{
    id: string;
    notes: string | null;
    sale_type: string;
    sale_date: string;
    revenue: number;
    received: number;
    delivery_months: number | null;
    bodies_per_month: number;
    bodies_total: number;
    estimated: boolean;
    ends_at: string | null;
  }>;
}

/**
 * Lê o histórico comercial inteiro e devolve os meses fechados + a baseline.
 *
 * Ignora de propósito os filtros globais de página e de criativo do admin: a
 * meta é da operação inteira, não de uma variante de headline. O front avisa
 * isso na tela para ninguém achar que o número está filtrado.
 */
export async function buildCommercialGoals(
  supabase: any,
  opts: { monthsBack: number; baselineDays: number; forecastMonths: number; baselineFrom?: string | null },
): Promise<CommercialGoalsResult> {
  const { monthsBack, forecastMonths } = opts;
  let { baselineDays } = opts;

  const nowUtc = Date.now();
  const todayBr = new Date(nowUtc - SAO_PAULO_OFFSET_MS).toISOString().slice(0, 10);
  const currentMonth = todayBr.slice(0, 7);
  const firstMonth = shiftMonth(currentMonth, -(monthsBack - 1));
  const historyFromDate = `${firstMonth}-01`;
  const historyFromISO = `${historyFromDate}T00:00:00.000Z`;

  // A janela pode vir por dias corridos ou por data de início (o preset "mês
  // passado + atual", que é como o time lê o negócio: por mês fechado).
  const baselineFromDate = opts.baselineFrom
    ? opts.baselineFrom
    : new Date(nowUtc - baselineDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (opts.baselineFrom) {
    baselineDays = Math.max(
      1,
      Math.round((Date.parse(`${todayBr}T00:00:00Z`) - Date.parse(`${baselineFromDate}T00:00:00Z`)) / 86400000) + 1,
    );
  }

  // ── Leituras ──
  //
  // As quatro fontes são independentes entre si, então correm em paralelo. Antes
  // eram sequenciais e o tempo da rota era a SOMA das quatro — com a paginação
  // de leads e de ad_spend dentro, isso passava de dez round-trips em fila.
  const PAGE_SIZE = 1000;

  /**
   * Lê uma tabela inteira em páginas de PAGE_SIZE.
   *
   * A primeira página vem sozinha para descobrir se há mais de uma; se houver,
   * as seguintes são pedidas de uma vez. Paginar é inevitável (o PostgREST tem
   * teto por resposta), mas esperar uma página de cada vez não é.
   */
  const readAllPages = async <T,>(
    build: (q: any) => any,
    table: string,
    columns: string,
  ): Promise<T[]> => {
    const page = (from: number) =>
      build(supabase.from(table).select(columns)).range(from, from + PAGE_SIZE - 1);

    const { data, error } = await page(0);
    if (error) throw error;
    const rows: T[] = (data || []) as T[];
    if (rows.length < PAGE_SIZE) return rows;

    // Há mais de uma página. Busca as próximas em lotes paralelos até secar.
    const PARALLEL = 4;
    let offset = PAGE_SIZE;
    for (;;) {
      const lote = await Promise.all(
        Array.from({ length: PARALLEL }, (_, i) => page(offset + i * PAGE_SIZE)),
      );
      let ultima = false;
      for (const r of lote) {
        if (r.error) throw r.error;
        const d = (r.data || []) as T[];
        rows.push(...d);
        if (d.length < PAGE_SIZE) ultima = true;
      }
      if (ultima) return rows;
      offset += PARALLEL * PAGE_SIZE;
    }
  };

  const [leads, spendRows, meetingRows, saleRows] = await Promise.all([
    readAllPages<{ id: string; created_at: string; investimento_faixa: string | null; sdr_override: string | null }>(
      (q) => q.gte("created_at", historyFromISO),
      "leads",
      // `id` entra para ligar o lead à reunião que ele gerou: a taxa de
      // agendamento é medida por coorte de lead, não por data de reunião.
      "id, created_at, investimento_faixa, sdr_override",
    ),
    readAllPages<{ date: string; spend: number }>(
      (q) => q.gte("date", historyFromDate),
      "ad_spend",
      "date, spend",
    ),
    (async () => {
      // Só mídia paga. Este módulo projeta QUANTO INVESTIR para bater a meta,
      // e a projeção sai de taxas do funil pago. Reunião de indicação ou de
      // social selling entrando aqui melhoraria a taxa sem que um real de mídia
      // tivesse participado — e o plano mandaria investir menos do que precisa.
      // A receita desses outros funis continua contando na meta do mês
      // (rota /metas) e aparece separada em /funis.
      const { data, error } = await supabase
        .from("meetings")
        .select("created_at, attended, status, scheduled_at, lead_id")
        .eq("origem", "midia_paga")
        .gte("created_at", historyFromISO);
      if (error) throw error;
      return (data || []) as Array<MeetingRow & { created_at: string }>;
    })(),
    // Vendas: SEM recorte de período. O histórico completo alimenta o fallback
    // das taxas quando a janela de baseline tem poucas vendas, e os contratos em
    // andamento (recorrência/parcelas) definem a receita já comprometida.
    (async () => {
      const { data, error } = await supabase
        .from("manual_sales")
        .select("id, sale_date, revenue, amount_received, sale_type, payment_type, installments_count, installment_value, delivery_months, ads_contracted, bodies_per_month, sprint_levels, notes")
        .eq("origem", "midia_paga")
        // Reembolsada não é receita nem contrato em andamento.
        .is("refunded_at", null);
      if (error) throw error;
      return data || [];
    })(),
  ]);

  const sales = saleRows || [];

  // ── Agregação por mês ──
  const months = new Map<string, MonthBucket>();
  for (let i = 0; i < monthsBack; i++) {
    const ym = shiftMonth(firstMonth, i);
    months.set(ym, emptyMonth(ym));
  }
  const bucket = (ym: string | null): MonthBucket | null => (ym ? months.get(ym) || null : null);

  for (const row of spendRows) {
    const b = bucket(monthOfDate(row.date));
    if (b) b.spend += Number(row.spend) || 0;
  }
  // Quem agendou, olhando pelo LEAD e não pela data da reunião. Sem isso a taxa
  // de agendamento compara dois grupos diferentes e passa de 100%.
  const agendaram = new Set(
    (meetingRows || []).map((m) => (m as { lead_id?: string }).lead_id).filter(Boolean) as string[],
  );
  for (const lead of leads) {
    const b = bucket(monthOfTimestamp(lead.created_at));
    if (!b) continue;
    b.leads += 1;
    if (isMqlLead(lead)) {
      b.mql += 1;
      if (agendaram.has((lead as { id?: string }).id ?? "")) b.mql_agendaram += 1;
    }
  }
  for (const m of (meetingRows || [])) {
    const b = bucket(monthOfTimestamp(m.created_at));
    if (!b) continue;
    b.meetings += 1;
    if (isRealizada(m)) b.meetings_attended += 1;
    if (jaAconteceu(m)) b.meetings_decided += 1;
  }
  for (const s of sales) {
    const b = bucket(monthOfDate(s.sale_date));
    if (!b) continue;
    const revenue = Number(s.revenue) || 0;
    b.sales += 1;
    b.revenue += revenue;
    b.received += Number(s.amount_received) || 0;
    if (s.sale_type === "assessoria") {
      b.sales_assessoria += 1;
      b.revenue_assessoria += revenue;
      b.delivery_bodies += bodiesForSale(s).bodies;
    } else if (s.sale_type === "parceria") {
      // Parceria não entra na projeção de receita: ela não tem TCV, e o plano
      // comercial projeta quanto investir para atingir um valor contratado.
      // Contá-la como venda de R$ 0 baixaria o ticket médio da projeção inteira.
    } else {
      b.sales_sprint += sprintsDaVenda(s);
      b.revenue_sprint += revenue;
    }
  }

  // O histórico começa onde o sistema começou a ser usado, não onde a janela
  // pedida cai: meses anteriores ao primeiro sinal (lead, gasto, reunião ou
  // venda) são linhas vazias que só empurram o que importa para baixo. O corte é
  // de PREFIXO — um mês morto no meio da operação continua na tabela, porque
  // esse sim é informação.
  const sortedMonths = [...months.values()].sort((a, b) => a.ym.localeCompare(b.ym));
  const hasSignal = (m: MonthBucket) =>
    m.leads > 0 || m.spend > 0 || m.meetings > 0 || m.sales > 0 || m.revenue > 0;
  const firstSignal = sortedMonths.findIndex(hasSignal);
  const monthList = firstSignal <= 0 ? sortedMonths : sortedMonths.slice(firstSignal);

  // ── Baseline (janela móvel) e histórico completo, para o fallback ──
  const sumWindow = (fromDate: string): MonthBucket => {
    const acc = emptyMonth(`${fromDate}..${todayBr}`);
    const fromISO = `${fromDate}T00:00:00.000Z`;
    for (const row of spendRows) if (row.date >= fromDate) acc.spend += Number(row.spend) || 0;
    for (const lead of leads) {
      if (lead.created_at < fromISO) continue;
      acc.leads += 1;
      if (isMqlLead(lead)) {
        acc.mql += 1;
        if (agendaram.has((lead as { id?: string }).id ?? "")) acc.mql_agendaram += 1;
      }
    }
    for (const m of (meetingRows || [])) {
      if (m.created_at < fromISO) continue;
      acc.meetings += 1;
      if (isRealizada(m)) acc.meetings_attended += 1;
      if (jaAconteceu(m)) acc.meetings_decided += 1;
    }
    for (const s of sales) {
      if (!s.sale_date || s.sale_date < fromDate) continue;
      const revenue = Number(s.revenue) || 0;
      acc.sales += 1;
      acc.revenue += revenue;
      acc.received += Number(s.amount_received) || 0;
      if (s.sale_type === "assessoria") {
        acc.sales_assessoria += 1;
        acc.revenue_assessoria += revenue;
        acc.delivery_bodies += bodiesForSale(s).bodies;
      } else if (s.sale_type === "parceria") {
        // Mesma razão do bloco por mês: parceria não tem TCV para projetar.
      } else {
        acc.sales_sprint += sprintsDaVenda(s);
        acc.revenue_sprint += revenue;
      }
    }
    return acc;
  };

  const windowTotals = sumWindow(baselineFromDate);

  // Custo por lead e por MQL só podem ser lidos no trecho da janela em que
  // EXISTE registro de gasto. A tabela `ad_spend` começa quando o sync do Meta
  // foi ligado; antes disso há lead sem custo nenhum, e dividir o gasto de dois
  // meses pelos leads de cinco faz o MQL parecer barato de mentira.
  const spendDatesInWindow = spendRows
    .filter((r) => r.date >= baselineFromDate && (Number(r.spend) || 0) > 0)
    .map((r) => r.date)
    .sort();
  const costFromDate = spendDatesInWindow.length
    ? (spendDatesInWindow[0] > baselineFromDate ? spendDatesInWindow[0] : baselineFromDate)
    : baselineFromDate;
  const costTotals = costFromDate === baselineFromDate ? windowTotals : sumWindow(costFromDate);
  const costDays = Math.max(
    1,
    Math.round((Date.parse(`${todayBr}T00:00:00Z`) - Date.parse(`${costFromDate}T00:00:00Z`)) / 86400000) + 1,
  );
  // O histórico completo é limitado pelas leituras acima (leads/spend/meetings
  // vêm desde `historyFromDate`); vendas, essas sim, são todas.
  const allTimeTotals = sumWindow("2000-01-01");

  const ratesOf = (t: MonthBucket) => ({
    mql_rate: ratio(t.mql, t.leads),
    cpl: ratio(t.spend, t.leads),
    cpmql: ratio(t.spend, t.mql),
    // Coorte: dos MQL do período, quantos agendaram. Não é "reuniões do
    // período ÷ MQL do período", que mistura grupos.
    meeting_rate: ratio(t.mql_agendaram, t.mql),
    // Denominador é só reunião JÁ DECIDIDA (realizada ou no-show). Call marcada
    // para daqui a três dias não é falta de ninguém, e enquanto o campo era
    // booleano ela contava como uma.
    show_rate: ratio(t.meetings_attended, t.meetings_decided),
    close_rate: ratio(t.sales, t.meetings_attended),
    // Assessoria fecha na reunião; Sprint não passa por reunião nenhuma — sai do
    // lead abaixo de R$ 10 mil, direto com o SDR. Misturar os dois dá taxas
    // impossíveis (oito vendas em oito reuniões) e some com o que decide.
    close_rate_assessoria: ratio(t.sales_assessoria, t.meetings_attended),
    sprint_per_non_mql: ratio(t.sales_sprint, t.leads - t.mql),
    cost_per_attended: ratio(t.spend, t.meetings_attended),
    ticket: ratio(t.revenue, t.sales),
    ticket_sprint: ratio(t.revenue_sprint, t.sales_sprint),
    ticket_assessoria: ratio(t.revenue_assessoria, t.sales_assessoria),
    mix_assessoria: ratio(t.sales_assessoria, t.sales),
    cac: ratio(t.spend, t.sales),
    roas: ratio(t.revenue, t.spend),
    received_share: ratio(t.received, t.revenue),
    bodies_per_assessoria: ratio(t.delivery_bodies, t.sales_assessoria),
  });

  const windowRates = { ...ratesOf(windowTotals), cpl: ratio(costTotals.spend, costTotals.leads), cpmql: ratio(costTotals.spend, costTotals.mql) };
  const allTimeRates = ratesOf(allTimeTotals);

  // Amostra mínima por taxa. Abaixo disso a janela mente mais do que informa e a
  // taxa cai para o histórico inteiro — marcado em `sources`, para a tela poder
  // dizer de onde veio cada número em vez de fingir precisão.
  const MIN_SAMPLE: Record<string, { sample: number; min: number }> = {
    mql_rate: { sample: windowTotals.leads, min: 20 },
    cpl: { sample: costTotals.leads, min: 20 },
    cpmql: { sample: costTotals.mql, min: 8 },
    meeting_rate: { sample: windowTotals.mql, min: 8 },
    show_rate: { sample: windowTotals.meetings_decided, min: 5 },
    close_rate: { sample: windowTotals.meetings_attended, min: 4 },
    close_rate_assessoria: { sample: windowTotals.meetings_attended, min: 4 },
    sprint_per_non_mql: { sample: Math.max(0, windowTotals.leads - windowTotals.mql), min: 20 },
    cost_per_attended: { sample: windowTotals.meetings_attended, min: 4 },
    ticket: { sample: windowTotals.sales, min: 3 },
    ticket_sprint: { sample: windowTotals.sales_sprint, min: 2 },
    ticket_assessoria: { sample: windowTotals.sales_assessoria, min: 2 },
    mix_assessoria: { sample: windowTotals.sales, min: 3 },
    cac: { sample: windowTotals.sales, min: 3 },
    roas: { sample: windowTotals.sales, min: 3 },
    received_share: { sample: windowTotals.sales, min: 3 },
    bodies_per_assessoria: { sample: windowTotals.sales_assessoria, min: 1 },
  };

  const rates: Record<string, number | null> = {};
  const sources: Record<string, string> = {};
  const samples: Record<string, number> = {};
  const warnings: string[] = [];

  for (const key of Object.keys(MIN_SAMPLE)) {
    const { sample, min } = MIN_SAMPLE[key];
    const windowValue = (windowRates as Record<string, number | null>)[key];
    const useWindow = windowValue !== null && sample >= min;
    rates[key] = useWindow ? windowValue : (allTimeRates as Record<string, number | null>)[key];
    sources[key] = useWindow ? "janela" : "historico";
    samples[key] = sample;
  }

  if (sources.close_rate === "historico") {
    warnings.push(
      `Taxa de fechamento veio do histórico inteiro (${allTimeTotals.sales} vendas em ${allTimeTotals.meetings_attended} reuniões realizadas): a janela de ${baselineDays} dias tem só ${windowTotals.meetings_attended} reuniões marcadas como realizadas.`,
    );
  }
  if (allTimeTotals.meetings_attended === 0 && allTimeTotals.meetings > 0) {
    warnings.push(
      "Nenhuma reunião foi marcada como REALIZADA no painel. Sem isso não existe taxa de comparecimento nem de fechamento reais, e o forecast cai na premissa manual nessas duas etapas.",
    );
  }
  const pendentes = (meetingRows || []).filter((m) => pendenteDeMarcacao(m)).length;
  if (pendentes > 0) {
    warnings.push(
      `${pendentes} ${pendentes === 1 ? "reunião já passou da data e continua" : "reuniões já passaram da data e continuam"} sem desfecho marcado. Elas ficam fora do comparecimento — enquanto ninguém marcar, a taxa sobe por falta de registro, não por presença.`,
    );
  }
  if (costFromDate !== baselineFromDate) {
    warnings.push(
      `Custo por lead e por MQL foram medidos só de ${costFromDate} em diante, que é quando começa o registro de gasto em ad_spend. No resto da janela há lead sem custo lançado, e incluí-lo faria o MQL parecer ${((windowTotals.mql > 0 ? costTotals.spend / windowTotals.mql : 0) / (costTotals.mql > 0 ? costTotals.spend / costTotals.mql : 1) * 100).toFixed(0)}% do preço real.`,
    );
  }
  if (sources.cpmql === "historico") {
    warnings.push(`Custo por MQL veio do histórico inteiro: a janela de ${baselineDays} dias tem só ${windowTotals.mql} MQL.`);
  }

  const confidence =
    windowTotals.sales >= 6 && windowTotals.mql >= 40 ? "alta"
      : windowTotals.sales >= 2 && windowTotals.mql >= 12 ? "media"
        : "baixa";

  // ── Receita já comprometida (parcelas e recorrências que caem nos próximos meses) ──
  const committed = new Map<string, number>();
  for (let i = 0; i < forecastMonths; i++) committed.set(shiftMonth(currentMonth, i + 1), 0);
  let backlogUnscheduled = 0;
  const contracts: CommercialGoalsResult["contracts"] = [];

  for (const s of sales) {
    const revenue = Number(s.revenue) || 0;
    const received = Number(s.amount_received) || 0;
    const parcels = Number(s.installments_count) || 0;
    const parcelValue = Number(s.installment_value) || 0;
    const saleMonth = monthOfDate(s.sale_date);
    if (!saleMonth) continue;

    if (s.payment_type !== "tcv_total" && parcels > 0 && parcelValue > 0) {
      // Parcela 1 no mês da venda; as seguintes, um mês por vez.
      for (let n = 1; n < parcels; n++) {
        const ym = shiftMonth(saleMonth, n);
        if (committed.has(ym)) committed.set(ym, (committed.get(ym) || 0) + parcelValue);
      }
    } else if (revenue - received > 0.01) {
      backlogUnscheduled += revenue - received;
    }

    const { bodies, perMonth, estimated } = bodiesForSale(s);
    const deliveryMonths = Number(s.delivery_months) || 0;
    contracts.push({
      id: s.id,
      notes: s.notes || null,
      sale_type: s.sale_type,
      sale_date: s.sale_date,
      revenue,
      received,
      delivery_months: deliveryMonths || null,
      bodies_per_month: perMonth,
      bodies_total: bodies,
      estimated,
      ends_at: deliveryMonths > 0 ? shiftMonth(saleMonth, Math.round(deliveryMonths)) : null,
    });
  }

  const monthLabel = (ym: string): string => {
    const [y, m] = ym.split("-");
    const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return `${nomes[Number(m) - 1]}/${y.slice(2)}`;
  };

  return {
    today: todayBr,
    current_month: currentMonth,
    months: monthList.map((m) => ({
      ...m,
      label: monthLabel(m.ym),
      partial: m.ym === currentMonth,
      cpl: ratio(m.spend, m.leads),
      cpmql: ratio(m.spend, m.mql),
      mql_rate: ratio(m.mql, m.leads),
      meeting_rate: ratio(m.mql_agendaram, m.mql),
      show_rate: ratio(m.meetings_attended, m.meetings_decided),
      close_rate: ratio(m.sales, m.meetings_attended),
      // Só a assessoria passa por reunião; medir fechamento com a Sprint dentro
      // dá taxa acima de 100% em mês de muita Sprint e nenhuma reunião.
      close_rate_assessoria: ratio(m.sales_assessoria, m.meetings_attended),
      cost_per_attended: ratio(m.spend, m.meetings_attended),
      cac: ratio(m.spend, m.sales),
      ticket: ratio(m.revenue, m.sales),
      ticket_assessoria: ratio(m.revenue_assessoria, m.sales_assessoria),
      received_share: ratio(m.received, m.revenue),
      roas: ratio(m.revenue, m.spend),
      // Um mês anterior ao sync do Meta tem lead sem custo: a tabela precisa
      // saber a diferença entre "custou zero" e "não foi medido".
      spend_tracked: m.spend > 0,
    })),
    baseline: {
      from: baselineFromDate,
      to: todayBr,
      days: baselineDays,
      cost_from: costFromDate,
      cost_days: costDays,
      cost_totals: costTotals,
      totals: windowTotals,
      rates,
      sources,
      samples,
      confidence,
      warnings,
    },
    all_time: { totals: allTimeTotals, rates: allTimeRates },
    committed_revenue: [...committed.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, amount]) => ({ ym, amount })),
    backlog_unscheduled: backlogUnscheduled,
    contracts: contracts.sort((a, b) => b.sale_date.localeCompare(a.sale_date)),
  };
}
