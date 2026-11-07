// CRM V1 — rotas de leitura e escrita da fundação comercial (Etapa 2).
//
// Vive fora do `index.ts` de propósito: aquele arquivo já tem 5.562 linhas e
// mais 600 lá dentro tornariam cada mudança futura mais cara. Segue o mesmo
// padrão de `commercial.ts`, `meetings.ts` e `metas.ts`.
//
// ── A convenção do painel, que NÃO é a convenção da internet ────────────────
// `fetchAdminData` manda SEMPRE GET com query string, e escrita é sinalizada
// por `?_method=POST`. Foi por isso que `POST /meetings` lê `url.searchParams`
// em vez do corpo. Estas rotas fazem o mesmo — inventar outra convenção aqui
// obrigaria o front a ter dois clientes.
//
// ── Idempotência: por que ela é obrigatória e não opcional ─────────────────
// `fetchAdminData` repete a requisição até 6 vezes em 502/503/504 e em erro de
// rede (AdminAnalytics.tsx:1235-1290) e não distingue leitura de escrita. Uma
// escrita que chega, executa e depois estoura no gateway É REPETIDA. Duas
// tentativas idênticas para o mesmo lead não parecem erro nenhum: inflam
// "% contatados" e "tentativas até resposta" em silêncio.
//
// A unicidade é da REQUISIÇÃO (`client_request_id`), nunca de semelhança de
// conteúdo: duas ligações reais idênticas no mesmo minuto podem acontecer, e as
// duas são verdadeiras.
//
// O conflito devolve **200 com a linha original**, nunca 409. Para o painel,
// repetir tem que ser indistinguível de acertar de primeira — um 409 viraria
// "Erro ao registrar" na tela do vendedor depois de um registro que funcionou.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { PESSOAS } from "../_shared/roteamento.ts";

type Client = SupabaseClient<any, any, any, any, any>;

/** Tamanho máximo da observação. A escrita trafega por QUERY STRING: acima de
 *  ~8 KB de URL os gateways truncam ou recusam, de um jeito difícil de
 *  diagnosticar. Recusar explicitamente é melhor que cortar em silêncio. */
const MAX_OBSERVACAO = 1000;

/** Quantos leads a leitura de estado aceita por vez. A fila é paginada pela
 *  rota; esta é só a leitura pontual da UI. */
const MAX_LEADS_ESTADO = 200;

const DIRECOES = new Set(["saida", "entrada", "interno"]);
const KINDS = new Set(["mensagem", "ligacao", "nota"]);
const OUTCOMES = new Set(["nao_atendeu", "caixa_postal", "numero_invalido", "nao_existe"]);
/**
 * Os cinco baldes, EM ORDEM DE PRECEDÊNCIA. A ordem desta lista é a mesma da
 * cascata em `lead_fila` — mudar aqui sem mudar lá faz o balde padrão discordar
 * da classificação.
 */
const BALDES = ["RESPONDEU", "FOLLOWUP", "NO_SHOW", "NUNCA", "SEM_ACAO"];

const MOTIVOS_PERDA = new Set([
  "sem_resposta", "sumiu", "desqualificado", "sem_verba",
  "timing", "concorrente", "numero_invalido", "duplicado", "outro",
]);

// ── Respostas ───────────────────────────────────────────────────────────────

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Recusa de validação. 422 e não 400: o pedido está bem formado, a regra é que
 *  não permite — e é essa diferença que o painel precisa mostrar ao vendedor. */
function recusa(msg: string, cors: Record<string, string>, extra?: Record<string, unknown>): Response {
  return json({ error: msg, ...(extra ?? {}) }, 422, cors);
}

// ── Validações compartilhadas ───────────────────────────────────────────────

/**
 * Quem executou a ação.
 *
 * Sem fallback: hoje o painel grava a string "Painel" quando ninguém escolheu, e
 * o dado já nasce sujo. Um valor inventado é pior que um erro, porque some
 * dentro de "conversão por responsável" sem ninguém perceber.
 *
 * A lista vem de `_shared/roteamento.ts`, a mesma que o roteamento e o SLA
 * usam. O banco NÃO tem CHECK de nomes de propósito (decisão 4): contratar
 * alguém não pode exigir migration.
 */
function validarPessoa(valor: string | null, campo: string): string | null {
  if (!valor || !valor.trim()) return `${campo} é obrigatório`;
  if (!(PESSOAS as readonly string[]).includes(valor)) {
    return `${campo} desconhecido: "${valor}". Esperado um de: ${PESSOAS.join(", ")}.`;
  }
  return null;
}

function validarObservacao(valor: string | null): string | null {
  if (valor && valor.length > MAX_OBSERVACAO) {
    return `Observação tem ${valor.length} caracteres; o limite é ${MAX_OBSERVACAO}. ` +
      `A escrita trafega por query string e URLs muito longas são recusadas pelo gateway.`;
  }
  return null;
}

function uuidValido(v: string | null): boolean {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** O Postgres devolve 23505 para qualquer índice único. Sem olhar QUAL índice,
 *  "já registrei isso" e "já existe outra tarefa aberta" viram a mesma
 *  resposta — e são coisas opostas. */
function violouIndice(err: { code?: string; message?: string; details?: string } | null, nome: string): boolean {
  if (!err || err.code !== "23505") return false;
  const texto = `${err.message ?? ""} ${err.details ?? ""}`;
  return texto.includes(nome);
}

// ── Histórico comercial: a guarda de exclusão ───────────────────────────────

/**
 * Quais destes leads têm histórico comercial que uma exclusão destruiria.
 *
 * O banco já recusa por `ON DELETE RESTRICT`, mas devolveria um erro cru de
 * chave estrangeira (500). Esta função existe para transformar isso em uma
 * recusa que diz o que fazer.
 *
 * Reuniões e vendas NÃO entram na conta: as FKs delas são `ON DELETE SET NULL`
 * e sobrevivem à exclusão do lead, órfãs. Mudar isso está fora do escopo desta
 * etapa; aqui só se protege o que seria realmente apagado.
 */
export async function leadsComHistoricoComercial(
  supabase: Client,
  ids: string[],
): Promise<Map<string, { interacoes: number; tarefas: number }>> {
  const mapa = new Map<string, { interacoes: number; tarefas: number }>();
  if (ids.length === 0) return mapa;

  const [{ data: ints }, { data: tks }] = await Promise.all([
    supabase.from("lead_interactions").select("lead_id").in("lead_id", ids),
    supabase.from("lead_tasks").select("lead_id").in("lead_id", ids),
  ]);

  for (const r of ints ?? []) {
    const atual = mapa.get(r.lead_id) ?? { interacoes: 0, tarefas: 0 };
    atual.interacoes++;
    mapa.set(r.lead_id, atual);
  }
  for (const r of tks ?? []) {
    const atual = mapa.get(r.lead_id) ?? { interacoes: 0, tarefas: 0 };
    atual.tarefas++;
    mapa.set(r.lead_id, atual);
  }
  return mapa;
}

// ── Roteador ────────────────────────────────────────────────────────────────

/**
 * Devolve `null` quando o caminho não é do CRM, para o `index.ts` seguir a
 * cascata dele sem mudança de comportamento.
 */
export async function rotasCrm(
  req: Request,
  url: URL,
  path: string,
  supabase: Client,
  cors: Record<string, string>,
): Promise<Response | null> {
  if (!path.startsWith("/crm/")) return null;

  const p = url.searchParams;
  const ehEscrita = req.method === "POST" || p.get("_method") === "POST";

  // ═════════════════════════════════════════════════════════════════════════
  // GET /crm/contas — as contas ativas, na ordem dos botões
  // ═════════════════════════════════════════════════════════════════════════
  if (path === "/crm/contas" && !ehEscrita) {
    const todas = p.get("todas") === "1";
    let q = supabase
      .from("channel_accounts")
      .select("id, kind, label, identifier, owner, is_personal, is_default, status, sort_order, deactivated_at")
      .order("sort_order", { ascending: true });
    if (!todas) q = q.eq("status", "ativa");

    const { data, error } = await q;
    if (error) throw error;
    return json({ contas: data ?? [] }, 200, cors);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // GET /crm/timeline?lead_id= — interações e tarefas de um lead
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Reunião, venda e perda NÃO saem daqui: pertencem a `meetings`,
  // `manual_sales` e `leads`, e a tela monta a linha do tempo unindo as fontes.
  // Copiá-las para cá criaria contagem dupla, que é o que este CRM existe para
  // eliminar.
  if (path === "/crm/timeline" && !ehEscrita) {
    const leadId = p.get("lead_id");
    if (!uuidValido(leadId)) return recusa("lead_id inválido ou ausente", cors);

    const incluirAnuladas = p.get("incluir_anuladas") === "1";
    const limite = Math.min(Number(p.get("limit") ?? 200) || 200, 500);

    let qi = supabase
      .from("lead_interactions")
      .select("id, occurred_at, recorded_at, direction, kind, channel_account_id, actor, outcome, observacao, source, voided_at, voided_by, void_reason")
      .eq("lead_id", leadId)
      .order("occurred_at", { ascending: false })
      .limit(limite);
    if (!incluirAnuladas) qi = qi.is("voided_at", null);

    const [{ data: interacoes, error: e1 }, { data: tarefas, error: e2 }, { data: contas }] = await Promise.all([
      qi,
      supabase
        .from("lead_tasks")
        .select("id, due_at, owner, note, status, done_at, done_by, done_interaction_id, cancel_reason, created_at, created_by")
        .eq("lead_id", leadId)
        .order("due_at", { ascending: false })
        .limit(limite),
      supabase.from("channel_accounts").select("id, label, kind, status"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    // O rótulo da conta vem junto para a tela não precisar de um segundo pedido.
    const porId = new Map((contas ?? []).map((c: any) => [c.id, c]));
    const comConta = (interacoes ?? []).map((i: any) => ({
      ...i,
      conta_label: porId.get(i.channel_account_id)?.label ?? null,
      conta_kind: porId.get(i.channel_account_id)?.kind ?? null,
    }));

    return json({ interacoes: comConta, tarefas: tarefas ?? [] }, 200, cors);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // GET /crm/estado?lead_id=  |  ?lead_ids=a,b,c — estado derivado
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Sempre com filtro. A view varre `leads` inteira sem ele, e é exatamente o
  // erro do `limit(1000)` sem paginação de `/leads` que não vamos repetir.
  if (path === "/crm/estado" && !ehEscrita) {
    const um = p.get("lead_id");
    const varios = (p.get("lead_ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const ids = um ? [um] : varios;

    if (ids.length === 0) return recusa("informe lead_id ou lead_ids", cors);
    if (ids.length > MAX_LEADS_ESTADO) {
      return recusa(`no máximo ${MAX_LEADS_ESTADO} leads por consulta; vieram ${ids.length}`, cors);
    }
    if (!ids.every(uuidValido)) return recusa("há lead_id inválido na lista", cors);

    const { data, error } = await supabase.from("lead_crm_state").select("*").in("lead_id", ids);
    if (error) throw error;
    return json({ estados: data ?? [] }, 200, cors);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // GET /crm/fila — quem precisa de ação agora
  // ═════════════════════════════════════════════════════════════════════════
  //
  // A classificação em baldes NÃO acontece aqui: ela vive na view `lead_fila`.
  // Se estivesse neste arquivo, a contagem por balde e a lista de cards seriam
  // duas implementações da mesma regra — e um dia discordariam.
  //
  // Duas consultas, nunca N+1:
  //   1. só (bucket, ordenar_por) de quem ESTÁ na fila → contagens e idade
  //   2. a página do balde pedido, com as colunas do card
  //
  // A primeira já sai filtrada por `bucket is not null`, então a massa que está
  // fora da fila (2.238 leads hoje) nunca chega a trafegar.
  if (path === "/crm/fila" && !ehEscrita) {
    const balde = p.get("bucket");
    const busca = (p.get("q") ?? "").trim();
    const limite = Math.min(Number(p.get("limit") ?? 50) || 50, 200);

    if (balde && !BALDES.includes(balde)) {
      return recusa(`bucket inválido. Esperado um de: ${BALDES.join(", ")}.`, cors);
    }

    // ── 1. Contagens e idade do item mais antigo, por balde ──────────────
    const { data: resumo, error: e1 } = await supabase
      .from("lead_fila")
      .select("bucket, ordenar_por")
      .not("bucket", "is", null)
      .limit(5000);
    if (e1) throw e1;

    const baldes = BALDES.map((b) => {
      const meus = (resumo ?? []).filter((r: any) => r.bucket === b);
      const datas = meus.map((r: any) => r.ordenar_por).filter(Boolean).sort();
      return { bucket: b, total: meus.length, mais_antigo_at: datas[0] ?? null };
    });

    // Balde padrão: o primeiro com trabalho, na ordem de precedência. Quem abre
    // a fila cai onde há o que fazer, sem precisar escolher.
    const escolhido = balde ?? (baldes.find((b) => b.total > 0)?.bucket ?? BALDES[0]);

    // ── 2. A página do balde ─────────────────────────────────────────────
    let q = supabase
      .from("lead_fila")
      .select("lead_id, nome_completo, whatsapp, instagram, investimento_faixa, tier, score, created_at, estado, tentativas, ultima_interacao_at, ultima_direcao, proxima_acao_at, proxima_acao_owner, teve_no_show, ultimo_no_show_at, desfecho_pendente, sla_estourado, ordenar_por")
      .eq("bucket", escolhido)
      .order("ordenar_por", { ascending: true, nullsFirst: false })
      .limit(limite);

    if (busca) {
      const escapada = busca.replace(/[%,()]/g, " ");
      q = q.or(`nome_completo.ilike.%${escapada}%,whatsapp.ilike.%${escapada}%,instagram.ilike.%${escapada}%`);
    }

    const { data: itens, error: e2 } = await q;
    if (e2) throw e2;

    // ── 3. Cobertura ─────────────────────────────────────────────────────
    //
    // A fila precisa saber a diferença entre "não há trabalho pendente" e "não
    // temos dado". Sem isto, um balde vazio no primeiro dia parece uma operação
    // em dia — e é o oposto: é o CRM ainda sem histórico.
    //
    // Nada aqui é backfill: `first_opened_at` e `contacted_at` continuam sendo o
    // que sempre foram e NÃO viram interação.
    const { data: marcoRow } = await supabase
      .from("channel_accounts").select("created_at").order("created_at", { ascending: true }).limit(1);
    const marco = marcoRow?.[0]?.created_at ?? null;

    // Contar "leads com histórico" pela VIEW custaria uma varredura completa
    // (quatro laterais sobre a base inteira) só para produzir um número
    // informativo — e esse custo cresce com TODOS os leads, não com a fila.
    // Ler os `lead_id` da tabela e contar distintos aqui é proporcional ao
    // que de fato existe de histórico, que é a grandeza certa.
    const TETO_COBERTURA = 20000;
    const [{ count: totalLeads }, { count: elegiveis }, { data: idsComInteracao }] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }),
      marco
        ? supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", marco)
        : Promise.resolve({ count: 0 } as any),
      supabase.from("lead_interactions").select("lead_id").is("voided_at", null).limit(TETO_COBERTURA),
    ]);
    const comInteracao = new Set((idsComInteracao ?? []).map((r: any) => r.lead_id)).size;
    const coberturaAproximada = (idsComInteracao?.length ?? 0) >= TETO_COBERTURA;

    return json({
      bucket: escolhido,
      baldes,
      itens: itens ?? [],
      cobertura: {
        marco_crm: marco,
        total_leads: totalLeads ?? 0,
        elegiveis_pos_marco: elegiveis ?? 0,
        com_interacao_registrada: comInteracao,
        legado_sem_historico: Math.max((totalLeads ?? 0) - comInteracao, 0),
        aproximada: coberturaAproximada,
      },
    }, 200, cors);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // POST /crm/interacao — registrar um ato comercial
  // ═════════════════════════════════════════════════════════════════════════
  if (path === "/crm/interacao" && ehEscrita) {
    const leadId = p.get("lead_id");
    const direction = p.get("direction");
    const kind = p.get("kind");
    const contaId = p.get("channel_account_id");
    const actor = p.get("actor");
    const outcome = p.get("outcome");
    const observacao = p.get("observacao");
    const reqId = p.get("client_request_id");
    const occurredAt = p.get("occurred_at");
    const source = p.get("source") ?? "manual";

    if (!uuidValido(leadId)) return recusa("lead_id inválido ou ausente", cors);
    if (!uuidValido(reqId)) {
      return recusa(
        "client_request_id é obrigatório e deve ser um uuid. O painel repete a escrita em erro de rede; sem esta chave a repetição vira uma tentativa duplicada.",
        cors,
      );
    }
    if (!direction || !DIRECOES.has(direction)) return recusa("direction deve ser saida, entrada ou interno", cors);
    if (!kind || !KINDS.has(kind)) return recusa("kind deve ser mensagem, ligacao ou nota", cors);

    const erroAtor = validarPessoa(actor, "actor");
    if (erroAtor) return recusa(erroAtor, cors);

    const erroObs = validarObservacao(observacao);
    if (erroObs) return recusa(erroObs, cors);

    // Nota é sempre interna e interna é sempre nota. O banco também recusa; a
    // mensagem daqui é a que o vendedor consegue entender.
    if ((direction === "interno") !== (kind === "nota")) {
      return recusa("nota é sempre interna, e interação interna é sempre nota", cors);
    }
    if (direction !== "interno" && !uuidValido(contaId)) {
      return recusa("comunicação precisa de channel_account_id", cors);
    }
    if (outcome && !OUTCOMES.has(outcome)) return recusa(`outcome inválido: ${outcome}`, cors);
    if (outcome && kind !== "ligacao") return recusa("outcome só existe em ligação", cors);

    // Hora do fato. Registrar depois é legítimo (e a diferença para
    // `recorded_at` é métrica de saúde); registrar no FUTURO não é.
    let quando = new Date().toISOString();
    if (occurredAt) {
      const t = Date.parse(occurredAt);
      if (!Number.isFinite(t)) return recusa("occurred_at não é uma data válida", cors);
      if (t > Date.now() + 60_000) return recusa("occurred_at não pode ser no futuro", cors);
      quando = new Date(t).toISOString();
    }

    const { data: lead } = await supabase.from("leads").select("id").eq("id", leadId).maybeSingle();
    if (!lead) return recusa("lead não encontrado", cors);

    if (direction !== "interno") {
      const { data: conta } = await supabase
        .from("channel_accounts").select("id, status, label").eq("id", contaId).maybeSingle();
      if (!conta) return recusa("channel_account não encontrada", cors);
      // Conta fora do ar não recebe registro NOVO. As interações antigas
      // continuam apontando para ela — é para isso que ela nunca é apagada.
      if (conta.status !== "ativa") {
        return recusa(`a conta "${conta.label}" está ${conta.status} e não aceita registro novo`, cors);
      }
    }

    const linha = {
      lead_id: leadId,
      occurred_at: quando,
      direction,
      kind,
      channel_account_id: direction === "interno" ? null : contaId,
      actor,
      outcome: outcome || null,
      observacao: observacao || null,
      source,
      client_request_id: reqId,
    };

    const { data, error } = await supabase.from("lead_interactions").insert(linha).select().maybeSingle();

    if (error) {
      // A repetição da MESMA requisição devolve o registro original, com 200.
      if (violouIndice(error, "lead_interactions_client_request_unico")) {
        const { data: existente } = await supabase
          .from("lead_interactions").select("*").eq("client_request_id", reqId).maybeSingle();
        return json({ interacao: existente, idempotente: true }, 200, cors);
      }
      throw error;
    }

    return json({ interacao: data, idempotente: false }, 200, cors);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // POST /crm/interacao-anular — corrigir sem apagar
  // ═════════════════════════════════════════════════════════════════════════
  //
  // O desfazer de 5 segundos do painel apaga de verdade (a linha tem segundos
  // de vida e nenhum valor de auditoria). Fora dessa janela, só anulação: apagar
  // tornaria "por que o sistema diz que este lead foi contatado?" irrespondível.
  if (path === "/crm/interacao-anular" && ehEscrita) {
    const id = p.get("interacao_id");
    const por = p.get("voided_by");
    const motivo = p.get("void_reason");

    if (!uuidValido(id)) return recusa("interacao_id inválido ou ausente", cors);
    const erroPor = validarPessoa(por, "voided_by");
    if (erroPor) return recusa(erroPor, cors);
    if (!motivo || !motivo.trim()) return recusa("void_reason é obrigatório: anulação sem motivo não ensina nada", cors);
    const erroObs = validarObservacao(motivo);
    if (erroObs) return recusa(erroObs, cors);

    const { data: atual } = await supabase
      .from("lead_interactions").select("id, voided_at").eq("id", id).maybeSingle();
    if (!atual) return recusa("interação não encontrada", cors);
    // Anular duas vezes é a mesma coisa que anular uma. Não é erro.
    if (atual.voided_at) return json({ interacao: atual, ja_anulada: true }, 200, cors);

    const { data, error } = await supabase
      .from("lead_interactions")
      .update({ voided_at: new Date().toISOString(), voided_by: por, void_reason: motivo })
      .eq("id", id).select().maybeSingle();
    if (error) throw error;

    return json({ interacao: data, ja_anulada: false }, 200, cors);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // POST /crm/task — criar ou remarcar a próxima ação
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Um lead tem no máximo UMA tarefa aberta — é a definição de "próxima". Por
  // isso esta rota não é só "criar": se já existe uma aberta, ela é REMARCADA.
  // Deixar o banco recusar e devolver erro faria o painel exigir que o vendedor
  // fosse fechar a tarefa antiga antes de marcar a nova, que é fricção sem
  // motivo.
  if (path === "/crm/task" && ehEscrita) {
    const leadId = p.get("lead_id");
    const dueAt = p.get("due_at");
    const owner = p.get("owner");
    const note = p.get("note");
    const reqId = p.get("client_request_id");
    const criadoPor = p.get("created_by") ?? owner;

    if (!uuidValido(leadId)) return recusa("lead_id inválido ou ausente", cors);
    if (!uuidValido(reqId)) return recusa("client_request_id é obrigatório e deve ser um uuid", cors);
    if (!dueAt) return recusa("due_at é obrigatório", cors);

    const t = Date.parse(dueAt);
    if (!Number.isFinite(t)) return recusa("due_at não é uma data válida", cors);

    const erroOwner = validarPessoa(owner, "owner");
    if (erroOwner) return recusa(erroOwner, cors);
    const erroCriador = validarPessoa(criadoPor, "created_by");
    if (erroCriador) return recusa(erroCriador, cors);
    const erroNota = validarObservacao(note);
    if (erroNota) return recusa(erroNota, cors);

    const { data: lead } = await supabase.from("leads").select("id").eq("id", leadId).maybeSingle();
    if (!lead) return recusa("lead não encontrado", cors);

    // 1. A mesma requisição já foi atendida?
    const { data: jaFeita } = await supabase
      .from("lead_tasks").select("*").eq("client_request_id", reqId).maybeSingle();
    if (jaFeita) return json({ task: jaFeita, idempotente: true, acao: "existente" }, 200, cors);

    // 2. Já existe uma aberta para este lead? Então é remarcação.
    const { data: aberta } = await supabase
      .from("lead_tasks").select("*").eq("lead_id", leadId).eq("status", "aberta").maybeSingle();

    if (aberta) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .update({ due_at: new Date(t).toISOString(), owner, note: note || null, client_request_id: reqId })
        .eq("id", aberta.id).select().maybeSingle();
      if (error) throw error;
      return json({ task: data, idempotente: false, acao: "remarcada" }, 200, cors);
    }

    const { data, error } = await supabase.from("lead_tasks").insert({
      lead_id: leadId,
      due_at: new Date(t).toISOString(),
      owner,
      note: note || null,
      created_by: criadoPor,
      client_request_id: reqId,
    }).select().maybeSingle();

    if (error) {
      if (violouIndice(error, "lead_tasks_client_request_unico")) {
        const { data: existente } = await supabase
          .from("lead_tasks").select("*").eq("client_request_id", reqId).maybeSingle();
        return json({ task: existente, idempotente: true, acao: "existente" }, 200, cors);
      }
      // Corrida: outra requisição criou a tarefa aberta entre a leitura e o
      // insert. O índice único é quem garante a regra; aqui só se traduz.
      if (violouIndice(error, "lead_tasks_uma_aberta_por_lead")) {
        const { data: existente } = await supabase
          .from("lead_tasks").select("*").eq("lead_id", leadId).eq("status", "aberta").maybeSingle();
        return json({ task: existente, idempotente: true, acao: "corrida" }, 200, cors);
      }
      throw error;
    }

    return json({ task: data, idempotente: false, acao: "criada" }, 200, cors);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // POST /crm/task-concluir
  // ═════════════════════════════════════════════════════════════════════════
  if (path === "/crm/task-concluir" && ehEscrita) {
    const id = p.get("task_id");
    const por = p.get("done_by");
    const interacaoId = p.get("done_interaction_id");

    if (!uuidValido(id)) return recusa("task_id inválido ou ausente", cors);
    const erroPor = validarPessoa(por, "done_by");
    if (erroPor) return recusa(erroPor, cors);
    if (interacaoId && !uuidValido(interacaoId)) return recusa("done_interaction_id inválido", cors);

    const { data: atual } = await supabase.from("lead_tasks").select("*").eq("id", id).maybeSingle();
    if (!atual) return recusa("tarefa não encontrada", cors);
    if (atual.status === "concluida") return json({ task: atual, ja_concluida: true }, 200, cors);
    if (atual.status === "cancelada") return recusa("tarefa cancelada não pode ser concluída", cors);

    const { data, error } = await supabase.from("lead_tasks").update({
      status: "concluida",
      done_at: new Date().toISOString(),
      done_by: por,
      // É este ponteiro que faz tarefa e interação virarem UMA linha na
      // timeline. Sem ele todo follow-up apareceria duas vezes.
      done_interaction_id: interacaoId || null,
    }).eq("id", id).select().maybeSingle();
    if (error) throw error;

    return json({ task: data, ja_concluida: false }, 200, cors);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // POST /crm/task-cancelar
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Cancelar em vez de apagar: "foi planejado e abandonado" é sinal, e apagar
  // perderia esse sinal.
  if (path === "/crm/task-cancelar" && ehEscrita) {
    const id = p.get("task_id");
    const motivo = p.get("cancel_reason");

    if (!uuidValido(id)) return recusa("task_id inválido ou ausente", cors);
    if (!motivo || !motivo.trim()) return recusa("cancel_reason é obrigatório", cors);
    const erroMotivo = validarObservacao(motivo);
    if (erroMotivo) return recusa(erroMotivo, cors);

    const { data: atual } = await supabase.from("lead_tasks").select("*").eq("id", id).maybeSingle();
    if (!atual) return recusa("tarefa não encontrada", cors);
    if (atual.status === "cancelada") return json({ task: atual, ja_cancelada: true }, 200, cors);
    if (atual.status === "concluida") return recusa("tarefa concluída não pode ser cancelada", cors);

    const { data, error } = await supabase
      .from("lead_tasks").update({ status: "cancelada", cancel_reason: motivo })
      .eq("id", id).select().maybeSingle();
    if (error) throw error;

    return json({ task: data, ja_cancelada: false }, 200, cors);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // POST /crm/perdido — dar o lead por perdido ANTES da reunião
  // ═════════════════════════════════════════════════════════════════════════
  //
  // A perda mora onde está o fato mais rico. Se houve reunião REALIZADA, o
  // desfecho pertence a `meetings.motivo_categoria` — que já existe e já tem
  // texto livre do closer. Preencher os dois lugares criaria um lead com dois
  // motivos de perda que um dia vão discordar.
  //
  // Isto é validação de rota porque um CHECK do Postgres não enxerga outra
  // tabela, e um trigger para isto seria mais caro de entender do que de
  // escrever.
  if (path === "/crm/perdido" && ehEscrita) {
    const leadId = p.get("lead_id");
    const motivo = p.get("perda_motivo");
    const por = p.get("perda_por");
    const desfazer = p.get("desfazer") === "1";

    if (!uuidValido(leadId)) return recusa("lead_id inválido ou ausente", cors);

    const { data: lead } = await supabase
      .from("leads").select("id, perdido_at").eq("id", leadId).maybeSingle();
    if (!lead) return recusa("lead não encontrado", cors);

    if (desfazer) {
      const { data, error } = await supabase.from("leads")
        .update({ perdido_at: null, perda_motivo: null, perda_por: null })
        .eq("id", leadId).select("id, perdido_at, perda_motivo, perda_por").maybeSingle();
      if (error) throw error;
      return json({ lead: data, desfeito: true }, 200, cors);
    }

    if (!motivo || !MOTIVOS_PERDA.has(motivo)) {
      return recusa(`perda_motivo inválido. Esperado um de: ${[...MOTIVOS_PERDA].join(", ")}.`, cors);
    }
    const erroPor = validarPessoa(por, "perda_por");
    if (erroPor) return recusa(erroPor, cors);

    const { data: realizadas } = await supabase
      .from("meetings").select("id").eq("lead_id", leadId).eq("status", "realizada").limit(1);

    if (realizadas && realizadas.length > 0) {
      return recusa(
        "este lead tem reunião realizada: o desfecho pertence à reunião, não ao lead. " +
        "Registre em motivo_categoria da reunião.",
        cors,
        { motivo_pertence_a: "meeting", meeting_id: realizadas[0].id },
      );
    }

    if (lead.perdido_at) {
      return json({ lead, ja_perdido: true }, 200, cors);
    }

    const { data, error } = await supabase.from("leads").update({
      perdido_at: new Date().toISOString(),
      perda_motivo: motivo,
      perda_por: por,
    }).eq("id", leadId).select("id, perdido_at, perda_motivo, perda_por").maybeSingle();
    if (error) throw error;

    return json({ lead: data, ja_perdido: false }, 200, cors);
  }

  return json({ error: `rota de CRM desconhecida: ${path}` }, 404, cors);
}
