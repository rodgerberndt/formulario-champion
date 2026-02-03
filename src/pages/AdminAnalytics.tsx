import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Users,
  MousePointer,
  CheckCircle,
  XCircle,
  TrendingUp,
  Eye,
  LogOut,
  Download,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

const ADMIN_TOKEN_KEY = "admin_analytics_token";

interface Metrics {
  total_visitors: number;
  entered_quiz: number;
  started_quiz: number;
  completed: number;
  completion_rate: string | number;
  button_distribution: {
    start_btn_1: number;
    start_btn_2: number;
    start_btn_3: number;
  };
  step_funnel: Array<{ step_id: string; count: number }>;
  drop_offs: Record<string, number>;
}

interface Session {
  id: string;
  created_at: string;
  last_seen_at: string;
  first_page: string;
  last_page: string;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device_type: string;
  started_quiz: boolean;
  start_button_id: string | null;
  entered_quiz_page: boolean;
  current_step_id: string | null;
  completed: boolean;
  lead_name: string | null;
  lead_whatsapp: string | null;
  lead_instagram: string | null;
  lead_market: string | null;
  lead_stage: string | null;
}

interface SessionEvent {
  id: string;
  created_at: string;
  event_name: string;
  page: string;
  step_id: string | null;
  button_id: string | null;
  metadata: Record<string, unknown> | null;
}

const STEP_LABELS: Record<string, string> = {
  q1_nome: "Nome",
  q2_whats: "WhatsApp",
  q3_insta: "Instagram",
  q4_mercado: "Mercado",
  q5_estagio: "Estágio",
  q6_dor: "Dor/Desejo",
};

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [buttonFilter, setButtonFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Check for existing token on mount
  useEffect(() => {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (token) {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadMetrics();
      loadSessions();
    }
  }, [isAuthenticated, statusFilter, buttonFilter, searchQuery, dateFrom, dateTo, sessionsPage]);

  const getToken = () => sessionStorage.getItem(ADMIN_TOKEN_KEY);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);

    try {
      const response = await supabase.functions.invoke("admin-login", {
        body: { password },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const token = response.data.token;
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      setIsAuthenticated(true);
      setPassword("");
      toast({ title: "Login realizado com sucesso!" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao fazer login";
      toast({ title: message, variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAuthenticated(false);
    setMetrics(null);
    setSessions([]);
  };

  const fetchAdminData = async (path: string, params?: Record<string, string>) => {
    const token = getToken();
    const queryString = params ? "?" + new URLSearchParams(params).toString() : "";
    
    const response = await supabase.functions.invoke("admin-data", {
      body: null,
      headers: {
        "x-admin-token": token || "",
      },
    });

    // Use fetch directly for proper path handling
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data${path}${queryString}`;
    const fetchResponse = await fetch(url, {
      headers: {
        "x-admin-token": token || "",
        "Content-Type": "application/json",
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });

    if (!fetchResponse.ok) {
      const error = await fetchResponse.json();
      if (fetchResponse.status === 401) {
        handleLogout();
        throw new Error("Sessão expirada");
      }
      throw new Error(error.error || "Erro ao carregar dados");
    }

    return fetchResponse.json();
  };

  const loadMetrics = async () => {
    try {
      const params: Record<string, string> = {};
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;

      const data = await fetchAdminData("/metrics", params);
      setMetrics(data);
    } catch (error) {
      console.error("Error loading metrics:", error);
    }
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const params: Record<string, string> = {
        page: sessionsPage.toString(),
        limit: "20",
      };
      if (statusFilter !== "all") params.status = statusFilter;
      if (buttonFilter !== "all") params.button_id = buttonFilter;
      if (searchQuery) params.q = searchQuery;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;

      const data = await fetchAdminData("/sessions", params);
      setSessions(data.data);
      setSessionsTotal(data.total);
    } catch (error) {
      console.error("Error loading sessions:", error);
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadSessionEvents = async (sessionId: string) => {
    setEventsLoading(true);
    try {
      const data = await fetchAdminData(`/sessions/${sessionId}/events`);
      setSessionEvents(data);
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setEventsLoading(false);
    }
  };

  const handleViewSession = async (session: Session) => {
    setSelectedSession(session);
    await loadSessionEvents(session.id);
  };

  const exportCSV = () => {
    const headers = [
      "ID",
      "Criado em",
      "Status",
      "Botão",
      "Etapa Atual",
      "Nome",
      "WhatsApp",
      "Instagram",
      "Mercado",
      "Estágio",
      "UTM Source",
      "UTM Medium",
      "UTM Campaign",
      "Dispositivo",
    ];

    const rows = sessions.map((s) => [
      s.id,
      new Date(s.created_at).toLocaleString("pt-BR"),
      s.completed
        ? "Completou"
        : s.started_quiz
        ? `Drop-off: ${STEP_LABELS[s.current_step_id || ""] || s.current_step_id}`
        : s.entered_quiz_page
        ? "Entrou no quiz"
        : "Não entrou",
      s.start_button_id || "-",
      s.current_step_id || "-",
      s.lead_name || "-",
      s.lead_whatsapp || "-",
      s.lead_instagram || "-",
      s.lead_market || "-",
      s.lead_stage || "-",
      s.utm_source || "-",
      s.utm_medium || "-",
      s.utm_campaign || "-",
      s.device_type || "-",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sessoes_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (session: Session) => {
    if (session.completed) {
      return <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400">Completou</span>;
    }
    if (session.started_quiz) {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-400">
          Drop-off: {STEP_LABELS[session.current_step_id || ""] || session.current_step_id}
        </span>
      );
    }
    if (session.entered_quiz_page) {
      return <span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400">Entrou no quiz</span>;
    }
    return <span className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground">Não entrou</span>;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Login screen
  if (!isAuthenticated) {
    return (
      <>
        <meta name="robots" content="noindex, nofollow" />
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-center">Acesso Admin</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  type="password"
                  placeholder="Digite a senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Digite a senha em texto (não cole o hash SHA-256 aqui).
                </p>
                <Button type="submit" className="w-full" disabled={loginLoading}>
                  {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // Session detail view
  if (selectedSession) {
    return (
      <>
        <meta name="robots" content="noindex, nofollow" />
        <div className="min-h-screen bg-background p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            <Button variant="ghost" onClick={() => setSelectedSession(null)} className="mb-4">
              <ChevronLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Detalhes da Sessão</span>
                  {getStatusBadge(selectedSession)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Criado em</p>
                    <p>{new Date(selectedSession.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Última atividade</p>
                    <p>{new Date(selectedSession.last_seen_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Dispositivo</p>
                    <p className="capitalize">{selectedSession.device_type}</p>
                  </div>
                  {selectedSession.lead_name && (
                    <div>
                      <p className="text-muted-foreground">Nome</p>
                      <p>{selectedSession.lead_name}</p>
                    </div>
                  )}
                  {selectedSession.lead_whatsapp && (
                    <div>
                      <p className="text-muted-foreground">WhatsApp</p>
                      <p>{selectedSession.lead_whatsapp}</p>
                    </div>
                  )}
                  {selectedSession.lead_instagram && (
                    <div>
                      <p className="text-muted-foreground">Instagram</p>
                      <p>{selectedSession.lead_instagram}</p>
                    </div>
                  )}
                  {selectedSession.start_button_id && (
                    <div>
                      <p className="text-muted-foreground">Botão clicado</p>
                      <p>{selectedSession.start_button_id}</p>
                    </div>
                  )}
                  {selectedSession.utm_source && (
                    <div>
                      <p className="text-muted-foreground">UTM Source</p>
                      <p>{selectedSession.utm_source}</p>
                    </div>
                  )}
                  {selectedSession.referrer && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Referrer</p>
                      <p className="truncate">{selectedSession.referrer}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Timeline de Eventos</CardTitle>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sessionEvents.map((event) => (
                      <div key={event.id} className="flex gap-4 text-sm border-l-2 border-border pl-4 pb-4">
                        <div className="text-muted-foreground whitespace-nowrap">
                          {new Date(event.created_at).toLocaleTimeString("pt-BR")}
                        </div>
                        <div>
                          <p className="font-medium">{event.event_name}</p>
                          {event.page && <p className="text-muted-foreground">Página: {event.page}</p>}
                          {event.step_id && (
                            <p className="text-muted-foreground">
                              Etapa: {STEP_LABELS[event.step_id] || event.step_id}
                            </p>
                          )}
                          {event.button_id && (
                            <p className="text-muted-foreground">Botão: {event.button_id}</p>
                          )}
                          {event.metadata && (
                            <pre className="text-xs text-muted-foreground mt-1 bg-muted p-2 rounded">
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  // Dashboard
  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold">Analytics do Funil</h1>
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" /> Sair
            </Button>
          </div>

          {/* Date Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
                placeholder="De"
              />
              <span className="text-muted-foreground">até</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
                placeholder="Até"
              />
            </div>
          </div>

          {/* Metrics Cards */}
          {metrics && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Users className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">{metrics.total_visitors}</p>
                      <p className="text-xs text-muted-foreground">Visitantes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Eye className="w-8 h-8 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold">{metrics.entered_quiz}</p>
                      <p className="text-xs text-muted-foreground">Entraram no quiz</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <MousePointer className="w-8 h-8 text-yellow-500" />
                    <div>
                      <p className="text-2xl font-bold">{metrics.started_quiz}</p>
                      <p className="text-xs text-muted-foreground">Começaram</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold">{metrics.completed}</p>
                      <p className="text-xs text-muted-foreground">Concluíram</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">{metrics.completion_rate}%</p>
                      <p className="text-xs text-muted-foreground">Taxa de conclusão</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Tabs defaultValue="sessions" className="space-y-6">
            <TabsList>
              <TabsTrigger value="sessions">Sessões</TabsTrigger>
              <TabsTrigger value="funnel">Funil</TabsTrigger>
              <TabsTrigger value="buttons">Botões</TabsTrigger>
            </TabsList>

            <TabsContent value="sessions">
              {/* Filters */}
              <div className="flex flex-wrap gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar nome, whatsapp, instagram..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-64"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="completed">Completou</SelectItem>
                    <SelectItem value="started">Drop-off</SelectItem>
                    <SelectItem value="entered">Entrou no quiz</SelectItem>
                    <SelectItem value="not_entered">Não entrou</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={buttonFilter} onValueChange={setButtonFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Botão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="start_btn_1">Botão 1 (Hero)</SelectItem>
                    <SelectItem value="start_btn_2">Botão 2 (CTA)</SelectItem>
                    <SelectItem value="start_btn_3">Botão 3 (Mobile)</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={exportCSV}>
                  <Download className="w-4 h-4 mr-2" /> Exportar CSV
                </Button>
              </div>

              {/* Sessions Table */}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="text-left p-4">Data</th>
                          <th className="text-left p-4">Status</th>
                          <th className="text-left p-4">Botão</th>
                          <th className="text-left p-4">Lead</th>
                          <th className="text-left p-4">Dispositivo</th>
                          <th className="text-left p-4">UTM</th>
                          <th className="text-right p-4">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionsLoading ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center">
                              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                            </td>
                          </tr>
                        ) : sessions.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-muted-foreground">
                              Nenhuma sessão encontrada
                            </td>
                          </tr>
                        ) : (
                          sessions.map((session) => (
                            <tr key={session.id} className="border-b hover:bg-muted/30">
                              <td className="p-4">
                                {new Date(session.created_at).toLocaleDateString("pt-BR")}
                                <br />
                                <span className="text-xs text-muted-foreground">
                                  {new Date(session.created_at).toLocaleTimeString("pt-BR")}
                                </span>
                              </td>
                              <td className="p-4">{getStatusBadge(session)}</td>
                              <td className="p-4">{session.start_button_id || "-"}</td>
                              <td className="p-4">
                                {session.lead_name || "-"}
                                {session.lead_whatsapp && (
                                  <span className="block text-xs text-muted-foreground">
                                    {session.lead_whatsapp}
                                  </span>
                                )}
                              </td>
                              <td className="p-4 capitalize">{session.device_type}</td>
                              <td className="p-4">
                                {session.utm_source || "-"}
                                {session.utm_medium && (
                                  <span className="text-xs text-muted-foreground">
                                    /{session.utm_medium}
                                  </span>
                                )}
                              </td>
                              <td className="p-4 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewSession(session)}
                                >
                                  Ver
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between p-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Mostrando {sessions.length} de {sessionsTotal} sessões
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sessionsPage === 1}
                        onClick={() => setSessionsPage((p) => p - 1)}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sessionsPage * 20 >= sessionsTotal}
                        onClick={() => setSessionsPage((p) => p + 1)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="funnel">
              {metrics && (
                <Card>
                  <CardHeader>
                    <CardTitle>Funil por Etapa</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {["q1_nome", "q2_whats", "q3_insta", "q4_mercado", "q5_estagio", "q6_dor"].map(
                        (stepId, index) => {
                          const stepData = metrics.step_funnel.find((s) => s.step_id === stepId);
                          const count = stepData?.count || 0;
                          const dropOff = metrics.drop_offs[stepId] || 0;
                          const maxCount = metrics.started_quiz || 1;
                          const percentage = ((count / maxCount) * 100).toFixed(0);

                          return (
                            <div key={stepId} className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span>
                                  {index + 1}. {STEP_LABELS[stepId]}
                                </span>
                                <span className="text-muted-foreground">
                                  {count} visualizações
                                  {dropOff > 0 && (
                                    <span className="text-red-400 ml-2">({dropOff} abandonos)</span>
                                  )}
                                </span>
                              </div>
                              <div className="h-4 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="buttons">
              {metrics && (
                <div className="grid md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-primary">
                          {metrics.button_distribution.start_btn_1}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">Botão 1 (Hero)</p>
                        <p className="text-xs text-muted-foreground">Botão principal no topo</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-primary">
                          {metrics.button_distribution.start_btn_2}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">Botão 2 (CTA)</p>
                        <p className="text-xs text-muted-foreground">Seção CTA antes do footer</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-primary">
                          {metrics.button_distribution.start_btn_3}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">Botão 3 (Mobile)</p>
                        <p className="text-xs text-muted-foreground">Barra fixa mobile</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
