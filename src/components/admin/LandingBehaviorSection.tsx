import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDateRange } from "@/context/DateRangeContext";
import { Loader2, TrendingDown, TrendingUp, MousePointerClick, ArrowDown, Activity, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FunnelStep {
  section_id: string;
  order: number;
  reached: number;
  continued: number;
  clicked?: number;
  dropped: number;
  drop_rate: number;
  continue_rate: number;
  click_rate?: number;
  avg_time_ms: number;
  pct_of_visitors: number;
}

interface ScrollDepth { milestone: number; users: number; pct: number; }
interface TopClick { id: string; label: string; section: string | null; type: string; count: number; uniqueUsers: number; }

interface PeriodData {
  totalVisitors: number;
  funnel: FunnelStep[];
  scrollDepth: ScrollDepth[];
  clicksByType: Record<string, number>;
  clicksBySection: Record<string, number>;
  topClicks: TopClick[];
  totalClicks: number;
}

interface BehaviorResponse {
  current: PeriodData;
  previous: PeriodData | null;
  insights: string[];
}

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
}

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero (dobra inicial)",
  social_proof: "Prova social",
  dor: "Dor / problema",
  portfolio: "Portfólio",
  cta_intermediario: "CTA intermediário",
  metodo: "Método Champion",
  gancho_corpo: "Gancho & Corpo",
  como_funciona: "Como funciona",
  cta_final: "CTA final",
};

function fmtPct(n: number) { return `${n.toFixed(1)}%`; }
function fmtTime(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function LandingBehaviorSection({ fetchAdminData }: Props) {
  const { startISO, endExclusiveISO } = useDateRange();
  const [data, setData] = useState<BehaviorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Só mostra "loading" full quando ainda não há dados; refreshes ficam discretos
    if (!data) setLoading(true);
    setRefreshing(true);
    fetchAdminData("/landing-behavior", { from: startISO, to: endExclusiveISO })
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { console.error("landing-behavior", e); })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => { cancelled = true; };
  }, [startISO, endExclusiveISO, fetchAdminData]);

  const cur = data?.current;
  const prev = data?.previous;

  const maxReached = useMemo(() => {
    if (!cur?.funnel.length) return 0;
    return Math.max(...cur.funnel.map((f) => f.reached));
  }, [cur]);

  if (loading) {
    return (
      <Card className="border-primary/30">
        <CardContent className="pt-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando comportamento da landing…
        </CardContent>
      </Card>
    );
  }

  if (!cur || cur.totalVisitors === 0) {
    return (
      <Card className="border-primary/30">
        <CardContent className="pt-6 text-center space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Comportamento na Landing Page
          </p>
          <p className="text-xs text-muted-foreground">
            Ainda não há dados de comportamento neste período. O tracking começou agora — volte em algumas horas.
          </p>
        </CardContent>
      </Card>
    );
  }

  const findPrev = (sectionId: string) => prev?.funnel.find((f) => f.section_id === sectionId);

  return (
    <Card className="border-primary/30">
      <CardContent className="pt-4 space-y-6">
        <div className="flex items-center justify-between border-b border-border/50 pb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Comportamento na Landing Page — funil por seção, scroll e cliques
          </p>
          <Badge variant="outline" className="text-[10px]">
            {cur.totalVisitors} visitantes únicos
          </Badge>
        </div>

        {/* INSIGHTS */}
        {data?.insights && data.insights.length > 0 && (
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
              <Lightbulb className="w-3.5 h-3.5" /> Insights automáticos
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              {data.insights.map((ins, i) => <li key={i}>{ins}</li>)}
            </ul>
          </div>
        )}

        {/* FUNIL POR SEÇÃO + heatmap */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <ArrowDown className="w-3 h-3" /> Funil por seção da landing
          </p>
          <div className="space-y-1.5">
            {cur.funnel.map((f) => {
              const label = SECTION_LABELS[f.section_id] || f.section_id;
              const widthPct = maxReached > 0 ? (f.reached / maxReached) * 100 : 0;
              const intensity = f.pct_of_visitors / 100;
              const prevStep = findPrev(f.section_id);
              const reachDelta = prevStep ? f.pct_of_visitors - prevStep.pct_of_visitors : null;

              // heatmap color: more visitors = warmer (amber); less = cooler (blue)
              const heatBg = `hsl(${(1 - intensity) * 220 + intensity * 38}, 80%, ${20 + intensity * 25}%)`;

              return (
                <div key={f.section_id} className="rounded-md border border-border/40 overflow-hidden">
                  <div className="relative h-12">
                    <div
                      className="absolute inset-y-0 left-0 transition-all"
                      style={{ width: `${widthPct}%`, background: heatBg, opacity: 0.55 }}
                    />
                    <div className="relative h-full px-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono text-muted-foreground w-5 flex-shrink-0">#{f.order}</span>
                        <span className="text-xs font-semibold truncate">{label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] flex-shrink-0">
                        <div className="text-right">
                          <p className="text-muted-foreground">Chegou</p>
                          <p className="font-bold text-cyan-300">{f.reached} <span className="text-muted-foreground/70">({fmtPct(f.pct_of_visitors)})</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground">Continuou</p>
                          <p className="font-bold text-emerald-300">{f.continued} <span className="text-muted-foreground/70">({fmtPct(f.continue_rate)})</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground">Clicou</p>
                          <p className="font-bold text-amber-300">{f.clicked ?? 0} <span className="text-muted-foreground/70">({fmtPct(f.click_rate ?? 0)})</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground">Saiu</p>
                          <p className="font-bold text-rose-300">{f.dropped} <span className="text-muted-foreground/70">({fmtPct(f.drop_rate)})</span></p>
                        </div>
                        {reachDelta !== null && (
                          <div className={`flex items-center gap-0.5 ${reachDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {reachDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            <span className="font-semibold">{reachDelta >= 0 ? "+" : ""}{reachDelta.toFixed(0)}pp</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PROFUNDIDADE POR SEÇÃO + QUEDA */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> Até qual seção os visitantes chegaram
            </p>
            <div className="space-y-2">
              {cur.funnel.map((f) => {
                const prevS = findPrev(f.section_id);
                const delta = prevS ? f.pct_of_visitors - prevS.pct_of_visitors : null;
                const label = SECTION_LABELS[f.section_id] || f.section_id;
                return (
                  <div key={f.section_id}>
                    <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
                      <span className="text-muted-foreground truncate">
                        <span className="font-mono text-[10px] text-muted-foreground/60 mr-1">#{f.order}</span>
                        {label}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-semibold text-foreground">{f.reached} ({fmtPct(f.pct_of_visitors)})</span>
                        {delta !== null && Math.abs(delta) > 1 && (
                          <span className={`text-[10px] ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {delta >= 0 ? "+" : ""}{delta.toFixed(0)}pp
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 rounded bg-muted/30 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-500 to-amber-400" style={{ width: `${Math.min(100, f.pct_of_visitors)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <TrendingDown className="w-3 h-3" /> Queda ao longo da página (por seção)
            </p>
            <div className="flex items-end gap-1 h-32 px-1">
              {cur.funnel.map((f) => (
                <div key={f.section_id} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                  <span className="text-[9px] font-mono text-muted-foreground">{f.pct_of_visitors.toFixed(0)}%</span>
                  <div
                    className="w-full bg-gradient-to-t from-primary/80 to-primary/30 rounded-t"
                    style={{ height: `${Math.max(4, (f.pct_of_visitors / 100) * 100)}%` }}
                    title={`${SECTION_LABELS[f.section_id] || f.section_id}: ${f.reached} usuários`}
                  />
                  <span className="text-[8px] text-muted-foreground truncate w-full text-center" title={SECTION_LABELS[f.section_id] || f.section_id}>
                    #{f.order}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CLIQUES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <MousePointerClick className="w-3 h-3" /> Cliques por tipo
            </p>
            <div className="space-y-1.5">
              {Object.entries(cur.clicksByType).sort(([, a], [, b]) => b - a).map(([type, count]) => {
                const max = Math.max(...Object.values(cur.clicksByType));
                const w = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-[11px] capitalize w-24 truncate text-muted-foreground">{type}</span>
                    <div className="flex-1 h-3 rounded bg-muted/30 overflow-hidden">
                      <div className="h-full bg-amber-400/60" style={{ width: `${w}%` }} />
                    </div>
                    <span className="text-[11px] font-semibold w-10 text-right">{count}</span>
                  </div>
                );
              })}
              {Object.keys(cur.clicksByType).length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">Nenhum clique registrado.</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Top 10 elementos clicados
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {cur.topClicks.slice(0, 10).map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[11px] border-b border-border/30 py-1">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.label}</p>
                    <p className="text-muted-foreground/70 text-[10px]">
                      {c.section ? (SECTION_LABELS[c.section] || c.section) : "—"} · {c.type}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-amber-300">{c.count}</p>
                    <p className="text-muted-foreground/70 text-[10px]">{c.uniqueUsers} únicos</p>
                  </div>
                </div>
              ))}
              {cur.topClicks.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">Nenhum clique registrado.</p>
              )}
            </div>
          </div>
        </div>

        {prev && (
          <div className="text-[10px] text-muted-foreground/70 text-center pt-2 border-t border-border/30">
            Comparações vs período anterior ({prev.totalVisitors} visitantes)
          </div>
        )}
      </CardContent>
    </Card>
  );
}
