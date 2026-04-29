import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, ShieldAlert, RefreshCw, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { fetchAdmin } from "@/lib/adminAuth";

interface Proposal {
  id: string;
  created_at: string;
  action_type: string;
  target: string;
  proposed_change: any;
  current_state: any;
  expected_impact: string | null;
  risks: string | null;
  rollback_plan: string | null;
  files_or_tables_affected: string[] | null;
  requires_manual_execution: boolean;
  is_hard_block: boolean;
  status: string;
  approver_id: string | null;
  approver_note: string | null;
  approved_at: string | null;
  executed_at: string | null;
  execution_result: any;
  expires_at: string;
}

const FN_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/ai-admin-assistant`;

export default function AiProposalsTab() {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmStage, setConfirmStage] = useState<1 | 2>(1);
  const [acting, setActing] = useState<{ id: string; kind: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [apiKey, setApiKey] = useState<string>(() => sessionStorage.getItem("ai_admin_api_key") || "");

  const load = useCallback(async () => {
    if (!apiKey) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await fetch(`${FN_BASE}/proposals?status=${statusFilter}&limit=100`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setRows(j.rows || []);
    } catch (e) {
      toast({ title: "Erro ao carregar propostas", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiKey, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function hmacSign(body: string): Promise<{ sig: string; ts: string }> {
    // Frontend não tem o HMAC secret — pedimos ao usuário para colar quando aprovar.
    // Em vez disso, usamos o backend admin-data como ponte? Por simplicidade,
    // exigimos que o admin tenha o HMAC secret armazenado em sessionStorage também.
    const secret = sessionStorage.getItem("ai_admin_hmac_secret") || "";
    if (!secret) throw new Error("HMAC secret não configurado. Cole-o em sessionStorage.ai_admin_hmac_secret");
    const ts = String(Math.floor(Date.now() / 1000));
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", k, enc.encode(`${ts}.${body}`));
    const sig = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return { sig, ts };
  }

  async function performAction() {
    if (!acting) return;
    try {
      const adminToken = sessionStorage.getItem("admin_analytics_token");
      if (!adminToken) throw new Error("Sessão admin expirada");
      const body = JSON.stringify({ approval_id: acting.id, approver_note: note || undefined });
      const { sig, ts } = await hmacSign(body);
      const path = acting.kind === "approve" ? "/approve-action" : "/reject-action";
      const r = await fetch(`${FN_BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "x-signature": sig,
          "x-timestamp": ts,
          "x-admin-token": adminToken,
        },
        body,
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      toast({ title: acting.kind === "approve" ? "Aprovado" : "Rejeitado" });
      setConfirmOpen(false); setConfirmStage(1); setActing(null); setNote("");
      load();
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            AI Proposals — Approval Gate
          </CardTitle>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!apiKey && (
            <div className="border border-amber-500/40 bg-amber-500/10 p-3 rounded-md text-sm">
              <p className="font-semibold flex items-center gap-2"><Lock className="w-4 h-4" /> Chave da IA não configurada</p>
              <p className="text-muted-foreground mt-1">Cole a AI_ADMIN_ASSISTANT_API_KEY abaixo (apenas em sessão).</p>
              <div className="flex gap-2 mt-2">
                <input type="password" className="flex-1 px-2 py-1 rounded bg-background border" placeholder="API key"
                  onChange={(e) => setApiKey(e.target.value)} />
                <Button size="sm" onClick={() => { sessionStorage.setItem("ai_admin_api_key", apiKey); load(); }}>Salvar</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Para aprovar/rejeitar, cole também o HMAC secret em <code>sessionStorage.ai_admin_hmac_secret</code>.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            {["pending", "approved", "rejected", "executed", "failed", "expired"].map((s) => (
              <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
                {s}
              </Button>
            ))}
          </div>

          {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>}

          {!loading && rows.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhuma proposta com status "{statusFilter}".</p>
          )}

          {rows.map((p) => (
            <Card key={p.id} className="border-2">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={p.is_hard_block ? "destructive" : "secondary"}>
                        {p.is_hard_block ? "HARD BLOCK (manual)" : "Soft action"}
                      </Badge>
                      <Badge variant="outline">{p.status}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{p.id.slice(0, 8)}</span>
                    </div>
                    <p className="font-semibold mt-1">{p.action_type} → <span className="text-muted-foreground">{p.target}</span></p>
                    <p className="text-xs text-muted-foreground">criada {new Date(p.created_at).toLocaleString("pt-BR")} · expira {new Date(p.expires_at).toLocaleString("pt-BR")}</p>
                  </div>
                  {p.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="default" onClick={() => { setActing({ id: p.id, kind: "approve" }); setConfirmStage(1); setConfirmOpen(true); }}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => { setActing({ id: p.id, kind: "reject" }); setConfirmStage(1); setConfirmOpen(true); }}>
                        <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                      </Button>
                    </div>
                  )}
                </div>

                {p.expected_impact && <p className="text-sm"><strong>Impacto:</strong> {p.expected_impact}</p>}
                {p.risks && <p className="text-sm text-amber-600 dark:text-amber-400"><strong>Riscos:</strong> {p.risks}</p>}
                {p.rollback_plan && <p className="text-sm"><strong>Rollback:</strong> {p.rollback_plan}</p>}
                {p.files_or_tables_affected && p.files_or_tables_affected.length > 0 && (
                  <p className="text-xs text-muted-foreground"><strong>Afeta:</strong> {p.files_or_tables_affected.join(", ")}</p>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Mudança proposta (JSON)</summary>
                  <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">{JSON.stringify(p.proposed_change, null, 2)}</pre>
                </details>
                {p.execution_result && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Resultado da execução</summary>
                    <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">{JSON.stringify(p.execution_result, null, 2)}</pre>
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) { setConfirmStage(1); setActing(null); setNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmStage === 1 ? "Confirmação 1/2" : "Confirmação 2/2"} — {acting?.kind === "approve" ? "Aprovar" : "Rejeitar"} proposta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {confirmStage === 1
                ? "Revise a proposta. Esta ação será registrada com seu admin token e timestamp."
                : "Confirmação final. Após confirmar, o status será alterado e a IA poderá tentar executar (apenas para soft actions)."}
            </p>
            {confirmStage === 2 && (
              <Textarea placeholder="Nota do aprovador (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            {confirmStage === 1 ? (
              <Button onClick={() => setConfirmStage(2)}>Continuar</Button>
            ) : (
              <Button variant={acting?.kind === "approve" ? "default" : "destructive"} onClick={performAction}>
                Confirmar {acting?.kind === "approve" ? "aprovação" : "rejeição"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
