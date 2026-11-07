// Meta Conversions API — peça única para todo mundo que manda evento pro Meta.
//
// Nasceu em 06/09/2026 a partir do curso da Comunidade Growth Hackers (Allan
// Tracker) e da auditoria do nosso tracking. A regra de lá que vale aqui:
// "trackeamento é mandar os dados da pessoa para o Meta com identificação
// forte". Identificação forte = dados de usuário (e-mail, telefone, nome) NO
// FORMATO que o Meta espera + dados de navegação (fbc, fbp, IP, user agent,
// página) capturados quando a pessoa estava na página.
//
// Tudo que antes vivia espalhado em meta-capi, fire-capi-events, kommo-webhook
// e admin-data (cada um com a sua lista de faixas de MQL e o seu jeito de
// hashear) passa a usar isto.
//
// 06/09/2026 (noite) — confiabilidade (ver "Auditoria do Envio de Eventos para o Meta"
// no vault): toda tentativa vira linha em `capi_events_log`; o envio reserva
// (event_id, event_name) em `capi_event_claims` antes de mandar, porque o
// Meta NÃO desduplica dois eventos de servidor com o mesmo id; a marca no lead
// passa a ser merge atômico (`mark_capi_event`); erro de rede ou 5xx tenta de
// novo uma vez; e evento com mais de 7 dias é RECUSADO em vez de ter a data
// empurrada para "hoje menos 7", que era inventar um horário.

export const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID") || "2171667863227042";
export const META_API_VERSION = (Deno.env.get("META_API_VERSION") || "v21.0").toLowerCase();
export const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN") || "";
// Código do Test Events do Gerenciador de Eventos. Com ele setado, TODO evento
// aparece na aba de teste em tempo real, com a nota de correspondência. Setar
// só durante a validação e tirar depois: evento com test_event_code não conta
// para campanha.
export const META_TEST_EVENT_CODE = Deno.env.get("META_TEST_EVENT_CODE") || "";

/** O Meta recusa evento com mais de 7 dias. */
export const MAX_ATRASO_SEGUNDOS = 7 * 24 * 60 * 60;

// ── Regra única de MQL ──────────────────────────────────────────────────────
// Faturamento mensal declarado a partir de R$ 10 mil. Antes essa lista existia
// em quatro arquivos e as quatro divergiam (uma incluía "R$ 8k – 20k", outra
// usava faixas legadas "De R$ 50 mil a R$ 100 mil"). Fonte espelhada em
// src/pages/Quiz.tsx (MQL_FAIXAS); mudou lá, muda aqui.
export const MQL_FAIXAS = [
  "De R$ 10 mil a R$ 20 mil",
  "De R$ 20 mil a R$ 30 mil",
  "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil",
  "De R$ 75 mil a R$ 100 mil",
  "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil",
  "De R$ 200 mil a R$ 300 mil",
  "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil",
  "De R$ 750 mil a R$ 1 milhão",
  "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões",
  "De R$ 3 milhões a R$ 5 milhões",
  "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
  // Faixas legadas (formulário antigo), mantidas para leads antigos.
  "De R$ 50 mil a R$ 100 mil",
  "Mais de R$ 100 mil",
  "R$ 20k – 50k",
  "R$ 50k – 100k",
];

// Comparação tolerante: 3 leads no banco têm a faixa gravada com o encoding
// quebrado ("Acima de R$ 10 milhÃµes") e caíam fora da regra. Comparar só o
// esqueleto ASCII ignora acento certo, acento errado e espaço duplicado.
function esqueleto(v: string): string {
  return v.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
const MQL_ESQUELETOS = new Set(MQL_FAIXAS.map(esqueleto));

export function isMqlFaixa(faixa: string | null | undefined): boolean {
  return !!faixa && MQL_ESQUELETOS.has(esqueleto(faixa));
}

// Valor esperado de um MQL por faixa, em R$. Serve para o Meta otimizar por
// VALOR (item 34 do plano): um lead de R$ 300 mil/mês vale mais que um de
// R$ 12 mil, e sem isso o algoritmo trata os dois como iguais. É o ponto
// médio da faixa vezes uma taxa de fechamento conservadora, só como ordem de
// grandeza relativa — o Meta usa a proporção entre leads, não o número absoluto.
const TAXA_REFERENCIA = 0.03;

/**
 * Os valores de uma faixa, em reais, cada número com a SUA unidade.
 *
 * Até 12/09/2026 a escala era decidida uma vez só para a frase inteira e
 * aplicada à média dos números crus. Isso só dá certo quando os dois extremos
 * estão na mesma unidade. Em "De R$ 750 mil a R$ 1 milhão" a média saía de
 * (750 + 1) / 2 = 375,5 e recebia a escala de milhão: R$ 11.265.000 em vez de
 * R$ 26.250, 429 vezes mais. Das 20 faixas, era a única que misturava "mil" e
 * "milhão". Um evento MQL saiu com esse valor em 12/09/2026 às 15:30
 * (event_id f79a9eed-6dc9-4634-ae39-aec34596ef83_MQL) e permanece no dataset da
 * Meta como histórico conhecido.
 *
 * Aqui cada número leva a unidade escrita logo depois dele. Número sem unidade
 * própria herda a do próximo que tiver ("de 10 a 20 mil"); sem nenhuma, vale 1.
 * `milh` cobre milhão, milhões e o encoding quebrado "milhÃµes".
 */
function valoresDaFaixa(faixa: string): number[] {
  const achados = [...faixa.matchAll(/(\d+(?:[.,]\d+)?)\s*(milh|mil|k)?/gi)].map((m) => ({
    numero: Number(m[1].replace(",", ".")),
    unidade: (m[2] || "").toLowerCase(),
  }));
  const escala = (u: string) => (u === "milh" ? 1_000_000 : u === "mil" || u === "k" ? 1_000 : 1);
  return achados.map((a, i) => {
    const unidade = a.unidade || achados.slice(i + 1).find((b) => b.unidade)?.unidade || "";
    return a.numero * escala(unidade);
  });
}

export function valorEsperadoMql(faixa: string | null | undefined): number | undefined {
  if (!faixa || !isMqlFaixa(faixa)) return undefined;
  const valores = valoresDaFaixa(faixa);
  if (!valores.length) return undefined;
  const medio = valores.length >= 2 ? (valores[0] + valores[1]) / 2 : valores[0];
  return Math.round(medio * TAXA_REFERENCIA);
}

// ── Normalização (o que o Meta espera antes do hash) ────────────────────────
// https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters

export async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Minúsculo, sem acento, sem espaço nas pontas. Vale para nome, e-mail, cidade. */
export function normalizeText(v: string): string {
  return v.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

/**
 * Telefone: SÓ dígitos, com o DDI na frente e SEM "+". Era hasheado com "+55…"
 * e o Meta nunca casava. Aceita "(11) 93402-5412", "+55 11 …", "5511…".
 */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) digits = "55" + digits;
  return digits;
}

export interface Identidade {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  /** IDs próprios (lead_id, session_id). Mandados hasheados. */
  externalIds?: (string | null | undefined)[];
}

export interface Navegacao {
  fbc?: string | null;
  fbp?: string | null;
  /** fbclid cru, usado só se não houver `fbc` de verdade. */
  fbclid?: string | null;
  /** Instante do clique que gerou o fbclid, em ms. */
  fbcClickTime?: number | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function buildUserData(id: Identidade, nav: Navegacao): Promise<Record<string, unknown>> {
  const u: Record<string, unknown> = {};
  if (id.email) u.em = [await sha256(normalizeText(id.email))];
  if (id.phone) {
    const ph = normalizePhone(id.phone);
    if (ph.length >= 10) u.ph = [await sha256(ph)];
  }
  if (id.name) {
    const parts = normalizeText(id.name).split(/\s+/).filter(Boolean);
    if (parts.length) u.fn = [await sha256(parts[0])];
    if (parts.length > 1) u.ln = [await sha256(parts[parts.length - 1])];
  }
  if (id.city) u.ct = [await sha256(normalizeText(id.city).replace(/\s+/g, ""))];
  if (id.state) u.st = [await sha256(normalizeText(id.state).replace(/\s+/g, ""))];
  if (id.zip) u.zp = [await sha256(id.zip.replace(/\D/g, "").slice(0, 5))];
  u.country = [await sha256("br")];
  const ext = (id.externalIds || []).filter((x): x is string => !!x);
  if (ext.length) u.external_id = await Promise.all(ext.map((x) => sha256(x)));

  // Cookie de clique de verdade primeiro. Só cai na reconstrução pelo fbclid
  // quando o cookie não existe (bloqueio, navegador sem cookie). A reconstrução
  // exige um horário de clique conhecido: sem ele, não inventamos.
  if (nav.fbc && /^fb\.1\.\d+\.\S+$/.test(nav.fbc)) u.fbc = nav.fbc;
  else if (nav.fbclid && nav.fbcClickTime) u.fbc = `fb.1.${nav.fbcClickTime}.${nav.fbclid}`;
  if (nav.fbp && /^fb\.1\.\d+\.\d+$/.test(nav.fbp)) u.fbp = nav.fbp;
  if (nav.ip && nav.ip !== "unknown") u.client_ip_address = nav.ip;
  if (nav.userAgent) u.client_user_agent = nav.userAgent;
  return u;
}

/** Quais campos de identidade foram no evento (só presença, nunca o valor). Vai para o log. */
export function identityFlags(u: Record<string, unknown>): Record<string, boolean> {
  return {
    em: !!u.em, ph: !!u.ph, fn: !!u.fn, ln: !!u.ln, external_id: !!u.external_id,
    fbc: !!u.fbc, fbp: !!u.fbp, ip: !!u.client_ip_address, ua: !!u.client_user_agent,
  };
}

export interface EventoMeta {
  event_name: string;
  event_id: string;
  /** Segundos. Quando o fato aconteceu; mais de 7 dias é recusado. */
  event_time?: number | null;
  event_source_url?: string | null;
  /** `website` para o que nasce no navegador; `system_generated` para o que nasce no admin/CRM. */
  action_source?: "website" | "system_generated" | "app" | "chat" | "email" | "phone_call" | "physical_store" | "other";
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
}

/**
 * Horário do evento. Sem pedido = agora. Pedido no futuro = agora. Pedido com
 * mais de 7 dias = `null` (o chamador recusa e registra; antes a data era
 * empurrada para "agora menos 7 dias", que é um horário que não aconteceu).
 */
export function resolveEventTime(pedido?: number | null): number | null {
  const agora = Math.floor(Date.now() / 1000);
  if (!pedido || pedido <= 0) return agora;
  const t = Math.floor(pedido);
  if (t > agora) return agora;
  if (t < agora - MAX_ATRASO_SEGUNDOS) return null;
  return t;
}

/** @deprecated Mantido para quem ainda importa; prefira `resolveEventTime`. */
export function clampEventTime(pedido?: number | null): number {
  return resolveEventTime(pedido) ?? Math.floor(Date.now() / 1000);
}

export interface ResultadoEnvio {
  success: boolean;
  status: number;
  response?: unknown;
  error?: string;
  /** Recusado aqui, antes de chamar o Meta (ex.: event_time > 7 dias). */
  rejected?: boolean;
  events_received?: number | null;
  fbtrace_id?: string | null;
  attempts: number;
  /** O body enviado, sem user_data (para o log). */
  request?: Record<string, unknown>[];
}

function extrairResposta(json: unknown): { events_received: number | null; fbtrace_id: string | null } {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const er = typeof j.events_received === "number" ? j.events_received : null;
  const err = j.error && typeof j.error === "object" ? (j.error as Record<string, unknown>) : null;
  const fb = (typeof j.fbtrace_id === "string" ? j.fbtrace_id : null) || (err && typeof err.fbtrace_id === "string" ? err.fbtrace_id : null);
  return { events_received: er, fbtrace_id: fb };
}

export async function sendMetaEvents(
  eventos: EventoMeta[],
  opts: { testEventCode?: string | null } = {},
): Promise<ResultadoEnvio> {
  if (!META_ACCESS_TOKEN) return { success: false, status: 0, error: "META_ACCESS_TOKEN not configured", attempts: 0 };

  const data: Record<string, unknown>[] = [];
  for (const e of eventos) {
    const t = resolveEventTime(e.event_time);
    if (t == null) {
      return {
        success: false, status: 0, rejected: true, attempts: 0,
        error: `event_time_too_old: ${e.event_name} ${e.event_id} tem mais de 7 dias; o Meta recusa e não empurramos a data`,
      };
    }
    const actionSource = e.action_source || "website";
    const row: Record<string, unknown> = {
      event_name: e.event_name,
      event_id: e.event_id,
      event_time: t,
      action_source: actionSource,
      user_data: e.user_data,
    };
    // URL só quando existe de verdade ou quando o evento nasceu no navegador
    // (o Meta exige nesse caso). Venda ou reunião lançada no admin não tem
    // página, e mandar uma URL de obrigado seria inventar onde aconteceu.
    if (e.event_source_url) row.event_source_url = e.event_source_url;
    else if (actionSource === "website") row.event_source_url = "https://www.championadstudio.com";
    if (e.custom_data && Object.keys(e.custom_data).length) row.custom_data = e.custom_data;
    data.push(row);
  }
  const body: Record<string, unknown> = { data };
  const code = opts.testEventCode ?? META_TEST_EVENT_CODE;
  if (code) body.test_event_code = code;
  const request = data.map(({ user_data: _u, ...resto }) => resto);

  const url = `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`;
  const rotulo = data.map((d) => d.event_name + ":" + d.event_id).join(",");

  // Uma tentativa extra só para o que pode ser passageiro: rede e 5xx. Erro
  // 4xx é do nosso payload ou do token e repetir não muda nada.
  let ultimo: ResultadoEnvio = { success: false, status: 0, error: "not sent", attempts: 0, request };
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      const { events_received, fbtrace_id } = extrairResposta(json);
      if (res.ok) {
        console.log("[meta] CAPI ok", rotulo, JSON.stringify(json));
        return { success: true, status: res.status, response: json, events_received, fbtrace_id, attempts: tentativa, request };
      }
      const err = (json as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
      const msg = err && typeof err.message === "string" ? err.message : `Meta API ${res.status}`;
      console.error("[meta] CAPI error", res.status, rotulo, JSON.stringify(json));
      ultimo = { success: false, status: res.status, response: json, error: msg, events_received, fbtrace_id, attempts: tentativa, request };
      if (res.status < 500) break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[meta] CAPI network error", rotulo, msg);
      ultimo = { success: false, status: 0, error: `network: ${msg}`, attempts: tentativa, request };
    }
    if (tentativa === 1) await new Promise((r) => setTimeout(r, 800));
  }
  return ultimo;
}

/** Chave estável por FATO para o mapa `leads.capi_events_sent`. */
export function capiKey(evento: string, id?: string | null): string {
  return id ? `${evento}:${id}` : evento;
}

// ── Rastreabilidade e dedup no banco ────────────────────────────────────────
// Tudo aqui é best effort e tolera o banco ainda sem a migration de 06/09 (noite):
// se a tabela não existe, avisa uma vez e segue com o comportamento antigo.

// deno-lint-ignore no-explicit-any
type Cliente = any;

export type CapiStatus = "sent" | "failed" | "rejected" | "deduplicated" | "skipped";

export interface LinhaLog {
  lead_id?: string | null;
  event_name: string;
  event_id: string;
  caller?: string | null;
  action_source?: string | null;
  status: CapiStatus;
  http_status?: number | null;
  events_received?: number | null;
  fbtrace_id?: string | null;
  error_message?: string | null;
  meta_response?: unknown;
  request?: unknown;
  identity?: Record<string, boolean> | null;
  test_event_code?: string | null;
  attempt?: number;
  retry_of?: string | null;
}

let avisouSemLog = false;
let avisouSemClaims = false;

function tabelaAusente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache|does not exist/i.test(error.message || "");
}

/** Grava uma tentativa em `capi_events_log`. Devolve o id da linha, ou null. */
export async function registrarLog(supabase: Cliente, linha: LinhaLog): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("capi_events_log")
      .insert({
        lead_id: linha.lead_id ?? null,
        event_name: linha.event_name,
        event_id: linha.event_id,
        caller: linha.caller || "unknown",
        action_source: linha.action_source ?? null,
        status: linha.status,
        http_status: linha.http_status ?? null,
        events_received: linha.events_received ?? null,
        fbtrace_id: linha.fbtrace_id ?? null,
        error_message: linha.error_message ? String(linha.error_message).slice(0, 1000) : null,
        meta_response: linha.meta_response ?? null,
        request: linha.request ?? null,
        identity: linha.identity ?? null,
        test_event_code: linha.test_event_code || null,
        attempt: linha.attempt ?? 1,
        retry_of: linha.retry_of ?? null,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      if (tabelaAusente(error)) {
        if (!avisouSemLog) { avisouSemLog = true; console.warn("[meta] capi_events_log não existe; aplique a migration 20260906200000"); }
      } else {
        console.error("[meta] falha ao gravar capi_events_log:", error.message);
      }
      return null;
    }
    return (data?.id as string) || null;
  } catch (e) {
    console.error("[meta] falha ao gravar capi_events_log:", e instanceof Error ? e.message : e);
    return null;
  }
}

export type Reserva = "ok" | "duplicado" | "indisponivel";

/**
 * Reserva (event_id, event_name) antes de enviar. Quem perde a inserção NÃO
 * envia: é o único jeito de segurar a corrida entre front, gatilho e kommo,
 * porque o Meta não desduplica dois eventos de servidor com o mesmo id.
 */
export async function reservarEvento(
  supabase: Cliente,
  r: { event_id: string; event_name: string; lead_id?: string | null; caller?: string | null },
): Promise<Reserva> {
  try {
    const { data, error } = await supabase
      .from("capi_event_claims")
      .upsert(
        { event_id: r.event_id, event_name: r.event_name, lead_id: r.lead_id ?? null, caller: r.caller || "unknown" },
        { onConflict: "event_id,event_name", ignoreDuplicates: true },
      )
      .select("event_id");
    if (error) {
      if (tabelaAusente(error)) {
        if (!avisouSemClaims) { avisouSemClaims = true; console.warn("[meta] capi_event_claims não existe; enviando sem reserva"); }
      } else {
        console.error("[meta] falha ao reservar evento:", error.message);
      }
      return "indisponivel";
    }
    return Array.isArray(data) && data.length > 0 ? "ok" : "duplicado";
  } catch (e) {
    console.error("[meta] falha ao reservar evento:", e instanceof Error ? e.message : e);
    return "indisponivel";
  }
}

export async function confirmarReserva(supabase: Cliente, event_id: string, event_name: string): Promise<void> {
  try {
    await supabase.from("capi_event_claims").update({ sent_at: new Date().toISOString() }).match({ event_id, event_name });
  } catch { /* best effort */ }
}

/** Solta a reserva de um envio que falhou, para o retry poder reenviar. */
export async function liberarReserva(supabase: Cliente, event_id: string, event_name: string): Promise<void> {
  try {
    await supabase.from("capi_event_claims").delete().match({ event_id, event_name });
  } catch { /* best effort */ }
}

/**
 * Marca chaves em `leads.capi_events_sent` com merge atômico. Se a RPC ainda
 * não existir, cai no ler-e-gravar antigo (que perde marcas concorrentes, mas
 * é melhor do que não marcar).
 */
export async function marcarNoLead(supabase: Cliente, leadId: string | null | undefined, chaves: string[]): Promise<void> {
  if (!leadId) return;
  const keys = chaves.filter((k) => !!k);
  if (!keys.length) return;
  try {
    const { error } = await supabase.rpc("mark_capi_event", { p_lead_id: leadId, p_keys: keys });
    if (!error) return;
    console.warn("[meta] mark_capi_event indisponível, usando fallback:", error.message);
  } catch (e) {
    console.warn("[meta] mark_capi_event indisponível, usando fallback:", e instanceof Error ? e.message : e);
  }
  try {
    const { data } = await supabase.from("leads").select("capi_events_sent").eq("id", leadId).maybeSingle();
    const atual = ((data?.capi_events_sent as Record<string, boolean> | null) || {});
    for (const k of keys) atual[k] = true;
    await supabase.from("leads").update({ capi_events_sent: atual }).eq("id", leadId);
  } catch (e) {
    console.error("[meta] falha ao marcar capi_events_sent:", e instanceof Error ? e.message : e);
  }
}
