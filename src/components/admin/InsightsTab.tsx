import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Copy, RefreshCw, Sparkles, AlertTriangle, CheckCircle2, CalendarIcon, Trophy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useDateRange } from "@/context/DateRangeContext";
import { runRulesEngine, type PeriodMetrics, type Alert, type DistributionItem, type ICP, type RecentLead, type MarketPainCombo } from "@/lib/rulesEngine";
import { getTierFromFaturamento } from "@/lib/leadScoring";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
}

interface RawData {
  metrics: any;
  leads: any[];
  creatives: any;
}

// MQL faixas (≥ 10k) — fonte da verdade
const MQL_FAIXAS = new Set([
  "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
  "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
]);

const isLeadMql = (l: any) =>
  l?.faturamento_faixa && MQL_FAIXAS.has(l.faturamento_faixa) && l.sdr_override !== "Dara";

const normalizeOrigem = (l: any): string => {
  const src = (l.utm_source || "").trim().toLowerCase();
  const med = (l.utm_medium || "").trim().toLowerCase();
  if (!src || src === "direct") return "direct/sem-utm";
  if (med === "bio" || med === "link-in-bio" || src === "instagram") return "link-in-bio";
  return src;
};

const normStr = (v: any): string => {
  const s = (v ?? "").toString().trim();
  return s.length > 0 ? s : "—";
};



function buildDistribution(
  leads: any[],
  getter: (l: any) => string,
  totalLeads: number
): DistributionItem[] {
  const buckets: Record<string, { total: number; mql: number }> = {};
  leads.forEach((l) => {
    const k = getter(l);
    if (!buckets[k]) buckets[k] = { total: 0, mql: 0 };
    buckets[k].total += 1;
    if (isLeadMql(l)) buckets[k].mql += 1;
  });
  return Object.entries(buckets)
    .map(([key, v]) => ({
      key,
      total: v.total,
      mql: v.mql,
      mql_rate: v.total > 0 ? (v.mql / v.total) * 100 : 0,
      share: totalLeads > 0 ? (v.total / totalLeads) * 100 : 0,
    }))
    .sort((a, b) => b.mql - a.mql || b.total - a.total);
}

function buildMarketPainCombos(leads: any[]): MarketPainCombo[] {
  const buckets: Record<string, { mercado: string; dor: string; total: number; mql: number }> = {};
  leads.forEach((l) => {
    const m = normStr(l.mercado);
    const d = normStr(l.dor_desejo).slice(0, 80);
    const k = `${m}__${d}`;
    if (!buckets[k]) buckets[k] = { mercado: m, dor: d, total: 0, mql: 0 };
    buckets[k].total += 1;
    if (isLeadMql(l)) buckets[k].mql += 1;
  });
  return Object.values(buckets)
    .map((v) => ({ ...v, mql_rate: v.total > 0 ? (v.mql / v.total) * 100 : 0 }))
    .sort((a, b) => b.mql - a.mql || b.total - a.total)
    .slice(0, 10);
}

function buildICPs(leads: any[]): ICP[] {
  const buckets: Record<string, { mercado: string; estagio: string; faturamento: string; dor: string; total: number; mql: number; origens: Record<string, number> }> = {};
  leads.forEach((l) => {
    if (!isLeadMql(l)) return; // ICP é construído sobre MQLs
    const mercado = normStr(l.mercado);
    const estagio = normStr(l.estagio_negocio);
    const faturamento = normStr(l.faturamento_faixa);
    const dor = normStr(l.dor_desejo).slice(0, 60);
    const k = `${mercado}__${estagio}__${faturamento}__${dor}`;
    if (!buckets[k]) buckets[k] = { mercado, estagio, faturamento, dor, total: 0, mql: 0, origens: {} };
    buckets[k].total += 1;
    buckets[k].mql += 1;
    const o = normalizeOrigem(l);
    buckets[k].origens[o] = (buckets[k].origens[o] || 0) + 1;
  });
  return Object.values(buckets)
    .map((v) => {
      const origem_dominante = Object.entries(v.origens).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      return {
        label: `${v.mercado} · ${v.estagio} · ${v.faturamento} · ${v.dor}`,
        mercado: v.mercado,
        estagio: v.estagio,
        faturamento: v.faturamento,
        dor: v.dor,
        total: v.total,
        mql: v.mql,
        mql_rate: 100,
        origem_dominante,
      } as ICP;
    })
    .sort((a, b) => b.mql - a.mql)
    .slice(0, 3);
}

function buildRecentTop(leads: any[]): RecentLead[] {
  const sorted = [...leads].sort((a, b) => {
    const am = isLeadMql(a) ? 1 : 0;
    const bm = isLeadMql(b) ? 1 : 0;
    if (am !== bm) return bm - am; // MQLs primeiro
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
  return sorted.slice(0, 10).map((l) => ({
    date: l.created_at ? new Date(l.created_at).toLocaleDateString("pt-BR") : "—",
    nome: normStr(l.nome_completo).slice(0, 40),
    mercado: normStr(l.mercado),
    estagio: normStr(l.estagio_negocio),
    faturamento: normStr(l.faturamento_faixa),
    dor: normStr(l.dor_desejo).slice(0, 60),
    tier: getTierFromFaturamento(l.faturamento_faixa),
    is_mql: isLeadMql(l),
    origem: normalizeOrigem(l),
  }));
}

// Build PeriodMetrics from raw API responses
function buildPeriodMetrics(raw: RawData): PeriodMetrics {
  const m = raw.metrics || {};
  const leads = raw.leads || [];
  const cr = raw.creatives || {};
  const creatives: any[] = cr.creatives || [];

  const leadsCount = leads.length;
  const mqlCount = leads.filter(isLeadMql).length;
  const leadsWithCk = leads.filter((l: any) => l.utm_content && !l.utm_content.includes("{{") && l.utm_content.trim().length > 0).length;
  const leadsNoUtm = leads.filter((l: any) => !l.utm_source || l.utm_source === "" || l.utm_source.includes("{{")).length;
  const directBio = leads.filter((l: any) => {
    const src = (l.utm_source || "").toLowerCase();
    const med = (l.utm_medium || "").toLowerCase();
    return !src || src === "direct" || med === "bio" || med === "link-in-bio" || src === "instagram";
  }).length;

  const totalSpend = creatives.reduce((s: number, c: any) => s + (c.spend || 0), 0);
  const totalSales = creatives.reduce((s: number, c: any) => s + (c.sales_count || 0), 0);
  const totalRevenue = creatives.reduce((s: number, c: any) => s + (c.revenue || 0), 0);
  const salesWithoutCk = creatives.filter((c: any) => !c.creative_key || c.creative_key === "sem-utm" || c.creative_key === "direct").reduce((s: number, c: any) => s + (c.sales_count || 0), 0);

  const cpl = leadsCount > 0 && totalSpend > 0 ? totalSpend / leadsCount : null;
  const cpmql = mqlCount > 0 && totalSpend > 0 ? totalSpend / mqlCount : null;
  const roas = totalSpend > 0 && totalRevenue > 0 ? totalRevenue / totalSpend : null;

  const enriched = creatives.map((c: any) => {
    const mqlRate = c.leads_count > 0 ? (c.mql_count / c.leads_count) * 100 : 0;
    const cplC = c.leads_count > 0 && c.spend > 0 ? c.spend / c.leads_count : null;
    const cpmqlC = c.mql_count > 0 && c.spend > 0 ? c.spend / c.mql_count : null;
    const roasC = c.spend > 0 && c.revenue > 0 ? c.revenue / c.spend : null;
    return {
      key: c.creative_label || c.creative_key,
      leads: c.leads_count || 0,
      mql: c.mql_count || 0,
      mql_rate: mqlRate,
      spend: c.spend || 0,
      cpl: cplC,
      cpmql: cpmqlC,
      sales: c.sales_count || 0,
      revenue: c.revenue || 0,
      roas: roasC,
    };
  });

  const visitors = m.unique_visitors || m.total_visitors || 0;
  const completed = m.completed || 0;
  const conversionRate = typeof m.conversion_rate === "number" ? m.conversion_rate : parseFloat(m.conversion_rate) || 0;
  const enteredQuiz = m.entered_quiz || 0;

  const by_mercado = buildDistribution(leads, (l) => normStr(l.mercado), leadsCount);
  const by_origem = buildDistribution(leads, normalizeOrigem, leadsCount);
  const by_faturamento = buildDistribution(leads, (l) => normStr(l.faturamento_faixa), leadsCount);
  const by_estagio = buildDistribution(leads, (l) => normStr(l.estagio_negocio), leadsCount);
  const by_dor = buildDistribution(leads, (l) => normStr(l.dor_desejo).slice(0, 80), leadsCount);
  const by_campaign = buildDistribution(leads, (l) => normStr(l.utm_campaign), leadsCount);

  const market_pain_mql = buildMarketPainCombos(leads);
  const icps = buildICPs(leads);
  const recent_top = buildRecentTop(leads);

  const enterpriseCount = leads.filter((l: any) => {
    const t = getTierFromFaturamento(l.faturamento_faixa);
    return t === "Enterprise" || t === "Enterprise+";
  }).length;
  const enterprise_share = leadsCount > 0 ? (enterpriseCount / leadsCount) * 100 : 0;

  const top_mercado_mql = by_mercado[0] && by_mercado[0].mql > 0 ? { key: by_mercado[0].key, mql: by_mercado[0].mql, rate: by_mercado[0].mql_rate } : null;
  const top_origem_mql = by_origem[0] && by_origem[0].mql > 0 ? { key: by_origem[0].key, mql: by_origem[0].mql, rate: by_origem[0].mql_rate } : null;
  const top_dor_mql = by_dor[0] && by_dor[0].mql > 0 ? { key: by_dor[0].key, mql: by_dor[0].mql, rate: by_dor[0].mql_rate } : null;

  return {
    visitors,
    sessions: m.total_visitors || 0,
    entered_quiz: enteredQuiz,
    completed,
    conversion_rate: conversionRate,
    entry_rate: visitors > 0 ? (enteredQuiz / visitors) * 100 : 0,
    drop_off_total: visitors - completed,
    step_funnel: m.step_funnel || [],
    leads: leadsCount,
    mql: mqlCount,
    mql_rate: leadsCount > 0 ? (mqlCount / leadsCount) * 100 : 0,
    enterprise_share,
    by_mercado,
    by_origem,
    by_faturamento,
    by_estagio,
    by_dor,
    by_campaign,
    market_pain_mql,
    icps,
    recent_top,
    top_mercado_mql,
    top_origem_mql,
    top_dor_mql,
    icp_dominante: icps[0] || null,
    sales: totalSales,
    revenue: totalRevenue,
    spend: totalSpend,
    cpl,
    cpmql,
    roas,
    leads_with_creative_key: leadsWithCk,
    leads_without_utms: leadsNoUtm,
    sales_without_creative_key: salesWithoutCk,
    direct_bio_leads: directBio,
    top_creatives_leads: [...enriched].sort((a, b) => b.leads - a.leads).slice(0, 5),
    top_creatives_mql: [...enriched].sort((a, b) => b.mql - a.mql).slice(0, 5),
    top_creatives_revenue: [...enriched].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
  };
}

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

// ---- Presets ----
type PresetKey =
  | "today" | "yesterday" | "last_7" | "last_14" | "last_30"
  | "current_week" | "last_week" | "current_month" | "last_month" | "max" | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "last_7", label: "Últimos 7 dias" },
  { key: "last_14", label: "Últimos 14 dias" },
  { key: "last_30", label: "Últimos 30 dias" },
  { key: "current_week", label: "Semana atual" },
  { key: "last_week", label: "Semana passada" },
  { key: "current_month", label: "Mês atual" },
  { key: "last_month", label: "Mês passado" },
  { key: "max", label: "Máximo" },
];

function computePresetRange(key: PresetKey): { from: Date; to: Date } {
  const now = new Date();
  const today = startOfDay(now);
  switch (key) {
    case "today": return { from: today, to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: y, to: endOfDay(y) };
    }
    case "last_7": {
      const f = new Date(today); f.setDate(f.getDate() - 6);
      return { from: f, to: endOfDay(now) };
    }
    case "last_14": {
      const f = new Date(today); f.setDate(f.getDate() - 13);
      return { from: f, to: endOfDay(now) };
    }
    case "last_30": {
      const f = new Date(today); f.setDate(f.getDate() - 29);
      return { from: f, to: endOfDay(now) };
    }
    case "current_week": {
      const dow = today.getDay();
      const f = new Date(today); f.setDate(f.getDate() - dow);
      return { from: f, to: endOfDay(now) };
    }
    case "last_week": {
      const dow = today.getDay();
      const endLast = new Date(today); endLast.setDate(endLast.getDate() - dow - 1);
      const startLast = new Date(endLast); startLast.setDate(startLast.getDate() - 6);
      return { from: startOfDay(startLast), to: endOfDay(endLast) };
    }
    case "current_month": {
      const f = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: f, to: endOfDay(now) };
    }
    case "last_month": {
      const f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: f, to: endOfDay(e) };
    }
    case "max":
    default:
      return { from: new Date(2024, 0, 1), to: endOfDay(now) };
  }
}

export default function InsightsTab({ fetchAdminData }: Props) {
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [current, setCurrent] = useState<PeriodMetrics | null>(null);
  const [previous, setPrevious] = useState<PeriodMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Single base range + automatic comparison
  const initial = computePresetRange("last_7");
  const [baseRange, setBaseRange] = useState<{ from?: Date; to?: Date }>({ from: initial.from, to: initial.to });
  const [activePreset, setActivePreset] = useState<PresetKey>("last_7");
  const [openCalendar, setOpenCalendar] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fromMs = baseRange.from?.getTime();
  const toMs = baseRange.to?.getTime();
  const incomplete = !fromMs || !toMs;

  // Validation
  const validation = useMemo<{ valid: boolean; msg?: string; warn?: string }>(() => {
    if (!fromMs || !toMs) return { valid: false, msg: "Selecione um período" };
    if (toMs < fromMs) return { valid: false, msg: "Data final menor que inicial" };
    const days = Math.ceil((toMs - fromMs) / (1000 * 60 * 60 * 24));
    if (days > 365) return { valid: true, warn: `Período muito longo (${days} dias)` };
    return { valid: true };
  }, [fromMs, toMs]);

  const periodA = useMemo(() => {
    if (!fromMs || !toMs) return null;
    const s = startOfDay(new Date(fromMs));
    const e = endOfDay(new Date(toMs));
    const eExcl = new Date(e.getTime() + 1);
    return {
      startISO: s.toISOString(),
      endExclusiveISO: eExcl.toISOString(),
      startDateOnly: format(s, "yyyy-MM-dd"),
      endDateOnly: format(e, "yyyy-MM-dd"),
      label: `${format(s, "dd/MM/yyyy")} → ${format(e, "dd/MM/yyyy")}`,
    };
  }, [fromMs, toMs]);

  // Auto comparison: same length, immediately before
  const periodB = useMemo(() => {
    if (!compareEnabled || !fromMs || !toMs) return null;
    const s = startOfDay(new Date(fromMs));
    const e = endOfDay(new Date(toMs));
    const span = e.getTime() - s.getTime();
    const compEnd = new Date(s.getTime() - 1);
    const compStart = new Date(compEnd.getTime() - span);
    const compStartDay = startOfDay(compStart);
    const compEndDay = endOfDay(compEnd);
    const eExcl = new Date(compEndDay.getTime() + 1);
    return {
      startISO: compStartDay.toISOString(),
      endExclusiveISO: eExcl.toISOString(),
      startDateOnly: format(compStartDay, "yyyy-MM-dd"),
      endDateOnly: format(compEndDay, "yyyy-MM-dd"),
      label: `${format(compStartDay, "dd/MM/yyyy")} → ${format(compEndDay, "dd/MM/yyyy")}`,
    };
  }, [compareEnabled, fromMs, toMs]);

  const periodLabel = periodA?.label ?? "(escolha o período)";
  const prevLabel = periodB?.label ?? "desativada";

  const load = useCallback(async () => {
    if (!periodA || !validation.valid) return;
    setLoading(true);
    setError(null);
    try {
      const fetchPeriod = async (fromIso: string, toIso: string, fromD: string, toD: string): Promise<RawData> => {
        const [metrics, leadsRes, creatives] = await Promise.all([
          fetchAdminData("/metrics", { from: fromIso, to: toIso }),
          fetchAdminData("/leads", { from: fromIso, to: toIso }),
          fetchAdminData("/creatives", { from: fromIso, to: toIso, from_date: fromD, to_date: toD }),
        ]);
        return { metrics, leads: leadsRes?.leads || leadsRes || [], creatives };
      };

      const curPromise = fetchPeriod(periodA.startISO, periodA.endExclusiveISO, periodA.startDateOnly, periodA.endDateOnly);
      const prevPromise = periodB
        ? fetchPeriod(periodB.startISO, periodB.endExclusiveISO, periodB.startDateOnly, periodB.endDateOnly).catch(() => null)
        : Promise.resolve(null as RawData | null);

      const [curRaw, prevRaw] = await Promise.all([curPromise, prevPromise]);

      setCurrent(buildPeriodMetrics(curRaw));
      setPrevious(prevRaw ? buildPeriodMetrics(prevRaw) : null);
      setHasRun(true);
    } catch (e: any) {
      console.error("InsightsTab load", e);
      setError(e?.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [fetchAdminData, periodA, periodB, validation.valid]);

  // Auto-refresh when period/comparison changes (only after first run)
  useEffect(() => {
    if (!autoRefresh || !hasRun) return;
    const t = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMs, toMs, compareEnabled, autoRefresh]);

  const result = useMemo(() => {
    if (!current) return null;
    return runRulesEngine(current, previous, {
      period_label: periodLabel,
      previous_label: previous ? prevLabel : "(sem dados suficientes)",
      filters_label: "nenhum",
    });
  }, [current, previous, periodLabel, prevLabel]);

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.report_markdown);
      toast({ title: "Relatório copiado!", description: "Cole no ChatGPT/Claude/Gemini." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" });
    }
  };

  const applyPreset = (key: PresetKey) => {
    const r = computePresetRange(key);
    setBaseRange({ from: r.from, to: r.to });
    setActivePreset(key);
  };

  const PeriodControls = (
    <div className="space-y-3">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={activePreset === p.key ? "default" : "outline"}
            onClick={() => applyPreset(p.key)}
            className="h-7 text-[11px] px-2.5"
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Single date picker + toggles + apply */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Período base</span>
          <Popover open={openCalendar} onOpenChange={setOpenCalendar}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("h-9 text-xs gap-2 justify-start font-normal w-[280px]", !baseRange.from && "text-muted-foreground")}
              >
                <CalendarIcon className="w-3 h-3" />
                {baseRange.from && baseRange.to
                  ? `${format(baseRange.from, "dd/MM/yyyy")} → ${format(baseRange.to, "dd/MM/yyyy")}`
                  : "Escolher período"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                numberOfMonths={2}
                locale={ptBR}
                selected={{ from: baseRange.from, to: baseRange.to }}
                onSelect={(r) => {
                  setBaseRange({ from: r?.from, to: r?.to });
                  setActivePreset("custom");
                }}
                disabled={(d) => d > new Date()}
                className={cn("p-3 pointer-events-auto")}
              />
              <div className="flex justify-end p-2 border-t border-border">
                <Button size="sm" disabled={!baseRange.from || !baseRange.to} onClick={() => setOpenCalendar(false)}>
                  Fechar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2 h-9">
          <Switch id="compare-toggle" checked={compareEnabled} onCheckedChange={setCompareEnabled} />
          <Label htmlFor="compare-toggle" className="text-xs cursor-pointer">Comparar com período anterior</Label>
        </div>

        <div className="flex items-center gap-2 h-9">
          <Switch id="auto-toggle" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          <Label htmlFor="auto-toggle" className="text-xs cursor-pointer">Auto-recalcular</Label>
        </div>

        <Button onClick={load} disabled={incomplete || !validation.valid || loading} size="sm" className="h-9">
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
          Aplicar
        </Button>
      </div>

      {/* Resumo do período */}
      <div className="text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Base:</span> <span className="font-mono">{periodLabel}</span>
        {" | "}
        <span className="font-semibold text-foreground">Comparação:</span>{" "}
        {compareEnabled ? <span className="font-mono">{prevLabel}</span> : <span className="text-amber-400">desativada</span>}
        {validation.warn && <span className="ml-2 text-amber-400">⚠ {validation.warn}</span>}
        {!validation.valid && <span className="ml-2 text-rose-400">⚠ {validation.msg}</span>}
      </div>
    </div>
  );

  // Initial state — user must click "Aplicar"
  if (!hasRun && !loading) {
    return (
      <Card className="border-primary/40">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <h3 className="text-base font-bold">Insights — Rules Engine</h3>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Escolha um <strong>preset rápido</strong> ou um período customizado. A comparação com o período anterior é automática (mesmo tamanho, imediatamente antes) — você pode desativar no toggle.
          </p>
          {PeriodControls}
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-10 pb-10 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-sm">Calculando métricas + comparação…</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !result || !current) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-2">
          <p className="text-sm text-rose-400">{error || "Sem dados disponíveis"}</p>
          <Button onClick={load} size="sm" variant="outline" disabled={incomplete}><RefreshCw className="w-3 h-3 mr-1" />Tentar novamente</Button>
        </CardContent>
      </Card>
    );
  }

  const { alerts } = result;
  const sevColor = (s: string) => s === "ALTA" ? "bg-rose-500/15 text-rose-300 border-rose-500/40" : s === "MÉDIA" ? "bg-amber-500/15 text-amber-300 border-amber-500/40" : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-primary/40">
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <h3 className="text-base font-bold">Insights — Rules Engine</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Base: <span className="font-mono">{periodLabel}</span> {result.has_comparison ? <>vs Comparação: <span className="font-mono">{prevLabel}</span></> : <span className="text-amber-400">(sem comparação)</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={load} variant="outline" size="sm" disabled={incomplete}><RefreshCw className="w-3 h-3 mr-1" />Recalcular</Button>
              <Button onClick={handleCopy} size="sm" className="bg-primary"><Copy className="w-3 h-3 mr-1" />Copiar relatório</Button>
            </div>
          </div>
          {PeriodControls}
        </CardContent>
      </Card>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Visitantes" value={current.visitors} prev={previous?.visitors} />
        <SummaryCard label="Leads" value={current.leads} prev={previous?.leads} />
        <SummaryCard label="MQL" value={current.mql} prev={previous?.mql} />
        <SummaryCard label="Receita" value={current.revenue} prev={previous?.revenue} money />
      </div>

      {/* Resumo de Qualificação (novo) */}
      <Card className="border-amber-500/30">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-bold">Resumo de Qualificação</h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2">
            <QualCard label="Total Leads" value={String(current.leads)} />
            <QualCard label="Total MQL" value={String(current.mql)} />
            <QualCard label="Taxa MQL" value={`${current.mql_rate.toFixed(1)}%`} highlight />
            <QualCard label="Mercado #1 MQL" value={current.top_mercado_mql?.key ?? "—"} sub={current.top_mercado_mql ? `${current.top_mercado_mql.mql} MQL` : undefined} />
            <QualCard label="Origem #1 MQL" value={current.top_origem_mql?.key ?? "—"} sub={current.top_origem_mql ? `${current.top_origem_mql.mql} MQL` : undefined} />
            <QualCard label="Dor #1 MQL" value={current.top_dor_mql ? current.top_dor_mql.key.slice(0, 32) + (current.top_dor_mql.key.length > 32 ? "…" : "") : "—"} sub={current.top_dor_mql ? `${current.top_dor_mql.mql} MQL` : undefined} />
            <QualCard label="ICP Dominante" value={current.icp_dominante ? `${current.icp_dominante.mercado} · ${current.icp_dominante.faturamento.slice(0, 20)}` : "—"} sub={current.icp_dominante ? `${current.icp_dominante.mql} MQL` : undefined} />
          </div>
        </CardContent>
      </Card>


      {/* Alertas */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Alertas detectados ({alerts.length})
            </h4>
            {alerts.length === 0 && (
              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Tudo dentro do esperado
              </Badge>
            )}
          </div>

          {!result.has_comparison && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200">
              Sem dados suficientes no período anterior para comparar. O relatório foi gerado só com dados atuais.
            </div>
          )}

          {alerts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhum alerta disparado neste período.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => <AlertCard key={a.id} alert={a} sevColor={sevColor(a.severity)} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview do markdown */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pré-visualização do relatório</h4>
            <Button onClick={handleCopy} size="sm" variant="outline"><Copy className="w-3 h-3 mr-1" />Copiar</Button>
          </div>
          <pre className="text-[11px] leading-relaxed bg-muted/30 rounded p-3 overflow-auto max-h-[500px] whitespace-pre-wrap font-mono">
            {result.report_markdown}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function QualCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${highlight ? "border-amber-500/40 bg-amber-500/5" : "border-border/40 bg-background/40"}`}>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-xs font-bold mt-0.5 truncate ${highlight ? "text-amber-300" : ""}`} title={value}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function SummaryCard({ label, value, prev, money }: { label: string; value: number; prev?: number; money?: boolean }) {
  const fmt = (n: number) => money ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n) : new Intl.NumberFormat("pt-BR").format(n);
  const delta = prev !== undefined && prev > 0 ? ((value - prev) / prev) * 100 : null;
  return (
    <Card>
      <CardContent className="pt-3 pb-3">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</p>
        <p className="text-xl font-bold mt-0.5">{fmt(value)}</p>
        {delta !== null && (
          <p className={`text-[10px] mt-0.5 ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}% vs anterior
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AlertCard({ alert, sevColor }: { alert: Alert; sevColor: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border/50 bg-card/50 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left p-3 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-[10px] ${sevColor}`}>{alert.severity}</Badge>
          <Badge variant="outline" className="text-[10px]">{alert.area}</Badge>
          <p className="text-sm font-semibold flex-1">{alert.title}</p>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">{alert.evidence}</p>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 text-[11px]">
          <div><span className="font-semibold text-muted-foreground">Sinal:</span> {alert.signal}</div>
          <div><span className="font-semibold text-muted-foreground">Impacto:</span> {alert.impact}</div>
          <div>
            <p className="font-semibold text-muted-foreground">Hipóteses:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">{alert.hypotheses.map((h, i) => <li key={i}>{h}</li>)}</ul>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">Checks:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">{alert.checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
          <div className="pt-1 border-t border-border/30">
            <span className="font-semibold text-amber-300">Próxima ação:</span> {alert.next_action}
          </div>
        </div>
      )}
    </div>
  );
}
