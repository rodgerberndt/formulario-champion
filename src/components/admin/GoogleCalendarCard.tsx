// Conexão do painel com o Google Calendar.
//
// Uma conta Google é a organizadora de todas as calls; Rodger, Miguel e Caio
// entram como convidados. Assim a reunião agendada aqui aparece na agenda de
// todo mundo sem cada um precisar autorizar a própria conta.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar, Loader2, Link2, Unlink } from "lucide-react";
import { fetchAdmin } from "@/lib/adminAuth";
import { useToast } from "@/hooks/use-toast";

interface Integracao {
  status: string;
  connected_email: string | null;
  calendar_id: string;
  attendee_emails: string[] | null;
  invite_lead: boolean;
  default_duration_minutes: number;
  last_sync_at: string | null;
  last_error: string | null;
}

interface StatusResponse {
  credenciais_configuradas: boolean;
  redirect_uri: string;
  integracao: Integracao | null;
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar`;

export default function GoogleCalendarCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [convidados, setConvidados] = useState("");
  const [duracao, setDuracao] = useState("45");
  const [convidarLead, setConvidarLead] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetchAdmin(`${FUNCTION_URL}/status`);
      const data: StatusResponse = await res.json();
      setStatus(data);
      if (data.integracao) {
        setConvidados((data.integracao.attendee_emails ?? []).join(", "));
        setDuracao(String(data.integracao.default_duration_minutes ?? 45));
        setConvidarLead(!!data.integracao.invite_lead);
      }
    } catch {
      /* a tela mostra o estado desconectado */
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // O popup do OAuth avisa por postMessage quando termina — é o único jeito de
  // saber que conectou sem ficar batendo no /status de segundo em segundo.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.source !== "champion-google-calendar-oauth") return;
      setConectando(false);
      if (e.data.ok) {
        toast({ title: "Google Calendar conectado", description: e.data.email || undefined });
        carregar();
      } else {
        toast({ title: "Falha ao conectar", description: e.data.error, variant: "destructive" });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [carregar, toast]);

  const conectar = async () => {
    setConectando(true);
    try {
      const res = await fetchAdmin(`${FUNCTION_URL}/auth-url`);
      const { url, error } = await res.json();
      if (!url) throw new Error(error || "sem URL de autorização");
      window.open(url, "google-oauth", "width=520,height=680");
    } catch (e) {
      setConectando(false);
      toast({ title: "Erro ao abrir o Google", description: String(e), variant: "destructive" });
    }
  };

  const desconectar = async () => {
    await fetchAdmin(`${FUNCTION_URL}/disconnect`, { method: "POST" });
    toast({ title: "Google Calendar desconectado" });
    carregar();
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await fetchAdmin(`${FUNCTION_URL}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendee_emails: convidados.split(/[,;\s]+/).filter(Boolean),
          default_duration_minutes: Number(duracao) || 45,
          invite_lead: convidarLead,
        }),
      });
      toast({ title: "Configuração salva" });
      carregar();
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando integração de agenda…
        </CardContent>
      </Card>
    );
  }

  const conectado = status?.integracao?.status === "connected";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Agenda das reuniões
          </span>
          <Badge variant="outline" className={conectado ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}>
            {conectado ? "Conectada" : "Desconectada"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status?.credenciais_configuradas && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
            <p className="font-medium text-amber-400">Falta cadastrar o app no Google</p>
            <p className="text-muted-foreground">
              Defina os secrets <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> no Supabase e
              autorize esta URL de retorno no console do Google:
            </p>
            <code className="block break-all rounded bg-background/60 p-2">{status?.redirect_uri}</code>
          </div>
        )}

        {conectado ? (
          <div className="text-sm">
            <p className="text-muted-foreground">
              Organizadora: <span className="text-foreground">{status?.integracao?.connected_email || "conta conectada"}</span>
            </p>
            {status?.integracao?.last_error && (
              <p className="mt-1 text-xs text-red-400">Último erro: {status.integracao.last_error}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Enquanto estiver desconectada, agendar reunião no painel continua funcionando — só não cria o evento na agenda de ninguém.
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Convidados de toda reunião (e-mails separados por vírgula)</label>
            <Input
              value={convidados}
              onChange={(e) => setConvidados(e.target.value)}
              placeholder="rodger@..., miguel@..., caio@..."
            />
          </div>
          <div className="flex gap-3">
            <div className="w-32">
              <label className="text-xs text-muted-foreground">Duração (min)</label>
              <Input type="number" min={15} step={5} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
            </div>
            <div className="flex-1 flex items-end gap-2 pb-1">
              <Switch checked={convidarLead} onCheckedChange={setConvidarLead} />
              <span className="text-xs text-muted-foreground">
                Convidar também o lead pelo e-mail do quiz (ele recebe convite do Google)
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={salvar} disabled={salvando} variant="secondary" size="sm">
            {salvando && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Salvar configuração
          </Button>
          {conectado ? (
            <Button onClick={desconectar} variant="outline" size="sm">
              <Unlink className="w-4 h-4 mr-2" /> Desconectar
            </Button>
          ) : (
            <Button onClick={conectar} disabled={conectando || !status?.credenciais_configuradas} size="sm">
              {conectando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link2 className="w-4 h-4 mr-2" />}
              Conectar Google
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
