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
 import { TrendingUp, Target, Globe, Link2, Hash, Loader2, BarChart3 } from "lucide-react";
 import { format, subDays, startOfDay, endOfDay, eachDayOfInterval, parseISO } from "date-fns";
 import { ptBR } from "date-fns/locale";
 import {
   LineChart,
   Line,
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
       
       if (sourceFilter !== "all" && source !== sourceFilter) return false;
       if (mediumFilter !== "all" && medium !== mediumFilter) return false;
       if (campaignFilter !== "all" && campaign !== campaignFilter) return false;
       
       return true;
     });
   }, [leads, dateRange, sourceFilter, mediumFilter, campaignFilter]);
 
   // Get unique filter options
   const filterOptions = useMemo(() => {
     const sources = new Set<string>();
     const mediums = new Set<string>();
     const campaigns = new Set<string>();
     
     leads.forEach((lead) => {
       sources.add(lead.utm_source || "direct");
       mediums.add(lead.utm_medium || "none");
       campaigns.add(lead.utm_campaign || "(not set)");
     });
     
     return {
       sources: Array.from(sources).sort(),
       mediums: Array.from(mediums).sort(),
       campaigns: Array.from(campaigns).sort(),
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
     
     filteredLeads.forEach((lead) => {
       const source = lead.utm_source || "direct";
       const medium = lead.utm_medium || "none";
       const campaign = lead.utm_campaign || "(not set)";
       
       bySource[source] = (bySource[source] || 0) + 1;
       byMedium[medium] = (byMedium[medium] || 0) + 1;
       byCampaign[campaign] = (byCampaign[campaign] || 0) + 1;
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
     
     const topSource = sourceData[0]?.name || "-";
     const topCampaign = campaignData[0]?.name || "-";
     
     return {
       total,
       withUtm,
       percentWithUtm,
       topSource,
       topCampaign,
       sourceData,
       mediumData,
       campaignData,
     };
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
           </div>
         </CardContent>
       </Card>
 
       {/* KPI Cards */}
       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
               <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                 <Globe className="w-6 h-6 text-blue-500" />
               </div>
               <div>
                 <p className="text-xl font-bold truncate max-w-[150px]" title={metrics.topSource}>
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
                 <p className="text-xl font-bold truncate max-w-[150px]" title={metrics.topCampaign}>
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
 
       {/* Ranking Tables */}
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
     </div>
   );
 }