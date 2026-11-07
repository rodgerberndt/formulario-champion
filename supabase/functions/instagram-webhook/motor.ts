import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { graphGet, graphPost, IG_USER_ID, linkRastreado } from "../_shared/instagram.ts";
import { faixaDoValor, tierDoValor, valorDoFaturamento } from "../_shared/faturamento.ts";
import { calcularNotaFormulario } from "../admin-data/leadScore.ts";

// Motor do Champion Direct: transforma eventos do webhook do Instagram em
// respostas, seguindo as automações de ig_automacoes.
//
// Regras da Meta que este arquivo obedece:
// - comentário vira DM por private reply, 1 mensagem só até a pessoa responder;
// - fora isso, só se fala dentro de 24h da última mensagem DA PESSOA;
// - quem escreveu PARAR não recebe mais nada automático (política de privacidade).

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

// valor: o que grava no campo quando o passo tem opções E coletar (ex.: a faixa
// de faturamento do quiz, que não cabe nos 20 caracteres do botão).
export type Opcao = { titulo: string; tag?: string; proximo?: string; valor?: string };
export type Botao = { titulo: string; url: string };
export type Passo = {
  id: string;
  texto: string;
  botoes?: Botao[];
  opcoes?: Opcao[];
  tags?: string[];
  coletar?: { campo: string; proximo?: string } | null;
  proximo?: string | null;
  exigir_seguir?: boolean;
  texto_portao?: string;
  botao_portao?: string;
};
export type Automacao = {
  id: string;
  nome: string;
  ativo: boolean;
  gatilho: "comentario" | "dm" | "story" | "ref";
  palavras: string[];
  midias: string[];
  ref: string | null;
  respostas_publicas: string[];
  passos: Passo[];
  campanha: string | null; // vira utm_campaign do lead (ex.: "Isca 01")
};
type Contato = {
  igsid: string;
  username: string | null;
  nome: string | null;
  segue: boolean | null;
  ultima_msg_em: string | null;
  tags: string[];
  campos: Record<string, string>;
  aguardando: { tipo: "coletar" | "continuar"; automacao_id: string; campo?: string; proximo?: string | null; desde?: string; lembretes?: number } | null;
  optout: boolean;
  pausado_ate: string | null;
  perfil_atualizado_em: string | null;
  origem: string | null;
  origem_detalhe: Record<string, unknown> | null;
  lead_id: string | null;
};

const JANELA_MS = 24 * 3600 * 1000;
const PAUSA_HUMANO_MS = 12 * 3600 * 1000;
const PALAVRAS_PARAR = ["parar", "pare", "sair", "stop", "cancelar", "descadastrar"];
const MAX_ENCADEADOS = 6;

export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

function casaPalavra(texto: string, palavras: string[]): boolean {
  if (!palavras.length) return true;
  const t = ` ${normalizar(texto).replace(/[^a-z0-9 ]/g, " ")} `;
  return palavras.some((p) => {
    const n = normalizar(p).replace(/[^a-z0-9 ]/g, " ").trim();
    return n.length > 0 && t.includes(` ${n} `);
  });
}

function preencher(texto: string, c: Contato): string {
  const nome = c.nome ?? c.username ?? "";
  return texto
    .replaceAll("{{nome}}", nome)
    .replaceAll("{{primeiro_nome}}", nome.split(" ")[0] ?? "")
    .replaceAll("{{username}}", c.username ? `@${c.username}` : "");
}

async function log(sb: AnyClient, tipo: string, automacaoId: string | null, igsid: string | null, passo?: string | null, detalhe?: unknown) {
  await sb.from("ig_execucoes").insert({ tipo, automacao_id: automacaoId, igsid, passo: passo ?? null, detalhe: detalhe ?? null });
}

// ── Contatos ───────────────────────────────────────────────

async function contato(sb: AnyClient, igsid: string, username?: string): Promise<Contato> {
  const { data } = await sb.from("ig_contatos").select("*").eq("igsid", igsid).maybeSingle();
  let c = data as Contato | null;
  if (!c) {
    const { data: novo } = await sb.from("ig_contatos").upsert({ igsid, username: username ?? null }).select("*").single();
    c = novo as Contato;
  }
  const velho = !c.perfil_atualizado_em || Date.now() - new Date(c.perfil_atualizado_em).getTime() > 86_400_000;
  if (velho) await atualizarPerfil(sb, c);
  await ligarProspeccao(sb, c);
  return c;
}

// Lead do garimpo (origem prospeccao, 24/10/2026): quando a conversa com o @ começa, o contato é ligado ao lead
// pelo username e ganha a tag "Prospecção". A conversa é do Miguel: o robô não responde (ver tratarMensageria) e
// o agent prospeccao-conversas.mjs, no PC, lê a conversa e preenche faturamento, WhatsApp e o resto no lead.
async function ligarProspeccao(sb: AnyClient, c: Contato) {
  if (c.lead_id || !c.username) return;
  const { data } = await sb.from("leads").select("id").eq("origem_lead", "prospeccao").eq("instagram", `@${c.username.toLowerCase()}`).limit(1);
  const lead = data?.[0];
  if (!lead) return;
  await salvar(sb, c, { lead_id: lead.id, tags: c.tags.includes("Prospecção") ? c.tags : [...c.tags, "Prospecção"] });
  await log(sb, "lead", null, c.igsid, null, { prospeccao: lead.id });
}

async function atualizarPerfil(sb: AnyClient, c: Contato) {
  const p = await graphGet(sb, c.igsid, { fields: "name,username,profile_pic,is_user_follow_business,follower_count" });
  if (p.error) {
    console.error("Error in atualizarPerfil:", p.error);
    return;
  }
  const dados = {
    nome: p.name ?? c.nome,
    username: p.username ?? c.username,
    foto_url: p.profile_pic ?? null,
    segue: p.is_user_follow_business ?? null,
    seguidores: p.follower_count ?? null,
    perfil_atualizado_em: new Date().toISOString(),
  };
  Object.assign(c, dados);
  await sb.from("ig_contatos").update(dados).eq("igsid", c.igsid);
}

async function salvar(sb: AnyClient, c: Contato, mudancas: Partial<Contato> & Record<string, unknown>) {
  Object.assign(c, mudancas);
  await sb.from("ig_contatos").update({ ...mudancas, ultima_interacao_em: new Date().toISOString() }).eq("igsid", c.igsid);
}

async function adicionarTags(sb: AnyClient, c: Contato, tags: string[] | undefined) {
  const novas = (tags ?? []).map((t) => t.trim()).filter((t) => t && !c.tags.includes(t));
  if (novas.length) await salvar(sb, c, { tags: [...c.tags, ...novas] });
}

// ── Conversa guardada ──────────────────────────────────────

function textoDe(message: unknown): string | null {
  const m = message as { text?: string; attachment?: { payload?: { text?: string } } };
  return m?.text ?? m?.attachment?.payload?.text ?? null;
}

export async function guardarMensagem(
  sb: AnyClient, mid: string, igsid: string, direcao: "entrada" | "saida", autor: string, texto: string | null, automacaoId?: string | null, anexo?: unknown,
) {
  await sb.from("ig_mensagens").upsert(
    { mid, igsid, direcao, autor, texto, automacao_id: automacaoId ?? null, anexo: anexo ?? null },
    { onConflict: "mid", ignoreDuplicates: true },
  );
}

// ── Aviso no celular ───────────────────────────────────────

// Conversa nova de quem não segue a conta cai em "Geral" no Instagram, que não
// notifica, e a API não move conversa para "Principal". Então o aviso sai daqui,
// pelo mesmo push do painel que avisa lead (pedido do Rodger, 28/10/2026).
// Mesma tag por contato: várias mensagens seguidas viram UMA notificação.
async function avisarTime(c: Contato, titulo: string, corpo: string, tipo: "lead" | "aviso" = "aviso") {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/web-push/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") || "",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ tipo, title: titulo, body: corpo, tag: `ig-${c.igsid}`, url: "/admin", pessoas: [] }),
    });
    if (!r.ok) console.error("Error in avisarTime:", r.status, await r.text());
  } catch (e) {
    console.error("Error in avisarTime:", e);
  }
}

function quem(c: Contato): string {
  return c.username ? `@${c.username}` : (c.nome ?? "Contato");
}

// Mensagem que nenhuma automação vai responder: é gente do time que precisa ver.
async function avisarMensagem(c: Contato, texto: string) {
  await avisarTime(c, `💬 Direct: ${quem(c)}`, texto ? texto.slice(0, 160) : "Mandou foto, áudio ou anexo");
}

// ── Origem e lead ──────────────────────────────────────────

const ROTULO_ORIGEM: Record<string, string> = { comentario: "comentário", seguidor: "seguidor", dm: "DM", story: "story", ref: "link" };

async function marcarOrigem(sb: AnyClient, c: Contato, origem: string, detalhe: Record<string, unknown>) {
  if (c.origem) return; // vale a primeira porta de entrada
  await salvar(sb, c, { origem, origem_detalhe: detalhe });
}

// Resposta de "Qual seu nome?" às vezes traz a pergunta junto ("Gustavo, gostaria de ter mais
// informações..." em outra linha). O nome é a primeira linha; o resto é recado para o SDR ler (03/11/2026).
function separarNome(texto: unknown): { nome: string; recado: string } {
  const linhas = String(texto ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const primeira = linhas[0] ?? "";
  const nome = primeira.split(/\s+/).length <= 4 ? primeira : primeira.split(/\s+/)[0];
  const recado = [primeira === nome ? "" : primeira, ...linhas.slice(1)].filter(Boolean).join(" ");
  return { nome: nome || "Sem nome", recado };
}

// O faturamento digitado vira a faixa do quiz (investimento_faixa), que é o que a lista, o tier e a nota
// leem. O texto cru continua em faturamento_faixa. Nota na régua do formulário curto, a mesma da prospecção.
function camposDoFaturamento(c: Contato): Record<string, unknown> {
  const texto = c.campos.faturamento ?? null;
  const valor = valorDoFaturamento(texto as string | null);
  if (valor === null) return { faturamento_faixa: texto };
  const faixa = faixaDoValor(valor);
  const nota = calcularNotaFormulario({ investimento_faixa: faixa, mercado: "" });
  return {
    faturamento_faixa: texto,
    faturamento_declarado: valor,
    investimento_faixa: faixa,
    tier: tierDoValor(valor),
    score: nota.score,
    score_breakdown: nota.breakdown,
    score_version: nota.version,
    score_calculated_at: new Date().toISOString(),
  };
}

// Com nome e telefone na mão, o contato vira lead na aba Leads do admin.
// origem_lead = direct: o gatilho de atribuição não reescreve e a CAPI ignora (21/10/2026).
async function talvezCriarLead(sb: AnyClient, c: Contato, a: Automacao) {
  if (c.lead_id) return;
  const telefone = String(c.campos.telefone ?? c.campos.whatsapp ?? "").replace(/\D/g, "");
  if (telefone.length < 10) return;
  const { nome, recado } = separarNome(c.campos.nome ?? c.nome ?? c.username);
  const det = c.origem_detalhe ?? {};
  const linha = {
    nome_completo: nome,
    whatsapp: telefone.startsWith("55") ? `+${telefone}` : `+55${telefone}`,
    instagram: c.username ? `@${c.username}` : "",
    mercado: "",
    dor_desejo: c.tags.filter((t) => t.startsWith("Dor: ")).map((t) => t.slice(5)).join(", "),
    origem_lead: "direct",
    attribution_source: "instagram_dm",
    utm_source: "instagram",
    utm_medium: ROTULO_ORIGEM[c.origem ?? ""] ?? "DM",
    utm_campaign: a.campanha || a.nome,
    utm_content: String(det.permalink ?? det.palavra ?? c.origem ?? ""),
    page_url: (det.permalink as string) ?? null,
    ...camposDoFaturamento(c),
    raw_answers_json: { fonte: "champion_direct", igsid: c.igsid, username: c.username, tags: c.tags, campos: c.campos, origem: c.origem, origem_detalhe: det, ...(recado ? { recado_do_lead: recado } : {}) },
  };
  const { data, error } = await sb.from("leads").insert(linha).select("id").single();
  if (error) {
    await log(sb, "erro", a.id, c.igsid, null, { criar_lead: error.message });
    console.error("Error in talvezCriarLead:", error);
    return;
  }
  await salvar(sb, c, { lead_id: data.id });
  await log(sb, "lead", a.id, c.igsid, null, { lead_id: data.id });
  const linhas = [`💰 ${c.campos.faturamento || "Faturamento não informado"}`, `📸 ${quem(c)}`, `📍 ${a.campanha || a.nome}`];
  if (recado) linhas.push(`📝 ${recado.slice(0, 120)}`);
  await avisarTime(c, `🚀 Lead do Direct: ${nome}`, linhas.join("\n"), "lead");
}

// O lead nasce no telefone; o que vier depois (faturamento) completa o mesmo lead.
async function atualizarLead(sb: AnyClient, c: Contato, a: Automacao) {
  if (!c.lead_id) return await talvezCriarLead(sb, c, a);
  const { data: l } = await sb.from("leads").select("raw_answers_json").eq("id", c.lead_id).maybeSingle();
  const raw = { ...((l?.raw_answers_json as Record<string, unknown>) ?? {}), tags: c.tags, campos: c.campos };
  const { error } = await sb.from("leads").update({ ...camposDoFaturamento(c), raw_answers_json: raw }).eq("id", c.lead_id);
  if (error) await log(sb, "erro", a.id, c.igsid, null, { atualizar_lead: error.message });
}

// ── Envio ──────────────────────────────────────────────────

function payload(automacaoId: string, passoId: string, idx: number | "G") {
  return `CD|${automacaoId}|${passoId}|${idx}`;
}

async function montarMensagem(a: Automacao, passo: Passo, c: Contato) {
  const texto = preencher(passo.texto, c);
  if (passo.botoes?.length) {
    const buttons = await Promise.all(passo.botoes.slice(0, 3).map(async (b) => ({
      type: "web_url",
      title: b.titulo.slice(0, 20),
      url: await linkRastreado(b.url, a.id, c.igsid),
    })));
    return { attachment: { type: "template", payload: { template_type: "button", text: texto.slice(0, 640), buttons } } };
  }
  const msg: Record<string, unknown> = { text: texto.slice(0, 1000) };
  if (passo.opcoes?.length) {
    msg.quick_replies = passo.opcoes.slice(0, 13).map((o, i) => ({
      content_type: "text",
      title: o.titulo.slice(0, 20),
      payload: payload(a.id, passo.id, i),
    }));
  }
  return msg;
}

async function enviarBruto(sb: AnyClient, a: Automacao, c: Contato, passoId: string, recipient: Record<string, string>, message: unknown) {
  const r = await graphPost(sb, `${IG_USER_ID}/messages`, { recipient, message });
  if (r.message_id) {
    await sb.from("ig_enviadas").insert({ mid: r.message_id, igsid: c.igsid, automacao_id: a.id });
    await guardarMensagem(sb, r.message_id, c.igsid, "saida", "robo", textoDe(message), a.id);
    await log(sb, "envio", a.id, c.igsid, passoId);
    return true;
  }
  await log(sb, "erro", a.id, c.igsid, passoId, r.error ?? r);
  console.error("Error in enviarBruto:", r.error ?? r);
  return false;
}

function janelaAberta(c: Contato): boolean {
  return !!c.ultima_msg_em && Date.now() - new Date(c.ultima_msg_em).getTime() < JANELA_MS;
}

function bloqueado(c: Contato): boolean {
  return c.optout || (!!c.pausado_ate && new Date(c.pausado_ate).getTime() > Date.now());
}

// Executa um passo. commentId presente = 1ª mensagem por private reply.
export async function executarPasso(
  sb: AnyClient, a: Automacao, c: Contato, passoId: string | null | undefined, commentId?: string, profundidade = 0,
): Promise<void> {
  if (!passoId || profundidade > MAX_ENCADEADOS) return;
  const passo = a.passos.find((p) => p.id === passoId);
  if (!passo) return;
  if (bloqueado(c)) return;
  if (!commentId && !janelaAberta(c)) {
    await log(sb, "erro", a.id, c.igsid, passo.id, { motivo: "fora_da_janela_24h" });
    return;
  }
  const recipient = commentId ? { comment_id: commentId } : { id: c.igsid };

  // Portão "siga para receber".
  if (passo.exigir_seguir) {
    await atualizarPerfil(sb, c);
    if (!c.segue && passo.texto_portao) {
      const ok = await enviarBruto(sb, a, c, passo.id, recipient, {
        text: preencher(passo.texto_portao, c).slice(0, 1000),
        quick_replies: [{ content_type: "text", title: (passo.botao_portao || "Já sigo").slice(0, 20), payload: payload(a.id, passo.id, "G") }],
      });
      if (ok) await log(sb, "portao", a.id, c.igsid, passo.id);
      return;
    }
  }

  await adicionarTags(sb, c, passo.tags);
  const ok = await enviarBruto(sb, a, c, passo.id, recipient, await montarMensagem(a, passo, c));
  if (!ok) return;

  if (passo.opcoes?.length) {
    // Com coletar, quem digitar em vez de clicar também é aceito.
    await salvar(sb, c, {
      aguardando: passo.coletar?.campo
        ? { tipo: "coletar", automacao_id: a.id, campo: passo.coletar.campo, proximo: passo.coletar.proximo ?? null, desde: new Date().toISOString(), lembretes: 0 }
        : null,
    });
    return; // a próxima ação vem do clique
  }
  if (passo.coletar?.campo) {
    await salvar(sb, c, { aguardando: { tipo: "coletar", automacao_id: a.id, campo: passo.coletar.campo, proximo: passo.coletar.proximo ?? null, desde: new Date().toISOString(), lembretes: 0 } });
    return;
  }
  if (passo.proximo) {
    if (commentId) {
      // Private reply: a Meta só deixa mandar a próxima depois que a pessoa responder.
      await salvar(sb, c, { aguardando: { tipo: "continuar", automacao_id: a.id, proximo: passo.proximo } });
      return;
    }
    await executarPasso(sb, a, c, passo.proximo, undefined, profundidade + 1);
  }
}

// ── Carregar automações ────────────────────────────────────

async function automacao(sb: AnyClient, id: string): Promise<Automacao | null> {
  const { data } = await sb.from("ig_automacoes").select("*").eq("id", id).maybeSingle();
  return data as Automacao | null;
}

async function ativas(sb: AnyClient, gatilho: Automacao["gatilho"]): Promise<Automacao[]> {
  const { data } = await sb.from("ig_automacoes").select("*").eq("ativo", true).eq("gatilho", gatilho).order("atualizado_em", { ascending: false });
  return (data ?? []) as Automacao[];
}

async function disparar(sb: AnyClient, a: Automacao, c: Contato, origem: Record<string, unknown>, commentId?: string) {
  await log(sb, "disparo", a.id, c.igsid, null, origem);
  const porta = origem.seguidor ? "seguidor" : a.gatilho;
  await marcarOrigem(sb, c, porta, { ...origem, automacao: a.nome });
  await executarPasso(sb, a, c, a.passos[0]?.id, commentId);
}

// ── Eventos ────────────────────────────────────────────────

export async function tratarComentario(sb: AnyClient, v: { id: string; text?: string; from?: { id: string; username?: string }; media?: { id: string }; parent_id?: string }) {
  if (!v.from?.id || v.from.id === IG_USER_ID) return; // resposta da própria conta
  const { error: dup } = await sb.from("ig_comentarios_processados").insert({ comment_id: v.id });
  if (dup) return; // a Meta reenviou

  const candidatas = (await ativas(sb, "comentario")).filter((a) =>
    (!a.midias.length || (v.media?.id && a.midias.includes(v.media.id))) && casaPalavra(v.text ?? "", a.palavras)
  );
  const a = candidatas[0];
  if (!a) return;

  const c = await contato(sb, v.from.id, v.from.username);
  if (bloqueado(c)) return;

  if (a.respostas_publicas.length) {
    const resposta = a.respostas_publicas[Math.floor(Math.random() * a.respostas_publicas.length)];
    const r = await graphPost(sb, `${v.id}/replies`, { message: preencher(resposta, c) });
    if (r.error) await log(sb, "erro", a.id, c.igsid, null, { resposta_publica: r.error });
  }
  let permalink: string | null = null;
  if (v.media?.id) {
    const m = await graphGet(sb, v.media.id, { fields: "permalink" });
    permalink = m.permalink ?? null;
  }
  await disparar(sb, a, c, { comentario: v.id, midia: v.media?.id, permalink, texto: v.text }, v.id);
}

// Os campos de_manychat e manychat_clique só vêm do leitor da caixa (ig-caixa): as conversas que o ManyChat
// abre não chegam no webhook, e a API de conversas não traz o payload do botão (30/10/2026).
export type Mensageria = {
  sender: { id: string; username?: string };
  recipient: { id: string };
  timestamp?: number;
  manychat_clique?: boolean;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    de_manychat?: boolean;
    quick_reply?: { payload: string };
    reply_to?: { story?: { id: string; url?: string } };
    referral?: { ref?: string; source?: string };
  };
  postback?: { payload: string; title?: string };
  referral?: { ref?: string; source?: string };
  read?: unknown;
  reaction?: unknown;
};

async function tratarEco(sb: AnyClient, m: Mensageria) {
  const mid = m.message!.mid;
  const igsid = m.recipient.id;
  // Nosso próprio envio pode ecoar antes de gravarmos o mid: espera um pouco.
  for (let i = 0; i < 3; i++) {
    const { data } = await sb.from("ig_enviadas").select("mid").eq("mid", mid).maybeSingle();
    if (data) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  // Mensagem que não saiu daqui: humano pelo app, ou o ManyChat.
  const { data: c } = await sb.from("ig_contatos").select("aguardando").eq("igsid", igsid).maybeSingle();
  const desde = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: mc } = await sb.from("ig_execucoes").select("id").eq("igsid", igsid).eq("tipo", "manychat").gte("criado_em", desde).limit(1);
  const ehRobo = !!m.message?.de_manychat || !!c?.aguardando || !!mc?.length;
  await guardarMensagem(sb, mid, igsid, "saida", ehRobo ? "manychat" : "humano", m.message?.text ?? null);
  // No meio de um fluxo nosso, ou logo depois de um clique no ManyChat, o eco é
  // robô (o "powered by" do ManyChat, por exemplo): não pausa.
  if (ehRobo) return;
  // Primeira mensagem do Miguel para um @ do garimpo: cria o contato já ligado ao lead
  await contato(sb, igsid).catch((e) => console.error("Error in contato (eco):", e));
  const ate = new Date(Date.now() + PAUSA_HUMANO_MS).toISOString();
  await sb.from("ig_contatos").upsert({ igsid, pausado_ate: ate }, { onConflict: "igsid" });
  await log(sb, "pausa", null, igsid, null, { mid, ate });
}

async function tratarEscolha(sb: AnyClient, c: Contato, p: string) {
  const [, autoId, passoId, idx] = p.split("|");
  const a = await automacao(sb, autoId);
  if (!a || !a.ativo) return;
  const passo = a.passos.find((x) => x.id === passoId);
  if (!passo) return;
  if (idx === "G") {
    await executarPasso(sb, a, c, passo.id);
    return;
  }
  const opcao = passo.opcoes?.[Number(idx)];
  if (!opcao) return;
  await log(sb, "opcao", a.id, c.igsid, passo.id, { opcao: opcao.titulo });
  await adicionarTags(sb, c, opcao.tag ? [opcao.tag] : []);
  if (passo.coletar?.campo) {
    await salvar(sb, c, { aguardando: null, campos: { ...c.campos, [passo.coletar.campo]: opcao.valor ?? opcao.titulo } });
    await log(sb, "coleta", a.id, c.igsid, passo.id, { campo: passo.coletar.campo });
    await atualizarLead(sb, c, a);
    await executarPasso(sb, a, c, opcao.proximo ?? passo.coletar.proximo);
    return;
  }
  await executarPasso(sb, a, c, opcao.proximo);
}

export async function tratarMensageria(sb: AnyClient, m: Mensageria) {
  if (m.read || m.reaction) return;
  if (m.message?.is_echo) return await tratarEco(sb, m);
  if (m.sender.id === IG_USER_ID) return;

  const c = await contato(sb, m.sender.id, m.sender.username);
  // A janela de 24h conta da hora da mensagem, que no leitor da caixa chega até 2 min atrasada
  await salvar(sb, c, { ultima_msg_em: new Date(m.timestamp ?? Date.now()).toISOString() });

  const texto = m.message?.text ?? "";
  if (m.message?.mid) await guardarMensagem(sb, m.message.mid, c.igsid, "entrada", "contato", texto || null, null, m.message.reply_to ?? null);

  if (texto && PALAVRAS_PARAR.includes(normalizar(texto))) {
    if (!c.optout) {
      await salvar(sb, c, { optout: true, aguardando: null });
      await log(sb, "optout", null, c.igsid);
    }
    return;
  }
  if (c.optout) return;
  // Conversa de prospecção é humana do começo ao fim: nenhuma automação responde
  if (c.tags.includes("Prospecção")) return await avisarMensagem(c, texto);

  // Escolha numa resposta rápida ou botão nosso. Payload de outra ferramenta
  // (ManyChat) não começa com CD| e é ignorado: o fluxo é dela.
  const escolha = m.message?.quick_reply?.payload ?? m.postback?.payload ?? (m.manychat_clique ? "MC" : undefined);
  if (escolha?.startsWith("CD|")) return await tratarEscolha(sb, c, escolha);
  if (escolha) {
    // Clique numa resposta rápida do ManyChat (a boas-vindas do novo seguidor
    // mora lá, porque só o ManyChat recebe o "começou a seguir"). Quem clica em
    // botão está falando com robô: tira a pausa e segue o fluxo pelo TEXTO do botão.
    await log(sb, "manychat", null, c.igsid, null, { texto });
    await salvar(sb, c, { pausado_ate: null, aguardando: null });
    if (!texto) return;
    const a = (await ativas(sb, "dm")).find((x) => x.palavras.length > 0 && casaPalavra(texto, x.palavras));
    if (a) return await disparar(sb, a, c, { texto, seguidor: true });
    return;
  }

  // Pausado = alguém do time está conversando pelo app
  if (bloqueado(c)) return await avisarMensagem(c, texto);

  // Conversa em andamento: resposta digitada ou continuação de private reply.
  if (c.aguardando && texto) {
    const ag = c.aguardando;
    const a = await automacao(sb, ag.automacao_id);
    await salvar(sb, c, { aguardando: null });
    if (a?.ativo) {
      if (ag.tipo === "coletar" && ag.campo) {
        if (["telefone", "whatsapp"].includes(ag.campo) && texto.replace(/\D/g, "").length < 10) {
          // Número curto demais: pede de novo uma vez, sem sair do passo.
          await salvar(sb, c, { aguardando: ag });
          await enviarBruto(sb, a, c, "telefone", { id: c.igsid }, { text: "Esse número parece incompleto. Pode mandar com o DDD?" });
          return;
        }
        await salvar(sb, c, { campos: { ...c.campos, [ag.campo]: texto.trim() } });
        await log(sb, "coleta", a.id, c.igsid, null, { campo: ag.campo });
        await atualizarLead(sb, c, a);
      }
      await executarPasso(sb, a, c, ag.proximo);
      return;
    }
  }

  // Gatilhos.
  const ref = m.referral?.ref ?? m.message?.referral?.ref;
  if (ref) {
    const a = (await ativas(sb, "ref")).find((x) => x.ref && normalizar(x.ref) === normalizar(ref));
    if (a) return await disparar(sb, a, c, { ref, source: m.referral?.source ?? m.message?.referral?.source });
  }
  if (m.message?.reply_to?.story) {
    const a = (await ativas(sb, "story")).find((x) => casaPalavra(texto, x.palavras));
    if (a) return await disparar(sb, a, c, { story: m.message.reply_to.story.id, texto });
    return await avisarMensagem(c, texto);
  }
  if (texto) {
    const a = (await ativas(sb, "dm")).find((x) => x.palavras.length > 0 && casaPalavra(texto, x.palavras));
    if (a) return await disparar(sb, a, c, { texto, palavra: texto });
  }
  // Nenhuma automação pegou: só gente responde
  if (m.message) await avisarMensagem(c, texto);
}

// ── Follow-up (07/11/2026, texto aprovado pelo Rodger) ─────────────────────
// Lead que parou no meio do fluxo (o robô espera nome, telefone ou faturamento) recebe até 3 lembretes,
// contados da hora em que o robô começou a esperar: 1 h, 6 h e 22 h. Só dentro da janela de 24 h da Meta
// (conta da última mensagem DELE). Respondeu, o fluxo segue e os lembretes param. Quem chama é o ig-caixa (2 min).
const LEMBRETES: { aposMs: number; texto: string }[] = [
  { aposMs: 1 * 3600_000, texto: "Opa, ainda tá por aí? Falta só {{falta}} pra eu te mandar o link." },
  { aposMs: 6 * 3600_000, texto: "Separei o seu aqui. Me manda {{falta}} e eu libero na hora." },
  { aposMs: 22 * 3600_000, texto: "Vou fechar sua solicitação hoje. Se ainda quiser, me manda {{falta}} até amanhã. Se não fizer mais sentido, me avisa que eu te tiro da lista." },
];
const FOLGA_JANELA_MS = 20 * 60_000;

function faltaDe(campo?: string): string {
  const n = normalizar(campo ?? "");
  if (/nome/.test(n)) return "seu nome";
  if (/telefone|whats|celular/.test(n)) return "seu telefone com DDD";
  if (/fatur/.test(n)) return "quanto você fatura hoje";
  return "a sua resposta";
}

export async function lembretes(sb: AnyClient) {
  const { data } = await sb.from("ig_contatos").select("*").not("aguardando", "is", null).eq("optout", false);
  let enviados = 0;
  for (const c of (data ?? []) as Contato[]) {
    try {
      const ag = c.aguardando;
      if (!ag || ag.tipo !== "coletar" || !ag.desde || bloqueado(c)) continue;
      if (c.tags?.includes("Prospecção")) continue;
      const n = ag.lembretes ?? 0;
      const l = LEMBRETES[n];
      if (!l || Date.now() - new Date(ag.desde).getTime() < l.aposMs) continue;
      if (!c.ultima_msg_em || Date.now() - new Date(c.ultima_msg_em).getTime() > JANELA_MS - FOLGA_JANELA_MS) continue;
      const a = await automacao(sb, ag.automacao_id);
      if (!a?.ativo) continue;
      // marca antes de mandar: rodada que cair no meio não manda o mesmo lembrete duas vezes
      await salvar(sb, c, { aguardando: { ...ag, lembretes: n + 1 } });
      const ok = await enviarBruto(sb, a, c, `lembrete-${n + 1}`, { id: c.igsid }, { text: preencher(l.texto.replaceAll("{{falta}}", faltaDe(ag.campo)), c) });
      if (ok) { enviados++; await log(sb, "lembrete", a.id, c.igsid, null, { numero: n + 1, campo: ag.campo }); }
    } catch (error) {
      console.error("Error in lembretes:", c.igsid, error);
    }
  }
  return { enviados };
}
