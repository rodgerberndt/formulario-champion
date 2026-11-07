import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";

/**
 * As regras de escrita do CRM, num lugar só.
 *
 * Existem duas telas que registram interação — o modal de detalhe do lead e a
 * fila comercial — e elas NÃO podem ter duas cópias destas regras. Duas cópias
 * é como se descobre, semanas depois, que a fila grava um `client_request_id`
 * por requisição e o modal grava por ação, e que só uma das duas telas está
 * protegida contra o retry.
 *
 * Todas as funções recebem `leadId` explicitamente, para a fila poder usar uma
 * instância só do hook para muitos cards.
 */

export interface ContaCanal {
  id: string;
  kind: "whatsapp" | "instagram" | "telefone" | "email";
  label: string;
  identifier: string | null;
  owner: string | null;
  is_personal: boolean;
  is_default: boolean;
  status: string;
  sort_order: number;
}

type Fetch = (path: string, params?: Record<string, string>, priority?: any) => Promise<any>;

export function soDigitos(t?: string | null): string {
  return (t || "").replace(/\D/g, "");
}

export function handleInstagram(t?: string | null): string {
  return (t || "").trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@+/, "");
}

/**
 * `fetchAdminData` transforma 4xx num Error cujo `message` é o texto que o
 * servidor mandou. As recusas do CRM são 422 com frases escritas para o
 * vendedor ler — mostrar isso é o que faz a regra ser aprendida em vez de virar
 * mistério.
 */
export function mensagemDoErro(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "Não foi possível registrar. Tente de novo.";
}

/**
 * `ativo` existe porque a página do admin precisa chamar este hook ACIMA das
 * suas saídas antecipadas (senão dá o erro #310 do React), e lá em cima a
 * sessão ainda pode não existir. Com `ativo = false` o hook monta normalmente,
 * mas não vai buscar as contas enquanto não houver login.
 */
export function useCrmAcoes(fetchAdminData: Fetch, pessoa: string | null, ativo = true) {
  const [contas, setContas] = useState<ContaCanal[]>([]);
  const [ocupado, setOcupado] = useState(false);
  /**
   * QUAL lead está gravando agora. `ocupado` é um booleano da tela inteira, e
   * usá-lo para desabilitar botão por linha congela a tabela inteira durante
   * uma gravação — o que na lista de leads parece a tela ter travado.
   */
  const [emAcao, setEmAcao] = useState<string | null>(null);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    void (async () => {
      try {
        const r = await fetchAdminData("/crm/contas");
        if (vivo && montado.current) setContas(r?.contas ?? []);
      } catch (e) {
        console.error("[crm] contas:", e);
      }
    })();
    return () => { vivo = false; };
  }, [fetchAdminData, ativo]);

  /**
   * IDEMPOTÊNCIA — o ponto crítico.
   *
   * Quem chama gera o `client_request_id` UMA vez por ação do usuário e passa
   * aqui dentro de `params`. O `fetchAdminData` repete a requisição até 6 vezes
   * em 502/503/504 e em erro de rede, remontando a MESMA query string a partir
   * do MESMO objeto — então o retry carrega o mesmo uuid e o backend devolve a
   * linha original em vez de criar outra.
   *
   * Gerar o uuid aqui dentro, ou dentro do `fetchAdminData`, destruiria a
   * proteção inteira: cada tentativa viraria uma tentativa comercial a mais.
   */
  /**
   * Sem "quem está operando" escolhido no topo do painel não dá para registrar
   * nada — o CRM grava QUEM fez cada ação.
   *
   * Isto existe porque as funções abaixo faziam `if (!pessoa) return null`
   * **em silêncio**: o vendedor clicava no prazo, o menu fechava e nada
   * acontecia, sem uma palavra na tela. Em 22/09/2026 isso chegou como "não tá
   * dando para clicar".
   */
  const semPessoa = useCallback(() => {
    if (pessoa) return false;
    toast({
      title: "Escolha quem está operando",
      description: "Abra o sino no topo do painel e responda \"Quem é você?\". O CRM grava quem fez cada ação.",
      variant: "destructive",
    });
    return true;
  }, [pessoa]);

  const escrever = useCallback(async (
    rota: string,
    params: Record<string, string>,
    okMsg: string,
  ): Promise<any | null> => {
    if (!pessoa) {
      toast({
        title: "Escolha quem está operando",
        description: "O registro precisa saber quem fez a ação.",
        variant: "destructive",
      });
      return null;
    }
    setOcupado(true);
    setEmAcao(params.lead_id ?? params.task_id ?? params.interacao_id ?? "*");
    try {
      const r = await fetchAdminData(rota, { ...params, _method: "POST" });
      if (r?.idempotente) console.info("[crm] requisição repetida; devolvido o registro original");
      toast({ title: okMsg });
      return r;
    } catch (e) {
      toast({ title: "Não deu para registrar", description: mensagemDoErro(e), variant: "destructive" });
      return null;
    } finally {
      if (montado.current) { setOcupado(false); setEmAcao(null); }
    }
  }, [pessoa, fetchAdminData]);

  /**
   * Registra a tentativa E abre o canal.
   *
   * A aba abre ANTES do await de propósito: o navegador só permite abrir janela
   * dentro do gesto do usuário. Esperar a rede faria o pop-up ser bloqueado, e o
   * vendedor teria que clicar duas vezes — a fricção que este CRM existe para
   * eliminar.
   *
   * O que isto NÃO afirma: que a mensagem foi enviada. O `wa.me` abre o WhatsApp
   * com a conta logada naquele navegador, e nenhuma API nos diz qual foi. A
   * conta do botão é uma DECLARAÇÃO do vendedor.
   */
  const registrarEAbrir = useCallback(async (
    conta: ContaCanal,
    lead: { id: string; whatsapp?: string | null; instagram?: string | null },
  ) => {
    if (!pessoa) {
      toast({ title: "Escolha quem está operando", variant: "destructive" });
      return null;
    }
    const clientRequestId = crypto.randomUUID();

    if (conta.kind === "whatsapp") {
      const num = soDigitos(lead.whatsapp);
      if (num) window.open(`https://wa.me/${num}`, "_blank", "noopener,noreferrer");
      else toast({ title: "Lead sem WhatsApp", description: "Registrando a tentativa mesmo assim." });
    } else if (conta.kind === "instagram") {
      const h = handleInstagram(lead.instagram);
      if (h) window.open(`https://instagram.com/${h}`, "_blank", "noopener,noreferrer");
      else toast({ title: "Lead sem Instagram", description: "Registrando a tentativa mesmo assim." });
    }

    return escrever("/crm/interacao", {
      lead_id: lead.id,
      direction: "saida",
      kind: "mensagem",
      channel_account_id: conta.id,
      actor: pessoa,
      client_request_id: clientRequestId,
    }, `Tentativa registrada — ${conta.label}`);
  }, [pessoa, escrever, semPessoa]);

  const registrarResposta = useCallback(async (conta: ContaCanal, leadId: string) => {
    if (semPessoa()) return null;
    return escrever("/crm/interacao", {
      lead_id: leadId,
      direction: "entrada",
      kind: "mensagem",
      channel_account_id: conta.id,
      actor: pessoa,
      client_request_id: crypto.randomUUID(),
    }, `Resposta registrada — ${conta.label}`);
  }, [pessoa, escrever, semPessoa]);

  const registrarLigacao = useCallback(async (
    contaTelefone: ContaCanal,
    lead: { id: string; whatsapp?: string | null },
    outcome: string,
  ) => {
    if (semPessoa()) return null;
    const num = soDigitos(lead.whatsapp);
    if (num) window.open(`tel:+${num}`, "_self");
    return escrever("/crm/interacao", {
      lead_id: lead.id,
      direction: "saida",
      kind: "ligacao",
      channel_account_id: contaTelefone.id,
      actor: pessoa,
      ...(outcome ? { outcome } : {}),
      client_request_id: crypto.randomUUID(),
    }, "Ligação registrada");
  }, [pessoa, escrever, semPessoa]);

  const marcarFollowup = useCallback(async (leadId: string, data: Date) => {
    if (semPessoa()) return null;
    return escrever("/crm/task", {
      lead_id: leadId,
      due_at: data.toISOString(),
      owner: pessoa,
      created_by: pessoa,
      client_request_id: crypto.randomUUID(),
    }, `Próxima ação marcada`);
  }, [pessoa, escrever, semPessoa]);

  const concluirTarefa = useCallback(async (taskId: string, interacaoId?: string | null) => {
    if (semPessoa()) return null;
    return escrever("/crm/task-concluir", {
      task_id: taskId,
      done_by: pessoa,
      ...(interacaoId ? { done_interaction_id: interacaoId } : {}),
    }, "Follow-up concluído");
  }, [pessoa, escrever, semPessoa]);

  const anular = useCallback(async (interacaoId: string, motivo: string) => {
    if (semPessoa() || !motivo.trim()) return null;
    return escrever("/crm/interacao-anular", {
      interacao_id: interacaoId,
      voided_by: pessoa,
      void_reason: motivo.trim(),
    }, "Registro anulado");
  }, [pessoa, escrever, semPessoa]);

  const marcarPerdido = useCallback(async (leadId: string, motivo: string) => {
    if (semPessoa()) return null;
    return escrever("/crm/perdido", {
      lead_id: leadId, perda_motivo: motivo, perda_por: pessoa,
    }, "Lead marcado como perdido");
  }, [pessoa, escrever, semPessoa]);

  return {
    contas, ocupado, emAcao,
    registrarEAbrir, registrarResposta, registrarLigacao,
    marcarFollowup, concluirTarefa, anular, marcarPerdido,
  };
}

// ── Prazos de follow-up, compartilhados pelas duas telas ────────────────────
//
// PROVISÓRIOS. O Miguel confirmou que faz múltiplas tentativas e que lembrar do
// próximo contato é o problema — mas não deu os intervalos que ele usa. Até lá
// isto é um palpite razoável, não a cadência da casa.

function emDiasAs(dias: number, hora: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return d;
}

export const PRESETS_FOLLOWUP: Array<{ rotulo: string; quando: () => Date }> = [
  { rotulo: "Mais tarde hoje", quando: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
  { rotulo: "Amanhã 9h", quando: () => emDiasAs(1, 9) },
  { rotulo: "Em 2 dias", quando: () => emDiasAs(2, 9) },
  { rotulo: "Em 3 dias", quando: () => emDiasAs(3, 9) },
  { rotulo: "Próxima semana", quando: () => emDiasAs(7, 9) },
];
