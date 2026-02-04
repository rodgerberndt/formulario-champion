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
import { useActiveUsers } from "@/hooks/usePresence";
import CampaignAnalytics from "@/components/admin/CampaignAnalytics";
import DateRangePicker from "@/components/admin/DateRangePicker";
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
  ChevronLeft,
  ChevronRight,
  Loader2,
  Bell,
  RefreshCw,
  Check,
  Trash2,
  Radio,
  ChevronDown,
  ChevronUp,
  Monitor,
  Smartphone,
  Tablet,
  Clock,
  Globe,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ADMIN_TOKEN_KEY = "admin_analytics_token";

interface Metrics {
  total_visitors: number;
  unique_visitors: number;
  has_reliable_ip_data: boolean;
  ip_coverage_percent: number;
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
  ip_address: string | null;
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

interface Lead {
  id: string;
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  mercado: string;
  estagio_negocio: string;
  dor_desejo: string;
  lido: boolean;
  created_at: string;
  email: string | null;
  empresa: string | null;
  segmento: string | null;
  faturamento_faixa: string | null;
  trafego_faixa: string | null;
  ticket_faixa: string | null;
  gargalo: string | null;
  objetivo: string | null;
  timing: string | null;
  orcamento_faixa: string | null;
  tier: string | null;
  score: number | null;
  ip_address: string | null;
  is_duplicate_ip: boolean;
}

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const { activeUsers, uniqueCount, getUsersWithDuration } = useActiveUsers();
  const [showActiveUsersPanel, setShowActiveUsersPanel] = useState(false);
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

  const [statusFilter, setStatusFilter] = useState<string>("interacted");
  const [buttonFilter, setButtonFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  // Lead selection for bulk actions
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Leads state (from legacy leads table)
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadsUnreadCount, setLeadsUnreadCount] = useState(0);
  const [leadsSearchQuery, setLeadsSearchQuery] = useState("");
  
  // Leads filters
  const [leadsStatusFilter, setLeadsStatusFilter] = useState<string>("all");
  const [leadsMercadoFilter, setLeadsMercadoFilter] = useState<string>("all");
  const [leadsEstagioFilter, setLeadsEstagioFilter] = useState<string>("all");
  const [leadsTierFilter, setLeadsTierFilter] = useState<string>("all");
  const [leadsDateRange, setLeadsDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });

  // Funnel drop-off detail state
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [dropoffSessions, setDropoffSessions] = useState<Session[]>([]);
  const [dropoffLoading, setDropoffLoading] = useState(false);

  // Persistent tab state
  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem("admin_active_tab") || "leads";
  });

  // Completed leads modal
  const [showCompletedModal, setShowCompletedModal] = useState(false);

  // Persist active tab to localStorage
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    localStorage.setItem("admin_active_tab", value);
  };

  // Open completed leads modal - switches to leads tab and shows all
  const openCompletedLeads = () => {
    setShowCompletedModal(true);
  };

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
      loadLeads();
    }
  }, [isAuthenticated, statusFilter, buttonFilter, searchQuery, dateRange, sessionsPage]);

  // Load leads from legacy table via edge function
  const loadLeads = async () => {
    setLeadsLoading(true);
    try {
      const data = await fetchAdminData("/leads");
      setLeads(data || []);
      setLeadsUnreadCount(data?.filter((l: Lead) => !l.lido).length || 0);
    } catch (error) {
      console.error("Error loading leads:", error);
    } finally {
      setLeadsLoading(false);
    }
  };

  const markLeadAsRead = async (id: string) => {
    try {
      const token = getToken();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data/leads/${id}`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "x-admin-token": token || "",
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ lido: true }),
      });

      if (!response.ok) {
        throw new Error("Failed to update lead");
      }
    } catch (error) {
      console.error("Error marking lead as read:", error);
    }
  };

  const openLeadDetail = (lead: Lead) => {
    // Mark as read and update immediately in the list
    if (!lead.lido) {
      // Update the leads list immediately (optimistic update)
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, lido: true } : l))
      );
      setLeadsUnreadCount((prev) => Math.max(0, prev - 1));
      
      // Update backend in background
      markLeadAsRead(lead.id);
      
      // Set selected lead with lido: true
      setSelectedLead({ ...lead, lido: true });
    } else {
      setSelectedLead(lead);
    }
  };

  // Delete multiple leads
  const deleteLeads = async (ids: string[]) => {
    try {
      const token = getToken();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data/leads`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "x-admin-token": token || "",
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete leads");
      }

      return true;
    } catch (error) {
      console.error("Error deleting leads:", error);
      return false;
    }
  };

  const handleDeleteSelectedLeads = async () => {
    if (selectedLeadIds.size === 0) return;
    
    const confirmed = window.confirm(`Tem certeza que deseja excluir ${selectedLeadIds.size} lead(s)? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    setIsDeleting(true);
    const ids = Array.from(selectedLeadIds);
    const success = await deleteLeads(ids);
    
    if (success) {
      // Remove from local state
      setLeads((prev) => prev.filter((l) => !selectedLeadIds.has(l.id)));
      setLeadsUnreadCount((prev) => {
        const deletedUnread = ids.filter(id => !leads.find(l => l.id === id)?.lido).length;
        return Math.max(0, prev - deletedUnread);
      });
      setSelectedLeadIds(new Set());
      toast({ title: `${ids.length} lead(s) excluído(s) com sucesso!` });
      // Reload metrics
      loadMetrics();
    } else {
      toast({ title: "Erro ao excluir leads", variant: "destructive" });
    }
    setIsDeleting(false);
  };

  const toggleLeadSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLeadIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.size === filteredLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  // Load drop-off sessions for a specific step
  const loadDropoffSessions = async (stepId: string) => {
    if (expandedStep === stepId) {
      setExpandedStep(null);
      return;
    }
    
    setDropoffLoading(true);
    setExpandedStep(stepId);
    try {
      const data = await fetchAdminData(`/dropoff/${stepId}`);
      setDropoffSessions(data || []);
    } catch (error) {
      console.error("Error loading dropoff sessions:", error);
      setDropoffSessions([]);
    } finally {
      setDropoffLoading(false);
    }
  };

  // Get unique values for filter dropdowns
  const uniqueMercados = [...new Set(leads.map(l => l.mercado))].filter(Boolean).sort();
  const uniqueEstagios = [...new Set(leads.map(l => l.estagio_negocio))].filter(Boolean).sort();
  const uniqueTiers = [...new Set(leads.map(l => l.tier))].filter(Boolean).sort();

  const filteredLeads = leads.filter((lead) => {
    // Search filter
    if (leadsSearchQuery) {
      const q = leadsSearchQuery.toLowerCase();
      const matchesSearch = 
        lead.nome_completo.toLowerCase().includes(q) ||
        lead.whatsapp.includes(q) ||
        lead.instagram.toLowerCase().includes(q) ||
        lead.mercado.toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    
    // Status filter
    if (leadsStatusFilter === "lido" && !lead.lido) return false;
    if (leadsStatusFilter === "nao_lido" && lead.lido) return false;
    
    // Mercado filter
    if (leadsMercadoFilter !== "all" && lead.mercado !== leadsMercadoFilter) return false;
    
    // Estágio filter
    if (leadsEstagioFilter !== "all" && lead.estagio_negocio !== leadsEstagioFilter) return false;
    
    // Tier filter
    if (leadsTierFilter !== "all" && lead.tier !== leadsTierFilter) return false;
    
    // Date filters
    if (leadsDateRange.from) {
      const leadDate = new Date(lead.created_at);
      if (leadDate < leadsDateRange.from) return false;
    }
    if (leadsDateRange.to) {
      const leadDate = new Date(lead.created_at);
      const toDate = new Date(leadsDateRange.to);
      toDate.setHours(23, 59, 59, 999);
      if (leadDate > toDate) return false;
    }
    
    return true;
  });

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
    
    // If no token, force logout
    if (!token) {
      handleLogout();
      throw new Error("Token não encontrado");
    }
    
    const queryString = params ? "?" + new URLSearchParams(params).toString() : "";
    
    // Use fetch directly for proper path handling
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data${path}${queryString}`;
    
    try {
      const fetchResponse = await fetch(url, {
        headers: {
          "x-admin-token": token,
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!fetchResponse.ok) {
        const error = await fetchResponse.json().catch(() => ({ error: "Erro desconhecido" }));
        if (fetchResponse.status === 401) {
          // Token expired or invalid - force logout
          console.log("Token expirado, fazendo logout...");
          handleLogout();
          toast({ title: "Sessão expirada. Faça login novamente.", variant: "destructive" });
          throw new Error("Sessão expirada");
        }
        throw new Error(error.error || "Erro ao carregar dados");
      }

      return fetchResponse.json();
    } catch (error) {
      // Network error or other issue
      if (error instanceof Error && error.message === "Sessão expirada") {
        throw error;
      }
      console.error("Fetch error:", error);
      throw error;
    }
  };

  const loadMetrics = async () => {
    try {
      const params: Record<string, string> = {};
      if (dateRange.from) params.from = format(dateRange.from, "yyyy-MM-dd");
      if (dateRange.to) params.to = format(dateRange.to, "yyyy-MM-dd");

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
      if (dateRange.from) params.from = format(dateRange.from, "yyyy-MM-dd");
      if (dateRange.to) params.to = format(dateRange.to, "yyyy-MM-dd");

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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Criado em</p>
                    <p className="font-medium">{new Date(selectedSession.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Última atividade</p>
                    <p className="font-medium">{new Date(selectedSession.last_seen_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Dispositivo</p>
                    <p className="font-medium capitalize">{selectedSession.device_type || "-"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lead Information Card */}
            {(selectedSession.lead_name || selectedSession.lead_whatsapp || selectedSession.lead_instagram) && (
              <Card className="mb-6 border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Informações do Lead
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {selectedSession.lead_name && (
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Nome Completo</p>
                        <p className="text-lg font-semibold">{selectedSession.lead_name}</p>
                      </div>
                    )}
                    {selectedSession.lead_whatsapp && (
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">WhatsApp</p>
                        <a 
                          href={`https://wa.me/55${selectedSession.lead_whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lg font-semibold text-green-500 hover:underline"
                        >
                          {selectedSession.lead_whatsapp}
                        </a>
                      </div>
                    )}
                    {selectedSession.lead_instagram && (
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Instagram</p>
                        <a 
                          href={`https://instagram.com/${selectedSession.lead_instagram.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lg font-semibold text-primary hover:underline"
                        >
                          {selectedSession.lead_instagram}
                        </a>
                      </div>
                    )}
                    {selectedSession.lead_market && (
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Mercado</p>
                        <p className="text-lg font-semibold">{selectedSession.lead_market}</p>
                      </div>
                    )}
                    {selectedSession.lead_stage && (
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Estágio do Negócio</p>
                        <p className="text-lg font-semibold">{selectedSession.lead_stage}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  {(selectedSession.lead_whatsapp || selectedSession.lead_instagram) && (
                    <div className="flex gap-4 mt-6">
                      {selectedSession.lead_whatsapp && (
                        <Button 
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            const phoneNumber = selectedSession.lead_whatsapp?.replace(/\D/g, '') || '';
                            const fullNumber = phoneNumber.startsWith('55') ? phoneNumber : `55${phoneNumber}`;
                            navigator.clipboard.writeText(fullNumber);
                            toast({
                              title: "Número copiado!",
                              description: fullNumber,
                            });
                          }}
                        >
                          Copiar WhatsApp
                        </Button>
                      )}
                      {selectedSession.lead_instagram && (
                        <Button 
                          variant="outline"
                          className="flex-1"
                          asChild
                        >
                          <a 
                            href={`https://www.instagram.com/${selectedSession.lead_instagram?.replace('@', '').trim()}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Ver Instagram
                          </a>
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Session Tracking Info */}
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Informações de Rastreamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Botão Clicado</p>
                    <p className="font-medium">{selectedSession.start_button_id || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Etapa Atual</p>
                    <p className="font-medium">{selectedSession.current_step_id ? STEP_LABELS[selectedSession.current_step_id] || selectedSession.current_step_id : "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Entrou no Quiz</p>
                    <p className="font-medium">{selectedSession.entered_quiz_page ? "Sim" : "Não"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Começou Quiz</p>
                    <p className="font-medium">{selectedSession.started_quiz ? "Sim" : "Não"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Completou</p>
                    <p className="font-medium">{selectedSession.completed ? "Sim" : "Não"}</p>
                  </div>
                  {selectedSession.utm_source && (
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">UTM Source</p>
                      <p className="font-medium">{selectedSession.utm_source}</p>
                    </div>
                  )}
                  {selectedSession.utm_medium && (
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">UTM Medium</p>
                      <p className="font-medium">{selectedSession.utm_medium}</p>
                    </div>
                  )}
                  {selectedSession.utm_campaign && (
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">UTM Campaign</p>
                      <p className="font-medium">{selectedSession.utm_campaign}</p>
                    </div>
                  )}
                  {selectedSession.referrer && (
                    <div className="col-span-2 md:col-span-3">
                      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Referrer</p>
                      <p className="font-medium truncate">{selectedSession.referrer}</p>
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
                ) : sessionEvents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum evento registrado para esta sessão</p>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      // Accumulate field data across events to show at each step
                      const accumulatedData: Record<string, string> = {};
                      
                      return sessionEvents.map((event) => {
                        // Accumulate field values from step_next events
                        if (event.metadata && (event.metadata as Record<string, unknown>).field_value) {
                          const fieldValue = (event.metadata as Record<string, unknown>).field_value as Record<string, string>;
                          Object.assign(accumulatedData, fieldValue);
                        }
                        
                        const currentAccumulated = { ...accumulatedData };
                        const hasAccumulatedData = Object.keys(currentAccumulated).length > 0;
                        
                        // Get event-specific field value
                        const eventFieldValue = event.metadata && (event.metadata as Record<string, unknown>).field_value as Record<string, string> | undefined;
                        
                        return (
                          <div key={event.id} className="flex gap-4 text-sm border-l-2 border-border pl-4 pb-4">
                            <div className="text-muted-foreground whitespace-nowrap text-xs">
                              {new Date(event.created_at).toLocaleTimeString("pt-BR")}
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-foreground">{event.event_name}</p>
                              {event.page && <p className="text-muted-foreground text-xs">Página: {event.page}</p>}
                              {event.step_id && (
                                <p className="text-muted-foreground text-xs">
                                  Etapa: {STEP_LABELS[event.step_id] || event.step_id}
                                </p>
                              )}
                              {event.button_id && (
                                <p className="text-primary text-xs font-medium">🔘 Botão: {event.button_id}</p>
                              )}
                              
                              {/* Show field value added in THIS event */}
                              {eventFieldValue && (
                                <div className="mt-2 p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                                  <p className="text-xs text-green-400 uppercase tracking-wider mb-1">✓ Dado preenchido:</p>
                                  {Object.entries(eventFieldValue).map(([key, value]) => (
                                    <p key={key} className="text-sm text-foreground">
                                      <span className="text-green-400 font-medium capitalize">{key}:</span>{" "}
                                      <span className="font-semibold">{value}</span>
                                    </p>
                                  ))}
                                </div>
                              )}
                              
                              {/* Show accumulated data so far (for step_view events to show what we have) */}
                              {event.event_name === "step_view" && hasAccumulatedData && (
                                <div className="mt-2 p-2 bg-muted/50 rounded-lg border border-border">
                                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">📋 Dados coletados até aqui:</p>
                                  {Object.entries(currentAccumulated).map(([key, value]) => (
                                    <p key={key} className="text-xs text-muted-foreground">
                                      <span className="font-medium capitalize">{key}:</span> {value}
                                    </p>
                                  ))}
                                </div>
                              )}
                              
                              {/* Show step transitions */}
                              {event.metadata && Object.keys(event.metadata).filter(k => k !== 'field_value').length > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {(event.metadata as Record<string, unknown>).from_step && (
                                    <span>De: {STEP_LABELS[String((event.metadata as Record<string, unknown>).from_step)] || String((event.metadata as Record<string, unknown>).from_step)}</span>
                                  )}
                                  {(event.metadata as Record<string, unknown>).to_step && (
                                    <span className="ml-2">→ Para: {STEP_LABELS[String((event.metadata as Record<string, unknown>).to_step)] || String((event.metadata as Record<string, unknown>).to_step)}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
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
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
          </div>

          {/* Active Users Card - Expandable */}
          <Card className="mb-4 border-green-500/50 bg-green-500/5">
            <CardContent className="py-4">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowActiveUsersPanel(!showActiveUsersPanel)}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Radio className="w-8 h-8 text-green-500" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-green-500">{uniqueCount}</p>
                    <p className="text-sm text-muted-foreground">
                      {uniqueCount === 1 ? "pessoa ativa" : "pessoas ativas"} agora
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {activeUsers.length > 0 && !showActiveUsersPanel && (
                    <div className="text-right text-xs text-muted-foreground max-w-xs hidden md:block">
                      <p className="font-medium text-green-500 mb-1">IPs únicos conectados:</p>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {[...new Set(activeUsers.map(u => u.ip_address))].slice(0, 3).map((ip, i) => (
                          <span key={i} className="px-2 py-0.5 bg-green-500/10 rounded text-green-400 font-mono text-[10px]">
                            {ip}
                          </span>
                        ))}
                        {[...new Set(activeUsers.map(u => u.ip_address))].length > 3 && (
                          <span className="px-2 py-0.5 bg-muted rounded text-muted-foreground text-[10px]">
                            +{[...new Set(activeUsers.map(u => u.ip_address))].length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="text-green-500 hover:text-green-400">
                    {showActiveUsersPanel ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </Button>
                </div>
              </div>

              {/* Expanded Panel */}
              {showActiveUsersPanel && activeUsers.length > 0 && (
                <div className="mt-4 pt-4 border-t border-green-500/20">
                  <div className="grid gap-3">
                    {getUsersWithDuration().map((user, index) => {
                      const DeviceIcon = user.device_type === 'Mobile' ? Smartphone : 
                                        user.device_type === 'Tablet' ? Tablet : Monitor;
                      
                      return (
                        <div 
                          key={`${user.ip_address}-${index}`}
                          className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-green-500/10"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-green-500/10">
                              <DeviceIcon className="w-4 h-4 text-green-500" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm text-green-400">{user.ip_address}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/30 text-green-400">
                                  {user.device_type}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                <span className="flex items-center gap-1">
                                  <Globe className="w-3 h-3" />
                                  {user.page === '/' ? 'Landing Page' : user.page}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-sm text-green-400">
                              <Clock className="w-3 h-3" />
                              <span>{user.duration}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">no site</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Summary Stats */}
                  <div className="mt-4 pt-3 border-t border-green-500/10 grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-lg font-bold text-green-500">
                        {getUsersWithDuration().filter(u => u.device_type === 'Desktop').length}
                      </p>
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                        <Monitor className="w-3 h-3" /> Desktop
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-green-500">
                        {getUsersWithDuration().filter(u => u.device_type === 'Mobile').length}
                      </p>
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                        <Smartphone className="w-3 h-3" /> Mobile
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-green-500">
                        {getUsersWithDuration().filter(u => u.device_type === 'Tablet').length}
                      </p>
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                        <Tablet className="w-3 h-3" /> Tablet
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state when panel is open but no users */}
              {showActiveUsersPanel && activeUsers.length === 0 && (
                <div className="mt-4 pt-4 border-t border-green-500/20 text-center py-6">
                  <p className="text-muted-foreground text-sm">Nenhum visitante ativo no momento</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Metrics Cards */}
          {metrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Users className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">{metrics.total_visitors}</p>
                      <p className="text-xs text-muted-foreground">
                        {metrics.has_reliable_ip_data ? "Visitantes únicos" : "Visitantes (sessões)"}
                      </p>
                      {metrics.has_reliable_ip_data && metrics.total_visitors > metrics.unique_visitors && (
                        <p className="text-xs text-yellow-500">({metrics.unique_visitors} únicos por IP)</p>
                      )}
                      {!metrics.has_reliable_ip_data && metrics.ip_coverage_percent > 0 && (
                        <p className="text-xs text-muted-foreground">IP: {metrics.ip_coverage_percent}% coletado</p>
                      )}
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
              <Card 
                className="cursor-pointer hover:bg-muted/50 transition-colors border-green-500/30 hover:border-green-500/50"
                onClick={openCompletedLeads}
              >
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold">{leads.length}</p>
                      <p className="text-xs text-muted-foreground">Concluíram <span className="text-green-500">→ clique para ver</span></p>
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

          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <TabsList className="w-full md:w-auto h-16 p-2 bg-card border-2 border-primary/30 rounded-2xl gap-2 shadow-lg shadow-primary/10">
              <TabsTrigger 
                value="leads" 
                className="relative h-12 px-8 text-lg font-bold rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted transition-all duration-200"
              >
                Leads
                {leadsUnreadCount > 0 && (
                  <span className="ml-2 px-2.5 py-0.5 text-xs bg-destructive text-destructive-foreground rounded-full font-bold animate-pulse">
                    {leadsUnreadCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="sessions" 
                className="h-12 px-8 text-lg font-bold rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted transition-all duration-200"
              >
                Sessões
              </TabsTrigger>
              <TabsTrigger 
                value="funnel" 
                className="h-12 px-8 text-lg font-bold rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted transition-all duration-200"
              >
                Funil
              </TabsTrigger>
              <TabsTrigger 
                value="buttons" 
                className="h-12 px-8 text-lg font-bold rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted transition-all duration-200"
              >
                Botões
              </TabsTrigger>
              <TabsTrigger 
                value="campaigns" 
                className="h-12 px-8 text-lg font-bold rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted transition-all duration-200"
              >
                Campanhas
              </TabsTrigger>
            </TabsList>

            {/* Leads Tab */}
            <TabsContent value="leads">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                        <Bell className="w-6 h-6 text-yellow-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{leadsUnreadCount}</p>
                        <p className="text-xs text-muted-foreground">Não Lidos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                        <Check className="w-6 h-6 text-green-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{leads.length - leadsUnreadCount}</p>
                        <p className="text-xs text-muted-foreground">Lidos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, whatsapp, instagram..."
                    value={leadsSearchQuery}
                    onChange={(e) => setLeadsSearchQuery(e.target.value)}
                    className="w-64"
                  />
                </div>
                <Select value={leadsStatusFilter} onValueChange={setLeadsStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="nao_lido">Novos</SelectItem>
                    <SelectItem value="lido">Lidos</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={leadsMercadoFilter} onValueChange={setLeadsMercadoFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Mercado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos mercados</SelectItem>
                    {uniqueMercados.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={leadsEstagioFilter} onValueChange={setLeadsEstagioFilter}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Estágio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos estágios</SelectItem>
                    {uniqueEstagios.map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={leadsTierFilter} onValueChange={setLeadsTierFilter}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {uniqueTiers.map((t) => (
                      <SelectItem key={t} value={t}>Tier {t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Date Filters */}
              <div className="flex flex-wrap gap-4 mb-4">
                <DateRangePicker
                  dateRange={leadsDateRange}
                  onDateRangeChange={setLeadsDateRange}
                />
                <Button variant="outline" onClick={loadLeads} disabled={leadsLoading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${leadsLoading ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
                {(leadsStatusFilter !== "all" || leadsMercadoFilter !== "all" || leadsEstagioFilter !== "all" || leadsTierFilter !== "all" || leadsDateRange.from || leadsDateRange.to) && (
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      setLeadsStatusFilter("all");
                      setLeadsMercadoFilter("all");
                      setLeadsEstagioFilter("all");
                      setLeadsTierFilter("all");
                      setLeadsDateRange({ from: undefined, to: undefined });
                    }}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Limpar filtros
                  </Button>
                )}
              </div>
              
              {/* Selection Actions Bar */}
              {selectedLeadIds.size > 0 && (
                <div className="flex items-center gap-4 mb-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <span className="text-sm font-medium">
                    {selectedLeadIds.size} lead(s) selecionado(s)
                  </span>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={handleDeleteSelectedLeads}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Excluir selecionados
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedLeadIds(new Set())}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
              
              {/* Filter Results Info */}
              {filteredLeads.length !== leads.length && (
                <p className="text-sm text-muted-foreground mb-4">
                  Mostrando {filteredLeads.length} de {leads.length} leads
                </p>
              )}

              {/* Leads Table */}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="text-left p-4 w-12">
                            <Checkbox
                              checked={selectedLeadIds.size === filteredLeads.length && filteredLeads.length > 0}
                              onCheckedChange={toggleSelectAll}
                              aria-label="Selecionar todos"
                            />
                          </th>
                          <th className="text-left p-4 w-12">#</th>
                          <th className="text-left p-4">Status</th>
                          <th className="text-left p-4">Tier</th>
                          <th className="text-left p-4">Nome</th>
                          <th className="text-left p-4">WhatsApp</th>
                          <th className="text-left p-4">Instagram</th>
                          <th className="text-left p-4">Mercado</th>
                          <th className="text-left p-4">Estágio</th>
                          <th className="text-left p-4">Data</th>
                          <th className="text-right p-4">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leadsLoading ? (
                          <tr>
                            <td colSpan={11} className="p-8 text-center">
                              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                            </td>
                          </tr>
                        ) : filteredLeads.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="p-8 text-center text-muted-foreground">
                              Nenhum lead encontrado
                            </td>
                          </tr>
                        ) : (
                          filteredLeads.map((lead, index) => (
                            <tr 
                              key={lead.id} 
                              className={`border-b hover:bg-muted/30 cursor-pointer transition-colors ${!lead.lido ? "bg-primary/5" : ""} ${selectedLeadIds.has(lead.id) ? "bg-primary/10" : ""}`}
                              onClick={() => openLeadDetail(lead)}
                            >
                              <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedLeadIds.has(lead.id)}
                                  onCheckedChange={() => {
                                    setSelectedLeadIds((prev) => {
                                      const newSet = new Set(prev);
                                      if (newSet.has(lead.id)) {
                                        newSet.delete(lead.id);
                                      } else {
                                        newSet.add(lead.id);
                                      }
                                      return newSet;
                                    });
                                  }}
                                  aria-label={`Selecionar ${lead.nome_completo}`}
                                />
                              </td>
                              <td className="p-4 text-muted-foreground font-mono">{index + 1}</td>
                              <td className="p-4">
                                <div className="flex flex-col gap-1">
                                  {lead.lido ? (
                                    <Badge variant="outline" className="border-muted-foreground text-muted-foreground w-fit">
                                      Lido
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-green-500 text-white animate-pulse w-fit">
                                      Novo
                                    </Badge>
                                  )}
                                  {lead.is_duplicate_ip && (
                                    <Badge variant="outline" className="border-orange-500 text-orange-500 bg-orange-500/10 w-fit text-xs">
                                      ⚠️ IP duplicado
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                {lead.tier ? (
                                  <Badge 
                                    variant="outline"
                                    className={
                                      lead.tier === "A" ? "border-green-500 text-green-500 bg-green-500/10" :
                                      lead.tier === "B" ? "border-yellow-500 text-yellow-500 bg-yellow-500/10" :
                                      "border-red-500 text-red-500 bg-red-500/10"
                                    }
                                  >
                                    {lead.tier}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="p-4 font-medium">{lead.nome_completo}</td>
                              <td className="p-4">
                                <a 
                                  href={`https://wa.me/55${lead.whatsapp.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-green-500 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {lead.whatsapp}
                                </a>
                              </td>
                              <td className="p-4">
                                <a 
                                  href={`https://instagram.com/${lead.instagram.replace('@', '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {lead.instagram}
                                </a>
                              </td>
                              <td className="p-4 text-muted-foreground">{lead.mercado}</td>
                              <td className="p-4 text-muted-foreground text-xs">{lead.estagio_negocio}</td>
                              <td className="p-4 text-muted-foreground">
                                {format(new Date(lead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </td>
                              <td className="p-4 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openLeadDetail(lead);
                                  }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Lead Detail Dialog */}
              <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-xl">Detalhes do Lead</DialogTitle>
                  </DialogHeader>
                  {selectedLead && (
                    <div className="space-y-6 mt-4">
                      {/* Basic Info */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Nome Completo</p>
                          <p className="text-lg font-semibold">{selectedLead.nome_completo}</p>
                        </div>
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">WhatsApp</p>
                          <a
                            href={`https://wa.me/55${selectedLead.whatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-lg font-semibold text-green-500 hover:underline"
                          >
                            {selectedLead.whatsapp}
                          </a>
                        </div>
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Instagram</p>
                          <a
                            href={`https://instagram.com/${selectedLead.instagram.replace("@", "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-lg font-semibold text-primary hover:underline"
                          >
                            {selectedLead.instagram}
                          </a>
                        </div>
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Data de Cadastro</p>
                          <p className="text-lg font-semibold">
                            {format(new Date(selectedLead.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>

                      {/* Business Info */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Mercado</p>
                          <p className="font-medium">{selectedLead.mercado}</p>
                        </div>
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Estágio do Negócio</p>
                          <p className="font-medium">{selectedLead.estagio_negocio}</p>
                        </div>
                        {selectedLead.empresa && (
                          <div className="p-4 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Empresa</p>
                            <p className="font-medium">{selectedLead.empresa}</p>
                          </div>
                        )}
                        {selectedLead.segmento && (
                          <div className="p-4 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Segmento</p>
                            <p className="font-medium">{selectedLead.segmento}</p>
                          </div>
                        )}
                        {selectedLead.faturamento_faixa && (
                          <div className="p-4 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Faturamento</p>
                            <p className="font-medium">{selectedLead.faturamento_faixa}</p>
                          </div>
                        )}
                        {selectedLead.ticket_faixa && (
                          <div className="p-4 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Ticket Médio</p>
                            <p className="font-medium">{selectedLead.ticket_faixa}</p>
                          </div>
                        )}
                        {selectedLead.trafego_faixa && (
                          <div className="p-4 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Investimento em Tráfego</p>
                            <p className="font-medium">{selectedLead.trafego_faixa}</p>
                          </div>
                        )}
                        {selectedLead.orcamento_faixa && (
                          <div className="p-4 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Orçamento</p>
                            <p className="font-medium">{selectedLead.orcamento_faixa}</p>
                          </div>
                        )}
                        {selectedLead.timing && (
                          <div className="p-4 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Timing</p>
                            <p className="font-medium">{selectedLead.timing}</p>
                          </div>
                        )}
                      </div>

                      {/* Goals & Challenges */}
                      {selectedLead.objetivo && (
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Objetivo</p>
                          <p className="font-medium whitespace-pre-wrap">{selectedLead.objetivo}</p>
                        </div>
                      )}
                      {selectedLead.gargalo && (
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Gargalo</p>
                          <p className="font-medium whitespace-pre-wrap">{selectedLead.gargalo}</p>
                        </div>
                      )}

                      {/* Dor/Desejo */}
                      <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Dor / Desejo</p>
                        <p className="whitespace-pre-wrap">{selectedLead.dor_desejo}</p>
                      </div>

                      {/* Score & Tier (internal) */}
                      {(selectedLead.score !== null || selectedLead.tier) && (
                        <div className="flex gap-4 pt-2 border-t">
                          {selectedLead.tier && (
                            <Badge variant={selectedLead.tier === "A" ? "default" : selectedLead.tier === "B" ? "secondary" : "outline"}>
                              Tier {selectedLead.tier}
                            </Badge>
                          )}
                          {selectedLead.score !== null && (
                            <span className="text-sm text-muted-foreground">Score: {selectedLead.score}</span>
                          )}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-4 pt-4">
                        <Button
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={() =>
                            window.open(
                              `https://wa.me/55${selectedLead.whatsapp.replace(/\D/g, "")}`,
                              "_blank"
                            )
                          }
                        >
                          Abrir WhatsApp
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() =>
                            window.open(
                              `https://instagram.com/${selectedLead.instagram.replace("@", "")}`,
                              "_blank"
                            )
                          }
                        >
                          Ver Instagram
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>

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
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interacted">Interagiu ✓</SelectItem>
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
                          <th className="text-left p-4 w-12">#</th>
                          <th className="text-left p-4">Data</th>
                          <th className="text-left p-4">Status</th>
                          <th className="text-left p-4">Nome</th>
                          <th className="text-left p-4">Instagram</th>
                          <th className="text-left p-4">WhatsApp</th>
                          <th className="text-left p-4">Dispositivo</th>
                          <th className="text-right p-4">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionsLoading ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center">
                              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                            </td>
                          </tr>
                        ) : sessions.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-muted-foreground">
                              Nenhuma sessão encontrada
                            </td>
                          </tr>
                        ) : (
                          sessions.map((session, index) => (
                            <tr 
                              key={session.id} 
                              className="border-b hover:bg-muted/30 cursor-pointer"
                              onClick={() => handleViewSession(session)}
                            >
                              <td className="p-4 text-muted-foreground font-mono">
                                {(sessionsPage - 1) * 20 + index + 1}
                              </td>
                              <td className="p-4">
                                {new Date(session.created_at).toLocaleDateString("pt-BR")}
                                <br />
                                <span className="text-xs text-muted-foreground">
                                  {new Date(session.created_at).toLocaleTimeString("pt-BR")}
                                </span>
                              </td>
                              <td className="p-4">{getStatusBadge(session)}</td>
                              <td className="p-4 font-medium">
                                {session.lead_name || <span className="text-muted-foreground">-</span>}
                              </td>
                              <td className="p-4">
                                {session.lead_instagram ? (
                                  <a 
                                    href={`https://instagram.com/${session.lead_instagram.replace('@', '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {session.lead_instagram}
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="p-4">
                                {session.lead_whatsapp ? (
                                  <a 
                                    href={`https://wa.me/55${session.lead_whatsapp.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-green-500 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {session.lead_whatsapp}
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="p-4 capitalize">{session.device_type || "-"}</td>
                              <td className="p-4 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewSession(session);
                                  }}
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
                <div className="space-y-6">
                  {/* Funnel Overview Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-2xl font-bold">{metrics.total_visitors}</p>
                        <p className="text-xs text-muted-foreground">
                          {metrics.has_reliable_ip_data ? "Visitantes únicos" : "Visitantes"}
                        </p>
                        {metrics.has_reliable_ip_data && metrics.total_visitors > metrics.unique_visitors && (
                          <p className="text-xs text-yellow-500">({metrics.unique_visitors} únicos)</p>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-2xl font-bold text-red-400">{Math.max(0, metrics.total_visitors - metrics.entered_quiz)}</p>
                        <p className="text-xs text-muted-foreground">Não entraram no quiz</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-2xl font-bold text-blue-400">{metrics.entered_quiz}</p>
                        <p className="text-xs text-muted-foreground">Entraram no quiz</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-2xl font-bold text-yellow-400">{metrics.started_quiz}</p>
                        <p className="text-xs text-muted-foreground">Começaram quiz</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-2xl font-bold text-green-400">{metrics.completed}</p>
                        <p className="text-xs text-muted-foreground">Completaram</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Drop-off Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Análise de Drop-off</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                          <p className="text-red-400 text-sm font-medium mb-1">Não entraram no quiz</p>
                          <p className="text-2xl font-bold">{Math.max(0, metrics.total_visitors - metrics.entered_quiz)}</p>
                          <p className="text-xs text-muted-foreground">
                            {metrics.total_visitors > 0 ? 
                              `${Math.max(0, ((metrics.total_visitors - metrics.entered_quiz) / metrics.total_visitors) * 100).toFixed(1)}% dos visitantes` 
                              : "0%"
                            }
                          </p>
                        </div>
                        <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                          <p className="text-yellow-400 text-sm font-medium mb-1">Abandonaram durante o quiz</p>
                          <p className="text-2xl font-bold">{Math.max(0, metrics.started_quiz - metrics.completed)}</p>
                          <p className="text-xs text-muted-foreground">
                            {metrics.started_quiz > 0 ? 
                              `${Math.max(0, ((metrics.started_quiz - metrics.completed) / metrics.started_quiz) * 100).toFixed(1)}% de quem começou` 
                              : "0%"
                            }
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Step-by-Step Funnel */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Funil por Etapa do Quiz</CardTitle>
                      <p className="text-sm text-muted-foreground">Clique em uma etapa para ver os detalhes de quem abandonou ali</p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {["q1_nome", "q2_whats", "q3_insta", "q4_mercado", "q5_estagio", "q6_dor"].map(
                          (stepId, index) => {
                            const stepData = metrics.step_funnel.find((s) => s.step_id === stepId);
                            const count = stepData?.count || 0;
                            const dropOff = metrics.drop_offs[stepId] || 0;
                            const maxCount = metrics.started_quiz || 1;
                            // Percentage of people who dropped at THIS step (relative to total who started)
                            const dropPercentage = maxCount > 0 ? ((dropOff / maxCount) * 100).toFixed(1) : "0";
                            const reachedPercentage = maxCount > 0 ? ((count / maxCount) * 100).toFixed(0) : "0";
                            const isExpanded = expandedStep === stepId;

                            return (
                              <div key={stepId} className="space-y-2">
                                <div 
                                  className={`flex justify-between text-sm p-3 rounded-lg cursor-pointer transition-colors ${
                                    dropOff > 0 ? 'hover:bg-muted/50' : ''
                                  } ${isExpanded ? 'bg-muted/50' : ''}`}
                                  onClick={() => dropOff > 0 && loadDropoffSessions(stepId)}
                                >
                                  <span className="font-medium flex items-center gap-2">
                                    {index + 1}. {STEP_LABELS[stepId]}
                                    {dropOff > 0 && (
                                      <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    )}
                                  </span>
                                  <div className="flex items-center gap-4">
                                    <span className="text-muted-foreground">
                                      {count} chegaram
                                    </span>
                                    {dropOff > 0 && (
                                      <span className="text-red-400 text-xs bg-red-500/10 px-2 py-1 rounded font-medium">
                                        {dropOff} abandonos ({dropPercentage}%)
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="h-6 bg-muted rounded-full overflow-hidden relative">
                                  <div
                                    className="h-full bg-primary transition-all"
                                    style={{ width: `${reachedPercentage}%` }}
                                  />
                                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                                    {reachedPercentage}%
                                  </span>
                                </div>

                                {/* Expanded drop-off details */}
                                {isExpanded && (
                                  <div className="mt-3 ml-4 p-4 bg-red-500/5 rounded-lg border border-red-500/20">
                                    <h4 className="text-sm font-medium text-red-400 mb-3">
                                      Pessoas que abandonaram em "{STEP_LABELS[stepId]}"
                                    </h4>
                                    {dropoffLoading ? (
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Carregando...
                                      </div>
                                    ) : dropoffSessions.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">Nenhuma sessão encontrada</p>
                                    ) : (
                                      <div className="space-y-3">
                                        {dropoffSessions.map((session) => {
                                          // Get collected_data from the enriched response
                                          const collectedData = (session as unknown as { collected_data?: Record<string, string> }).collected_data;
                                          
                                          
                                          return (
                                            <div key={session.id} className="p-3 bg-background rounded-lg border flex flex-wrap justify-between items-start gap-2">
                                              <div className="space-y-1 flex-1">
                                                <p className="font-medium">
                                                  {session.lead_name || collectedData?.nome || <span className="text-muted-foreground italic">Sem nome</span>}
                                                </p>
                                                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                                                  {(session.lead_whatsapp || collectedData?.whatsapp) && (
                                                    <a 
                                                      href={`https://wa.me/55${(session.lead_whatsapp || collectedData?.whatsapp || '').replace(/\D/g, '')}`}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="text-green-500 hover:underline"
                                                      onClick={(e) => e.stopPropagation()}
                                                    >
                                                      📱 {session.lead_whatsapp || collectedData?.whatsapp}
                                                    </a>
                                                  )}
                                                  {(session.lead_instagram || collectedData?.instagram) && (
                                                    <a 
                                                      href={`https://instagram.com/${(session.lead_instagram || collectedData?.instagram || '').replace('@', '')}`}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="text-primary hover:underline"
                                                      onClick={(e) => e.stopPropagation()}
                                                    >
                                                      📸 {session.lead_instagram || collectedData?.instagram}
                                                    </a>
                                                  )}
                                                </div>
                                                {(session.lead_market || collectedData?.mercado) && (
                                                  <p className="text-xs text-muted-foreground">Mercado: {session.lead_market || collectedData?.mercado}</p>
                                                )}
                                                {collectedData?.estagio && (
                                                  <p className="text-xs text-muted-foreground">Estágio: {collectedData.estagio}</p>
                                                )}
                                                {collectedData?.dor_desejo && (
                                                  <p className="text-xs text-muted-foreground">Dor/Desejo: {collectedData.dor_desejo}</p>
                                                )}
                                              </div>
                                              <div className="text-right text-xs text-muted-foreground">
                                                <p>{new Date(session.created_at).toLocaleDateString("pt-BR")}</p>
                                                <p>{session.device_type || "desktop"}</p>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
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

            {/* Campaigns Tab */}
            <TabsContent value="campaigns">
              <CampaignAnalytics 
                fetchAdminData={fetchAdminData}
                onViewSession={(sessionId) => {
                  // Load session and show detail view
                  handleViewSession({ id: sessionId } as Session);
                }}
              />
            </TabsContent>
          </Tabs>

          {/* Completed Leads Modal */}
          <Dialog open={showCompletedModal} onOpenChange={setShowCompletedModal}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  Leads que Concluíram ({leads.length})
                </DialogTitle>
              </DialogHeader>
              <div className="mt-4">
                {leads.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum lead concluído ainda</p>
                ) : (
                  <div className="space-y-3">
                    {leads
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((lead, index) => (
                        <div 
                          key={lead.id}
                          className="p-4 border rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => {
                            setShowCompletedModal(false);
                            openLeadDetail(lead);
                          }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <span className="text-lg font-bold text-muted-foreground w-8">{index + 1}</span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-lg">{lead.nome_completo}</p>
                                  {lead.tier && (
                                    <Badge 
                                      variant="outline"
                                      className={
                                        lead.tier === "A" ? "border-green-500 text-green-500 bg-green-500/10" :
                                        lead.tier === "B" ? "border-yellow-500 text-yellow-500 bg-yellow-500/10" :
                                        "border-red-500 text-red-500 bg-red-500/10"
                                      }
                                    >
                                      Tier {lead.tier}
                                    </Badge>
                                  )}
                                  {!lead.lido && (
                                    <Badge className="bg-green-500 text-white">Novo</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                  <span>{lead.mercado}</span>
                                  <span>•</span>
                                  <span>{lead.estagio_negocio}</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(lead.created_at), "HH:mm", { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-4 mt-2 ml-12">
                            <a 
                              href={`https://wa.me/55${lead.whatsapp.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-green-500 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {lead.whatsapp}
                            </a>
                            <a 
                              href={`https://instagram.com/${lead.instagram.replace('@', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {lead.instagram}
                            </a>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </>
  );
}
