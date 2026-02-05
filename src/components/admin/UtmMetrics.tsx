import { useState, useEffect, useMemo } from "react";
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
import DateRangePicker from "@/components/admin/DateRangePicker";
import { TrendingUp, Target, Globe, Link2, Hash, Loader2, BarChart3, Megaphone, Layers, FileImage } from "lucide-react";
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface Lead {
  id: string;
  created_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  // Meta Ads tracking
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  placement: string | null;
  site_source_name: string | null;
}

interface UtmMetricsProps {
  fetchAdminData: (endpoint: string) => Promise<Lead[] | null>;
}

interface GroupedData {
  name: string;
  count: number;
  percent: number;
}

interface TimeSeriesData {
  date: string;
  count: number;
}

interface AdsTableRow {
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  count: number;
  percent: number;
}

const PRESET_RANGES = [
  { label: "Últimos 7 dias", days: 7 },
  { label: "Últimos 30 dias", days: 30 },
  { label: "Últimos 90 dias", days: 90 },
];

export default function UtmMetrics({ fetchAdminData }: UtmMetricsProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [selectedPreset, setSelectedPreset] = useState<string>("30");
  
  // Filters
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [mediumFilter, setMediumFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [campaignIdFilter, setCampaignIdFilter] = useState<string>("all");

  // Load leads
  const loadLeads = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminData("/leads");
      setLeads(data || []);
    } catch (error) {
      console.error("Error loading leads for UTM metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  // Handle preset selection
  const handlePresetChange = (value: string) => {
    setSelectedPreset(value);
    if (value !== "custom") {
      const days = parseInt(value, 10);
      setDateRange({
        from: subDays(new Date(), days - 1),
        to: new Date(),
      });
    }
  };

  // Filter leads by date range and other filters
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const leadDate = new Date(lead.created_at);
      
      // Date range filter
      if (dateRange.from && leadDate < startOfDay(dateRange.from)) return false;
      if (dateRange.to && leadDate > endOfDay(dateRange.to)) return false;
      
      // UTM filters
      const source = lead.utm_source || "direct";
      const medium = lead.utm_medium || "none";
      const campaign = lead.utm_campaign || "(not set)";
      const campaignId = lead.campaign_id || "(não rastreado)";
      
      if (sourceFilter !== "all" && source !== sourceFilter) return false;
      if (mediumFilter !== "all" && medium !== mediumFilter) return false;
      if (campaignFilter !== "all" && campaign !== campaignFilter) return false;
      if (campaignIdFilter !== "all" && campaignId !== campaignIdFilter) return false;
      
      return true;
    });
  }, [leads, dateRange, sourceFilter, mediumFilter, campaignFilter, campaignIdFilter]);

  // Get unique filter options
  const filterOptions = useMemo(() => {
    const sources = new Set<string>();
    const mediums = new Set<string>();
    const campaigns = new Set<string>();
    const campaignIds = new Set<string>();
    
    leads.forEach((lead) => {
      sources.add(lead.utm_source || "direct");
      mediums.add(lead.utm_medium || "none");
      campaigns.add(lead.utm_campaign || "(not set)");
      if (lead.campaign_id) campaignIds.add(lead.campaign_id);
    });
    
    return {
      sources: Array.from(sources).sort(),
      mediums: Array.from(mediums).sort(),
      campaigns: Array.from(campaigns).sort(),
      campaignIds: Array.from(campaignIds).sort(),
    };
  }, [leads]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const total = filteredLeads.length;
    const withUtm = filteredLeads.filter((l) => l.utm_source && l.utm_source !== "direct").length;
    const percentWithUtm = total > 0 ? ((withUtm / total) * 100).toFixed(1) : "0";
    
    // Group by source
    const bySource: Record<string, number> = {};
    const byMedium: Record<string, number> = {};
    const byCampaign: Record<string, number> = {};
    const byCampaignId: Record<string, number> = {};
    const byAdsetId: Record<string, number> = {};
    const byAdId: Record<string, number> = {};
    
    filteredLeads.forEach((lead) => {
      const source = lead.utm_source || "direct";
      const medium = lead.utm_medium || "none";
      const campaign = lead.utm_campaign || "(not set)";
      const campaignId = lead.campaign_id || "(não rastreado)";
      const adsetId = lead.adset_id || "(não rastreado)";
      const adId = lead.ad_id || "(não rastreado)";
      
      bySource[source] = (bySource[source] || 0) + 1;
      byMedium[medium] = (byMedium[medium] || 0) + 1;
      byCampaign[campaign] = (byCampaign[campaign] || 0) + 1;
      byCampaignId[campaignId] = (byCampaignId[campaignId] || 0) + 1;
      byAdsetId[adsetId] = (byAdsetId[adsetId] || 0) + 1;
      byAdId[adId] = (byAdId[adId] || 0) + 1;
    });
    
    const toGroupedArray = (obj: Record<string, number>): GroupedData[] => {
      return Object.entries(obj)
        .map(([name, count]) => ({
          name,
          count,
          percent: total > 0 ? (count / total) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);
    };
    
    const sourceData = toGroupedArray(bySource);
    const mediumData = toGroupedArray(byMedium);
    const campaignData = toGroupedArray(byCampaign);
    const campaignIdData = toGroupedArray(byCampaignId);
    const adsetIdData = toGroupedArray(byAdsetId);
    const adIdData = toGroupedArray(byAdId);
    
    const topSource = sourceData[0]?.name || "-";
    const topCampaign = campaignData[0]?.name || "-";
    
    // Calculate with Meta Ads tracking
    const withMetaAds = filteredLeads.filter((l) => l.campaign_id || l.ad_id).length;
    const percentWithMetaAds = total > 0 ? ((withMetaAds / total) * 100).toFixed(1) : "0";
    
    return {
      total,
      withUtm,
      percentWithUtm,
      withMetaAds,
      percentWithMetaAds,
      topSource,
      topCampaign,
      sourceData,
      mediumData,
      campaignData,
      campaignIdData,
      adsetIdData,
      adIdData,
    };
  }, [filteredLeads]);

  // Ads table data (campaign_id, adset_id, ad_id combined)
  const adsTableData = useMemo((): AdsTableRow[] => {
    const total = filteredLeads.length;
    const grouped: Record<string, AdsTableRow> = {};
    
    filteredLeads.forEach((lead) => {
      const key = `${lead.campaign_id || "-"}|${lead.adset_id || "-"}|${lead.ad_id || "-"}`;
      if (!grouped[key]) {
        grouped[key] = {
          campaign_id: lead.campaign_id || "-",
          adset_id: lead.adset_id || "-",
          ad_id: lead.ad_id || "-",
          count: 0,
          percent: 0,
        };
      }
      grouped[key].count++;
    });
    
    return Object.values(grouped)
      .map((row) => ({
        ...row,
        percent: total > 0 ? (row.count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [filteredLeads]);

  // Time series data
  const timeSeriesData = useMemo((): TimeSeriesData[] => {
    if (!dateRange.from || !dateRange.to) return [];
    
    const days = eachDayOfInterval({
      start: dateRange.from,
      end: dateRange.to,
    });
    
    const countByDay: Record<string, number> = {};
    days.forEach((day) => {
      countByDay[format(day, "yyyy-MM-dd")] = 0;
    });
    
    filteredLeads.forEach((lead) => {
      const dayKey = format(parseISO(lead.created_at), "yyyy-MM-dd");
      if (countByDay[dayKey] !== undefined) {
        countByDay[dayKey]++;
      }
    });
    
    return days.map((day) => ({
      date: format(day, "dd/MM", { locale: ptBR }),
      count: countByDay[format(day, "yyyy-MM-dd")] || 0,
    }));
  }, [filteredLeads, dateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {/* Period Presets */}
            <div className="flex gap-2">
              {PRESET_RANGES.map((preset) => (
                <Button
                  key={preset.days}
                  variant={selectedPreset === String(preset.days) ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePresetChange(String(preset.days))}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            
            {/* Custom Date Range */}
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={(range) => {
                setDateRange(range);
                setSelectedPreset("custom");
              }}
            />
            
            {/* UTM Filters */}
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Sources</SelectItem>
                {filterOptions.sources.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={mediumFilter} onValueChange={setMediumFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Medium" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Mediums</SelectItem>
                {filterOptions.mediums.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Campaign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Campanhas</SelectItem>
                {filterOptions.campaigns.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Campaign ID Filter */}
            {filterOptions.campaignIds.length > 0 && (
              <Select value={campaignIdFilter} onValueChange={setCampaignIdFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Campaign ID" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Campaign IDs</SelectItem>
                  {filterOptions.campaignIds.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-3xl font-bold">{metrics.total}</p>
                <p className="text-sm text-muted-foreground">Total de Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Hash className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-3xl font-bold">{metrics.percentWithUtm}%</p>
                <p className="text-sm text-muted-foreground">Com UTM</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Megaphone className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <p className="text-3xl font-bold">{metrics.percentWithMetaAds}%</p>
                <p className="text-sm text-muted-foreground">Com Meta Ads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Globe className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-xl font-bold truncate max-w-[120px]" title={metrics.topSource}>
                  {metrics.topSource}
                </p>
                <p className="text-sm text-muted-foreground">Top Source</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Target className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-xl font-bold truncate max-w-[120px]" title={metrics.topCampaign}>
                  {metrics.topCampaign}
                </p>
                <p className="text-sm text-muted-foreground">Top Campanha</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time Series Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evolução de Leads no Período</CardTitle>
        </CardHeader>
        <CardContent>
          {timeSeriesData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    interval={Math.floor(timeSeriesData.length / 10)}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar 
                    dataKey="count" 
                    name="Leads"
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-10">
              Sem dados para o período selecionado
            </p>
          )}
        </CardContent>
      </Card>

      {/* Meta Ads Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileImage className="w-5 h-5" />
            Performance por Anúncio (Meta Ads)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign ID</TableHead>
                  <TableHead>Adset ID</TableHead>
                  <TableHead>Ad ID</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adsTableData.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs truncate max-w-[150px]" title={row.campaign_id}>
                      {row.campaign_id}
                    </TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[150px]" title={row.adset_id}>
                      {row.adset_id}
                    </TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[150px]" title={row.ad_id}>
                      {row.ad_id}
                    </TableCell>
                    <TableCell className="text-right font-medium">{row.count}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.percent.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {adsTableData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum lead com rastreamento Meta Ads
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Ranking Tables - UTM */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* By Source */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Por Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.sourceData.slice(0, 10).map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">{item.count}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.percent.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {metrics.sourceData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Sem dados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* By Medium */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Por Medium
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medium</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.mediumData.slice(0, 10).map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">{item.count}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.percent.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {metrics.mediumData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Sem dados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* By Campaign */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5" />
              Por Campanha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.campaignData.slice(0, 10).map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="font-medium truncate max-w-[150px]" title={item.name}>
                      {item.name}
                    </TableCell>
                    <TableCell className="text-right">{item.count}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.percent.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {metrics.campaignData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Sem dados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Meta Ads Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* By Campaign ID */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Megaphone className="w-5 h-5" />
              Por Campaign ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign ID</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.campaignIdData.slice(0, 20).map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="font-mono text-xs truncate max-w-[120px]" title={item.name}>
                      {item.name}
                    </TableCell>
                    <TableCell className="text-right">{item.count}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.percent.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {metrics.campaignIdData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Sem dados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* By Adset ID */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Por Adset ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adset ID</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.adsetIdData.slice(0, 20).map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="font-mono text-xs truncate max-w-[120px]" title={item.name}>
                      {item.name}
                    </TableCell>
                    <TableCell className="text-right">{item.count}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.percent.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {metrics.adsetIdData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Sem dados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* By Ad ID */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileImage className="w-5 h-5" />
              Por Ad ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad ID</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.adIdData.slice(0, 20).map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="font-mono text-xs truncate max-w-[120px]" title={item.name}>
                      {item.name}
                    </TableCell>
                    <TableCell className="text-right">{item.count}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.percent.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {metrics.adIdData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Sem dados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
