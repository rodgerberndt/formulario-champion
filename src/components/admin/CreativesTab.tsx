import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Star,
  RefreshCw,
  Calendar,
  Circle,
  Search,
  X,
  Check,
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

// ── Types ──
interface CreativeData {
  creative_key: string;
  creative_label: string;
  creative_source_field: string;
  leads_count: number;
  mql_count: number;
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
  sales_count: number;
  sales_sprint_count: number;
  sales_assessoria_count: number;
  cac: number | null;
  revenue: number;
  revenue_sprint: number;
  revenue_assessoria: number;
  roas: number | null;
  last_activity: string | null;
  leads_by_stage: Record<string, number>;
  campaigns: string[];
  meetings_count: number;
  cost_per_meeting: number | null;
  is_active: boolean;
}

interface CreativesResponse {
  creatives: CreativeData[];
  totals: {
    spend: number;
    leads: number;
    mql: number;
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
    meetings: number;
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
}

interface Meeting {
  id: string;
  creative_key: string | null;
  utm_content: string | null;
  notes: string | null;
  created_at: string;
}

interface LeadOption {
  id: string;
  nome_completo: string;
  whatsapp: string;
  mercado: string;
  utm_content: string | null;
  tier: string | null;
  created_at: string;
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
  if (sdrOverride === "Dara") return false;
  const faturaEnough = investimento ? MQL_FAT_MIN_FAIXAS.includes(investimento) : false;
  return faturaEnough;
}

// ── Props ──
interface CreativesTabProps {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
  startDateOnly: string;
  endDateOnly: string;
  startISO: string;
  endISO: string;
}

export default function CreativesTab({ fetchAdminData, startDateOnly, endDateOnly, startISO, endISO }: CreativesTabProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CreativesResponse | null>(null);
  const [attribution, setAttribution] = useState<"first" | "last">("first");
  const [sortField, setSortField] = useState<string>("mql_count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [drillCreative, setDrillCreative] = useState<CreativeData | null>(null);

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

  // Manual sales form
  const [showAddSale, setShowAddSale] = useState(false);
  const [saleForm, setSaleForm] = useState({ sale_date: "", revenue: "", creative_key: "", notes: "", sale_type: "sprint" as "sprint" | "assessoria" });
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
  const [meetingForm, setMeetingForm] = useState({ creative_key: "", notes: "" });
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [meetingsList, setMeetingsList] = useState<Meeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [showMeetingsList, setShowMeetingsList] = useState(false);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);

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
      const token = sessionStorage.getItem("admin_analytics_token");
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetch(`${supabaseUrl}/functions/v1/admin-data/manual-sales/${saleId}`, {
        method: "DELETE",
        headers: { "x-admin-token": token || "" },
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
      const result = await fetchAdminData("/creatives", params);
      setData(result);
    } catch (err) {
      console.error("Error loading creatives:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchAdminData, startDateOnly, endDateOnly, attribution, campaignTypeFilter]);

  // Load leads when date range changes
  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedSaleLead = selectedLeadId ? leadsList.find(l => l.id === selectedLeadId) : null;
  const selectedMeetingLead = meetingSelectedLeadId ? leadsList.find(l => l.id === meetingSelectedLeadId) : null;

  const handleAddSale = async () => {
    if (!saleForm.sale_date || !saleForm.revenue) {
      toast({ title: "Preencha data e receita", variant: "destructive" });
      return;
    }
    if (!selectedLeadId) {
      toast({ title: "Selecione um lead", variant: "destructive" });
      return;
    }
    setSavingSale(true);
    try {
      const lead = selectedSaleLead!;
      const ck = lead.utm_content ? normalizeCreativeKey(lead.utm_content) : "";
      await fetchAdminData("/manual-sales", {
        _method: "POST",
        sale_date: saleForm.sale_date,
        revenue: saleForm.revenue,
        creative_key: ck,
        utm_content: lead.utm_content || "",
        notes: `${lead.nome_completo}${saleForm.notes ? ` — ${saleForm.notes}` : ""}`,
        lead_id: lead.id,
      });
      toast({ title: "Venda registrada!" });
      setSaleForm({ sale_date: "", revenue: "", creative_key: "", notes: "" });
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
      });
      toast({ title: "Reunião registrada!" });
      setMeetingForm({ creative_key: "", notes: "" });
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
      const token = sessionStorage.getItem("admin_analytics_token");
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetch(`${supabaseUrl}/functions/v1/admin-data/meetings/${meetingId}`, {
        method: "DELETE",
        headers: { "x-admin-token": token || "" },
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
      const token = sessionStorage.getItem("admin_analytics_token");
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/meta-ads-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token || "",
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

  const creatives = (data?.creatives || [])
    .filter(c => {
      if (filterOnlyActive && !c.is_active) return false;
      if (filterOnlyWithSpend && c.spend <= 0) return false;
      if (filterOnlyWithLeads && c.leads_count <= 0) return false;
      if (filterOnlyWithMql && c.mql_count <= 0) return false;
      if (filterOnlyWithSales && c.sales_count <= 0) return false;
      if (selectedCampaigns.length > 0 && !c.campaigns.some(camp => selectedCampaigns.includes(camp))) return false;
      return true;
    })
    .sort((a, b) => {
      const getValue = (c: CreativeData) => {
        if (sortField === "cpl") return c.spend > 0 && c.leads_count > 0 ? c.spend / c.leads_count : null;
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

        <div className="ml-auto flex gap-2">
          <Button variant="default" size="sm" onClick={handleMetaSync} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            {syncing ? "Sincronizando..." : "Sync Meta Ads"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAddSpend(true)}>
            <Plus className="w-4 h-4 mr-1" /> Gasto
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAddSale(true)}>
            <Plus className="w-4 h-4 mr-1" /> Venda
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAddMeeting(true)}>
            <Calendar className="w-4 h-4 mr-1" /> Reunião
          </Button>
          <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Atualizar"}
          </Button>
        </div>
      </div>

      {/* CAPI Retroactive Actions */}
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="text-xs text-muted-foreground self-center mr-1">CAPI Retroativo:</span>
        <Button variant="outline" size="sm" onClick={() => handleCapiRetroactive("tiers")} disabled={!!sendingCapiRetro}>
          {sendingCapiRetro === "tiers" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          Tiers
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleCapiRetroactive("meetings")} disabled={!!sendingCapiRetro}>
          {sendingCapiRetro === "meetings" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          Reuniões
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleCapiRetroactive("purchases")} disabled={!!sendingCapiRetro}>
          {sendingCapiRetro === "purchases" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          Compras
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleCapiRetroactive("mqls")} disabled={!!sendingCapiRetro} className="border-blue-500 text-blue-600">
          {sendingCapiRetro === "mqls" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          MQLs
        </Button>
      </div>

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

      {/* Summary Cards - Funnel Order */}
      {totals && (() => {
        const scheduleRate = totals.mql > 0 ? (totals.meetings / totals.mql) * 100 : null;
        const callConversion = totals.meetings > 0 ? (totals.sales / totals.meetings) * 100 : null;
        return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* 1. Gastos */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Total Spend</p>
              <p className="text-xl font-bold">{formatCurrency(totals.spend)}</p>
            </CardContent>
          </Card>
          {/* 2. Leads */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Total Leads</p>
              <p className="text-xl font-bold">{formatNumber(totals.leads)}</p>
            </CardContent>
          </Card>
          {/* 3. CPL */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">CPL</p>
              <p className="text-lg font-bold">{formatCurrency(totals.cpl)}</p>
            </CardContent>
          </Card>
          {/* 4. % MQL */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">% MQL</p>
              <p className="text-xl font-bold text-green-300">{totals.leads > 0 ? `${((totals.mql / totals.leads) * 100).toFixed(1)}%` : "—"}</p>
              <p className="text-xs text-muted-foreground">Leads → MQL</p>
            </CardContent>
          </Card>
          {/* 5. MQL */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Total MQL</p>
              <p className="text-xl font-bold text-green-400">{formatNumber(totals.mql)}</p>
            </CardContent>
          </Card>
          {/* 6. CPMQL */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">CPMQL</p>
              <p className="text-lg font-bold">{formatCurrency(totals.cpmql)}</p>
            </CardContent>
          </Card>
          {/* 7. Small */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Small</p>
              <p className="text-xl font-bold">{formatNumber(totals.tier_small)}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(totals.cp_tier_small)}</p>
            </CardContent>
          </Card>
          {/* 8. Medium */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Medium</p>
              <p className="text-xl font-bold text-blue-400">{formatNumber(totals.tier_medium)}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(totals.cp_tier_medium)}</p>
            </CardContent>
          </Card>
          {/* 8. Large */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Large</p>
              <p className="text-xl font-bold text-amber-400">{formatNumber(totals.tier_large)}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(totals.cp_tier_large)}</p>
            </CardContent>
          </Card>
          {/* 9. Enterprise */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Enterprise</p>
              <p className="text-xl font-bold text-purple-400">{formatNumber(totals.tier_enterprise)}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(totals.cp_tier_enterprise)}</p>
            </CardContent>
          </Card>
          {/* 10. Enterprise+ */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Enterprise+</p>
              <p className="text-xl font-bold text-pink-400">{formatNumber(totals.tier_enterprise_plus)}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(totals.cp_tier_enterprise_plus)}</p>
            </CardContent>
          </Card>
          {/* 11. Taxa de Agendamento (MQL → Reuniões) */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Taxa Agendamento</p>
              <p className="text-xl font-bold text-yellow-400">{scheduleRate !== null ? `${scheduleRate.toFixed(1)}%` : "—"}</p>
              <p className="text-xs text-muted-foreground">MQL → Reuniões</p>
            </CardContent>
          </Card>
          {/* 12. Reuniões */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Total Reuniões</p>
              <p className="text-xl font-bold text-orange-400">{formatNumber(totals.meetings)}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(totals.cp_meeting)}</p>
            </CardContent>
          </Card>
          {/* 13. Conversão Call (Reuniões → Vendas) */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Conversão Call</p>
              <p className="text-xl font-bold text-cyan-400">{callConversion !== null ? `${callConversion.toFixed(1)}%` : "—"}</p>
              <p className="text-xs text-muted-foreground">Reuniões → Vendas</p>
            </CardContent>
          </Card>
          {/* 14. Vendas */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Total Vendas</p>
              <p className="text-xl font-bold text-blue-400">{formatNumber(totals.sales)}</p>
            </CardContent>
          </Card>
          {/* 15. Receita */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Total Receita</p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(totals.revenue)}</p>
            </CardContent>
          </Card>
          {/* 16. CAC */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">CAC</p>
              <p className="text-lg font-bold">{formatCurrency(totals.cac)}</p>
            </CardContent>
          </Card>
          {/* 17. ROAS */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">ROAS</p>
              <p className="text-lg font-bold">{totals.roas !== null ? `${totals.roas.toFixed(2)}x` : "—"}</p>
            </CardContent>
          </Card>
        </div>
        );
      })()}

      {/* Ranking Cards */}
      {creatives.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {topMql && topMql.mql_count > 0 && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-5 h-5 text-green-400" />
                  <p className="text-xs text-muted-foreground uppercase">#1 em MQL</p>
                </div>
                <p className="font-bold text-lg truncate">{topMql.creative_label}</p>
                <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                  <span>{topMql.mql_count} MQL</span>
                  <span>CPMQL: {formatCurrency(topMql.cost_per_mql)}</span>
                </div>
              </CardContent>
            </Card>
          )}
          {topMeetings && topMeetings.meetings_count > 0 && (
            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-orange-400" />
                  <p className="text-xs text-muted-foreground uppercase">#1 em Reuniões</p>
                </div>
                <p className="font-bold text-lg truncate">{topMeetings.creative_label}</p>
                <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                  <span>{topMeetings.meetings_count} reuniões</span>
                  <span>CP Reunião: {formatCurrency(topMeetings.cost_per_meeting)}</span>
                </div>
              </CardContent>
            </Card>
          )}
          {topRevenue && topRevenue.revenue > 0 && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  <p className="text-xs text-muted-foreground uppercase">#1 em Receita</p>
                </div>
                <p className="font-bold text-lg truncate">{topRevenue.creative_label}</p>
                <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                  <span>{formatCurrency(topRevenue.revenue)}</span>
                  <span>ROAS: {topRevenue.roas !== null ? `${topRevenue.roas.toFixed(2)}x` : "—"}</span>
                </div>
              </CardContent>
            </Card>
          )}
          {topSales && topSales.sales_count > 0 && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-5 h-5 text-blue-400" />
                  <p className="text-xs text-muted-foreground uppercase">#1 em Vendas</p>
                </div>
                <p className="font-bold text-lg truncate">{topSales.creative_label}</p>
                <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                  <span>{topSales.sales_count} vendas</span>
                  <span>CAC: {formatCurrency(topSales.cac)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Main Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Performance por Criativo
            <span className="text-sm font-normal text-muted-foreground">({creatives.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {creatives.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              Nenhum criativo encontrado no período. Verifique se os leads possuem utm_content preenchido.
            </p>
          ) : (
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="w-[14%]">Campanha / Criativo</TableHead>
                  <TableHead className="text-right cursor-pointer w-[6%]" onClick={() => handleSort("spend")}>
                    Spend<SortIcon field="spend" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[7%]" onClick={() => handleSort("leads_count")}>
                    Leads/CPL<SortIcon field="leads_count" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[7%]" onClick={() => handleSort("mql_count")}>
                    MQL/CPMQL<SortIcon field="mql_count" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[5%]" onClick={() => handleSort("mql_rate")}>
                    %MQL<SortIcon field="mql_rate" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[5.5%]" onClick={() => handleSort("cost_per_small")}>
                    CP-S<SortIcon field="cost_per_small" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[5.5%]" onClick={() => handleSort("cost_per_medium")}>
                    CP-M<SortIcon field="cost_per_medium" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[5.5%]" onClick={() => handleSort("cost_per_tier_large")}>
                    CP-L<SortIcon field="cost_per_tier_large" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[5.5%]" onClick={() => handleSort("cost_per_enterprise")}>
                    CP-E<SortIcon field="cost_per_enterprise" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[5.5%]" onClick={() => handleSort("cost_per_enterprise_plus")}>
                    CP-E+<SortIcon field="cost_per_enterprise_plus" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[6%]" onClick={() => handleSort("meetings_count")}>
                    Reun.<SortIcon field="meetings_count" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[7%]" onClick={() => handleSort("sales_count")}>
                    Vendas/CAC<SortIcon field="sales_count" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[7%]" onClick={() => handleSort("revenue")}>
                    FPC<SortIcon field="revenue" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer w-[5.5%]" onClick={() => handleSort("roas")}>
                    ROAS<SortIcon field="roas" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creatives.map((c, i) => {
                  const isBestMql = topMql && c.creative_key === topMql.creative_key && c.mql_count > 0;
                  const isBestCpmql2 = bestCpmql && c.creative_key === bestCpmql.creative_key;
                  const isBestRevenue = topRevenue && c.creative_key === topRevenue.creative_key && c.revenue > 0;
                  const cpl = c.spend > 0 && c.leads_count > 0 ? c.spend / c.leads_count : null;

                  return (
                    <TableRow
                      key={c.creative_key}
                      className={`cursor-pointer hover:bg-muted/50 ${isBestMql ? "bg-green-500/5" : ""} ${isBestRevenue ? "bg-emerald-500/5" : ""}`}
                      onClick={() => setDrillCreative(c)}
                    >
                      <TableCell className="py-1.5">
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
                      </TableCell>
                      <TableCell className="text-right text-[10px] py-1.5">{formatCurrency(c.spend)}</TableCell>
                      <TableCell className="text-right text-[10px] py-1.5">
                        <div className="font-semibold">{c.leads_count}</div>
                        <div className="text-muted-foreground text-[9px]">{formatCurrency(cpl)}</div>
                      </TableCell>
                      <TableCell className={`text-right text-[10px] py-1.5 ${isBestCpmql2 ? "text-green-400" : ""}`}>
                        <div className="font-semibold text-green-400">{c.mql_count}</div>
                        <div className={`text-[9px] ${isBestCpmql2 ? "font-bold text-green-400" : "text-muted-foreground"}`}>{formatCurrency(c.cost_per_mql)}</div>
                      </TableCell>
                      <TableCell className="text-right text-[10px] py-1.5">{formatPercent(c.mql_rate)}</TableCell>
                      <TableCell className="text-right text-[10px] py-1.5">
                        {c.tier_small_count > 0 ? (
                          <><div className="font-semibold">{c.tier_small_count}</div><div className="text-muted-foreground text-[9px]">{formatCurrency(c.cost_per_small)}</div></>
                        ) : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-[10px] py-1.5 text-blue-400">
                        {c.tier_medium_count > 0 ? (
                          <><div className="font-semibold">{c.tier_medium_count}</div><div className="text-[9px]">{formatCurrency(c.cost_per_medium)}</div></>
                        ) : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-[10px] py-1.5 text-amber-400">
                        {c.tier_large_count > 0 ? (
                          <><div className="font-semibold">{c.tier_large_count}</div><div className="text-[9px]">{formatCurrency(c.cost_per_tier_large)}</div></>
                        ) : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-[10px] py-1.5 text-purple-400">
                        {c.tier_enterprise_count > 0 ? (
                          <><div className="font-semibold">{c.tier_enterprise_count}</div><div className="text-[9px]">{formatCurrency(c.cost_per_enterprise)}</div></>
                        ) : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-[10px] py-1.5 text-pink-400">
                        {c.tier_enterprise_plus_count > 0 ? (
                          <><div className="font-semibold">{c.tier_enterprise_plus_count}</div><div className="text-[9px]">{formatCurrency(c.cost_per_enterprise_plus)}</div></>
                        ) : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-[10px] py-1.5 text-orange-400">
                        {c.meetings_count > 0 ? (
                          <><div className="font-semibold">{c.meetings_count}</div><div className="text-[9px]">{formatCurrency(c.cost_per_meeting)}</div></>
                        ) : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-[10px] py-1.5">
                        <div className="font-semibold">{c.sales_count}</div>
                        {c.cac !== null && <div className="text-muted-foreground text-[9px]">{formatCurrency(c.cac)}</div>}
                      </TableCell>
                      <TableCell className="text-right text-[10px] py-1.5">
                        <div className="font-semibold">{formatCurrency(c.revenue)}</div>
                      </TableCell>
                      <TableCell className="text-right text-[10px] py-1.5 font-bold">
                        {c.roas !== null ? <span className={c.roas >= 1 ? "text-emerald-400" : "text-red-400"}>{c.roas.toFixed(1)}x</span> : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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

      {/* Sales Listing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Vendas Registradas
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowSalesList(!showSalesList);
                if (!showSalesList && salesList.length === 0) loadSales();
              }}
            >
              {showSalesList ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              {showSalesList ? "Ocultar" : "Ver vendas"}
            </Button>
          </CardTitle>
        </CardHeader>
        {showSalesList && (
          <CardContent>
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
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead>Criativo</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesList.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>{format(new Date(sale.sale_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>

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
            <DialogTitle>Registrar Venda Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <LeadSearchPicker
              leads={leadsList}
              loading={leadsLoading}
              selectedId={selectedLeadId}
              onSelect={setSelectedLeadId}
            />

            {/* Auto-filled info */}
            {selectedSaleLead && (
              <div className="p-3 rounded-md bg-accent/20 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Criativo:</span>
                  <span className="font-medium">{selectedSaleLead.utm_content || "Sem criativo (Direct)"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mercado:</span>
                  <span>{selectedSaleLead.mercado}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tier:</span>
                  <Badge variant="outline" className="text-[10px]">{selectedSaleLead.tier || "—"}</Badge>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm text-muted-foreground">Data da Venda *</label>
              <Input type="date" value={saleForm.sale_date} onChange={e => setSaleForm(p => ({ ...p, sale_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Receita (R$) *</label>
              <Input type="number" step="0.01" placeholder="5000.00" value={saleForm.revenue} onChange={e => setSaleForm(p => ({ ...p, revenue: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Notas</label>
              <Input placeholder="Observações adicionais" value={saleForm.notes} onChange={e => setSaleForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <Button onClick={handleAddSale} disabled={savingSale || !selectedLeadId} className="w-full">
              {savingSale ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Venda
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
            <Button onClick={handleAddMeeting} disabled={savingMeeting || !meetingSelectedLeadId} className="w-full">
              {savingMeeting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Registrar Reunião
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Meetings Listing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Reuniões Registradas
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowMeetingsList(!showMeetingsList);
                if (!showMeetingsList && meetingsList.length === 0) loadMeetings();
              }}
            >
              {showMeetingsList ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              {showMeetingsList ? "Ocultar" : "Ver reuniões"}
            </Button>
          </CardTitle>
        </CardHeader>
        {showMeetingsList && (
          <CardContent>
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
                    <TableHead>Observação</TableHead>
                    <TableHead className="w-10"></TableHead>
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
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{meeting.notes || "—"}</TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
