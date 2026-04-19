import { useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, RefreshCw, Sparkles, AlertTriangle, CheckCircle2, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useDateRange } from "@/context/DateRangeContext";
import { runRulesEngine, type PeriodMetrics, type Alert } from "@/lib/rulesEngine";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

type CompareMode = "previous" | "previous_2x" | "last_week" | "last_month" | "none";

const COMPARE_OPTIONS: { value: CompareMode; label: string }[] = [
  { value: "previous", label: "Período anterior (mesmo tamanho)" },
  { value: "previous_2x", label: "2 períodos atrás (mesmo tamanho)" },
  { value: "last_week", label: "Mesma janela na semana passada (-7d)" },
  { value: "last_month", label: "Mesma janela no mês passado (-30d)" },
  { value: "none", label: "Sem comparação" },
];

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
}

interface RawData {
  metrics: any;
  leads: any[];
  creatives: any;
}

// Build PeriodMetrics from raw API responses
function buildPeriodMetrics(raw: RawData): PeriodMetrics {
  const m = raw.metrics || {};
  const leads = raw.leads || [];
  const cr = raw.creatives || {};
  const creatives: any[] = cr.creatives || [];

  // MQL faixas (≥ 10k)
  const MQL_FAIXAS = new Set([
    "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
    "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
    "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
    "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
    "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
    "Acima de R$ 10 milhões",
    "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
  ]);

  const leadsCount = leads.length;
  const mqlCount = leads.filter((l: any) => l.faturamento_faixa && MQL_FAIXAS.has(l.faturamento_faixa) && l.sdr_override !== "Dara").length;
  const leadsWithCk = leads.filter((l: any) => l.utm_content && !l.utm_content.includes("{{") && l.utm_content.trim().length > 0).length;
  const leadsNoUtm = leads.filter((l: any) => !l.utm_source || l.utm_source === "" || l.utm_source.includes("{{")).length;
  const directBio = leads.filter((l: any) => {
    const src = (l.utm_source || "").toLowerCase();
    const med = (l.utm_medium || "").toLowerCase();
    return !src || src === "direct" || med === "bio" || med === "link-in-bio" || src === "instagram";
  }).length;

  // Aggregate creatives totals (from /creatives endpoint)
  const totalSpend = creatives.reduce((s: number, c: any) => s + (c.spend || 0), 0);
  const totalSales = creatives.reduce((s: number, c: any) => s + (c.sales_count || 0), 0);
  const totalRevenue = creatives.reduce((s: number, c: any) => s + (c.revenue || 0), 0);
  const salesWithoutCk = creatives.filter((c: any) => !c.creative_key || c.creative_key === "sem-utm" || c.creative_key === "direct").reduce((s: number, c: any) => s + (c.sales_count || 0), 0);

  const cpl = leadsCount > 0 && totalSpend > 0 ? totalSpend / leadsCount : null;
  const cpmql = mqlCount > 0 && totalSpend > 0 ? totalSpend / mqlCount : null;
  const roas = totalSpend > 0 && totalRevenue > 0 ? totalRevenue / totalSpend : null;

  // Top creatives
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

  return {
    visitors,
    sessions: m.total_visitors || 0,
    entered_quiz: m.entered_quiz || 0,
    completed,
    conversion_rate: conversionRate,
    drop_off_total: visitors - completed,
    step_funnel: m.step_funnel || [],
    leads: leadsCount,
    mql: mqlCount,
    mql_rate: leadsCount > 0 ? (mqlCount / leadsCount) * 100 : 0,
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

export default function InsightsTab({ fetchAdminData }: Props) {
  const { startISO, endExclusiveISO, startDateOnly, endDateOnly, start, end } = useDateRange();
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [current, setCurrent] = useState<PeriodMetrics | null>(null);
  const [previous, setPrevious] = useState<PeriodMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<CompareMode>("previous");

  // Use timestamps (primitives) to avoid Date identity churn between renders
  const startMs = start.getTime();
  const endMs = end.getTime();

  const { prevStartISO, prevEndExclusiveISO, prevStartDateOnly, prevEndDateOnly, prevLabel } = useMemo(() => {
    const span = endMs - startMs;
    const DAY = 24 * 60 * 60 * 1000;
    let pStart: Date;
    let pEnd: Date;
    switch (compareMode) {
      case "previous_2x":
        pEnd = new Date(startMs - span - 1);
        pStart = new Date(pEnd.getTime() - span);
        break;
      case "last_week":
        pStart = new Date(startMs - 7 * DAY);
        pEnd = new Date(endMs - 7 * DAY);
        break;
      case "last_month":
        pStart = new Date(startMs - 30 * DAY);
        pEnd = new Date(endMs - 30 * DAY);
        break;
      case "none":
        return { prevStartISO: "", prevEndExclusiveISO: "", prevStartDateOnly: "", prevEndDateOnly: "", prevLabel: "(sem comparação)" };
      case "previous":
      default:
        pStart = new Date(startMs - span - 1);
        pEnd = new Date(startMs - 1);
        break;
    }
    return {
      prevStartISO: pStart.toISOString(),
      prevEndExclusiveISO: pEnd.toISOString(),
      prevStartDateOnly: format(pStart, "yyyy-MM-dd"),
      prevEndDateOnly: format(pEnd, "yyyy-MM-dd"),
      prevLabel: `${format(pStart, "dd/MM/yyyy")} → ${format(pEnd, "dd/MM/yyyy")}`,
    };
  }, [startMs, endMs, compareMode]);

  const periodLabel = useMemo(
    () => `${format(new Date(startMs), "dd/MM/yyyy")} → ${format(new Date(endMs), "dd/MM/yyyy")}`,
    [startMs, endMs]
  );

  const load = useCallback(async () => {
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

      const curPromise = fetchPeriod(startISO, endExclusiveISO, startDateOnly, endDateOnly);
      const prevPromise = compareMode === "none"
        ? Promise.resolve(null as RawData | null)
        : fetchPeriod(prevStartISO, prevEndExclusiveISO, prevStartDateOnly, prevEndDateOnly).catch(() => null);

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
  }, [fetchAdminData, startISO, endExclusiveISO, startDateOnly, endDateOnly, prevStartISO, prevEndExclusiveISO, prevStartDateOnly, prevEndDateOnly, compareMode]);

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

  // Comparison-mode picker (reused on initial screen + header)
  const ComparePicker = (
    <Select value={compareMode} onValueChange={(v) => setCompareMode(v as CompareMode)}>
      <SelectTrigger className="h-9 w-[260px] text-xs">
        <SelectValue placeholder="Período de comparação" />
      </SelectTrigger>
      <SelectContent>
        {COMPARE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  // Initial state — user must click "Gerar análise"
  if (!hasRun && !loading) {
    return (
      <Card className="border-primary/40">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <h3 className="text-base font-bold">Insights — Rules Engine</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Período atual: <span className="font-mono">{periodLabel}</span>
          </p>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Comparar com</span>
              {ComparePicker}
            </div>
            <Button onClick={load}><Play className="w-3 h-3 mr-1" />Gerar análise</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A análise não roda automaticamente. Escolha o período de comparação e clique em <strong>Gerar análise</strong>.
          </p>
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
          <Button onClick={load} size="sm" variant="outline"><RefreshCw className="w-3 h-3 mr-1" />Tentar novamente</Button>
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
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <h3 className="text-base font-bold">Insights — Rules Engine</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Período: <span className="font-mono">{periodLabel}</span> {result.has_comparison ? <>vs <span className="font-mono">{prevLabel}</span></> : <span className="text-amber-400">(sem comparação)</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {ComparePicker}
              <Button onClick={load} variant="outline" size="sm"><RefreshCw className="w-3 h-3 mr-1" />Recalcular</Button>
              <Button onClick={handleCopy} size="sm" className="bg-primary"><Copy className="w-3 h-3 mr-1" />Copiar relatório</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Visitantes" value={current.visitors} prev={previous?.visitors} />
        <SummaryCard label="Leads" value={current.leads} prev={previous?.leads} />
        <SummaryCard label="MQL" value={current.mql} prev={previous?.mql} />
        <SummaryCard label="Receita" value={current.revenue} prev={previous?.revenue} money />
      </div>

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
