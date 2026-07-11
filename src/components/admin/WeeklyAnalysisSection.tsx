import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  AlertTriangle,
  Sparkles,
  CalendarDays,
} from "lucide-react";
import { useDateRange } from "@/context/DateRangeContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DayMetric {
  date: string; // YYYY-MM-DD (local SP)
  dow: number; // 0=Sun..6=Sat
  visitors: number;
  sessions: number;
  // null = sem evento quiz_view real registrado nesse dia (tracking corrigido em 11/07/2026;
  // dias anteriores a isso não têm — e nunca vão ter — esse dado retroativamente).
  entered_quiz: number | null;
  entered_quiz_known?: boolean;
  completed: number;
}

interface WeeklyMetricsResponse {
  days: DayMetric[];
}

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
}

const DOW_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DOW_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
// Ordem de exibição: Segunda → Domingo
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type RangeMode = "global" | "current" | "previous" | "last4" | "last7";

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function dateToYmd(d: Date): string {
  // Use UTC parts (we constructed at noon UTC)
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(ymd: string, n: number): string {
  const d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToYmd(d);
}
// Get current week range (Mon..Sun) in SP timezone
function getCurrentWeekSP(): { from: string; to: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const todayYmd = fmt.format(new Date());
  const dow = ymdToDate(todayYmd).getUTCDay(); // 0..6 (0=Dom)
  // Distância até a segunda-feira anterior: Dom→6, Seg→0, Ter→1, ...
  const daysSinceMonday = (dow + 6) % 7;
  const from = addDays(todayYmd, -daysSinceMonday); // Segunda
  const to = addDays(from, 6); // Domingo
  return { from, to };
}

function pct(num: number, den: number): number {
  if (!den) return 0;
  return (num / den) * 100;
}
function fmtPct(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`;
}
function fmtDelta(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

interface DayAggregate {
  date: string;
  dow: number;
  visitors: number;
  sessions: number;
  entered_quiz: number | null; // null = nenhum dia deste grupo tem tracking de entrada real
  completed: number;
  entry_rate: number | null; // entered/visitors
  completion_rate: number | null; // completed/entered
  conversion_rate: number; // completed/visitors (sempre calculável — completed e visitors nunca são null)
}

function aggregateByDow(days: DayMetric[]): Record<number, DayAggregate> {
  const out: Record<number, { visitors: number; sessions: number; entered_quiz: number; enteredKnownDays: number; completed: number; date: string; dow: number }> = {};
  for (let i = 0; i < 7; i++) out[i] = { visitors: 0, sessions: 0, entered_quiz: 0, enteredKnownDays: 0, completed: 0, date: "", dow: i };
  days.forEach((d) => {
    const b = out[d.dow];
    b.visitors += d.visitors;
    b.sessions += d.sessions;
    if (d.entered_quiz_known && d.entered_quiz !== null) {
      b.entered_quiz += d.entered_quiz;
      b.enteredKnownDays += 1;
    }
    b.completed += d.completed;
    if (!b.date || d.date > b.date) b.date = d.date;
  });
  const result: Record<number, DayAggregate> = {};
  Object.entries(out).forEach(([k, v]) => {
    const hasEntered = v.enteredKnownDays > 0;
    result[Number(k)] = {
      date: v.date,
      dow: v.dow,
      visitors: v.visitors,
      sessions: v.sessions,
      completed: v.completed,
      entered_quiz: hasEntered ? v.entered_quiz : null,
      entry_rate: hasEntered ? pct(v.entered_quiz, v.visitors) : null,
      completion_rate: hasEntered ? pct(v.completed, v.entered_quiz) : null,
      conversion_rate: pct(v.completed, v.visitors),
    };
  });
  return result;
}

function totalsOf(days: DayMetric[]) {
  const t = days.reduce(
    (acc, d) => {
      acc.visitors += d.visitors;
      acc.sessions += d.sessions;
      if (d.entered_quiz_known && d.entered_quiz !== null) {
        acc.entered_quiz += d.entered_quiz;
        acc.enteredKnownDays += 1;
      }
      acc.completed += d.completed;
      return acc;
    },
    { visitors: 0, sessions: 0, entered_quiz: 0, enteredKnownDays: 0, completed: 0 }
  );
  const hasEntered = t.enteredKnownDays > 0;
  return {
    visitors: t.visitors,
    sessions: t.sessions,
    completed: t.completed,
    entered_quiz: hasEntered ? t.entered_quiz : null,
    entry_rate: hasEntered ? pct(t.entered_quiz, t.visitors) : null,
    completion_rate: hasEntered ? pct(t.completed, t.entered_quiz) : null,
    conversion_rate: pct(t.completed, t.visitors),
  };
}

export default function WeeklyAnalysisSection({ fetchAdminData }: Props) {
  const [mode, setMode] = useState<RangeMode>("global");
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<DayMetric[]>([]);
  const [prevDays, setPrevDays] = useState<DayMetric[]>([]);
  const { start: globalStart, end: globalEnd } = useDateRange();

  // Compute date ranges based on mode
  const { primary, previous } = useMemo(() => {
    if (mode === "global") {
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric", month: "2-digit", day: "2-digit",
      });
      const from = fmt.format(globalStart);
      const to = fmt.format(globalEnd);
      const fromD = ymdToDate(from);
      const toD = ymdToDate(to);
      const len = Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1;
      return {
        primary: { from, to },
        previous: { from: addDays(from, -len), to: addDays(from, -1) },
      };
    }
    const cur = getCurrentWeekSP();
    if (mode === "current") {
      return {
        primary: cur,
        previous: { from: addDays(cur.from, -7), to: addDays(cur.to, -7) },
      };
    }
    if (mode === "previous") {
      const prev = { from: addDays(cur.from, -7), to: addDays(cur.to, -7) };
      return {
        primary: prev,
        previous: { from: addDays(prev.from, -7), to: addDays(prev.to, -7) },
      };
    }
    if (mode === "last4") {
      const from = addDays(cur.to, -27); // 28 days
      return {
        primary: { from, to: cur.to },
        previous: { from: addDays(from, -28), to: addDays(from, -1) },
      };
    }
    // last7
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
    const todayYmd = fmt.format(new Date());
    const from = addDays(todayYmd, -6);
    return {
      primary: { from, to: todayYmd },
      previous: { from: addDays(from, -7), to: addDays(from, -1) },
    };
  }, [mode, globalStart, globalEnd]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [a, b] = await Promise.all([
          fetchAdminData("/weekly-metrics", {
            from: `${primary.from}T00:00:00.000Z`,
            to: `${primary.to}T23:59:59.999Z`,
          }) as Promise<WeeklyMetricsResponse>,
          fetchAdminData("/weekly-metrics", {
            from: `${previous.from}T00:00:00.000Z`,
            to: `${previous.to}T23:59:59.999Z`,
          }) as Promise<WeeklyMetricsResponse>,
        ]);
        if (cancelled) return;
        setDays(a?.days || []);
        setPrevDays(b?.days || []);
      } catch (e) {
        console.error("[WeeklyAnalysis] load error", e);
        if (!cancelled) {
          setDays([]);
          setPrevDays([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [primary.from, primary.to, previous.from, previous.to, fetchAdminData]);

  const byDow = useMemo(() => aggregateByDow(days), [days]);
  const prevByDow = useMemo(() => aggregateByDow(prevDays), [prevDays]);
  const totals = useMemo(() => totalsOf(days), [days]);
  const prevTotals = useMemo(() => totalsOf(prevDays), [prevDays]);

  // Best/worst day badges (only across days that have visitors > 0)
  const activeDays = useMemo(
    () => Object.values(byDow).filter((d) => d.visitors > 0 || (d.entered_quiz ?? 0) > 0 || d.completed > 0),
    [byDow]
  );
  const bestVisitorsDow = activeDays.length ? activeDays.reduce((a, b) => (b.visitors > a.visitors ? b : a)).dow : null;
  const bestConversionDow = activeDays.length
    ? activeDays.reduce((a, b) => (b.conversion_rate > a.conversion_rate ? b : a)).dow
    : null;
  const worstConversionDow = activeDays.length
    ? activeDays.reduce((a, b) => (b.conversion_rate < a.conversion_rate ? b : a)).dow
    : null;
  const maxVisitors = activeDays.length ? Math.max(...activeDays.map((d) => d.visitors)) : 0;
  // Nenhum dia do período tem tracking real de entrada no quiz (comum para qualquer
  // período anterior ao fix de lead_sessions/lead_events em 11/07/2026).
  const noEnteredDataAtAll = totals.entered_quiz === null;

  // Insights
  const insights = useMemo(() => {
    const out: string[] = [];
    if (bestConversionDow !== null && byDow[bestConversionDow].conversion_rate > 0) {
      out.push(`${DOW_FULL[bestConversionDow]} teve a maior taxa de conversão (${fmtPct(byDow[bestConversionDow].conversion_rate)}).`);
    }
    if (bestVisitorsDow !== null) {
      const dayBest = byDow[bestVisitorsDow];
      if (dayBest.completion_rate !== null && totals.completion_rate !== null && dayBest.completion_rate < totals.completion_rate) {
        out.push(`${DOW_FULL[bestVisitorsDow]} trouxe mais visitantes (${dayBest.visitors}), mas com taxa de conclusão abaixo da média.`);
      }
    }
    if (totals.visitors > 0 && prevTotals.visitors > 0) {
      const dv = pct(totals.visitors - prevTotals.visitors, prevTotals.visitors);
      const dc = totals.conversion_rate - prevTotals.conversion_rate;
      if (dv > 0 && dc < 0) out.push(`A semana atual teve mais tráfego (+${dv.toFixed(1)}%), mas pior eficiência na conversão (${dc.toFixed(2)} p.p.).`);
      if (dv < 0 && dc > 0) out.push(`A semana atual teve menos tráfego (${dv.toFixed(1)}%), porém melhor conversão (+${dc.toFixed(2)} p.p.).`);
    }
    return out.slice(0, 3);
  }, [byDow, totals, prevTotals, bestConversionDow, bestVisitorsDow]);

  const deltaCard = (label: string, cur: number | null, prev: number, isPct = false, ppMode = false) => {
    if (cur === null) {
      return (
        <div className="rounded-md border border-border/40 bg-background/40 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-xl font-bold mt-1 text-muted-foreground/50">—</p>
          <p className="text-[11px] mt-1 text-muted-foreground/60">sem dados de tracking</p>
        </div>
      );
    }
    let delta = 0;
    let trendStr = "";
    if (ppMode) {
      delta = cur - prev;
      trendStr = `${delta > 0 ? "+" : ""}${delta.toFixed(2)} p.p.`;
    } else if (prev > 0) {
      delta = pct(cur - prev, prev);
      trendStr = fmtDelta(delta);
    } else if (cur > 0) {
      trendStr = "novo";
      delta = 100;
    } else {
      trendStr = "—";
    }
    const Trend = delta > 0.5 ? TrendingUp : delta < -0.5 ? TrendingDown : Minus;
    const trendColor =
      delta > 0.5 ? "text-emerald-400" : delta < -0.5 ? "text-rose-400" : "text-muted-foreground";
    return (
      <div className="rounded-md border border-border/40 bg-background/40 p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xl font-bold mt-1">{isPct ? fmtPct(cur) : cur.toLocaleString("pt-BR")}</p>
        <div className={`flex items-center gap-1 text-[11px] mt-1 ${trendColor}`}>
          <Trend className="w-3 h-3" />
          <span className="font-semibold">{trendStr}</span>
          <span className="text-muted-foreground/70">vs anterior</span>
        </div>
      </div>
    );
  };

  return (
    <Card className="border-primary/30">
      <CardContent className="pt-4 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Análise Semanal — Performance por dia
            </p>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {([
              ["global", "Filtro global"],
              ["current", "Semana atual"],
              ["previous", "Semana passada"],
              ["last7", "Últimos 7 dias"],
              ["last4", "Últimas 4 semanas"],
            ] as [RangeMode, string][]).map(([m, label]) => (
              <Button
                key={m}
                size="sm"
                variant={mode === m ? "default" : "outline"}
                onClick={() => setMode(m)}
                className="h-7 text-[11px] px-2.5"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {loading && (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        )}

        {noEnteredDataAtAll && !loading && (
          <p className="text-[11px] text-amber-300/90 -mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            Sem dados de "entrada no quiz" rastreados para nenhum dia deste período — o tracking de
            eventos foi corrigido recentemente. "Visitantes" e "Conclusões" abaixo usam a base real de
            leads e sessões; "Entradas no quiz" e as taxas derivadas dela aparecerão assim que houver
            acessos rastreados a partir de agora.
          </p>
        )}

        {/* Resumo do período */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {deltaCard("Visitantes únicos", totals.visitors, prevTotals.visitors)}
          {deltaCard("Entradas no quiz", totals.entered_quiz, prevTotals.entered_quiz ?? 0)}
          {deltaCard("Conclusões", totals.completed, prevTotals.completed)}
          {deltaCard("Taxa de entrada", totals.entry_rate, prevTotals.entry_rate ?? 0, true, true)}
          {deltaCard("Taxa de conclusão", totals.completion_rate, prevTotals.completion_rate ?? 0, true, true)}
          {deltaCard("Conversão total", totals.conversion_rate, prevTotals.conversion_rate, true, true)}
        </div>

        {/* Cards por dia da semana */}
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            Por dia da semana {mode === "last4" ? "(soma das últimas 4 semanas)" : ""}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {WEEK_ORDER.map((dow) => {
              const d = byDow[dow];
              const prev = prevByDow[dow];
              const visitorBarPct = maxVisitors > 0 ? (d.visitors / maxVisitors) * 100 : 0;
              const isBestVisitors = dow === bestVisitorsDow && d.visitors > 0;
              const isBestConv = dow === bestConversionDow && d.conversion_rate > 0;
              const isWorstConv = dow === worstConversionDow && activeDays.length > 1 && d.visitors > 0;
              const dayCardClass = isBestConv
                ? "border-emerald-500/40 bg-emerald-500/5"
                : isWorstConv
                ? "border-rose-500/30 bg-rose-500/5"
                : "border-border/40 bg-background/40";
              // Daily delta vs same dow previous range
              const visDelta = prev.visitors > 0 ? pct(d.visitors - prev.visitors, prev.visitors) : (d.visitors > 0 ? 100 : 0);
              return (
                <div key={dow} className={`rounded-md border p-2.5 ${dayCardClass}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {DOW_SHORT[dow]}
                    </p>
                    <div className="flex gap-1">
                      {isBestVisitors && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] border-cyan-500/40 text-cyan-300">
                          <Trophy className="w-2.5 h-2.5 mr-0.5" />top
                        </Badge>
                      )}
                      {isBestConv && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] border-emerald-500/40 text-emerald-300">
                          ★
                        </Badge>
                      )}
                      {isWorstConv && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] border-rose-500/40 text-rose-300">
                          <AlertTriangle className="w-2.5 h-2.5" />
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Visitors */}
                  <div className="mb-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-bold leading-none">{d.visitors}</span>
                      <span className="text-[9px] text-muted-foreground">visit.</span>
                    </div>
                    <div className="h-1 mt-1 rounded-full bg-border/30 overflow-hidden">
                      <div
                        className="h-full bg-cyan-400/80"
                        style={{ width: `${visitorBarPct}%` }}
                      />
                    </div>
                    {prev.visitors > 0 && (
                      <p className={`text-[9px] mt-0.5 ${visDelta > 0 ? "text-emerald-400" : visDelta < 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                        {visDelta > 0 ? "+" : ""}{visDelta.toFixed(0)}% vs ant.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[10px]">
                    <div>
                      <p className="text-muted-foreground">Tráfego</p>
                      <p className="font-semibold text-amber-300">{d.sessions}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Entrou</p>
                      <p className="font-semibold text-blue-400">{d.entered_quiz === null ? "—" : d.entered_quiz}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Concl.</p>
                      <p className="font-semibold text-green-400">{d.completed}</p>
                    </div>
                  </div>

                  <div className="mt-1.5 pt-1.5 border-t border-border/30 grid grid-cols-3 gap-0.5 text-[9px]">
                    <div title="Entradas / Visitantes">
                      <p className="text-muted-foreground">Entr.</p>
                      <p className="font-semibold">{d.entry_rate === null ? "—" : `${d.entry_rate.toFixed(0)}%`}</p>
                    </div>
                    <div title="Conclusões / Entradas">
                      <p className="text-muted-foreground">Concl.</p>
                      <p className="font-semibold">{d.completion_rate === null ? "—" : `${d.completion_rate.toFixed(0)}%`}</p>
                    </div>
                    <div title="Conclusões / Visitantes">
                      <p className="text-muted-foreground">Conv.</p>
                      <p className={`font-semibold ${isBestConv ? "text-emerald-400" : isWorstConv ? "text-rose-400" : ""}`}>
                        {d.conversion_rate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Insights automáticos
              </p>
            </div>
            <ul className="space-y-1">
              {insights.map((ins, i) => (
                <li key={i} className="text-xs text-foreground/90">• {ins}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/70">
          Período analisado: <span className="font-semibold text-foreground/90">{format(ymdToDate(primary.from), "dd/MM/yyyy", { locale: ptBR })} → {format(ymdToDate(primary.to), "dd/MM/yyyy", { locale: ptBR })}</span> · Comparado com {format(ymdToDate(previous.from), "dd/MM/yyyy", { locale: ptBR })} → {format(ymdToDate(previous.to), "dd/MM/yyyy", { locale: ptBR })} (fuso America/São_Paulo)
        </p>
      </CardContent>
    </Card>
  );
}
