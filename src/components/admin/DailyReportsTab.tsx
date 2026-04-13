import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarIcon,
  Save,
  X,
  Frown,
  Meh,
  Smile,
  SmilePlus,
  Angry,
  Loader2,
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ADMIN_TOKEN_KEY = "admin_analytics_token";

interface DailyReport {
  id?: string;
  report_date: string;
  sdr_name: string;
  ligacoes_realizadas: number;
  reunioes_agendadas: number;
  mqls_chamados: number;
  mqls_responderam: number;
  vendas_sprint: number;
  valor_pipeline: number;
  valor_fechado: number;
  mood: string;
  notas: string | null;
}

const MOODS = [
  { value: "Ruim", icon: Angry, label: "Ruim" },
  { value: "Abaixo", icon: Frown, label: "Abaixo" },
  { value: "Normal", icon: Meh, label: "Normal" },
  { value: "Bom", icon: Smile, label: "Bom" },
  { value: "Ótimo", icon: SmilePlus, label: "Ótimo" },
];

const SDR_OPTIONS = ["Rodger", "Caio", "Dara"];

const emptyReport = (date: string, sdr: string): DailyReport => ({
  report_date: date,
  sdr_name: sdr,
  ligacoes_realizadas: 0,
  reunioes_agendadas: 0,
  mqls_chamados: 0,
  mqls_responderam: 0,
  vendas_sprint: 0,
  valor_pipeline: 0,
  valor_fechado: 0,
  mood: "Normal",
  notas: null,
});

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Draggable popup component
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

  const moodInfo = MOODS.find((m) => m.value === report.mood) || MOODS[2];
  const MoodIcon = moodInfo.icon;

  return (
    <div
      className="fixed z-50 w-[420px] bg-card border-2 border-primary/30 rounded-xl shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 bg-primary/10 rounded-t-xl cursor-move select-none"
        onMouseDown={onMouseDown}
      >
        <span className="font-bold text-sm">
          📋 {report.sdr_name} — {format(new Date(report.report_date + "T12:00:00"), "dd/MM/yyyy")}
        </span>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
        <div>
          <h4 className="font-semibold text-sm mb-2">Atividades</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between bg-muted/50 rounded px-2 py-1">
              <span className="text-muted-foreground">Ligações</span>
              <span className="font-bold">{report.ligacoes_realizadas}</span>
            </div>
            <div className="flex justify-between bg-muted/50 rounded px-2 py-1">
              <span className="text-muted-foreground">Reuniões agend.</span>
              <span className="font-bold">{report.reunioes_agendadas}</span>
            </div>
            <div className="flex justify-between bg-muted/50 rounded px-2 py-1">
              <span className="text-muted-foreground">MQLs chamados</span>
              <span className="font-bold">{report.mqls_chamados}</span>
            </div>
            <div className="flex justify-between bg-muted/50 rounded px-2 py-1">
              <span className="text-muted-foreground">MQLs responderam</span>
              <span className="font-bold">{report.mqls_responderam}</span>
            </div>
            <div className="flex justify-between bg-muted/50 rounded px-2 py-1 col-span-2">
              <span className="text-muted-foreground">Vendas Sprint</span>
              <span className="font-bold">{report.vendas_sprint}</span>
            </div>
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-sm mb-2">Valores</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between bg-muted/50 rounded px-2 py-1">
              <span className="text-muted-foreground">Pipeline</span>
              <span className="font-bold">{formatCurrency(Number(report.valor_pipeline))}</span>
            </div>
            <div className="flex justify-between bg-muted/50 rounded px-2 py-1">
              <span className="text-muted-foreground">Fechado</span>
              <span className="font-bold text-green-400">{formatCurrency(Number(report.valor_fechado))}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Humor:</span>
          <MoodIcon className="h-5 w-5 text-primary" />
          <span className="text-sm">{moodInfo.label}</span>
        </div>
        {report.notas && (
          <div>
            <h4 className="font-semibold text-sm mb-1">Notas</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded p-2">
              {report.notas}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DailyReportsTab() {
  const [selectedSdr, setSelectedSdr] = useState(SDR_OPTIONS[0]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [report, setReport] = useState<DailyReport>(
    emptyReport(format(new Date(), "yyyy-MM-dd"), SDR_OPTIONS[0])
  );
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Calendar state
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [monthReports, setMonthReports] = useState<DailyReport[]>([]);
  const [popupReport, setPopupReport] = useState<DailyReport | null>(null);

  const getToken = () => localStorage.getItem(ADMIN_TOKEN_KEY) || "";
  const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;

  const fetchReport = useCallback(async (date: string, sdr: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${supabaseUrl}/functions/v1/admin-data/daily-reports?sdr=${sdr}&month=${date.slice(0, 7)}`,
        { headers: { "x-admin-token": getToken() } }
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
      const res = await fetch(
        `${supabaseUrl}/functions/v1/admin-data/daily-reports?sdr=${sdr}&month=${monthStr}`,
        { headers: { "x-admin-token": getToken() } }
      );
      if (res.ok) {
        setMonthReports(await res.json());
      }
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
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": getToken(),
        },
        body: JSON.stringify({
          ...report,
          report_date: format(selectedDate, "yyyy-MM-dd"),
          sdr_name: selectedSdr,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const saved = await res.json();
      setReport(saved);
      toast({ title: "✅ Relatório salvo!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">
            Olá, {selectedSdr} 👋
          </h2>
          <p className="text-muted-foreground">
            Relatório Diário — registre suas atividades
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedSdr} onValueChange={setSelectedSdr}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SDR_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2" onClick={handleCalendarOpen}>
                <CalendarIcon className="h-4 w-4" />
                {format(selectedDate, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && handleCalendarDayClick(d)}
                locale={ptBR}
                month={calendarMonth}
                onMonthChange={(m) => {
                  setCalendarMonth(m);
                  fetchMonthReports(m, selectedSdr);
                }}
                modifiers={{ hasReport: (day) => reportDates.has(format(day, "yyyy-MM-dd")) }}
                modifiersClassNames={{ hasReport: "bg-primary/20 font-bold text-primary" }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Atividades */}
          <Card className="border-2 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Atividades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {([
                  ["ligacoes_realizadas", "Ligações realizadas"],
                  ["reunioes_agendadas", "Reuniões agendadas"],
                  ["mqls_chamados", "MQL's chamados"],
                  ["mqls_responderam", "MQL's responderam"],
                  ["vendas_sprint", "Vendas Sprint"],
                ] as [keyof DailyReport, string][]).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      {label}
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={report[key] as number}
                      onChange={(e) => updateField(key, parseInt(e.target.value) || 0)}
                      className="bg-background"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Valores */}
          <Card className="border-2 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Valores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Valor pipeline (R$)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={report.valor_pipeline}
                    onChange={(e) => updateField("valor_pipeline", parseFloat(e.target.value) || 0)}
                    className="bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Valor fechado (R$)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={report.valor_fechado}
                    onChange={(e) => updateField("valor_fechado", parseFloat(e.target.value) || 0)}
                    className="bg-background"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mood */}
          <Card className="border-2 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Como foi seu dia?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {MOODS.map((m) => {
                  const Icon = m.icon;
                  const isActive = report.mood === m.value;
                  return (
                    <button
                      key={m.value}
                      onClick={() => updateField("mood", m.value)}
                      className={cn(
                        "flex flex-col items-center gap-1 px-4 py-3 rounded-xl transition-all",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-lg scale-110"
                          : "bg-muted/50 hover:bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-xs font-medium">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Notas */}
          <Card className="border-2 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Notas do dia</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Como foi o dia? Destaques, dificuldades, aprendizados..."
                value={report.notas || ""}
                onChange={(e) => updateField("notas", e.target.value)}
                className="min-h-[120px] bg-background"
              />
            </CardContent>
          </Card>

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saving}
            size="lg"
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Relatório
          </Button>
        </>
      )}

      {/* Draggable popup for viewing past reports */}
      {popupReport && (
        <DraggableReportPopup
          report={popupReport}
          onClose={() => setPopupReport(null)}
        />
      )}
    </div>
  );
}
