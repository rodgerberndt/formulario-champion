import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PESSOAS_PUSH } from "@/hooks/useLeadNotifications";

/**
 * A fila comercial como FILTRO da lista de leads.
 *
 * Antes a fila era um bloco separado acima da tabela, mostrando um lead por
 * vez em card. Duas listas do mesmo assunto na mesma tela: o vendedor agia num
 * lugar e conferia no outro. Decisão do Rodger em 22/09/2026 — "o CRM tem que
 * ser o próprio painel de leads" —, então os baldes viraram estes chips e a
 * tabela abaixo passou a ser a fila.
 *
 * A classificação continua vindo inteira da view `lead_fila`, pela rota
 * `/crm/fila`. Este componente não decide balde nenhum: ele desenha a contagem
 * que o banco devolve e entrega os ids para a lista filtrar.
 *
 * O "Operando como" mora aqui porque sem ele NADA do CRM grava — o registro
 * precisa saber quem fez a ação. Ele vivia escondido no popover do sino, e em
 * 22/09 isso apareceu como "não tá dando para clicar": o vendedor escolhia o
 * prazo e nada acontecia.
 */

export interface ResumoBalde {
  bucket: string;
  total: number;
  mais_antigo_at: string | null;
}

interface Cobertura {
  marco_crm: string | null;
  legado_sem_historico: number;
}

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>, priority?: any) => Promise<any>;
  pessoa: string | null;
  definirPessoa: (p: string) => void | Promise<void>;
  baldeAtivo: string | null;
  /** Entrega o balde escolhido e os ids DELE, na ordem da fila. */
  onEscolherBalde: (balde: string | null, leadIds: string[]) => void | Promise<void>;
  /**
   * Muda a cada ação de CRM na lista. Só as CONTAGENS são refeitas — a tabela
   * fica parada de propósito, para o lead não sumir de baixo do cursor no
   * instante em que foi trabalhado.
   */
  versao?: number;
}

/** Rótulo e o PORQUÊ de cada balde — o motivo da prioridade fica na tela. */
export const BALDES: Array<{ id: string; titulo: string; porque: string; tom: string }> = [
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
  const t = min < 60 ? `${min} min` : min < 2880 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)} dias`;
  return ms < 0 ? `em ${t}` : `há ${t}`;
}

function dataCurta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function FiltroFilaCrm({
  fetchAdminData, pessoa, definirPessoa, baldeAtivo, onEscolherBalde, versao = 0,
}: Props) {
  const [resumo, setResumo] = useState<ResumoBalde[]>([]);
  const [cobertura, setCobertura] = useState<Cobertura | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [buscandoBalde, setBuscandoBalde] = useState<string | null>(null);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  /** Só as contagens. `limit: "1"` porque os itens vêm na hora de filtrar. */
  const carregarResumo = useCallback(async () => {
    try {
      const r = await fetchAdminData("/crm/fila", { limit: "1" });
      if (!montado.current) return;
      setResumo(r?.baldes ?? []);
      setCobertura(r?.cobertura ?? null);
    } catch (e) {
      console.error("[fila] resumo:", e);
    } finally {
      if (montado.current) setCarregando(false);
    }
  }, [fetchAdminData]);

  useEffect(() => { void carregarResumo(); }, [carregarResumo, versao]);

  /**
   * Busca os ids do balde e entrega para a lista.
   *
   * O limite de 200 é o teto de uma fila que ainda dá para trabalhar num dia.
   * Se um balde passar disso, o problema é a fila, não a tela.
   */
  const escolher = useCallback(async (id: string) => {
    if (baldeAtivo === id) { void onEscolherBalde(null, []); return; }
    setBuscandoBalde(id);
    try {
      const r = await fetchAdminData("/crm/fila", { bucket: id, limit: "200" });
      const ids = (r?.itens ?? []).map((i: { lead_id: string }) => i.lead_id).filter(Boolean);
      await onEscolherBalde(id, ids);
    } catch (e) {
      console.error("[fila] balde:", e);
    } finally {
      if (montado.current) setBuscandoBalde(null);
    }
  }, [baldeAtivo, fetchAdminData, onEscolherBalde]);

  const total = resumo.reduce((s, b) => s + b.total, 0);
  const atual = BALDES.find((b) => b.id === baldeAtivo);

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span className="text-sm font-bold">Fila comercial</span>
        <span className="text-xs text-muted-foreground">
          {carregando ? "carregando…"
            : total === 0 ? "ninguém esperando ação"
            : `${total} ${total === 1 ? "lead para agir" : "leads para agir"}`}
        </span>

        <div className="ml-auto flex items-center gap-2">
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

      <div className="flex gap-2 flex-wrap">
        {BALDES.map((b) => {
          const r = resumo.find((x) => x.bucket === b.id);
          const n = r?.total ?? 0;
          const sel = baldeAtivo === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => void escolher(b.id)}
              disabled={buscandoBalde !== null}
              title={sel ? "Clique de novo para ver a lista inteira" : `Filtrar a lista: ${b.porque}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors
                disabled:opacity-60 ${sel ? TOM[b.tom] : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"}`}
            >
              <span>{b.titulo}</span>
              <span className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${n > 0 ? "bg-background/60" : "opacity-50"}`}>
                {buscandoBalde === b.id ? "…" : n}
              </span>
              {n > 0 && r?.mais_antigo_at && <span className="opacity-70 font-normal">{desde(r.mais_antigo_at)}</span>}
            </button>
          );
        })}
      </div>

      {atual && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <span className="text-foreground font-semibold">{atual.titulo}</span> — {atual.porque}.
          {" "}A lista abaixo está só com estes leads, mais antigo primeiro, <span className="text-foreground">ignorando o período selecionado</span>:
          {" "}a fila é o que precisa de ação hoje, não o que entrou esta semana.
          {" "}Clique no mesmo balde para voltar à lista inteira.
        </p>
      )}

      {cobertura && !atual && (
        <p className="mt-2 text-[10px] text-muted-foreground/70">
          CRM ligado em {cobertura.marco_crm ? dataCurta(cobertura.marco_crm) : "—"}.
          {" "}{cobertura.legado_sem_historico} leads anteriores não têm histórico registrado e ficam fora da fila —
          {" "}ausência de registro neles não significa que não foram trabalhados.
        </p>
      )}
    </div>
  );
}

export default FiltroFilaCrm;
