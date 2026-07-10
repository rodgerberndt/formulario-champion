import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDateRange } from "@/context/DateRangeContext";
import { Loader2, TrendingDown, TrendingUp, MousePointerClick, ArrowDown, Activity, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ScrollAttentionHeatmap from "./ScrollAttentionHeatmap";

/**
 * BumpNumber: mostra o valor numérico e, quando ele muda, exibe um overlay
 * verde grande com a diferença (+N / -N) por 3s, sem afetar o layout.
 */
function BumpNumber({ value, className }: { value: number; className?: string }) {
  const prevRef = useRef<number>(value);
  const [delta, setDelta] = useState<number | null>(null);
  const [phase, setPhase] = useState<"in" | "hold" | "out" | null>(null);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      prevRef.current = value;
      return;
    }
    const diff = value - prevRef.current;
    prevRef.current = value;
    if (diff !== 0) {
      setDelta(diff);
      setPhase("in");
      // depois do zoom-in (400ms), entra no hold
      const t1 = setTimeout(() => setPhase("hold"), 400);
      // após 2.4s no hold, começa o zoom-out (600ms)
      const t2 = setTimeout(() => setPhase("out"), 2400);
      // remove totalmente depois de 3s
      const t3 = setTimeout(() => { setPhase(null); setDelta(null); }, 3000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [value]);

  const overlayStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      textShadow: `0 0 14px ${delta && delta > 0 ? "hsl(142 76% 45% / 0.95)" : "hsl(0 80% 60% / 0.95)"}`,
      transition: "transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 500ms ease-out",
      transformOrigin: "center bottom",
    };
    if (phase === "in") return { ...base, transform: "translate(-50%, 0) scale(0.2)", opacity: 0 };
    if (phase === "hold") return { ...base, transform: "translate(-50%, 0) scale(1)", opacity: 1 };
    if (phase === "out") return { ...base, transform: "translate(-50%, -6px) scale(0.2)", opacity: 0, transition: "transform 600ms ease-in, opacity 600ms ease-in" };
    return base;
  })();

  return (
    <span className="relative inline-block">
      <span className={className}>{value}</span>
      {delta !== null && (
        <span
          className={`pointer-events-none absolute -top-8 left-1/2 text-3xl font-extrabold ${
            delta > 0 ? "text-emerald-400" : "text-rose-400"
          }`}
          style={overlayStyle}
        >
          {delta > 0 ? "+" : ""}{delta}
        </span>
      )}
    </span>
  );
}

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
interface ButtonClick { id: string; label: string; type: string; count: number; uniqueUsers: number; }
interface AttentionBin { bin: number; range_pct: [number, number]; total_time_ms: number; avg_time_ms: number; users: number; pct_of_visitors: number; }
interface SectionBoundary { section_id: string; pos_pct: number; }
interface ClickCell { col: number; row: number; count: number; }

interface PeriodData {
  totalVisitors: number;
  funnel: FunnelStep[];
  scrollDepth: ScrollDepth[];
  scrollAttention?: AttentionBin[];
  sectionBoundaries?: SectionBoundary[];
  clicksByType: Record<string, number>;
  clicksBySection: Record<string, number>;
  clicksByButton?: Record<string, ButtonClick[]>;
  clickHeatmap?: Record<string, ClickCell[]>;
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
  hero: "Headline inicial",
  social_proof: "Prova social",
  dor: "Dor / problema",
  portfolio: "Portfólio",
  cta_intermediario: "CTA intermediário",
  metodo: "Método Champion",
  gancho_corpo: "Gancho & Corpo",
  como_funciona: "Como funciona",
  faq: "FAQ",
  cta_final: "CTA final",
};

// Labels amigáveis das perguntas do FAQ (ordem deve bater com FAQSection.tsx)
const FAQ_QUESTION_LABELS: Record<string, string> = {
  faq_q1: "Criativo morre na escala?",
  faq_q2: "Já tenho time/agência. Por que Champion?",
  faq_q3: "Em quanto tempo vejo resultado?",
  faq_q4: "Funciona pro meu nicho?",
  faq_q5: "Qual o investimento?",
  faq_q6: "Vocês produzem o criativo?",
  faq_q7: "Como garantem performance?",
  faq_q8: "Sprint vs Assessoria?",
  faq_q9: "Por que responder o quiz antes?",
  faq_q10: "E se eu não gostar dos criativos?",
};

// Section IDs to hide from the funnel list (tracked elsewhere)
const HIDDEN_SECTIONS = new Set(["cta_intermediario_btn"]);

function fmtPct(n: number) { return `${n.toFixed(1)}%`; }
function fmtTime(ms: number) {
  if (!ms || ms < 0) return "0s";
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return `${min}m ${sec}s`;
}

const GRID_COLS = 12;
const GRID_ROWS = 8;

// Grid 12x8 sobreposto a uma miniatura da seção, colorido pela densidade de
// clique/toque em cada célula — o "onde o dedo tocou" dentro da seção.
function ClickPositionGrid({ cells }: { cells: ClickCell[] }) {
  const maxCount = Math.max(...cells.map((c) => c.count), 1);
  const cellMap = new Map(cells.map((c) => [`${c.col},${c.row}`, c.count]));

  return (
    <div className="rounded-md border border-border/40 overflow-hidden bg-muted/10" style={{ aspectRatio: `${GRID_COLS} / ${GRID_ROWS}` }}>
      <div className="grid h-full w-full" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)` }}>
        {Array.from({ length: GRID_ROWS }, (_, row) =>
          Array.from({ length: GRID_COLS }, (_, col) => {
            const count = cellMap.get(`${col},${row}`) || 0;
            const intensity = count / maxCount;
            return (
              <div
                key={`${col}-${row}`}
                className="border border-background/10"
                style={{
                  background: count > 0 ? `hsl(${(1 - intensity) * 55 + 0}, 90%, ${55 - intensity * 15}%)` : "transparent",
                  opacity: count > 0 ? 0.35 + intensity * 0.5 : 0,
                }}
                title={count > 0 ? `${count} cliques nesta região` : undefined}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export default function LandingBehaviorSection({ fetchAdminData }: Props) {
  const { startISO, endExclusiveISO } = useDateRange();
  const [data, setData] = useState<BehaviorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

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

  if (loading && !data) {
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
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            Comportamento na Landing Page — funil por seção, scroll e cliques
            {refreshing && (
              <span className="inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground/70 normal-case tracking-normal">
                <Loader2 className="w-3 h-3 animate-spin" /> atualizando…
              </span>
            )}
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
            {cur.funnel.filter((f) => !HIDDEN_SECTIONS.has(f.section_id)).map((f) => {
              const label = SECTION_LABELS[f.section_id] || f.section_id;
              const widthPct = maxReached > 0 ? (f.reached / maxReached) * 100 : 0;
              const intensity = f.pct_of_visitors / 100;
              const prevStep = findPrev(f.section_id);
              const reachDelta = prevStep ? f.pct_of_visitors - prevStep.pct_of_visitors : null;

              // heatmap color: more visitors = warmer (amber); less = cooler (blue)
              const heatBg = `hsl(${(1 - intensity) * 220 + intensity * 38}, 80%, ${20 + intensity * 25}%)`;

              const buttons = cur.clicksByButton?.[f.section_id] || [];
              const isOpen = expanded.has(f.section_id);
              // Sub-detalhamento por botão SÓ no FAQ (outras seções têm muitos
              // rótulos diferentes para o mesmo CTA, gerando ruído visual).
              const showButtons = f.section_id === "faq" && buttons.length > 0;
              const clickCells = cur.clickHeatmap?.[f.section_id] || [];
              const showClickGrid = clickCells.length > 0;
              const canExpand = showButtons || showClickGrid;

              return (
                <div key={f.section_id} className="rounded-md border border-border/40 overflow-hidden">
                  <div
                    className={`relative h-12 ${canExpand ? "cursor-pointer hover:bg-muted/30" : ""}`}
                    onClick={() => canExpand && toggleExpanded(f.section_id)}
                  >
                    <div
                      className="absolute inset-y-0 left-0 transition-all"
                      style={{ width: `${widthPct}%`, background: heatBg, opacity: 0.55 }}
                    />
                    <div className="relative h-full px-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono text-muted-foreground w-5 flex-shrink-0">#{f.order}</span>
                        <span className="text-xs font-semibold truncate">{label}</span>
                        {canExpand && (
                          <span className="text-[9px] text-muted-foreground/60 flex-shrink-0">
                            {isOpen ? "▾" : "▸"}{" "}
                            {showButtons && `${buttons.length} ${buttons.length === 1 ? "botão" : "botões"}`}
                            {showButtons && showClickGrid && " · "}
                            {showClickGrid && "mapa de cliques"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] flex-shrink-0">
                        <div className="text-right">
                          <p className="text-muted-foreground">Chegou</p>
                          <p className="font-bold text-cyan-300"><BumpNumber value={f.reached} /> <span className="text-muted-foreground/70">({fmtPct(f.pct_of_visitors)})</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground">Tempo médio</p>
                          <p className="font-bold text-violet-300">{fmtTime(f.avg_time_ms)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground">Continuou</p>
                          <p className="font-bold text-emerald-300"><BumpNumber value={f.continued} /> <span className="text-muted-foreground/70">({fmtPct(f.continue_rate)})</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground">Clicou</p>
                          <p className="font-bold text-amber-300"><BumpNumber value={f.clicked ?? 0} /> <span className="text-muted-foreground/70">({fmtPct(f.click_rate ?? 0)})</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground">Saiu</p>
                          <p className="font-bold text-rose-300"><BumpNumber value={f.dropped} /> <span className="text-muted-foreground/70">({fmtPct(f.drop_rate)})</span></p>
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
                  {isOpen && canExpand && (
                    <div className="border-t border-border/40 bg-muted/10 px-3 py-2 space-y-3">
                      {showButtons && (
                        <div className="space-y-1">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 mb-1">
                            Cliques nos botões/itens desta seção
                          </p>
                          {buttons.map((b) => {
                            const friendly = FAQ_QUESTION_LABELS[b.id] || b.label || b.id;
                            return (
                              <div key={b.id} className="flex items-center justify-between gap-2 text-[10px] py-1 border-b border-border/20 last:border-0">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium text-foreground">{friendly}</p>
                                  <p className="text-muted-foreground/60 text-[9px] font-mono">{b.id} · {b.type}</p>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <span className="text-amber-300 font-bold">{b.count} cliques</span>
                                  <span className="text-cyan-300/80">{b.uniqueUsers} únicos</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {showClickGrid && (
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                            Onde tocaram/clicaram dentro desta seção
                          </p>
                          <ClickPositionGrid cells={clickCells} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {cur.scrollAttention && cur.sectionBoundaries && (
          <ScrollAttentionHeatmap
            scrollAttention={cur.scrollAttention}
            sectionBoundaries={cur.sectionBoundaries}
            sectionLabels={SECTION_LABELS}
            totalVisitors={cur.totalVisitors}
          />
        )}

        {prev && (
          <div className="text-[10px] text-muted-foreground/70 text-center pt-2 border-t border-border/30">
            Comparações vs período anterior ({prev.totalVisitors} visitantes)
          </div>
        )}
      </CardContent>
    </Card>
  );
}
