import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarIcon,
  Save,
  Loader2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Trash2,
  BarChart3,
  Brain,
  TrendingUp,
  X,
  Zap,
  Target,
  MessageSquare,
  Users,
  DollarSign,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { fetchAdmin, getAdminToken } from "@/lib/adminAuth";
import { cn } from "@/lib/utils";

interface DailyReport {
  id?: string;
  report_date: string;
  sdr_name: string;
  // Bloco 1 — Números do dia
  leads_trabalhados: number;
  respostas_recebidas: number;
  reunioes_agendadas: number;
  oportunidades_quentes: number;
  valor_pipeline: number;
  // Bloco 2 — Leitura do dia
  objecao_principal: string | null;
  melhor_abordagem: string | null;
  padrao_leads: string | null;
  gargalo_funil: string | null;
  causa_gargalo: string | null;
  // Bloco 3 — Estado e evolução
  energia: string;
  execucao: string;
  atrapalhou_performance: string | null;
  aprendizado: string | null;
  ajuste_amanha: string | null;
  precisa_ajuda: string | null;
  // Legacy (kept for backward compat)
  ligacoes_realizadas?: number;
  mqls_chamados?: number;
  mqls_responderam?: number;
  vendas_sprint?: number;
  valor_fechado?: number;
  mood?: string;
  notas?: string | null;
}

const SDR_OPTIONS = ["Caio", "Miguel"];

const ENERGIA_OPTIONS = [
  { value: "Muito baixa", color: "border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20", activeColor: "border-red-500 bg-red-500/30 text-red-300 ring-2 ring-red-500/40" },
  { value: "Baixa", color: "border-orange-500/50 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20", activeColor: "border-orange-500 bg-orange-500/30 text-orange-300 ring-2 ring-orange-500/40" },
  { value: "Normal", color: "border-yellow-500/50 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20", activeColor: "border-yellow-500 bg-yellow-500/30 text-yellow-300 ring-2 ring-yellow-500/40" },
  { value: "Boa", color: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20", activeColor: "border-emerald-500 bg-emerald-500/30 text-emerald-300 ring-2 ring-emerald-500/40" },
  { value: "Muito boa", color: "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20", activeColor: "border-cyan-500 bg-cyan-500/30 text-cyan-300 ring-2 ring-cyan-500/40" },
];

const EXECUCAO_OPTIONS = [
  { value: "Fraca", color: "border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20", activeColor: "border-red-500 bg-red-500/30 text-red-300 ring-2 ring-red-500/40" },
  { value: "Abaixo do esperado", color: "border-orange-500/50 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20", activeColor: "border-orange-500 bg-orange-500/30 text-orange-300 ring-2 ring-orange-500/40" },
  { value: "Boa", color: "border-yellow-500/50 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20", activeColor: "border-yellow-500 bg-yellow-500/30 text-yellow-300 ring-2 ring-yellow-500/40" },
  { value: "Muito boa", color: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20", activeColor: "border-emerald-500 bg-emerald-500/30 text-emerald-300 ring-2 ring-emerald-500/40" },
  { value: "Excelente", color: "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20", activeColor: "border-cyan-500 bg-cyan-500/30 text-cyan-300 ring-2 ring-cyan-500/40" },
];

const GARGALO_OPTIONS = [
  "Primeiro contato",
  "Resposta inicial",
  "Qualificação",
  "Agendamento",
  "Confirmação da reunião",
  "Fechamento",
];

const emptyReport = (date: string, sdr: string): DailyReport => ({
  report_date: date,
  sdr_name: sdr,
  leads_trabalhados: 0,
  respostas_recebidas: 0,
  reunioes_agendadas: 0,
  oportunidades_quentes: 0,
  valor_pipeline: 0,
  objecao_principal: null,
  melhor_abordagem: null,
  padrao_leads: null,
  gargalo_funil: null,
  causa_gargalo: null,
  energia: "Normal",
  execucao: "Boa",
  atrapalhou_performance: null,
  aprendizado: null,
  ajuste_amanha: null,
  precisa_ajuda: null,
});

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ─── Number Input ─── */
function NumField({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  isCurrency,
}: {
  label: string;
  icon: React.ElementType;
  value: number;
  onChange: (v: number) => void;
  placeholder: string;
  isCurrency?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground/80">
        <Icon className="h-3.5 w-3.5 text-primary/70" />
        {label}
      </label>
      <div className="relative">
        {isCurrency && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
        )}
        <input
          type="text"
          inputMode="numeric"
          value={value || ""}
          onChange={(e) => {
            const clean = e.target.value.replace(/\D/g, "");
            onChange(clean ? parseInt(clean, 10) : 0);
          }}
          placeholder={placeholder}
          className={cn(
            "flex h-11 w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm font-medium",
            "ring-offset-background placeholder:text-muted-foreground/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/50",
            "transition-all duration-200 hover:border-border",
            isCurrency && "pl-9"
          )}
        />
      </div>
    </div>
  );
}

/* ─── Textarea Field ─── */
function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground/80">{label}</label>
      <Textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="bg-muted/30 border-border/60 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-all duration-200 hover:border-border resize-none text-sm"
      />
    </div>
  );
}

/* ─── Card Selection Buttons ─── */
function CardSelect({
  options,
  value,
  onChange,
}: {
  options: typeof ENERGIA_OPTIONS;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-2 rounded-lg border text-xs font-semibold transition-all duration-200 cursor-pointer",
            "sm:px-4 sm:py-2.5 sm:text-sm",
            value === opt.value ? opt.activeColor : opt.color
          )}
        >
          {opt.value}
        </button>
      ))}
    </div>
  );
}

/* ─── Section Header ─── */
function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1 mb-5">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-lg font-bold text-foreground tracking-tight">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground ml-[42px]">{description}</p>
    </div>
  );
}

/* ─── Draggable Report Popup (History) ─── */
function DraggableReportPopup({
  report,
  onClose,
}: {
  report: DailyReport;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ x: window.innerWidth / 2 - 200, y: 100 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div
      className="fixed z-50 w-[420px] max-w-[95vw] bg-card border border-primary/20 rounded-xl shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 bg-primary/5 rounded-t-xl cursor-move select-none border-b border-border/30"
        onMouseDown={onMouseDown}
      >
        <span className="font-bold text-sm">
          {report.sdr_name} — {format(new Date(report.report_date + "T12:00:00"), "dd/MM/yyyy")}
        </span>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex justify-between bg-muted/40 rounded-lg px-3 py-1.5">
            <span className="text-muted-foreground">Leads trab.</span>
            <span className="font-bold">{report.leads_trabalhados || 0}</span>
          </div>
          <div className="flex justify-between bg-muted/40 rounded-lg px-3 py-1.5">
            <span className="text-muted-foreground">Respostas</span>
            <span className="font-bold">{report.respostas_recebidas || 0}</span>
          </div>
          <div className="flex justify-between bg-muted/40 rounded-lg px-3 py-1.5">
            <span className="text-muted-foreground">Reuniões</span>
            <span className="font-bold">{report.reunioes_agendadas || 0}</span>
          </div>
          <div className="flex justify-between bg-muted/40 rounded-lg px-3 py-1.5">
            <span className="text-muted-foreground">Oport. quentes</span>
            <span className="font-bold">{report.oportunidades_quentes || 0}</span>
          </div>
          <div className="flex justify-between bg-muted/40 rounded-lg px-3 py-1.5 col-span-2">
            <span className="text-muted-foreground">Sprint X1</span>
            <span className="font-bold text-primary">{formatCurrency(Number(report.valor_pipeline) || 0)}</span>
          </div>
        </div>
        {report.objecao_principal && (
          <div><span className="font-semibold text-xs text-muted-foreground">Objeção:</span> <span className="text-xs">{report.objecao_principal}</span></div>
        )}
        {report.gargalo_funil && (
          <div><span className="font-semibold text-xs text-muted-foreground">Gargalo:</span> <span className="text-xs">{report.gargalo_funil}</span></div>
        )}
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs">Energia: {report.energia || "—"}</Badge>
          <Badge variant="outline" className="text-xs">Execução: {report.execucao || "—"}</Badge>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*                 MAIN COMPONENT                     */
/* ═══════════════════════════════════════════════════ */
export default function DailyReportsTab() {
  const [selectedSdr, setSelectedSdr] = useState(SDR_OPTIONS[0]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [report, setReport] = useState<DailyReport>(
    emptyReport(format(new Date(), "yyyy-MM-dd"), SDR_OPTIONS[0])
  );
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [monthReports, setMonthReports] = useState<DailyReport[]>([]);
  const [popupReport, setPopupReport] = useState<DailyReport | null>(null);

  const [viewMode, setViewMode] = useState<"form" | "history">("form");
  const [historyMonth, setHistoryMonth] = useState(new Date());
  const [historyReports, setHistoryReports] = useState<DailyReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;

  const fetchReport = useCallback(async (date: string, sdr: string) => {
    setLoading(true);
    try {
      const res = await fetchAdmin(
        `${supabaseUrl}/functions/v1/admin-data/daily-reports?sdr=${sdr}&month=${date.slice(0, 7)}`,
        { headers: { "x-admin-token": getAdminToken() || "" } }
      );
      if (!res.ok) throw new Error("Fetch failed");
      const data: DailyReport[] = await res.json();
      const existing = data.find((r) => r.report_date === date);
      setReport(existing || emptyReport(date, sdr));
    } catch {
      setReport(emptyReport(date, sdr));
    } finally {
      setLoading(false);
    }
  }, [supabaseUrl]);

  const fetchMonthReports = useCallback(async (month: Date, sdr: string) => {
    try {
      const monthStr = format(month, "yyyy-MM");
      const res = await fetchAdmin(
        `${supabaseUrl}/functions/v1/admin-data/daily-reports?sdr=${sdr}&month=${monthStr}`,
        { headers: { "x-admin-token": getAdminToken() || "" } }
      );
      if (res.ok) setMonthReports(await res.json());
    } catch { /* silent */ }
  }, [supabaseUrl]);

  useEffect(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    fetchReport(dateStr, selectedSdr);
  }, [selectedDate, selectedSdr, fetchReport]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = report.id ? "PUT" : "POST";
      const url = report.id
        ? `${supabaseUrl}/functions/v1/admin-data/daily-reports/${report.id}`
        : `${supabaseUrl}/functions/v1/admin-data/daily-reports`;
      const res = await fetchAdmin(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": getAdminToken() || "",
        },
        body: JSON.stringify({
          ...report,
          report_date: format(selectedDate, "yyyy-MM-dd"),
          sdr_name: selectedSdr,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      await res.json();
      setReport(emptyReport(format(selectedDate, "yyyy-MM-dd"), selectedSdr));
      toast.success("Relatório salvo com sucesso!");
    } catch {
      toast.error("Erro ao salvar relatório");
    } finally {
      setSaving(false);
    }
  };

  // History
  const fetchHistoryReports = useCallback(async (month: Date) => {
    setHistoryLoading(true);
    try {
      const monthStr = format(month, "yyyy-MM");
      const res = await fetchAdmin(
        `${supabaseUrl}/functions/v1/admin-data/daily-reports?month=${monthStr}`,
        { headers: { "x-admin-token": getAdminToken() || "" } }
      );
      if (res.ok) setHistoryReports(await res.json());
    } catch { /* silent */ }
    finally { setHistoryLoading(false); }
  }, [supabaseUrl]);

  const openHistory = () => {
    setViewMode("history");
    setHistoryMonth(new Date());
    fetchHistoryReports(new Date());
  };

  const changeHistoryMonth = (delta: number) => {
    const newMonth = new Date(historyMonth);
    newMonth.setMonth(newMonth.getMonth() + delta);
    setHistoryMonth(newMonth);
    fetchHistoryReports(newMonth);
  };

  const groupedByDate = historyReports.reduce<Record<string, DailyReport[]>>((acc, r) => {
    if (!acc[r.report_date]) acc[r.report_date] = [];
    acc[r.report_date].push(r);
    return acc;
  }, {});
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  const handleCalendarOpen = () => {
    setCalendarOpen(true);
    fetchMonthReports(calendarMonth, selectedSdr);
  };

  const handleCalendarDayClick = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const found = monthReports.find((r) => r.report_date === dateStr);
    if (found) {
      setPopupReport(found);
    } else {
      setSelectedDate(day);
      setCalendarOpen(false);
    }
  };

  const reportDates = new Set(monthReports.map((r) => r.report_date));

  const updateField = (field: keyof DailyReport, value: any) => {
    setReport((prev) => ({ ...prev, [field]: value }));
  };

  const handleDeleteReport = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este relatório?")) return;
    try {
      const res = await fetchAdmin(
        `${supabaseUrl}/functions/v1/admin-data/daily-reports/${id}`,
        { method: "DELETE", headers: { "x-admin-token": getAdminToken() || "" } }
      );
      if (!res.ok) throw new Error("Delete failed");
      setHistoryReports((prev) => prev.filter((r) => r.id !== id));
      toast.success("Relatório excluído!");
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);

  // Build calendar grid for history month
  const buildCalendarDays = (month: Date) => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(year, m, 1);
    const lastDay = new Date(year, m + 1, 0);
    const startDow = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();

    const days: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  };

  const calendarDays = buildCalendarDays(historyMonth);
  const reportDatesHistory = new Set(historyReports.map((r) => r.report_date));
  const selectedDayReports = selectedHistoryDate ? (groupedByDate[selectedHistoryDate] || []) : [];

  /* ─── History View ─── */
  if (viewMode === "history") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" className="gap-2" onClick={() => { setViewMode("form"); setSelectedHistoryDate(null); }}>
            <ArrowLeft className="h-4 w-4" />
            Voltar ao formulário
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => changeHistoryMonth(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[140px] text-center capitalize">
              {format(historyMonth, "MMMM yyyy", { locale: ptBR })}
            </span>
            <Button variant="outline" size="icon" onClick={() => changeHistoryMonth(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {historyLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Calendar Grid */}
            <Card className="border border-border/30 bg-card/60">
              <CardContent className="p-4">
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                    <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">
                      {d}
                    </div>
                  ))}
                </div>
                {/* Day cells */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, idx) => {
                    if (day === null) return <div key={`empty-${idx}`} className="h-12" />;
                    const dateStr = format(new Date(historyMonth.getFullYear(), historyMonth.getMonth(), day), "yyyy-MM-dd");
                    const hasReport = reportDatesHistory.has(dateStr);
                    const isSelected = selectedHistoryDate === dateStr;
                    const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
                    const reportsForDay = groupedByDate[dateStr] || [];
                    const sdrCount = reportsForDay.length;

                    return (
                      <button
                        key={dateStr}
                        onClick={() => {
                          if (hasReport) {
                            setSelectedHistoryDate(isSelected ? null : dateStr);
                            setExpandedReportId(null);
                          }
                        }}
                        className={cn(
                          "h-12 rounded-lg text-sm font-medium relative transition-all duration-200 flex flex-col items-center justify-center gap-0.5",
                          hasReport
                            ? "cursor-pointer hover:bg-primary/20 hover:border-primary/40"
                            : "cursor-default text-muted-foreground/50",
                          isSelected && "bg-primary/20 border-primary/50 ring-2 ring-primary/30",
                          isToday && !isSelected && "border border-primary/40",
                          !isSelected && !isToday && "border border-transparent",
                        )}
                      >
                        <span className={cn(isToday && "text-primary font-bold")}>{day}</span>
                        {hasReport && (
                          <div className="flex gap-0.5">
                            {sdrCount >= 1 && <div className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                            {sdrCount >= 2 && <div className="w-1.5 h-1.5 rounded-full bg-pink-400" />}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/20">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    Caio
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <div className="w-2 h-2 rounded-full bg-pink-400" />
                    Miguel
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Selected day reports */}
            {selectedHistoryDate && (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-3 duration-300">
                <h3 className="text-base font-bold text-foreground/90 capitalize">
                  {format(new Date(selectedHistoryDate + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </h3>
                {selectedDayReports.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum relatório neste dia.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedDayReports.map((r, i) => {
                      const rid = r.id || `${selectedHistoryDate}-${i}`;
                      const isExpanded = expandedReportId === rid;
                      return (
                        <Card
                          key={rid}
                          className={cn(
                            "border border-border/30 bg-card/50 cursor-pointer transition-all duration-200 hover:border-primary/30 hover:shadow-md",
                            isExpanded && "border-primary/40 shadow-lg md:col-span-2"
                          )}
                          onClick={() => setExpandedReportId(isExpanded ? null : rid)}
                        >
                          <CardContent className="p-4 space-y-3">
                            {/* Preview */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm">{r.sdr_name}</span>
                                <Badge variant="outline" className="text-[10px]">{r.energia || "—"}</Badge>
                                <Badge variant="outline" className="text-[10px]">{r.execucao || "—"}</Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {r.reunioes_agendadas || 0} reuniões · {formatCurrency(Number(r.valor_pipeline) || 0)}
                                </span>
                                {r.id && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteReport(r.id!); }}
                                    className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Expanded details */}
                            {isExpanded && (
                              <div className="space-y-4 pt-2 border-t border-border/30 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                                  <div className="flex justify-between bg-muted/30 rounded-md px-2.5 py-1.5">
                                    <span className="text-muted-foreground">Leads trab.</span>
                                    <span className="font-semibold">{r.leads_trabalhados || 0}</span>
                                  </div>
                                  <div className="flex justify-between bg-muted/30 rounded-md px-2.5 py-1.5">
                                    <span className="text-muted-foreground">Respostas</span>
                                    <span className="font-semibold">{r.respostas_recebidas || 0}</span>
                                  </div>
                                  <div className="flex justify-between bg-muted/30 rounded-md px-2.5 py-1.5">
                                    <span className="text-muted-foreground">Reuniões</span>
                                    <span className="font-semibold">{r.reunioes_agendadas || 0}</span>
                                  </div>
                                  <div className="flex justify-between bg-muted/30 rounded-md px-2.5 py-1.5">
                                    <span className="text-muted-foreground">Oport. quentes</span>
                                    <span className="font-semibold">{r.oportunidades_quentes || 0}</span>
                                  </div>
                                  <div className="flex justify-between bg-muted/30 rounded-md px-2.5 py-1.5">
                                    <span className="text-muted-foreground">Sprint X1</span>
                                    <span className="font-semibold text-primary">{formatCurrency(Number(r.valor_pipeline) || 0)}</span>
                                  </div>
                                </div>
                                <div className="space-y-2 text-xs">
                                  {r.objecao_principal && (
                                    <div><span className="font-semibold text-muted-foreground">Objeção principal:</span> <span>{r.objecao_principal}</span></div>
                                  )}
                                  {r.melhor_abordagem && (
                                    <div><span className="font-semibold text-muted-foreground">Melhor abordagem:</span> <span>{r.melhor_abordagem}</span></div>
                                  )}
                                  {r.padrao_leads && (
                                    <div><span className="font-semibold text-muted-foreground">Padrão dos leads:</span> <span>{r.padrao_leads}</span></div>
                                  )}
                                  {r.gargalo_funil && (
                                    <div><span className="font-semibold text-muted-foreground">Gargalo:</span> <span>{r.gargalo_funil}</span></div>
                                  )}
                                  {r.causa_gargalo && (
                                    <div><span className="font-semibold text-muted-foreground">Causa do gargalo:</span> <span>{r.causa_gargalo}</span></div>
                                  )}
                                </div>
                                <div className="space-y-2 text-xs">
                                  {r.atrapalhou_performance && (
                                    <div><span className="font-semibold text-muted-foreground">Atrapalhou performance:</span> <span>{r.atrapalhou_performance}</span></div>
                                  )}
                                  {r.aprendizado && (
                                    <div><span className="font-semibold text-muted-foreground">Aprendizado:</span> <span>{r.aprendizado}</span></div>
                                  )}
                                  {r.ajuste_amanha && (
                                    <div><span className="font-semibold text-muted-foreground">Ajuste amanhã:</span> <span>{r.ajuste_amanha}</span></div>
                                  )}
                                  {r.precisa_ajuda && (
                                    <div><span className="font-semibold text-muted-foreground">Precisa de ajuda:</span> <span>{r.precisa_ajuda}</span></div>
                                  )}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ─── Form View ─── */
  return (
    <div className="space-y-6 pb-8">
      {popupReport && (
        <DraggableReportPopup
          report={popupReport}
          onClose={() => setPopupReport(null)}
        />
      )}

      {/* Header / Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* SDR Selector */}
          <div className="flex gap-1.5">
            {SDR_OPTIONS.map((sdr) => (
              <button
                key={sdr}
                onClick={() => setSelectedSdr(sdr)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200",
                  selectedSdr === sdr
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-muted/30 border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                {sdr}
              </button>
            ))}
          </div>

          {/* Date Picker */}
          <Popover open={calendarOpen} onOpenChange={(o) => { if (o) handleCalendarOpen(); else setCalendarOpen(false); }}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-xs h-8">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(selectedDate, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && handleCalendarDayClick(d)}
                month={calendarMonth}
                onMonthChange={(m) => { setCalendarMonth(m); fetchMonthReports(m, selectedSdr); }}
                locale={ptBR}
                modifiers={{ hasReport: (d) => reportDates.has(format(d, "yyyy-MM-dd")) }}
                modifiersClassNames={{ hasReport: "bg-primary/20 font-bold text-primary" }}
              />
            </PopoverContent>
          </Popover>
        </div>

        <Button variant="outline" size="sm" className="gap-2 text-xs h-8" onClick={openHistory}>
          <BarChart3 className="h-3.5 w-3.5" />
          Ver Relatórios
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ═══ BLOCO 1 — Números do dia ═══ */}
          <Card className="border border-border/30 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-5 sm:p-6">
              <SectionHeader
                icon={BarChart3}
                title="Números do dia"
                description="Preencha apenas os números essenciais do seu dia."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <NumField
                  label="Leads trabalhados hoje"
                  icon={Users}
                  value={report.leads_trabalhados}
                  onChange={(v) => updateField("leads_trabalhados", v)}
                  placeholder="Ex: 8"
                />
                <NumField
                  label="Respostas recebidas"
                  icon={MessageSquare}
                  value={report.respostas_recebidas}
                  onChange={(v) => updateField("respostas_recebidas", v)}
                  placeholder="Ex: 3"
                />
                <NumField
                  label="Reuniões agendadas"
                  icon={CalendarIcon}
                  value={report.reunioes_agendadas}
                  onChange={(v) => updateField("reunioes_agendadas", v)}
                  placeholder="Ex: 1"
                />
                <NumField
                  label="Oportunidades quentes"
                  icon={Zap}
                  value={report.oportunidades_quentes}
                  onChange={(v) => updateField("oportunidades_quentes", v)}
                  placeholder="Ex: 2"
                />
                <NumField
                   label="Sprint vendido no X1 (se houver)"
                   icon={DollarSign}
                   value={report.valor_pipeline}
                   onChange={(v) => updateField("valor_pipeline", v)}
                   placeholder="Ex: 2000"
                   isCurrency
                />
              </div>
            </CardContent>
          </Card>

          {/* ═══ BLOCO 2 — Leitura do dia ═══ */}
          <Card className="border border-border/30 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-5 sm:p-6">
              <SectionHeader
                icon={Brain}
                title="Leitura do dia"
                description="Registre sua leitura estratégica do dia para melhorar a operação."
              />
              <div className="space-y-4">
                <TextAreaField
                  label="Qual objeção apareceu mais hoje?"
                  value={report.objecao_principal}
                  onChange={(v) => updateField("objecao_principal", v)}
                  placeholder="Ex: preço, falta de urgência, falta de confiança, timing..."
                />
                <TextAreaField
                  label="Qual abordagem, frase ou estratégia funcionou melhor hoje?"
                  value={report.melhor_abordagem}
                  onChange={(v) => updateField("melhor_abordagem", v)}
                  placeholder="Ex: abordagem mais direta, puxar dor logo no início, áudio em vez de texto..."
                />
                <TextAreaField
                  label="Qual padrão você percebeu nos leads hoje?"
                  value={report.padrao_leads}
                  onChange={(v) => updateField("padrao_leads", v)}
                  placeholder="Ex: leads mais frios, mais curiosos, desqualificados, sem estrutura, etc."
                />
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground/80">Onde o funil mais travou hoje?</label>
                  <Select
                    value={report.gargalo_funil || ""}
                    onValueChange={(v) => updateField("gargalo_funil", v)}
                  >
                    <SelectTrigger className="bg-muted/30 border-border/60 focus:ring-primary/40 transition-all duration-200 hover:border-border h-11">
                      <SelectValue placeholder="Selecione o ponto de travamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {GARGALO_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <TextAreaField
                  label="O que você acredita que causou esse gargalo?"
                  value={report.causa_gargalo}
                  onChange={(v) => updateField("causa_gargalo", v)}
                  placeholder="Ex: lead frio demais, abordagem fraca, oferta mal compreendida, demora no retorno..."
                />
              </div>
            </CardContent>
          </Card>

          {/* ═══ BLOCO 3 — Estado e evolução do SDR ═══ */}
          <Card className="border border-border/30 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-5 sm:p-6">
              <SectionHeader
                icon={TrendingUp}
                title="Estado e evolução do SDR"
                description="Mostre como foi sua execução e como você quer evoluir no próximo dia."
              />
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/80">Como estava sua energia hoje?</label>
                  <CardSelect
                    options={ENERGIA_OPTIONS}
                    value={report.energia}
                    onChange={(v) => updateField("energia", v)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/80">Como você avalia sua execução hoje?</label>
                  <CardSelect
                    options={EXECUCAO_OPTIONS}
                    value={report.execucao}
                    onChange={(v) => updateField("execucao", v)}
                  />
                </div>
                <TextAreaField
                  label="O que mais atrapalhou sua performance hoje?"
                  value={report.atrapalhou_performance}
                  onChange={(v) => updateField("atrapalhou_performance", v)}
                  placeholder="Ex: distração, pouco volume, dificuldade em contornar objeção, falta de foco..."
                />
                <TextAreaField
                  label="Qual foi seu principal aprendizado hoje?"
                  value={report.aprendizado}
                  onChange={(v) => updateField("aprendizado", v)}
                  placeholder="Ex: percebi que leads respondem melhor quando..."
                />
                <TextAreaField
                  label="O que você vai ajustar amanhã?"
                  value={report.ajuste_amanha}
                  onChange={(v) => updateField("ajuste_amanha", v)}
                  placeholder="Ex: ser mais direto, responder mais rápido, melhorar abertura, testar nova abordagem..."
                />
                <TextAreaField
                  label="Você precisa de ajuda em algo?"
                  value={report.precisa_ajuda}
                  onChange={(v) => updateField("precisa_ajuda", v)}
                  placeholder="Ex: preciso melhorar contorno de objeção de preço, abertura, qualificação..."
                />
              </div>
            </CardContent>
          </Card>

          {/* ═══ SAVE BUTTON ═══ */}
          <Button
            onClick={handleSave}
            disabled={saving}
            size="lg"
            className="w-full h-14 text-base font-bold gap-2.5 bg-primary hover:bg-primary/90 shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.4)] hover:shadow-[0_8px_30px_-4px_hsl(var(--primary)/0.6)] transition-all duration-300"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            {saving ? "Salvando..." : "Salvar Relatório"}
          </Button>
        </>
      )}
    </div>
  );
}
