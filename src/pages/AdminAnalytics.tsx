import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
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
import { assinarAoVivo, assinarStatusAoVivo, avisarAoVivo, type EventoAoVivo } from "@/lib/aoVivo";
import { aplicarTema, guardarTema, lerTema, soltarTema, type Tema } from "@/lib/tema";
import GoogleCalendarCard from "@/components/admin/GoogleCalendarCard";
import PageVariantFilter, { ALL_PAGES } from "@/components/admin/PageVariantFilter";
import CreativeFilter, { ALL_CREATIVES, type CreativeOption } from "@/components/admin/CreativeFilter";

const PAGE_FILTER_KEY = "champion_admin_page_filter";
const CREATIVE_FILTER_KEY = "champion_admin_creative_filter";
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
  Sun,
  Moon,
  CalendarDays,
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
import { useLeadNotifications } from "@/hooks/useLeadNotifications";
import { bandColorClass } from "@/lib/leadScoring";
import { calcularNotaPorVersao, linhasDoBreakdown } from "@/lib/leadScore";
import { ehHighQualityLead, limiarHql } from "@/lib/hql";
import { DECISAO_OPCOES } from "@/lib/funis";
import { QualificacaoProspeccao } from "@/components/admin/QualificacaoProspeccao";
import { variantShortLabel } from "@/config/subheadlineVariants";
import { NotificationsPopover } from "@/components/admin/NotificationsPopover";
import { AvisoNotificacoes, ReinstalarAppDialog } from "@/components/admin/AvisoNotificacoes";
import { useAtualizacaoSistema } from "@/hooks/useAtualizacaoSistema";
import { DailyReportReminder } from "@/components/admin/DailyReportReminder";
import { AcoesRapidasCrm } from "@/components/admin/AcoesRapidasCrm";
import { FiltroFilaCrm } from "@/components/admin/FiltroFilaCrm";
import { ShellAdmin } from "@/components/admin/ShellAdmin";
import { ResponseTimer } from "@/components/admin/ResponseTimer";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ADMIN_AUTH_EXPIRED_EVENT, ADMIN_TOKEN_KEY, clearAdminToken, fetchAdmin, getAdminToken, isAdminTokenExpired } from "@/lib/adminAuth";
import { runPooled, type RequestPriority } from "@/lib/requestPool";
import { cacheKey, getCached, getInFlight, invalidateAdminCache, setCached, trackInFlight, ttlFor, whenIdle, recordTiming, peekCached, clearPersistedCache, CACHE_REVALIDATED_EVENT } from "@/lib/adminCache";
import { resolverOrigemAnuncio } from "@/lib/origemAnuncio";
import { useCrmAcoes } from "@/hooks/useCrmAcoes";
import { CelulaCrm } from "@/components/admin/CelulaCrm";

const KommoLogsPanel = lazy(() => import("@/components/admin/KommoLogsPanel"));

const AquisicaoTab = lazy(() => import("@/components/admin/AquisicaoTab"));
const CreativesTab = lazy(() => import("@/components/admin/CreativesTab"));
const FunnelMetricsTab = lazy(() => import("@/components/admin/FunnelMetricsTab"));
const LeadReportsTab = lazy(() => import("@/components/admin/LeadReportsTab"));
const DailyReportsTab = lazy(() => import("@/components/admin/DailyReportsTab"));
const InsightsTab = lazy(() => import("@/components/admin/InsightsTab"));
const AiProposalsTab = lazy(() => import("@/components/admin/AiProposalsTab"));
const DirectTab = lazy(() => import("@/components/admin/DirectTab"));
const WhatsAppTab = lazy(() => import("@/components/admin/WhatsAppTab"));
const AgentesTab = lazy(() => import("@/components/admin/AgentesTab"));
const EsteiraTab = lazy(() => import("@/pages/Esteira"));
const CommercialGoalsTab = lazy(() => import("@/components/admin/CommercialGoalsTab"));
const LeadJourneyPanel = lazy(() => import("@/components/admin/LeadJourneyPanel"));
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Metrics {
  // null = sem sinal de tracking confiável pro período (ver visitors_known/entered_quiz_known).
  // O front NÃO deve tratar null como 0 — precisa mostrar um estado "sem dados" explícito.
  total_visitors: number | null;
  unique_visitors: number | null;
  has_reliable_ip_data: boolean;
  ip_coverage_percent: number;
  entered_quiz: number | null;
  started_quiz: number | null;
  completed: number;
  conversion_rate: string | number | null;
  completion_rate: string | number | null;
  visitors_known: boolean;
  entered_quiz_known: boolean;
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
  quiz_v2_empty?: boolean;
  quiz_v1_present?: boolean;
  /** Existe algum sinal real de início (evento quiz_view ou a flag da sessão). */
  started_quiz_known?: boolean;
  /**
   * Qual formulário o período viu (17/09/2026). "form_curto" é uma tela só e
   * não tem funil por etapa — estado diferente de "sem dados".
   */
  quiz_flow?: "form_curto" | "quiz_v2" | "misto" | "desconhecido";
  sessoes_form_curto?: number;
  sessoes_outro_quiz?: number;
  /** Criativos do período (utm_content normalizado) — alimenta o filtro global. */
  creatives_available?: { content: string; sessions: number }[];
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
  /* Estado do CRM, vindo da view `lead_fila` pela rota /leads. É a MESMA fonte
     que a fila comercial usa — a lista e a fila nunca podem discordar sobre o
     que fazer com o mesmo lead. */
  crm_estado?: string | null;
  crm_bucket?: string | null;
  crm_tentativas?: number | null;
  crm_ultima_interacao_at?: string | null;
  crm_ultima_direcao?: string | null;
  crm_proxima_acao_at?: string | null;
  crm_proxima_acao_owner?: string | null;
  crm_sla_estourado?: boolean | null;
  crm_desfecho_pendente?: boolean | null;
  crm_teve_no_show?: boolean | null;
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
  /**
   * Qual formula gerou o `score`. Manda no corte de HQL: 73 no quiz (v2.3, e
   * em todo lead historico, onde a coluna e nula), 67 no formulario curto
   * (v3-form). Ver `src/lib/hql.ts`.
   */
  score_version?: string | null;
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
  campaign_name_resolved?: string | null;
  ad_name_resolved?: string | null;
  creative_name_resolved?: string | null;
  // O backend já manda estes quatro (admin-data/index.ts:590-594), resolvidos
  // por `ad_id` no cache da Meta. Faltava só declará-los para a tela poder usar.
  adset_id_resolved?: string | null;
  adset_name_resolved?: string | null;
  ad_account_id_resolved?: string | null;
  account_name_resolved?: string | null;
  // Origem resolvida pela sessão (ver `attribution.ts` no backend): a página de
  // entrada — que é a variante do teste A/B — e por qual método o lead foi
  // casado com a navegação dele.
  entry_page?: string | null;
  attribution_method?: "submit" | "fbp" | "ip" | null;
  /** O criativo não veio no link: foi recuperado da sessão. */
  utm_content_recovered?: boolean;
  utm_campaign_recovered?: boolean;
  creative_thumbnail_url_resolved?: string | null;
  placement: string | null;
  site_source_name: string | null;
  sdr_override: string | null;
  /**
   * Quem mais participa da decisão de contratar (experimento de 07/09/2026).
   * Perguntado pelo SDR na conversa, ANTES de existir reunião. Não pontua, não
   * define MQL, não desqualifica: é coleta para testar se a ausência do segundo
   * decisor explica a faixa que agenda bem e fecha mal.
   */
  decisao_processo?: string | null;
  decisor: boolean | null;
  raw_answers_json: Record<string, unknown> | null;
  attribution_source: string | null;
  /** site, direct ou prospeccao (garimpo do Instagram, 24/10/2026). */
  origem_lead?: string | null;
  first_opened_at: string | null;
  skipped_queue?: boolean | null;
  skipped_queue_at?: string | null;
  clicked_whatsapp?: boolean | null;
  clicked_whatsapp_at?: string | null;
  /** Quando o lead foi CHAMADO. Para o relógio do SLA de 5 minutos. */
  contacted_at?: string | null;
  contacted_by?: string | null;
  sla_breached_at?: string | null;
  nps_score?: number | null;
}

const QUIZ_LABELS: Record<string, string> = {
  quer_vender_mais: "Quer vender mais?",
  operacoes_ativas: "Operações ativas",
  nps_score: "Entendimento do site (0 = não leu · 5 = leu e não entendeu · 10 = leu e entendeu)",
  compromisso_whatsapp: "Compromisso WhatsApp",
  aceita_call_diagnostico: "Aceita call de diagnóstico",
  lgpd: "Aceitou Lei Geral de Proteção de Dados",
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
  const {
    notificationsEnabled, pushSubscribed, subscriberCount, toggleNotifications,
    testNotifications, sendWebPush,
    pessoa: pessoaDoPush, definirPessoa: definirPessoaDoPush,
    instalado: appInstalado, ios: ehIphone,
    permissionState, dispositivos, atualizarDispositivos, podeInstalar, instalarApp, removerDispositivo,
  } = useLeadNotifications(
    isAuthenticated,
    handleNewLead,
    handleAuthError
  );
  // Versão nova do sistema: recarrega sozinho ou avisa no topo.
  const atualizacao = useAtualizacaoSistema(isAuthenticated);

  /**
   * Tema do painel.
   *
   * Aplicado ao entrar e SOLTO ao sair: a landing e o quiz são escuros por
   * desenho, e deixar o atributo no <html> os levaria junto.
   */
  const [tema, setTema] = useState<Tema>(() => lerTema());
  useEffect(() => {
    aplicarTema(tema);
    return () => soltarTema();
  }, [tema]);
  const alternarTema = useCallback(() => {
    setTema((t) => {
      const proximo: Tema = t === "claro" ? "escuro" : "claro";
      guardarTema(proximo);
      return proximo;
    });
  }, []);

  // Agenda do Google: o diálogo de configuração e a bolinha de status no botão.
  const [agendaAberta, setAgendaAberta] = useState(false);
  const [agendaConectada, setAgendaConectada] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    let vivo = true;
    (async () => {
      try {
        const res = await fetchAdmin(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar/status`);
        const j = await res.json();
        if (vivo) setAgendaConectada(j?.integracao?.status === "connected");
      } catch {
        if (vivo) setAgendaConectada(null);
      }
    })();
    return () => { vivo = false; };
    // Reconsulta ao fechar o diálogo: é lá que a pessoa conecta ou desconecta.
  }, [isAuthenticated, agendaAberta]);

  // Conexão do tempo real, visível na tela. Sem isto, "não atualizou para o
  // outro" é indistinguível de "o canal caiu" — e as duas coisas pedem ações
  // diferentes: uma é bug, a outra é dar F5.
  const [aoVivoOk, setAoVivoOk] = useState(false);
  useEffect(() => assinarStatusAoVivo(setAoVivoOk), []);

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
  /**
   * Balde da fila comercial escolhido nos chips, e a ORDEM dele.
   *
   * Moram aqui em cima, e não junto da função que os preenche, porque
   * `filteredLeads` os lê bem antes — e no React uma const declarada depois do
   * uso é erro de execução, não aviso do editor.
   */
  const [filaBalde, setFilaBalde] = useState<string | null>(null);
  const [filaOrdem, setFilaOrdem] = useState<Map<string, number> | null>(null);
  /** Muda a cada ação de CRM: só as contagens dos chips são refeitas. */
  const [filaVersao, setFilaVersao] = useState(0);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  /** Id do lead cujo detalhe está sendo buscado. O modal abre com ele, antes de
   *  a resposta chegar — clique que não pinta nada parece clique quebrado. */
  const [leadCarregando, setLeadCarregando] = useState<string | null>(null);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);
  const [leadsUnreadCount, setLeadsUnreadCount] = useState(0);
  const [leadsSearchQuery, setLeadsSearchQuery] = useState("");
  
  // Leads filters
  const [leadsStatusFilter, setLeadsStatusFilter] = useState<string>("all");
  const [leadsMercadoFilter, setLeadsMercadoFilter] = useState<string>("all");
  
  const [leadsTierFilter, setLeadsTierFilter] = useState<string>("all");
  const [leadsSdrFilter, setLeadsSdrFilter] = useState<string>("all");
  const [leadsAdsetFilter, setLeadsAdsetFilter] = useState<string>("all");
  const [leadsConversionFilter, setLeadsConversionFilter] = useState<string>("all");
  const [leadsAttributionFilter, setLeadsAttributionFilter] = useState<string>("all");
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
  //
  // Regra a partir de 14/08/2026: **Miguel atende todas as faixas com SDR.**
  // O Gustavo saiu, e a faixa de faturamento passou a decidir só a PÁGINA de
  // obrigado (Sprint x MQL), que é produto, não pessoa.
  //
  // O corte por data existe de propósito: sem ele, todo lead antigo do Gustavo
  // passaria a aparecer como Miguel (o SDR é calculado na hora, não gravado) e
  // a conversão histórica por SDR viraria ficção.
  const SDR_MIGUEL_ONLY_FROM = "2026-08-14";
  const GUSTAVO_FAIXAS = ["Não vendo ainda (R$0/mês)", "Até R$ 5 mil", "De R$ 5 mil a R$ 10 mil"];
  const MIGUEL_FAIXAS = [
    "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
    "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
    "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
    "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
    "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
    "Acima de R$ 10 milhões",
  ];
  // Faixas que disparam SDR. Leads "Direct" não geram alerta.
  const SDR_CAIO_FAT = [...GUSTAVO_FAIXAS, ...MIGUEL_FAIXAS];
  const isLegacySdrLead = (lead: Lead) => (lead.created_at || "") < SDR_MIGUEL_ONLY_FROM;
  const getLeadSdr = (lead: Lead): string => {
    const faixa = lead.investimento_faixa || "";
    const hasSdr = MIGUEL_FAIXAS.includes(faixa) || GUSTAVO_FAIXAS.includes(faixa);
    if (lead.sdr_override) {
      // Migrate legacy overrides
      if (lead.sdr_override === "Rodger" || lead.sdr_override === "Caio") {
        // Caio virou closer — recalcula com base no faturamento
        if (!hasSdr) return "Direct";
        return isLegacySdrLead(lead) && GUSTAVO_FAIXAS.includes(faixa) ? "Gustavo" : "Miguel";
      }
      if (lead.sdr_override === "Dara") return "Miguel";
      // Override "Gustavo" só sobrevive no histórico; em lead novo cai pro Miguel.
      if (lead.sdr_override === "Gustavo" && !isLegacySdrLead(lead)) return "Miguel";
      return lead.sdr_override;
    }
    if (!hasSdr) return "Direct";
    if (isLegacySdrLead(lead) && GUSTAVO_FAIXAS.includes(faixa)) return "Gustavo";
    return "Miguel";
  };

  /**
   * Grava "quem mais decide" no lead. Clicar de novo na mesma opção limpa.
   *
   * Mora aqui, e não no registro da reunião, porque o time registra a reunião
   * quase sempre DEPOIS que ela aconteceu (27 das 32 sem data de call), e a
   * informação precisa existir antes, para o SDR saber que a call pede o sócio.
   */
  const setDecisaoLead = async (lead: Lead, valor: string) => {
    const anterior = lead.decisao_processo ?? null;
    const novo = anterior === valor ? null : valor;
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, decisao_processo: novo } : l));
    setSelectedLead(prev => (prev && prev.id === lead.id ? { ...prev, decisao_processo: novo } : prev));
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data/leads/${lead.id}`;
      const res = await fetchAdmin(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao_processo: novo }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, decisao_processo: anterior } : l));
      setSelectedLead(prev => (prev && prev.id === lead.id ? { ...prev, decisao_processo: anterior } : prev));
      toast({ title: "Erro ao salvar quem decide", variant: "destructive" });
    }
  };

  // Com um SDR só, não há entre quem alternar. Mantido para reatribuir lead
  // histórico do Gustavo pro Miguel com um clique.
  const toggleSdr = async (lead: Lead) => {
    const currentSdr = getLeadSdr(lead);
    if (currentSdr === "Direct" || currentSdr === "Miguel") return;
    const newSdr = "Miguel";
    
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


  // Persistent tab state
  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem("admin_active_tab") || "leads";
  });

  /**
   * Aquecimento das abas.
   *
   * Cada aba só montava quando era clicada, e aí começava a baixar o chunk e a
   * buscar os dados — segundos olhando um spinner, toda vez. Com o prewarm, as
   * abas pesadas ficam montadas (escondidas) assim que a tela principal
   * termina: quando o clique vem, o conteúdo já está pronto.
   *
   * Espera a ociosidade de propósito — a fila de requisições do admin é serial,
   * e aquecer cedo demais atrasaria a aba que o usuário está olhando.
   */
  const [prewarmTabs, setPrewarmTabs] = useState(false);

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

  // Tique suave a cada 5s enquanto houver lead esperando ser CHAMADO.
  //
  // Era este o "plim" sem lead nenhum para chamar (03/09/2026). O tique olhava
  // a lista FILTRADA e o `first_opened_at`: com o filtro em "últimos 14 dias",
  // qualquer lead antigo cujo card ninguém abriu mantinha o som ligado para
  // sempre, a cada cinco segundos, sem que existisse nada para fazer.
  //
  // Duas mudanças, e as duas são a mesma ideia: o tique só pode falar do que
  // precisa de ação AGORA.
  //   1. Só lead de HOJE. O filtro de data é para análise; a fila de chamada
  //      não muda porque alguém abriu o relatório da quinzena.
  //   2. `contacted_at`, não `first_opened_at`. Abrir o card não é chamar. É o
  //      botão "Chamei" que para o som, do mesmo jeito que para o relógio do SLA.
  const inicioDeHoje = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const pendingLeadsCount = leads.filter((l) => {
    if (l.contacted_at) return false;
    if (!l.investimento_faixa || !SDR_CAIO_FAT.includes(l.investimento_faixa)) return false;
    const t = Date.parse(l.created_at);
    return Number.isFinite(t) && t >= inicioDeHoje;
  }).length;
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
        // Ler o lead É chamar o lead. Decisão do Rodger em 04/09/2026: o botão
        // "Chamei" separado saiu, e o carimbo de contato vai junto com o de
        // lido. É esse carimbo que para o relógio do SLA e o tique do painel.
        body: JSON.stringify(lido
          ? { lido, mark_contacted: true, contacted_by: pessoaDoPush || "Painel" }
          : { lido }),
      });

      if (!response.ok) {
        throw new Error("Failed to update lead");
      }
      // Avisa os outros painéis DEPOIS de o banco confirmar. Avisar antes faria
      // a tela do Caio mostrar como lido um lead que a gravação recusou.
      avisarAoVivo({ tipo: "lead_lido", lead_id: id, lido, por: pessoaDoPush || "alguém" });
      if (lido) avisarAoVivo({ tipo: "lead_contato", lead_id: id, por: pessoaDoPush || "alguém" });
    } catch (error) {
      console.error("Error updating lead lido:", error);
    }
  };

  const toggleLeadLido = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    const newLido = !lead.lido;
    const agora = new Date().toISOString();
    // Optimistic update — lido para true carrega o contato junto.
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id
        ? { ...l, lido: newLido, ...(newLido && !l.contacted_at ? { contacted_at: agora, contacted_by: pessoaDoPush || "Painel" } : {}) }
        : l))
    );
    setLeadsUnreadCount((prev) => newLido ? Math.max(0, prev - 1) : prev + 1);
    // Update backend
    updateLeadLido(lead.id, newLido);
  };


  /**
   * Abre o detalhe de um lead vindo da FILA.
   *
   * A fila é global no tempo e a lista `leads` é filtrada pelo período do
   * cabeçalho, então o lead da fila muitas vezes não está na lista. O modal abre
   * NA HORA, com esqueleto, e o conteúdo entra quando a resposta chega — a
   * espera existe de qualquer jeito, e o que não pode existir é o clique que não
   * pinta nada.
   */
  const abrirLeadPorId = async (id: string) => {
    const naLista = leads.find((l) => l.id === id);
    if (naLista) { openLeadDetail(naLista); return; }

    setErroDetalhe(null);
    setSelectedLead(null);
    setLeadCarregando(id);
    try {
      const data = await fetchAdminData("/leads", { ids: id });
      const achado = (data as Lead[] | null)?.[0];
      if (!achado) { setErroDetalhe("Lead não encontrado."); return; }
      // Entra na lista para o próximo clique não buscar de novo e para o modal
      // receber as atualizações locais (lido, contacted_at) como qualquer outro.
      setLeads((prev) => (prev.some((l) => l.id === achado.id) ? prev : [achado, ...prev]));
      setLeadCarregando(null);
      openLeadDetail(achado);
    } catch (e) {
      setErroDetalhe(e instanceof Error ? e.message : "Não foi possível carregar o lead.");
    }
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

    // Lead já lido antes desta regra existir, mas nunca carimbado como
    // chamado: abrir agora carimba, senão ele ficaria escalando no SLA para
    // sempre mesmo depois de atendido.
    if (lead.lido && !lead.contacted_at) {
      const agora = new Date().toISOString();
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, contacted_at: agora, contacted_by: pessoaDoPush || "Painel" } : l)));
      (async () => {
        try {
          await fetchAdmin(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data/leads/${lead.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mark_contacted: true, contacted_by: pessoaDoPush || "Painel" }),
          });
          avisarAoVivo({ tipo: "lead_contato", lead_id: lead.id, por: pessoaDoPush || "alguém" });
        } catch (e) {
          console.error("[contato] falha ao carimbar:", e);
        }
      })();
    }

    // Mark as read and update immediately in the list
    if (!lead.lido) {
      // Update the leads list immediately (optimistic update)
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id
          ? { ...l, lido: true, first_opened_at: l.first_opened_at || new Date().toISOString(), contacted_at: l.contacted_at || new Date().toISOString(), contacted_by: l.contacted_by || pessoaDoPush || "Painel" }
          : l))
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
        // O corpo do 422 traz a recusa da guarda de histórico comercial, com
        // quantos registros cada lead tem. Antes isto era engolido e a tela
        // dizia só "Erro ao excluir leads" — o vendedor não descobria que o
        // caminho é marcar como perdido, e tentava de novo.
        const corpo = await response.json().catch(() => null);
        throw new Error(corpo?.error || "Não foi possível excluir os leads.");
      }

      return true;
    } catch (error) {
      console.error("Error deleting leads:", error);
      toast({
        title: "Exclusão recusada",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
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
      // O DELETE é um fetch direto, fora do fetchAdminData, então nada limpava o
      // cache: a lista guardada (memória + sessionStorage) ainda tinha os leads
      // e eles voltavam na próxima leitura de /leads. O banco já tinha apagado;
      // era a tela ressuscitando o que não existe mais (14/09/2026).
      invalidateAdminCache();
      avisarAoVivo({ tipo: "lead_excluido", lead_ids: ids, por: pessoaDoPush || "alguém" });
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
    }
    // O toast de falha sai do próprio `deleteLeads`, com o motivo real vindo do
    // backend. Um segundo aviso genérico aqui só escondia o primeiro.
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

  // Get unique values for filter dropdowns
  const uniqueMercados = [...new Set(leads.map(l => l.mercado))].filter(Boolean).sort();
  
  const TIER_ORDER = ["Enterprise+", "Enterprise", "Large", "Medium", "Small", "Desqualificado"];
  const uniqueTiers = TIER_ORDER.filter(t => leads.some(l => getLeadTier(l) === t));
  const uniqueAdsets = [...new Set(leads.map(l => l.utm_content).filter(Boolean) as string[])].sort();

  const filteredLeadsBase = leads.filter((lead) => {
    // Balde da fila escolhido nos chips: manda em tudo, inclusive no período.
    if (filaOrdem && !filaOrdem.has(lead.id)) return false;

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
      if (leadsSdrFilter === "direct" && sdr !== "Direct") return false;
      if (leadsSdrFilter === "gustavo" && sdr !== "Gustavo") return false;
      if (leadsSdrFilter === "miguel" && sdr !== "Miguel") return false;
      // legacy "caio" filter still supported for back-compat
      if (leadsSdrFilter === "caio" && sdr !== "Gustavo" && sdr !== "Miguel") return false;
    }
    
    // Adset (conjunto de anúncio / criativo) filter
    if (leadsAdsetFilter !== "all" && lead.utm_content !== leadsAdsetFilter) return false;

    // Caminho de atribuição: veio direto do anúncio, recuperado (mesmo IP, ex.
    // Instagram/bio) ou orgânico sem nenhum sinal de anúncio
    if (leadsAttributionFilter === "prospeccao") {
      if (lead.origem_lead !== "prospeccao") return false;
    } else if (leadsAttributionFilter !== "all" && (lead.attribution_source || "organic") !== leadsAttributionFilter) return false;

    // Conversion filter (reunião agendada / venda)
    if (leadsConversionFilter === "with_meeting" && !meetingLeadIds.has(lead.id)) return false;
    if (leadsConversionFilter === "with_sale" && !saleLeadIds.has(lead.id)) return false;
    if (leadsConversionFilter === "with_any" && !meetingLeadIds.has(lead.id) && !saleLeadIds.has(lead.id)) return false;
    if (leadsConversionFilter === "none" && (meetingLeadIds.has(lead.id) || saleLeadIds.has(lead.id))) return false;

    // Date filtering is now done server-side in loadLeads
    
    return true;
  });

  /**
   * Com um balde ativo a ordem é a DA FILA — mais antigo primeiro, que é o
   * critério da view `lead_fila`. A nota aparece na linha e não muda posição
   * nenhuma: fila ordenada por score é fila que nunca chega no lead antigo.
   */
  const filteredLeads = filaOrdem
    ? [...filteredLeadsBase].sort(
        (a, b) => (filaOrdem.get(a.id) ?? 0) - (filaOrdem.get(b.id) ?? 0),
      )
    : filteredLeadsBase;

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
    // O cache guarda WhatsApp, e-mail e faturamento de lead. Sair do painel tem
    // que levar isso junto, senão o dado fica na aba para o próximo que sentar.
    clearPersistedCache();
    invalidateAdminCache();
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

  // Filtro global de variante de headline. Persistido em localStorage pra
  // sobreviver ao reload, como o filtro de datas.
  const [pageFilter, setPageFilter] = useState<string>(() => {
    try { return localStorage.getItem(PAGE_FILTER_KEY) || ALL_PAGES; } catch { return ALL_PAGES; }
  });
  const pageFilterRef = useRef(pageFilter);
  pageFilterRef.current = pageFilter;
  const changePageFilter = (next: string) => {
    setPageFilter(next);
    try { localStorage.setItem(PAGE_FILTER_KEY, next); } catch { /* ignore */ }
  };

  const [creativeFilter, setCreativeFilter] = useState<string>(() => {
    try { return localStorage.getItem(CREATIVE_FILTER_KEY) || ALL_CREATIVES; } catch { return ALL_CREATIVES; }
  });
  const creativeFilterRef = useRef(creativeFilter);
  creativeFilterRef.current = creativeFilter;
  const changeCreativeFilter = (next: string) => {
    setCreativeFilter(next);
    try { localStorage.setItem(CREATIVE_FILTER_KEY, next); } catch { /* ignore */ }
  };

  // IMPORTANT: keep a stable identity for fetchAdminData.
  // Esta função é passada como prop para tabs (CreativesTab etc.) cujos
  // useCallback/useEffect dependem dela. Sem useCallback, uma nova referência
  // a cada render do AdminAnalytics dispara refetch em loop (ex: lista de
  // reuniões piscando "abre/carrega/fecha"). Como ela só usa refs e helpers
  // estáveis, é seguro memoizar com deps vazias.
  const fetchAdminData = useCallback(async (
    path: string,
    params?: Record<string, string>,
    priority: RequestPriority = "user",
  ) => {
    // Escrita (POST/DELETE via _method) nunca é cacheada, e derruba o cache
    // inteiro: registrar uma venda muda métrica, funil, margem e meta de uma vez.
    const isWrite = !!params?._method;
    if (isWrite) {
      // Registrar venda ou reunião muda métrica, funil, margem e meta de uma
      // vez — aí o cache inteiro tem que cair. Já salvar as PREMISSAS do plano
      // não muda dado nenhum do banco: é configuração da própria aba. Derrubar
      // tudo a cada tecla digitada faria o autosave recarregar o painel
      // inteiro, o oposto do que se quer.
      const SO_AFETA_A_SI = ["/commercial-plan"];
      if (SO_AFETA_A_SI.includes(path)) invalidateAdminCache(path);
      else invalidateAdminCache();
    }

    // Chave estável para leitura, já com os filtros globais aplicados — dois
    // pedidos com a mesma página e criativo têm que bater na mesma entrada.
    const readKey = isWrite ? null : cacheKey(path, {
      ...(params || {}),
      ...(!params?.page && pageFilterRef.current !== ALL_PAGES ? { page: pageFilterRef.current } : {}),
      ...(!params?.creative && creativeFilterRef.current !== ALL_CREATIVES ? { creative: creativeFilterRef.current } : {}),
    });
    // O cache tem duas bordas. Aqui trata-se só a primeira, porque a segunda
    // (servir dado velho e revalidar) precisa de `run`, declarado abaixo.
    const hit = readKey ? peekCached(readKey) : undefined;
    if (readKey) {
      if (hit?.state === "fresco") {
        recordTiming({ path, ms: 0, bytes: 0, cached: true, at: Date.now() });
        return hit.value;
      }
      // Mesma requisição já em voo (a lista pediu e o prefetch também): espera
      // a que existe em vez de abrir uma segunda.
      const flying = getInFlight(readKey);
      if (flying) return flying;
    }

    // Antes daqui havia uma fila de UM lugar só: toda requisição do admin
    // esperava a anterior terminar, então uma tela com quatro rotas custava a
    // soma das quatro. Agora são quatro vagas simultâneas com prioridade, e a
    // tela custa a rota mais lenta. Ver `runPooled`.
    const run = async () => runPooled(async () => {
    try {
      if (logoutFiredRef.current) {
        throw new Error("Sessão expirada");
      }
      
      // Filtro global de variante de headline: entra em TODA requisição do
      // admin, então funil do site, funil do quiz, análise semanal e
      // comportamento da landing falam sempre da mesma população. Endpoints
      // que não sabem filtrar por página simplesmente ignoram o parâmetro.
      const mergedParams: Record<string, string> = { ...(params || {}) };
      if (!mergedParams.page && pageFilterRef.current !== ALL_PAGES) {
        mergedParams.page = pageFilterRef.current;
      }
      if (!mergedParams.creative && creativeFilterRef.current !== ALL_CREATIVES) {
        mergedParams.creative = creativeFilterRef.current;
      }
      const queryString = Object.keys(mergedParams).length
        ? "?" + new URLSearchParams(mergedParams).toString()
        : "";
      
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
          const t0 = performance.now();
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
            const msg = error.error || "Erro ao carregar dados";
            // Recusa do servidor (400–499) é decisão, não falha de rede.
            // Repetir três vezes um Abóbora incompleto só atrasa o aviso de que
            // falta preencher, e é isso que a tela precisa mostrar na hora.
            if (fetchResponse.status >= 400 && fetchResponse.status < 500) {
              const recusa = new Error(msg);
              recusa.name = "RecusadoPeloServidor";
              throw recusa;
            }
            throw new Error(msg);
          }

          const corpo = await fetchResponse.text();
          recordTiming({
            path,
            ms: performance.now() - t0,
            bytes: corpo.length,
            cached: false,
            at: Date.now(),
          });
          return corpo ? JSON.parse(corpo) : null;
        } catch (error) {
          if (error instanceof Error && error.message === "Sessão expirada") {
            throw error;
          }
          if (error instanceof Error && error.name === "RecusadoPeloServidor") {
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
      // nada a liberar: o pool devolve a vaga sozinho ao terminar
    }
    }, priority);

    if (!readKey) return run();

    // Velho mas ainda utilizável: devolve JÁ o que se tem e busca o novo por
    // baixo. A tela pinta instantânea com o dado da visita anterior e se
    // corrige sozinha quando a resposta chega — é daqui que vem quase todo o
    // ganho percebido depois de um F5.
    if (hit?.state === "velho") {
      recordTiming({ path, ms: 0, bytes: 0, cached: true, at: Date.now() });
      const revalidando = run()
        .then((data) => {
          // `true` avisa a tela: quem estiver mostrando esta rota se atualiza.
          setCached(readKey, data, ttlFor(path), true);
          return data;
        })
        .catch(() => hit.value);
      trackInFlight(readKey, revalidando);
      return hit.value;
    }

    const promise = run().then((data) => {
      setCached(readKey, data, ttlFor(path));
      return data;
    });
    return trackInFlight(readKey, promise);
    // pageFilter entra nas deps de propósito: trocar a variante muda a
    // identidade de fetchAdminData e faz todo componente que a usa recarregar.
  }, [pageFilter, creativeFilter]);

  // Aba visível no momento, lida no instante da requisição (não nas deps).
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  /**
   * Fetch dedicado a uma aba: prioridade de usuário quando ela está na frente,
   * prioridade de prefetch enquanto está só aquecendo por baixo.
   */
  const tabFetchers = useMemo(() => {
    const make = (tab: string) =>
      (path: string, params?: Record<string, string>) =>
        fetchAdminData(path, params, activeTabRef.current === tab ? "user" : "prefetch");
    return {
      aquisicao: make("aquisicao"),
      creatives: make("creatives"),
      funnelMetrics: make("funnel-metrics"),
      commercialGoals: make("commercial-goals"),
    };
  }, [fetchAdminData]);

  /**
   * Busca em segundo plano o que o usuário provavelmente vai abrir.
   *
   * Entra no pool com prioridade "prefetch": nunca ocupa as vagas reservadas ao
   * usuário e cede a frente da fila para qualquer clique. O resultado cai no
   * mesmo cache, então quando o clique vem não há requisição para esperar.
   */
  const prefetchAdminData = useCallback((path: string, params?: Record<string, string>) => {
    whenIdle(() => {
      void fetchAdminData(path, params, "prefetch").catch(() => undefined);
    });
  }, [fetchAdminData]);

  /** Busca a jornada de um lead antes de ele ser aberto (hover na linha). */
  const prefetchLeadJourney = useCallback((leadId: string) => {
    prefetchAdminData("/lead-journey", { lead_id: leadId });
  }, [prefetchAdminData]);

  // UMA instância do CRM para a tabela inteira. O hook foi escrito para isso —
  // cada função recebe `leadId` — e instanciar por linha faria cada célula
  // buscar `/crm/contas` sozinha.
  //
  // FICA AQUI EM CIMA, junto dos outros hooks, e NÃO desce para perto do
  // `return`: mais abaixo esta página tem três saídas antecipadas (isLoading,
  // !isAuthenticated, selectedSession). Um hook depois delas roda em uns
  // renders e não roda em outros, e o React derruba a página inteira com o
  // erro #310 ("Rendered more hooks than during the previous render").
  // Foi exatamente o que aconteceu no deploy 72561be6 de 22/09/2026.
  const crmDaLista = useCrmAcoes(fetchAdminData, pessoaDoPush ?? null, isAuthenticated);

  /**
   * Depois de uma ação de CRM, recarrega SÓ o lead que mudou.
   *
   * Antes isto chamava `loadLeads()`, que refaz a lista inteira: a tabela
   * some atrás de um spinner, o scroll volta ao topo e os filtros aplicados
   * são recalculados — tudo por causa de um follow-up numa linha. Numa fila de
   * 60 leads isso torna o CRM impraticável, que é exatamente o atrito que ele
   * existe para eliminar.
   *
   * A rota `/leads` com `ids` devolve o MESMO objeto enriquecido com
   * `lead_fila` (o enriquecimento no `admin-data` vale para qualquer consulta
   * de leads), então dá para trocar uma linha e deixar o resto parado.
   */
  /**
   * Balde da fila escolhido nos chips, e a ORDEM dele.
   *
   * A fila não conhece o filtro de período do painel: ela é "quem precisa de
   * ação agora", venha de hoje ou de agosto. Por isso o balde traz os ids da
   * rota `/crm/fila` e a lista passa a mostrar exatamente esses leads —
   * buscando os que ainda não estavam carregados —, na ordem em que a fila os
   * devolveu (mais antigo primeiro, nunca por nota).
   */
  const escolherBaldeDaFila = useCallback(async (balde: string | null, ids: string[]) => {
    if (!balde || ids.length === 0) {
      setFilaBalde(balde);
      setFilaOrdem(balde ? new Map() : null);
      return;
    }
    setFilaBalde(balde);
    setFilaOrdem(new Map(ids.map((id, i) => [id, i])));

    // Os leads do balde que estão fora do período carregado precisam entrar na
    // lista, senão o chip mostraria "52" e a tabela, três linhas.
    setLeads((prev) => {
      const faltando = ids.filter((id) => !prev.some((l) => l.id === id));
      if (faltando.length === 0) return prev;
      void (async () => {
        try {
          const data = await fetchAdminData("/leads", { ids: faltando.join(",") });
          const novos = (data as Lead[] | null) ?? [];
          if (novos.length) setLeads((atual) => {
            const jaTem = new Set(atual.map((l) => l.id));
            return [...atual, ...novos.filter((n) => !jaTem.has(n.id))];
          });
        } catch (e) {
          console.error("[fila] leads do balde:", e);
        }
      })();
      return prev;
    });
  }, [fetchAdminData]);

  const atualizarCrmDoLead = useCallback(async (leadId: string) => {
    try {
      const data = await fetchAdminData("/leads", { ids: leadId });
      const novo = (data as Lead[] | null)?.[0];
      if (!novo) return;
      setLeads((prev) => prev.map((l) => (l.id === novo.id ? { ...l, ...novo } : l)));
      // As contagens mudam de balde; a LISTA não é refiltrada de propósito, para
      // o lead não sumir de baixo do cursor no instante em que foi trabalhado.
      setFilaVersao((v) => v + 1);
    } catch {
      // A linha fica com o estado anterior. O erro da ação em si já apareceu
      // em toast; um segundo aviso aqui só diria a mesma coisa duas vezes.
    }
  }, [fetchAdminData]);

  // Liga o aquecimento depois que a lista principal chega: a partir daí a fila
  // de requisições está livre e as outras abas podem se montar por baixo.
  useEffect(() => {
    if (!isAuthenticated || leadsLoading || prewarmTabs) return;
    whenIdle(() => setPrewarmTabs(true), 3000);
  }, [isAuthenticated, leadsLoading, prewarmTabs]);

  // As jornadas dos primeiros leads da lista são as mais prováveis de serem
  // abertas. O hover cobre o resto.
  useEffect(() => {
    if (!prewarmTabs || leads.length === 0) return;
    leads.slice(0, 8).forEach((lead) => prefetchLeadJourney(lead.id));
  }, [prewarmTabs, leads, prefetchLeadJourney]);


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

  /**
   * Recebe o que os outros painéis fizeram.
   *
   * Lead lido e lead contatado são aplicados NA HORA no estado local, sem
   * refetch: o evento já traz tudo que muda, e ir ao servidor buscar uma linha
   * inteira para virar um booleano seria desperdício e piscada na tela.
   *
   * Reunião e venda derrubam o cache e recarregam, porque elas mexem em métrica,
   * funil, margem e meta ao mesmo tempo — não dá para remendar isso na mão.
   */
  useEffect(() => {
    return assinarAoVivo((e: EventoAoVivo) => {
      if (e.tipo === "lead_lido") {
        setLeads((prev) => {
          const alvo = prev.find((l) => l.id === e.lead_id);
          if (!alvo || alvo.lido === e.lido) return prev;
          setLeadsUnreadCount((n) => (e.lido ? Math.max(0, n - 1) : n + 1));
          return prev.map((l) => (l.id === e.lead_id ? { ...l, lido: e.lido } : l));
        });
        return;
      }
      if (e.tipo === "lead_contato") {
        setLeads((prev) => prev.map((l) => (
          l.id === e.lead_id && !l.contacted_at
            ? { ...l, contacted_at: new Date().toISOString(), contacted_by: e.por }
            : l
        )));
        return;
      }
      if (e.tipo === "lead_excluido") {
        // Outro painel apagou: sai da lista e do cache aqui também, senão o lead
        // continua na tela do Miguel e volta a cada recarga.
        const apagados = new Set(e.lead_ids);
        invalidateAdminCache();
        setLeads((prev) => {
          const sumindo = prev.filter((l) => apagados.has(l.id));
          if (sumindo.length === 0) return prev;
          const naoLidos = sumindo.filter((l) => !l.lido).length;
          if (naoLidos) setLeadsUnreadCount((n) => Math.max(0, n - naoLidos));
          return prev.filter((l) => !apagados.has(l.id));
        });
        return;
      }
      // Reunião ou venda: o número mudou para todo mundo.
      invalidateAdminCache();
      loadConversions();
      toast({
        title: e.tipo === "venda" ? "Venda registrada por outra pessoa" : "Reunião atualizada por outra pessoa",
        description: `${e.por} acabou de mexer. Os números foram atualizados.`,
      });
    });
  }, [loadConversions]);

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

  // ── Atualização silenciosa depois de servir dado velho ─────────────────
  //
  // Quando `fetchAdminData` devolve o valor da visita anterior para pintar a
  // tela na hora, ele revalida por baixo. Ao chegar a resposta nova, o cache
  // avisa por evento e o carregador daquela rota roda de novo — agora achando
  // o cache fresco, então é instantâneo e sem nova requisição.
  //
  // Os carregadores vivem num ref porque são funções recriadas a cada render:
  // colocá-los nas dependências registraria e removeria o ouvinte sem parar.
  const loadersRef = useRef<Record<string, () => void>>({});
  loadersRef.current = {
    "/metrics": loadMetrics,
    "/leads": loadLeads,
    "/campaigns": loadCampaignMetrics,
    "/sessions": loadSessions,
    "/meetings": loadConversions,
    "/manual-sales": loadConversions,
  };

  useEffect(() => {
    const aoRevalidar = (e: Event) => {
      const rota = (e as CustomEvent<{ path?: string }>).detail?.path;
      if (!rota) return;
      loadersRef.current[rota]?.();
    };
    window.addEventListener(CACHE_REVALIDATED_EVENT, aoRevalidar);
    return () => window.removeEventListener(CACHE_REVALIDATED_EVENT, aoRevalidar);
  }, []);

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
  //
  // Nota de deploy (03/09/2026): os chunks deste app têm cache imutável no
  // Cloudflare. Pedir um chunk pelo www ANTES de a publicação propagar faz o
  // Pages responder com o index.html (fallback de SPA) e o Cloudflare guardar
  // esse HTML sob o nome do .js por um ano — e o admin quebra ao carregar.
  // Aconteceu com o chunk desta página. A verificação pós-deploy tem que ser
  // feita pela URL da publicação (*.pages.dev), nunca pelo www.

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <Dialog open={agendaAberta} onOpenChange={setAgendaAberta}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agenda das reuniões</DialogTitle>
          </DialogHeader>
          <GoogleCalendarCard />
        </DialogContent>
      </Dialog>
      <div className="min-h-screen bg-background">
      {/* A navegação principal saiu do topo para a barra lateral. `activeTab`
          continua sendo a ÚNICA fonte de verdade da seção — a barra só lê e
          escreve nele, exatamente como as abas faziam. */}
      <ShellAdmin
        secaoAtiva={activeTab}
        onSelecionar={handleTabChange}
        onIrParaFila={() => {
          // A fila vive no topo da seção de Leads. Rolar até ela (depois do
          // React pintar a troca de seção) é o que torna o item de menu útil sem
          // duplicar a implementação numa tela própria.
          requestAnimationFrame(() => {
            document.getElementById("fila-comercial")?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }}
      >
        {/* Barra fixa de vidro.
            Ela acompanha a rolagem porque tudo que está aqui é decisão de
            contexto — o período, a página, o criativo — e o painel é longo. Ter
            que voltar ao topo para trocar o filtro e descer de novo era o
            caminho normal de uso, e é o que isto elimina.

            O fundo translúcido com blur não é enfeite: o conteúdo desliza por
            baixo, e sem o desfoque os números da tabela apareceriam através do
            cabeçalho, ilegíveis. `supports-[backdrop-filter]` dá um fundo mais
            sólido em navegador sem blur, senão a barra fica transparente demais. */}
        {/* `z-30`, e não `z-40`: a barra lateral é `fixed z-40` e é renderizada
            ANTES deste header no DOM. Com o mesmo z-index, quem vem depois
            pinta por cima — então o header cobria a barra quando ela abria no
            hover. E como este header vive dentro do `md:pl-16`, a caixa dele
            começa em x=64px: a faixa de 64px a 224px ficava pintada com
            `bg-background/80`, que sobre `--background: 235 80% 3%` é preto.
            Era esse o bloco preto. O header continua acima do conteúdo (z-10 e
            z-20) e abaixo dos menus e modais do Radix (z-50). */}
        <div className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
          <AvisoNotificacoes
            permissionState={permissionState}
            ios={ehIphone}
            instalado={appInstalado}
            pessoa={pessoaDoPush}
            novaVersao={atualizacao.novaVersao}
            onAtualizar={atualizacao.atualizarAgora}
            podeInstalar={podeInstalar}
            onInstalar={() => void instalarApp()}
            onAtivar={() => void toggleNotifications(pessoaDoPush)}
          />
          <ReinstalarAppDialog open={atualizacao.pedidoReinstalar} onClose={atualizacao.fecharReinstalar} ios={ehIphone} />
          {/* LARGURA DO PAINEL.

              Aqui havia `max-w-7xl`, que são 1280px. Num monitor de 1920 isso
              deixava um terço da tela vazio enquanto a tabela de criativos, com
              23 colunas, rolava na horizontal dentro dos 1280 — espaço morto e
              conteúdo espremido ao mesmo tempo.

              O teto de 1800px não é a mesma restrição com outro número: em 1920
              a largura real vira ~1792 (viewport menos o trilho e as margens), ou
              seja, o teto nem chega a valer e não sobra espaço morto. Ele só
              entra em cena em ultrawide e 4K, onde linha de texto atravessando
              3000px deixa de ser legível.

              O cabeçalho e o corpo usam o MESMO container: se divergirem, o
              filtro do topo desalinha da coluna da tabela logo abaixo. */}
          <div className="mx-auto w-full max-w-[1800px] px-4 md:px-8 py-3 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              Analytics do Funil
              <span
                className="inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground"
                title={aoVivoOk
                  ? "Tempo real ligado: o que outra pessoa marcar aparece aqui na hora, sem recarregar."
                  : "Tempo real desconectado. As mudanças de outras pessoas só aparecem no próximo carregamento (F5)."}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${aoVivoOk ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/40"}`} />
                {aoVivoOk ? "ao vivo" : "sem conexão"}
              </span>
            </h1>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <div
                id="admin-header-actions-slot"
                className="flex flex-wrap items-center gap-1.5 sm:gap-2"
              />
              <div className="hidden sm:block w-px h-5 bg-border/70" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 relative"
                onClick={() => setAgendaAberta(true)}
                title={agendaConectada ? "Agenda das reuniões: conectada" : "Agenda das reuniões: desconectada"}
              >
                <CalendarDays className="w-4 h-4" />
                {agendaConectada !== null && (
                  <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${agendaConectada ? "bg-emerald-400" : "bg-rose-400"}`} />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={alternarTema}
                title={tema === "claro" ? "Mudar para o tema escuro" : "Mudar para o tema claro"}
              >
                {tema === "claro"
                  ? <Moon className="w-4 h-4" />
                  : <Sun className="w-4 h-4 text-amber-400" />}
              </Button>
              <NotificationsPopover
                notificationsEnabled={notificationsEnabled}
                permissionState={permissionState}
                pushSubscribed={pushSubscribed}
                subscriberCount={subscriberCount}
                dispositivos={dispositivos}
                atualizarDispositivos={atualizarDispositivos}
                podeInstalar={podeInstalar}
                instalarApp={instalarApp}
                removerDispositivo={removerDispositivo}
                toggleNotifications={toggleNotifications}
                testNotifications={testNotifications}
                sendWebPush={sendWebPush}
                pessoa={pessoaDoPush}
                definirPessoa={definirPessoaDoPush}
                instalado={appInstalado}
                ios={ehIphone}
              />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </div>

          {/* Filtros de contexto. As ações (Reunião, Venda, Atualizar) subiram
              para a linha do título: elas são comando, não filtro, e ficavam
              caindo sozinhas numa terceira linha por causa do wrap. */}
          <div className="flex flex-wrap items-center gap-2">
            <UniversalDateRangePicker />
            <PageVariantFilter value={pageFilter} onChange={changePageFilter} />
            <CreativeFilter
              value={creativeFilter}
              onChange={changeCreativeFilter}
              creatives={(metrics?.creatives_available as CreativeOption[]) || []}
            />
            {/* Slot dos filtros de recorte de mídia (conta → campanha →
                conjunto → anúncio), preenchido por portal pelo bloco
                "Desempenho por conta" em 16/09/2026. Eles viviam dentro do
                card, no meio da aba: para trocar de conta era preciso rolar
                até lá e depois rolar de volta para ler o resto. Aqui ficam na
                mesma linha dos outros filtros de contexto, que é o que eles
                são. */}
            <div
              id="admin-header-filters-slot"
              className="flex flex-wrap items-center gap-2"
            />
          </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1800px] px-4 md:px-8 pb-8 pt-4">

          {/* O motivo do tique, visível. Som sem causa na tela é o que faz
              alguém desligar a notificação inteira; com o número e a saída
              ("clique em Chamei") ao lado, o som vira instrução. */}
          {pendingLeadsCount > 0 && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span>
                <strong>{pendingLeadsCount}</strong> lead{pendingLeadsCount === 1 ? "" : "s"} de hoje
                esperando chamada. O tique para quando você clicar em <strong>Chamei</strong>.
              </span>
            </div>
          )}

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
            {/* A navegação virou a barra lateral. Este seletor sobrevive SÓ no
                celular, como rede de segurança enquanto a gaveta não for
                validada em aparelho real. Os dois escrevem no mesmo
                `activeTab`, então não há estado duplicado. */}
            <div className="md:hidden overflow-x-auto -mx-4 px-4 scrollbar-hide">
              <TabsList className="w-max md:w-auto h-12 md:h-16 p-1.5 md:p-2 bg-card border-2 border-primary/30 rounded-xl md:rounded-2xl gap-1 md:gap-2 shadow-lg shadow-primary/10">
                <TabsTrigger
                  value="aquisicao"
                  className="h-9 md:h-12 px-3 md:px-8 text-sm md:text-lg font-bold rounded-lg md:rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted transition-all duration-200"
                >
                  Aquisição
                </TabsTrigger>
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
                  Métricas Criativos
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
              </TabsList>
            </div>

            {/* Leads Tab */}
            <TabsContent value="leads">
              {/* A fila não é mais um bloco separado com cards: os baldes são
                  filtros DESTA tabela, e a tabela é a fila. Duas listas do mesmo
                  assunto na mesma tela faziam o vendedor agir num lugar e
                  conferir no outro. Decisão do Rodger em 22/09/2026. */}
              <div id="fila-comercial" className="scroll-mt-40">
              <FiltroFilaCrm
                fetchAdminData={fetchAdminData}
                pessoa={pessoaDoPush}
                definirPessoa={definirPessoaDoPush as (p: string) => void | Promise<void>}
                baldeAtivo={filaBalde}
                onEscolherBalde={escolherBaldeDaFila}
                versao={filaVersao}
              />
              </div>

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
                    <SelectItem value="direct">Direct (&lt;5k)</SelectItem>
                    <SelectItem value="gustavo">Gustavo (histórico)</SelectItem>
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
                <Select value={leadsAttributionFilter} onValueChange={setLeadsAttributionFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Caminho" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os caminhos</SelectItem>
                    <SelectItem value="direct_ad">📢 Direto do anúncio</SelectItem>
                    <SelectItem value="bio_recovery">🔗 Recuperado (Instagram/bio)</SelectItem>
                    {/* Veio de plataforma paga e NÃO dá para dizer qual anúncio.
                        Chamar isso de orgânico esconderia a mídia; chamar de
                        "direto do anúncio" inventaria um criativo. */}
                    <SelectItem value="paid_unknown">💸 Pago, anúncio não identificado</SelectItem>
                    <SelectItem value="organic">🌿 Orgânico (sem anúncio)</SelectItem>
                    <SelectItem value="instagram_dm">📩 Direct do Instagram (iscas)</SelectItem>
                    <SelectItem value="prospeccao">🎯 Prospecção (garimpo do Instagram)</SelectItem>
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
                {(leadsStatusFilter !== "all" || leadsMercadoFilter !== "all" || leadsTierFilter !== "all" || leadsSdrFilter !== "all" || leadsAdsetFilter !== "all" || leadsConversionFilter !== "all" || leadsAttributionFilter !== "all") && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setLeadsStatusFilter("all");
                      setLeadsMercadoFilter("all");

                      setLeadsTierFilter("all");
                      setLeadsSdrFilter("all");
                      setLeadsAdsetFilter("all");
                      setLeadsConversionFilter("all");
                      setLeadsAttributionFilter("all");
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
                  {/* `table-fixed` distribui as larguras declaradas e ESPREME o
                      resto: com as colunas de origem (campanha, criativo,
                      variante) a soma passou da largura da tela e "Nome" foi
                      parar em cima de "WhatsApp". A tabela ganha uma largura
                      mínima e o container rola na horizontal, em vez de as
                      colunas se sobreporem. */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm table-fixed min-w-[1580px]">
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
                          {/* Score veio do bloco "Desempenho por conta" em
                              16/09/2026. Lá ele era média por anúncio, o que não
                              ajuda ninguém a decidir quem chamar; aqui é a nota
                              do lead, ao lado do nome dele. */}
                          <th className="text-left p-2 w-20" title="Taxa de Qualificação gravada no lead (0–100). Lead qualificado (HQL) = 73 ou mais no quiz, 67 ou mais no formulário curto — réguas diferentes, ver src/lib/hql.ts.">Score</th>
                          <th className="text-left p-2 w-48">Nome</th>
                          <th className="text-left p-2 w-28">WhatsApp</th>
                          <th className="text-left p-2 w-36">Instagram</th>
                          <th className="text-left p-2 w-24">Mercado</th>
                          <th className="text-left p-2 w-32" title="Situação comercial e próxima ação — mesma fonte da fila comercial">CRM</th>
                          <th className="text-left p-2 w-28">Faturamento</th>
                          {/* Campanha, criativo e variante numa coluna só: em três
                              colunas separadas a soma das larguras estourava a tela
                              e o nome do lead ia parar em cima do WhatsApp. */}
                          <th className="text-left p-2 w-44" title="De onde o lead veio: variante da página, campanha e criativo">Origem</th>
                          <th className="text-left p-2 w-20">SDR</th>
                          <th className="text-left p-2 w-24">Data</th>
                          <th className="text-left p-2 w-24" title="Tempo entre chegada do lead e clique para abrir/ler">Tempo p/ chamar</th>
                          <th className="text-right p-2 w-12">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leadsLoading ? (
                          <tr>
                              <td colSpan={16} className="p-8 text-center">
                              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                            </td>
                          </tr>
                        ) : filteredLeads.length === 0 ? (
                          <tr>
                            <td colSpan={16} className="p-8 text-center text-muted-foreground">
                              Nenhum lead encontrado
                            </td>
                          </tr>
                        ) : (
                          filteredLeads.map((lead, index) => (
                            <tr 
                              key={lead.id} 
                              className={`border-b hover:bg-muted/30 cursor-pointer ${!lead.lido ? "bg-primary/5" : ""} ${selectedLeadIds.has(lead.id) ? "!bg-secondary/20 ring-1 ring-inset ring-secondary/60" : ""}`}
                              onClick={() => openLeadDetail(lead)}
                              onMouseEnter={() => prefetchLeadJourney(lead.id)}
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
                                  {lead.attribution_source === "paid_unknown" && (
                                    <Badge variant="outline" className="border-amber-500 text-amber-400 bg-amber-500/10 w-fit text-[10px] px-1.5 py-0" title="Veio de plataforma paga, mas nao da para dizer qual anuncio">
                                      💸 Pago (s/ anúncio)
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
                                  {/* Lead criado pelo Champion Direct (funil de DM do Instagram).
                                      utm_campaign = automação/isca; utm_content = de onde veio. */}
                                  {lead.attribution_source === "instagram_dm" && (
                                    <Badge variant="outline" className="border-pink-500 text-pink-400 bg-pink-500/10 w-fit text-[10px] px-1.5 py-0" title={(lead as { utm_content?: string | null }).utm_content ?? ""}>
                                      📩 {(lead as { utm_campaign?: string | null }).utm_campaign || "Direct"}{(lead as { utm_medium?: string | null }).utm_medium ? ` · ${(lead as { utm_medium?: string | null }).utm_medium}` : ""}
                                    </Badge>
                                  )}
                                  {lead.origem_lead === "prospeccao" && (
                                    <Badge variant="outline" className="border-orange-500 text-orange-400 bg-orange-500/10 w-fit text-[10px] px-1.5 py-0" title="Lead do garimpo do Instagram: abordagem pelo direct">
                                      🎯 Prospecção
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
                              {/* A NOTA GRAVADA NO LEAD (leads.score), não uma
                                  recalculada aqui.

                                  É o mesmo número que dispara o evento
                                  HighQualityLead na Meta. Existe um cálculo de
                                  score no front (usado no modal) e um
                                  `recalcLeadScore` que devolve 0 a 5 — nenhum
                                  dos dois é esta nota. Usar outro aqui criaria
                                  um lead "74" na tela que a Meta nunca viu como
                                  HQL.

                                  O CORTE É POR VERSÃO (17/09/2026): 73 para o
                                  quiz, 67 para o formulário curto, que só
                                  pergunta faturamento e mercado. A cor vira no
                                  corte porque o score é PORTÃO, não régua:
                                  abaixo dele, 68 não vale mais que 41. */}
                              <td className="p-2">
                                {typeof lead.score === "number" ? (
                                  <span
                                    className={`inline-flex items-center gap-1 text-xs font-bold tabular-nums ${
                                      ehHighQualityLead(lead.score, lead.score_version)
                                        ? "text-emerald-400"
                                        : lead.score >= 50
                                          ? "text-amber-400"
                                          : "text-muted-foreground"
                                    }`}
                                    title={ehHighQualityLead(lead.score, lead.score_version)
                                      ? `Lead qualificado: score ≥ ${limiarHql(lead.score_version)} (${lead.score_version || "v2.3"}), o corte que concentra a receita`
                                      : `Abaixo do corte de ${limiarHql(lead.score_version)} (${lead.score_version || "v2.3"})`}
                                  >
                                    {lead.score}
                                    {ehHighQualityLead(lead.score, lead.score_version) && (
                                      <span className="rounded-sm bg-emerald-500/15 px-1 text-[9px] font-semibold">HQL</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground" title="Lead sem score gravado">—</span>
                                )}
                              </td>
                              {/* `truncate` dentro de flex só funciona com `min-w-0`:
                                  sem isso o item não encolhe abaixo do próprio
                                  conteúdo e o nome vaza por cima do WhatsApp,
                                  levando o badge da nota junto. O `max-w` fixo
                                  também saiu — quem manda na largura é a coluna. */}
                              <td className="p-2 font-medium overflow-hidden" title={lead.nome_completo}>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="truncate min-w-0">{lead.nome_completo}</span>
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
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <button
                                    type="button"
                                    className="text-green-500 hover:underline text-xs truncate min-w-0"
                                    title="Copiar WhatsApp"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void copyWhatsappToClipboard(lead.whatsapp);
                                    }}
                                  >
                                    {lead.whatsapp}
                                  </button>
                                  {/* O botão "Chamei" saiu em 04/09/2026: ler o
                                      lead passou a valer como chamado, e o
                                      carimbo vai junto com o de lido. */}
                                </div>
                              </td>
                              <td className="p-2 overflow-hidden">
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
                              {/* CRM no lugar de "Operações": a fila separada não
                                  estava sendo usada porque trocar de tela para
                                  decidir o que fazer com o lead é atrito. O número
                                  de operações continua no modal de detalhe. */}
                              <td className="p-2" onClick={(e) => e.stopPropagation()}>
                                <CelulaCrm
                                  lead={lead}
                                  crm={crmDaLista}
                                  pessoa={pessoaDoPush ?? null}
                                  aoMudar={() => { void atualizarCrmDoLead(lead.id); }}
                                />
                              </td>
                              <td className="p-2 text-muted-foreground text-xs truncate" title={lead.investimento_faixa || "-"}>{lead.investimento_faixa || "-"}</td>
                              {/* ORIGEM: campanha em cima, ANÚNCIO embaixo.

                                  Até 11/09/2026 a segunda linha era
                                  `creative_name_resolved || ad_name_resolved || utm_content`,
                                  e `creative_name` é a COPY — a Meta o gera a
                                  partir do texto do post. Um lead da CA 05
                                  aparecia como "Não adianta nada fazer tudo n…"
                                  enquanto o nome oficial do anúncio,
                                  "Luis-Nathan Case #2 – V3", estava no banco,
                                  resolvido por `ad_id`, o tempo todo.

                                  E `creative_name` NÃO identifica anúncio: essa
                                  mesma copy pertence a DOIS anúncios distintos
                                  na base — `Arthur Case #1` (120239380042020044)
                                  e `Luis-Nathan Case #2 – V3` (120252040734010116).

                                  `resolverOrigemAnuncio` já implementa a ordem
                                  certa (nome por ad_id → utm_content → não
                                  identificado) e existe desde o caso anterior;
                                  o painel de detalhe já a usava. Aqui era o
                                  único lugar que ainda não tinha migrado. */}
                              {(() => {
                                const v = variantShortLabel(lead.entry_page);
                                const origem = resolverOrigemAnuncio(lead as never);
                                const campanha = origem.campanha.evidencia === "ausente" ? null : origem.campanha.exibicao;
                                const temAnuncio = origem.anuncio.evidencia !== "ausente";
                                const comoVeio = lead.attribution_method === "submit" ? "envio do quiz (exato)"
                                  : lead.attribution_method === "fbp" ? "cookie do navegador"
                                  : lead.attribution_method === "ip" ? "IP (pode misturar pessoas da mesma rede)"
                                  : null;
                                // O detalhe fica no tooltip para a célula não
                                // virar parágrafo. O essencial de bater o olho
                                // continua sendo campanha + anúncio.
                                const detalhe = [
                                  temAnuncio ? origem.anuncio.exibicao : "Anúncio não identificado",
                                  origem.conjunto.evidencia !== "ausente" ? `Conjunto: ${origem.conjunto.exibicao}` : null,
                                  origem.placement.evidencia !== "ausente" ? `Posicionamento: ${origem.placement.exibicao}` : null,
                                  origem.anuncio.id ? `Ad ID: ${origem.anuncio.id}` : null,
                                  origem.anuncio.evidencia === "observado" ? "nome veio da URL do clique, não confirmado na Meta" : null,
                                  lead.utm_content_recovered && comoVeio ? `Recuperado da sessão por ${comoVeio}` : null,
                                ].filter(Boolean).join("\n");
                                return (
                                  <td className="p-2 text-xs overflow-hidden">
                                    <div className="flex items-center gap-1 min-w-0">
                                      <Badge
                                        variant="outline"
                                        className={`text-[9px] px-1 py-0 shrink-0 ${v.inTest
                                          ? "border-cyan-500/40 text-cyan-300 bg-cyan-500/10"
                                          : "border-muted-foreground/30 text-muted-foreground"}`}
                                        title={v.full}
                                      >
                                        {v.short}
                                      </Badge>
                                      <span className="truncate text-muted-foreground" title={campanha || "Sem campanha"}>
                                        {campanha || "—"}
                                      </span>
                                    </div>
                                    <div
                                      className={`truncate mt-0.5 ${lead.utm_content_recovered ? "text-amber-300/90" : ""}`}
                                      title={detalhe}
                                    >
                                      {temAnuncio
                                        ? origem.anuncio.exibicao
                                        : origem.ehTrafegoPago
                                          ? <span className="text-muted-foreground/60">Anúncio não identificado</span>
                                          : <span className="text-muted-foreground/50">—</span>}
                                      {lead.utm_content_recovered && <span className="ml-1 opacity-60">↻</span>}
                                    </div>
                                  </td>
                                );
                              })()}
                              <td className="p-2">
                                {(() => {
                                  const sdr = getLeadSdr(lead);
                                  if (sdr === "Gustavo") return (
                                    <Badge 
                                      className="bg-blue-500/20 text-blue-400 border-blue-500/30 cursor-pointer hover:bg-blue-500/30 transition-colors"
                                      onClick={(e) => { e.stopPropagation(); toggleSdr(lead); }}
                                    >Gustavo</Badge>
                                  );
                                  if (sdr === "Miguel") return (
                                    <Badge 
                                      className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 cursor-pointer hover:bg-emerald-500/30 transition-colors"
                                      onClick={(e) => { e.stopPropagation(); toggleSdr(lead); }}
                                    >Miguel</Badge>
                                  );
                                  if (sdr === "Direct") return (
                                    <Badge className="bg-muted/40 text-muted-foreground border-border">Direct</Badge>
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
                        onMouseEnter={() => prefetchLeadJourney(lead.id)}
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
                                  {/* Mesma nota do banco que a tabela do desktop. */}
                                  {typeof lead.score === "number" && (
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] ${
                                        ehHighQualityLead(lead.score, lead.score_version)
                                          ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                                          : lead.score >= 50
                                            ? "border-amber-500 text-amber-400 bg-amber-500/10"
                                            : "border-muted-foreground/40 text-muted-foreground"
                                      }`}
                                    >
                                      {lead.score}{ehHighQualityLead(lead.score, lead.score_version) ? " · HQL" : ""}
                                    </Badge>
                                  )}
                                  <Badge
                                    className={`text-[10px] ${sdr === "Direct" ? "bg-muted/40 text-muted-foreground border-border" : "cursor-pointer"} ${sdr === "Gustavo" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : sdr === "Miguel" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : ""}`}
                                    onClick={(e) => { e.stopPropagation(); if (sdr !== "Direct") toggleSdr(lead); }}
                                  >
                                    {sdr}
                                  </Badge>
                                  {lead.is_duplicate_ip && (
                                    <Badge variant="outline" className="border-orange-500 text-orange-500 bg-orange-500/10 text-[10px] px-1.5 py-0">⚠️ Dup</Badge>
                                  )}
                                  {lead.attribution_source === "bio_recovery" && (
                                    <Badge variant="outline" className="border-violet-400 text-violet-300 bg-violet-500/15 text-[10px] px-1.5 py-0">🔗 Bio</Badge>
                                  )}
                                  {lead.attribution_source === "paid_unknown" && (
                                    <Badge variant="outline" className="border-amber-500 text-amber-400 bg-amber-500/10 w-fit text-[10px] px-1.5 py-0" title="Veio de plataforma paga, mas nao da para dizer qual anuncio">
                                      💸 Pago (s/ anúncio)
                                    </Badge>
                                  )}
                                  {lead.attribution_source === "organic" && (
                                    <Badge variant="outline" className="border-emerald-600 text-emerald-400 bg-emerald-500/10 text-[10px] px-1.5 py-0">🌿 Org</Badge>
                                  )}
                                  {lead.attribution_source === "direct_ad" && (
                                    <Badge variant="outline" className="border-sky-600 text-sky-400 bg-sky-500/10 text-[10px] px-1.5 py-0">📢 Ad</Badge>
                                  )}
                                  {lead.attribution_source === "instagram_dm" && (
                                    <Badge variant="outline" className="border-pink-500 text-pink-400 bg-pink-500/10 text-[10px] px-1.5 py-0" title={(lead as { utm_content?: string | null }).utm_content ?? ""}>
                                      📩 {(lead as { utm_campaign?: string | null }).utm_campaign || "Direct"}{(lead as { utm_medium?: string | null }).utm_medium ? ` · ${(lead as { utm_medium?: string | null }).utm_medium}` : ""}
                                    </Badge>
                                  )}
                                  {lead.origem_lead === "prospeccao" && (
                                    <Badge variant="outline" className="border-orange-500 text-orange-400 bg-orange-500/10 w-fit text-[10px] px-1.5 py-0" title="Lead do garimpo do Instagram: abordagem pelo direct">
                                      🎯 Prospecção
                                    </Badge>
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
              <Dialog
                open={!!selectedLead || !!leadCarregando}
                onOpenChange={() => { setSelectedLead(null); setLeadCarregando(null); setErroDetalhe(null); }}
              >
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-xl">Detalhes do Lead</DialogTitle>
                  </DialogHeader>

                  {/* Esqueleto enquanto o lead vem. É o MESMO modal — nada aqui
                      duplica a tela de detalhe; só ocupa o lugar dela por um
                      instante, para o clique ter resposta imediata. */}
                  {!selectedLead && leadCarregando && !erroDetalhe && (
                    <div className="space-y-4 mt-4 animate-pulse" aria-busy="true">
                      <div className="h-24 rounded-lg bg-muted/40" />
                      <div className="h-20 rounded-lg bg-muted/30" />
                      <div className="grid grid-cols-2 gap-4">
                        <div className="h-16 rounded-lg bg-muted/30" />
                        <div className="h-16 rounded-lg bg-muted/30" />
                        <div className="h-16 rounded-lg bg-muted/30" />
                        <div className="h-16 rounded-lg bg-muted/30" />
                      </div>
                      <p className="text-xs text-muted-foreground text-center">Carregando o lead…</p>
                    </div>
                  )}

                  {!selectedLead && erroDetalhe && (
                    <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                      <p className="font-semibold text-destructive-foreground mb-1">Não deu para abrir o lead</p>
                      <p className="text-muted-foreground mb-3">{erroDetalhe}</p>
                      <Button size="sm" variant="outline"
                        onClick={() => { const id = leadCarregando; if (id) void abrirLeadPorId(id); }}>
                        Tentar de novo
                      </Button>
                    </div>
                  )}

                  {selectedLead && (
                    <div className="space-y-6 mt-4">
                      {/* CRM: estado, próxima ação e as ações rápidas.
                          Fica no TOPO porque é a única parte deste modal que
                          serve para AGIR — o resto é consulta. */}
                      <AcoesRapidasCrm
                        leadId={selectedLead.id}
                        leadWhatsapp={selectedLead.whatsapp}
                        leadInstagram={selectedLead.instagram}
                        pessoa={pessoaDoPush}
                        definirPessoa={definirPessoaDoPush as (p: string) => void | Promise<void>}
                        fetchAdminData={fetchAdminData}
                      />

                      {/* ORIGEM DO ANÚNCIO — hierarquia CONTA → CAMPANHA → CONJUNTO → ANÚNCIO.
                          A regra de resolução mora em src/lib/origemAnuncio.ts e é testada
                          por scripts/testar-origem-anuncio.mjs. Aqui só se desenha. */}
                      {(() => {
                        const origem = resolverOrigemAnuncio(selectedLead as never);
                        const selo = (e: string) =>
                          e === "resolvido_por_id"
                            ? <span className="text-[9px] text-emerald-400/80 uppercase tracking-wide">✓ por ID</span>
                            : e === "observado"
                              ? <span className="text-[9px] text-amber-400/70 uppercase tracking-wide">observado no clique</span>
                              : <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">sem dado</span>;

                        const Nivel = ({ rotulo, campo, cor }: { rotulo: string; campo: typeof origem.conta; cor: string }) => (
                          <div className="p-3 bg-background/50 rounded-lg">
                            <div className="flex items-baseline justify-between gap-2 mb-1">
                              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">{rotulo}</p>
                              {selo(campo.evidencia)}
                            </div>
                            <p className={`font-semibold ${cor} text-base leading-snug break-words`}>{campo.exibicao}</p>
                            {campo.id && <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">{campo.id}</p>}
                            {campo.nota && <p className="text-[10px] text-muted-foreground/70 mt-1">{campo.nota}</p>}
                          </div>
                        );

                        return (
                          <div className="p-4 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-lg border border-purple-500/30">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-purple-400" />
                              Origem do Anúncio
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Nivel rotulo="Conta" campo={origem.conta} cor="text-purple-300" />
                              <Nivel rotulo="Campanha" campo={origem.campanha} cor="text-purple-400" />
                              <Nivel rotulo="Conjunto" campo={origem.conjunto} cor="text-blue-300" />
                              <Nivel rotulo="Anúncio" campo={origem.anuncio} cor="text-blue-400" />
                            </div>

                            {/* Três dimensões distintas. Fonte não é placement, e
                                device nunca serve para inferir placement. */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                              {([
                                ["Plataforma", origem.plataforma],
                                ["Placement", origem.placement],
                                ["Dispositivo", origem.device],
                              ] as const).map(([rotulo, campo]) => (
                                <div key={rotulo} className="p-2 bg-background/30 rounded">
                                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider">{rotulo}</p>
                                  <p className="font-medium text-sm leading-snug">{campo.exibicao}</p>
                                  {campo.bruto && campo.bruto !== campo.exibicao && (
                                    <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">{campo.bruto.slice(0, 40)}</p>
                                  )}
                                  {campo.nota && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{campo.nota}</p>}
                                </div>
                              ))}
                            </div>

                            {/* CRIATIVO é entidade separada do ANÚNCIO. A Meta nomeia o
                                criativo com o texto da copy quando ele nasce de um post,
                                então isto aqui costuma ser a copy — e é rotulado como tal. */}
                            {(origem.criativo.evidencia !== "ausente" || selectedLead.creative_thumbnail_url_resolved) && (
                              <div className="mt-3 flex items-start gap-3 p-2 bg-background/30 rounded-lg">
                                {selectedLead.creative_thumbnail_url_resolved && (
                                  <img
                                    src={selectedLead.creative_thumbnail_url_resolved}
                                    alt="Miniatura do criativo"
                                    className="w-12 h-12 rounded object-cover border border-purple-500/30 shrink-0"
                                  />
                                )}
                                <div className="min-w-0">
                                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Criativo · texto do anúncio</p>
                                  <p className="text-xs text-muted-foreground/90 leading-snug line-clamp-3 break-words">
                                    {origem.criativo.exibicao}
                                  </p>
                                  {origem.criativo.id && (
                                    <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">{origem.criativo.id}</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Comportamento no site — headline de entrada, tempo de
                          leitura, tempo no quiz e visitas anteriores. */}
                      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando jornada...</div>}>
                        <LeadJourneyPanel leadId={selectedLead.id} fetchAdminData={fetchAdminData} />
                      </Suspense>

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
                        {/* E-mail: o quiz pergunta (q8_email) e o banco guarda, mas
                            o modal nunca mostrou — quem atendia o lead tinha que ir
                            no CSV para achar. */}
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">E-mail</p>
                          {selectedLead.email ? (
                            <button
                              type="button"
                              className="text-lg font-semibold text-primary hover:underline text-left break-all"
                              title="Copiar e-mail"
                              onClick={() => {
                                void navigator.clipboard.writeText(selectedLead.email || "");
                                toast({ title: "E-mail copiado" });
                              }}
                            >
                              {selectedLead.email}
                            </button>
                          ) : (
                            <p className="text-lg font-semibold text-muted-foreground">—</p>
                          )}
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

                      {/* Compromisso no WhatsApp — a última pergunta do quiz.
                          Ela tem TRÊS respostas ("Sim", "Talvez", "Não") desde
                          25/08/2026, e este bloco lia o valor como booleano:
                          string não vazia é truthy, então "Não" aparecia como
                          "✅ Sim, se comprometeu". O SDR via o oposto do que o
                          lead respondeu, justamente na pergunta que diz se vale
                          a pena ligar primeiro para ele. */}
                      {(() => {
                        const resposta = selectedLead.raw_answers_json?.compromisso_whatsapp;
                        if (resposta === undefined || resposta === null || resposta === "") return null;
                        const v = String(resposta);
                        const estilo = v === "Sim"
                          ? { caixa: "bg-green-500/10 border-green-500/30", texto: "text-green-400", icone: "✅", frase: "Sim, responde assim que chegar" }
                          : v === "Talvez"
                            ? { caixa: "bg-amber-500/10 border-amber-500/30", texto: "text-amber-400", icone: "⏳", frase: "Talvez, pode demorar um pouco" }
                            : v === "Não" || v === "Nao"
                              ? { caixa: "bg-red-500/10 border-red-500/30", texto: "text-red-400", icone: "❌", frase: "Não se comprometeu a responder" }
                              // Leads anteriores a 25/08 têm `true` gravado pela
                              // tela de loading, não uma resposta de verdade.
                              : { caixa: "bg-muted/40 border-border", texto: "text-muted-foreground", icone: "•", frase: "Presumido (lead anterior à pergunta)" };
                        return (
                          <div className={`p-4 rounded-lg border ${estilo.caixa}`}>
                            <p className="text-xs text-foreground/60 uppercase tracking-wider mb-1">
                              Nosso time vai te chamar no WhatsApp hoje. Você se compromete a responder?
                            </p>
                            <p className={`font-semibold text-lg ${estilo.texto}`}>
                              {estilo.icone} {estilo.frase}
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

                      {selectedLead && selectedLead.origem_lead === "prospeccao" && (
                        <QualificacaoProspeccao
                          lead={selectedLead}
                          onSalvo={(l) => {
                            setLeads(prev => prev.map(x => x.id === l.id ? l : x));
                            setSelectedLead(prev => (prev && prev.id === l.id ? l : prev));
                          }}
                        />
                      )}

                      {/* ── Como a empresa decide (EXPERIMENTO 07/09/2026) ─────
                          Perguntado pelo SDR na conversa, antes de existir
                          reunião: "Hoje, quando vocês tomam decisões estratégicas
                          na empresa, normalmente quem participa?".

                          A copy é de diagnóstico, não de qualificação: nada de
                          "contratar", "comprar" ou "decisor" na tela. Quem
                          responde está descrevendo como a empresa funciona, e
                          não sendo triado — é o que faz a resposta ser honesta.

                          Opcional, não pontua, não define MQL, não desqualifica.
                          Serve para testar se a ausência de quem aprova explica
                          a faixa que agenda bem e fecha mal. */}
                      {selectedLead && (
                        <div className="pt-2 border-t space-y-2">
                          <div>
                            <p className="text-xs font-semibold text-foreground">Como a empresa decide</p>
                            <p className="text-[11px] text-muted-foreground leading-snug">
                              "Hoje, quando vocês tomam decisões estratégicas na empresa, normalmente quem participa?" Opcional.
                            </p>
                          </div>
                          <div className="grid gap-1.5">
                            {DECISAO_OPCOES.map((o) => {
                              const ativo = selectedLead.decisao_processo === o.value;
                              return (
                                <button
                                  key={o.value}
                                  type="button"
                                  title={o.ajuda}
                                  onClick={() => setDecisaoLead(selectedLead, o.value)}
                                  className={`h-9 rounded-md border text-xs font-medium px-3 text-left transition-colors ${
                                    ativo
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-background border-border hover:border-primary/60"
                                  }`}
                                >
                                  {o.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Tier + Lead Score 0–100 (mesmo cálculo usado em Performance por Criativo) */}
                      {selectedLead && (
                        (() => {
                          const { tier: calcTier } = recalcLeadScore(selectedLead);
                          // Recalculado NA RÉGUA DA VERSÃO do lead. Rodar a
                          // fórmula do quiz num lead do formulário mostraria
                          // "Compromisso WA 13/13" e "Aceita call 0/12" para
                          // perguntas que ele nunca viu.
                          const sr = calcularNotaPorVersao({
                            investimento_faixa: selectedLead.investimento_faixa,
                            mercado: selectedLead.mercado,
                            nps_score: selectedLead.nps_score,
                            dor_desejo: selectedLead.dor_desejo,
                            raw_answers_json: selectedLead.raw_answers_json,
                          }, selectedLead.score_version);
                          return (
                            <div className="pt-2 border-t space-y-3">
                              <div className="flex items-center gap-2">
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
                                <Badge variant="outline" className={`text-[10px] ${bandColorClass(sr.band)}`}>{sr.band}</Badge>
                                <span className={`text-sm font-bold ml-auto ${bandColorClass(sr.band)}`}>{sr.score}/100</span>
                              </div>
                              <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    sr.band === "Hot" ? "bg-emerald-500" :
                                    sr.band === "Quente" ? "bg-amber-500" :
                                    sr.band === "Morno" ? "bg-blue-500" :
                                    "bg-muted-foreground/40"
                                  }`}
                                  style={{ width: `${sr.score}%` }}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                                {linhasDoBreakdown(sr).map((l) => (
                                  <span key={l.rotulo}>{l.rotulo}: {l.valor}/{l.max}</span>
                                ))}
                                <span className="col-span-2 opacity-70">
                                  {sr.version} · corte de lead qualificado: {limiarHql(sr.version)}
                                </span>
                              </div>
                              {sr.flags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {sr.flags.map((f) => (
                                    <Badge key={f} variant="outline" className="text-[9px] text-amber-500 border-amber-500/40">{f}</Badge>
                                  ))}
                                </div>
                              )}
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

            {/* Aquisição Tab — a cascata de mídia, de sessão a venda */}
            <TabsContent value="aquisicao" forceMount={prewarmTabs || undefined} className="data-[state=inactive]:hidden">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <AquisicaoTab
                  fetchAdminData={tabFetchers.aquisicao}
                  startDateOnly={startDateOnly}
                  endDateOnly={endDateOnly}
                  startISO={startISO}
                  endISO={endISO}
                />
              </Suspense>
            </TabsContent>

            {/* Criativos Tab */}
            <TabsContent value="creatives" forceMount={prewarmTabs || undefined} className="data-[state=inactive]:hidden">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <CreativesTab 
                  fetchAdminData={tabFetchers.creatives}
                  startDateOnly={startDateOnly}
                  endDateOnly={endDateOnly}
                  startISO={startISO}
                  endISO={endISO}
                  funnelMetrics={metrics ? {
                    visitors: metrics.visitors_known
                      ? (metrics.has_reliable_ip_data ? metrics.unique_visitors : metrics.total_visitors)
                      : null,
                    sessions: metrics.total_visitors,
                    entered_quiz: metrics.entered_quiz_known ? metrics.entered_quiz : null,
                    completed: metrics.completed,
                    conversion_rate: metrics.conversion_rate !== null ? Number(metrics.conversion_rate) : null,
                    step_funnel: metrics.step_funnel || [],
                    quiz_v2_empty: metrics.quiz_v2_empty,
                    quiz_v1_present: metrics.quiz_v1_present,
                  } : null}
                />
              </Suspense>
            </TabsContent>

            {/* Métricas Funil Tab */}
            <TabsContent value="funnel-metrics" forceMount={prewarmTabs || undefined} className="data-[state=inactive]:hidden">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <FunnelMetricsTab
                  fetchAdminData={tabFetchers.funnelMetrics}
                  funnelMetrics={metrics ? {
                    visitors: metrics.visitors_known
                      ? (metrics.has_reliable_ip_data ? metrics.unique_visitors : metrics.total_visitors)
                      : null,
                    sessions: metrics.total_visitors,
                    entered_quiz: metrics.entered_quiz_known ? metrics.entered_quiz : null,
                    completed: metrics.completed,
                    conversion_rate: metrics.conversion_rate !== null ? Number(metrics.conversion_rate) : null,
                    step_funnel: metrics.step_funnel || [],
                    quiz_v2_empty: metrics.quiz_v2_empty,
                    quiz_v1_present: metrics.quiz_v1_present,
                    // Qual formulário o período viu. É isto que separa "sem
                    // dados" de "formulário curto, que não tem etapas".
                    quiz_flow: metrics.quiz_flow,
                    sessoes_form_curto: metrics.sessoes_form_curto,
                    sessoes_outro_quiz: metrics.sessoes_outro_quiz,
                  } : null}
                />
              </Suspense>
            </TabsContent>

            {/* Metas Comercial Tab — forecast de 6 meses sobre o histórico real */}
            <TabsContent value="commercial-goals" forceMount={prewarmTabs || undefined} className="data-[state=inactive]:hidden">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <CommercialGoalsTab fetchAdminData={tabFetchers.commercialGoals} />
              </Suspense>
            </TabsContent>

            {/* Relatórios Lead Tab */}
            <TabsContent value="reports">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <LeadReportsTab leads={leads} loading={leadsLoading} />
              </Suspense>
            </TabsContent>

            {/* Direct (Instagram) Tab */}
            <TabsContent value="direct">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <DirectTab />
              </Suspense>
            </TabsContent>

            {/* WhatsApp Tab */}
            <TabsContent value="whatsapp">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <WhatsAppTab />
              </Suspense>
            </TabsContent>

            {/* Esteira do orgânico (17/10/2026): a mesma tela de /esteira, com o login do admin */}
            <TabsContent value="esteira">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <EsteiraTab embutida />
              </Suspense>
            </TabsContent>

            {/* Agentes Tab */}
            <TabsContent value="agentes">
              <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <AgentesTab />
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
      </ShellAdmin>
      </div>
    </>
  );
}
