import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PESSOAS_PUSH } from "@/hooks/useLeadNotifications";
import { useCrmAcoes, PRESETS_FOLLOWUP, type ContaCanal } from "@/hooks/useCrmAcoes";

/**
 * Ações rápidas do CRM, dentro do detalhe do lead.
 *
 * A regra que este componente existe para cumprir: **o botão que inicia o
 * trabalho é o mesmo que registra**. Um toque em "WhatsApp Champion 1" grava a
 * tentativa E abre a conversa. Registro que fica ao lado do trabalho morre —
 * foi assim que a tabela `daily_reports` ficou pronta, certa e nunca usada.
 *
 * As REGRAS de escrita (idempotência, validação, abertura do canal) vivem em
 * `useCrmAcoes`, compartilhado com a fila. Aqui só existe a tela — duas cópias
 * das regras seria como descobrir, semanas depois, que só uma das telas está
 * protegida contra o retry.
 */

interface Interacao {
  id: string;
  occurred_at: string;
  direction: "saida" | "entrada" | "interno";
  kind: "mensagem" | "ligacao" | "nota";
  channel_account_id: string | null;
  conta_label: string | null;
  actor: string;
  outcome: string | null;
  observacao: string | null;
  voided_at: string | null;
}

interface Tarefa {
  id: string;
  due_at: string;
  owner: string;
  note: string | null;
  status: "aberta" | "concluida" | "cancelada";
}

interface EstadoCrm {
  estado: string;
  teve_no_show: boolean | null;
  desfecho_pendente: boolean | null;
  sla_estourado: boolean | null;
  tentativas: number | null;
  ultima_interacao_at: string | null;
}

interface Props {
  leadId: string;
  leadWhatsapp: string | null | undefined;
  leadInstagram: string | null | undefined;
  pessoa: string | null;
  definirPessoa: (p: string) => void | Promise<void>;
  fetchAdminData: (path: string, params?: Record<string, string>, priority?: any) => Promise<any>;
  onMudou?: () => void;
}

const ROTULO_ESTADO: Record<string, string> = {
  NOVO: "Novo", EM_CONTATO: "Em contato", RESPONDEU: "Respondeu",
  AGENDADO: "Reunião agendada", REUNIAO_FEITA: "Reunião realizada",
  GANHO: "Ganho", PERDIDO: "Perdido",
};

const COR_ESTADO: Record<string, string> = {
  NOVO: "bg-muted text-muted-foreground border-border",
  EM_CONTATO: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  RESPONDEU: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  AGENDADO: "bg-secondary/20 text-secondary border-secondary/50",
  REUNIAO_FEITA: "bg-secondary/15 text-secondary/90 border-secondary/40",
  GANHO: "bg-emerald-600/25 text-emerald-200 border-emerald-500/50",
  PERDIDO: "bg-destructive/20 text-destructive-foreground border-destructive/50",
};

const ICONE_CANAL: Record<string, string> = { whatsapp: "📱", instagram: "📷", telefone: "📞", email: "✉️" };

const MOTIVOS_PERDA: Array<[string, string]> = [
  ["sem_resposta", "Nunca respondeu"], ["sumiu", "Respondeu e sumiu"],
  ["desqualificado", "Não é nosso cliente"], ["sem_verba", "Sem verba"],
  ["timing", "Momento errado"], ["concorrente", "Foi para concorrente"],
  ["numero_invalido", "Número inválido"], ["duplicado", "Lead duplicado"], ["outro", "Outro"],
];

const DESFECHOS_LIGACAO: Array<[string, string]> = [
  ["", "Atendeu"], ["nao_atendeu", "Não atendeu"], ["caixa_postal", "Caixa postal"],
  ["numero_invalido", "Número inválido"], ["nao_existe", "Número não existe"],
];

function quando(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return `hoje ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

function desde(iso?: string | null): string {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${min} min`;
  if (min < 2880) return `há ${Math.round(min / 60)}h`;
  return `há ${Math.round(min / 1440)} dias`;
}

export function AcoesRapidasCrm({
  leadId, leadWhatsapp, leadInstagram, pessoa, definirPessoa, fetchAdminData, onMudou,
}: Props) {
  const crm = useCrmAcoes(fetchAdminData, pessoa);

  const [estado, setEstado] = useState<EstadoCrm | null>(null);
  const [interacoes, setInteracoes] = useState<Interacao[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [expandido, setExpandido] = useState(false);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivoAnulacao, setMotivoAnulacao] = useState("");
  const [dataManual, setDataManual] = useState("");

  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  const carregar = useCallback(async () => {
    try {
      const [e, t] = await Promise.all([
        fetchAdminData("/crm/estado", { lead_id: leadId }),
        fetchAdminData("/crm/timeline", { lead_id: leadId, limit: "50" }),
      ]);
      if (!montado.current) return;
      setEstado(e?.estados?.[0] ?? null);
      setInteracoes(t?.interacoes ?? []);
      setTarefas(t?.tarefas ?? []);
    } catch (err) {
      console.error("[crm] carga falhou:", err);
    } finally {
      if (montado.current) setCarregando(false);
    }
  }, [fetchAdminData, leadId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const depois = useCallback(async () => { await carregar(); onMudou?.(); }, [carregar, onMudou]);

  const visiveis = useMemo(() => interacoes.filter((i) => !i.voided_at), [interacoes]);
  const tarefaAberta = useMemo(() => tarefas.find((t) => t.status === "aberta") ?? null, [tarefas]);
  const contaTelefone = useMemo(() => crm.contas.find((c) => c.kind === "telefone"), [crm.contas]);

  /**
   * A conta do botão principal: a ÚLTIMA usada com ESTE lead, e só então a
   * padrão da casa. Acerta sozinha na maioria dos casos — quem já conversou com
   * alguém por um número continua por ele — e é a defesa mais barata contra
   * registrar a interação no número errado.
   */
  const contaPrincipal: ContaCanal | null = useMemo(() => {
    const ultima = visiveis.find((i) => i.channel_account_id);
    const daUltima = ultima ? crm.contas.find((c) => c.id === ultima.channel_account_id && c.status === "ativa") : null;
    return daUltima ?? crm.contas.find((c) => c.is_default) ?? crm.contas.find((c) => c.kind === "whatsapp") ?? null;
  }, [visiveis, crm.contas]);

  const lead = { id: leadId, whatsapp: leadWhatsapp, instagram: leadInstagram };

  if (carregando) {
    return <div className="p-4 rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">Carregando CRM…</div>;
  }

  const mostrar = expandido ? visiveis : visiveis.slice(0, 3);

  return (
    <div className="rounded-lg border border-secondary/30 bg-muted/20 overflow-hidden">

      <div className="p-4 border-b border-border/60 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">CRM</span>
          {estado && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${COR_ESTADO[estado.estado] ?? COR_ESTADO.NOVO}`}>
              {ROTULO_ESTADO[estado.estado] ?? estado.estado}
            </span>
          )}
          {estado?.teve_no_show && <span className="text-[11px] px-2 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-300">teve no-show</span>}
          {estado?.sla_estourado && <span className="text-[11px] px-2 py-0.5 rounded border border-destructive/40 bg-destructive/10 text-destructive-foreground">SLA estourado</span>}
          {estado?.desfecho_pendente && <span className="text-[11px] px-2 py-0.5 rounded border border-secondary/40 bg-secondary/10 text-secondary">desfecho pendente</span>}
          {!!estado?.tentativas && (
            <span className="text-[11px] text-muted-foreground">
              {estado.tentativas} {estado.tentativas === 1 ? "tentativa" : "tentativas"}
              {estado.ultima_interacao_at ? ` · última ${desde(estado.ultima_interacao_at)}` : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap text-sm">
          {tarefaAberta ? (
            <>
              <span className="text-muted-foreground">Próxima ação:</span>
              <span className={`font-semibold ${new Date(tarefaAberta.due_at) < new Date() ? "text-destructive-foreground" : "text-secondary"}`}>
                {quando(tarefaAberta.due_at)}{new Date(tarefaAberta.due_at) < new Date() ? " · vencida" : ""}
              </span>
              <span className="text-muted-foreground text-xs">com {tarefaAberta.owner}</span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={crm.ocupado}
                onClick={async () => { await crm.concluirTarefa(tarefaAberta.id, visiveis[0]?.id); await depois(); }}>
                marcar feita
              </Button>
            </>
          ) : (
            <span className="text-orange-300/90 text-xs">⚠ sem próxima ação definida</span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Operando como:</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant={pessoa ? "outline" : "destructive"} className="h-7 px-2 text-xs">
                {pessoa ?? "escolher quem sou"} ▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-xs">Quem está usando este aparelho</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {PESSOAS_PUSH.map((p) => (
                <DropdownMenuItem key={p} onClick={() => void definirPessoa(p)}>{p}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="p-4 flex flex-wrap gap-2">
        <div className="flex">
          <Button size="sm" disabled={crm.ocupado || !pessoa || !contaPrincipal} className="rounded-r-none"
            onClick={async () => { if (contaPrincipal) { await crm.registrarEAbrir(contaPrincipal, lead); await depois(); } }}>
            {contaPrincipal ? `${ICONE_CANAL[contaPrincipal.kind] ?? ""} ${contaPrincipal.label}` : "Sem conta"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={crm.ocupado || !pessoa} className="rounded-l-none border-l border-primary-foreground/20 px-2">▾</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-xs">Registrar tentativa por</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {crm.contas.filter((c) => c.kind === "whatsapp" || c.kind === "instagram").map((c) => (
                <DropdownMenuItem key={c.id} onClick={async () => { await crm.registrarEAbrir(c, lead); await depois(); }}>
                  <span className="mr-2">{ICONE_CANAL[c.kind]}</span>{c.label}
                  {c.is_default && <span className="ml-auto text-[9px] uppercase tracking-wider text-secondary">padrão</span>}
                  {c.is_personal && !c.is_default && <span className="ml-auto text-[10px] text-muted-foreground">pessoal</span>}
                </DropdownMenuItem>
              ))}
              {contaTelefone && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Ligação</DropdownMenuLabel>
                  {DESFECHOS_LIGACAO.map(([valor, rotulo]) => (
                    <DropdownMenuItem key={rotulo} onClick={async () => { await crm.registrarLigacao(contaTelefone, lead, valor); await depois(); }}>
                      <span className="mr-2">📞</span>{rotulo}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex">
          <Button size="sm" variant="outline" className="rounded-r-none border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
            disabled={crm.ocupado || !pessoa || !contaPrincipal}
            onClick={async () => { if (contaPrincipal) { await crm.registrarResposta(contaPrincipal, leadId); await depois(); } }}>
            ✅ Respondeu
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={crm.ocupado || !pessoa}
                className="rounded-l-none border-l-0 border-emerald-500/40 text-emerald-300 px-2">▾</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel className="text-xs">Respondeu por qual conta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {crm.contas.filter((c) => c.kind !== "telefone" && c.kind !== "email").map((c) => (
                <DropdownMenuItem key={c.id} onClick={async () => { await crm.registrarResposta(c, leadId); await depois(); }}>
                  <span className="mr-2">{ICONE_CANAL[c.kind]}</span>{c.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={crm.ocupado || !pessoa}>
              ⏰ {tarefaAberta ? "Remarcar" : "Follow-up"} ▾
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-xs">Próxima ação em</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PRESETS_FOLLOWUP.map((p) => (
              <DropdownMenuItem key={p.rotulo} onClick={async () => { await crm.marcarFollowup(leadId, p.quando()); await depois(); }}>
                {p.rotulo}
                <span className="ml-auto text-[10px] text-muted-foreground">{quando(p.quando().toISOString())}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <div className="p-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Input type="datetime-local" value={dataManual} onChange={(e) => setDataManual(e.target.value)} className="h-8 text-xs" />
              <Button size="sm" className="h-8 px-2 text-xs" disabled={!dataManual}
                onClick={async () => { if (dataManual) { await crm.marcarFollowup(leadId, new Date(dataManual)); setDataManual(""); await depois(); } }}>ok</Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={crm.ocupado || !pessoa}>⋯</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Dar por perdido</DropdownMenuLabel>
            {MOTIVOS_PERDA.map(([valor, rotulo]) => (
              <DropdownMenuItem key={valor} onClick={async () => { await crm.marcarPerdido(leadId, valor); await depois(); }}>{rotulo}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {contaPrincipal?.kind === "whatsapp" && (
        <p className="px-4 pb-3 text-[11px] text-muted-foreground/80">
          A conta escolhida é uma declaração: o WhatsApp abre com o número logado neste
          navegador, e nenhuma API nos diz qual foi.
        </p>
      )}

      {visiveis.length > 0 && (
        <div className="border-t border-border/60 p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Histórico</p>
          {mostrar.map((i) => (
            <div key={i.id} className="flex items-start gap-2 text-xs group">
              <span className={i.direction === "entrada" ? "text-emerald-400" : i.direction === "interno" ? "text-muted-foreground" : "text-blue-300"}>
                {i.direction === "entrada" ? "↓" : i.direction === "interno" ? "•" : "↑"}
              </span>
              <span className="text-muted-foreground w-24 shrink-0 tabular-nums">{quando(i.occurred_at)}</span>
              <span className="flex-1">
                {i.kind === "ligacao" ? "Ligação" : i.kind === "nota" ? "Nota" : i.direction === "entrada" ? "Respondeu" : "Mensagem"}
                {i.conta_label ? ` · ${i.conta_label}` : ""}
                {i.outcome ? ` · ${i.outcome.replace(/_/g, " ")}` : ""}
                <span className="text-muted-foreground"> · {i.actor}</span>
                {i.observacao && <span className="block text-muted-foreground italic">{i.observacao}</span>}
              </span>
              {anulando === i.id ? (
                <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Input value={motivoAnulacao} onChange={(e) => setMotivoAnulacao(e.target.value)}
                    placeholder="motivo" className="h-6 w-32 text-[11px]" autoFocus />
                  <Button size="sm" variant="destructive" className="h-6 px-2 text-[11px]" disabled={!motivoAnulacao.trim() || crm.ocupado}
                    onClick={async () => { await crm.anular(i.id, motivoAnulacao); setAnulando(null); setMotivoAnulacao(""); await depois(); }}>ok</Button>
                  <Button size="sm" variant="ghost" className="h-6 px-1 text-[11px]"
                    onClick={() => { setAnulando(null); setMotivoAnulacao(""); }}>×</Button>
                </span>
              ) : (
                <button type="button" title="Anular este registro"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive-foreground transition-opacity"
                  onClick={() => { setAnulando(i.id); setMotivoAnulacao(""); }}>⌫</button>
              )}
            </div>
          ))}
          {visiveis.length > 3 && (
            <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground underline"
              onClick={() => setExpandido((v) => !v)}>
              {expandido ? "mostrar menos" : `ver todos os ${visiveis.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default AcoesRapidasCrm;
