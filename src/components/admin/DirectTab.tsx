import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, ArrowLeft, Copy, Trash2, X, RefreshCw, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchAdmin } from "@/lib/adminAuth";

/**
 * Champion Direct: automação de DM do Instagram (no lugar do ManyChat).
 * O motor roda na edge function instagram-webhook; esta aba só configura e mede.
 * Doc: 01-Projetos/champion-direct/docs/ENGENHARIA-REVERSA-MANYCHAT.md
 */

const FN = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/direct-admin`;
const CONTA = "assessoriachampion";

type Gatilho = "comentario" | "dm" | "story" | "ref";
const GATILHOS: Record<Gatilho, string> = {
  comentario: "Comentário em post/reel",
  dm: "Palavra-chave na DM",
  story: "Resposta a story",
  ref: "Link ig.me",
};

type Opcao = { titulo: string; tag?: string; proximo?: string | null; valor?: string };
type Botao = { titulo: string; url: string };
type Passo = {
  id: string;
  texto: string;
  botoes?: Botao[];
  opcoes?: Opcao[];
  tags?: string[];
  coletar?: { campo: string; proximo?: string | null } | null;
  proximo?: string | null;
  exigir_seguir?: boolean;
  texto_portao?: string;
  botao_portao?: string;
};
type Modo = "nada" | "opcoes" | "botoes" | "coletar" | "proximo";
type Automacao = {
  id?: string;
  nome: string;
  ativo: boolean;
  gatilho: Gatilho;
  palavras: string[];
  midias: string[];
  ref: string | null;
  respostas_publicas: string[];
  passos: Passo[];
  campanha?: string | null;
};
type Contador = { automacao_id: string; tipo: string; total: number; pessoas: number };
type Midia = { id: string; caption?: string; thumbnail_url?: string; media_url?: string };
type Contato = {
  igsid: string; username: string | null; nome: string | null; foto_url: string | null; segue: boolean | null;
  tags: string[]; campos: Record<string, string>; optout: boolean; pausado_ate: string | null; ultima_interacao_em: string;
  origem?: string | null; origem_detalhe?: Record<string, unknown> | null; lead_id?: string | null; ultima_msg_em?: string | null;
};
type Mensagem = { mid: string; direcao: "entrada" | "saida"; autor: string; texto: string | null; criado_em: string };
type Conversa = Partial<Contato> & { igsid: string; ultima?: { texto: string | null; direcao: string; criado_em: string } };

const ORIGEM: Record<string, string> = { comentario: "Comentário", seguidor: "Novo seguidor", dm: "DM", story: "Story", ref: "Link ig.me" };
const AUTOR: Record<string, string> = { robo: "Robô", humano: "Equipe", manychat: "ManyChat", contato: "" };
type Evento = { criado_em: string; tipo: string; automacao_id: string | null; detalhe: unknown };

const TIPOS: Record<string, string> = {
  disparo: "Disparou", envio: "Mensagem enviada", opcao: "Escolheu opção", clique: "Clicou no link",
  coleta: "Respondeu (salvo)", erro: "Erro", optout: "Pediu para parar", pausa: "Humano respondeu: pausado", portao: "Pediu para seguir",
};

const campoCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

async function api<T = any>(acao: string, dados: Record<string, unknown> = {}): Promise<T> {
  const r = await fetchAdmin(FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, ...dados }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j as T;
}

const bytes = (t: string) => new TextEncoder().encode(t || "").length;
const lista = (t: string) => t.split(",").map((s) => s.trim()).filter(Boolean);

function modoDe(p: Passo): Modo {
  if (p.botoes) return "botoes";
  if (p.opcoes) return "opcoes";
  if (p.coletar) return "coletar";
  if (p.proximo) return "proximo";
  return "nada";
}

function novaAutomacao(): Automacao {
  return { nome: "", ativo: false, gatilho: "comentario", palavras: [], midias: [], ref: "", respostas_publicas: [], passos: [{ id: "p1", texto: "", tags: [] }] };
}

function novoId(a: Automacao) {
  let n = 1;
  while (a.passos.some((p) => p.id === `p${n}`)) n++;
  return `p${n}`;
}

// Limpa campos vazios antes de mandar: o servidor valida de novo.
function paraSalvar(a: Automacao): Automacao {
  return {
    ...a,
    passos: a.passos.map((p) => {
      const c: Passo = { id: p.id, texto: p.texto, tags: p.tags ?? [] };
      if (p.botoes?.length) c.botoes = p.botoes;
      if (p.opcoes?.length) c.opcoes = p.opcoes.map((o) => ({ titulo: o.titulo, tag: o.tag || undefined, proximo: o.proximo || null, valor: o.valor || undefined }));
      if (p.coletar) c.coletar = { campo: p.coletar.campo, proximo: p.coletar.proximo || null };
      if (p.proximo) c.proximo = p.proximo;
      if (p.exigir_seguir) Object.assign(c, { exigir_seguir: true, texto_portao: p.texto_portao, botao_portao: p.botao_portao });
      return c;
    }),
  };
}

export default function DirectTab() {
  const [aba, setAba] = useState<"conversas" | "auto" | "contatos" | "atividade">("conversas");
  const [automacoes, setAutomacoes] = useState<Automacao[]>([]);
  const [contadores, setContadores] = useState<Contador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Automacao | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const j = await api<{ automacoes: Automacao[]; contadores: Contador[] }>("listar");
      setAutomacoes(j.automacoes ?? []);
      setContadores(j.contadores ?? []);
    } catch (e) {
      toast({ title: "Erro ao carregar o Direct", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (editando) {
    return <Editor inicial={editando} aoVoltar={() => setEditando(null)} aoSalvar={async () => { setEditando(null); await carregar(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-2xl font-bold">Direct</h2>
          <p className="text-sm text-muted-foreground">
            Respostas automáticas no Direct da @{CONTA}. Quem escrever PARAR deixa de receber; se alguém da equipe responder pelo celular, o robô fica quieto 12h com aquela pessoa.
          </p>
        </div>
        <div className="flex gap-2">
          {(["conversas", "auto", "contatos", "atividade"] as const).map((k) => (
            <Button key={k} size="sm" variant={aba === k ? "default" : "outline"} onClick={() => setAba(k)}>
              {{ conversas: "Conversas", auto: "Automações", contatos: "Contatos", atividade: "Atividade" }[k]}
            </Button>
          ))}
        </div>
      </div>

      {aba === "auto" && (
        <ListaAutomacoes
          automacoes={automacoes}
          contadores={contadores}
          carregando={carregando}
          aoEditar={(a) => setEditando(JSON.parse(JSON.stringify(a)))}
          aoNova={() => setEditando(novaAutomacao())}
          aoMudou={carregar}
        />
      )}
      {aba === "conversas" && <Conversas />}
      {aba === "contatos" && <Contatos />}
      {aba === "atividade" && <Atividade automacoes={automacoes} />}
    </div>
  );
}

// ── Lista ───────────────────────────────────────────────────

function ListaAutomacoes({ automacoes, contadores, carregando, aoEditar, aoNova, aoMudou }: {
  automacoes: Automacao[]; contadores: Contador[]; carregando: boolean;
  aoEditar: (a: Automacao) => void; aoNova: () => void; aoMudou: () => Promise<void>;
}) {
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const conta = (id: string | undefined, tipo: string, campo: "total" | "pessoas" = "total") =>
    Number(contadores.find((c) => c.automacao_id === id && c.tipo === tipo)?.[campo] ?? 0);

  const alternar = async (a: Automacao) => {
    try {
      await api("ativar", { id: a.id, ativo: !a.ativo });
      toast({ title: a.ativo ? "Desligada" : "Ligada" });
      await aoMudou();
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };
  const excluir = async (a: Automacao) => {
    if (confirmar !== a.id) return setConfirmar(a.id!);
    try {
      await api("excluir", { id: a.id });
      toast({ title: "Excluída" });
      await aoMudou();
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={aoNova}><Plus className="w-4 h-4 mr-1" />Nova automação</Button></div>
      {!automacoes.length && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma automação ainda.</CardContent></Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {automacoes.map((a) => (
          <Card key={a.id}>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 font-semibold leading-tight">{a.nome}</div>
                <Switch checked={a.ativo} onCheckedChange={() => alternar(a)} />
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge>{GATILHOS[a.gatilho]}</Badge>
                {a.palavras.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
                {a.gatilho === "comentario" && <Badge variant="outline">{a.midias.length ? `${a.midias.length} post(s)` : "qualquer post"}</Badge>}
                {a.gatilho === "ref" && <Badge variant="outline">ref={a.ref}</Badge>}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  ["pessoas", conta(a.id, "disparo", "pessoas")],
                  ["mensagens", conta(a.id, "envio")],
                  ["escolhas", conta(a.id, "opcao")],
                  ["cliques", conta(a.id, "clique")],
                ].map(([r, v]) => (
                  <div key={r as string} className="rounded-md bg-muted/50 py-2">
                    <div className="text-lg font-bold text-primary">{v}</div>
                    <div className="text-[11px] text-muted-foreground">{r}</div>
                  </div>
                ))}
              </div>
              {conta(a.id, "erro") > 0 && <p className="text-xs text-destructive">{conta(a.id, "erro")} envio(s) com erro: veja em Atividade.</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => aoEditar(a)}>Editar</Button>
                <Button size="sm" variant="outline" onClick={() => aoEditar({ ...JSON.parse(JSON.stringify(a)), id: undefined, nome: `${a.nome} (cópia)`, ativo: false })}>
                  <Copy className="w-3.5 h-3.5 mr-1" />Duplicar
                </Button>
                <div className="flex-1" />
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => excluir(a)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" />{confirmar === a.id ? "Confirmar" : "Excluir"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────

function Editor({ inicial, aoVoltar, aoSalvar }: { inicial: Automacao; aoVoltar: () => void; aoSalvar: () => Promise<void> }) {
  const [a, setA] = useState<Automacao>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [midias, setMidias] = useState<Midia[] | null>(null);
  const [erroMidias, setErroMidias] = useState<string | null>(null);

  const mudar = (m: Partial<Automacao>) => setA((x) => ({ ...x, ...m }));
  const mudarPasso = (i: number, m: Partial<Passo>) =>
    setA((x) => ({ ...x, passos: x.passos.map((p, j) => (j === i ? { ...p, ...m } : p)) }));

  useEffect(() => {
    if (a.gatilho !== "comentario" || midias) return;
    api<{ midias: Midia[] }>("midias").then((j) => setMidias(j.midias)).catch((e) => setErroMidias((e as Error).message));
  }, [a.gatilho, midias]);

  const salvar = async () => {
    setSalvando(true);
    try {
      const j = await api<{ automacao: Automacao }>("salvar", { automacao: paraSalvar(a) });
      toast({ title: j.automacao.ativo ? "Salva e ligada" : "Salva (desligada)" });
      await aoSalvar();
    } catch (e) {
      toast({ title: "Não salvou", description: (e as Error).message, variant: "destructive" });
      setSalvando(false);
    }
  };

  const removerPasso = (i: number) => setA((x) => {
    const id = x.passos[i].id;
    const solta = (v?: string | null) => (v === id ? null : v);
    return {
      ...x,
      passos: x.passos.filter((_, j) => j !== i).map((p) => ({
        ...p,
        proximo: solta(p.proximo),
        opcoes: p.opcoes?.map((o) => ({ ...o, proximo: solta(o.proximo) })),
        coletar: p.coletar ? { ...p.coletar, proximo: solta(p.coletar.proximo) } : p.coletar,
      })),
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={aoVoltar}><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
        <h2 className="text-xl font-bold flex-1">{a.id ? "Editar automação" : "Nova automação"}</h2>
        <span className="text-sm text-muted-foreground">{a.ativo ? "Ligada" : "Desligada"}</span>
        <Switch checked={a.ativo} onCheckedChange={(v) => mudar({ ativo: v })} />
        <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Salvar</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <Rotulo t="Nome">
                <Input value={a.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Ex.: Comenta QUERO no reel do Ighor" />
              </Rotulo>
              <Rotulo t="Campanha (aparece no lead)" dica='Ex.: "Isca 01". Quando a pessoa deixa nome e telefone, ela entra na aba Leads com este rótulo e a origem (comentário, seguidor, DM).'>
                <Input value={a.campanha ?? ""} onChange={(e) => mudar({ campanha: e.target.value })} placeholder="Ex.: Isca 01" />
              </Rotulo>
              <Rotulo t="Quando disparar">
                <select className={campoCls} value={a.gatilho} onChange={(e) => mudar({ gatilho: e.target.value as Gatilho })}>
                  {Object.entries(GATILHOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Rotulo>
              {a.gatilho !== "ref" ? (
                <Rotulo t="Palavras-chave" dica={`Separe por vírgula. Não diferencia maiúscula nem acento.${a.gatilho === "dm" ? " Na DM é obrigatório, senão o robô responderia toda mensagem." : " Vazio = qualquer texto."}`}>
                  <Input defaultValue={a.palavras.join(", ")} onChange={(e) => mudar({ palavras: lista(e.target.value) })} placeholder={a.gatilho === "dm" ? "ex.: quero, link" : "vazio = qualquer texto"} />
                </Rotulo>
              ) : (
                <Rotulo t="Ref do link" dica={`Link para bio, QR code ou LP: https://ig.me/m/${CONTA}?ref=${a.ref || "seu-ref"} (funciona no app, não no Instagram Web).`}>
                  <Input value={a.ref ?? ""} onChange={(e) => mudar({ ref: e.target.value.trim() })} placeholder="ex.: bio" />
                </Rotulo>
              )}
              {a.gatilho === "comentario" && (
                <>
                  <Rotulo t="Em quais posts" dica="Nenhum marcado = qualquer post ou reel.">
                    {erroMidias && <p className="text-sm text-destructive">Não carregou os posts: {erroMidias}</p>}
                    {!midias && !erroMidias && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
                    {midias && (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-72 overflow-auto p-0.5">
                        {midias.map((m) => {
                          const on = a.midias.includes(m.id);
                          return (
                            <button
                              type="button"
                              key={m.id}
                              title={(m.caption ?? "").slice(0, 120)}
                              onClick={() => mudar({ midias: on ? a.midias.filter((x) => x !== m.id) : [...a.midias, m.id] })}
                              className={`relative aspect-[9/16] overflow-hidden rounded-md border-2 bg-muted ${on ? "border-primary" : "border-transparent"}`}
                            >
                              {(m.thumbnail_url || m.media_url) && <img src={m.thumbnail_url || m.media_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                              {on && <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </Rotulo>
                  <Rotulo t="Resposta pública no comentário (opcional)" dica="Uma por linha. Sorteamos uma a cada comentário.">
                    <Textarea defaultValue={a.respostas_publicas.join("\n")} onChange={(e) => mudar({ respostas_publicas: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
                  </Rotulo>
                </>
              )}
            </CardContent>
          </Card>

          {a.passos.map((p, i) => (
            <CartaoPasso key={p.id} a={a} p={p} i={i} mudar={(m) => mudarPasso(i, m)} remover={() => removerPasso(i)} />
          ))}
          <Button variant="outline" onClick={() => setA((x) => ({ ...x, passos: [...x.passos, { id: novoId(x), texto: "", tags: [] }] }))}>
            <Plus className="w-4 h-4 mr-1" />Mensagem
          </Button>
        </div>

        <div className="lg:sticky lg:top-4"><Previa p={a.passos[0]} /></div>
      </div>
    </div>
  );
}

function Rotulo({ t, dica, children }: { t: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{t}</div>
      {children}
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}

function Destinos({ a, atual, valor, onChange }: { a: Automacao; atual: string; valor?: string | null; onChange: (v: string | null) => void }) {
  return (
    <select className={campoCls} value={valor ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Terminar aqui</option>
      {a.passos.filter((p) => p.id !== atual).map((p) => (
        <option key={p.id} value={p.id}>Mensagem {a.passos.indexOf(p) + 1}{p.texto ? `: ${p.texto.slice(0, 28)}` : ""}</option>
      ))}
    </select>
  );
}

function CartaoPasso({ a, p, i, mudar, remover }: { a: Automacao; p: Passo; i: number; mudar: (m: Partial<Passo>) => void; remover: () => void }) {
  const modo = modoDe(p);
  const limite = modo === "botoes" ? 640 : 1000;
  const trocarModo = (m: Modo) => {
    const base: Partial<Passo> = { botoes: undefined, opcoes: undefined, coletar: undefined, proximo: null };
    if (m === "botoes") base.botoes = [{ titulo: "", url: "" }];
    if (m === "opcoes") base.opcoes = [{ titulo: "", tag: "", proximo: null }];
    if (m === "coletar") base.coletar = { campo: "", proximo: null };
    if (m === "proximo") base.proximo = a.passos.find((x) => x.id !== p.id)?.id ?? null;
    mudar(base);
  };
  const setOpcao = (j: number, m: Partial<Opcao>) => mudar({ opcoes: p.opcoes!.map((o, k) => (k === j ? { ...o, ...m } : o)) });
  const setBotao = (j: number, m: Partial<Botao>) => mudar({ botoes: p.botoes!.map((b, k) => (k === j ? { ...b, ...m } : b)) });

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center">
          <div className="flex-1 font-semibold text-primary">Mensagem {i + 1}{i === 0 ? " (primeira)" : ""}</div>
          {i > 0 && <Button size="sm" variant="ghost" className="text-destructive" onClick={remover}><Trash2 className="w-3.5 h-3.5 mr-1" />Remover</Button>}
        </div>
        <div>
          <Textarea rows={4} value={p.texto} onChange={(e) => mudar({ texto: e.target.value })} placeholder="Texto da mensagem. Use {{primeiro_nome}} ou {{username}}." />
          <p className={`text-xs mt-1 ${bytes(p.texto) > limite ? "text-destructive" : "text-muted-foreground"}`}>{bytes(p.texto)}/{limite}</p>
        </div>

        <Rotulo t="Depois desta mensagem">
          <select className={campoCls} value={modo} onChange={(e) => trocarModo(e.target.value as Modo)}>
            <option value="nada">Terminar aqui</option>
            <option value="opcoes">Mostrar opções (respostas rápidas)</option>
            <option value="botoes">Mostrar botões de link</option>
            <option value="coletar">Esperar a pessoa digitar e salvar</option>
            <option value="proximo">Mandar outra mensagem em seguida</option>
          </select>
        </Rotulo>

        {modo === "opcoes" && (
          <div className="space-y-2">
            {p.opcoes!.map((o, j) => (
              <div key={j} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <Input maxLength={20} value={o.titulo} onChange={(e) => setOpcao(j, { titulo: e.target.value })} placeholder="Opção" />
                <Input value={o.tag ?? ""} onChange={(e) => setOpcao(j, { tag: e.target.value })} placeholder="Tag (opcional)" />
                <Destinos a={a} atual={p.id} valor={o.proximo} onChange={(v) => setOpcao(j, { proximo: v })} />
                <Button size="icon" variant="ghost" onClick={() => mudar(p.opcoes!.length > 1 ? { opcoes: p.opcoes!.filter((_, k) => k !== j) } : { opcoes: undefined })}><X className="w-4 h-4" /></Button>
              </div>
            ))}
            {p.opcoes!.length < 13 && <Button size="sm" variant="outline" onClick={() => mudar({ opcoes: [...p.opcoes!, { titulo: "", tag: "", proximo: null }] })}><Plus className="w-3.5 h-3.5 mr-1" />Opção</Button>}
            <p className="text-xs text-muted-foreground">Até 13 opções, 20 caracteres cada. Aparecem como respostas rápidas (não aparecem no Instagram do computador).</p>
          </div>
        )}

        {modo === "botoes" && (
          <div className="space-y-2">
            {p.botoes!.map((b, j) => (
              <div key={j} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                <Input maxLength={20} value={b.titulo} onChange={(e) => setBotao(j, { titulo: e.target.value })} placeholder="Texto do botão" />
                <Input value={b.url} onChange={(e) => setBotao(j, { url: e.target.value.trim() })} placeholder="https://..." />
                <Button size="icon" variant="ghost" onClick={() => mudar(p.botoes!.length > 1 ? { botoes: p.botoes!.filter((_, k) => k !== j) } : { botoes: undefined })}><X className="w-4 h-4" /></Button>
              </div>
            ))}
            {p.botoes!.length < 3 && <Button size="sm" variant="outline" onClick={() => mudar({ botoes: [...p.botoes!, { titulo: "", url: "" }] })}><Plus className="w-3.5 h-3.5 mr-1" />Botão</Button>}
            <p className="text-xs text-muted-foreground">Até 3 botões, 20 caracteres cada. O clique é contado e o link ganha UTM de DM.</p>
          </div>
        )}

        {modo === "coletar" && (
          <div className="grid grid-cols-2 gap-2">
            <Input value={p.coletar!.campo} onChange={(e) => mudar({ coletar: { ...p.coletar!, campo: e.target.value.trim() } })} placeholder="Nome do campo (ex.: faturamento)" />
            <Destinos a={a} atual={p.id} valor={p.coletar!.proximo} onChange={(v) => mudar({ coletar: { ...p.coletar!, proximo: v } })} />
            <p className="col-span-2 text-xs text-muted-foreground">O que a pessoa digitar fica salvo no contato, nesse campo. Depois segue para a mensagem escolhida.</p>
          </div>
        )}

        {modo === "proximo" && (
          <div className="space-y-1">
            <Destinos a={a} atual={p.id} valor={p.proximo} onChange={(v) => mudar({ proximo: v })} />
            <p className="text-xs text-muted-foreground">Envia a próxima logo em seguida. Em comentário, a 2ª mensagem só sai depois que a pessoa responder (regra da Meta).</p>
          </div>
        )}

        <Rotulo t="Tags ao enviar" dica="Separe por vírgula.">
          <Input defaultValue={(p.tags ?? []).join(", ")} onChange={(e) => mudar({ tags: lista(e.target.value) })} />
        </Rotulo>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={!!p.exigir_seguir} onCheckedChange={(v) => mudar({ exigir_seguir: !!v })} />
          Só enviar para quem segue a @{CONTA}
        </label>
        {p.exigir_seguir && (
          <div className="space-y-2">
            <Textarea rows={3} value={p.texto_portao ?? ""} onChange={(e) => mudar({ texto_portao: e.target.value })} placeholder="Mensagem para quem ainda não segue (pede para seguir e tocar no botão)" />
            <Input maxLength={20} value={p.botao_portao ?? ""} onChange={(e) => mudar({ botao_portao: e.target.value })} placeholder="Botão (ex.: Já sigo)" />
            <p className="text-xs text-muted-foreground">Quem não segue recebe essa mensagem; ao tocar no botão, conferimos de novo e enviamos.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Previa({ p }: { p?: Passo }) {
  const texto = (p?.texto || "Sua mensagem aparece aqui.")
    .split("{{primeiro_nome}}").join("Ana").split("{{nome}}").join("Ana Souza").split("{{username}}").join("@ana");
  return (
    <div className="rounded-[28px] border bg-black p-4 text-white">
      <div className="border-b border-neutral-800 pb-2 text-sm font-semibold">@{CONTA}</div>
      <div className="ml-auto mt-3 max-w-[86%] whitespace-pre-wrap rounded-2xl bg-[#3b3fbf] px-3 py-2 text-[13.5px]">{texto}</div>
      {p?.botoes?.map((b, i) => <div key={i} className="ml-auto mt-1 max-w-[86%] rounded-lg bg-neutral-800 py-2 text-center text-sm">{b.titulo || "Botão"}</div>)}
      {!!p?.opcoes?.length && (
        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
          {p.opcoes.map((o, i) => <span key={i} className="rounded-full border border-neutral-500 px-3 py-1 text-xs">{o.titulo || "Opção"}</span>)}
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-500">Prévia da primeira mensagem</p>
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

  const carregarLista = useCallback(() => {
    api<{ conversas: Conversa[] }>("conversas").then((j) => setLista(j.conversas))
      .catch((e) => toast({ title: "Erro", description: (e as Error).message, variant: "destructive" }));
  }, []);
  const abrir = useCallback((igsid: string) => {
    setAberta(igsid);
    api<{ mensagens: Mensagem[]; contato: Contato }>("mensagens", { igsid }).then((j) => { setMsgs(j.mensagens); setContato(j.contato); })
      .catch((e) => toast({ title: "Erro", description: (e as Error).message, variant: "destructive" }));
  }, []);

  useEffect(() => { carregarLista(); }, [carregarLista]);
  // Atualiza sozinho a cada 15s enquanto a aba está aberta.
  useEffect(() => {
    const t = window.setInterval(() => { carregarLista(); if (aberta) abrir(aberta); }, 15000);
    return () => window.clearInterval(t);
  }, [aberta, abrir, carregarLista]);

  const enviar = async () => {
    if (!aberta || !texto.trim()) return;
    setEnviando(true);
    try {
      await api("responder", { igsid: aberta, texto });
      setTexto("");
      abrir(aberta);
      carregarLista();
    } catch (e) {
      toast({ title: "Não enviou", description: (e as Error).message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  if (!lista) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  const janela = contato?.ultima_msg_em && Date.now() - new Date(contato.ultima_msg_em).getTime() < 24 * 3600 * 1000;

  return (
    <div className="grid gap-4 md:grid-cols-[300px_1fr]">
      <Card className="max-h-[70vh] overflow-auto">
        <CardContent className="p-2">
          {!lista.length && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa ainda.</p>}
          {lista.map((c) => (
            <button
              key={c.igsid}
              onClick={() => abrir(c.igsid)}
              className={`flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted ${aberta === c.igsid ? "bg-muted" : ""}`}
            >
              {c.foto_url ? <img src={c.foto_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-muted" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.nome || (c.username ? `@${c.username}` : c.igsid)}</div>
                <div className="truncate text-xs text-muted-foreground">{c.ultima?.direcao === "saida" ? "Você: " : ""}{c.ultima?.texto ?? "(mídia)"}</div>
              </div>
              {c.origem && <Badge variant="outline" className="text-[10px]">{ORIGEM[c.origem] ?? c.origem}</Badge>}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="flex max-h-[70vh] flex-col">
        {!aberta ? (
          <CardContent className="py-16 text-center text-muted-foreground">Escolha uma conversa.</CardContent>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <div className="flex-1">
                <div className="font-semibold">{contato?.nome || (contato?.username ? `@${contato.username}` : aberta)}</div>
                <div className="text-xs text-muted-foreground">
                  {contato?.username ? `@${contato.username}` : ""}{contato?.origem ? ` · ${ORIGEM[contato.origem] ?? contato.origem}` : ""}
                  {contato?.origem_detalhe && (contato.origem_detalhe as { permalink?: string }).permalink
                    ? <> · <a className="underline" href={(contato.origem_detalhe as { permalink?: string }).permalink} target="_blank" rel="noreferrer">post</a></> : null}
                </div>
              </div>
              {(contato?.tags ?? []).map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
              {contato?.lead_id && <Badge>virou lead</Badge>}
            </div>
            <div className="flex-1 space-y-2 overflow-auto p-3">
              {msgs.map((m) => (
                <div key={m.mid} className={`flex ${m.direcao === "saida" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.direcao === "saida" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.texto ?? "(mídia)"}
                    <div className="mt-1 text-[10px] opacity-70">
                      {AUTOR[m.autor] ? `${AUTOR[m.autor]} · ` : ""}{new Date(m.criado_em).toLocaleString("pt-BR")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t p-3">
              {janela ? (
                <div className="flex gap-2">
                  <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responder (o robô fica quieto 12h com essa pessoa)"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
                  <Button onClick={enviar} disabled={enviando || !texto.trim()}>{enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">A janela de 24h fechou: a Meta só deixa responder depois que a pessoa mandar mensagem de novo.</p>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ── Contatos ────────────────────────────────────────────────

function Contatos() {
  const [contatos, setContatos] = useState<Contato[] | null>(null);
  const carregar = useCallback(() => {
    api<{ contatos: Contato[] }>("contatos").then((j) => setContatos(j.contatos))
      .catch((e) => toast({ title: "Erro", description: (e as Error).message, variant: "destructive" }));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const retomar = async (igsid: string) => {
    try { await api("retomar", { igsid }); toast({ title: "Robô liberado para esse contato" }); carregar(); }
    catch (e) { toast({ title: "Erro", description: (e as Error).message, variant: "destructive" }); }
  };
  if (!contatos) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  const agora = Date.now();
  return (
    <Card>
      <CardContent className="pt-5 overflow-x-auto">
        <div className="flex justify-end mb-2"><Button size="sm" variant="ghost" onClick={carregar}><RefreshCw className="w-3.5 h-3.5 mr-1" />Atualizar</Button></div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground border-b">
            <th className="py-2 pr-2" /><th className="pr-2">Pessoa</th><th className="pr-2">Origem</th><th className="pr-2">Segue</th><th className="pr-2">Tags</th><th className="pr-2">Respostas</th><th className="pr-2">Status</th><th>Última</th>
          </tr></thead>
          <tbody>
            {contatos.map((c) => {
              const pausado = !!c.pausado_ate && new Date(c.pausado_ate).getTime() > agora;
              return (
                <tr key={c.igsid} className="border-b align-top">
                  <td className="py-2 pr-2">{c.foto_url ? <img src={c.foto_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-muted" />}</td>
                  <td className="py-2 pr-2"><div className="font-medium">{c.nome}</div><div className="text-xs text-muted-foreground">{c.username ? `@${c.username}` : c.igsid}</div></td>
                  <td className="py-2 pr-2 text-xs">{c.origem ? ORIGEM[c.origem] ?? c.origem : ""}{c.lead_id ? <div><Badge variant="outline">virou lead</Badge></div> : null}</td>
                  <td className="py-2 pr-2">{c.segue === true ? "Sim" : c.segue === false ? "Não" : "?"}</td>
                  <td className="py-2 pr-2"><div className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div></td>
                  <td className="py-2 pr-2 text-xs">{Object.entries(c.campos ?? {}).map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}</td>
                  <td className="py-2 pr-2">
                    {c.optout ? <Badge variant="secondary">pediu para parar</Badge>
                      : pausado ? <div className="flex items-center gap-2"><Badge variant="secondary">pausado</Badge><Button size="sm" variant="outline" onClick={() => retomar(c.igsid)}>Retomar</Button></div>
                      : <Badge>ativo</Badge>}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">{new Date(c.ultima_interacao_em).toLocaleString("pt-BR")}</td>
                </tr>
              );
            })}
            {!contatos.length && <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">Ninguém ainda.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ── Atividade ───────────────────────────────────────────────

function Atividade({ automacoes }: { automacoes: Automacao[] }) {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const nomes = useMemo(() => Object.fromEntries(automacoes.map((a) => [a.id, a.nome])), [automacoes]);
  const carregar = useCallback(() => {
    api<{ historico: Evento[] }>("historico").then((j) => setEventos(j.historico))
      .catch((e) => toast({ title: "Erro", description: (e as Error).message, variant: "destructive" }));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  if (!eventos) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  return (
    <Card>
      <CardContent className="pt-5 overflow-x-auto">
        <div className="flex justify-end mb-2"><Button size="sm" variant="ghost" onClick={carregar}><RefreshCw className="w-3.5 h-3.5 mr-1" />Atualizar</Button></div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground border-b"><th className="py-2 pr-2">Quando</th><th className="pr-2">O quê</th><th className="pr-2">Automação</th><th>Detalhe</th></tr></thead>
          <tbody>
            {eventos.map((h, i) => (
              <tr key={i} className="border-b align-top">
                <td className="py-2 pr-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(h.criado_em).toLocaleString("pt-BR")}</td>
                <td className={`py-2 pr-2 ${h.tipo === "erro" ? "text-destructive" : ""}`}>{TIPOS[h.tipo] ?? h.tipo}</td>
                <td className="py-2 pr-2">{h.automacao_id ? nomes[h.automacao_id] ?? "" : ""}</td>
                <td className="py-2 text-xs text-muted-foreground break-all max-w-[420px]">{h.detalhe ? JSON.stringify(h.detalhe).slice(0, 200) : ""}</td>
              </tr>
            ))}
            {!eventos.length && <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">Nada ainda.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
