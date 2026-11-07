import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, RefreshCw, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchAdmin } from "@/lib/adminAuth";

/**
 * WhatsApp do comercial no CRM (Cloud API, app "Champion CRM Mensagens").
 * Mensagens entram pela edge function whatsapp-webhook; esta aba lê e envia
 * pela whatsapp-admin. Contexto: 01-Projetos/champion-direct/docs/PROJECT-CONTEXT.md
 */

const FN = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/whatsapp-admin`;

type Mensagem = { wamid: string; direcao: "entrada" | "saida"; autor: string; texto: string | null; status: string | null; erro: string | null; criado_em: string };
type Contato = { wa_id: string; nome: string | null; lead_id: string | null; ultima_msg_em: string | null };
type Conversa = Partial<Contato> & { wa_id: string; ultima?: { texto: string | null; direcao: string; criado_em: string } };
type Modelo = { id: string; name: string; status: string; category: string; language: string; rejected_reason?: string; components: { type: string; text?: string }[] };

const AUTOR: Record<string, string> = { crm: "CRM", app: "Celular", contato: "" };
const STATUS: Record<string, string> = { accepted: "enviada", sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" };

async function api<T = any>(acao: string, dados: Record<string, unknown> = {}): Promise<T> {
  const r = await fetchAdmin(FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, ...dados }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j as T;
}

const erro = (e: unknown) => toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
const fone = (w: string) => (w.length >= 12 ? `+${w.slice(0, 2)} ${w.slice(2, 4)} ${w.slice(4)}` : w);
const corpoDe = (m: Modelo) => m.components.find((c) => c.type === "BODY")?.text ?? "";

export default function WhatsAppTab() {
  const [aba, setAba] = useState<"conversas" | "modelos">("conversas");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xl font-semibold">WhatsApp</h2>
        {(["conversas", "modelos"] as const).map((k) => (
          <Button key={k} size="sm" variant={aba === k ? "default" : "outline"} onClick={() => setAba(k)}>
            {k === "conversas" ? "Conversas" : "Modelos de mensagem"}
          </Button>
        ))}
      </div>
      {aba === "conversas" ? <Conversas /> : <Modelos />}
    </div>
  );
}

// ── Conversas ───────────────────────────────────────────────

function Conversas() {
  const [lista, setLista] = useState<Conversa[] | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [contato, setContato] = useState<Contato | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [nova, setNova] = useState(false);

  const carregarLista = useCallback(() => {
    api<{ conversas: Conversa[] }>("conversas").then((j) => setLista(j.conversas)).catch(erro);
  }, []);
  const abrir = useCallback((waId: string) => {
    setAberta(waId);
    setNova(false);
    api<{ mensagens: Mensagem[]; contato: Contato }>("mensagens", { wa_id: waId }).then((j) => { setMsgs(j.mensagens); setContato(j.contato); }).catch(erro);
  }, []);

  useEffect(() => { carregarLista(); }, [carregarLista]);
  // Atualiza sozinho a cada 10s enquanto a aba está aberta.
  useEffect(() => {
    const t = window.setInterval(() => { carregarLista(); if (aberta) abrir(aberta); }, 10000);
    return () => window.clearInterval(t);
  }, [aberta, abrir, carregarLista]);

  const enviar = async () => {
    if (!aberta || !texto.trim()) return;
    setEnviando(true);
    try {
      await api("enviar", { wa_id: aberta, texto });
      setTexto("");
      abrir(aberta);
      carregarLista();
    } catch (e) {
      erro(e);
    } finally {
      setEnviando(false);
    }
  };

  if (!lista) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const janela = contato?.ultima_msg_em && Date.now() - new Date(contato.ultima_msg_em).getTime() < 24 * 3600 * 1000;

  return (
    <div className="grid gap-4 md:grid-cols-[300px_1fr]">
      <Card className="max-h-[70vh] overflow-auto">
        <CardContent className="p-2">
          <Button size="sm" className="mb-2 w-full" variant="outline" onClick={() => { setNova(true); setAberta(null); }}>
            <Plus className="mr-1 h-4 w-4" />Nova conversa
          </Button>
          {!lista.length && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa ainda.</p>}
          {lista.map((c) => (
            <button key={c.wa_id} onClick={() => abrir(c.wa_id)}
              className={`flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted ${aberta === c.wa_id ? "bg-muted" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.nome || fone(c.wa_id)}</div>
                <div className="truncate text-xs text-muted-foreground">{c.ultima?.direcao === "saida" ? "Você: " : ""}{c.ultima?.texto ?? "(mídia)"}</div>
              </div>
              {c.lead_id && <Badge variant="outline" className="text-[10px]">lead</Badge>}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="flex max-h-[70vh] flex-col">
        {nova ? (
          <NovaConversa onEnviada={(waId) => { carregarLista(); abrir(waId); }} />
        ) : !aberta ? (
          <CardContent className="py-16 text-center text-muted-foreground">Escolha uma conversa.</CardContent>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <div className="flex-1">
                <div className="font-semibold">{contato?.nome || fone(aberta)}</div>
                <div className="text-xs text-muted-foreground">{fone(aberta)}</div>
              </div>
              {contato?.lead_id && <Badge>é lead</Badge>}
            </div>
            <div className="flex-1 space-y-2 overflow-auto p-3">
              {msgs.map((m) => (
                <div key={m.wamid} className={`flex ${m.direcao === "saida" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.direcao === "saida" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.texto ?? "(mídia)"}
                    <div className="mt-1 text-[10px] opacity-70">
                      {AUTOR[m.autor] ? `${AUTOR[m.autor]} · ` : ""}{new Date(m.criado_em).toLocaleString("pt-BR")}
                      {m.direcao === "saida" && m.status ? ` · ${STATUS[m.status] ?? m.status}` : ""}
                      {m.erro ? ` · ${m.erro}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t p-3">
              {janela ? (
                <div className="flex gap-2">
                  <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responder"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
                  <Button onClick={enviar} disabled={enviando || !texto.trim()}>{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
                </div>
              ) : (
                <EnviarModelo waId={aberta} onEnviada={() => { abrir(aberta); carregarLista(); }}
                  aviso="Fora da janela de 24h: a Meta só deixa começar a conversa com um modelo aprovado." />
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function NovaConversa({ onEnviada }: { onEnviada: (waId: string) => void }) {
  const [tel, setTel] = useState("");
  return (
    <CardContent className="space-y-3 p-4">
      <div className="font-semibold">Nova conversa</div>
      <Input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Telefone com DDD, ex.: 48 99829-7254" />
      <EnviarModelo waId={tel} onEnviada={onEnviada} aviso="A primeira mensagem para alguém sempre é um modelo aprovado pela Meta." />
    </CardContent>
  );
}

function EnviarModelo({ waId, onEnviada, aviso }: { waId: string; onEnviada: (waId: string) => void; aviso: string }) {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [escolhido, setEscolhido] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<{ modelos: Modelo[] }>("modelos").then((j) => setModelos(j.modelos.filter((m) => m.status === "APPROVED"))).catch(erro);
  }, []);
  const m = modelos.find((x) => x.id === escolhido);
  const vars = m ? (corpoDe(m).match(/\{\{\d+\}\}/g) ?? []) : [];

  const enviar = async () => {
    if (!m) return;
    setEnviando(true);
    try {
      let previa = corpoDe(m);
      params.forEach((p, i) => { previa = previa.split(`{{${i + 1}}}`).join(p); });
      const j = await api<{ wa_id: string }>("enviar_modelo", { wa_id: waId, nome: m.name, idioma: m.language, parametros: params, previa });
      toast({ title: "Modelo enviado" });
      onEnviada(j.wa_id);
    } catch (e) {
      erro(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{aviso}</p>
      <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={escolhido}
        onChange={(e) => { setEscolhido(e.target.value); setParams([]); }}>
        <option value="">Escolha um modelo aprovado…</option>
        {modelos.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.language})</option>)}
      </select>
      {m && <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{corpoDe(m)}</p>}
      {vars.map((v, i) => (
        <Input key={v} value={params[i] ?? ""} placeholder={`Valor de ${v}`}
          onChange={(e) => setParams((p) => { const n = [...p]; n[i] = e.target.value; return n; })} />
      ))}
      <Button onClick={enviar} disabled={!m || enviando || !waId.trim()}>
        {enviando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Enviar modelo
      </Button>
    </div>
  );
}

// ── Modelos ─────────────────────────────────────────────────

function Modelos() {
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState<"MARKETING" | "UTILITY">("UTILITY");
  const [corpo, setCorpo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    api<{ modelos: Modelo[] }>("modelos").then((j) => setModelos(j.modelos)).catch(erro);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const criar = async () => {
    setSalvando(true);
    try {
      await api("criar_modelo", { nome, categoria, corpo, idioma: "pt_BR" });
      toast({ title: "Modelo enviado para aprovação da Meta" });
      setNome(""); setCorpo("");
      carregar();
    } catch (e) {
      erro(e);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[360px_1fr]">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="font-semibold">Criar modelo</div>
          <Input value={nome} onChange={(e) => setNome(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder="nome_do_modelo" />
          <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value as "MARKETING" | "UTILITY")}>
            <option value="UTILITY">Utilidade (aviso, retorno de atendimento)</option>
            <option value="MARKETING">Marketing (oferta, conteúdo)</option>
          </select>
          <Textarea rows={5} value={corpo} onChange={(e) => setCorpo(e.target.value)} placeholder={"Oi {{1}}, aqui é o Miguel da Champion..."} />
          <p className="text-xs text-muted-foreground">Use {"{{1}}"}, {"{{2}}"} para partes que mudam (ex.: o nome). A Meta aprova em minutos ou horas.</p>
          <Button onClick={criar} disabled={salvando || !nome || !corpo.trim()}>{salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}Criar modelo</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center">
            <div className="mr-auto font-semibold">Modelos da conta</div>
            <Button size="sm" variant="ghost" onClick={carregar}><RefreshCw className="h-4 w-4" /></Button>
          </div>
          {!modelos ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
            <div className="space-y-2">
              {modelos.map((m) => (
                <div key={m.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">{m.name}</span>
                    <Badge variant={m.status === "APPROVED" ? "default" : "outline"}>{{ APPROVED: "aprovado", PENDING: "em análise", REJECTED: "recusado" }[m.status] ?? m.status}</Badge>
                    <span className="text-xs text-muted-foreground">{m.category} · {m.language}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{corpoDe(m)}</p>
                  {m.rejected_reason && m.rejected_reason !== "NONE" && <p className="text-xs text-destructive">Motivo: {m.rejected_reason}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
