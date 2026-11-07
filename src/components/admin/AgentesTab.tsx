import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ExternalLink, Monitor, Server } from "lucide-react";
import { fetchAdmin } from "@/lib/adminAuth";

/**
 * Aba "Agentes": os agentes e as automações trabalhando, num lugar só (pedido do Rodger, 14/10/2026).
 * - Agentes do PC (Reels, carrossel, stories...): gravam em agentes_status/agentes_eventos por
 *   01-Projetos/instagram-postagem/telemetria.mjs. Agent novo aparece sozinho quando começa a reportar.
 * - Rotinas do servidor: pg_cron, lidas pela função agentes_crons().
 * - Agendador do PC: as tarefas "Champion *" do Windows, fotografadas de hora em hora.
 * Só leitura. Fonte: edge function agentes-admin.
 */

const FN = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/agentes-admin`;

type Agente = {
  agente: string; nome: string; descricao: string | null; onde_roda: string | null; status: string;
  ultima_rodada: string | null; proxima_rodada: string | null; ultimo_erro: string | null; atualizado_em: string;
  resumo: { filas?: Record<string, number>; agenda?: string[]; copy?: string[]; tarefas?: Tarefa[] } & Record<string, unknown>;
};
type Tarefa = { nome: string; estado: string; ultima: string | null; resultado: number; proxima: string | null; ok: boolean };
type Evento = { id: number; agente: string; tipo: string; mensagem: string; link: string | null; criado_em: string };
type Cron = { jobname: string; schedule: string; active: boolean; ultimo_status: string | null; ultima_execucao: string | null; falhas_24h: number };

// Agentes que existem (ou vão existir) mesmo antes de reportar a primeira vez.
const ESPERADOS: Record<string, { nome: string; descricao: string }> = {
  reels: { nome: "Reels", descricao: "Publica os Reels aprovados às 12h." },
  carrossel: { nome: "Carrossel", descricao: "Copy da semana → revisão do Leo → arte → publica às 18h." },
  stories: { nome: "Stories", descricao: "Stories automáticos. Em construção: aparece aqui quando começar a reportar." },
};
const ROTINAS: Record<string, { nome: string; o_que: string }> = {
  "hermes-run": { nome: "HERMES", o_que: "agente de tráfego: sobe e corta anúncio" },
  "meta-ads-cron-15min": { nome: "Sync da Meta", o_que: "traz gasto e métricas dos anúncios" },
  "capi-reconciliacao": { nome: "Reconciliação da CAPI", o_que: "reenvia evento de lead que não chegou na Meta" },
  "sla-check-1min": { nome: "SLA do comercial", o_que: "cobra lead parado sem resposta" },
};
const CRON_TEXTO: Record<string, string> = { "* * * * *": "a cada minuto", "*/5 * * * *": "a cada 5 min", "*/10 * * * *": "a cada 10 min", "*/15 * * * *": "a cada 15 min" };
const COR: Record<string, string> = { ok: "bg-emerald-500", atencao: "bg-amber-500", erro: "bg-red-500", parado: "bg-slate-400" };
const ROTULO: Record<string, string> = { ok: "Funcionando", atencao: "Atenção", erro: "Com erro", parado: "Parado" };
const TIPO: Record<string, string> = { publicado: "Publicou", erro: "Erro", gerado: "Gerou copy", arte: "Arte pronta", fila: "Na fila", rodada: "Rodou", info: "Info" };

function relativo(iso: string | null, agora: number): string {
  if (!iso) return "nunca";
  const min = Math.round((new Date(iso).getTime() - agora) / 60000);
  const abs = Math.abs(min);
  const txt = abs < 1 ? "agora" : abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} dias`;
  if (txt === "agora") return txt;
  return min < 0 ? `há ${txt}` : `em ${txt}`;
}
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Ponto({ status }: { status: string }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${COR[status] ?? COR.parado}`} />;
}

export default function AgentesTab() {
  const [dados, setDados] = useState<{ agentes: Agente[]; eventos: Evento[]; crons: Cron[]; agora: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetchAdmin(FN);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      setDados(j);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60000);
    return () => clearInterval(t);
  }, [carregar]);

  if (!dados && !erro) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const agora = dados ? new Date(dados.agora).getTime() : Date.now();
  const porId = new Map((dados?.agentes ?? []).map((a) => [a.agente, a]));
  const agendador = porId.get("agendador");
  // agente que não reporta há mais de 3 horas está parado (PC desligado, tarefa travada)
  const statusReal = (a: Agente) => (a.ultima_rodada && agora - new Date(a.ultima_rodada).getTime() > 3 * 3600000 ? "parado" : a.status);
  const cards = [
    ...Object.keys(ESPERADOS).map((id) => porId.get(id) ?? null).map((a, i) => a ?? ({ agente: Object.keys(ESPERADOS)[i], ...ESPERADOS[Object.keys(ESPERADOS)[i]], status: "parado", resumo: {}, ultima_rodada: null } as unknown as Agente)),
    ...(dados?.agentes ?? []).filter((a) => a.agente !== "agendador" && !ESPERADOS[a.agente]),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-2xl font-bold">Agentes</h2>
          <p className="text-sm text-muted-foreground">
            Quem está trabalhando sozinho na Champion: os agentes do PC, as rotinas do servidor e o que cada um fez por último. Atualiza a cada minuto.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={carregar} disabled={carregando}>
          {carregando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}Atualizar
        </Button>
      </div>

      {erro && <Card><CardContent className="py-4 text-sm text-red-600">Não consegui ler os agentes: {erro}</CardContent></Card>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((a) => {
          const st = a.ultima_rodada ? statusReal(a) : "parado";
          return (
            <Card key={a.agente}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-semibold"><Ponto status={st} />{a.nome}</div>
                    <div className="text-xs text-muted-foreground mt-1">{a.descricao}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0 gap-1"><Monitor className="w-3 h-3" />{a.onde_roda ?? "PC do Rodger"}</Badge>
                </div>
                <div className="text-sm">
                  <span className="font-medium">{a.ultima_rodada ? ROTULO[st] : "Ainda não reportou"}</span>
                  {a.ultima_rodada && <span className="text-muted-foreground"> · rodou {relativo(a.ultima_rodada, agora)}{a.proxima_rodada ? ` · próxima ${relativo(a.proxima_rodada, agora)}` : ""}</span>}
                </div>
                {st === "parado" && a.ultima_rodada && <div className="text-xs text-amber-700">Sem notícia há mais de 3 horas. O PC está ligado e com o Drive aberto?</div>}
                {a.ultimo_erro && <div className="text-xs rounded-md bg-red-50 text-red-700 p-2">{a.ultimo_erro}</div>}
                {a.resumo?.filas && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(a.resumo.filas).map(([k, v]) => <Badge key={k} variant="secondary">{k}: {v}</Badge>)}
                  </div>
                )}
                {(a.resumo?.copy ?? []).map((l) => <div key={l} className="text-xs text-muted-foreground">{l}</div>)}
                {!!a.resumo?.agenda?.length && (
                  <div className="text-xs space-y-0.5 border-t pt-2">
                    {a.resumo.agenda.slice(0, 4).map((l) => <div key={l} className={/SAI/.test(l) ? "font-medium" : "text-muted-foreground"}>{l}</div>)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div>
        <h3 className="font-semibold mb-2 flex items-center gap-2"><Server className="w-4 h-4" />Rotinas do servidor</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(dados?.crons ?? []).map((c) => {
            const info = ROTINAS[c.jobname] ?? { nome: c.jobname, o_que: "" };
            const st = !c.active ? "parado" : c.falhas_24h > 0 ? "atencao" : c.ultimo_status === "succeeded" ? "ok" : "erro";
            return (
              <Card key={c.jobname}>
                <CardContent className="pt-4 space-y-1">
                  <div className="flex items-center gap-2 font-medium"><Ponto status={st} />{info.nome}</div>
                  <div className="text-xs text-muted-foreground">{info.o_que}</div>
                  <div className="text-xs">{CRON_TEXTO[c.schedule] ?? c.schedule} · disparou {relativo(c.ultima_execucao, agora)}</div>
                  {c.falhas_24h > 0 && <div className="text-xs text-amber-700">{c.falhas_24h} disparo(s) falharam nas últimas 24h</div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {agendador?.resumo?.tarefas && (
        <div>
          <h3 className="font-semibold mb-2 flex items-center gap-2"><Monitor className="w-4 h-4" />Agendador do PC <span className="text-xs font-normal text-muted-foreground">(foto de {relativo(agendador.ultima_rodada, agora)})</span></h3>
          <Card>
            <CardContent className="pt-4">
              <div className="divide-y text-sm">
                {agendador.resumo.tarefas.map((t) => (
                  <div key={t.nome} className="flex flex-wrap items-center gap-2 py-2">
                    <Ponto status={t.ok ? "ok" : "erro"} />
                    <span className="flex-1 min-w-[200px]">{t.nome.replace(/^Champion\s*-?\s*/, "")}</span>
                    <span className="text-xs text-muted-foreground">última {relativo(t.ultima, agora)}{!t.ok ? ` (código ${t.resultado})` : ""}</span>
                    <span className="text-xs text-muted-foreground w-28 text-right">{t.proxima ? `próxima ${relativo(t.proxima, agora)}` : "sem próxima"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h3 className="font-semibold mb-2">O que aconteceu</h3>
        <Card>
          <CardContent className="pt-4">
            {!dados?.eventos.length && <div className="text-sm text-muted-foreground py-4 text-center">Nenhum evento ainda. Assim que um agente publicar, gerar copy ou falhar, aparece aqui.</div>}
            <div className="divide-y text-sm">
              {(dados?.eventos ?? []).map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="text-xs text-muted-foreground w-24">{hora(e.criado_em)}</span>
                  <Badge variant={e.tipo === "erro" ? "destructive" : "secondary"}>{TIPO[e.tipo] ?? e.tipo}</Badge>
                  <span className="text-xs font-medium uppercase text-muted-foreground">{porId.get(e.agente)?.nome ?? ESPERADOS[e.agente]?.nome ?? e.agente}</span>
                  <span className="flex-1 min-w-[200px]">{e.mensagem}</span>
                  {e.link && <a href={e.link} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">abrir <ExternalLink className="w-3 h-3" /></a>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
