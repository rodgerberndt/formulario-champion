import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
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
  mql_rate: number;
  spend: number;
  cost_per_mql: number | null;
  sales_count: number;
  cac: number | null;
  revenue: number;
  roas: number | null;
  last_activity: string | null;
  leads_by_stage: Record<string, number>;
  campaigns: string[];
}

interface CreativesResponse {
  creatives: CreativeData[];
  totals: {
    spend: number;
    leads: number;
    mql: number;
    sales: number;
    revenue: number;
    cpl: number | null;
    cpmql: number | null;
    cac: number | null;
    roas: number | null;
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

const MQL_STAGES = ["Pré-escala (vendas constantes)", "Escala (buscando otimização)"];
const MQL_SPEND_THRESHOLD_FAIXAS = ["R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k", "R$ 100k+"];

function isLeadMql(estagio: string, investimento: string | null): boolean {
  if (MQL_STAGES.includes(estagio)) return true;
  if (investimento && MQL_SPEND_THRESHOLD_FAIXAS.includes(investimento)) return true;
  return false;
}

// ── Props ──
interface CreativesTabProps {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
  startDateOnly: string;
  endDateOnly: string;
}

export default function CreativesTab({ fetchAdminData, startDateOnly, endDateOnly }: CreativesTabProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CreativesResponse | null>(null);
  const [attribution, setAttribution] = useState<"first" | "last">("first");
  const [sortField, setSortField] = useState<string>("mql_count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [drillCreative, setDrillCreative] = useState<CreativeData | null>(null);

  // Filters
  const [filterOnlyWithSpend, setFilterOnlyWithSpend] = useState(false);
  const [filterOnlyWithLeads, setFilterOnlyWithLeads] = useState(false);
  const [filterOnlyWithMql, setFilterOnlyWithMql] = useState(false);
  const [filterOnlyWithSales, setFilterOnlyWithSales] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Manual sales form
  const [showAddSale, setShowAddSale] = useState(false);
  const [saleForm, setSaleForm] = useState({ sale_date: "", revenue: "", creative_key: "", notes: "" });
  const [savingSale, setSavingSale] = useState(false);

  // Ad spend form
  const [showAddSpend, setShowAddSpend] = useState(false);
  const [spendForm, setSpendForm] = useState({ date: "", spend: "", impressions: "0", clicks: "0", utm_content: "", campaign_name: "" });
  const [savingSpend, setSavingSpend] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        from: startDateOnly,
        to: endDateOnly,
        attribution,
      };
      const result = await fetchAdminData("/creatives", params);
      setData(result);
    } catch (err) {
      console.error("Error loading creatives:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchAdminData, startDateOnly, endDateOnly, attribution]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddSale = async () => {
    if (!saleForm.sale_date || !saleForm.revenue) {
      toast({ title: "Preencha data e receita", variant: "destructive" });
      return;
    }
    setSavingSale(true);
    try {
      const ck = saleForm.creative_key ? normalizeCreativeKey(saleForm.creative_key) : null;
      await fetchAdminData("/manual-sales", {
        _method: "POST",
        sale_date: saleForm.sale_date,
        revenue: saleForm.revenue,
        creative_key: ck || "",
        utm_content: saleForm.creative_key || "",
        notes: saleForm.notes,
      });
      toast({ title: "Venda registrada!" });
      setSaleForm({ sale_date: "", revenue: "", creative_key: "", notes: "" });
      setShowAddSale(false);
      loadData();
    } catch {
      toast({ title: "Erro ao salvar venda", variant: "destructive" });
    } finally {
      setSavingSale(false);
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
      const token = sessionStorage.getItem("admin_token");
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

  // Sort & filter creatives
  const creatives = (data?.creatives || [])
    .filter(c => {
      if (filterOnlyWithSpend && c.spend <= 0) return false;
      if (filterOnlyWithLeads && c.leads_count <= 0) return false;
      if (filterOnlyWithMql && c.mql_count <= 0) return false;
      if (filterOnlyWithSales && c.sales_count <= 0) return false;
      return true;
    })
    .sort((a, b) => {
      const aVal = (a as any)[sortField] ?? -Infinity;
      const bVal = (b as any)[sortField] ?? -Infinity;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });

  // Find top creatives
  const topMql = creatives.length > 0 ? creatives.reduce((best, c) => c.mql_count > best.mql_count ? c : best, creatives[0]) : null;
  const topRevenue = creatives.length > 0 ? creatives.reduce((best, c) => c.revenue > best.revenue ? c : best, creatives[0]) : null;
  const topSales = creatives.length > 0 ? creatives.reduce((best, c) => c.sales_count > best.sales_count ? c : best, creatives[0]) : null;
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

        <Button variant="outline" size="sm" onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}>
          Filtros {showAdvancedFilters ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
        </Button>

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
          <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Atualizar"}
          </Button>
        </div>
      </div>

      {/* Advanced filters */}
      {showAdvancedFilters && (
        <Card>
          <CardContent className="pt-4 flex flex-wrap gap-6">
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

      {/* Summary Cards */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Total Spend</p>
              <p className="text-xl font-bold">{formatCurrency(totals.spend)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Total Leads</p>
              <p className="text-xl font-bold">{formatNumber(totals.leads)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Total MQL</p>
              <p className="text-xl font-bold text-green-400">{formatNumber(totals.mql)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Total Vendas</p>
              <p className="text-xl font-bold text-blue-400">{formatNumber(totals.sales)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">Total Receita</p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(totals.revenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">CPL</p>
              <p className="text-lg font-bold">{formatCurrency(totals.cpl)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">CPMQL</p>
              <p className="text-lg font-bold">{formatCurrency(totals.cpmql)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">CAC</p>
              <p className="text-lg font-bold">{formatCurrency(totals.cac)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase">ROAS</p>
              <p className="text-lg font-bold">{totals.roas !== null ? `${totals.roas.toFixed(2)}x` : "—"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ranking Cards */}
      {creatives.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <CardContent className="overflow-x-auto">
          {creatives.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              Nenhum criativo encontrado no período. Verifique se os leads possuem utm_content preenchido.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Criativo</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("spend")}>
                    Spend <SortIcon field="spend" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("leads_count")}>
                    Leads <SortIcon field="leads_count" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("mql_count")}>
                    MQL <SortIcon field="mql_count" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("mql_rate")}>
                    %MQL <SortIcon field="mql_rate" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("cost_per_mql")}>
                    CPMQL <SortIcon field="cost_per_mql" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("sales_count")}>
                    Vendas <SortIcon field="sales_count" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("cac")}>
                    CAC <SortIcon field="cac" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("revenue")}>
                    Receita <SortIcon field="revenue" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("roas")}>
                    ROAS <SortIcon field="roas" />
                  </TableHead>
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {i < 3 && c.mql_count > 0 && (
                            <Star className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                          )}
                          <div>
                            <p className="font-medium truncate max-w-[180px]">{c.creative_label}</p>
                            <div className="flex items-center gap-1.5">
                              <code className="text-[10px] text-muted-foreground">{c.creative_key}</code>
                              {c.creative_source_field === "fallback" && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 border-yellow-500/50 text-yellow-400">
                                  fallback
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(c.spend)}</TableCell>
                      <TableCell className="text-right">{c.leads_count}</TableCell>
                      <TableCell className="text-right font-semibold text-green-400">{c.mql_count}</TableCell>
                      <TableCell className="text-right">{formatPercent(c.mql_rate)}</TableCell>
                      <TableCell className={`text-right ${isBestCpmql2 ? "text-green-400 font-bold" : ""}`}>
                        {formatCurrency(c.cost_per_mql)}
                      </TableCell>
                      <TableCell className="text-right">{c.sales_count}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.cac)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.revenue)}</TableCell>
                      <TableCell className="text-right">{c.roas !== null ? `${c.roas.toFixed(2)}x` : "—"}</TableCell>
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

      {/* Drill-down Dialog */}
      <Dialog open={!!drillCreative} onOpenChange={(open) => !open && setDrillCreative(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {drillCreative && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {drillCreative.creative_label}
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

                {/* Campaigns that contributed */}
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
      <Dialog open={showAddSale} onOpenChange={setShowAddSale}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Venda Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Data da Venda *</label>
              <Input type="date" value={saleForm.sale_date} onChange={e => setSaleForm(p => ({ ...p, sale_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Receita (R$) *</label>
              <Input type="number" step="0.01" placeholder="5000.00" value={saleForm.revenue} onChange={e => setSaleForm(p => ({ ...p, revenue: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Criativo (utm_content ou nome)</label>
              <Input placeholder="Ex: T01 - C3 - CL" value={saleForm.creative_key} onChange={e => setSaleForm(p => ({ ...p, creative_key: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Notas</label>
              <Input placeholder="Observações" value={saleForm.notes} onChange={e => setSaleForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <Button onClick={handleAddSale} disabled={savingSale} className="w-full">
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
    </div>
  );
}
