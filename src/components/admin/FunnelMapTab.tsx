import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Megaphone,
  ClipboardList,
  MessageSquare,
  Headphones,
  CalendarCheck,
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Info,
  ArrowRight,
  ChevronRight,
  Download,
  Loader2,
  Target,
  Zap,
  Users,
  Eye,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────
interface Metrics {
  total_visitors: number;
  unique_visitors: number;
  has_reliable_ip_data: boolean;
  ip_coverage_percent: number;
  entered_quiz: number;
  started_quiz: number;
  completed: number;
  conversion_rate: string | number;
  completion_rate: string | number;
  button_distribution: { start_btn_1: number; start_btn_2: number; start_btn_3: number };
  step_funnel: Array<{ step_id: string; count: number }>;
  drop_offs: Record<string, number>;
}

interface Lead {
  id: string;
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  mercado: string;
  estagio_negocio: string;
  investimento_faixa: string | null;
  dor_desejo: string;
  created_at: string;
  tier: string | null;
  score: number | null;
  sdr_override: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  campaign_id: string | null;
  ad_id: string | null;
}

interface FunnelMapTabProps {
  metrics: Metrics | null;
  leads: Lead[];
  loading: boolean;
}

// ─── Step labels ──────────────────────────────────────────────────────
const STEP_LABELS: Record<string, string> = {
  q1_nome: "Nome",
  q2_whats: "WhatsApp",
  q3_insta: "Instagram",
  q4_mercado: "Mercado",
  q5_estagio: "Estágio",
  q6_investimento: "Investimento",
  q7_dor: "Dor/Desejo",
};

// ─── Stage definitions ────────────────────────────────────────────────
interface FunnelStage {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  bgColor: string;
  available: boolean;
}

const STAGES: FunnelStage[] = [
  { id: "ads", label: "Anúncio (Tráfego)", shortLabel: "Anúncio", icon: <Megaphone className="w-5 h-5" />, color: "text-blue-400", borderColor: "border-blue-500/40", bgColor: "bg-blue-500/10", available: true },
  { id: "forms", label: "Forms (Quiz)", shortLabel: "Quiz", icon: <ClipboardList className="w-5 h-5" />, color: "text-purple-400", borderColor: "border-purple-500/40", bgColor: "bg-purple-500/10", available: true },
  { id: "whatsapp", label: "WhatsApp Bot", shortLabel: "WhatsApp", icon: <MessageSquare className="w-5 h-5" />, color: "text-green-400", borderColor: "border-green-500/40", bgColor: "bg-green-500/10", available: true },
  { id: "sdr", label: "SDR (até 6h)", shortLabel: "SDR", icon: <Headphones className="w-5 h-5" />, color: "text-orange-400", borderColor: "border-orange-500/40", bgColor: "bg-orange-500/10", available: false },
  { id: "meeting", label: "Reunião", shortLabel: "Reunião", icon: <CalendarCheck className="w-5 h-5" />, color: "text-cyan-400", borderColor: "border-cyan-500/40", bgColor: "bg-cyan-500/10", available: false },
  { id: "sales", label: "Vendas", shortLabel: "Vendas", icon: <DollarSign className="w-5 h-5" />, color: "text-yellow-400", borderColor: "border-yellow-500/40", bgColor: "bg-yellow-500/10", available: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────
function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0.0";
  return ((numerator / denominator) * 100).toFixed(1);
}

function getPerformanceColor(rate: number, thresholds: { green: number; yellow: number }): string {
  if (rate >= thresholds.green) return "text-green-400";
  if (rate >= thresholds.yellow) return "text-yellow-400";
  return "text-red-400";
}

function getPerformanceBg(rate: number, thresholds: { green: number; yellow: number }): string {
  if (rate >= thresholds.green) return "bg-green-500/10 border-green-500/30";
  if (rate >= thresholds.yellow) return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-red-500/10 border-red-500/30";
}

// ─── Component ────────────────────────────────────────────────────────
export default function FunnelMapTab({ metrics, leads, loading }: FunnelMapTabProps) {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Filter leads by source
  const filteredLeads = useMemo(() => {
    if (sourceFilter === "all") return leads;
    if (sourceFilter === "meta") return leads.filter(l => l.utm_source === "fb" || l.utm_source === "ig" || l.utm_source === "facebook" || l.utm_source === "instagram" || l.campaign_id || l.ad_id);
    if (sourceFilter === "organic") return leads.filter(l => !l.utm_source || l.utm_source === "direct");
    return leads;
  }, [leads, sourceFilter]);

  // ── Compute stage volumes ───────────────────────────────────────────
  const stageData = useMemo(() => {
    if (!metrics) return null;

    const visitors = metrics.has_reliable_ip_data ? metrics.unique_visitors : metrics.total_visitors;
    const sessions = metrics.total_visitors;
    const enteredQuiz = metrics.entered_quiz;
    const startedQuiz = metrics.started_quiz;
    const completed = metrics.completed;
    const leadsCount = filteredLeads.length;

    // WhatsApp bot: count sessions with rodger_whatsapp_notified  
    // We approximate from leads count since we don't have whatsapp metrics from this data
    const whatsappSent = leadsCount; // all completed leads get a message
    const whatsappDelivered = Math.round(leadsCount * 0.95); // placeholder estimate

    // SDR / Meeting / Sales placeholders
    const sdrContacted = 0;
    const meetings = 0;
    const sales = 0;

    return {
      ads: { main: visitors, secondary: sessions, label: "Sessões", secondaryLabel: "Total sessões" },
      forms: { main: completed, secondary: startedQuiz, label: "Leads", secondaryLabel: "Iniciaram quiz" },
      whatsapp: { main: whatsappSent, secondary: whatsappDelivered, label: "Msg Enviadas", secondaryLabel: "Entregues (est.)" },
      sdr: { main: sdrContacted, secondary: 0, label: "Contatados", secondaryLabel: "MQL" },
      meeting: { main: meetings, secondary: 0, label: "Agendamentos", secondaryLabel: "Show" },
      sales: { main: sales, secondary: 0, label: "Vendas", secondaryLabel: "Recorrência" },
    };
  }, [metrics, filteredLeads]);

  // ── Compute conversions stage-to-stage ──────────────────────────────
  const conversions = useMemo(() => {
    if (!stageData || !metrics) return [];
    const visitors = metrics.has_reliable_ip_data ? metrics.unique_visitors : metrics.total_visitors;
    
    const stageVolumes = [
      { id: "ads", volume: visitors },
      { id: "forms", volume: metrics.completed },
      { id: "whatsapp", volume: stageData.whatsapp.main },
      { id: "sdr", volume: stageData.sdr.main },
      { id: "meeting", volume: stageData.meeting.main },
      { id: "sales", volume: stageData.sales.main },
    ];

    return stageVolumes.map((stage, i) => {
      const prev = i > 0 ? stageVolumes[i - 1].volume : 0;
      const convRate = prev > 0 ? (stage.volume / prev) * 100 : 0;
      const drop = prev > 0 ? ((prev - stage.volume) / prev) * 100 : 0;
      return { ...stage, convRate, drop, prevVolume: prev };
    });
  }, [stageData, metrics]);

  // ── Bottleneck analysis ─────────────────────────────────────────────
  const bottlenecks = useMemo(() => {
    if (!conversions.length) return { drops: [], gains: [], anomalies: [] };

    const drops = conversions
      .filter((c, i) => i > 0 && c.prevVolume > 0 && STAGES[i].available)
      .map(c => ({
        from: STAGES[conversions.indexOf(c) - 1]?.label || "",
        to: STAGES[conversions.indexOf(c)]?.label || "",
        drop: c.drop,
        volume: c.prevVolume - c.volume,
      }))
      .sort((a, b) => b.drop - a.drop)
      .slice(0, 3);

    // Quiz step bottlenecks
    const quizDrops = metrics?.step_funnel
      ? metrics.step_funnel.map((step, i) => {
          const prev = i === 0 ? metrics.started_quiz : (metrics.step_funnel[i - 1]?.count || 0);
          const dropRate = prev > 0 ? ((prev - step.count) / prev) * 100 : 0;
          return { step: step.step_id, dropRate, dropCount: prev - step.count };
        }).filter(s => s.dropRate > 0).sort((a, b) => b.dropRate - a.dropRate)
      : [];

    // Anomalies
    const anomalies: string[] = [];
    conversions.forEach((c, i) => {
      if (i > 0 && c.volume > c.prevVolume && STAGES[i].available) {
        anomalies.push(`${STAGES[i].label} (${c.volume}) > ${STAGES[i - 1].label} (${c.prevVolume})`);
      }
    });

    return { drops, quizDrops, gains: [], anomalies };
  }, [conversions, metrics]);

  // ── Drawer content ──────────────────────────────────────────────────
  const renderDrawerContent = (stageId: string) => {
    switch (stageId) {
      case "ads":
        return <AdsDrawer metrics={metrics} />;
      case "forms":
        return <FormsDrawer metrics={metrics} leads={filteredLeads} />;
      case "whatsapp":
        return <WhatsAppDrawer leadsCount={filteredLeads.length} />;
      case "sdr":
        return <PlaceholderDrawer stage="SDR" fields={["Status do lead no CRM (MQL)", "Timestamp do 1º contato do SDR", "SDR responsável", "Canal de contato (WhatsApp/Call)"]} />;
      case "meeting":
        return <PlaceholderDrawer stage="Reunião" fields={["Data/hora do agendamento", "Status (Show/No-show)", "Link da reunião", "Notas do SDR"]} />;
      case "sales":
        return <PlaceholderDrawer stage="Vendas" fields={["Valor da venda", "Data de fechamento", "Tipo (nova/recorrência)", "Produto vendido"]} />;
      default:
        return null;
    }
  };

  // ── Loading state ───────────────────────────────────────────────────
  if (loading || !metrics) {
    return (
      <div className="space-y-6">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ── Topbar Filters ────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue placeholder="Fonte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fontes</SelectItem>
              <SelectItem value="meta">Meta Ads</SelectItem>
              <SelectItem value="organic">Orgânico</SelectItem>
            </SelectContent>
          </Select>

          <Badge variant="outline" className="text-xs px-3 py-1.5 border-muted-foreground/30">
            <Users className="w-3 h-3 mr-1.5" />
            Unique por sessão
          </Badge>
        </div>

        {/* ── Funnel Diagram ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAGES.map((stage, i) => {
            const conv = conversions[i];
            const data = stageData?.[stage.id as keyof typeof stageData];
            const isActive = stage.available;
            const convRate = conv?.convRate || 0;
            const thresholds = stage.id === "ads" ? { green: 100, yellow: 0 } :
              stage.id === "forms" ? { green: 30, yellow: 15 } :
              { green: 50, yellow: 25 };

            return (
              <div key={stage.id} className="relative">
                {/* Connector arrow */}
                {i > 0 && (
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 hidden lg:flex items-center">
                    <ChevronRight className="w-5 h-5 text-muted-foreground/40" />
                  </div>
                )}

                <button
                  onClick={() => setSelectedStage(stage.id)}
                  disabled={!isActive}
                  className={`w-full text-left rounded-2xl border-2 p-4 transition-all duration-200 group relative overflow-hidden
                    ${isActive ? `${stage.borderColor} hover:scale-[1.02] hover:shadow-lg cursor-pointer` : "border-muted/30 opacity-50 cursor-not-allowed"}
                    ${selectedStage === stage.id ? `ring-2 ring-offset-2 ring-offset-background ${stage.borderColor.replace("border-", "ring-")}` : ""}
                  `}
                >
                  {/* Background glow */}
                  <div className={`absolute inset-0 ${stage.bgColor} opacity-30`} />

                  <div className="relative z-10 space-y-3">
                    {/* Header */}
                    <div className="flex items-center gap-2">
                      <div className={`${stage.color}`}>{stage.icon}</div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{stage.shortLabel}</span>
                    </div>

                    {/* Main number */}
                    <p className={`text-3xl font-black ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {data?.main ?? 0}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{data?.label}</p>

                    {/* Conversion vs previous */}
                    {i > 0 && isActive && (
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border ${getPerformanceBg(convRate, thresholds)}`}>
                        <span className={getPerformanceColor(convRate, thresholds)}>
                          {pct(conv?.volume || 0, conv?.prevVolume || 1)}%
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Conversão vs etapa anterior ({STAGES[i - 1].shortLabel})</p>
                            <p className="text-muted-foreground text-xs mt-1">{conv?.volume || 0} de {conv?.prevVolume || 0}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}

                    {/* Not available overlay */}
                    {!isActive && (
                      <div className="mt-1">
                        <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground">
                          Conectar dados
                        </Badge>
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Quiz Step-by-Step Funnel ──────────────────────────────── */}
        <Card className="border-purple-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-purple-400" />
              Funil do Quiz — Etapa por Etapa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {["q1_nome", "q2_whats", "q3_insta", "q4_mercado", "q5_estagio", "q6_investimento", "q7_dor"].map(
                (stepId, index) => {
                  const stepData = metrics.step_funnel.find(s => s.step_id === stepId);
                  const count = stepData?.count || 0;
                  const prev = index === 0 ? metrics.started_quiz : (metrics.step_funnel.find(s => s.step_id === ["q1_nome", "q2_whats", "q3_insta", "q4_mercado", "q5_estagio", "q6_investimento", "q7_dor"][index - 1])?.count || 0);
                  const convRate = prev > 0 ? (count / prev) * 100 : 0;
                  const dropOff = metrics.drop_offs[stepId] || 0;
                  const maxCount = metrics.started_quiz || 1;
                  const widthPct = maxCount > 0 ? Math.max(2, (count / maxCount) * 100) : 2;
                  const isBottleneck = bottlenecks.quizDrops?.[0]?.step === stepId;

                  return (
                    <div key={stepId} className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${isBottleneck ? "bg-red-500/5 border border-red-500/20" : "hover:bg-muted/30"}`}>
                      <span className="w-6 text-center text-xs font-bold text-muted-foreground">{index + 1}</span>
                      <span className="w-28 text-sm font-medium truncate">{STEP_LABELS[stepId]}</span>
                      
                      {/* Bar */}
                      <div className="flex-1 h-7 bg-muted/50 rounded-lg overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-lg transition-all duration-500"
                          style={{ width: `${widthPct}%` }}
                        />
                        <span className="absolute inset-0 flex items-center px-3 text-xs font-bold">
                          {count}
                        </span>
                      </div>

                      {/* Conversion vs previous */}
                      <div className="w-16 text-right">
                        <span className={`text-xs font-bold ${convRate >= 80 ? "text-green-400" : convRate >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                          {index === 0 ? "—" : `${convRate.toFixed(0)}%`}
                        </span>
                      </div>

                      {/* Drop-off */}
                      <div className="w-20 text-right">
                        {dropOff > 0 ? (
                          <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-md">
                            -{dropOff}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </div>

                      {isBottleneck && (
                        <Tooltip>
                          <TooltipTrigger>
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Maior gargalo do quiz</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  );
                }
              )}

              {/* Completed row */}
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-green-500/5 border border-green-500/20">
                <span className="w-6 text-center text-xs font-bold text-green-400">✓</span>
                <span className="w-28 text-sm font-bold text-green-400">Concluído</span>
                <div className="flex-1 h-7 bg-muted/50 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-lg transition-all duration-500"
                    style={{ width: `${metrics.started_quiz > 0 ? Math.max(2, (metrics.completed / metrics.started_quiz) * 100) : 2}%` }}
                  />
                  <span className="absolute inset-0 flex items-center px-3 text-xs font-bold text-green-100">
                    {metrics.completed}
                  </span>
                </div>
                <div className="w-16 text-right">
                  <span className="text-xs font-bold text-green-400">
                    {pct(metrics.completed, metrics.started_quiz)}%
                  </span>
                </div>
                <div className="w-20" />
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-6 mt-4 text-[10px] text-muted-foreground uppercase tracking-wider">
              <span>Etapa</span>
              <span className="ml-auto">Volume</span>
              <span className="w-16 text-right">Conv. vs ant.</span>
              <span className="w-20 text-right">Abandonos</span>
              <span className="w-4" />
            </div>
          </CardContent>
        </Card>

        {/* ── Bottlenecks & Opportunities ───────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Top drops */}
          <Card className="border-red-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                Maiores Quedas do Período
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bottlenecks.quizDrops && bottlenecks.quizDrops.length > 0 ? (
                <div className="space-y-3">
                  {bottlenecks.quizDrops.slice(0, 3).map((drop, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-red-400">{i + 1}</span>
                        <div>
                          <p className="text-sm font-medium">Quiz → {STEP_LABELS[drop.step] || drop.step}</p>
                          <p className="text-xs text-muted-foreground">{drop.dropCount} abandonos</p>
                        </div>
                      </div>
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 font-bold">
                        -{drop.dropRate.toFixed(1)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Sem dados no período — tente ampliar a data</p>
              )}
            </CardContent>
          </Card>

          {/* Anomalies */}
          <Card className="border-yellow-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                Alertas & Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {bottlenecks.anomalies.length > 0 ? (
                  bottlenecks.anomalies.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/10">
                      <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-yellow-400">Possível divergência de tracking</p>
                        <p className="text-xs text-muted-foreground">{a}</p>
                      </div>
                    </div>
                  ))
                ) : null}

                {/* Key metrics insights */}
                {metrics.completed > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-muted">
                    <Target className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Taxa de conversão geral</p>
                      <p className="text-xs text-muted-foreground">
                        {pct(metrics.completed, metrics.has_reliable_ip_data ? metrics.unique_visitors : metrics.total_visitors)}% dos visitantes se tornaram leads
                      </p>
                    </div>
                  </div>
                )}

                {metrics.started_quiz > 0 && metrics.completed > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-muted">
                    <Zap className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Completion rate do quiz</p>
                      <p className="text-xs text-muted-foreground">
                        {pct(metrics.completed, metrics.started_quiz)}% de quem começou o quiz finalizou
                      </p>
                    </div>
                  </div>
                )}

                {/* Stages not connected */}
                <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/20 border border-dashed border-muted">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Etapas pendentes</p>
                    <p className="text-xs text-muted-foreground">
                      SDR, Reunião e Vendas precisam de integração com CRM para exibir dados reais.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Stage Detail Drawer ──────────────────────────────────── */}
        <Sheet open={!!selectedStage} onOpenChange={(open) => !open && setSelectedStage(null)}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {selectedStage && STAGES.find(s => s.id === selectedStage)?.icon}
                {selectedStage && STAGES.find(s => s.id === selectedStage)?.label}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              {selectedStage && renderDrawerContent(selectedStage)}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}

// ─── Drawer: Ads ──────────────────────────────────────────────────────
function AdsDrawer({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) return null;
  const visitors = metrics.has_reliable_ip_data ? metrics.unique_visitors : metrics.total_visitors;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Sessões" value={metrics.total_visitors} />
        <MetricCard label="Visitantes Únicos" value={visitors} />
        <MetricCard label="Entraram no Quiz" value={metrics.entered_quiz} />
        <MetricCard label="CTR Interno" value={`${pct(metrics.entered_quiz, visitors)}%`} tooltip="Quiz Views / Visitantes" />
      </div>

      <div className="p-4 rounded-xl bg-muted/30 border border-muted">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-blue-400" />
          Métricas de Anúncio (Meta Ads API)
        </h4>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Para exibir Spend, CPM, CTR, CPC, CPS e métricas de vídeo, conecte a Meta Marketing API.</p>
          <div className="mt-3 p-3 bg-background rounded-lg border border-dashed border-muted-foreground/30">
            <p className="text-xs font-mono text-muted-foreground">Campos necessários:</p>
            <ul className="text-xs mt-1 space-y-0.5 text-muted-foreground/70">
              <li>• META_ADS_ACCESS_TOKEN</li>
              <li>• META_ADS_ACCOUNT_ID</li>
              <li>• Campos: spend, impressions, reach, frequency, cpm, ctr, cpc, actions</li>
              <li>• Video: video_avg_time_watched_actions, video_p25/50/75/95/100</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Button distribution */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Distribuição de Botões</h4>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(metrics.button_distribution).map(([key, value]) => (
            <div key={key} className="p-3 rounded-xl bg-muted/30 text-center">
              <p className="text-xl font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground uppercase">
                {key === "start_btn_1" ? "Hero" : key === "start_btn_2" ? "CTA" : "Mobile"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Drawer: Forms ────────────────────────────────────────────────────
function FormsDrawer({ metrics, leads }: { metrics: Metrics | null; leads: Lead[] }) {
  if (!metrics) return null;
  const visitors = metrics.has_reliable_ip_data ? metrics.unique_visitors : metrics.total_visitors;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Visitantes" value={visitors} />
        <MetricCard label="Entraram no Quiz" value={metrics.entered_quiz} />
        <MetricCard label="Iniciaram Quiz" value={metrics.started_quiz} />
        <MetricCard label="Concluíram" value={metrics.completed} highlight />
        <MetricCard label="CTR Interno" value={`${pct(metrics.started_quiz, visitors)}%`} tooltip="Quiz Starts / Visitantes" />
        <MetricCard label="Completion Rate" value={`${pct(metrics.completed, metrics.started_quiz)}%`} tooltip="Conclusões / Quiz Starts" />
      </div>

      {/* Maior gargalo */}
      {metrics.drop_offs && Object.keys(metrics.drop_offs).length > 0 && (() => {
        const maxDrop = Object.entries(metrics.drop_offs).sort((a, b) => b[1] - a[1])[0];
        return (
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-bold text-red-400">Maior Gargalo do Quiz</span>
            </div>
            <p className="text-sm">
              <span className="font-semibold">{STEP_LABELS[maxDrop[0]] || maxDrop[0]}</span> — {maxDrop[1]} abandonos
            </p>
          </div>
        );
      })()}

      {/* Cost section placeholder */}
      <div className="p-4 rounded-xl bg-muted/30 border border-dashed border-muted-foreground/30">
        <h4 className="text-sm font-semibold mb-2">Custos (requer Meta Ads API)</h4>
        <div className="grid grid-cols-3 gap-2 text-center text-muted-foreground/50">
          <div className="p-2 bg-background rounded-lg">
            <p className="text-lg font-bold">—</p>
            <p className="text-[10px]">CPL</p>
          </div>
          <div className="p-2 bg-background rounded-lg">
            <p className="text-lg font-bold">—</p>
            <p className="text-[10px]">Custo/Quiz Start</p>
          </div>
          <div className="p-2 bg-background rounded-lg">
            <p className="text-lg font-bold">—</p>
            <p className="text-[10px]">CPS</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Drawer: WhatsApp ─────────────────────────────────────────────────
function WhatsAppDrawer({ leadsCount }: { leadsCount: number }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Leads Elegíveis" value={leadsCount} />
        <MetricCard label="Msg Enviadas" value={leadsCount} tooltip="Todos os leads recebem mensagem automática" />
      </div>

      <div className="p-4 rounded-xl bg-muted/30 border border-dashed border-muted-foreground/30">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-green-400" />
          Métricas Avançadas (requer WhatsApp Business API)
        </h4>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Para exibir delivered, read, reply rates e tempo de resposta:</p>
          <div className="mt-3 p-3 bg-background rounded-lg border border-dashed border-muted-foreground/30">
            <p className="text-xs font-mono text-muted-foreground">Webhook de status da mensagem:</p>
            <ul className="text-xs mt-1 space-y-0.5 text-muted-foreground/70">
              <li>• Status: sent → delivered → read</li>
              <li>• Timestamp de cada transição</li>
              <li>• Inbound messages (respostas)</li>
              <li>• Template name/version</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Drawer: Placeholder ──────────────────────────────────────────────
function PlaceholderDrawer({ stage, fields }: { stage: string; fields: string[] }) {
  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-muted/20 border border-dashed border-muted-foreground/20 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <Info className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-lg font-bold text-muted-foreground mb-2">
          {stage} — Dados não conectados
        </h3>
        <p className="text-sm text-muted-foreground/70 mb-6">
          Esta etapa precisa de integração com o CRM/sistema externo para exibir métricas reais.
        </p>

        <div className="text-left p-4 bg-background rounded-xl border border-muted">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Campos/dados necessários:
          </p>
          <ul className="space-y-2">
            {fields.map((field, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                {field}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Metric Card helper ───────────────────────────────────────────────
function MetricCard({ label, value, tooltip, highlight }: { label: string; value: string | number; tooltip?: string; highlight?: boolean }) {
  const content = (
    <div className={`p-3 rounded-xl border ${highlight ? "bg-green-500/5 border-green-500/20" : "bg-muted/30 border-muted"}`}>
      <p className={`text-xl font-bold ${highlight ? "text-green-400" : ""}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        {label}
        {tooltip && <Info className="w-3 h-3" />}
      </p>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent><p>{tooltip}</p></TooltipContent>
      </Tooltip>
    );
  }
  return content;
}
