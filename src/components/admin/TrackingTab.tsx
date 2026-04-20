import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, TrendingDown, MousePointer, Eye, Smartphone, Monitor, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDateRange } from "@/context/DateRangeContext";

interface Diagnostics {
  meta: { clicks: number; impressions: number };
  landing_hits: {
    total: number;
    by_device: Record<string, number>;
    from_ads: number;
    organic: number;
  };
  cta_clicks: number;
  legacy_pageviews: number;
  comparisons: {
    meta_vs_hits_loss: number;
    meta_vs_hits_loss_pct: number;
    hits_vs_cta_engagement_pct: number;
  };
  alerts: { severity: "ALTA" | "MÉDIA" | "BAIXA"; title: string; message: string }[];
}

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
}

const sevColor = (s: string) =>
  s === "ALTA"
    ? "border-red-500 bg-red-500/10 text-red-500"
    : s === "MÉDIA"
    ? "border-yellow-500 bg-yellow-500/10 text-yellow-500"
    : "border-blue-500 bg-blue-500/10 text-blue-500";

function StatCard({ label, value, sub, icon: Icon, accent }: { label: string; value: string | number; sub?: string; icon: any; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${accent || ""}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <Icon className="w-6 h-6 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function TrackingTab({ fetchAdminData }: Props) {
  const { startISO, endISO } = useDateRange();
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminData("/tracking-diagnostics", { from: startISO, to: endISO });
      setData(res);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar diagnóstico");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startISO, endISO]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) return <div className="text-red-500 p-4">{error}</div>;
  if (!data) return null;

  const lossPct = data.comparisons.meta_vs_hits_loss_pct;
  const lossAccent = lossPct > 30 ? "text-red-500" : lossPct > 15 ? "text-yellow-500" : "text-green-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Diagnóstico de Tracking</h2>
          <p className="text-sm text-muted-foreground">
            Compare cliques no anúncio vs visitas reais na landing para identificar perdas de carregamento.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Linha principal: funil de tracking */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Meta Clicks"
          value={data.meta.clicks.toLocaleString("pt-BR")}
          sub={`${data.meta.impressions.toLocaleString("pt-BR")} impressões`}
          icon={MousePointer}
        />
        <StatCard
          label="Landing Hits ✓"
          value={data.landing_hits.total.toLocaleString("pt-BR")}
          sub="Fonte da verdade (sendBeacon)"
          icon={Eye}
          accent="text-primary"
        />
        <StatCard
          label="Pageviews (legacy)"
          value={data.legacy_pageviews.toLocaleString("pt-BR")}
          sub="lead_sessions na /"
          icon={Eye}
        />
        <StatCard
          label="CTA Clicks"
          value={data.cta_clicks.toLocaleString("pt-BR")}
          sub={`${data.comparisons.hits_vs_cta_engagement_pct.toFixed(1)}% de engajamento`}
          icon={MousePointer}
        />
      </div>

      {/* Perda de carregamento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5" />
            Perda de Carregamento (Meta → Landing)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Cliques perdidos</p>
              <p className={`text-3xl font-bold ${lossAccent}`}>
                {data.comparisons.meta_vs_hits_loss.toLocaleString("pt-BR")}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">% de perda</p>
              <p className={`text-3xl font-bold ${lossAccent}`}>{lossPct.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Connect rate</p>
              <p className="text-3xl font-bold">
                {data.meta.clicks > 0
                  ? ((data.landing_hits.total / data.meta.clicks) * 100).toFixed(1)
                  : "0"}
                %
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Segmentações */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="w-4 h-4" />
              Por Dispositivo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(data.landing_hits.by_device)
                .filter(([, v]) => v > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([dev, count]) => {
                  const pct = data.landing_hits.total > 0 ? (count / data.landing_hits.total) * 100 : 0;
                  return (
                    <div key={dev}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize font-medium">{dev}</span>
                        <span className="text-muted-foreground">
                          {count.toLocaleString("pt-BR")} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="w-4 h-4" />
              Por Origem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: "Tráfego pago (UTM)", count: data.landing_hits.from_ads },
                { label: "Orgânico / direto / bio", count: data.landing_hits.organic },
              ].map((row) => {
                const pct = data.landing_hits.total > 0 ? (row.count / data.landing_hits.total) * 100 : 0;
                return (
                  <div key={row.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{row.label}</span>
                      <span className="text-muted-foreground">
                        {row.count.toLocaleString("pt-BR")} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas automáticos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Diagnósticos automáticos ({data.alerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum problema detectado no período. Tracking saudável ✓
            </p>
          ) : (
            <div className="space-y-3">
              {data.alerts.map((a, i) => (
                <div key={i} className={`border-l-4 rounded p-3 ${sevColor(a.severity)}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={sevColor(a.severity)}>
                      {a.severity}
                    </Badge>
                    <span className="font-bold">{a.title}</span>
                  </div>
                  <p className="text-sm text-foreground/80">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
