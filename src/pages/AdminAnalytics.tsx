import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
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
import UniversalDateRangePicker from "@/components/UniversalDateRangePicker";
import { useDateRange } from "@/context/DateRangeContext";
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
  DollarSign,
  CalendarCheck,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { useLeadNotifications } from "@/hooks/useLeadNotifications";
import { NotificationsPopover } from "@/components/admin/NotificationsPopover";
import { DailyReportReminder } from "@/components/admin/DailyReportReminder";
import { ResponseTimer } from "@/components/admin/ResponseTimer";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ADMIN_AUTH_EXPIRED_EVENT, ADMIN_TOKEN_KEY, clearAdminToken, fetchAdmin, getAdminToken, isAdminTokenExpired } from "@/lib/adminAuth";

const KommoLogsPanel = lazy(() => import("@/components/admin/KommoLogsPanel"));

const CreativesTab = lazy(() => import("@/components/admin/CreativesTab"));
const FunnelMetricsTab = lazy(() => import("@/components/admin/FunnelMetricsTab"));
const LeadReportsTab = lazy(() => import("@/components/admin/LeadReportsTab"));
const DailyReportsTab = lazy(() => import("@/components/admin/DailyReportsTab"));
const InsightsTab = lazy(() => import("@/components/admin/InsightsTab"));
const AiProposalsTab = lazy(() => import("@/components/admin/AiProposalsTab"));
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  landing_views?: number;
  landing_hits_total?: number;
  meta_clicks?: number;
  loss_clicks_vs_views?: number;
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
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  ttclid: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  creative_id: string | null;
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
  q5_faturamento: "Faturamento",
  q6_dor: "Dor/Desejo",
};

interface Lead {
  id: string;
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  mercado: string;
  operacoes_ativas?: number | null;
  estagio_negocio: string;
  investimento_faixa: string | null;
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
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  placement: string | null;
  site_source_name: string | null;
  sdr_override: string | null;
  decisor: boolean | null;
  raw_answers_json: Record<string, unknown> | null;
  attribution_source: string | null;
  first_opened_at: string | null;
  skipped_queue?: boolean | null;
  skipped_queue_at?: string | null;
  clicked_whatsapp?: boolean | null;
  clicked_whatsapp_at?: string | null;
  nps_score?: number | null;
}

const QUIZ_LABELS: Record<string, string> = {
  quer_vender_mais: "Quer vender mais?",
  operacoes_ativas: "Operações ativas",
  nps_score: "NPS (0-10)",
  compromisso_whatsapp: "Compromisso WhatsApp",
  aceita_call_diagnostico: "Aceita call de diagnóstico",
  lgpd: "Aceitou LGPD",
};

const HIDE_QUIZ_KEYS = new Set([
  "nome_completo", "whatsapp", "instagram", "email", "mercado",
  "investimento_faixa", "dor_desejo", "empresa", "estagio_negocio",
  "faturamento_faixa", "trafego_faixa", "ticket_faixa", "gargalo",
  "objetivo", "timing", "orcamento_faixa", "segmento", "decisor",
]);

const formatQuizValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const getOperacoesAtivas = (lead: Lead): string => {
  const raw = lead.raw_answers_json && typeof lead.raw_answers_json === "object" ? lead.raw_answers_json : {};
  const value = raw.operacoes_ativas ?? lead.operacoes_ativas;
  return value === null || value === undefined || value === "" ? "-" : String(value);
};

const getQuizEntries = (lead: Lead): [string, unknown][] => {
  const raw = lead.raw_answers_json && typeof lead.raw_answers_json === "object" ? lead.raw_answers_json : {};
  const merged: Record<string, unknown> = {
    ...raw,
    operacoes_ativas: raw.operacoes_ativas ?? lead.operacoes_ativas,
    nps_score: raw.nps_score ?? lead.nps_score,
  };

  return Object.entries(merged).filter(
    ([key, value]) => !HIDE_QUIZ_KEYS.has(key) && value !== null && value !== undefined && value !== ""
  );
};


export default function AdminAnalytics() {
  const navigate = useNavigate();
  const { activeUsers, uniqueCount, getUsersWithDuration } = useActiveUsers();
  const { start: globalStart, end: globalEnd, startISO, endISO, startDateOnly, endDateOnly } = useDateRange();

  // Realtime lead notifications callback (ref to avoid stale closure)
  const handleNewLeadRef = useRef<() => void>();
  handleNewLeadRef.current = () => {
    loadLeads();
    loadMetrics();
  };
  const handleNewLead = useCallback(() => {
    handleNewLeadRef.current?.();
  }, []);

  // Auth error callback from polling (ref to avoid stale closure)
  const handleAuthErrorRef = useRef<() => void>();
  const handleAuthError = useCallback(() => {
    handleAuthErrorRef.current?.();
  }, []);

  const buildWhatsappNumber = (raw?: string | null) => {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits) return null;
    return digits.startsWith("55") ? digits : `55${digits}`;
  };

  const buildInstagramUrl = (raw?: string | null) => {
    const input = (raw || "").trim();
    if (!input) return null;

    // If user pasted a URL/domain, extract the username from the path.
    if (input.includes("instagram.com")) {
      try {
        const u = new URL(input.startsWith("http") ? input : `https://${input}`);
        const handleFromUrl = u.pathname.split("/").filter(Boolean)[0];
        if (handleFromUrl) return `https://instagram.com/${handleFromUrl}/`;
      } catch {
        // ignore
      }
    }

    const handle = input.replace(/^@/, "").split(/[/?#]/)[0].trim();
    if (!handle) return null;
    return `https://instagram.com/${handle}/`;
  };

  const openExternalUrl = (url: string) => {
    // In sandboxed iframes, window.open may fail; use an anchor element as fallback.
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) return;

    // Fallback: create a temporary anchor to open in new tab without navigating current page
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const copyWhatsappToClipboard = async (raw?: string | null) => {
    const fullNumber = buildWhatsappNumber(raw);
    if (!fullNumber) {
      toast({ title: "WhatsApp não informado", variant: "destructive" });
      return;
    }

    try {
      await navigator.clipboard.writeText(fullNumber);
      toast({ title: "Número copiado!", description: fullNumber });
    } catch (e) {
      console.error("Clipboard error:", e);
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const openInstagramProfile = async (raw?: string | null) => {
    const url = buildInstagramUrl(raw);
    if (!url) {
      toast({ title: "Instagram não informado", variant: "destructive" });
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link do Instagram copiado! 📋", description: url });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const [showActiveUsersPanel, setShowActiveUsersPanel] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);



  // Lead notifications (realtime)
  const { notificationsEnabled, toggleNotifications, testNotifications, sendWebPush } = useLeadNotifications(
    isAuthenticated,
    handleNewLead,
    handleAuthError
  );

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
  
  const [leadsTierFilter, setLeadsTierFilter] = useState<string>("all");
  const [leadsSdrFilter, setLeadsSdrFilter] = useState<string>("all");
  const [leadsAdsetFilter, setLeadsAdsetFilter] = useState<string>("all");
  const [leadsConversionFilter, setLeadsConversionFilter] = useState<string>("all");
  const [meetingLeadIds, setMeetingLeadIds] = useState<Set<string>>(new Set());
  const [saleLeadIds, setSaleLeadIds] = useState<Set<string>>(new Set());

  // Recalculate score/tier from lead answers (direct faturamento mapping)
  const recalcLeadScore = (lead: Lead) => {
    const FATURAMENTO_TIER: Record<string, string> = {
      "Não vendo ainda (R$0/mês)": "Desqualificado",
      "Até R$ 5 mil": "Small",
      "De R$ 5 mil a R$ 10 mil": "Medium", "De R$ 10 mil a R$ 20 mil": "Medium",
      "De R$ 20 mil a R$ 30 mil": "Medium",
      "De R$ 30 mil a R$ 50 mil": "Large", "De R$ 50 mil a R$ 75 mil": "Large",
      "De R$ 75 mil a R$ 100 mil": "Large",
      "De R$ 100 mil a R$ 150 mil": "Enterprise", "De R$ 150 mil a R$ 200 mil": "Enterprise",
      "De R$ 200 mil a R$ 300 mil": "Enterprise", "De R$ 300 mil a R$ 500 mil": "Enterprise",
      "De R$ 500 mil a R$ 750 mil": "Enterprise+", "De R$ 750 mil a R$ 1 milhão": "Enterprise+",
      "De R$ 1 milhão a R$ 2 milhões": "Enterprise+", "De R$ 2 milhões a R$ 3 milhões": "Enterprise+",
      "De R$ 3 milhões a R$ 5 milhões": "Enterprise+", "De R$ 5 milhões a R$ 10 milhões": "Enterprise+",
      "Acima de R$ 10 milhões": "Enterprise+",
      // Legacy traffic investment values (~2.5x multiplier)
      "R$ 0 – 2k": "Small",
      "R$ 2k – 8k": "Medium",
      "R$ 8k – 20k": "Large",
      "R$ 20k – 50k": "Enterprise",
      "R$ 50k – 100k": "Enterprise",
    };
    const TIER_SCORE: Record<string, number> = { "Desqualificado": 0, "Small": 1, "Medium": 2, "Large": 3, "Enterprise": 4, "Enterprise+": 5 };
    const tier = FATURAMENTO_TIER[lead.investimento_faixa || ""] || "Desqualificado";
    const score = TIER_SCORE[tier] || 0;
    return { score, tier };
  };

  // SDR assignment helper - uses override if set, otherwise based on faturamento
  // Rodger removido — todos os leads >= 5k vão para Caio
  const SDR_CAIO_FAT = [
    "De R$ 5 mil a R$ 10 mil", "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil",
    "De R$ 30 mil a R$ 50 mil", "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil",
    "De R$ 100 mil a R$ 150 mil",
    "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
    "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
    "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
    "Acima de R$ 10 milhões",
  ];
  const getLeadSdr = (lead: Lead): string => {
    if (lead.sdr_override) {
      // Migrate legacy overrides
      if (lead.sdr_override === "Rodger") return "Caio";
      if (lead.sdr_override === "Dara") return "Miguel";
      return lead.sdr_override;
    }
    if (lead.investimento_faixa && SDR_CAIO_FAT.includes(lead.investimento_faixa)) return "Caio";
    return "Miguel";
  };

  // Cycle SDR between Caio and Miguel
  const toggleSdr = async (lead: Lead) => {
    const currentSdr = getLeadSdr(lead);
    const sdrCycle = ["Caio", "Miguel"];
    const idx = sdrCycle.indexOf(currentSdr);
    const newSdr = sdrCycle[(idx + 1) % sdrCycle.length];
    
    // Optimistic update
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, sdr_override: newSdr } : l));
    
    try {
      const token = getAdminToken();
      if (!token) throw new Error("Sessão expirada");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data/leads/${lead.id}`;
      const res = await fetchAdmin(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sdr_override: newSdr }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, sdr_override: lead.sdr_override } : l));
      toast({ title: "Erro ao trocar SDR", variant: "destructive" });
    }
  };

  const getLeadTier = (lead: Lead): string => {
    return recalcLeadScore(lead).tier;
  };

  const tierShortLabel = (tier: string): string => {
    if (tier === "Desqualificado") return "Desq.";
    return tier;
  };

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

  // Campaign analytics state
  interface CampaignMetrics {
    total_sessions: number;
    started_quiz: number;
    completed: number;
    completion_rate: number;
    campaigns: Array<{
      campaign_id: string | null;
      utm_campaign: string | null;
      campaign_name: string | null;
      display_name: string;
      total: number;
      started: number;
      completed: number;
      completion_rate: number;
    }>;
    ads: Array<{
      ad_id: string | null;
      utm_content: string | null;
      ad_name: string | null;
      display_name: string;
      campaign_name: string | null;
      campaign_display_name: string;
      total: number;
      started: number;
      completed: number;
      completion_rate: number;
    }>;
    sources: Array<{
      utm_source: string;
      total: number;
      completed: number;
    }>;
  }
  const [campaignMetrics, setCampaignMetrics] = useState<CampaignMetrics | null>(null);
  const [campaignMetricsLoading, setCampaignMetricsLoading] = useState(false);


  // Persist active tab to localStorage
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    localStorage.setItem("admin_active_tab", value);
  };

  // Open completed leads modal
  const openCompletedLeads = () => {
    setShowCompletedModal(true);
  };

  // Check for existing token on mount
  useEffect(() => {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (token && !isAdminTokenExpired(token)) {
      setIsAuthenticated(true);
    } else if (token) {
      clearAdminToken();
    }

    const handleExpired = () => {
      if (!logoutFiredRef.current) {
        logoutFiredRef.current = true;
        clearAdminToken();
        setIsAuthenticated(false);
        setMetrics(null);
        setSessions([]);
        toast({ title: "Sessão expirada. Faça login novamente.", variant: "destructive" });
      }
    };

    window.addEventListener(ADMIN_AUTH_EXPIRED_EVENT, handleExpired as EventListener);

    return () => {
      window.removeEventListener(ADMIN_AUTH_EXPIRED_EVENT, handleExpired as EventListener);
    };
  }, []);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  // Load heavy data (metrics, leads, campaign) only when auth or date range changes.
  // Session filters/search/pagination are isolated to loadSessions to avoid
  // refetching the entire panel on every keystroke or filter change.
  useEffect(() => {
    if (isAuthenticated) {
      loadMetrics();
      loadLeads();
      loadCampaignMetrics();
      loadConversions();
    }
  }, [isAuthenticated, startISO, endISO]);

  // Debounce the search query so the sessions endpoint isn't hit on every keystroke.
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 350);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  // Load sessions when auth, date range, sessions filters, search or page changes.
  useEffect(() => {
    if (isAuthenticated) {
      loadSessions();
    }
  }, [isAuthenticated, statusFilter, buttonFilter, debouncedSearchQuery, startISO, endISO, sessionsPage]);

  // Auto-refresh quiz funnel metrics every 15s while authenticated so the
  // Funil do Quiz updates live (same UX as the real-time lead notifications).
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = window.setInterval(() => {
      loadMetrics();
    }, 15000);
    return () => window.clearInterval(id);
  }, [isAuthenticated, startISO, endISO]);

  // Soft "tick" every 5s while there are MQL leads still waiting to be called.
  // Apenas leads com faturamento >= R$ 5 mil disparam o bip.
  // Leads <5k (Dara/Desqualificado) NÃO devem apitar, independente de sdr_override.
  const pendingLeadsCount = leads.filter(
    (l) => !l.first_opened_at && !!l.investimento_faixa && SDR_CAIO_FAT.includes(l.investimento_faixa)
  ).length;
  useEffect(() => {
    if (!isAuthenticated || pendingLeadsCount === 0) return;
    let ctx: AudioContext | null = null;
    const playTick = () => {
      try {
        if (!ctx) {
          const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (!AC) return;
          ctx = new AC();
        }
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.035, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      } catch { /* ignore */ }
    };
    const id = window.setInterval(playTick, 5000);
    return () => {
      window.clearInterval(id);
      try { ctx?.close(); } catch { /* ignore */ }
    };
  }, [isAuthenticated, pendingLeadsCount]);

  // Load leads from legacy table via edge function
  const loadLeads = async () => {
    setLeadsLoading(true);
    try {
      const params: Record<string, string> = {
        from: startISO,
        to: endISO,
      };
      const data = await fetchAdminData("/leads", params);
      setLeads(data || []);
      setLeadsUnreadCount(data?.filter((l: Lead) => !l.lido).length || 0);
    } catch (error) {
      console.error("Error loading leads:", error);
    } finally {
      setLeadsLoading(false);
    }
  };





  const updateLeadLido = async (id: string, lido: boolean) => {
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
        body: JSON.stringify({ lido }),
      });

      if (!response.ok) {
        throw new Error("Failed to update lead");
      }
    } catch (error) {
      console.error("Error updating lead lido:", error);
    }
  };

  const toggleLeadLido = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    const newLido = !lead.lido;
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, lido: newLido } : l))
    );
    setLeadsUnreadCount((prev) => newLido ? Math.max(0, prev - 1) : prev + 1);
    // Update backend
    updateLeadLido(lead.id, newLido);
  };

  const openLeadDetail = (lead: Lead) => {
    // Stamp first_opened_at exactly once (response-time metric)
    if (!lead.first_opened_at) {
      const nowIso = new Date().toISOString();
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, first_opened_at: nowIso } : l))
      );
      // Background: persist mark_opened flag
      (async () => {
        try {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data/leads/${lead.id}`;
          const res = await fetchAdmin(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mark_opened: true }),
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.error("[response-time] mark_opened failed", res.status, txt);
          } else {
            console.log("[response-time] first_opened_at stamped for", lead.id);
          }
        } catch (e) {
          console.error("[response-time] mark_opened error:", e);
        }
      })();
    }

    // Mark as read and update immediately in the list
    if (!lead.lido) {
      // Update the leads list immediately (optimistic update)
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, lido: true, first_opened_at: l.first_opened_at || new Date().toISOString() } : l))
      );
      setLeadsUnreadCount((prev) => Math.max(0, prev - 1));
      
      // Update backend in background
      updateLeadLido(lead.id, true);
      
      // Set selected lead with lido: true
      setSelectedLead({ ...lead, lido: true, first_opened_at: lead.first_opened_at || new Date().toISOString() });
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
  
  const TIER_ORDER = ["Enterprise+", "Enterprise", "Large", "Medium", "Small", "Desqualificado"];
  const uniqueTiers = TIER_ORDER.filter(t => leads.some(l => getLeadTier(l) === t));
  const uniqueAdsets = [...new Set(leads.map(l => l.utm_content).filter(Boolean) as string[])].sort();

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
    
    
    // Tier filter
    if (leadsTierFilter !== "all" && getLeadTier(lead) !== leadsTierFilter) return false;
    
    // SDR filter
    if (leadsSdrFilter !== "all") {
      const sdr = getLeadSdr(lead);
      if (leadsSdrFilter === "caio" && sdr !== "Caio") return false;
      if (leadsSdrFilter === "miguel" && sdr !== "Miguel") return false;
    }
    
    // Adset (conjunto de anúncio / criativo) filter
    if (leadsAdsetFilter !== "all" && lead.utm_content !== leadsAdsetFilter) return false;

    // Conversion filter (reunião agendada / venda)
    if (leadsConversionFilter === "with_meeting" && !meetingLeadIds.has(lead.id)) return false;
    if (leadsConversionFilter === "with_sale" && !saleLeadIds.has(lead.id)) return false;
    if (leadsConversionFilter === "with_any" && !meetingLeadIds.has(lead.id) && !saleLeadIds.has(lead.id)) return false;
    if (leadsConversionFilter === "none" && (meetingLeadIds.has(lead.id) || saleLeadIds.has(lead.id))) return false;

    // Date filtering is now done server-side in loadLeads
    
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
      logoutFiredRef.current = false; // Reset guard for new session
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

  const handleLogout = useCallback(() => {
    clearAdminToken();
    setIsAuthenticated(false);
    setMetrics(null);
    setSessions([]);
  }, []);

  // Wire up the auth error ref after handleLogout is defined
  handleAuthErrorRef.current = () => {
    if (!logoutFiredRef.current) {
      logoutFiredRef.current = true;
      handleLogout();
      toast({ title: "Sessão expirada. Faça login novamente.", variant: "destructive" });
    }
  };

  const logoutFiredRef = useRef(false);
  const adminRequestQueueRef = useRef<Promise<void>>(Promise.resolve());

  // IMPORTANT: keep a stable identity for fetchAdminData.
  // Esta função é passada como prop para tabs (CreativesTab etc.) cujos
  // useCallback/useEffect dependem dela. Sem useCallback, uma nova referência
  // a cada render do AdminAnalytics dispara refetch em loop (ex: lista de
  // reuniões piscando "abre/carrega/fecha"). Como ela só usa refs e helpers
  // estáveis, é seguro memoizar com deps vazias.
  const fetchAdminData = useCallback(async (path: string, params?: Record<string, string>) => {
    const previousRequest = adminRequestQueueRef.current;
    let releaseQueue: () => void = () => undefined;
    adminRequestQueueRef.current = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    await previousRequest.catch(() => undefined);

    try {
      if (logoutFiredRef.current) {
        throw new Error("Sessão expirada");
      }
      
      const queryString = params ? "?" + new URLSearchParams(params).toString() : "";
      
      // Use fetch directly for proper path handling
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data${path}${queryString}`;
      
      const token = getToken();
      const headers = {
        "x-admin-token": token || "",
        "Content-Type": "application/json",
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      };

      // Retry on transient boot errors (502/503/504) with exponential backoff
      const MAX_RETRIES = 6;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const fetchResponse = await fetchAdmin(url, { headers });

          // Retry on transient errors (cold-start boot errors, gateway timeouts)
          if ([502, 503, 504].includes(fetchResponse.status) && attempt < MAX_RETRIES - 1) {
            const delay = 400 * Math.pow(2, attempt) + Math.random() * 200;
            console.warn(`[admin-data] ${fetchResponse.status} on ${path}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          if (!fetchResponse.ok) {
            const error = await fetchResponse.json().catch(() => ({ error: "Erro desconhecido" }));
            throw new Error(error.error || "Erro ao carregar dados");
          }

          return fetchResponse.json();
        } catch (error) {
          if (error instanceof Error && error.message === "Sessão expirada") {
            throw error;
          }
          // Retry on network errors too
          if (attempt < MAX_RETRIES - 1) {
            lastError = error as Error;
            const delay = 400 * Math.pow(2, attempt) + Math.random() * 200;
            console.warn(`[admin-data] network error on ${path}, retrying in ${Math.round(delay)}ms`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          console.error("Fetch error:", error);
          throw error;
        }
      }
      throw lastError || new Error("Falha após múltiplas tentativas");
    } finally {
      releaseQueue();
    }
  }, []);

  const loadMetrics = async () => {
    try {
      const params: Record<string, string> = {
        from: startISO,
        to: endISO,
      };

      const data = await fetchAdminData("/metrics", params);
      setMetrics(data);
    } catch (error) {
      console.error("Error loading metrics:", error);
    }
  };

  // Load meetings + manual sales to flag leads with meeting/sale conversion
  const loadConversions = useCallback(async () => {
    try {
      const [meetingsData, salesData] = await Promise.all([
        fetchAdminData("/meetings").catch(() => []),
        fetchAdminData("/manual-sales").catch(() => []),
      ]);
      const mSet = new Set<string>();
      (meetingsData || []).forEach((m: { lead_id?: string }) => { if (m?.lead_id) mSet.add(m.lead_id); });
      const sSet = new Set<string>();
      (salesData || []).forEach((s: { lead_id?: string }) => { if (s?.lead_id) sSet.add(s.lead_id); });
      setMeetingLeadIds(mSet);
      setSaleLeadIds(sSet);
    } catch (e) {
      console.warn("[AdminAnalytics] Failed to load conversions:", e);
    }
  }, [fetchAdminData]);

  const loadCampaignMetrics = async () => {
    setCampaignMetricsLoading(true);
    try {
      const params: Record<string, string> = {
        from: startISO,
        to: endISO,
      };

      const data = await fetchAdminData("/campaigns", params);
      setCampaignMetrics(data);
    } catch (error) {
      console.error("Error loading campaign metrics:", error);
    } finally {
      setCampaignMetricsLoading(false);
    }
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const params: Record<string, string> = {
        page: sessionsPage.toString(),
        limit: "20",
        from: startISO,
        to: endISO,
      };
      if (statusFilter !== "all") params.status = statusFilter;
      if (buttonFilter !== "all") params.button_id = buttonFilter;
      if (debouncedSearchQuery) params.q = debouncedSearchQuery;

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

  const exportLeadsCSV = () => {
    const escCSV = (v: unknown) => `"${String(v ?? "-").replace(/"/g, '""')}"`;
    const headers = [
      "ID","Criado em","Lido","Nome","WhatsApp","Instagram","Email","Empresa","Segmento",
      "Mercado","Estágio","Faturamento","Tráfego","Ticket","Gargalo","Objetivo","Timing",
      "Orçamento","Investimento","Dor/Desejo","Score","Tier","SDR","Decisor",
      "UTM Source","UTM Medium","UTM Campaign","UTM Content","UTM Term",
      "FBCLID","GCLID","Campaign ID","Adset ID","Ad ID","Placement","IP","IP Duplicado"
    ];
    const rows = leads.map((l) => [
      l.id, new Date(l.created_at).toLocaleString("pt-BR"), l.lido ? "Sim" : "Não",
      l.nome_completo, l.whatsapp, l.instagram, l.email, l.empresa, l.segmento,
      l.mercado, l.estagio_negocio, l.faturamento_faixa, l.trafego_faixa, l.ticket_faixa,
      l.gargalo, l.objetivo, l.timing, l.orcamento_faixa, l.investimento_faixa, l.dor_desejo,
      l.score, l.tier, l.sdr_override, l.decisor != null ? (l.decisor ? "Sim" : "Não") : "-",
      l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content, l.utm_term,
      l.fbclid, l.gclid, l.campaign_id, l.adset_id, l.ad_id, l.placement,
      l.ip_address, l.is_duplicate_ip ? "Sim" : "Não"
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map(escCSV).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads_${new Date().toISOString().split("T")[0]}.csv`;
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
                        <button
                          type="button"
                          className="text-lg font-semibold text-green-500 hover:underline text-left"
                          title="Copiar WhatsApp"
                          onClick={() => void copyWhatsappToClipboard(selectedSession.lead_whatsapp)}
                        >
                          {selectedSession.lead_whatsapp}
                        </button>
                      </div>
                    )}
                    {selectedSession.lead_instagram && (
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Instagram</p>
                        <button
                          type="button"
                          className="text-lg font-semibold text-primary hover:underline text-left"
                          title="Abrir Instagram"
                          onClick={() => openInstagramProfile(selectedSession.lead_instagram)}
                        >
                          {selectedSession.lead_instagram}
                        </button>
                      </div>
                    )}
                    {selectedSession.lead_market && (
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Mercado</p>
                        <p className="text-lg font-semibold">{selectedSession.lead_market}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  {(selectedSession.lead_whatsapp || selectedSession.lead_instagram) && (
                    <div className="flex gap-4 mt-6">
                      {selectedSession.lead_whatsapp && (
                        <Button 
                          className="flex-1 bg-green-600 hover:bg-green-700"
                            onClick={() => void copyWhatsappToClipboard(selectedSession.lead_whatsapp)}
                        >
                          Copiar WhatsApp
                        </Button>
                      )}
                      {selectedSession.lead_instagram && (
                        <Button 
                          variant="outline"
                          className="flex-1"
                            onClick={() => openInstagramProfile(selectedSession.lead_instagram)}
                        >
                            Ver Instagram
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* UTM & Attribution Tracking Card - Always show with better visual */}
            <Card className="mb-6 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    Origem do Anúncio
                  </CardTitle>
                  {/* Status Badge */}
                  {selectedSession.utm_source || selectedSession.campaign_id ? (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30">
                      <Check className="w-3 h-3 mr-1" />
                      UTM OK
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground border-muted">
                      Sem UTM
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Main Attribution: Campaign & Ad */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-background/60 rounded-lg border border-primary/20">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Campanha</p>
                    <p className="text-lg font-bold text-primary">
                      {selectedSession.utm_campaign || selectedSession.campaign_id || "Tráfego Direto"}
                    </p>
                  </div>
                  <div className="p-4 bg-background/60 rounded-lg border border-primary/20">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Anúncio</p>
                    <p className="text-lg font-bold text-primary">
                      {selectedSession.utm_content || selectedSession.ad_id || "Não identificado"}
                    </p>
                  </div>
                </div>

                {/* Secondary Info: Chips */}
                <div className="flex flex-wrap gap-2">
                  {selectedSession.utm_source && (
                    <Badge variant="outline" className="text-xs">
                      <span className="text-muted-foreground mr-1">Fonte:</span>
                      {selectedSession.utm_source}
                    </Badge>
                  )}
                  {selectedSession.utm_medium && (
                    <Badge variant="outline" className="text-xs">
                      <span className="text-muted-foreground mr-1">Medium:</span>
                      {selectedSession.utm_medium}
                    </Badge>
                  )}
                  {selectedSession.utm_term && (
                    <Badge variant="outline" className="text-xs">
                      <span className="text-muted-foreground mr-1">Term:</span>
                      {selectedSession.utm_term}
                    </Badge>
                  )}
                  {selectedSession.fbclid && (
                    <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30">
                      <span className="text-blue-400">Meta Click ✓</span>
                    </Badge>
                  )}
                  {selectedSession.gclid && (
                    <Badge variant="outline" className="text-xs bg-yellow-500/10 border-yellow-500/30">
                      <span className="text-yellow-400">Google Click ✓</span>
                    </Badge>
                  )}
                  {selectedSession.ttclid && (
                    <Badge variant="outline" className="text-xs bg-pink-500/10 border-pink-500/30">
                      <span className="text-pink-400">TikTok Click ✓</span>
                    </Badge>
                  )}
                </div>

                {/* IDs Row - More compact */}
                {(selectedSession.campaign_id || selectedSession.adset_id || selectedSession.ad_id) && (
                  <div className="pt-3 border-t border-muted">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">IDs Meta Ads</p>
                    <div className="flex flex-wrap gap-2 text-xs font-mono text-muted-foreground">
                      {selectedSession.campaign_id && (
                        <span className="px-2 py-1 bg-muted/50 rounded">c:{selectedSession.campaign_id}</span>
                      )}
                      {selectedSession.adset_id && (
                        <span className="px-2 py-1 bg-muted/50 rounded">as:{selectedSession.adset_id}</span>
                      )}
                      {selectedSession.ad_id && (
                        <span className="px-2 py-1 bg-muted/50 rounded">ad:{selectedSession.ad_id}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Referrer */}
                {selectedSession.referrer && (
                  <div className="pt-3 border-t border-muted">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Referrer</p>
                    <p className="text-sm truncate">{selectedSession.referrer}</p>
                  </div>
                )}

                {/* Copy Tracking Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={async () => {
                    const trackingData = [
                      selectedSession.utm_source && `utm_source=${selectedSession.utm_source}`,
                      selectedSession.utm_medium && `utm_medium=${selectedSession.utm_medium}`,
                      selectedSession.utm_campaign && `utm_campaign=${selectedSession.utm_campaign}`,
                      selectedSession.utm_content && `utm_content=${selectedSession.utm_content}`,
                      selectedSession.utm_term && `utm_term=${selectedSession.utm_term}`,
                      `session_id=${selectedSession.id}`,
                    ].filter(Boolean).join(" | ");
                    
                    try {
                      await navigator.clipboard.writeText(trackingData);
                      toast({ title: "Tracking copiado!", description: "Dados de atribuição copiados para a área de transferência." });
                    } catch {
                      toast({ title: "Erro ao copiar", variant: "destructive" });
                    }
                  }}
                >
                  📋 Copiar Tracking
                </Button>
              </CardContent>
            </Card>

            {/* Session Tracking Info */}
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Informações da Sessão</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="p-2 bg-muted/30 rounded">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Botão Clicado</p>
                    <p className="font-medium">{selectedSession.start_button_id || "-"}</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Etapa Atual</p>
                    <p className="font-medium">{selectedSession.current_step_id ? STEP_LABELS[selectedSession.current_step_id] || selectedSession.current_step_id : "-"}</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Entrou no Quiz</p>
                    <p className="font-medium">{selectedSession.entered_quiz_page ? "Sim" : "Não"}</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Completou</p>
                    <p className="font-medium">{selectedSession.completed ? "Sim" : "Não"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Timeline de Eventos ({sessionEvents.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : sessionEvents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum evento registrado</p>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto pr-2">
                    <div className="space-y-1">
                      {(() => {
                        // Accumulate field data across events
                        const accumulatedData: Record<string, string> = {};
                        
                        // Group events by type for compact display
                        const eventIcons: Record<string, string> = {
                          page_view: "👁️",
                          start_click: "▶️",
                          quiz_view: "📝",
                          step_view: "📍",
                          step_next: "➡️",
                          step_back: "⬅️",
                          submit: "✅",
                          visibility_hidden: "💤",
                        };
                        
                        return sessionEvents.map((event, idx) => {
                          // Accumulate field values from step_next events
                          if (event.metadata && (event.metadata as Record<string, unknown>).field_value) {
                            const fieldValue = (event.metadata as Record<string, unknown>).field_value as Record<string, string>;
                            Object.assign(accumulatedData, fieldValue);
                          }
                          
                          const eventFieldValue = event.metadata && (event.metadata as Record<string, unknown>).field_value as Record<string, string> | undefined;
                          const icon = eventIcons[event.event_name] || "•";
                          
                          // Compact display for less important events
                          const isMinorEvent = ["visibility_hidden", "page_view"].includes(event.event_name) && !event.button_id;
                          
                          if (isMinorEvent) {
                            return (
                              <div key={event.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1 pl-2 border-l border-muted">
                                <span>{icon}</span>
                                <span className="font-mono text-[10px]">{new Date(event.created_at).toLocaleTimeString("pt-BR")}</span>
                                <span>{event.event_name}</span>
                                {event.page && <span className="truncate max-w-24">{event.page}</span>}
                              </div>
                            );
                          }
                          
                          return (
                            <div key={event.id} className={`flex items-start gap-2 py-2 pl-2 border-l-2 ${event.event_name === "submit" ? "border-green-500 bg-green-500/5" : event.event_name === "start_click" ? "border-primary" : "border-muted"}`}>
                              <span className="text-base mt-0.5">{icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{event.event_name}</span>
                                  <span className="text-[10px] text-muted-foreground font-mono">{new Date(event.created_at).toLocaleTimeString("pt-BR")}</span>
                                  {event.step_id && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                                      {STEP_LABELS[event.step_id] || event.step_id}
                                    </Badge>
                                  )}
                                  {event.button_id && (
                                    <Badge className="text-[10px] px-1 py-0 bg-primary/20 text-primary">{event.button_id}</Badge>
                                  )}
                                </div>
                                
                                {/* Show field value in compact way */}
                                {eventFieldValue && (
                                  <div className="mt-1 text-xs">
                                    {Object.entries(eventFieldValue).map(([key, value]) => (
                                      <span key={key} className="inline-flex items-center gap-1 mr-2">
                                        <span className="text-green-500">✓</span>
                                        <span className="text-muted-foreground">{key}:</span>
                                        <span className="font-medium">{value}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Show step transitions inline */}
                                {event.metadata && (event.metadata as Record<string, unknown>).from_step && (
                                  <p className="text-[10px] text-muted-foreground">
                                    {STEP_LABELS[String((event.metadata as Record<string, unknown>).from_step)] || String((event.metadata as Record<string, unknown>).from_step)}
                                    {" → "}
                                    {STEP_LABELS[String((event.metadata as Record<string, unknown>).to_step)] || String((event.metadata as Record<string, unknown>).to_step)}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <h1 className="text-xl sm:text-2xl font-bold">Analytics do Funil</h1>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <PwaInstallButton />
              <NotificationsPopover
                notificationsEnabled={notificationsEnabled}
                toggleNotifications={toggleNotifications}
                testNotifications={testNotifications}
                sendWebPush={sendWebPush}
              />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </div>

          {/* Global Date Filter + slot para ações contextuais (ex: Sync Meta Ads / Gasto / Reunião / Venda / Atualizar) */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <UniversalDateRangePicker />
            <div
              id="admin-header-actions-slot"
              className="ml-auto flex flex-wrap items-center gap-2"
            />
          </div>

          {/* Alerta de relatório diário pendente (Caio/Dara) — após 9h */}
          <DailyReportReminder enabled={isAuthenticated} />

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

          {/* Metrics Cards movidos para a aba Criativos */}


          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
              <TabsList className="w-max md:w-auto h-12 md:h-16 p-1.5 md:p-2 bg-card border-2 border-primary/30 rounded-xl md:rounded-2xl gap-1 md:gap-2 shadow-lg shadow-primary/10">
                <TabsTrigger 
                  value="leads" 
                  className="relative h-9 md:h-12 px-3 md:px-8 text-sm md:text-lg font-bold rounded-lg md:rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted transition-all duration-200"
                >
                  Leads
                  {leadsUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                      {leadsUnreadCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger 
                  value="creatives" 
                  className="h-9 md:h-12 px-3 md:px-8 text-sm md:text-lg font-bold rounded-lg md:rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted transition-all duration-200"
                >
                  Métricas Creatives
                </TabsTrigger>
                <TabsTrigger 
                  value="funnel-metrics" 
                  className="h-9 md:h-12 px-3 md:px-8 text-sm md:text-lg font-bold rounded-lg md:rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted transition-all duration-200"
                >
                  Métricas Funil
                </TabsTrigger>
                <TabsTrigger 
                  value="reports" 
                  className="h-9 md:h-12 px-3 md:px-8 text-sm md:text-lg font-bold rounded-lg md:rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted transition-all duration-200"
                >
                  Relatórios Lead
                </TabsTrigger>
                <TabsTrigger 
                  value="daily-reports" 
                  className="h-9 md:h-12 px-3 md:px-8 text-sm md:text-lg font-bold rounded-lg md:rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted transition-all duration-200"
                >
                  Relatórios
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Leads Tab */}
            <TabsContent value="leads">
              {/* Filters */}
              <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-4 mb-4">
                <div className="flex items-center gap-2 col-span-2">
                  <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <Input
                    placeholder="Buscar nome, whatsapp, instagram..."
                    value={leadsSearchQuery}
                    onChange={(e) => setLeadsSearchQuery(e.target.value)}
                    className="w-full md:w-64"
                  />
                </div>
                <Select value={leadsStatusFilter} onValueChange={setLeadsStatusFilter}>
                  <SelectTrigger className="w-full md:w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="nao_lido">Novos</SelectItem>
                    <SelectItem value="lido">Lidos</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={leadsMercadoFilter} onValueChange={setLeadsMercadoFilter}>
                  <SelectTrigger className="w-full md:w-40">
                    <SelectValue placeholder="Mercado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos mercados</SelectItem>
                    {uniqueMercados.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={leadsTierFilter} onValueChange={setLeadsTierFilter}>
                  <SelectTrigger className="w-full md:w-28">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {uniqueTiers.map((t) => (
                      <SelectItem key={t} value={t}>Tier {t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={leadsSdrFilter} onValueChange={setLeadsSdrFilter}>
                  <SelectTrigger className="w-full md:w-36">
                    <SelectValue placeholder="SDR" />
                  </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="all">Todos SDRs</SelectItem>
                    <SelectItem value="caio">Caio</SelectItem>
                    <SelectItem value="miguel">Miguel</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={leadsAdsetFilter} onValueChange={setLeadsAdsetFilter}>
                  <SelectTrigger className="w-full md:w-52">
                    <SelectValue placeholder="Conjunto de Anúncio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos conjuntos</SelectItem>
                    {uniqueAdsets.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={leadsConversionFilter} onValueChange={setLeadsConversionFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Conversão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas conversões</SelectItem>
                    <SelectItem value="with_any">Reunião ou venda</SelectItem>
                    <SelectItem value="with_meeting">Apenas reunião agendada</SelectItem>
                    <SelectItem value="with_sale">Apenas venda</SelectItem>
                    <SelectItem value="none">Sem conversão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Actions - note: date filter is now in the global header */}
              <div className="flex flex-wrap gap-4 mb-4">
                <Button variant="outline" onClick={loadLeads} disabled={leadsLoading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${leadsLoading ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
                <Button variant="outline" onClick={exportLeadsCSV} disabled={leads.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Exportar CSV
                </Button>
                {(leadsStatusFilter !== "all" || leadsMercadoFilter !== "all" || leadsTierFilter !== "all" || leadsSdrFilter !== "all" || leadsAdsetFilter !== "all" || leadsConversionFilter !== "all") && (
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      setLeadsStatusFilter("all");
                      setLeadsMercadoFilter("all");
                      
                      setLeadsTierFilter("all");
                      setLeadsSdrFilter("all");
                      setLeadsAdsetFilter("all");
                      setLeadsConversionFilter("all");
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

              {/* Leads Table - Desktop */}
              <Card className="hidden md:block">
                <CardContent className="p-0">
                  <div>
                    <table className="w-full text-sm table-fixed">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="text-left p-2 w-10">
                            <Checkbox
                              checked={selectedLeadIds.size === filteredLeads.length && filteredLeads.length > 0}
                              onCheckedChange={toggleSelectAll}
                              aria-label="Selecionar todos"
                              className="h-4 w-4 border-2 border-secondary/80 bg-background data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground data-[state=checked]:border-secondary"
                            />
                          </th>
                          <th className="text-left p-2 w-8">#</th>
                          <th className="text-left p-2 w-20">Status</th>
                          <th className="text-left p-2 w-20">Tier</th>
                          <th className="text-left p-2">Nome</th>
                          <th className="text-left p-2 w-28">WhatsApp</th>
                          <th className="text-left p-2">Instagram</th>
                          <th className="text-left p-2 w-24">Mercado</th>
                          <th className="text-left p-2 w-24" title="Operações ativas ou em fase de construção">Operações</th>
                          <th className="text-left p-2 w-28">Faturamento</th>
                          <th className="text-left p-2 w-20">SDR</th>
                          <th className="text-left p-2 w-24">Data</th>
                          <th className="text-left p-2 w-24" title="Tempo entre chegada do lead e clique para abrir/ler">Tempo p/ chamar</th>
                          <th className="text-right p-2 w-12">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leadsLoading ? (
                          <tr>
                              <td colSpan={14} className="p-8 text-center">
                              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                            </td>
                          </tr>
                        ) : filteredLeads.length === 0 ? (
                          <tr>
                            <td colSpan={14} className="p-8 text-center text-muted-foreground">
                              Nenhum lead encontrado
                            </td>
                          </tr>
                        ) : (
                          filteredLeads.map((lead, index) => (
                            <tr 
                              key={lead.id} 
                              className={`border-b hover:bg-muted/30 cursor-pointer ${!lead.lido ? "bg-primary/5" : ""} ${selectedLeadIds.has(lead.id) ? "!bg-secondary/20 ring-1 ring-inset ring-secondary/60" : ""}`}
                              onClick={() => openLeadDetail(lead)}
                            >
                              <td
                                className="p-2 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLeadIds((prev) => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(lead.id)) newSet.delete(lead.id);
                                    else newSet.add(lead.id);
                                    return newSet;
                                  });
                                }}
                              >
                                <Checkbox
                                  checked={selectedLeadIds.has(lead.id)}
                                  aria-label={`Selecionar ${lead.nome_completo}`}
                                  className="h-4 w-4 border-2 border-secondary/80 bg-background data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground data-[state=checked]:border-secondary pointer-events-none"
                                />
                              </td>
                              <td className="p-2 text-muted-foreground font-mono text-xs">{index + 1}</td>
                              <td className="p-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge 
                                    variant="outline"
                                    className={`cursor-pointer transition-colors ${
                                      lead.lido 
                                        ? "border-muted-foreground text-muted-foreground hover:bg-green-500/10 hover:text-green-400 hover:border-green-500" 
                                        : "bg-green-500 text-white animate-pulse hover:bg-green-600"
                                    } w-fit`}
                                    onClick={(e) => toggleLeadLido(lead, e)}
                                    title={lead.lido ? "Clique para marcar como Novo" : "Clique para marcar como Lido"}
                                  >
                                    {lead.lido ? "Lido" : "Novo"}
                                  </Badge>
                                  {lead.is_duplicate_ip && (
                                    <Badge variant="outline" className="border-orange-500 text-orange-500 bg-orange-500/10 w-fit text-[10px] px-1.5 py-0">
                                      ⚠️ Dup
                                    </Badge>
                                  )}
                                  {lead.attribution_source === "bio_recovery" && (
                                    <Badge variant="outline" className="border-violet-400 text-violet-300 bg-violet-500/15 w-fit text-[10px] px-1.5 py-0">
                                      🔗 Bio
                                    </Badge>
                                  )}
                                  {lead.attribution_source === "organic" && (
                                    <Badge variant="outline" className="border-emerald-600 text-emerald-400 bg-emerald-500/10 w-fit text-[10px] px-1.5 py-0">
                                      🌿 Org
                                    </Badge>
                                  )}
                                  {lead.attribution_source === "direct_ad" && (
                                    <Badge variant="outline" className="border-sky-600 text-sky-400 bg-sky-500/10 w-fit text-[10px] px-1.5 py-0">
                                      📢 Ad
                                    </Badge>
                                  )}
                                  {lead.skipped_queue && (
                                    <Badge variant="outline" className="border-secondary text-secondary bg-secondary/10 w-fit text-[10px] px-1.5 py-0">
                                      ⚡ Furou a fila
                                    </Badge>
                                  )}
                                  {lead.clicked_whatsapp && (
                                    <Badge variant="outline" className="border-emerald-500 text-emerald-400 bg-emerald-500/10 w-fit text-[10px] px-1.5 py-0">
                                      💬 Chamou WhatsApp
                                    </Badge>
                                  )}
                                  {meetingLeadIds.has(lead.id) && (
                                    <Badge variant="outline" className="border-blue-500 text-blue-400 bg-blue-500/10 w-fit text-[10px] px-1.5 py-0 gap-0.5">
                                      <CalendarCheck className="w-2.5 h-2.5" /> Reunião
                                    </Badge>
                                  )}
                                  {saleLeadIds.has(lead.id) && (
                                    <Badge variant="outline" className="border-secondary text-secondary bg-secondary/10 w-fit text-[10px] px-1.5 py-0 gap-0.5">
                                      <DollarSign className="w-2.5 h-2.5" /> Venda
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="p-2">
                                {(() => {
                                  const tier = getLeadTier(lead);
                                  return (
                                    <Badge 
                                      variant="outline"
                                      className={`whitespace-nowrap text-[10px] ${
                                        tier === "Enterprise+" ? "border-pink-500 text-pink-500 bg-pink-500/10" :
                                        tier === "Enterprise" ? "border-purple-500 text-purple-500 bg-purple-500/10" :
                                        tier === "Large" ? "border-green-500 text-green-500 bg-green-500/10" :
                                        tier === "Medium" ? "border-yellow-500 text-yellow-500 bg-yellow-500/10" :
                                        tier === "Desqualificado" ? "border-gray-400 text-gray-400 bg-gray-400/10" :
                                        "border-red-500 text-red-500 bg-red-500/10"
                                      }`}
                                    >
                                      {tierShortLabel(tier)}
                                    </Badge>
                                  );
                                })()}
                              </td>
                              <td className="p-2 font-medium max-w-[140px]" title={lead.nome_completo}>
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate">{lead.nome_completo}</span>
                                  {typeof lead.nps_score === "number" && (
                                    <span
                                      title={`Nota IA: ${lead.nps_score}/10`}
                                      className="inline-flex items-center gap-0.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 leading-none shrink-0"
                                    >
                                      <span className="text-[10px]">⭐</span>
                                      {lead.nps_score}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-2">
                                <button
                                  type="button"
                                  className="text-green-500 hover:underline text-xs truncate block max-w-full"
                                  title="Copiar WhatsApp"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void copyWhatsappToClipboard(lead.whatsapp);
                                  }}
                                >
                                  {lead.whatsapp}
                                </button>
                              </td>
                              <td className="p-2">
                                <button
                                  type="button"
                                  className="text-pink-400 hover:underline text-xs truncate block max-w-full"
                                  title="Abrir Instagram"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openInstagramProfile(lead.instagram);
                                  }}
                                >
                                  {lead.instagram}
                                </button>
                              </td>
                              <td className="p-2 text-muted-foreground text-xs truncate" title={lead.mercado}>{lead.mercado}</td>
                              <td className="p-2 text-muted-foreground text-xs truncate" title={getOperacoesAtivas(lead)}>{getOperacoesAtivas(lead)}</td>
                              <td className="p-2 text-muted-foreground text-xs truncate" title={lead.investimento_faixa || "-"}>{lead.investimento_faixa || "-"}</td>
                              <td className="p-2">
                                {(() => {
                                  const sdr = getLeadSdr(lead);
                                  if (sdr === "Caio") return (
                                    <Badge 
                                      className="bg-green-500/20 text-green-400 border-green-500/30 cursor-pointer hover:bg-green-500/30 transition-colors"
                                      onClick={(e) => { e.stopPropagation(); toggleSdr(lead); }}
                                    >Caio</Badge>
                                  );
                                  if (sdr === "Miguel") return (
                                    <Badge 
                                      className="bg-pink-500/20 text-pink-400 border-pink-500/30 cursor-pointer hover:bg-pink-500/30 transition-colors"
                                      onClick={(e) => { e.stopPropagation(); toggleSdr(lead); }}
                                    >Miguel</Badge>
                                  );
                                  return <span className="text-muted-foreground">-</span>;
                                })()}
                              </td>
                              <td className="p-2 text-muted-foreground text-xs">
                                {format(new Date(lead.created_at), "dd/MM HH:mm", { locale: ptBR })}
                              </td>
                              <td className="p-2">
                                <ResponseTimer
                                  createdAt={lead.created_at}
                                  firstOpenedAt={lead.first_opened_at}
                                />
                              </td>
                              <td className="p-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openLeadDetail(lead);
                                  }}
                                >
                                  <Eye className="w-3.5 h-3.5" />
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

              {/* Leads Cards - Mobile */}
              <div className="md:hidden space-y-3">
                {leadsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum lead encontrado</p>
                ) : (
                  filteredLeads.map((lead, index) => {
                    const tier = getLeadTier(lead);
                    const sdr = getLeadSdr(lead);
                    return (
                      <Card 
                        key={lead.id}
                        className={`cursor-pointer ${!lead.lido ? "border-primary/30 bg-primary/5" : ""} ${selectedLeadIds.has(lead.id) ? "!bg-secondary/20 !border-secondary ring-2 ring-secondary/60" : ""}`}
                        onClick={() => openLeadDetail(lead)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-3 min-w-0">
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLeadIds((prev) => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(lead.id)) newSet.delete(lead.id);
                                    else newSet.add(lead.id);
                                    return newSet;
                                  });
                                }}
                                className="mt-1 -m-2 p-2 cursor-pointer"
                              >
                                <Checkbox
                                  checked={selectedLeadIds.has(lead.id)}
                                  className="h-4 w-4 border-2 border-secondary/80 bg-background data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground data-[state=checked]:border-secondary pointer-events-none"
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold truncate">{lead.nome_completo}</p>
                                  <Badge 
                                    variant="outline"
                                    className={`text-[10px] ${
                                      !lead.lido 
                                        ? "bg-green-500 text-white border-green-500" 
                                        : "border-muted-foreground text-muted-foreground"
                                    }`}
                                    onClick={(e) => toggleLeadLido(lead, e)}
                                  >
                                    {lead.lido ? "Lido" : "Novo"}
                                  </Badge>
                                  <ResponseTimer
                                    createdAt={lead.created_at}
                                    firstOpenedAt={lead.first_opened_at}
                                  />
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <Badge 
                                    variant="outline"
                                    className={`text-[10px] ${
                                      tier === "Enterprise+" ? "border-pink-500 text-pink-500 bg-pink-500/10" :
                                      tier === "Enterprise" ? "border-purple-500 text-purple-500 bg-purple-500/10" :
                                      tier === "Large" ? "border-green-500 text-green-500 bg-green-500/10" :
                                      tier === "Medium" ? "border-yellow-500 text-yellow-500 bg-yellow-500/10" :
                                      "border-red-500 text-red-500 bg-red-500/10"
                                    }`}
                                  >
                                    {tierShortLabel(tier)}
                                  </Badge>
                                  <Badge 
                                    className={`text-[10px] cursor-pointer ${sdr === "Rodger" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : sdr === "Caio" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-pink-500/20 text-pink-400 border-pink-500/30"}`}
                                    onClick={(e) => { e.stopPropagation(); toggleSdr(lead); }}
                                  >
                                    {sdr}
                                  </Badge>
                                  {lead.is_duplicate_ip && (
                                    <Badge variant="outline" className="border-orange-500 text-orange-500 bg-orange-500/10 text-[10px] px-1.5 py-0">⚠️ Dup</Badge>
                                  )}
                                  {lead.attribution_source === "bio_recovery" && (
                                    <Badge variant="outline" className="border-violet-400 text-violet-300 bg-violet-500/15 text-[10px] px-1.5 py-0">🔗 Bio</Badge>
                                  )}
                                  {lead.attribution_source === "organic" && (
                                    <Badge variant="outline" className="border-emerald-600 text-emerald-400 bg-emerald-500/10 text-[10px] px-1.5 py-0">🌿 Org</Badge>
                                  )}
                                  {lead.attribution_source === "direct_ad" && (
                                    <Badge variant="outline" className="border-sky-600 text-sky-400 bg-sky-500/10 text-[10px] px-1.5 py-0">📢 Ad</Badge>
                                  )}
                                  {lead.skipped_queue && (
                                    <Badge variant="outline" className="border-secondary text-secondary bg-secondary/10 text-[10px] px-1.5 py-0">
                                      ⚡ Furou a fila
                                    </Badge>
                                  )}
                                  {lead.clicked_whatsapp && (
                                    <Badge variant="outline" className="border-emerald-500 text-emerald-400 bg-emerald-500/10 text-[10px] px-1.5 py-0">
                                      💬 Chamou WhatsApp
                                    </Badge>
                                  )}
                                  {typeof lead.nps_score === "number" && (
                                    <Badge variant="outline" className="border-yellow-500 text-yellow-400 bg-yellow-500/10 text-[10px] px-1.5 py-0">
                                      ⭐ Nota {lead.nps_score}/10
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{lead.mercado}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Operações: {getOperacoesAtivas(lead)}</p>
                                {lead.investimento_faixa && (
                                  <p className="text-xs text-green-500 mt-0.5">💰 {lead.investimento_faixa}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(lead.created_at), "dd/MM", { locale: ptBR })}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {format(new Date(lead.created_at), "HH:mm", { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-3 mt-3 pt-2 border-t border-muted">
                            <button
                              type="button"
                              className="text-green-500 hover:underline text-xs"
                              onClick={(e) => { e.stopPropagation(); void copyWhatsappToClipboard(lead.whatsapp); }}
                            >
                              📱 {lead.whatsapp}
                            </button>
                            <button
                              type="button"
                              className="text-pink-400 hover:underline text-xs"
                              onClick={(e) => { e.stopPropagation(); openInstagramProfile(lead.instagram); }}
                            >
                              📷 {lead.instagram}
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>

              {/* Lead Detail Dialog */}
              <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-xl">Detalhes do Lead</DialogTitle>
                  </DialogHeader>
                  {selectedLead && (
                    <div className="space-y-6 mt-4">
                      {/* Campaign & Ad Attribution - Always visible at top */}
                      <div className="p-4 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-lg border border-purple-500/30">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-purple-400" />
                          Origem do Anúncio
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-3 bg-background/50 rounded-lg">
                            <p className="text-muted-foreground text-[10px] uppercase mb-1">Campanha</p>
                            <p className="font-semibold text-purple-400 text-lg">
                              {(() => {
                                const raw = selectedLead.utm_campaign;
                                const isPlaceholder = raw && /\{\{.*\}\}/.test(raw);
                                if (!isPlaceholder && raw) return raw;
                                return selectedLead.campaign_id
                                  ? `ID: ${selectedLead.campaign_id}`
                                  : "Tráfego Direto";
                              })()}
                            </p>
                          </div>
                          <div className="p-3 bg-background/50 rounded-lg">
                            <p className="text-muted-foreground text-[10px] uppercase mb-1">Anúncio</p>
                            <p className="font-semibold text-blue-400 text-lg">
                              {(() => {
                                const raw = selectedLead.utm_content;
                                const isPlaceholder = raw && /\{\{.*\}\}/.test(raw);
                                if (!isPlaceholder && raw) return raw;
                                return selectedLead.ad_id
                                  ? `ID: ${selectedLead.ad_id}`
                                  : "Não identificado";
                              })()}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <div className="p-2 bg-background/30 rounded text-center">
                            <p className="text-muted-foreground text-[10px] uppercase">Fonte</p>
                            <p className="font-medium text-sm">
                              {(() => {
                                const raw = selectedLead.utm_source;
                                const isPlaceholder = raw && /\{\{.*\}\}/.test(raw);
                                if (!isPlaceholder && raw) return raw;
                                return "direct";
                              })()}
                            </p>
                          </div>
                          <div className="p-2 bg-background/30 rounded text-center">
                            <p className="text-muted-foreground text-[10px] uppercase">Placement</p>
                            <p className="font-medium text-sm">
                              {(() => {
                                const raw = selectedLead.placement;
                                const isPlaceholder = raw && /\{\{.*\}\}/.test(raw);
                                if (!isPlaceholder && raw) return raw;
                                return "-";
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Basic Info */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Nome Completo</p>
                          <p className="text-lg font-semibold">{selectedLead.nome_completo}</p>
                        </div>
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">WhatsApp</p>
                          <button
                            type="button"
                            className="text-lg font-semibold text-green-500 hover:underline text-left"
                            title="Copiar WhatsApp"
                            onClick={() => void copyWhatsappToClipboard(selectedLead.whatsapp)}
                          >
                            {selectedLead.whatsapp}
                          </button>
                        </div>
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Instagram</p>
                          <button
                            type="button"
                            className="text-lg font-semibold text-primary hover:underline text-left"
                            title="Abrir Instagram"
                            onClick={() => openInstagramProfile(selectedLead.instagram)}
                          >
                            {selectedLead.instagram}
                          </button>
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
                        {selectedLead.investimento_faixa && (
                          <div className="p-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg border border-green-500/30">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">💰 Faturamento Mensal</p>
                            <p className="font-semibold text-green-400 text-lg">{selectedLead.investimento_faixa}</p>
                          </div>
                        )}
                        {selectedLead.trafego_faixa && (
                          <div className="p-4 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Investimento em Tráfego (antigo)</p>
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

                      {/* Compromisso WhatsApp */}
                      {(() => {
                        const raw = selectedLead.raw_answers_json;
                        const committed = raw?.compromisso_whatsapp;
                        if (committed === undefined) return null;
                        return (
                          <div className={`p-4 rounded-lg border ${committed ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                            <p className="text-xs text-foreground/60 uppercase tracking-wider mb-1">Compromisso de Resposta (WhatsApp)</p>
                            <p className={`font-semibold text-lg ${committed ? "text-green-400" : "text-red-400"}`}>
                              {committed ? "✅ Sim, se comprometeu" : "❌ Não se comprometeu"}
                            </p>
                          </div>
                        );
                      })()}

                      {(() => {
                        const entries = getQuizEntries(selectedLead);
                        if (entries.length === 0) return null;
                        return (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Respostas do Quiz</p>
                            <div className="grid grid-cols-2 gap-3">
                              {entries.map(([key, value]) => (
                                <div key={key} className="p-4 bg-muted/30 rounded-lg">
                                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{QUIZ_LABELS[key] || key}</p>
                                  <p className="font-medium">{formatQuizValue(value)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Score & Tier (internal) */}
                      {selectedLead && (
                        (() => {
                          const { score: calcScore, tier: calcTier } = recalcLeadScore(selectedLead);
                          return (
                            <div className="flex gap-4 pt-2 border-t">
                              <Badge 
                                variant="outline"
                                className={
                                  calcTier === "Enterprise+" ? "border-pink-500 text-pink-500 bg-pink-500/10" :
                                  calcTier === "Enterprise" ? "border-purple-500 text-purple-500 bg-purple-500/10" :
                                  calcTier === "Large" ? "border-green-500 text-green-500 bg-green-500/10" :
                                  calcTier === "Medium" ? "border-yellow-500 text-yellow-500 bg-yellow-500/10" :
                                  calcTier === "Desqualificado" ? "border-gray-400 text-gray-400 bg-gray-400/10" :
                                  "border-red-500 text-red-500 bg-red-500/10"
                                }
                              >
                                {calcTier}
                              </Badge>
                              <span className="text-sm text-muted-foreground">Score: {calcScore}</span>
                            </div>
                          );
                        })()
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-4 pt-4">
                        <Button
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={() => void copyWhatsappToClipboard(selectedLead.whatsapp)}
                        >
                          Copiar WhatsApp
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => openInstagramProfile(selectedLead.instagram)}
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
              <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-4 mb-4">
                <div className="flex items-center gap-2 col-span-2">
                  <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <Input
                    placeholder="Buscar nome, whatsapp, instagram..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full md:w-64"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-44">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="interacted">Interagiu ✓</SelectItem>
                    <SelectItem value="completed">Completou</SelectItem>
                    <SelectItem value="started">Drop-off</SelectItem>
                    <SelectItem value="entered">Entrou no quiz</SelectItem>
                    <SelectItem value="not_entered">Não entrou</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={buttonFilter} onValueChange={setButtonFilter}>
                  <SelectTrigger className="w-full md:w-40">
                    <SelectValue placeholder="Botão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="start_btn_1">Botão 1 (Hero)</SelectItem>
                    <SelectItem value="start_btn_2">Botão 2 (CTA)</SelectItem>
                    <SelectItem value="start_btn_3">Botão 3 (Mobile)</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={exportCSV} className="col-span-2 md:col-span-1">
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
                          <th className="text-left p-4">Origem</th>
                          <th className="text-left p-4">Dispositivo</th>
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
                          sessions.map((session, index) => {
                            // Determine the origin label
                            const getOriginLabel = () => {
                              if (session.campaign_id || session.ad_id) {
                                return (
                                  <span className="flex items-center gap-1 text-xs">
                                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                                    Meta Ads
                                  </span>
                                );
                              }
                              if (session.gclid) {
                                return (
                                  <span className="flex items-center gap-1 text-xs">
                                    <span className="w-2 h-2 rounded-full bg-red-500" />
                                    Google Ads
                                  </span>
                                );
                              }
                              if (session.utm_source && session.utm_source !== "direct") {
                                return (
                                  <span className="flex flex-col text-xs">
                                    <span className="font-medium">{session.utm_source}</span>
                                    {session.utm_campaign && (
                                      <span className="text-muted-foreground text-[10px] truncate max-w-24">{session.utm_campaign}</span>
                                    )}
                                  </span>
                                );
                              }
                              if (session.referrer) {
                                try {
                                  const url = new URL(session.referrer);
                                  return <span className="text-xs text-muted-foreground">{url.hostname}</span>;
                                } catch {
                                  return <span className="text-xs text-muted-foreground">Referral</span>;
                                }
                              }
                              return <span className="text-xs text-muted-foreground">Direto</span>;
                            };
                            
                            return (
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
                                <td className="p-4">
                                  <div className="flex flex-col">
                                    <span className="font-medium">{session.lead_name || <span className="text-muted-foreground">-</span>}</span>
                                    {session.lead_instagram && (
                                      <span className="text-xs text-muted-foreground">{session.lead_instagram}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4">{getOriginLabel()}</td>
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
                            );
                          })
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

            {/* Daily Reports Tab */}
            <TabsContent value="daily-reports">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <DailyReportsTab />
              </Suspense>
            </TabsContent>

            {/* Campaigns Tab */}
            <TabsContent value="campaigns">
              <div className="space-y-6">
                {/* Actions */}
                <div className="flex flex-wrap gap-4 items-center">
                  <Button variant="outline" onClick={loadCampaignMetrics} disabled={campaignMetricsLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${campaignMetricsLoading ? "animate-spin" : ""}`} />
                    Atualizar
                  </Button>
                </div>

                {campaignMetricsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : campaignMetrics ? (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-2xl font-bold">{campaignMetrics.total_sessions}</p>
                          <p className="text-xs text-muted-foreground">Total de Sessões</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-2xl font-bold">{campaignMetrics.started_quiz}</p>
                          <p className="text-xs text-muted-foreground">Iniciaram Quiz</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-2xl font-bold text-green-500">{campaignMetrics.completed}</p>
                          <p className="text-xs text-muted-foreground">Completaram</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-2xl font-bold">{campaignMetrics.completion_rate.toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">Taxa de Conversão</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Performance by Ad (Top 10) */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="w-5 h-5" />
                          Performance por Anúncio (Top 10)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b bg-muted/50">
                              <tr>
                                <th className="text-left p-4">Anúncio</th>
                                <th className="text-left p-4">Campanha</th>
                                <th className="text-center p-4">Sessões</th>
                                <th className="text-center p-4">Iniciaram</th>
                                <th className="text-center p-4">Completaram</th>
                                <th className="text-center p-4">Taxa</th>
                              </tr>
                            </thead>
                            <tbody>
                              {campaignMetrics.ads.slice(0, 10).map((ad, index) => (
                                <tr key={index} className="border-b hover:bg-muted/30">
                                  <td className="p-4">
                                    <span className="font-medium">{ad.display_name}</span>
                                  </td>
                                  <td className="p-4 text-muted-foreground">
                                    {ad.campaign_display_name}
                                  </td>
                                  <td className="p-4 text-center">{ad.total}</td>
                                  <td className="p-4 text-center">{ad.started}</td>
                                  <td className="p-4 text-center text-green-500 font-medium">{ad.completed}</td>
                                  <td className="p-4 text-center">
                                    <Badge 
                                      variant="outline"
                                      className={
                                        ad.completion_rate >= 50 ? "border-green-500 text-green-500 bg-green-500/10" :
                                        ad.completion_rate >= 20 ? "border-yellow-500 text-yellow-500 bg-yellow-500/10" :
                                        "border-muted-foreground text-muted-foreground"
                                      }
                                    >
                                      {ad.completion_rate.toFixed(1)}%
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                              {campaignMetrics.ads.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                    Nenhum dado de anúncio encontrado
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Performance by Campaign */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Performance por Campanha</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b bg-muted/50">
                              <tr>
                                <th className="text-left p-4">Campanha</th>
                                <th className="text-center p-4">Sessões</th>
                                <th className="text-center p-4">Iniciaram</th>
                                <th className="text-center p-4">Completaram</th>
                                <th className="text-center p-4">Taxa</th>
                              </tr>
                            </thead>
                            <tbody>
                              {campaignMetrics.campaigns.map((campaign, index) => (
                                <tr key={index} className="border-b hover:bg-muted/30">
                                  <td className="p-4">
                                    <span className="font-medium">{campaign.display_name}</span>
                                  </td>
                                  <td className="p-4 text-center">{campaign.total}</td>
                                  <td className="p-4 text-center">{campaign.started}</td>
                                  <td className="p-4 text-center text-green-500 font-medium">{campaign.completed}</td>
                                  <td className="p-4 text-center">
                                    <Badge 
                                      variant="outline"
                                      className={
                                        campaign.completion_rate >= 50 ? "border-green-500 text-green-500 bg-green-500/10" :
                                        campaign.completion_rate >= 20 ? "border-yellow-500 text-yellow-500 bg-yellow-500/10" :
                                        "border-muted-foreground text-muted-foreground"
                                      }
                                    >
                                      {campaign.completion_rate.toFixed(1)}%
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                              {campaignMetrics.campaigns.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                    Nenhum dado de campanha encontrado
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Performance by Source */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Performance por Fonte</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b bg-muted/50">
                              <tr>
                                <th className="text-left p-4">Fonte</th>
                                <th className="text-center p-4">Sessões</th>
                                <th className="text-center p-4">Completaram</th>
                              </tr>
                            </thead>
                            <tbody>
                              {campaignMetrics.sources.map((source, index) => (
                                <tr key={index} className="border-b hover:bg-muted/30">
                                  <td className="p-4">
                                    <span className="font-medium">{source.utm_source}</span>
                                  </td>
                                  <td className="p-4 text-center">{source.total}</td>
                                  <td className="p-4 text-center text-green-500 font-medium">{source.completed}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    Nenhum dado encontrado para o período selecionado
                  </div>
                )}
              </div>
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

            {/* Criativos Tab */}
            <TabsContent value="creatives">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <CreativesTab 
                  fetchAdminData={fetchAdminData}
                  startDateOnly={startDateOnly}
                  endDateOnly={endDateOnly}
                  startISO={startISO}
                  endISO={endISO}
                  funnelMetrics={metrics ? {
                    visitors: metrics.has_reliable_ip_data ? metrics.unique_visitors : metrics.total_visitors,
                    sessions: metrics.total_visitors,
                    entered_quiz: metrics.entered_quiz,
                    completed: metrics.completed,
                    conversion_rate: Number(metrics.conversion_rate) || 0,
                    step_funnel: metrics.step_funnel || [],
                  } : null}
                />
              </Suspense>
            </TabsContent>

            {/* Métricas Funil Tab */}
            <TabsContent value="funnel-metrics">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <FunnelMetricsTab
                  fetchAdminData={fetchAdminData}
                  funnelMetrics={metrics ? {
                    visitors: metrics.has_reliable_ip_data ? metrics.unique_visitors : metrics.total_visitors,
                    sessions: metrics.total_visitors,
                    entered_quiz: metrics.entered_quiz,
                    completed: metrics.completed,
                    conversion_rate: Number(metrics.conversion_rate) || 0,
                    step_funnel: metrics.step_funnel || [],
                  } : null}
                />
              </Suspense>
            </TabsContent>

            {/* Relatórios Lead Tab */}
            <TabsContent value="reports">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <LeadReportsTab leads={leads} loading={leadsLoading} />
              </Suspense>
            </TabsContent>

            {/* Kommo Tab */}
            <TabsContent value="kommo">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <KommoLogsPanel />
              </Suspense>
            </TabsContent>

            {/* Insights (Rules Engine) Tab */}
            {/* AI Proposals — Approval Gate */}
            <TabsContent value="ai-proposals">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <AiProposalsTab />
              </Suspense>
            </TabsContent>

          </Tabs>



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
                                  {(() => {
                                    const tier = getLeadTier(lead);
                                    return (
                                      <Badge 
                                        variant="outline"
                                        className={
                                          tier === "Enterprise+" ? "border-pink-500 text-pink-500 bg-pink-500/10" :
                                          tier === "Enterprise" ? "border-purple-500 text-purple-500 bg-purple-500/10" :
                                          tier === "Large" ? "border-green-500 text-green-500 bg-green-500/10" :
                                          tier === "Medium" ? "border-yellow-500 text-yellow-500 bg-yellow-500/10" :
                                          "border-red-500 text-red-500 bg-red-500/10"
                                        }
                                      >
                                        {tier}
                                      </Badge>
                                    );
                                  })()}
                                  {!lead.lido && (
                                    <Badge className="bg-green-500 text-white">Novo</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                  <span>{lead.mercado}</span>
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
                            <button
                              type="button"
                              className="text-sm text-green-500 hover:underline"
                              title="Copiar WhatsApp"
                              onClick={(e) => {
                                e.stopPropagation();
                                void copyWhatsappToClipboard(lead.whatsapp);
                              }}
                            >
                              {lead.whatsapp}
                            </button>
                            <button
                              type="button"
                              className="text-sm text-primary hover:underline"
                              title="Abrir Instagram"
                              onClick={(e) => {
                                e.stopPropagation();
                                openInstagramProfile(lead.instagram);
                              }}
                            >
                              {lead.instagram}
                            </button>
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
