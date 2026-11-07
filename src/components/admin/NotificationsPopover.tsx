import { useEffect, useState, type ReactNode } from "react";
import { Bell, BellOff, Check, Download, Recycle, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { PESSOAS_PUSH, idDesteAparelho, type DispositivoPush, type PessoaPush, type ResultadoEnvio } from "@/hooks/useLeadNotifications";

interface Props {
  notificationsEnabled: boolean;
  permissionState: NotificationPermission | "indisponivel";
  pushSubscribed: boolean;
  subscriberCount: number | null;
  dispositivos: DispositivoPush[];
  atualizarDispositivos: () => void | Promise<void>;
  toggleNotifications: (pessoa?: PessoaPush | null) => void | Promise<void>;
  testNotifications: () => Promise<ResultadoEnvio>;
  sendWebPush: (
    title: string,
    body: string,
    sound?: string,
    pessoas?: string[],
    extra?: { tipo?: string; url?: string; tag?: string; ttl?: number; endpoints?: string[] },
  ) => Promise<ResultadoEnvio>;
  pessoa: PessoaPush | null;
  definirPessoa: (p: PessoaPush) => void | Promise<void>;
  instalado: boolean;
  ios: boolean;
  podeInstalar: boolean;
  instalarApp: () => Promise<boolean>;
  removerDispositivo: (id: string) => Promise<boolean>;
}

function haQuanto(iso: string | null): string {
  if (!iso) return "";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

/** "Chrome · Windows", "iPhone"... o user agent inteiro ninguém lê. */
function aparelhoCurto(label: string | null): string {
  const ua = label || "";
  const so = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Aparelho";
  const nav = /Edg\//.test(ua) ? "Edge" : /Firefox/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) && !/iPhone|iPad/.test(ua) ? "Chrome" : "";
  return nav ? `${nav} · ${so}` : so;
}

function EscolherPessoa({ pessoa, onEscolher }: { pessoa: PessoaPush | null; onEscolher: (p: PessoaPush) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {PESSOAS_PUSH.map((p) => (
        <button
          key={p}
          onClick={() => onEscolher(p)}
          className={`h-8 rounded-md border text-xs font-medium transition-colors ${
            pessoa === p
              ? "border-primary bg-primary/15 text-foreground"
              : "border-border hover:border-primary/50 hover:bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

export function NotificationsPopover({
  permissionState,
  pushSubscribed,
  dispositivos,
  atualizarDispositivos,
  toggleNotifications,
  testNotifications,
  sendWebPush,
  pessoa,
  definirPessoa,
  instalado,
  ios,
  podeInstalar,
  instalarApp,
  removerDispositivo,
}: Props) {
  const [open, setOpen] = useState(false);
  const [gestaoAberta, setGestaoAberta] = useState(false);
  const [trocandoPessoa, setTrocandoPessoa] = useState(false);
  const [testando, setTestando] = useState(false);

  useEffect(() => {
    if (open) void atualizarDispositivos();
  }, [open, atualizarDispositivos]);

  const permitido = permissionState === "granted";
  const bloqueado = permissionState === "denied";
  const precisaInstalar = ios && !instalado;
  // Desde 14/09 todo aparelho inscrito recebe todos os leads: o nome deixou de
  // ser condição. Ele só serve para o sla-check cobrar a pessoa certa.
  const pronto = permitido && pushSubscribed;
  const meuId = idDesteAparelho();
  const meuAparelho = dispositivos.find((d) =>
    d.device_id ? d.device_id === meuId : d.label === navigator.userAgent.slice(0, 80),
  );

  const testar = async () => {
    setTestando(true);
    try {
      await testNotifications();
    } finally {
      setTestando(false);
    }
  };

  const escolher = async (p: PessoaPush) => {
    setTrocandoPessoa(false);
    await definirPessoa(p);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 relative" title="Notificações">
            {pronto ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4 text-rose-400" />}
            <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${pronto ? "bg-emerald-400" : "bg-rose-500 animate-pulse"}`} />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-[320px] p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Notificações</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                pronto ? "bg-emerald-500/15 text-emerald-400" : bloqueado ? "bg-rose-500/15 text-rose-400" : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {pronto ? "Ativo" : bloqueado ? "Bloqueado" : "Configurar"}
            </span>
          </div>

          <div className="p-4">
            {pronto ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <Check className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Todos os leads tocam aqui</p>
                    <p className="text-xs text-muted-foreground">
                      Mesmo com o painel fechado.
                      {meuAparelho?.last_received_at ? ` Último recebido ${haQuanto(meuAparelho.last_received_at)}.` : ""}
                    </p>
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={testar} disabled={testando}>
                  {testando ? "Enviando…" : "Testar neste aparelho"}
                </Button>
                {trocandoPessoa ? (
                  <EscolherPessoa pessoa={pessoa} onEscolher={escolher} />
                ) : (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <button className="hover:text-foreground" onClick={() => setTrocandoPessoa(true)}>
                      {pessoa ? `Você: ${pessoa} · trocar` : "Quem é você? (cobrança de SLA)"}
                    </button>
                    <button className="hover:text-foreground" onClick={() => void toggleNotifications(pessoa)}>
                      Reconectar
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-rose-500/15 flex items-center justify-center">
                    <BellOff className="h-4 w-4 text-rose-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Este aparelho não recebe leads</p>
                    <p className="text-xs text-muted-foreground">
                      {precisaInstalar ? (
                        <>No iPhone, instale primeiro: <strong className="text-foreground">Compartilhar → Adicionar à Tela de Início</strong>. Abra pelo ícone e volte aqui.</>
                      ) : bloqueado ? (
                        <>Clique no <strong className="text-foreground">cadeado</strong> ao lado do endereço → Notificações → <strong className="text-foreground">Permitir</strong> e recarregue.</>
                      ) : (
                        "Um clique e todo lead novo toca aqui, mesmo com o painel fechado."
                      )}
                    </p>
                  </div>
                </div>
                {!precisaInstalar && !bloqueado && (
                  <Button size="sm" className="w-full" onClick={() => void toggleNotifications(pessoa)}>
                    Permitir notificações
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-muted/30">
            {!instalado && podeInstalar ? (
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => void instalarApp()}>
                <Download className="h-3.5 w-3.5" /> Instalar como app
              </button>
            ) : <span />}
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setOpen(false); setGestaoAberta(true); }}
            >
              Enviar aviso · Time{dispositivos.length > 0 ? ` (${dispositivos.length})` : ""} →
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <GestaoDoTime
        open={gestaoAberta}
        onClose={() => setGestaoAberta(false)}
        dispositivos={dispositivos}
        atualizarDispositivos={atualizarDispositivos}
        sendWebPush={sendWebPush}
        removerDispositivo={removerDispositivo}
      />
    </>
  );
}

/**
 * O que é do TIME, não deste aparelho: quem está recebendo, atualizar o sistema
 * de todo mundo, mandar um aviso. Fica fora do popover para ele caber numa
 * olhada.
 */
function GestaoDoTime({ open, onClose, dispositivos, atualizarDispositivos, sendWebPush, removerDispositivo }: {
  open: boolean;
  onClose: () => void;
  dispositivos: DispositivoPush[];
  atualizarDispositivos: () => void | Promise<void>;
  sendWebPush: Props["sendWebPush"];
  removerDispositivo: Props["removerDispositivo"];
}) {
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState<null | "aviso" | "atualizar" | "reinstalar">(null);
  const meuId = idDesteAparelho();

  const remover = async (d: DispositivoPush) => {
    if (!window.confirm(`Remover ${d.pessoa || "sem dono"} · ${aparelhoCurto(d.label)}? Ele para de receber até ativar de novo.`)) return;
    const ok = await removerDispositivo(d.id);
    toast(ok ? { title: "Aparelho removido" } : { title: "Não deu para remover", variant: "destructive" });
  };

  useEffect(() => {
    if (open) void atualizarDispositivos();
  }, [open, atualizarDispositivos]);

  const relatar = (r: ResultadoEnvio, oque: string) => {
    if (r.ok) {
      toast({ title: `${oque} enviado`, description: `Saiu para ${r.sent} de ${r.total} aparelhos.` });
    } else {
      toast({ title: `${oque} não saiu`, description: r.motivo, variant: "destructive" });
    }
    setTimeout(() => void atualizarDispositivos(), 6000);
  };

  /**
   * "atualizar" recarrega o painel de quem está com ele aberto e o clique abre a
   * versão nova. "reinstalar" abre o passo a passo: só é preciso quando mudou
   * nome, ícone ou tela inicial do app, que o iPhone não atualiza sozinho.
   */
  const pedir = async (modo: "atualizar" | "reinstalar") => {
    const pergunta = modo === "atualizar"
      ? "Mandar todos os aparelhos atualizarem o sistema agora?"
      : "Pedir para todos reinstalarem o app? Só é necessário quando mudou ícone, nome ou tela inicial.";
    if (!window.confirm(pergunta)) return;
    setEnviando(modo);
    try {
      const marca = Date.now();
      const r = await sendWebPush(
        modo === "atualizar" ? "🔄 Atualize o sistema Champion" : "♻️ Reinstale o app Champion",
        modo === "atualizar"
          ? "Saiu uma versão nova do painel. Toque para abrir atualizado."
          : "O app mudou e precisa ser reinstalado. Toque para ver o passo a passo.",
        "default",
        undefined,
        // O pedido vai na URL: até a função web-push antiga entrega um push que
        // o service worker reconhece.
        { tipo: modo, url: `/admin?${modo}=${marca}`, tag: `champion-${modo}-${marca}` },
      );
      relatar(r, modo === "atualizar" ? "Pedido de atualização" : "Pedido de reinstalação");
    } finally {
      setEnviando(null);
    }
  };

  const avisar = async () => {
    if (!titulo.trim()) return;
    setEnviando("aviso");
    try {
      const r = await sendWebPush(titulo.trim(), mensagem.trim(), "default", undefined, { tipo: "aviso" });
      relatar(r, "Aviso");
      if (r.ok) { setTitulo(""); setMensagem(""); }
    } finally {
      setEnviando(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-4">
          <DialogTitle>Notificações do time</DialogTitle>
          <DialogDescription>Quem está recebendo e o que mandar para todos.</DialogDescription>
        </DialogHeader>

        <section className="px-5 pb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Aparelhos</p>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => void atualizarDispositivos()} title="Recarregar">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          {dispositivos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém ativou ainda.</p>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border">
              {dispositivos.map((d, i) => {
                const recente = !!d.last_received_at && Date.now() - Date.parse(d.last_received_at) < 24 * 3600 * 1000;
                return (
                  <div key={d.id || `${d.created_at}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${recente ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">
                        {d.pessoa || "Sem dono"}
                        {d.device_id && d.device_id === meuId && (
                          <span className="ml-1.5 text-[10px] font-normal text-primary">este aparelho</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{aparelhoCurto(d.label)}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {d.last_received_at ? `recebeu ${haQuanto(d.last_received_at)}` : "sem confirmação"}
                    </span>
                    {d.id && (
                      <button
                        className="text-muted-foreground/60 hover:text-rose-400"
                        title="Remover este aparelho"
                        onClick={() => void remover(d)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="px-5 py-5 border-t border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Atualizar o sistema</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" disabled={!!enviando} onClick={() => pedir("atualizar")}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> {enviando === "atualizar" ? "Enviando…" : "Atualizar todos"}
            </Button>
            <Button variant="outline" size="sm" disabled={!!enviando} onClick={() => pedir("reinstalar")}>
              <Recycle className="h-3.5 w-3.5 mr-1.5" /> {enviando === "reinstalar" ? "Enviando…" : "Pedir reinstalação"}
            </Button>
          </div>
        </section>

        <section className="px-5 py-5 border-t border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avisar o time</p>
          <Input placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} />
          <Textarea placeholder="Mensagem (opcional)" value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={200} rows={2} className="resize-none" />
          <Button size="sm" className="w-full" disabled={!titulo.trim() || !!enviando} onClick={avisar}>
            <Send className="h-3.5 w-3.5 mr-1.5" /> {enviando === "aviso" ? "Enviando…" : "Enviar para todos"}
          </Button>
        </section>
      </DialogContent>
    </Dialog>
  );
}
