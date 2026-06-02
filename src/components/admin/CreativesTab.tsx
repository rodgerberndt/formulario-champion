import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  DollarSign,
  Users,
  Target,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Star,
  RefreshCw,
  Calendar,
  Circle,
  Search,
  X,
  Check,
  GripVertical,
} from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { fetchAdmin, getAdminToken } from "@/lib/adminAuth";
import { AnimatedNumber } from "./AnimatedNumber";

// ── Types ──
interface CreativeData {
  creative_key: string;
  creative_label: string;
  creative_source_field: string;
  leads_count: number;
  mql_count: number;
  clicks: number;
  impressions: number;
  ctl: number | null;
  tier_small_count: number;
  tier_medium_count: number;
  tier_large_count: number;
  tier_enterprise_count: number;
  tier_enterprise_plus_count: number;
  mql_rate: number;
  spend: number;
  cost_per_mql: number | null;
  cost_per_small: number | null;
  cost_per_medium: number | null;
  cost_per_tier_large: number | null;
  cost_per_enterprise: number | null;
  cost_per_enterprise_plus: number | null;
  qualified_count: number;
  cost_per_qualified: number | null;
  sales_count: number;
  sales_sprint_count: number;
  sales_assessoria_count: number;
  cac: number | null;
  revenue: number;
  revenue_sprint: number;
  revenue_assessoria: number;
  revenue_assessoria_received?: number;
  revenue_assessoria_to_receive?: number;
  roas: number | null;
  last_activity: string | null;
  leads_by_stage: Record<string, number>;
  campaigns: string[];
  meetings_count: number;
  meetings_attended_count: number;
  cost_per_meeting: number | null;
  landing_page_views: number;
  lead_per_view: number | null;
  is_active: boolean;
}

interface CreativesResponse {
  creatives: CreativeData[];
  totals: {
    spend: number;
    leads: number;
    mql: number;
    clicks: number;
    impressions: number;
    ctl: number | null;
    tier_small: number;
    tier_medium: number;
    tier_large: number;
    tier_enterprise: number;
    tier_enterprise_plus: number;
    sales: number;
    sales_sprint: number;
    sales_assessoria: number;
    revenue: number;
    revenue_sprint: number;
    revenue_assessoria: number;
    revenue_assessoria_received?: number;
    revenue_assessoria_to_receive?: number;
    meetings: number;
    meetings_attended: number;
    landing_page_views: number;
    lead_per_view: number | null;
    cpl: number | null;
    cpmql: number | null;
    cp_tier_small: number | null;
    cp_tier_medium: number | null;
    cp_tier_large: number | null;
    cp_tier_enterprise: number | null;
    cp_tier_enterprise_plus: number | null;
    cac: number | null;
    roas: number | null;
    cp_meeting: number | null;
  };
  data_quality: {
    leads_with_creative: number;
    leads_total: number;
    spend_mapped: number;
    spend_total: number;
    sales_without_creative: number;
    leads_without_utms: number;
  };
}

interface ManualSale {
  id: string;
  sale_date: string;
  revenue: number;
  lead_id: string | null;
  creative_key: string | null;
  utm_content: string | null;
  notes: string | null;
  sale_type: string;
  lead_created_at?: string | null;
  closer?: string | null;
  payment_type?: string | null;
  installments_count?: number | null;
  installment_value?: number | null;
  amount_received?: number | null;
}

// Links das agendas dos closers (exibidos nos diálogos de reunião).
// Caio: a definir posteriormente.
const CLOSER_CALENDARS: Record<string, string> = {
  Rodger: "https://calendar.app.google/GVHDaqd6VDsJWjHi9",
  Caio: "",
};

interface Meeting {
  id: string;
  creative_key: string | null;
  utm_content: string | null;
  notes: string | null;
  created_at: string;
  attended: boolean;
  closer: string | null;
}

interface LeadOption {
  id: string;
  nome_completo: string;
  whatsapp: string;
  mercado: string;
  utm_content: string | null;
  tier: string | null;
  investimento_faixa?: string | null;
  created_at: string;
  first_opened_at?: string | null;
  estagio_negocio?: string | null;
  sdr_override?: string | null;
}

interface AdSpendEntry {
  id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  utm_content: string | null;
  creative_key: string | null;
}

// ── Helpers ──
function normalizeCreativeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

const MQL_FAT_MIN_FAIXAS = [
  "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
];

function LeadSearchPicker({ leads, loading, selectedId, onSelect, label = "Lead *" }: {
  leads: LeadOption[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = selectedId ? leads.find(l => l.id === selectedId) : null;

  if (loading) {
    return (
      <div>
        <label className="text-sm text-muted-foreground">{label}</label>
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando leads...
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="text-sm text-muted-foreground">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            {selected ? (
              <span className="truncate">
                {selected.nome_completo} <span className="text-muted-foreground text-xs">({selected.whatsapp})</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Pesquisar lead pelo nome...</span>
            )}
            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Digite o nome do lead..." />
            <CommandList>
              <CommandEmpty>Nenhum lead encontrado.</CommandEmpty>
              <CommandGroup>
                {leads.map(l => (
                  <CommandItem
                    key={l.id}
                    value={`${l.nome_completo} ${l.whatsapp}`}
                    onSelect={() => {
                      onSelect(l.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${selectedId === l.id ? "opacity-100" : "opacity-0"}`} />
                    <span className="font-medium">{l.nome_completo}</span>
                    <span className="text-muted-foreground ml-1 text-xs">({l.whatsapp})</span>
                    {l.tier && <span className="ml-1 text-xs text-muted-foreground">[{l.tier}]</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <Button variant="ghost" size="sm" className="mt-1 text-xs h-6" onClick={() => onSelect(null)}>
          <X className="w-3 h-3 mr-1" /> Limpar seleção
        </Button>
      )}
    </div>
  );
}

function isLeadMql(estagio: string, investimento: string | null, sdrOverride?: string | null): boolean {
  if (sdrOverride === "Dara" || sdrOverride === "Miguel") return false;
  const faturaEnough = investimento ? MQL_FAT_MIN_FAIXAS.includes(investimento) : false;
  return faturaEnough;
}

// ── Props ──
interface FunnelMetricsInput {
  visitors: number;
  sessions: number;
  entered_quiz: number;
  completed: number;
  conversion_rate: number;
  step_funnel?: Array<{
    step_id: string;
    count: number;
    label?: string;
    flow?: string;
    flow_index?: number;
    flow_started?: number;
    flow_completed?: number;
  }>;
  quiz_v2_empty?: boolean;
  quiz_v1_present?: boolean;
}

interface CreativesTabProps {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
  startDateOnly: string;
  endDateOnly: string;
  startISO: string;
  endISO: string;
  funnelMetrics?: FunnelMetricsInput | null;
}

export default function CreativesTab({ fetchAdminData, startDateOnly, endDateOnly, startISO, endISO, funnelMetrics }: CreativesTabProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CreativesResponse | null>(null);
  // Slot no header global do /admin para portar as ações (Sync Meta Ads / Gasto / Reunião / Venda / Atualizar)
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // Espera o slot existir; usa rAF para aguardar montagem do header
    let raf = 0;
    const find = () => {
      const el = document.getElementById("admin-header-actions-slot");
      if (el) setHeaderSlot(el);
      else raf = window.requestAnimationFrame(find);
    };
    find();
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      setHeaderSlot(null);
    };
  }, []);
  const [attribution, setAttribution] = useState<"first" | "last">("first");
  const [sortField, setSortField] = useState<string>("mql_count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [drillCreative, setDrillCreative] = useState<CreativeData | null>(null);

  // Drag & drop column ordering (persisted)
  const DEFAULT_COLUMN_ORDER = [
    "creative", "spend", "lpv", "leads", "ctl", "mql_cpmql",
    "qualified_5_10k", "meetings", "booking_rate", "call_conv", "sales_cac",
    "cac_sprint", "cac_assessoria", "win_rate", "revenue", "roas",
  ] as const;
  type ColumnId = (typeof DEFAULT_COLUMN_ORDER)[number];
  const COLUMN_ORDER_KEY = "creatives-tab-column-order-v1";
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(() => {
    if (typeof window === "undefined") return [...DEFAULT_COLUMN_ORDER];
    try {
      const saved = localStorage.getItem(COLUMN_ORDER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ColumnId[];
        const valid = parsed.filter((c) => (DEFAULT_COLUMN_ORDER as readonly string[]).includes(c)) as ColumnId[];
        // Append any new columns missing from saved order
        for (const c of DEFAULT_COLUMN_ORDER) if (!valid.includes(c)) valid.push(c);
        return valid;
      }
    } catch {}
    return [...DEFAULT_COLUMN_ORDER];
  });
  useEffect(() => {
    try { localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(columnOrder)); } catch {}
  }, [columnOrder]);
  const [draggedCol, setDraggedCol] = useState<ColumnId | null>(null);
  const moveColumn = (from: ColumnId, to: ColumnId) => {
    if (from === to) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(from);
      const toIdx = next.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      return next;
    });
  };

  // Filters
  const [filterOnlyActive, setFilterOnlyActive] = useState(false);
  const [filterOnlyWithSpend, setFilterOnlyWithSpend] = useState(false);
  const [filterOnlyWithLeads, setFilterOnlyWithLeads] = useState(false);
  const [filterOnlyWithMql, setFilterOnlyWithMql] = useState(false);
  const [filterOnlyWithSales, setFilterOnlyWithSales] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [campaignTypeFilter, setCampaignTypeFilter] = useState<"all" | "conversao" | "mql">("all");
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [campaignFilterOpen, setCampaignFilterOpen] = useState(false);
  const [selectedCreatives, setSelectedCreatives] = useState<string[]>([]);
  const [creativeFilterOpen, setCreativeFilterOpen] = useState(false);

  // Manual sales form
  const [showAddSale, setShowAddSale] = useState(false);
  const [saleForm, setSaleForm] = useState({
    sale_date: "",
    revenue: "",
    creative_key: "",
    notes: "",
    sale_type: "sprint" as "sprint" | "assessoria",
    closer: "Caio",
    payment_type: "tcv_total" as "tcv_total" | "pix_parcelado" | "recorrencia",
    installments_count: "",
    installment_value: "",
    amount_received: "",
  });
  const [savingSale, setSavingSale] = useState(false);

  // Ad spend form
  const [showAddSpend, setShowAddSpend] = useState(false);
  const [spendForm, setSpendForm] = useState({ date: "", spend: "", impressions: "0", clicks: "0", utm_content: "", campaign_name: "" });
  const [savingSpend, setSavingSpend] = useState(false);
  
  // Sales listing
  const [salesList, setSalesList] = useState<ManualSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [showSalesList, setShowSalesList] = useState(false);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);


  // Meeting state
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ creative_key: "", notes: "", closer: "Caio" });
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [meetingsList, setMeetingsList] = useState<Meeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [showMeetingsList, setShowMeetingsList] = useState(false);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);

  // Edit states
  const [editingSale, setEditingSale] = useState<ManualSale | null>(null);
  const [editSaleForm, setEditSaleForm] = useState({
    revenue: "",
    sale_type: "sprint" as "sprint" | "assessoria",
    notes: "",
    closer: "Caio",
    payment_type: "tcv_total" as "tcv_total" | "pix_parcelado" | "recorrencia",
    installments_count: "",
    installment_value: "",
    amount_received: "",
  });
  const [savingEditSale, setSavingEditSale] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editMeetingForm, setEditMeetingForm] = useState({ notes: "", attended: false, closer: "Caio" });
  const [savingEditMeeting, setSavingEditMeeting] = useState(false);
  const [togglingAttendedId, setTogglingAttendedId] = useState<string | null>(null);

  // Leads for picker
  const [leadsList, setLeadsList] = useState<LeadOption[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [meetingSelectedLeadId, setMeetingSelectedLeadId] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const result = await fetchAdminData("/leads", { from: startISO, to: endISO });
      setLeadsList(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error("Error loading leads:", err);
    } finally {
      setLeadsLoading(false);
    }
  }, [fetchAdminData, startISO, endISO]);

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const result = await fetchAdminData("/manual-sales", { from: startDateOnly, to: endDateOnly });
      setSalesList(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error("Error loading sales:", err);
    } finally {
      setSalesLoading(false);
    }
  }, [fetchAdminData, startDateOnly, endDateOnly]);

  const loadMeetings = useCallback(async () => {
    setMeetingsLoading(true);
    try {
      const result = await fetchAdminData("/meetings", { from: startISO, to: endISO });
      setMeetingsList(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error("Error loading meetings:", err);
    } finally {
      setMeetingsLoading(false);
    }
  }, [fetchAdminData, startISO, endISO]);

  const handleDeleteSale = async (saleId: string) => {
    setDeletingSaleId(saleId);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetchAdmin(`${supabaseUrl}/functions/v1/admin-data/manual-sales/${saleId}`, {
        method: "DELETE",
        headers: { "x-admin-token": getAdminToken() || "" },
      });
      toast({ title: "Venda removida!" });
      setSalesList(prev => prev.filter(s => s.id !== saleId));
      loadData();
    } catch {
      toast({ title: "Erro ao remover venda", variant: "destructive" });
    } finally {
      setDeletingSaleId(null);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        from: startISO,
        to: endISO,
        attribution,
        from_date: startDateOnly,
        to_date: endDateOnly,
      };
      if (campaignTypeFilter !== "all") {
        params.campaign_type = campaignTypeFilter === "mql" ? "mql" : "lead";
      }
      if (selectedCampaigns.length > 0) {
        params.campaigns = selectedCampaigns.join("|||");
      }
      const result = await fetchAdminData("/creatives", params);
      setData(result);
    } catch (err) {
      console.error("Error loading creatives:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchAdminData, startISO, endISO, startDateOnly, endDateOnly, attribution, campaignTypeFilter, selectedCampaigns]);

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      await loadData();
      if (!cancelled) await loadSales();
      if (!cancelled) await loadLeads();
    };

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [loadData, loadSales, loadLeads]);

  useEffect(() => {
    if (showMeetingsList) {
      loadMeetings();
    }
  }, [showMeetingsList, loadMeetings]);


  const selectedSaleLead = selectedLeadId ? leadsList.find(l => l.id === selectedLeadId) : null;
  const selectedMeetingLead = meetingSelectedLeadId ? leadsList.find(l => l.id === meetingSelectedLeadId) : null;

  const handleAddSale = async () => {
    if (!saleForm.revenue) {
      toast({ title: "Preencha a receita", variant: "destructive" });
      return;
    }
    if (!selectedLeadId) {
      toast({ title: "Selecione o lead da venda", description: "Necessário para calcular o ciclo de vendas", variant: "destructive" });
      return;
    }
    setSavingSale(true);
    try {
      const lead = selectedSaleLead;
      const ck = lead?.utm_content ? normalizeCreativeKey(lead.utm_content) : "";
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      await fetchAdminData("/manual-sales", {
        _method: "POST",
        sale_date: today,
        revenue: saleForm.revenue,
        creative_key: ck,
        utm_content: lead?.utm_content || "",
        notes: lead ? `${lead.nome_completo}${saleForm.notes ? ` — ${saleForm.notes}` : ""}` : (saleForm.notes || "Venda sem lead"),
        lead_id: lead?.id || "",
        sale_type: saleForm.sale_type,
        closer: saleForm.closer,
        payment_type: saleForm.payment_type,
        installments_count: saleForm.installments_count,
        installment_value: saleForm.installment_value,
        amount_received: saleForm.amount_received,
      });
      toast({ title: "Venda registrada!" });
      setSaleForm({ sale_date: "", revenue: "", creative_key: "", notes: "", sale_type: "sprint", closer: "Caio", payment_type: "tcv_total", installments_count: "", installment_value: "", amount_received: "" });
      setSelectedLeadId(null);
      setShowAddSale(false);
      loadData();
    } catch {
      toast({ title: "Erro ao salvar venda", variant: "destructive" });
    } finally {
      setSavingSale(false);
    }
  };

  const handleAddMeeting = async () => {
    if (!meetingSelectedLeadId) {
      toast({ title: "Selecione um lead", variant: "destructive" });
      return;
    }
    setSavingMeeting(true);
    try {
      const lead = selectedMeetingLead!;
      const ck = lead.utm_content ? normalizeCreativeKey(lead.utm_content) : "";
      await fetchAdminData("/meetings", {
        _method: "POST",
        creative_key: ck,
        utm_content: lead.utm_content || "",
        notes: `${lead.nome_completo}${meetingForm.notes ? ` — ${meetingForm.notes}` : ""}`,
        lead_id: meetingSelectedLeadId,
        closer: meetingForm.closer,
      });
      toast({ title: "Reunião registrada!" });
      setMeetingForm({ creative_key: "", notes: "", closer: "Caio" });
      setMeetingSelectedLeadId(null);
      setShowAddMeeting(false);
      loadData();
      if (showMeetingsList) loadMeetings();
    } catch {
      toast({ title: "Erro ao salvar reunião", variant: "destructive" });
    } finally {
      setSavingMeeting(false);
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    setDeletingMeetingId(meetingId);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetchAdmin(`${supabaseUrl}/functions/v1/admin-data/meetings/${meetingId}`, {
        method: "DELETE",
        headers: { "x-admin-token": getAdminToken() || "" },
      });
      toast({ title: "Reunião removida!" });
      setMeetingsList(prev => prev.filter(m => m.id !== meetingId));
      loadData();
    } catch {
      toast({ title: "Erro ao remover reunião", variant: "destructive" });
    } finally {
      setDeletingMeetingId(null);
    }
  };

  const handleEditSale = async () => {
    if (!editingSale) return;
    setSavingEditSale(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetchAdmin(`${supabaseUrl}/functions/v1/admin-data/manual-sales/${editingSale.id}`, {
        method: "PUT",
        headers: { "x-admin-token": getAdminToken() || "", "Content-Type": "application/json" },
        body: JSON.stringify({
          revenue: editSaleForm.revenue,
          sale_type: editSaleForm.sale_type,
          notes: editSaleForm.notes,
          closer: editSaleForm.closer,
          payment_type: editSaleForm.payment_type,
          installments_count: editSaleForm.installments_count,
          installment_value: editSaleForm.installment_value,
          amount_received: editSaleForm.amount_received,
        }),
      });
      toast({ title: "Venda atualizada!" });
      setSalesList(prev => prev.map(s => s.id === editingSale.id ? {
        ...s,
        revenue: parseFloat(editSaleForm.revenue),
        sale_type: editSaleForm.sale_type,
        notes: editSaleForm.notes,
        closer: editSaleForm.closer,
        payment_type: editSaleForm.payment_type,
        installments_count: editSaleForm.installments_count ? parseInt(editSaleForm.installments_count) : null,
        installment_value: editSaleForm.installment_value ? parseFloat(editSaleForm.installment_value) : null,
        amount_received: editSaleForm.amount_received ? parseFloat(editSaleForm.amount_received) : 0,
      } : s));
      setEditingSale(null);
      loadData();
    } catch {
      toast({ title: "Erro ao atualizar venda", variant: "destructive" });
    } finally {
      setSavingEditSale(false);
    }
  };

  const handleEditMeeting = async () => {
    if (!editingMeeting) return;
    setSavingEditMeeting(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetchAdmin(`${supabaseUrl}/functions/v1/admin-data/meetings/${editingMeeting.id}`, {
        method: "PUT",
        headers: { "x-admin-token": getAdminToken() || "", "Content-Type": "application/json" },
        body: JSON.stringify({ notes: editMeetingForm.notes, attended: editMeetingForm.attended, closer: editMeetingForm.closer }),
      });
      toast({ title: "Reunião atualizada!" });
      setMeetingsList(prev => prev.map(m => m.id === editingMeeting.id ? { ...m, notes: editMeetingForm.notes, attended: editMeetingForm.attended, closer: editMeetingForm.closer } : m));
      setEditingMeeting(null);
      loadData();
    } catch {
      toast({ title: "Erro ao atualizar reunião", variant: "destructive" });
    } finally {
      setSavingEditMeeting(false);
    }
  };

  const handleToggleAttended = async (meeting: Meeting) => {
    setTogglingAttendedId(meeting.id);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetchAdmin(`${supabaseUrl}/functions/v1/admin-data/meetings/${meeting.id}`, {
        method: "PUT",
        headers: { "x-admin-token": getAdminToken() || "", "Content-Type": "application/json" },
        body: JSON.stringify({ attended: !meeting.attended }),
      });
      setMeetingsList(prev => prev.map(m => m.id === meeting.id ? { ...m, attended: !m.attended } : m));
      loadData();
    } catch {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    } finally {
      setTogglingAttendedId(null);
    }
  };

  const handleAddSpend = async () => {
    if (!spendForm.date || !spendForm.spend) {
      toast({ title: "Preencha data e gasto", variant: "destructive" });
      return;
    }
    setSavingSpend(true);
    try {
      const ck = spendForm.utm_content ? normalizeCreativeKey(spendForm.utm_content) : null;
      await fetchAdminData("/ad-spend", {
        _method: "POST",
        date: spendForm.date,
        spend: spendForm.spend,
        impressions: spendForm.impressions,
        clicks: spendForm.clicks,
        utm_content: spendForm.utm_content || "",
        creative_key: ck || "",
        campaign_name: spendForm.campaign_name || "",
      });
      toast({ title: "Gasto registrado!" });
      setSpendForm({ date: "", spend: "", impressions: "0", clicks: "0", utm_content: "", campaign_name: "" });
      setShowAddSpend(false);
      loadData();
    } catch {
      toast({ title: "Erro ao salvar gasto", variant: "destructive" });
    } finally {
      setSavingSpend(false);
    }
  };

  const handleMetaSync = async () => {
    setSyncing(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetchAdmin(`${supabaseUrl}/functions/v1/meta-ads-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": getAdminToken() || "",
        },
        body: JSON.stringify({ date_from: startDateOnly, date_to: endDateOnly }),
      });
      const result = await res.json();
      if (result.error) {
        toast({ title: "Erro ao sincronizar", description: result.error, variant: "destructive" });
      } else {
        toast({ title: "Meta Ads sincronizado!", description: `${result.inserted} registros importados (${result.date_from} a ${result.date_to})` });
        loadData();
      }
    } catch (err) {
      toast({ title: "Erro ao sincronizar Meta Ads", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const [sendingCapiRetro, setSendingCapiRetro] = useState<string | null>(null);

  const handleCapiRetroactive = async (type: "meetings" | "tiers" | "purchases" | "mqls") => {
    setSendingCapiRetro(type);
    try {
      const result = await fetchAdminData(`/capi-retroactive-${type}`, { _method: "POST" });
      toast({
        title: `CAPI ${type} retroativo concluído`,
        description: `Enviados: ${result.sent}, Falhas: ${result.failed}${result.skipped != null ? `, Ignorados: ${result.skipped}` : ""} (Total: ${result.total})`,
      });
    } catch {
      toast({ title: `Erro ao enviar CAPI ${type}`, variant: "destructive" });
    } finally {
      setSendingCapiRetro(null);
    }
  };


  // Extract unique campaign names for filter
  const allCampaignNames = useMemo(() => {
    const names = new Set<string>();
    (data?.creatives || []).forEach(c => c.campaigns.forEach(camp => names.add(camp)));
    return Array.from(names).sort();
  }, [data]);

  const toggleCampaign = (camp: string) => {
    setSelectedCampaigns(prev =>
      prev.includes(camp) ? prev.filter(c => c !== camp) : [...prev, camp]
    );
  };

  // Extract unique creative keys for filter
  const allCreativeKeys = useMemo(() => {
    const keys = new Set<string>();
    (data?.creatives || []).forEach(c => {
      if (c.creative_key) keys.add(c.creative_key);
    });
    return Array.from(keys).sort();
  }, [data]);

  const toggleCreative = (key: string) => {
    setSelectedCreatives(prev =>
      prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
    );
  };

  // ── Per-creative extras: CAC by type, win rate, sales cycle, call→sale conversion ──
  const creativeExtrasRaw = useMemo(() => {
    const map = new Map<string, {
      cacSprint: number | null;
      cacAssessoria: number | null;
      winRate: number | null;
      cycleDays: number | null;
      cycleCount: number;
      callConvRate: number | null;
      bookingRate: number | null;
    }>();

    for (const c of (data?.creatives || [])) {
      const sprintCount = c.sales_sprint_count || 0;
      const assesCount = c.sales_assessoria_count || 0;
      const cacSprint = sprintCount > 0 && c.spend > 0 ? c.spend / sprintCount : null;
      const cacAssessoria = assesCount > 0 && c.spend > 0 ? c.spend / assesCount : null;
      const winRate = c.mql_count > 0 ? c.sales_count / c.mql_count : null;

      const days: number[] = [];
      for (const s of salesList) {
        if (!s.creative_key || s.creative_key !== c.creative_key) continue;
        if (!s.lead_created_at || !s.sale_date) continue;
        const leadDate = new Date(s.lead_created_at);
        const saleDate = new Date(s.sale_date + "T12:00:00Z");
        if (isNaN(leadDate.getTime()) || isNaN(saleDate.getTime())) continue;
        days.push(Math.max(0, Math.round((saleDate.getTime() - leadDate.getTime()) / 86400000)));
      }
      const cycleDays = days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : null;
      const callConvRate = c.meetings_count > 0 ? (c.sales_assessoria_count || 0) / c.meetings_count : null;
      const bookingRate = c.mql_count > 0 ? c.meetings_count / c.mql_count : null;

      map.set(c.creative_key, { cacSprint, cacAssessoria, winRate, cycleDays, cycleCount: days.length, callConvRate, bookingRate });
    }
    return map;
  }, [data?.creatives, salesList]);

  const creatives = (data?.creatives || [])
    .filter(c => {
      if (filterOnlyActive && !c.is_active) return false;
      if (filterOnlyWithSpend && c.spend <= 0) return false;
      if (filterOnlyWithLeads && c.leads_count <= 0) return false;
      if (filterOnlyWithMql && c.mql_count <= 0) return false;
      if (filterOnlyWithSales && c.sales_count <= 0) return false;
      if (selectedCampaigns.length > 0 && !c.campaigns.some(camp => selectedCampaigns.includes(camp))) return false;
      if (selectedCreatives.length > 0 && !selectedCreatives.includes(c.creative_key)) return false;
      return true;
    })
    .sort((a, b) => {
      const getValue = (c: CreativeData) => {
        if (sortField === "cpl") return c.spend > 0 && c.leads_count > 0 ? c.spend / c.leads_count : null;
        if (sortField === "ctl") return c.clicks > 0 ? (c.leads_count / c.clicks) * 100 : null;
        const extras = creativeExtrasRaw.get(c.creative_key);
        if (sortField === "call_conv_rate") return extras?.callConvRate ?? null;
        if (sortField === "booking_rate") return extras?.bookingRate ?? null;
        if (sortField === "cac_sprint") return extras?.cacSprint ?? null;
        if (sortField === "cac_assessoria") return extras?.cacAssessoria ?? null;
        if (sortField === "win_rate") return extras?.winRate ?? null;
        if (sortField === "cycle_days") return extras?.cycleDays ?? null;
        return (c as any)[sortField] ?? null;
      };
      const aVal = getValue(a) ?? -Infinity;
      const bVal = getValue(b) ?? -Infinity;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });

  // Find top creatives
  const topMql = creatives.length > 0 ? creatives.reduce((best, c) => c.mql_count > best.mql_count ? c : best, creatives[0]) : null;
  const topRevenue = creatives.length > 0 ? creatives.reduce((best, c) => c.revenue > best.revenue ? c : best, creatives[0]) : null;
  const topSales = creatives.length > 0 ? creatives.reduce((best, c) => c.sales_count > best.sales_count ? c : best, creatives[0]) : null;
  const topMeetings = creatives.length > 0 ? creatives.reduce((best, c) => c.meetings_count > best.meetings_count ? c : best, creatives[0]) : null;
  const bestCpmql = creatives.filter(c => c.cost_per_mql !== null && c.cost_per_mql > 0).sort((a, b) => (a.cost_per_mql || Infinity) - (b.cost_per_mql || Infinity))[0] || null;

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDir === "desc" ? <ChevronDown className="w-3 h-3 inline ml-1" /> : <ChevronUp className="w-3 h-3 inline ml-1" />;
  };

  const totals = data?.totals;
  const dq = data?.data_quality;

  const creativeExtras = creativeExtrasRaw;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={attribution} onValueChange={(v) => setAttribution(v as "first" | "last")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="first">Atribuição: First Touch</SelectItem>
            <SelectItem value="last">Atribuição: Last Touch</SelectItem>
          </SelectContent>
        </Select>

        <Select value={campaignTypeFilter} onValueChange={(v) => setCampaignTypeFilter(v as "all" | "conversao" | "mql")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Campanha: Todas</SelectItem>
            <SelectItem value="conversao">Campanha: Conversão</SelectItem>
            <SelectItem value="mql">Campanha: MQL</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}>
          Filtros {showAdvancedFilters ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
        </Button>

        {/* Campaign name filter */}
        {allCampaignNames.length > 0 && (
          <Popover open={campaignFilterOpen} onOpenChange={setCampaignFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[160px] justify-between font-normal">
                {selectedCampaigns.length > 0 ? (
                  <span className="truncate">{selectedCampaigns.length} campanha{selectedCampaigns.length > 1 ? "s" : ""}</span>
                ) : (
                  <span className="text-muted-foreground">Filtrar campanhas</span>
                )}
                <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar campanha..." />
                <CommandList>
                  <CommandEmpty>Nenhuma campanha encontrada.</CommandEmpty>
                  <CommandGroup>
                    {allCampaignNames.map(camp => (
                      <CommandItem key={camp} value={camp} onSelect={() => toggleCampaign(camp)}>
                        <Check className={`mr-2 h-4 w-4 ${selectedCampaigns.includes(camp) ? "opacity-100" : "opacity-0"}`} />
                        <span className="truncate text-xs">{camp}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
              {selectedCampaigns.length > 0 && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedCampaigns([])}>
                    <X className="w-3 h-3 mr-1" /> Limpar filtro
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}

        {/* Creative key filter */}
        {allCreativeKeys.length > 0 && (
          <Popover open={creativeFilterOpen} onOpenChange={setCreativeFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[160px] justify-between font-normal">
                {selectedCreatives.length > 0 ? (
                  <span className="truncate">{selectedCreatives.length} criativo{selectedCreatives.length > 1 ? "s" : ""}</span>
                ) : (
                  <span className="text-muted-foreground">Filtrar criativos</span>
                )}
                <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar criativo..." />
                <CommandList>
                  <CommandEmpty>Nenhum criativo encontrado.</CommandEmpty>
                  <CommandGroup>
                    {allCreativeKeys.map(key => (
                      <CommandItem key={key} value={key} onSelect={() => toggleCreative(key)}>
                        <Check className={`mr-2 h-4 w-4 ${selectedCreatives.includes(key) ? "opacity-100" : "opacity-0"}`} />
                        <span className="truncate text-xs">{key}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
              {selectedCreatives.length > 0 && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedCreatives([])}>
                    <X className="w-3 h-3 mr-1" /> Limpar filtro
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}

        {/* Ações foram movidas para o header global (#admin-header-actions-slot) via portal abaixo. */}
      </div>

      {/* Portal: ações renderizadas no header do /admin, ao lado do seletor de datas */}
      {headerSlot &&
        createPortal(
          <>
            <Button variant="default" size="sm" onClick={handleMetaSync} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              {syncing ? "Sincronizando..." : "Sync Meta Ads"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddSpend(true)}>
              <Plus className="w-4 h-4 mr-1" /> Gasto
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddMeeting(true)}>
              <Calendar className="w-4 h-4 mr-1" /> Reunião
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddSale(true)}>
              <Plus className="w-4 h-4 mr-1" /> Venda
            </Button>
            <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Atualizar"}
            </Button>
          </>,
          headerSlot
        )}

      {/* Advanced filters */}
      {showAdvancedFilters && (
        <Card>
          <CardContent className="pt-4 flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={filterOnlyActive} onCheckedChange={setFilterOnlyActive} />
              Somente ativos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={filterOnlyWithSpend} onCheckedChange={setFilterOnlyWithSpend} />
              Somente com gasto
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={filterOnlyWithLeads} onCheckedChange={setFilterOnlyWithLeads} />
              Somente com leads
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={filterOnlyWithMql} onCheckedChange={setFilterOnlyWithMql} />
              Somente com MQL
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={filterOnlyWithSales} onCheckedChange={setFilterOnlyWithSales} />
              Somente com vendas
            </label>
          </CardContent>
        </Card>
      )}

      {/* Registrar venda */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setShowAddSale(true)}>
          <Plus className="w-4 h-4 mr-1" /> Venda
        </Button>
      </div>

      {/* Summary Cards - Grouped Blocks */}
      {totals && (() => {
        const scheduleRate = totals.mql > 0 ? (totals.meetings / totals.mql) * 100 : null;
        const callConversion = totals.meetings_attended > 0 ? ((totals.sales_assessoria || 0) / totals.meetings_attended) * 100 : null;
        const avgSprint = totals.sales_sprint > 0 ? totals.revenue_sprint / totals.sales_sprint : 0;
        const avgAssessoria = totals.sales_assessoria > 0 ? totals.revenue_assessoria / totals.sales_assessoria : 0;
        const avgTotal = totals.sales > 0 ? totals.revenue / totals.sales : 0;
        const cacSprint = (totals.sales_sprint || 0) > 0 && totals.spend > 0 ? totals.spend / (totals.sales_sprint || 0) : null;
        const cacAssessoria = (totals.sales_assessoria || 0) > 0 && totals.spend > 0 ? totals.spend / (totals.sales_assessoria || 0) : null;
        const cacTotalVal = (totals.sales || 0) > 0 && totals.spend > 0 ? totals.spend / (totals.sales || 0) : null;
        const roasSprint = totals.spend > 0 ? (totals.revenue_sprint || 0) / totals.spend : null;
        const roasAssessoria = totals.spend > 0 ? (totals.revenue_assessoria || 0) / totals.spend : null;
        const roasTotalVal = totals.spend > 0 ? (totals.revenue || 0) / totals.spend : null;
        // Leads R$ 5 mil a R$ 10 mil (tier Medium) — usado para CPL ≥5k
        const qualifiedLeads = leadsList.filter(
          (lead) => (lead.investimento_faixa || "") === "De R$ 5 mil a R$ 10 mil"
        ).length;
        const winRateVal = qualifiedLeads > 0 ? (totals.sales / qualifiedLeads) * 100 : 0;

        // ── Win rate por tipo (período filtrado)
        const sprintLeadsCount = leadsList.filter(
          (l) => (l.investimento_faixa || "") === "De R$ 5 mil a R$ 10 mil"
        ).length;
        const mqlLeadsCount = leadsList.filter(
          (l) => MQL_FAT_MIN_FAIXAS.includes(l.investimento_faixa || "")
        ).length;
        const sprintWinRate = sprintLeadsCount > 0
          ? ((totals.sales_sprint || 0) / sprintLeadsCount) * 100
          : null;
        const assessoriaWinRate = mqlLeadsCount > 0
          ? ((totals.sales_assessoria || 0) / mqlLeadsCount) * 100
          : null;
        const totalQualified = sprintLeadsCount + mqlLeadsCount;
        const totalWinRate = totalQualified > 0
          ? (((totals.sales_sprint || 0) + (totals.sales_assessoria || 0)) / totalQualified) * 100
          : null;

        // ── Ciclo de vendas (período filtrado): dias entre lead.created_at e sale.sale_date
        const calcCycle = (filterFn: (s: ManualSale) => boolean): { avg: number | null; count: number } => {
          const days: number[] = [];
          for (const s of salesList) {
            if (!filterFn(s)) continue;
            if (!s.lead_created_at || !s.sale_date) continue;
            const leadDate = new Date(s.lead_created_at);
            const saleDate = new Date(s.sale_date + "T12:00:00");
            if (isNaN(leadDate.getTime()) || isNaN(saleDate.getTime())) continue;
            const diff = Math.max(0, Math.round((saleDate.getTime() - leadDate.getTime()) / 86400000));
            days.push(diff);
          }
          return {
            avg: days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : null,
            count: days.length,
          };
        };
        const cycleSprint = calcCycle((s) => s.sale_type === "sprint");
        const cycleAssessoria = calcCycle((s) => s.sale_type === "assessoria");
        const cycleTotal = calcCycle(() => true);
        const fmtCycle = (c: { avg: number | null; count: number }): string =>
          c.avg != null ? `${c.avg.toFixed(1)} dias` : "—";
        const fmtCycleSub = (c: { avg: number | null; count: number }): string =>
          c.count > 0 ? `${c.count} venda${c.count > 1 ? "s" : ""} c/ lead vinculado` : "Sem dados";

        // ── Tempo de resposta (created_at → first_opened_at + 10s margem)
        // Conta APENAS minutos dentro do horário comercial (9h–20h, America/Sao_Paulo, todos os dias).
        // Leads que chegam fora do expediente "começam a contar" às 9h do próximo dia útil de atendimento.
        const RESPONSE_MARGIN_MS = 10_000;
        const BUSINESS_START_HOUR = 9;
        const BUSINESS_END_HOUR = 20; // exclusivo: janela é [9h, 20h)
        const BR_TZ_OFFSET_MS = -3 * 60 * 60 * 1000; // BRT (UTC-3)

        // Converte um instante UTC para "ms desde epoch" no relógio de São Paulo.
        const toBrClockMs = (utcMs: number) => utcMs + BR_TZ_OFFSET_MS;
        const fromBrClockMs = (brMs: number) => brMs - BR_TZ_OFFSET_MS;

        // Retorna o início (ms UTC) da janela comercial do dia que contém `brMs`.
        const businessStartOfDay = (brMs: number) => {
          const d = new Date(brMs);
          const dayStartBr = Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            BUSINESS_START_HOUR, 0, 0, 0
          );
          return dayStartBr;
        };
        const businessEndOfDay = (brMs: number) => {
          const d = new Date(brMs);
          return Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            BUSINESS_END_HOUR, 0, 0, 0
          );
        };

        // Calcula ms entre dois instantes UTC contando apenas dentro de [9h,20h) BR.
        const businessHoursDiffMs = (startUtcMs: number, endUtcMs: number): number => {
          if (endUtcMs <= startUtcMs) return 0;
          let startBr = toBrClockMs(startUtcMs);
          const endBr = toBrClockMs(endUtcMs);
          let total = 0;
          // Limite de segurança: no máximo 60 dias de varredura.
          for (let i = 0; i < 60 && startBr < endBr; i++) {
            const dayStart = businessStartOfDay(startBr);
            const dayEnd = businessEndOfDay(startBr);
            const windowStart = Math.max(startBr, dayStart);
            const windowEnd = Math.min(endBr, dayEnd);
            if (windowEnd > windowStart) total += windowEnd - windowStart;
            // Avança para 9h do próximo dia.
            const nextDay = new Date(dayStart);
            nextDay.setUTCDate(nextDay.getUTCDate() + 1);
            startBr = nextDay.getTime();
          }
          return total;
        };

        const calcAvgResponse = (filterFn: (l: LeadOption) => boolean): string => {
          const opened = leadsList.filter(
            (l) => filterFn(l) && l.first_opened_at && l.created_at
          );
          if (opened.length === 0) return "—";
          const totalMs = opened.reduce((sum, l) => {
            const startUtc = new Date(l.created_at).getTime();
            const endUtc = new Date(l.first_opened_at!).getTime();
            const diff = businessHoursDiffMs(startUtc, endUtc);
            return sum + diff + RESPONSE_MARGIN_MS;
          }, 0);
          const avgSec = Math.round(totalMs / opened.length / 1000);
          if (avgSec < 60) return `${avgSec}s`;
          const m = Math.floor(avgSec / 60);
          const s = avgSec % 60;
          if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
          const h = Math.floor(m / 60);
          const rm = m % 60;
          return `${h}h ${rm}m`;
        };
        const isQualifiedLead = (l: LeadOption) => {
          const f = l.investimento_faixa || null;
          return !!f && !["Não vendo ainda (R$0/mês)", "Até R$ 5 mil"].includes(f);
        };
        const isMqlLead = (l: LeadOption) =>
          isLeadMql(l.estagio_negocio || "", l.investimento_faixa || null, l.sdr_override || null);
        const avgResponseAll = calcAvgResponse(() => true);
        const avgResponse5k = calcAvgResponse(isQualifiedLead);
        const avgResponseMql = calcAvgResponse(isMqlLead);

        const MetricItem = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className={`text-lg font-bold ${color || ""}`}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
          </div>
        );

        return (
        <div className="space-y-4">
          {/* Row 1: Tráfego + MQLs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tráfego */}
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">Tráfego</p>
                <div className="grid grid-cols-5 gap-4">
                  <MetricItem label="Total Spend" value={formatCurrency(totals.spend) || "—"} />
                  <MetricItem
                    label="LPV"
                    value={formatNumber(totals.landing_page_views || 0)}
                    color="text-sky-400"
                    sub="Landing Page Views (Pixel)"
                  />
                  <MetricItem
                    label="Total Leads"
                    value={formatNumber(totals.leads)}
                    sub={`⏱ Resp: ${avgResponseAll}${funnelMetrics && funnelMetrics.completed > 0 ? ` · ${((totals.leads / funnelMetrics.completed) * 100).toFixed(1)}% conclusões` : ""}`}
                  />
                  <MetricItem label="CPL" value={formatCurrency(totals.cpl) || "—"} sub="Spend ÷ Leads" />
                  <MetricItem
                    label="CTL"
                    value={totals.ctl !== null && totals.ctl !== undefined ? `${totals.ctl.toFixed(2)}%` : "—"}
                    color="text-emerald-400"
                    sub={`Leads ÷ Cliques · ${formatNumber(totals.clicks || 0)} cliques`}
                  />
                </div>
              </CardContent>
            </Card>
            {/* MQLs */}
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">MQLs</p>
                <div className="grid grid-cols-6 gap-4">
                  <MetricItem label="% MQL" value={totals.leads > 0 ? `${((totals.mql / totals.leads) * 100).toFixed(1)}%` : "—"} color="text-green-300" sub="Leads → MQL" />
                  <MetricItem label="Total MQL" value={formatNumber(totals.mql)} color="text-green-400" sub={`⏱ Resp: ${avgResponseMql}`} />
                  <MetricItem label="Leads ≥5k" value={formatNumber(qualifiedLeads)} color="text-cyan-300" sub={`⏱ Resp: ${avgResponse5k}`} />
                  <MetricItem label="CPMQL" value={formatCurrency(totals.cpmql) || "—"} />
                  <MetricItem label="CPL ≥5k" value={qualifiedLeads > 0 ? formatCurrency(totals.spend / qualifiedLeads) || "—" : "—"} color="text-cyan-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Tiers */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">Tiers (% sobre total de leads)</p>
              <div className="grid grid-cols-5 gap-4">
                <MetricItem label="Small" value={formatNumber(totals.tier_small)} sub={`${totals.leads > 0 ? ((totals.tier_small / totals.leads) * 100).toFixed(1) : "0.0"}% · ${formatCurrency(totals.cp_tier_small) || "—"}`} />
                <MetricItem label="Medium" value={formatNumber(totals.tier_medium)} color="text-blue-400" sub={`${totals.leads > 0 ? ((totals.tier_medium / totals.leads) * 100).toFixed(1) : "0.0"}% · ${formatCurrency(totals.cp_tier_medium) || "—"}`} />
                <MetricItem label="Large" value={formatNumber(totals.tier_large)} color="text-amber-400" sub={`${totals.leads > 0 ? ((totals.tier_large / totals.leads) * 100).toFixed(1) : "0.0"}% · ${formatCurrency(totals.cp_tier_large) || "—"}`} />
                <MetricItem label="Enterprise" value={formatNumber(totals.tier_enterprise)} color="text-purple-400" sub={`${totals.leads > 0 ? ((totals.tier_enterprise / totals.leads) * 100).toFixed(1) : "0.0"}% · ${formatCurrency(totals.cp_tier_enterprise) || "—"}`} />
                <MetricItem label="Enterprise+" value={formatNumber(totals.tier_enterprise_plus)} color="text-pink-400" sub={`${totals.leads > 0 ? ((totals.tier_enterprise_plus / totals.leads) * 100).toFixed(1) : "0.0"}% · ${formatCurrency(totals.cp_tier_enterprise_plus) || "—"}`} />
              </div>
            </CardContent>
          </Card>

          {/* Row 3: Reuniões */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3 border-b border-border/50 pb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reuniões</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setShowMeetingsList(!showMeetingsList);
                  }}
                >
                  {showMeetingsList ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                  {showMeetingsList ? "Ocultar" : "Ver reuniões"}
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <MetricItem label="Taxa Agendamento" value={scheduleRate !== null ? `${scheduleRate.toFixed(1)}%` : "—"} color="text-yellow-400" sub="MQL → Reuniões" />
                <MetricItem label="Agendadas" value={formatNumber(totals.meetings)} color="text-orange-400" sub={formatCurrency(totals.cp_meeting) || undefined} />
                <MetricItem label="Realizadas" value={formatNumber(totals.meetings_attended || 0)} color="text-emerald-400" sub={totals.meetings > 0 ? `${((totals.meetings_attended || 0) / totals.meetings * 100).toFixed(0)}% show rate` : "—"} />
                <MetricItem label="Conversão Call" value={callConversion !== null ? `${callConversion.toFixed(1)}%` : "—"} color="text-cyan-400" sub="Realizadas → Assessoria" />
              </div>
              {showMeetingsList && (
                <div className="mt-4 border-t border-border/50 pt-4">
                  {meetingsLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : meetingsList.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6">Nenhuma reunião registrada no período.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Criativo</TableHead>
                          <TableHead>Closer</TableHead>
                          <TableHead>Observação</TableHead>
                          <TableHead>Realizada</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {meetingsList.map((meeting) => (
                          <TableRow key={meeting.id}>
                            <TableCell>{format(new Date(meeting.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                            <TableCell>
                              {meeting.utm_content || meeting.creative_key ? (
                                <Badge variant="outline" className="text-xs">{meeting.utm_content || meeting.creative_key}</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {meeting.closer ? (
                                <Badge variant="outline" className="text-xs">{meeting.closer}</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{meeting.notes || "—"}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleAttended(meeting)}
                                disabled={togglingAttendedId === meeting.id}
                                className={meeting.attended ? "text-emerald-400" : "text-muted-foreground"}
                              >
                                {togglingAttendedId === meeting.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : meeting.attended ? (
                                  <><Check className="w-4 h-4 mr-1" /> Sim</>
                                ) : (
                                  <><X className="w-4 h-4 mr-1" /> Não</>
                                )}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingMeeting(meeting);
                                    setEditMeetingForm({ notes: meeting.notes || "", attended: !!meeting.attended, closer: meeting.closer || "Caio" });
                                  }}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteMeeting(meeting.id)}
                                  disabled={deletingMeetingId === meeting.id}
                                >
                                  {deletingMeetingId === meeting.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Row 4: Vendas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Sprint */}
            <Card className="border-violet-500/20">
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 border-b border-violet-500/20 pb-2">Sprint</p>
                <div className="grid grid-cols-2 gap-4">
                  <MetricItem
                    label="Vendas"
                    value={`${formatNumber(totals.sales_sprint || 0)}`}
                    color="text-violet-400"
                    sub={`${formatCurrency(totals.revenue_sprint || 0) || "—"} · ${qualifiedLeads > 0 ? (((totals.sales_sprint || 0) / qualifiedLeads) * 100).toFixed(1) : "0.0"}% leads ≥5k`}
                  />
                  <MetricItem label="Ticket Médio" value={avgSprint > 0 ? formatCurrency(avgSprint) || "—" : "—"} color="text-violet-300" />
                  <MetricItem label="Ciclo de Vendas" value={fmtCycle(cycleSprint)} color="text-violet-300" sub={fmtCycleSub(cycleSprint)} />
                  <MetricItem
                    label="Win Rate"
                    value={sprintWinRate != null ? `${sprintWinRate.toFixed(1)}%` : "—"}
                    color="text-violet-300"
                    sub={`${totals.sales_sprint || 0} / ${sprintLeadsCount} leads sprint`}
                  />
                  <MetricItem label="CAC" value={cacSprint !== null ? formatCurrency(cacSprint) || "—" : "—"} color="text-violet-300" sub="Spend ÷ Vendas Sprint" />
                  <MetricItem label="ROAS" value={roasSprint !== null ? `${roasSprint.toFixed(2)}x` : "—"} color="text-violet-300" sub="Receita Sprint ÷ Spend" />
                </div>
              </CardContent>
            </Card>
            {/* Assessoria */}
            <Card className="border-teal-500/20">
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-teal-400 uppercase tracking-wider mb-3 border-b border-teal-500/20 pb-2">Assessoria</p>
                <div className="grid grid-cols-2 gap-4">
                  <MetricItem
                    label="Vendas"
                    value={`${formatNumber(totals.sales_assessoria || 0)}`}
                    color="text-teal-400"
                    sub={`${formatCurrency(totals.revenue_assessoria || 0) || "—"} · ${totals.mql > 0 ? (((totals.sales_assessoria || 0) / totals.mql) * 100).toFixed(1) : "0.0"}% MQLs`}
                  />
                  <MetricItem label="Ticket Médio" value={avgAssessoria > 0 ? formatCurrency(avgAssessoria) || "—" : "—"} color="text-teal-300" />
                  <MetricItem label="Ciclo de Vendas" value={fmtCycle(cycleAssessoria)} color="text-teal-300" sub={fmtCycleSub(cycleAssessoria)} />
                  <MetricItem
                    label="Win Rate"
                    value={assessoriaWinRate != null ? `${assessoriaWinRate.toFixed(1)}%` : "—"}
                    color="text-teal-300"
                    sub={`${totals.sales_assessoria || 0} / ${mqlLeadsCount} MQLs`}
                  />
                  <MetricItem label="CAC" value={cacAssessoria !== null ? formatCurrency(cacAssessoria) || "—" : "—"} color="text-teal-300" sub="Spend ÷ Vendas Assessoria" />
                  <MetricItem label="ROAS" value={roasAssessoria !== null ? `${roasAssessoria.toFixed(2)}x` : "—"} color="text-teal-300" sub="Receita Assessoria ÷ Spend" />
                </div>
              </CardContent>
            </Card>
            {/* Totais */}
            <Card className="border-emerald-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3 border-b border-emerald-500/20 pb-2">
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Total</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setShowSalesList(!showSalesList);
                      if (!showSalesList) loadSales();
                    }}
                  >
                    {showSalesList ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                    {showSalesList ? "Ocultar" : "Ver vendas"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <MetricItem
                    label="Vendas"
                    value={`${formatNumber(totals.sales)}`}
                    color="text-emerald-400"
                    sub={`${formatCurrency(totals.revenue) || "—"} · ${totals.leads > 0 ? ((totals.sales / totals.leads) * 100).toFixed(2) : "0.00"}% leads`}
                  />
                  <MetricItem label="Ticket Médio" value={avgTotal > 0 ? formatCurrency(avgTotal) || "—" : "—"} color="text-emerald-300" />
                  <MetricItem label="Ciclo de Vendas" value={fmtCycle(cycleTotal)} color="text-emerald-300" sub={fmtCycleSub(cycleTotal)} />
                  <MetricItem
                    label="Win Rate"
                    value={totalWinRate != null ? `${totalWinRate.toFixed(1)}%` : "—"}
                    color="text-emerald-300"
                    sub={`${(totals.sales_sprint || 0) + (totals.sales_assessoria || 0)} / ${totalQualified} leads (Sprint + MQL)`}
                  />
                  <MetricItem label="CAC" value={cacTotalVal !== null ? formatCurrency(cacTotalVal) || "—" : "—"} color="text-emerald-300" sub="Spend ÷ Vendas" />
                  <MetricItem label="ROAS" value={roasTotalVal !== null ? `${roasTotalVal.toFixed(2)}x` : "—"} color="text-emerald-300" sub="Receita ÷ Spend" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sales table inline (expanded under Total card) */}
          {showSalesList && (
            <Card>
              <CardContent className="pt-4">
                {salesLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : salesList.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">Nenhuma venda registrada no período.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Receita</TableHead>
                        <TableHead>Criativo</TableHead>
                        <TableHead>Notas</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesList.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell>{format(new Date(sale.sale_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${sale.sale_type === "assessoria" ? "border-teal-500/50 text-teal-400" : "border-violet-500/50 text-violet-400"}`}>
                              {sale.sale_type === "assessoria" ? "Assessoria" : "Sprint"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(sale.revenue)}</TableCell>
                          <TableCell>
                            {sale.utm_content || sale.creative_key ? (
                              <Badge variant="outline" className="text-xs">{sale.utm_content || sale.creative_key}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{sale.notes || "—"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingSale(sale);
                                  setEditSaleForm({
                                    revenue: String(sale.revenue),
                                    sale_type: (sale.sale_type || "sprint") as "sprint" | "assessoria",
                                    notes: sale.notes || "",
                                    closer: sale.closer || "Caio",
                                    payment_type: ((sale.payment_type as "tcv_total" | "pix_parcelado" | "recorrencia") || "tcv_total"),
                                    installments_count: sale.installments_count != null ? String(sale.installments_count) : "",
                                    installment_value: sale.installment_value != null ? String(sale.installment_value) : "",
                                    amount_received: sale.amount_received != null ? String(sale.amount_received) : "",
                                  });
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteSale(sale.id)}
                                disabled={deletingSaleId === sale.id}
                              >
                                {deletingSaleId === sale.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

        </div>
        );
      })()}

      {/* Ranking Cards */}

      {/* Main Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance por Criativo
              <span className="text-sm font-normal text-muted-foreground">({creatives.length})</span>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-[10px] h-7"
              onClick={() => setColumnOrder([...DEFAULT_COLUMN_ORDER])}
              title="Restaurar ordem padrão das colunas"
            >
              <GripVertical className="w-3 h-3 mr-1" />
              Resetar colunas
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {creatives.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              Nenhum criativo encontrado no período. Verifique se os leads possuem utm_content preenchido.
            </p>
          ) : (
            (() => {
              type ColDef = {
                id: ColumnId;
                label: string;
                title?: string;
                width: string;
                sortField?: string;
                align?: "left" | "right";
                draggable?: boolean;
                renderCell: (c: CreativeData, ctx: { isBestCpmql2: boolean; i: number }) => JSX.Element;
              };
              const COLUMN_DEFS: Record<ColumnId, ColDef> = {
                creative: {
                  id: "creative", label: "Campanha / Criativo", width: "12%", align: "left", draggable: false,
                  renderCell: (c, { i }) => (
                    <div className="flex items-center gap-1">
                      <Circle className={`w-2 h-2 flex-shrink-0 ${c.is_active ? "fill-green-500 text-green-500" : "fill-muted-foreground/30 text-muted-foreground/30"}`} />
                      {i < 3 && c.mql_count > 0 && (
                        <Star className="w-2.5 h-2.5 text-yellow-400 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        {c.campaigns.length > 0 && (
                          <p className="text-[8px] text-muted-foreground truncate" title={c.campaigns.join(", ")}>
                            {c.campaigns.join(", ")}
                          </p>
                        )}
                        <p className="font-medium truncate text-[10px]">{c.creative_label}</p>
                        <code className="text-[8px] text-muted-foreground truncate block">{c.creative_key}</code>
                      </div>
                    </div>
                  ),
                },
                spend: {
                  id: "spend", label: "Spend", width: "5%", sortField: "spend",
                  renderCell: (c) => <>{formatCurrency(c.spend)}</>,
                },
                lpv: {
                  id: "lpv", label: "LPV", width: "5%", sortField: "landing_page_views",
                  title: "Landing Page Views e custo por LPV (Spend ÷ LPV)",
                  renderCell: (c) => {
                    const cpLpv = c.landing_page_views > 0 ? c.spend / c.landing_page_views : null;
                    return (
                      <span className="text-sky-400">
                        {c.landing_page_views > 0 ? (
                          <>
                            <div className="font-semibold">{formatNumber(c.landing_page_views)}</div>
                            {cpLpv !== null && (
                              <div className="text-[9px] text-muted-foreground">{formatCurrency(cpLpv)}</div>
                            )}
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </span>
                    );
                  },
                },
                leads: {
                  id: "leads", label: "Leads", width: "6%", sortField: "leads_count",
                  renderCell: (c) => <div className="font-semibold">{c.leads_count}</div>,
                },
                ctl: {
                  id: "ctl", label: "CTL", width: "5%", sortField: "ctl",
                  title: "Click-To-Lead: Leads ÷ Cliques no anúncio × 100",
                  renderCell: (c) => {
                    const ctl = c.clicks > 0 ? (c.leads_count / c.clicks) * 100 : null;
                    return (
                      <span className="text-emerald-300">
                        {ctl !== null ? (
                          <>
                            <div className="font-semibold">{ctl.toFixed(2)}%</div>
                            <div className="text-[9px] text-muted-foreground">{formatNumber(c.clicks)} cliques</div>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </span>
                    );
                  },
                },
                mql_cpmql: {
                  id: "mql_cpmql", label: "MQL", width: "7%", sortField: "mql_count",
                  title: "MQL: contagem · %MQL (Leads → MQL) · CPMQL (Spend ÷ MQL)",
                  renderCell: (c, { isBestCpmql2 }) => (
                    <div className={isBestCpmql2 ? "text-green-400" : ""}>
                      <div className="font-semibold text-green-400">{c.mql_count}</div>
                      <div className="text-[9px] text-muted-foreground">{formatPercent(c.mql_rate)}</div>
                      <div className={`text-[9px] ${isBestCpmql2 ? "font-bold text-green-400" : "text-muted-foreground"}`}>{formatCurrency(c.cost_per_mql)}</div>
                    </div>
                  ),
                },
                qualified_5_10k: {
                  id: "qualified_5_10k", label: "5–10k\n/ CP", width: "7%", sortField: "qualified_count",
                  title: "Leads com faturamento de R$ 5 mil a R$ 10 mil e custo por lead",
                  renderCell: (c) => (
                    <span className="text-amber-300">
                      {c.qualified_count > 0 ? (
                        <>
                          <div className="font-semibold">{c.qualified_count}</div>
                          <div className="text-muted-foreground text-[9px]">{formatCurrency(c.cost_per_qualified)}</div>
                        </>
                      ) : <span className="text-muted-foreground">0</span>}
                    </span>
                  ),
                },
                meetings: {
                  id: "meetings", label: "Reun.", width: "5%", sortField: "meetings_count",
                  renderCell: (c) => (
                    <span className="text-orange-400">
                      {c.meetings_count > 0 ? (
                        <><div className="font-semibold">{c.meetings_count}</div><div className="text-[9px]">{formatCurrency(c.cost_per_meeting)}</div></>
                      ) : <span className="text-muted-foreground">0</span>}
                    </span>
                  ),
                },
                booking_rate: {
                  id: "booking_rate", label: "Tx.Agend", width: "5%", sortField: "booking_rate",
                  title: "Taxa de agendamento: Reuniões / MQLs",
                  renderCell: (c) => {
                    const r = creativeExtras.get(c.creative_key)?.bookingRate;
                    if (r === null || r === undefined) return <span className="text-muted-foreground">—</span>;
                    const cls = r >= 0.5 ? "text-emerald-400" : r >= 0.25 ? "text-amber-400" : "text-muted-foreground";
                    return <span className={`font-semibold ${cls}`}>{(r * 100).toFixed(0)}%</span>;
                  },
                },
                call_conv: {
                  id: "call_conv", label: "Conv.Call", width: "5%", sortField: "call_conv_rate",
                  title: "Conversão de chamada: Vendas Assessoria / Reuniões",
                  renderCell: (c) => {
                    const r = creativeExtras.get(c.creative_key)?.callConvRate;
                    if (r === null || r === undefined) return <span className="text-muted-foreground">—</span>;
                    const cls = r >= 0.5 ? "text-emerald-400" : r >= 0.2 ? "text-amber-400" : "text-muted-foreground";
                    return <span className={`font-semibold ${cls}`}>{(r * 100).toFixed(0)}%</span>;
                  },
                },
                sales_cac: {
                  id: "sales_cac", label: "Vendas\n/ CAC", width: "7%", sortField: "sales_count",
                  title: "Vendas · CAC · Ciclo médio (dias)",
                  renderCell: (c) => {
                    const ext = creativeExtras.get(c.creative_key);
                    return (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-right w-full hover:underline text-emerald-400">
                          <div className="font-semibold">{c.sales_count}</div>
                          {c.cac !== null && <div className="text-emerald-300/70 text-[9px]">{formatCurrency(c.cac)}</div>}
                          {ext && ext.cycleDays !== null && (
                            <div className="text-emerald-200/60 text-[9px]">{ext.cycleDays.toFixed(1)}d</div>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-52 p-3" align="end">
                        <p className="text-xs font-semibold mb-2">Vendas por Tipo</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span>Geral:</span><span className="font-bold text-emerald-400">{c.sales_count}</span></div>
                          <div className="flex justify-between"><span className="text-emerald-300">Sprint:</span><span className="font-bold text-emerald-300">{c.sales_sprint_count || 0}</span></div>
                          <div className="flex justify-between"><span className="text-emerald-500">Assessoria:</span><span className="font-bold text-emerald-500">{c.sales_assessoria_count || 0}</span></div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    );
                  },
                },
                cac_sprint: {
                  id: "cac_sprint", label: "CAC-S", width: "5%", sortField: "cac_sprint",
                  title: "CAC Sprint: Spend / Vendas Sprint",
                  renderCell: (c) => (
                    <span className="text-emerald-300">
                      {c.sales_sprint_count > 0 ? (
                        <><div className="font-semibold">{c.sales_sprint_count}</div><div className="text-[9px]">{formatCurrency(creativeExtras.get(c.creative_key)?.cacSprint ?? null)}</div></>
                      ) : <span className="text-muted-foreground">0</span>}
                    </span>
                  ),
                },
                cac_assessoria: {
                  id: "cac_assessoria", label: "CAC/\nVendas-A", width: "5%", sortField: "cac_assessoria",
                  title: "CAC Assessoria: Spend / Vendas Assessoria",
                  renderCell: (c) => (
                    <span className="text-emerald-500">
                      {c.sales_assessoria_count > 0 ? (
                        <><div className="font-semibold">{c.sales_assessoria_count}</div><div className="text-[9px]">{formatCurrency(creativeExtras.get(c.creative_key)?.cacAssessoria ?? null)}</div></>
                      ) : <span className="text-muted-foreground">0</span>}
                    </span>
                  ),
                },
                win_rate: {
                  id: "win_rate", label: "Win%", width: "4.5%", sortField: "win_rate",
                  title: "Win Rate: Vendas / MQLs",
                  renderCell: (c) => {
                    const w = creativeExtras.get(c.creative_key)?.winRate;
                    if (w === null || w === undefined) return <span className="text-muted-foreground">—</span>;
                    const cls = w >= 0.3 ? "text-emerald-400" : w >= 0.1 ? "text-emerald-300" : "text-emerald-200/60";
                    return <span className={`font-semibold ${cls}`}>{(w * 100).toFixed(0)}%</span>;
                  },
                },
                revenue: {
                  id: "revenue", label: "FPC", width: "6%", sortField: "revenue",
                  renderCell: (c) => (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-right w-full hover:underline text-emerald-400">
                          <div className="font-semibold">{formatCurrency(c.revenue)}</div>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-52 p-3" align="end">
                        <p className="text-xs font-semibold mb-2">Faturamento por Tipo</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span>Geral:</span><span className="font-bold text-emerald-400">{formatCurrency(c.revenue)}</span></div>
                          <div className="flex justify-between"><span className="text-emerald-300">Sprint:</span><span className="font-bold text-emerald-300">{formatCurrency(c.revenue_sprint || 0)}</span></div>
                          <div className="flex justify-between"><span className="text-emerald-500">Assessoria:</span><span className="font-bold text-emerald-500">{formatCurrency(c.revenue_assessoria || 0)}</span></div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ),
                },
                roas: {
                  id: "roas", label: "ROAS", width: "4.5%", sortField: "roas",
                  renderCell: (c) => (
                    <span className="font-bold">
                      {c.roas !== null ? <span className={c.roas >= 1 ? "text-emerald-400" : "text-emerald-200/50"}>{c.roas.toFixed(1)}x</span> : "—"}
                    </span>
                  ),
                },
              };
              const orderedCols = columnOrder.map((id) => COLUMN_DEFS[id]).filter(Boolean);
              return (
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow className="text-[10px] [&_th]:h-12 [&_th]:align-middle [&_th]:px-1 [&_th]:py-2 [&_th]:font-semibold [&_th]:leading-tight">
                  {orderedCols.map((col) => {
                    const isDraggable = col.draggable !== false;
                    const isDragOver = draggedCol && draggedCol !== col.id;
                    return (
                      <TableHead
                        key={col.id}
                        className={`${col.align === "left" ? "" : "text-right"} ${col.sortField ? "cursor-pointer hover:text-foreground" : ""} ${isDragOver ? "bg-primary/10" : ""}`}
                        style={{ width: col.width }}
                        title={col.title}
                        draggable={isDraggable}
                        onDragStart={(e) => {
                          if (!isDraggable) return;
                          setDraggedCol(col.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => { if (isDraggable) e.preventDefault(); }}
                        onDrop={(e) => {
                          if (!isDraggable || !draggedCol) return;
                          e.preventDefault();
                          moveColumn(draggedCol, col.id);
                          setDraggedCol(null);
                        }}
                        onDragEnd={() => setDraggedCol(null)}
                        onClick={() => col.sortField && handleSort(col.sortField)}
                      >
                        <span className={`inline-flex items-center gap-1 ${col.align === "left" ? "" : "justify-end w-full"}`}>
                          {isDraggable && (
                            <GripVertical
                              className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <span className="whitespace-pre-line text-center">{col.label}</span>
                          {col.sortField && <SortIcon field={col.sortField} />}
                        </span>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {creatives.map((c, i) => {
                  const isBestMql = topMql && c.creative_key === topMql.creative_key && c.mql_count > 0;
                  const isBestCpmql2 = bestCpmql && c.creative_key === bestCpmql.creative_key;
                  const isBestRevenue = topRevenue && c.creative_key === topRevenue.creative_key && c.revenue > 0;
                  return (
                    <TableRow
                      key={c.creative_key}
                      className={`cursor-pointer hover:bg-muted/50 ${isBestMql ? "bg-green-500/5" : ""} ${isBestRevenue ? "bg-emerald-500/5" : ""}`}
                      onClick={() => setDrillCreative(c)}
                    >
                      {orderedCols.map((col) => (
                        <TableCell
                          key={col.id}
                          className={`${col.id === "creative" ? "px-1" : "text-right px-1"} text-[10px] py-1.5`}
                        >
                          {col.renderCell(c, { isBestCpmql2: !!isBestCpmql2, i })}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* Data Quality */}
      {dq && (
        <Card className="border-yellow-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Qualidade dos Dados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Leads com creative_key</p>
                <p className="font-bold">
                  {dq.leads_with_creative}/{dq.leads_total}
                  <span className="text-muted-foreground ml-1">
                    ({dq.leads_total > 0 ? ((dq.leads_with_creative / dq.leads_total) * 100).toFixed(0) : 0}%)
                  </span>
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Spend mapeado</p>
                <p className="font-bold">
                  {formatCurrency(dq.spend_mapped)} / {formatCurrency(dq.spend_total)}
                  <span className="text-muted-foreground ml-1">
                    ({dq.spend_total > 0 ? ((dq.spend_mapped / dq.spend_total) * 100).toFixed(0) : 0}%)
                  </span>
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Leads sem UTMs</p>
                <p className="font-bold">{dq.leads_without_utms}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Vendas sem creative_key</p>
                <p className="font-bold">{dq.sales_without_creative}</p>
              </div>
            </div>
            {dq.spend_total > 0 && dq.spend_mapped < dq.spend_total && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300">
                <AlertTriangle className="w-4 h-4 inline mr-2" />
                {((1 - dq.spend_mapped / dq.spend_total) * 100).toFixed(0)}% do gasto não pôde ser atribuído a criativos por falta de UTMs/naming.
              </div>
            )}
          </CardContent>
        </Card>
      )}


      {/* Drill-down Dialog */}
      <Dialog open={!!drillCreative} onOpenChange={(open) => !open && setDrillCreative(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {drillCreative && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Circle className={`w-3 h-3 ${drillCreative.is_active ? "fill-green-500 text-green-500" : "fill-muted-foreground/30 text-muted-foreground/30"}`} />
                  {drillCreative.creative_label}
                  <Badge variant="outline" className={`text-[10px] ${drillCreative.is_active ? "border-green-500/50 text-green-400" : "border-muted text-muted-foreground"}`}>
                    {drillCreative.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  {drillCreative.creative_source_field === "fallback" && (
                    <Badge variant="outline" className="border-yellow-500/50 text-yellow-400">fallback</Badge>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                {/* Key metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Leads</p>
                    <p className="text-lg font-bold">{drillCreative.leads_count}</p>
                  </div>
                  <div className="p-3 bg-green-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">MQL</p>
                    <p className="text-lg font-bold text-green-400">{drillCreative.mql_count}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">%MQL</p>
                    <p className="text-lg font-bold">{formatPercent(drillCreative.mql_rate)}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Spend</p>
                    <p className="text-lg font-bold">{formatCurrency(drillCreative.spend)}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">CPMQL</p>
                    <p className="text-lg font-bold">{formatCurrency(drillCreative.cost_per_mql)}</p>
                  </div>
                  <div className="p-3 bg-orange-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Reuniões</p>
                    <p className="text-lg font-bold text-orange-400">{drillCreative.meetings_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_meeting)}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Small</p>
                    <p className="text-lg font-bold">{drillCreative.tier_small_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_small)}</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Medium</p>
                    <p className="text-lg font-bold text-blue-400">{drillCreative.tier_medium_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_medium)}</p>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Large</p>
                    <p className="text-lg font-bold text-amber-400">{drillCreative.tier_large_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_tier_large)}</p>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Enterprise</p>
                    <p className="text-lg font-bold text-purple-400">{drillCreative.tier_enterprise_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_enterprise)}</p>
                  </div>
                  <div className="p-3 bg-pink-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Enterprise+</p>
                    <p className="text-lg font-bold text-pink-400">{drillCreative.tier_enterprise_plus_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_enterprise_plus)}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">ROAS</p>
                    <p className="text-lg font-bold">{drillCreative.roas !== null ? `${drillCreative.roas.toFixed(2)}x` : "—"}</p>
                  </div>
                </div>

                {/* Leads by stage */}
                {Object.keys(drillCreative.leads_by_stage).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase">Distribuição por Estágio</h4>
                    <div className="space-y-1">
                      {Object.entries(drillCreative.leads_by_stage).sort((a, b) => b[1] - a[1]).map(([stage, count]) => (
                        <div key={stage} className="flex items-center justify-between text-sm">
                          <span>{stage}</span>
                          <span className="font-mono">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Campaigns */}
                {drillCreative.campaigns.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase">Campanhas associadas</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {drillCreative.campaigns.map(c => (
                        <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alerts */}
                <div className="space-y-2">
                  {drillCreative.spend > 0 && drillCreative.leads_count === 0 && (
                    <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">
                      <AlertTriangle className="w-4 h-4 inline mr-1" /> Existe gasto mas nenhum lead atribuído.
                    </div>
                  )}
                  {drillCreative.leads_count > 0 && drillCreative.spend === 0 && (
                    <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-sm text-yellow-300">
                      <AlertTriangle className="w-4 h-4 inline mr-1" /> Leads atribuídos mas sem gasto registrado.
                    </div>
                  )}
                </div>

                {/* Creative key info */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Creative Key:</strong> {drillCreative.creative_key}</p>
                  <p><strong>Fonte:</strong> {drillCreative.creative_source_field}</p>
                  {drillCreative.last_activity && (
                    <p><strong>Última atividade:</strong> {new Date(drillCreative.last_activity).toLocaleDateString("pt-BR")}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Sale Dialog */}
      <Dialog open={showAddSale} onOpenChange={(open) => {
        setShowAddSale(open);
        if (!open) setSelectedLeadId(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Venda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <LeadSearchPicker
              leads={leadsList}
              loading={leadsLoading}
              selectedId={selectedLeadId}
              onSelect={setSelectedLeadId}
              label="Lead (opcional)"
            />

            {selectedSaleLead && (
              <div className="p-3 rounded-md bg-accent/20 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Criativo:</span>
                  <span className="font-medium">{selectedSaleLead.utm_content || "Sem criativo (Direct)"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tier:</span>
                  <Badge variant="outline" className="text-[10px]">{selectedSaleLead.tier || "—"}</Badge>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm text-muted-foreground">Produto *</label>
              <Select value={saleForm.sale_type} onValueChange={(v) => setSaleForm(p => ({ ...p, sale_type: v as "sprint" | "assessoria" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sprint">Sprint</SelectItem>
                  <SelectItem value="assessoria">Assessoria Completa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Receita (R$) *</label>
              <Input type="number" step="0.01" placeholder="5000.00" value={saleForm.revenue} onChange={e => setSaleForm(p => ({ ...p, revenue: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground mt-1">Valor total do contrato (TCV).</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Forma de pagamento *</label>
              <Select
                value={saleForm.payment_type}
                onValueChange={(v) => {
                  const pt = v as "tcv_total" | "pix_parcelado" | "recorrencia";
                  setSaleForm(p => ({
                    ...p,
                    payment_type: pt,
                    amount_received: pt === "tcv_total" ? p.revenue : p.amount_received,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcv_total">TCV à vista (total)</SelectItem>
                  <SelectItem value="pix_parcelado">Pix parcelado</SelectItem>
                  <SelectItem value="recorrencia">Recorrência (mensal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {saleForm.payment_type === "pix_parcelado" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">Nº de parcelas</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="12"
                    value={saleForm.installments_count}
                    onChange={e => {
                      const count = e.target.value;
                      setSaleForm(p => {
                        const c = parseInt(count);
                        const v = parseFloat(p.installment_value);
                        const revenue = !isNaN(c) && !isNaN(v) ? String(+(c * v).toFixed(2)) : p.revenue;
                        return { ...p, installments_count: count, revenue };
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Valor da parcela (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="500.00"
                    value={saleForm.installment_value}
                    onChange={e => {
                      const val = e.target.value;
                      setSaleForm(p => {
                        const c = parseInt(p.installments_count);
                        const v = parseFloat(val);
                        const revenue = !isNaN(c) && !isNaN(v) ? String(+(c * v).toFixed(2)) : p.revenue;
                        return { ...p, installment_value: val, revenue };
                      });
                    }}
                  />
                </div>
              </div>
            )}
            {saleForm.payment_type === "recorrencia" && (
              <div>
                <label className="text-sm text-muted-foreground">Valor mensal (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="2000.00"
                  value={saleForm.installment_value}
                  onChange={e => {
                    const val = e.target.value;
                    setSaleForm(p => ({ ...p, installment_value: val, revenue: val || p.revenue }));
                  }}
                />
                <p className="text-[10px] text-muted-foreground mt-1">TCV considera apenas o valor mensal.</p>
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Já recebido (R$)</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={saleForm.amount_received}
                onChange={e => setSaleForm(p => ({ ...p, amount_received: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Quanto já entrou na conta. O restante fica como "a receber".</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Observação</label>
              <Input placeholder="Notas adicionais" value={saleForm.notes} onChange={e => setSaleForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Closer *</label>
              <Select value={saleForm.closer} onValueChange={(v) => setSaleForm(p => ({ ...p, closer: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o closer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Caio">Caio</SelectItem>
                  <SelectItem value="Rodger">Rodger</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddSale} disabled={savingSale || !saleForm.revenue} className="w-full">
              {savingSale ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Registrar Venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Spend Dialog */}
      <Dialog open={showAddSpend} onOpenChange={setShowAddSpend}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Gasto de Anúncio</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Data *</label>
              <Input type="date" value={spendForm.date} onChange={e => setSpendForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Gasto (R$) *</label>
              <Input type="number" step="0.01" placeholder="500.00" value={spendForm.spend} onChange={e => setSpendForm(p => ({ ...p, spend: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Criativo (utm_content)</label>
              <Input placeholder="Ex: T01 - C3 - CL" value={spendForm.utm_content} onChange={e => setSpendForm(p => ({ ...p, utm_content: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Campanha</label>
              <Input placeholder="Nome da campanha" value={spendForm.campaign_name} onChange={e => setSpendForm(p => ({ ...p, campaign_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Impressões</label>
                <Input type="number" value={spendForm.impressions} onChange={e => setSpendForm(p => ({ ...p, impressions: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Cliques</label>
                <Input type="number" value={spendForm.clicks} onChange={e => setSpendForm(p => ({ ...p, clicks: e.target.value }))} />
              </div>
            </div>
            <Button onClick={handleAddSpend} disabled={savingSpend} className="w-full">
              {savingSpend ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Gasto
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Meeting Dialog */}
      <Dialog open={showAddMeeting} onOpenChange={(open) => {
        setShowAddMeeting(open);
        if (!open) setMeetingSelectedLeadId(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Reunião</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <LeadSearchPicker
              leads={leadsList}
              loading={leadsLoading}
              selectedId={meetingSelectedLeadId}
              onSelect={setMeetingSelectedLeadId}
            />

            {/* Auto-filled info */}
            {selectedMeetingLead && (
              <div className="p-3 rounded-md bg-accent/20 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Criativo:</span>
                  <span className="font-medium">{selectedMeetingLead.utm_content || "Sem criativo (Direct)"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mercado:</span>
                  <span>{selectedMeetingLead.mercado}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tier:</span>
                  <Badge variant="outline" className="text-[10px]">{selectedMeetingLead.tier || "—"}</Badge>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm text-muted-foreground">Observação</label>
              <Input placeholder="Notas adicionais" value={meetingForm.notes} onChange={e => setMeetingForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Closer *</label>
              <Select value={meetingForm.closer} onValueChange={(v) => setMeetingForm(p => ({ ...p, closer: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o closer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Caio">Caio</SelectItem>
                  <SelectItem value="Rodger">Rodger</SelectItem>
                </SelectContent>
              </Select>
              {meetingForm.closer && (
                CLOSER_CALENDARS[meetingForm.closer] ? (
                  <a
                    href={CLOSER_CALENDARS[meetingForm.closer]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Calendar className="w-3 h-3" /> Abrir agenda do {meetingForm.closer}
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Link da agenda do {meetingForm.closer} a definir.</p>
                )
              )}
            </div>
            <Button onClick={handleAddMeeting} disabled={savingMeeting || !meetingSelectedLeadId} className="w-full">
              {savingMeeting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Registrar Reunião
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Edit Sale Dialog */}
      <Dialog open={!!editingSale} onOpenChange={(open) => !open && setEditingSale(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Venda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Produto *</label>
              <Select value={editSaleForm.sale_type} onValueChange={(v) => setEditSaleForm(p => ({ ...p, sale_type: v as "sprint" | "assessoria" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sprint">Sprint</SelectItem>
                  <SelectItem value="assessoria">Assessoria Completa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Receita (R$) *</label>
              <Input type="number" step="0.01" value={editSaleForm.revenue} onChange={e => setEditSaleForm(p => ({ ...p, revenue: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Observação</label>
              <Input value={editSaleForm.notes} onChange={e => setEditSaleForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Closer *</label>
              <Select value={editSaleForm.closer} onValueChange={(v) => setEditSaleForm(p => ({ ...p, closer: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o closer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Caio">Caio</SelectItem>
                  <SelectItem value="Rodger">Rodger</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleEditSale} disabled={savingEditSale} className="w-full">
              {savingEditSale ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Meeting Dialog */}
      <Dialog open={!!editingMeeting} onOpenChange={(open) => !open && setEditingMeeting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Reunião</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Observação</label>
              <Input value={editMeetingForm.notes} onChange={e => setEditMeetingForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Closer</label>
              <Select value={editMeetingForm.closer} onValueChange={(v) => setEditMeetingForm(p => ({ ...p, closer: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o closer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Caio">Caio</SelectItem>
                  <SelectItem value="Rodger">Rodger</SelectItem>
                </SelectContent>
              </Select>
              {editMeetingForm.closer && (
                CLOSER_CALENDARS[editMeetingForm.closer] ? (
                  <a
                    href={CLOSER_CALENDARS[editMeetingForm.closer]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Calendar className="w-3 h-3" /> Abrir agenda do {editMeetingForm.closer}
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Link da agenda do {editMeetingForm.closer} a definir.</p>
                )
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground">Realizada</label>
              <Switch checked={editMeetingForm.attended} onCheckedChange={(v) => setEditMeetingForm(p => ({ ...p, attended: v }))} />
              <span className="text-sm">{editMeetingForm.attended ? "Sim" : "Não"}</span>
            </div>
            <Button onClick={handleEditMeeting} disabled={savingEditMeeting} className="w-full">
              {savingEditMeeting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
