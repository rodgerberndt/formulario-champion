import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  Target,
  TrendingUp,
  Users,
  CheckCircle,
  Percent,
  Search,
  Download,
  Loader2,
  Eye,
  BarChart3,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import DateRangePicker from "./DateRangePicker";
import { Input } from "@/components/ui/input";

interface CampaignMetrics {
  total_sessions: number;
  started_quiz: number;
  completed: number;
  completion_rate: number;
  campaigns: CampaignData[];
  ads: AdData[];
  sources: SourceData[];
  stepDropoffs: StepDropoff[];
}

interface CampaignData {
  campaign_id: string | null;
  utm_campaign: string | null;
  campaign_name: string | null;
  total: number;
  started: number;
  completed: number;
  completion_rate: number;
}

interface AdData {
  ad_id: string | null;
  utm_content: string | null;
  ad_name: string | null;
  campaign_name: string | null;
  total: number;
  started: number;
  completed: number;
  completion_rate: number;
}

interface SourceData {
  utm_source: string;
  total: number;
  completed: number;
}

interface StepDropoff {
  step_id: string;
  campaign_id: string | null;
  utm_campaign: string | null;
  count: number;
}

interface SessionRow {
  id: string;
  created_at: string;
  campaign_id: string | null;
  utm_campaign: string | null;
  ad_id: string | null;
  utm_content: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  start_button_id: string | null;
  current_step_id: string | null;
  completed: boolean;
  lead_name: string | null;
  campaign_name?: string | null;
  ad_name?: string | null;
}

const STEP_LABELS: Record<string, string> = {
  q1_nome: "Nome",
  q2_whats: "WhatsApp",
  q3_insta: "Instagram",
  q4_mercado: "Mercado",
  q5_estagio: "Estágio",
  q6_dor: "Dor/Desejo",
};

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

interface CampaignAnalyticsProps {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<unknown>;
  onViewSession?: (sessionId: string) => void;
}

export default function CampaignAnalytics({ fetchAdminData, onViewSession }: CampaignAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  
  // Filters
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadCampaignData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      
      // Use date range from state
      if (dateRange.from) {
        params.from = format(dateRange.from, "yyyy-MM-dd");
      }
      if (dateRange.to) {
        params.to = format(dateRange.to, "yyyy-MM-dd");
      }
      
      if (sourceFilter !== "all") params.source = sourceFilter;
      if (campaignFilter !== "all") params.campaign = campaignFilter;

      const data = await fetchAdminData("/campaigns", params);
      setMetrics(data as CampaignMetrics);
    } catch (error) {
      console.error("Error loading campaign data:", error);
    } finally {
      setLoading(false);
    }
  }, [fetchAdminData, dateRange, sourceFilter, campaignFilter]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const params: Record<string, string> = { limit: "100" };
      
      // Use date range from state
      if (dateRange.from) {
        params.from = format(dateRange.from, "yyyy-MM-dd");
      }
      if (dateRange.to) {
        params.to = format(dateRange.to, "yyyy-MM-dd");
      }
      
      if (sourceFilter !== "all") params.source = sourceFilter;
      if (campaignFilter !== "all") params.campaign = campaignFilter;
      if (searchQuery) params.q = searchQuery;

      const data = await fetchAdminData("/campaigns/sessions", params);
      setSessions((data as { data: SessionRow[] }).data || []);
    } catch (error) {
      console.error("Error loading sessions:", error);
    } finally {
      setSessionsLoading(false);
    }
  }, [fetchAdminData, dateRange, sourceFilter, campaignFilter, searchQuery]);

  useEffect(() => {
    loadCampaignData();
    loadSessions();
  }, [loadCampaignData, loadSessions]);

  const exportCSV = () => {
    if (!sessions.length) return;
    
    const headers = [
      "Data",
      "Campanha",
      "Anúncio",
      "UTM Source",
      "UTM Medium",
      "Botão Clicado",
      "Etapa Atual",
      "Status",
      "Nome do Lead",
    ];

    const rows = sessions.map((s) => [
      format(new Date(s.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      s.campaign_name || s.utm_campaign || s.campaign_id || "-",
      s.ad_name || s.utm_content || s.ad_id || "-",
      s.utm_source || "-",
      s.utm_medium || "-",
      s.start_button_id || "-",
      s.current_step_id ? STEP_LABELS[s.current_step_id] || s.current_step_id : "-",
      s.completed ? "Completou" : "Drop-off",
      s.lead_name || "-",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `campanhas_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Get unique sources for filter dropdown
  const uniqueSources = metrics?.sources?.map(s => s.utm_source).filter((s): s is string => Boolean(s)) ?? [];
  const campaignValues = metrics?.campaigns?.map(c => c.utm_campaign || c.campaign_id).filter((c): c is string => Boolean(c)) ?? [];
  const uniqueCampaigns = [...new Set(campaignValues)];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters Row */}
      <div className="flex flex-wrap gap-4 items-center">
        <DateRangePicker
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Origem</label>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {uniqueSources.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Campanha</label>
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Campanha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {uniqueCampaigns.map((c) => (
                <SelectItem key={c} value={c!}>{String(c).slice(0, 30)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" size="icon" onClick={() => { loadCampaignData(); loadSessions(); }}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Sessões</p>
                <p className="text-2xl font-bold">{metrics?.total_sessions || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <TrendingUp className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Iniciaram Quiz</p>
                <p className="text-2xl font-bold">{metrics?.started_quiz || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Completaram</p>
                <p className="text-2xl font-bold">{metrics?.completed || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Percent className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Taxa Conclusão</p>
                <p className="text-2xl font-bold">{metrics?.completion_rate?.toFixed(1) || 0}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Leads by Campaign Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5" />
              Leads por Campanha (Top 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics?.campaigns && metrics.campaigns.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={metrics.campaigns.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" stroke="#9ca3af" />
                  <YAxis
                    type="category"
                    dataKey="utm_campaign"
                    stroke="#9ca3af"
                    width={120}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (v || "Direto").slice(0, 20)}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "none" }}
                    labelFormatter={(v) => v || "Tráfego Direto"}
                  />
                  <Bar dataKey="completed" name="Completaram" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="started" name="Iniciaram" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Sem dados de campanha
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leads by Source Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Leads por Origem
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics?.sources && metrics.sources.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={metrics.sources}
                    dataKey="total"
                    nameKey="utm_source"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.utm_source || "Direto"}: ${entry.total}`}
                    labelLine={true}
                  >
                    {metrics.sources.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "none" }}
                    formatter={(value: number, name: string) => [value, name || "Direto"]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Sem dados de origem
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ads Performance Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Performance por Anúncio (Top 10)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics?.ads && metrics.ads.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anúncio</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead className="text-right">Sessões</TableHead>
                    <TableHead className="text-right">Iniciaram</TableHead>
                    <TableHead className="text-right">Completaram</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.ads.slice(0, 10).map((ad, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {ad.ad_name || ad.utm_content || ad.ad_id || "Não identificado"}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-muted-foreground">
                        {ad.campaign_name || "-"}
                      </TableCell>
                      <TableCell className="text-right">{ad.total}</TableCell>
                      <TableCell className="text-right">{ad.started}</TableCell>
                      <TableCell className="text-right font-semibold text-green-500">{ad.completed}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={ad.completion_rate >= 50 ? "default" : "secondary"}>
                          {ad.completion_rate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Sem dados de anúncio
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drop-off by Step per Campaign */}
      {metrics?.stepDropoffs && metrics.stepDropoffs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Drop-off por Etapa (por Campanha)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead className="text-right">Drop-offs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.stepDropoffs.slice(0, 20).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        {STEP_LABELS[row.step_id] || row.step_id}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.utm_campaign || row.campaign_id || "Direto"}
                      </TableCell>
                      <TableCell className="text-right text-yellow-500 font-semibold">
                        {row.count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Sessions Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg">Sessões Detalhadas</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Nenhuma sessão encontrada
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Anúncio</TableHead>
                    <TableHead>Botão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(session.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {session.campaign_name || session.utm_campaign || session.campaign_id || "-"}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {session.ad_name || session.utm_content || session.ad_id || "-"}
                      </TableCell>
                      <TableCell>
                        {session.start_button_id ? (
                          <Badge variant="outline">{session.start_button_id}</Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        {session.completed ? (
                          <Badge className="bg-green-500/20 text-green-400">Completou</Badge>
                        ) : session.current_step_id ? (
                          <Badge variant="secondary">
                            {STEP_LABELS[session.current_step_id] || session.current_step_id}
                          </Badge>
                        ) : (
                          <Badge variant="outline">-</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {session.utm_source || "-"} / {session.utm_medium || "-"}
                      </TableCell>
                      <TableCell>
                        {onViewSession && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewSession(session.id)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
