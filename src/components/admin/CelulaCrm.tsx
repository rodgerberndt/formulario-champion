import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRESETS_FOLLOWUP, type useCrmAcoes } from "@/hooks/useCrmAcoes";

/**
 * O CRM dentro da lista de leads.
 *
 * Existe porque a fila comercial separada não estava sendo usada: trocar de
 * tela para saber "o que faço com este lead" é atrito suficiente para o
 * vendedor não fazer. Aqui o estado e as ações ficam na MESMA linha em que ele
 * já está olhando o lead.
 *
 * Desde 22/09/2026 esta célula carrega as ações inteiras — tentativa pelo
 * WhatsApp, resposta recebida e próxima ação —, as mesmas que existiam no card
 * da fila. Elas vêm do mesmo `useCrmAcoes` do modal e da fila: não há uma
 * segunda implementação das regras aqui.
 *
 * O estado NÃO é calculado aqui. Vem da view `lead_fila`, a mesma que alimenta
 * a fila — duas cópias da regra é como se descobre, semanas depois, que as duas
 * telas discordam sobre o mesmo lead.
 */

export interface EstadoCrmDoLead {
  id: string;
  whatsapp?: string | null;
  instagram?: string | null;
  crm_estado?: string | null;
  crm_bucket?: string | null;
  crm_tentativas?: number | null;
  crm_proxima_acao_at?: string | null;
  crm_proxima_acao_owner?: string | null;
  crm_sla_estourado?: boolean | null;
  crm_ultima_interacao_at?: string | null;
}

interface Props {
  lead: EstadoCrmDoLead;
  /** O hook inteiro, instanciado UMA vez pela tabela. */
  crm: ReturnType<typeof useCrmAcoes>;
  pessoa: string | null;
  /** Chamado depois de gravar, para a linha recarregar só o seu estado. */
  aoMudar?: () => void;
}

/** Rótulo e cor de cada situação. Os nomes são os mesmos da fila comercial. */
function situacao(l: EstadoCrmDoLead): { texto: string; classe: string } {
  if (l.crm_bucket === "RESPONDEU") return { texto: "Respondeu", classe: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" };
  if (l.crm_bucket === "FOLLOWUP") return { texto: "Follow-up devido", classe: "border-destructive/50 bg-destructive/10 text-destructive-foreground" };
  if (l.crm_bucket === "NO_SHOW") return { texto: "Faltou à call", classe: "border-orange-500/50 bg-orange-500/10 text-orange-300" };
  if (l.crm_bucket === "NUNCA") return { texto: "Nunca contatado", classe: "border-blue-500/50 bg-blue-500/10 text-blue-300" };
  if (l.crm_bucket === "SEM_ACAO") return { texto: "Sem próxima ação", classe: "border-secondary/50 bg-secondary/10 text-secondary" };
  if (l.crm_estado === "AGENDADO") return { texto: "Agendado", classe: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" };
  if (l.crm_estado === "GANHO") return { texto: "Ganho", classe: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" };
  if (l.crm_estado === "PERDIDO") return { texto: "Perdido", classe: "border-muted bg-muted/20 text-muted-foreground" };
  if (l.crm_estado) return { texto: String(l.crm_estado).toLowerCase(), classe: "border-muted bg-muted/20 text-muted-foreground" };
  return { texto: "—", classe: "border-muted bg-muted/10 text-muted-foreground" };
}

/** "em 3h", "há 2 dias" — a distância importa mais que a data exata. */
function quando(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  const min = Math.round(Math.abs(ms) / 60000);
  const t = min < 60 ? `${min} min` : min < 2880 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)} dias`;
  return ms >= 0 ? `em ${t}` : `há ${t}`;
}

function dataCurta(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Botão pequeno, mas com alvo de clique de verdade.
 *
 * A primeira versão era texto de 10px sublinhado, sem padding, dentro de uma
 * linha inteira clicável: errar por dois pixels abria o modal do lead. E a cor
 * `text-primary` é o azul-marinho da marca, que no painel escuro fica quase
 * invisível.
 */
function BotaoCrm({
  titulo, onClick, desabilitado, classe, children,
}: {
  titulo: string;
  onClick?: (e: React.MouseEvent) => void;
  desabilitado?: boolean;
  classe: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      disabled={desabilitado}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={`rounded border border-dashed px-1.5 py-1 text-[11px] leading-none whitespace-nowrap
        transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed ${classe}`}
    >
      {children}
    </button>
  );
}

export function CelulaCrm({ lead, crm, pessoa, aoMudar }: Props) {
  const s = situacao(lead);
  const prox = quando(lead.crm_proxima_acao_at);
  const atrasada = !!lead.crm_proxima_acao_at && new Date(lead.crm_proxima_acao_at).getTime() < Date.now();
  const gravando = crm.emAcao === lead.id;

  /** A mesma escolha de conta da fila: a padrão ativa, senão qualquer WhatsApp ativo. */
  const conta = crm.contas.find((c) => c.is_default && c.status === "ativa")
    ?? crm.contas.find((c) => c.kind === "whatsapp" && c.status === "ativa")
    ?? null;

  const semOperador = !pessoa;

  return (
    <div className="flex flex-col gap-1 items-start">
      <span className={`px-1.5 py-0.5 rounded border text-[10px] leading-none whitespace-nowrap ${s.classe}`}>
        {s.texto}
      </span>

      <div className="flex items-center gap-1 flex-wrap">
        {/*
          Registra a tentativa E abre o WhatsApp. A aba abre dentro do gesto do
          usuário, no hook — esperar a rede faria o pop-up ser bloqueado.
        */}
        {conta && (
          <BotaoCrm
            titulo={semOperador ? "Escolha quem está operando" : `Registrar tentativa e abrir ${conta.label}`}
            desabilitado={gravando}
            classe={semOperador ? "border-amber-500/60 text-amber-400" : "border-blue-400/50 text-blue-300"}
            onClick={async (e) => {
              e.stopPropagation();
              await crm.registrarEAbrir(conta, { id: lead.id, whatsapp: lead.whatsapp, instagram: lead.instagram });
              aoMudar?.();
            }}
          >
            📱
          </BotaoCrm>
        )}

        {/* Só faz sentido em quem está esperando resposta nossa. */}
        {conta && lead.crm_bucket === "RESPONDEU" && (
          <BotaoCrm
            titulo="Ele respondeu de novo"
            desabilitado={gravando}
            classe="border-emerald-500/50 text-emerald-300"
            onClick={async (e) => {
              e.stopPropagation();
              await crm.registrarResposta(conta, lead.id);
              aoMudar?.();
            }}
          >
            ✅
          </BotaoCrm>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <BotaoCrm
              titulo={semOperador ? "Escolha quem está operando no topo da fila" : "Marcar a próxima ação"}
              desabilitado={gravando}
              classe={
                semOperador ? "border-amber-500/60 text-amber-400"
                  : atrasada ? "border-destructive/60 text-destructive"
                  : prox ? "border-muted-foreground/40 text-muted-foreground"
                  : "border-blue-400/50 text-blue-300"
              }
              onClick={(e) => e.stopPropagation()}
            >
              {gravando ? "gravando…" : semOperador ? "quem é você?" : prox ? `⏰ ${prox}` : "⏰ marcar"}
            </BotaoCrm>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuLabel className="text-xs">
              Próxima ação
              {typeof lead.crm_tentativas === "number" && lead.crm_tentativas > 0
                ? ` · ${lead.crm_tentativas} tentativa${lead.crm_tentativas > 1 ? "s" : ""}`
                : ""}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PRESETS_FOLLOWUP.map((p) => (
              <DropdownMenuItem
                key={p.rotulo}
                className="text-xs"
                onSelect={async () => {
                  await crm.marcarFollowup(lead.id, p.quando());
                  aoMudar?.();
                }}
              >
                {p.rotulo}
                <span className="ml-auto text-[10px] text-muted-foreground">{dataCurta(p.quando().toISOString())}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default CelulaCrm;
