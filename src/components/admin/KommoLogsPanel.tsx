import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { fetchAdmin } from "@/lib/adminAuth";

interface KommoLog {
  id: string;
  created_at: string;
  status: string;
  final_status: string;
  stage: string | null;
  source: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  contact_id: number | null;
  lead_id: number | null;
  error_message: string | null;
  retry_count: number | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  external_key: string | null;
}

async function fetchAdminData(path: string, params?: Record<string, string>) {
  const queryString = params ? "?" + new URLSearchParams(params).toString() : "";
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data${path}${queryString}`;
  const res = await fetchAdmin(url, {
    headers: {
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function postAdminData(path: string, body?: Record<string, unknown>) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data${path}`;
  const res = await fetchAdmin(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toUpperCase();
  if (s === "SUCCESS") return <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs"><CheckCircle className="w-3 h-3 mr-1" />SUCCESS</Badge>;
  if (s === "FAILED" || s === "VALIDATION_FAILED" || s === "CONFIG_ERROR") return <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-xs"><XCircle className="w-3 h-3 mr-1" />{s}</Badge>;
  if (s === "IN_PROGRESS" || s === "RETRYING") return <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-xs"><Clock className="w-3 h-3 mr-1" />{s}</Badge>;
  return <Badge className="bg-muted text-muted-foreground text-xs">{s || "pending"}</Badge>;
}

function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return null;
  const colors: Record<string, string> = {
    validation: "bg-orange-600/20 text-orange-400 border-orange-600/30",
    config_check: "bg-red-600/20 text-red-400 border-red-600/30",
    search_contact: "bg-blue-600/20 text-blue-400 border-blue-600/30",
    create_contact: "bg-blue-600/20 text-blue-400 border-blue-600/30",
    create_lead: "bg-purple-600/20 text-purple-400 border-purple-600/30",
    add_note: "bg-indigo-600/20 text-indigo-400 border-indigo-600/30",
    unhandled_error: "bg-red-600/20 text-red-400 border-red-600/30",
  };
  return <Badge className={`${colors[stage] || "bg-muted text-muted-foreground"} text-xs`}>{stage}</Badge>;
}

export default function KommoLogsPanel() {
  const [logs, setLogs] = useState<KommoLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminData("/kommo-logs", { limit: "200" });
      setLogs(data || []);
    } catch (err) {
      console.error("Error loading Kommo logs:", err);
      toast({ title: "Erro ao carregar logs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await postAdminData("/kommo-test");
      setTestResult(result);
      if (result.test_status === "SUCCESS") {
        toast({ title: "✅ Teste Kommo OK!", description: `Contact/Lead criado com sucesso.` });
      } else {
        toast({ title: "❌ Teste Kommo falhou", description: result.response?.error || "Erro desconhecido", variant: "destructive" });
      }
      // Refresh logs after test
      setTimeout(loadLogs, 1500);
    } catch (err) {
      toast({ title: "Erro no teste", description: String(err), variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const successCount = logs.filter(l => l.final_status === "SUCCESS").length;
  const failedCount = logs.filter(l => ["FAILED", "VALIDATION_FAILED", "CONFIG_ERROR"].includes(l.final_status || "")).length;

  return (
    <div className="space-y-6">
      {/* Header with stats and test button */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-3">
          <Card className="bg-green-900/20 border-green-700/30 px-4 py-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-lg font-bold text-green-400">{successCount}</span>
              <span className="text-xs text-muted-foreground">Sucesso</span>
            </div>
          </Card>
          <Card className="bg-red-900/20 border-red-700/30 px-4 py-2">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-lg font-bold text-red-400">{failedCount}</span>
              <span className="text-xs text-muted-foreground">Falha</span>
            </div>
          </Card>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            onClick={handleTest}
            disabled={testing}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-1" />
            )}
            Testar Kommo
          </Button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <Card className={`border-2 ${testResult.test_status === "SUCCESS" ? "border-green-600/50 bg-green-900/10" : "border-red-600/50 bg-red-900/10"}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {testResult.test_status === "SUCCESS" ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <span className="font-bold text-sm">
                Teste: {String(testResult.test_status)} (HTTP {String(testResult.http_status)})
              </span>
            </div>
            <pre className="text-xs text-muted-foreground bg-background/50 rounded p-2 overflow-x-auto max-h-32">
              {JSON.stringify(testResult.response, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Logs list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Últimos {logs.length} envios para Kommo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && logs.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhum log encontrado. Use o botão "Testar Kommo" para validar.
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                    </span>
                    <StatusBadge status={log.final_status || log.status} />
                    <StageBadge stage={log.stage} />
                    {log.source && log.source !== "trigger" && (
                      <Badge variant="outline" className="text-xs">{log.source}</Badge>
                    )}
                    <span className="text-sm font-medium truncate max-w-[200px]">
                      {log.lead_name || "—"}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {log.lead_phone || "—"}
                    </span>
                    {log.contact_id && (
                      <span className="text-xs text-blue-400">C:{log.contact_id}</span>
                    )}
                    {log.lead_id && (
                      <span className="text-xs text-purple-400">L:{log.lead_id}</span>
                    )}
                    {(log.retry_count || 0) > 0 && (
                      <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-600/30">
                        retry:{log.retry_count}
                      </Badge>
                    )}
                  </div>
                  
                  {log.error_message && (
                    <div className="mt-1 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                      <span className="text-xs text-red-400 line-clamp-2">{log.error_message}</span>
                    </div>
                  )}

                  {expandedLog === log.id && (
                    <div className="mt-3 space-y-2">
                      {log.request_payload && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Request Payload:</span>
                          <pre className="text-xs bg-background/50 rounded p-2 mt-1 overflow-x-auto max-h-40">
                            {JSON.stringify(log.request_payload, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.response_payload && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Response:</span>
                          <pre className="text-xs bg-background/50 rounded p-2 mt-1 overflow-x-auto max-h-40">
                            {JSON.stringify(log.response_payload, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
