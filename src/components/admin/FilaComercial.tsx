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
 * A fila comercial — "quem eu preciso atender agora?".
 *
 * Não é pipeline. É WORK QUEUE: estado comercial diz ONDE o lead está, balde diz
 * O QUE fazer com ele agora. A classificação e a precedência vivem na view
 * `lead_fila`, no banco — este componente só desenha o que a rota devolve, para
 * que contagem e lista nunca possam discordar.
 *
 * Ordem SEMPRE temporal, nunca por nota. O score aparece no card como
 * informação e não muda posição nenhuma.
 */

interface ItemFila {
  lead_id: string;
  nome_completo: string;
  whatsapp: string | null;
  instagram: string | null;
  investimento_faixa: string | null;
  tier: string | null;
  score: number | null;
  created_at: string;
  estado: string;
  tentativas: number | null;
  ultima_interacao_at: string | null;
  ultima_direcao: string | null;
  proxima_acao_at: string | null;
  proxima_acao_owner: string | null;
  teve_no_show: boolean | null;
  ultimo_no_show_at: string | null;
  desfecho_pendente: boolean | null;
  sla_estourado: boolean | null;
  ordenar_por: string | null;
}

interface ResumoBalde { bucket: string; total: number; mais_antigo_at: string | null; }

interface Cobertura {
  marco_crm: string | null;
  total_leads: number;
  elegiveis_pos_marco: number;
  com_interacao_registrada: number;
  legado_sem_historico: number;
}

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>, priority?: any) => Promise<any>;
  pessoa: string | null;
  definirPessoa: (p: string) => void | Promise<void>;
  onAbrirLead: (leadId: string) => void | Promise<void>;
  /** Carrega o detalhe silenciosamente sob intenção do usuário (hover/foco). */
  onPrefetchLead?: (leadId: string) => void;
}

/** Rótulo e o PORQUÊ de cada balde — o motivo da prioridade fica na tela. */
const BALDES: Array<{ id: string; titulo: string; porque: string; tom: string }> = [
  { id: "RESPONDEU", titulo: "Respondeu", porque: "a bola está com a gente", tom: "emerald" },
  { id: "FOLLOWUP", titulo: "Follow-up devido", porque: "vence hoje ou já venceu", tom: "red" },
  { id: "NO_SHOW", titulo: "Faltou à call", porque: "sem reunião nova e sem próxima ação", tom: "orange" },
  { id: "NUNCA", titulo: "Nunca contatado", porque: "entrou e ninguém chamou", tom: "blue" },
  { id: "SEM_ACAO", titulo: "Sem próxima ação", porque: "trabalhado e largado", tom: "amber" },
];

const TOM: Record<string, string> = {
  emerald: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  red: "border-destructive/50 bg-destructive/10 text-destructive-foreground",
  orange: "border-orange-500/50 bg-orange-500/10 text-orange-300",
  blue: "border-blue-500/50 bg-blue-500/10 text-blue-300",
  amber: "border-secondary/50 bg-secondary/10 text-secondary",
};

function desde(iso?: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(Math.abs(ms) / 60000);
  const futuro = ms < 0;
  const t = min < 60 ? `${min} min`
    : min < 2880 ? `${Math.round(min / 60)}h`
    : `${Math.round(min / 1440)} dias`;
  return futuro ? `em ${t}` : `há ${t}`;
}

function dataCurta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function FilaComercial({ fetchAdminData, pessoa, definirPessoa, onAbrirLead, onPrefetchLead }: Props) {
  const [balde, setBalde] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoBalde[]>([]);
  const [itens, setItens] = useState<ItemFila[]>([]);
  const [cobertura, setCobertura] = useState<Cobertura | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState(true);

  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  const crm = useCrmAcoes(fetchAdminData, pessoa);

  const carregar = useCallback(async (qual?: string | null) => {
    setCarregando(true);
    try {
      const r = await fetchAdminData("/crm/fila", {
        ...(qual ? { bucket: qual } : {}),
        ...(buscaAplicada ? { q: buscaAplicada } : {}),
        limit: "50",
      });
      if (!montado.current) return;
      setResumo(r?.baldes ?? []);
      setItens(r?.itens ?? []);
      setCobertura(r?.cobertura ?? null);
      setBalde(r?.bucket ?? null);
    } catch (e) {
      console.error("[fila]", e);
    } finally {
      if (montado.current) setCarregando(false);
    }
  }, [fetchAdminData, buscaAplicada]);

  useEffect(() => { void carregar(balde); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [buscaAplicada]);
  useEffect(() => { void carregar(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  /**
   * Toda ação recarrega a fila.
   *
   * É o que faz o card SAIR do balde quando a condição deixa de valer: registrar
   * uma saída tira o lead de "Respondeu", marcar follow-up tira de "Sem próxima
   * ação". Sem o refetch a tela mentiria até o próximo F5 — e uma fila que mente
   * é pior que fila nenhuma.
   *
   * Refetch simples resolve; websocket seria peso sem ganho neste volume.
   */
  const depoisDeAgir = useCallback(async () => { await carregar(balde); }, [carregar, balde]);

  const contaDoLead = useCallback((it: ItemFila): ContaCanal | null => {
    return crm.contas.find((c) => c.is_default && c.status === "ativa")
      ?? crm.contas.find((c) => c.kind === "whatsapp" && c.status === "ativa")
      ?? null;
  }, [crm.contas]);

  const total = useMemo(() => resumo.reduce((s, b) => s + b.total, 0), [resumo]);
  const baldeAtual = BALDES.find((b) => b.id === balde);

  return (
    <div className="mb-6 rounded-xl border-2 border-secondary/30 bg-card overflow-hidden">

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20 flex-wrap">
        <button type="button" onClick={() => setAberta((v) => !v)}
          className="text-sm font-bold flex items-center gap-2">
          <span className="text-secondary">{aberta ? "▾" : "▸"}</span>
          Fila comercial
        </button>
        <span className="text-xs text-muted-foreground">
          {total === 0 ? "ninguém esperando ação" : `${total} ${total === 1 ? "lead para agir" : "leads para agir"}`}
        </span>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setBuscaAplicada(busca.trim()); }}
            onBlur={() => setBuscaAplicada(busca.trim())}
            placeholder="buscar na fila…"
            className="h-8 w-44 text-xs"
          />
          <span className="text-[11px] text-muted-foreground">Operando como</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant={pessoa ? "outline" : "destructive"} className="h-7 px-2 text-xs">
                {pessoa ?? "quem sou eu?"} ▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Quem está usando este aparelho</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {PESSOAS_PUSH.map((p) => (
                <DropdownMenuItem key={p} onClick={() => void definirPessoa(p)}>{p}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {aberta && (
        <>
          {/* ── Baldes ─────────────────────────────────────────────────── */}
          <div className="flex gap-2 p-4 pb-2 flex-wrap">
            {BALDES.map((b) => {
              const r = resumo.find((x) => x.bucket === b.id);
              const n = r?.total ?? 0;
              const sel = balde === b.id;
              return (
                <button
                  key={b.id} type="button"
                  onClick={() => void carregar(b.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors
                    ${sel ? TOM[b.tom] : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                >
                  <span>{b.titulo}</span>
                  <span className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${n > 0 ? "bg-background/60" : "opacity-50"}`}>{n}</span>
                  {n > 0 && r?.mais_antigo_at && (
                    <span className="opacity-70 font-normal">{desde(r.mais_antigo_at)}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Por que este balde importa — o motivo da prioridade na tela. */}
          {baldeAtual && (
            <p className="px-4 pb-3 text-[11px] text-muted-foreground">
              <span className="text-foreground font-semibold">{baldeAtual.titulo}</span> — {baldeAtual.porque}.
              {" "}Mais antigo primeiro. A nota aparece, mas não muda a ordem.
            </p>
          )}

          {/* ── Cards ──────────────────────────────────────────────────── */}
          <div className="px-4 pb-4 space-y-2">
            {carregando ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Carregando fila…</div>
            ) : itens.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                <p className="text-emerald-400 font-semibold mb-1">Nada neste balde</p>
                {/* A diferença entre "não há trabalho" e "não temos dado" — é ela
                    que impede a fila de dar falsa sensação de completude. */}
                {cobertura && (
                  <p className="text-[11px]">
                    {cobertura.com_interacao_registrada} de {cobertura.total_leads} leads têm histórico no CRM ·
                    {" "}{cobertura.elegiveis_pos_marco} entraram depois do CRM ligar
                  </p>
                )}
              </div>
            ) : (
              itens.map((it) => {
                const conta = contaDoLead(it);
                const vencido = it.proxima_acao_at && new Date(it.proxima_acao_at) < new Date();
                return (
                  <div key={it.lead_id}
                    onMouseEnter={() => onPrefetchLead?.(it.lead_id)}
                    onFocusCapture={() => onPrefetchLead?.(it.lead_id)}
                    className="rounded-lg border border-border bg-muted/20 p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => onAbrirLead(it.lead_id)}
                          className="font-semibold hover:underline text-left truncate block max-w-full">
                          {it.nome_completo}
                        </button>
                        <div className="text-[11px] text-muted-foreground flex gap-2 flex-wrap mt-0.5">
                          {it.investimento_faixa && <span>{it.investimento_faixa}</span>}
                          {it.score != null && <span>nota {it.score}</span>}
                          {it.tier && <span>{it.tier}</span>}
                        </div>
                      </div>

                      {/* O tempo que justifica a posição na fila. */}
                      <div className="text-right text-[11px] shrink-0">
                        <div className="font-semibold text-foreground">{desde(it.ordenar_por)}</div>
                        <div className="text-muted-foreground">
                          {balde === "RESPONDEU" ? "esperando resposta nossa"
                            : balde === "FOLLOWUP" ? (vencido ? "vencido" : `para ${dataCurta(it.proxima_acao_at)}`)
                            : balde === "NO_SHOW" ? "desde o no-show"
                            : balde === "NUNCA" ? "desde que entrou"
                            : "sem ação desde então"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px]">
                      {!!it.tentativas && <span className="text-muted-foreground">↑ {it.tentativas} {it.tentativas === 1 ? "tentativa" : "tentativas"}</span>}
                      {it.teve_no_show && <span className="px-1.5 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-300">no-show</span>}
                      {it.sla_estourado && <span className="px-1.5 py-0.5 rounded border border-destructive/40 bg-destructive/10 text-destructive-foreground">SLA</span>}
                      {it.desfecho_pendente && <span className="px-1.5 py-0.5 rounded border border-secondary/40 bg-secondary/10 text-secondary">desfecho pendente</span>}
                      {it.proxima_acao_at && (
                        <span className={vencido ? "text-destructive-foreground" : "text-secondary"}>
                          próxima ação {dataCurta(it.proxima_acao_at)}
                        </span>
                      )}
                    </div>

                    {/* Ações. As regras vêm do mesmo hook do modal — não há uma
                        segunda implementação delas aqui. */}
                    <div className="flex gap-2 mt-2.5 flex-wrap">
                      <Button size="sm" className="h-7 text-xs" disabled={crm.ocupado || !pessoa || !conta}
                        onClick={async () => {
                          if (!conta) return;
                          await crm.registrarEAbrir(conta, { id: it.lead_id, whatsapp: it.whatsapp, instagram: it.instagram });
                          await depoisDeAgir();
                        }}>
                        📱 {conta?.label ?? "sem conta"}
                      </Button>

                      {balde === "RESPONDEU" && conta && (
                        <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-500/40 text-emerald-300"
                          disabled={crm.ocupado || !pessoa}
                          onClick={async () => { await crm.registrarResposta(conta, it.lead_id); await depoisDeAgir(); }}>
                          ✅ Respondeu de novo
                        </Button>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={crm.ocupado || !pessoa}>
                            ⏰ {it.proxima_acao_at ? "Remarcar" : "Follow-up"} ▾
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-60">
                          <DropdownMenuLabel className="text-xs">Próxima ação em</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {PRESETS_FOLLOWUP.map((p) => (
                            <DropdownMenuItem key={p.rotulo}
                              onClick={async () => { await crm.marcarFollowup(it.lead_id, p.quando()); await depoisDeAgir(); }}>
                              {p.rotulo}
                              <span className="ml-auto text-[10px] text-muted-foreground">{dataCurta(p.quando().toISOString())}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => onAbrirLead(it.lead_id)}>
                        abrir
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Cobertura, discreta ────────────────────────────────────── */}
          {cobertura && itens.length > 0 && (
            <p className="px-4 pb-4 text-[10px] text-muted-foreground/70 leading-relaxed">
              CRM ligado em {cobertura.marco_crm ? dataCurta(cobertura.marco_crm) : "—"}.
              {" "}{cobertura.legado_sem_historico} leads anteriores não têm histórico registrado e ficam fora da fila —
              {" "}ausência de registro neles não significa que não foram trabalhados.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default FilaComercial;
