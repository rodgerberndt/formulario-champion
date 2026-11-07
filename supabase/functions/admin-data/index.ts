import { createClient } from "jsr:@supabase/supabase-js@2";
// redeploy: include revenue_assessoria_received/to_receive in totals
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";
import { buildCommercialGoals } from "./commercial.ts";
import { resolveLeadAttribution, isUsableUtm } from "./attribution.ts";
import { buildLeadJourney, resolveHeadlineByLead } from "./lead_journey.ts";
import { calcularNotaPorVersao, calcularNotaFormulario, type EntradaNota } from "./leadScore.ts";
import { ehHighQualityLead, LIMIARES_HQL, SCORE_VERSION_QUIZ } from "../_shared/hql.ts";
import { isRealizada, jaAconteceu, pendenteDeMarcacao, statusDaReuniao, ORIGENS_VALIDAS, ROTULO_ORIGEM, faltasNoAbobora, conflitoDeAgenda, mensagemDeConflito, INTERVALO_MINIMO_HORAS } from "./meetings.ts";
import { analisarCall } from "./analise_call.ts";
import { rotasCrm, leadsComHistoricoComercial } from "./crm.ts";
import { montarDesempenho, ehMqlDoPainel } from "./contas_desempenho.ts";
import {
  FUSO_PADRAO_CONTA,
  acumularNota,
  diaNoFuso,
  diagnosticarFusos,
  ehIdNumerico,
  fecharNotas,
  montarIndiceDeAnuncios,
  normalizarChaveCriativo,
  novaNotaPorVersao,
  offsetDoFiltro,
  resolverIdentidade,
  sanitizarIdentificador,
  versaoDoScore,
  type IdentidadeDaLinha,
  type IndiceDeAnuncios,
  type NotasPorVersao,
} from "./identidade_criativo.ts";
import { apagarEventoDaReuniao, sincronizarReuniao } from "../_shared/google-calendar.ts";
import { LINHAS, progresso, realizado, semanasDoMes, dataBr, metaDoIntervalo, mesesDoIntervalo, metaAcumuladaAte, metaNoIntervaloDoMes, metaEsperadaAgora, fracaoDoDiaBr } from "./metas.ts";
import { isMqlFaixa, valorEsperadoMql, capiKey, marcarNoLead, MAX_ATRASO_SEGUNDOS } from "../_shared/meta.ts";

/**
 * Cabeçalhos e corpo padrão para chamar o meta-capi de dentro do admin. O
 * `caller` vai para `capi_events_log`, para separar o que o painel disparou
 * do que veio do front, do gatilho, do Kommo ou dos reenvios retroativos.
 */
function chamarMetaCapi(body: Record<string, unknown>, caller: string): Promise<Response> {
  return fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/meta-capi`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") || "",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
    },
    body: JSON.stringify({ caller, ...body }),
  });
}

/** Valor do closer quando a call foi em dupla (CLOSER_DUPLA no CreativesTab). */
const CLOSER_DUPLA_HUB = "Caio e Rodger";

/**
 * Cria o cliente da venda no Hub (championflow-hub, POST /api/public/venda-cliente).
 * Sprint nasce na Etapa 1; Assessoria nasce sem copy e com o acesso ao portal
 * enviado. E-mail que já é cliente no Hub não cria nada. Nunca lança: devolve
 * { ok: false, erro } para a venda seguir gravada mesmo com o Hub fora.
 */
async function criarClienteNoHub(venda: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = Deno.env.get("HUB_VENDA_URL") || "https://hub.assessoriachampion.com/api/public/venda-cliente";
  const chave = Deno.env.get("HUB_VENDA_CHAVE");
  if (!chave) return { ok: false, erro: "HUB_VENDA_CHAVE não configurada" };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-venda-chave": chave },
      body: JSON.stringify(venda),
      signal: AbortSignal.timeout(20000),
    });
    const texto = await r.text();
    let corpo: Record<string, unknown>;
    try { corpo = JSON.parse(texto); } catch { corpo = { ok: false, erro: `Hub respondeu ${r.status}: ${texto.slice(0, 200)}` }; }
    if (!r.ok && corpo.ok !== false) corpo = { ok: false, erro: `Hub respondeu ${r.status}` };
    console.log(`Hub venda-cliente ${venda.sale_id}: ${r.status} ${texto.slice(0, 300)}`);
    return corpo;
  } catch (e) {
    return { ok: false, erro: `Hub fora do ar: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Hora da call em segundos, se ela já aconteceu e está dentro da janela de 7
 * dias do Meta. Fora disso devolve `undefined` e o evento sai com a hora do
 * envio, que é quando o closer marcou — nunca uma data inventada.
 */
function horaDaCallSeconds(scheduledAt?: string | null): number | undefined {
  if (!scheduledAt) return undefined;
  const t = Date.parse(scheduledAt);
  if (!Number.isFinite(t)) return undefined;
  const s = Math.floor(t / 1000);
  const agora = Math.floor(Date.now() / 1000);
  if (s > agora || s < agora - MAX_ATRASO_SEGUNDOS) return undefined;
  return s;
}

/**
 * A data da venda em segundos, para o `event_time` da CAPI.
 *
 * `sale_date` guarda só a data; o meio-dia UTC evita que a venda caia no dia
 * anterior em fuso negativo. Sem data válida devolve `undefined`, e o meta-capi
 * usa o horário do envio.
 */
function saleDateSeconds(d?: string | null): number | undefined {
  if (!d) return undefined;
  const t = Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

// build: qualified_count v2 (≥R$5k)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  // Required for CORS preflight on non-simple methods (e.g. PUT)
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

// Páginas de entrada da landing — a original e as variantes de headline em
// teste. Espelha src/config/headlineVariants.ts. Todo endpoint que aceita
// ?page= valida contra esta lista antes de filtrar por first_page.
// Inclui as variantes do teste de subheadline (SH0..SH5), que rodam sobre a
// headline HD3. Espelha src/config/headlineVariants.ts e subheadlineVariants.ts.
const LANDING_PATHS = [
  "/", "/HD0", "/HD1", "/HD2", "/HD3", "/HD4",
  "/SH0", "/SH1", "/SH2", "/SH3", "/SH4", "/SH5", "/SH6",
];

/** Página pedida no filtro global do admin, ou null quando é "todas". */
function parsePageFilter(url: URL): string | null {
  const p = url.searchParams.get("page");
  if (!p || p === "all") return null;
  return LANDING_PATHS.includes(p) ? p : null;
}

/**
 * UTM como o anunciante escreveu.
 *
 * Parte do tráfego chega com a query string ainda codificada
 * ("Luis-Nathan+Case+%232+-+V3"), então o MESMO criativo aparecia como dois
 * nomes diferentes nos relatórios e cada um levava um pedaço das sessões.
 */
function normalizeUtm(value: string | null | undefined): string {
  if (!value) return "";
  // Só decodifica quando ainda HÁ percent-encoding: os nomes de campanha usam
  // "+" de verdade ("Ads validados + HD0"), e trocar todo "+" por espaço sem
  // esse cuidado destruiria o nome de quem já chegou decodificado.
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value.trim();
  try {
    return decodeURIComponent(value.replace(/\+/g, " ")).trim();
  } catch {
    return value.replace(/\+/g, " ").trim();
  }
}

/**
 * Filtro de criativo do admin. Formatos aceitos:
 *   all                        → sem filtro
 *   one:<utm_content>          → um criativo exato
 *   group:<prefixo>            → todas as variações de um criativo
 *                                ("Luis-Nathan Case #2" pega o " - V3" e o " - C1")
 *
 * Existe pro teste de headline ficar com UMA variável só: sem isso a página
 * original recebia criativos que as variantes não recebiam, e a comparação
 * media criativo + headline juntos.
 */
function parseCreativeFilter(url: URL): ((utmContent: string | null) => boolean) | null {
  const raw = url.searchParams.get("creative");
  if (!raw || raw === "all") return null;
  const [kind, ...rest] = raw.split(":");
  const target = normalizeUtm(rest.join(":")).toLowerCase();
  if (!target) return null;
  if (kind === "group") {
    return (c) => normalizeUtm(c).toLowerCase().startsWith(target);
  }
  return (c) => normalizeUtm(c).toLowerCase() === target;
}

/**
 * Seções da landing na ordem da página (espelha src/pages/Index.tsx).
 *
 * O funil precisa dessa lista pra mostrar TODAS as seções, inclusive as que
 * ninguém alcançou no período. Antes ele listava só as seções com registro, e
 * uma seção sem nenhum visitante simplesmente sumia da tela — o que fazia a
 * última seção sobrevivente parecer o ponto de abandono.
 */
// Espelha LANDING_SECTIONS em src/config/landingSections.ts e a ordem real de
// src/pages/Index.tsx. Cada `order` é ÚNICO: com `social_proof` e
// `success_cases` empatados em 20 (até 17/09/2026) o desempate ficava por conta
// da ordem de inserção do Map e a lista saía em ordens diferentes entre
// aberturas. `social_proof` saiu da página e por isso saiu daqui — seção sem
// render entrava com 0 e parecia queda de leitura.
const LANDING_SECTIONS: { id: string; order: number }[] = [
  { id: "hero", order: 10 },
  { id: "success_cases", order: 20 },
  { id: "dor", order: 30 },
  { id: "metodo", order: 40 },
  { id: "social_proof", order: 50 },
  { id: "criativos", order: 60 },
  { id: "cta_intermediario", order: 70 },
  { id: "como_funciona", order: 80 },
  { id: "faq", order: 90 },
  { id: "cta_final", order: 100 },
];

// ── Cadastro de contas de anúncio: lido uma vez por isolate ─────────────────
//
// `meta_ad_accounts` tem uma linha por conta e muda quando se abre uma conta
// nova — mês sim, mês não. Mesmo assim era consultada em TODO carregamento da
// lista de leads: 232 ms medidos em 18/09/2026, atravessando o continente até
// us-west-2 para buscar meia dúzia de nomes que não mudaram.
//
// O isolate da edge function sobrevive entre requisições, então guardar aqui
// faz a segunda requisição em diante não pagar nada. Cinco minutos é curto o
// bastante para uma conta nova aparecer sozinha e longo o bastante para cobrir
// uma sessão inteira de uso do painel.
const CONTAS_TTL_MS = 5 * 60_000;
let contasCache: { em: number; mapa: Map<string, string> } | null = null;

async function lerContasDeAnuncio(supabase: any): Promise<Map<string, string>> {
  if (contasCache && Date.now() - contasCache.em < CONTAS_TTL_MS) return contasCache.mapa;
  const { data } = await supabase.from("meta_ad_accounts").select("ad_account_id, account_name");
  const mapa = new Map<string, string>();
  (data || []).forEach((c: any) => mapa.set(c.ad_account_id, c.account_name));
  // Só guarda o que veio de verdade: uma falha de rede não pode congelar um
  // mapa vazio pelos próximos cinco minutos.
  if (data) contasCache = { em: Date.now(), mapa };
  return mapa;
}

// ── O que a lista de leads NÃO precisa mandar para o navegador ──────────────
//
// `select("*")` devolve as 75 colunas de `leads`. Quatorze delas o painel nunca
// menciona — nem na lista, nem no detalhe, nem na aba de relatórios, nem na
// exportação: são bastidores de integração (Kommo), de disparo (CAPI, SLA) e o
// detalhamento do score, que é gravado pelo formulário e lido por ninguém.
// Medido em 18/09/2026: 78 KB por carregamento, jogados fora ao chegar.
//
// É lista de EXCLUSÃO, e não de inclusão, de propósito: com uma lista de
// inclusão, toda coluna nova nasceria invisível no painel até alguém lembrar de
// adicioná-la aqui — o tipo de bug que não dá erro, só um campo vazio na tela.
// Assim o padrão é aparecer, e esconder é que exige uma decisão explícita.
const COLUNAS_FORA_DA_LISTA = new Set([
  "score_breakdown", "score_calculated_at",   // gravados pelo quiz, lidos por ninguém
  "capi_events_sent",                          // controle de disparo da Meta
  "kommo_status", "kommo_retry_count", "kommo_contact_id", "kommo_lead_id",
  "last_kommo_error", "kommo_synced_at",       // integração aposentada
  "sla_stage", "sla_last_notified_at", "sla_owner",
  "instagram_follow_dispatched_at", "perdido_at",
]);

function enxugarParaALista<T>(linhas: T[]): T[] {
  return linhas.map((l) => {
    const limpo: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(l as Record<string, unknown>)) {
      if (!COLUNAS_FORA_DA_LISTA.has(k)) limpo[k] = v;
    }
    return limpo as T;
  });
}

/**
 * Quebra uma lista de ids em lotes e dispara TODOS de uma vez.
 *
 * O padrão que este helper substitui era `for (...) { await consulta }`: cada
 * lote esperava o anterior voltar de us-west-2, ~250 ms por volta. Em /creatives
 * isso aparecia três vezes seguidas e a rota chegou a 12,3 s em produção
 * (18/09/2026, com o filtro em "Máximo"). Os lotes nunca dependeram uns dos
 * outros — só estavam em fila por causa do `await` dentro do laço.
 */
async function emLotes<T>(
  valores: string[],
  tamanho: number,
  consulta: (lote: string[]) => Promise<{ data: T[] | null }>,
): Promise<T[]> {
  if (!valores.length) return [];
  const lotes: string[][] = [];
  for (let i = 0; i < valores.length; i += tamanho) lotes.push(valores.slice(i, i + tamanho));
  const partes = await Promise.all(lotes.map((l) => consulta(l)));
  return partes.flatMap((p) => p.data || []);
}

async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const jwtSecret = Deno.env.get("ADMIN_JWT_SECRET");
    if (!jwtSecret) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const payload = await verify(token, key);
    return payload.role === "admin";
  } catch {
    return false;
  }
}

// Resolve nome real de anúncio/criativo pra uma lista de ad_ids numéricos do Meta
// (mesma lógica já usada em /leads, extraída aqui pra reaproveitar em /creatives).
// Ordem de prioridade: meta_ads_cache.creative_name (nome real do criativo, via
// Graph API) > ad_spend.ad_name / meta_ads_cache.ad_name > null (chamador decide
// o fallback, geralmente o próprio raw ID).
async function resolveCreativeNames(
  supabase: any,
  adIds: string[]
): Promise<Map<string, { ad_name: string | null; campaign_name: string | null; creative_name: string | null; creative_thumbnail_url: string | null }>> {
  const result = new Map<string, { ad_name: string | null; campaign_name: string | null; creative_name: string | null; creative_thumbnail_url: string | null }>();
  if (adIds.length === 0) return result;

  const [{ data: adRows }, { data: cacheRows }] = await Promise.all([
    supabase.from("ad_spend").select("ad_id, ad_name, campaign_name").in("ad_id", adIds).not("ad_name", "is", null),
    supabase.from("meta_ads_cache").select("ad_id, ad_name, campaign_name, creative_name, creative_thumbnail_url, last_synced_at").in("ad_id", adIds),
  ]);

  (adRows || []).forEach((r: any) => {
    if (!result.has(r.ad_id)) {
      result.set(r.ad_id, { ad_name: r.ad_name, campaign_name: r.campaign_name, creative_name: null, creative_thumbnail_url: null });
    }
  });

  const cacheByAdId = new Map<string, any>();
  (cacheRows || []).forEach((r: any) => {
    cacheByAdId.set(r.ad_id, r);
    const existing = result.get(r.ad_id);
    result.set(r.ad_id, {
      ad_name: existing?.ad_name || r.ad_name || null,
      campaign_name: existing?.campaign_name || r.campaign_name || null,
      creative_name: r.creative_name || null,
      creative_thumbnail_url: r.creative_thumbnail_url || null,
    });
  });

  const nowMs = Date.now();
  const isFresh = (r: any) => !!r && !!r.creative_name && (nowMs - new Date(r.last_synced_at).getTime()) < 24 * 60 * 60 * 1000;
  const idsToFetchLive = adIds.filter((id) => !isFresh(cacheByAdId.get(id))).slice(0, 30);

  const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN");
  if (metaAccessToken && idsToFetchLive.length > 0) {
    const metaApiVersion = "v21.0";
    const resolved = await Promise.all(idsToFetchLive.map(async (adId) => {
      try {
        const res = await fetch(
          `https://graph.facebook.com/${metaApiVersion}/${adId}?fields=id,name,campaign{id,name},creative{name,thumbnail_url}&access_token=${metaAccessToken}`
        );
        if (!res.ok) return null;
        const json: any = await res.json();
        if (!json.name && !json.campaign?.name && !json.creative?.name) return null;
        return {
          ad_id: adId,
          ad_name: json.name || null,
          campaign_name: json.campaign?.name || null,
          creative_name: json.creative?.name || null,
          creative_thumbnail_url: json.creative?.thumbnail_url || null,
        };
      } catch {
        return null;
      }
    }));

    const freshlyResolved = resolved.filter((r: any) => r !== null) as any[];
    if (freshlyResolved.length > 0) {
      await supabase.from("meta_ads_cache").upsert(
        freshlyResolved.map((r) => ({
          ad_id: r.ad_id,
          ad_name: r.ad_name,
          campaign_name: r.campaign_name,
          creative_name: r.creative_name,
          creative_thumbnail_url: r.creative_thumbnail_url,
          last_synced_at: new Date().toISOString(),
        })),
        { onConflict: "ad_id" }
      );
      freshlyResolved.forEach((r) => {
        const existing = result.get(r.ad_id);
        result.set(r.ad_id, {
          ad_name: r.ad_name || existing?.ad_name || null,
          campaign_name: r.campaign_name || existing?.campaign_name || null,
          creative_name: r.creative_name || existing?.creative_name || null,
          creative_thumbnail_url: r.creative_thumbnail_url || existing?.creative_thumbnail_url || null,
        });
      });
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get admin token from header
    const adminToken = req.headers.get("x-admin-token");
    
    if (!adminToken) {
      return new Response(
        JSON.stringify({ error: "Token não fornecido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isValid = await verifyAdminToken(adminToken);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Token inválido ou expirado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const rawPath = url.pathname;
    // Handle both direct invocation and proxy paths
    const path = rawPath.includes("/admin-data") 
      ? rawPath.substring(rawPath.indexOf("/admin-data") + "/admin-data".length)
      : rawPath;
    
    console.log("Request path:", rawPath, "->", path);

    // ── CRM (Etapa 2) ──────────────────────────────────────────────────────
    // Vive em `crm.ts` porque este arquivo já tem 5.5 mil linhas. Devolve
    // `null` quando o caminho não é do CRM, e a cascata abaixo segue intacta.
    const respostaCrm = await rotasCrm(req, url, path, supabase, corsHeaders);
    if (respostaCrm) return respostaCrm;

    // GET /leads - List leads from legacy table
    if (path === "/leads" && req.method === "GET") {
      const search = url.searchParams.get("q");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");

      // ── Modo resumo: só para o vigia de notificações ─────────────────────
      //
      // `useLeadNotifications` pergunta "chegou alguém novo?" a cada 15 s. Até
      // 18/09/2026 ele fazia isso pedindo a LISTA INTEIRA — e a lista inteira
      // significa resolver atribuição (uma RPC), nomes de campanha e anúncio
      // (duas consultas), o cache de criativos da Meta e o cadastro de contas.
      // Medido em produção: 1.080 ms por rodada, quatro vezes por minuto, 240
      // vezes por hora, para comparar um punhado de ids.
      //
      // Pior que o custo: essas rodadas ocupavam as quatro vagas do pool de
      // requisições do painel. Quem clicasse numa aba no instante errado ficava
      // atrás de uma consulta que ninguém pediu — e sentia isso como lentidão.
      //
      // Aqui devolve-se exatamente os oito campos que a notificação usa
      // (`NewLead` em useLeadNotifications.tsx), sem enriquecimento nenhum: uma
      // ida ao banco e pronto. Quem quiser a lista de verdade não passa
      // `resumo`, e nada muda.
      if (url.searchParams.get("resumo") === "1") {
        let resumoQuery = supabase
          .from("leads")
          .select("id, nome_completo, whatsapp, estagio_negocio, mercado, tier, investimento_faixa, created_at")
          .order("created_at", { ascending: false })
          .limit(500);
        if (from) resumoQuery = resumoQuery.gte("created_at", from);
        if (to) resumoQuery = resumoQuery.lte("created_at", to.includes("T") ? to : to + "T23:59:59.999Z");
        const { data: resumo, error: erroResumo } = await resumoQuery;
        if (erroResumo) throw erroResumo;
        return new Response(
          JSON.stringify(resumo || []),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      let query = supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);

      // Apply date filters — supports both ISO timestamps and date-only strings.
      // `toEnd` fica FORA do if de propósito: a resolução de origem, mais
      // abaixo, precisa da mesma borda de período para alargar a janela de
      // busca dos submits. Declarada dentro do bloco, ela tinha escopo de
      // bloco e a rota inteira estourava ReferenceError.
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;

      // Busca por id, IGNORANDO o período.
      //
      // A fila comercial é global no tempo (um lead que faltou à call em julho
      // continua precisando de ação hoje), mas esta rota sempre foi filtrada
      // pelo período do cabeçalho. O painel abria o detalhe procurando o lead na
      // lista já carregada — e quando o lead da fila estava fora do período, ele
      // simplesmente não estava lá e o clique não fazia nada.
      //
      // Buscar por id aqui, em vez de criar uma rota nova, é o que faz o modal
      // continuar recebendo o MESMO objeto enriquecido (campanha, criativo e
      // método de atribuição resolvidos mais abaixo). Uma rota separada
      // devolveria a linha crua e o modal passaria a mostrar id em vez de nome.
      const idsParam = (url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (idsParam.length > 0) {
        query = query.in("id", idsParam.slice(0, 100));
      } else {
        if (from) {
          query = query.gte("created_at", from);
        }
        if (toEnd) {
          query = query.lte("created_at", toEnd);
        }
      }

      if (search) {
        query = query.or(`nome_completo.ilike.%${search}%,whatsapp.ilike.%${search}%,instagram.ilike.%${search}%,mercado.ilike.%${search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // ── Origem de cada lead: campanha, criativo e variante da página ──────
      //
      // A lista precisa mostrar de onde o lead veio, e isso mora na SESSÃO, não
      // na tabela `leads`: o utm_content só chega junto do lead quando o link
      // trouxe o parâmetro, e a página de entrada (a variante do teste A/B)
      // nunca chega — `leads` não tem essa coluna.
      //
      // `entry_page` é resolvido para TODOS os leads, não só para os que estão
      // sem criativo: a variante da página é informação de teste e vale mesmo
      // para quem entrou sem anúncio nenhum (é justamente como se separa o
      // orgânico da variante que a verba pagou).
      if (data?.length) {
        // ── A janela da atribuição ─────────────────────────────────────────
        //
        // Ela sempre veio do filtro de data da REQUISIÇÃO. Isso funciona para a
        // lista, que é filtrada por período — mas na busca por `ids` não há
        // período nenhum, e a janela ficava aberta: o casamento por submit
        // varria `lead_events` INTEIRA para resolver a origem de um único lead.
        //
        // Medido em 08/09/2026: buscar 1 lead de julho custava 1,5–2,1 s,
        // enquanto buscar os 52 leads de um dia custava 0,6 s. O custo não era o
        // número de leads; era a janela.
        //
        // Com `ids`, a janela passa a ser derivada dos leads ENCONTRADOS. A
        // qualidade do dado é idêntica — um lead só casa com sessão da própria
        // data —, e o que some é a varredura do resto do histórico.
        let janelaFrom = from;
        let janelaTo = toEnd;
        if (idsParam.length > 0) {
          const datas = (data as Array<{ created_at: string }>)
            .map((l) => l.created_at).filter(Boolean).sort();
          if (datas.length > 0) {
            janelaFrom = datas[0];
            janelaTo = datas[datas.length - 1];
          }
        }

        const atribuicao = await resolveLeadAttribution(
          supabase,
          data as Array<{ id: string; created_at: string; fbp?: string | null; ip_address?: string | null }>,
          { from: janelaFrom, to: janelaTo },
        );
        for (const lead of data as any[]) {
          const a = atribuicao.get(lead.id);
          if (!a) continue;
          lead.entry_page = a.first_page;
          lead.attribution_method = a.method;
          // O que veio no próprio lead manda; a sessão só preenche buraco.
          // "Buraco" inclui os defaults que o front grava quando não chega
          // parâmetro — "(not set)" e "direct" não são nulos mas também não
          // identificam campanha nenhuma.
          if (!isUsableUtm(lead.utm_content) && a.utm_content) {
            lead.utm_content = a.utm_content;
            lead.utm_content_recovered = true;
          }
          if (!isUsableUtm(lead.utm_campaign) && a.utm_campaign) {
            lead.utm_campaign = a.utm_campaign;
            lead.utm_campaign_recovered = true;
          }
        }
      }

      // Resolve campaign_id/ad_id -> nome real. O UTM de várias campanhas vem
      // com os IDs numéricos do Meta (utm_campaign={{campaign.id}}, etc.) em
      // vez do nome legível, e não havia nenhuma resolução pra isso — o admin
      // só exibia o número cru. `ad_spend` já sincroniza nome/id de toda
      // campanha/anúncio via cron, então reaproveita essa fonte em vez de
      // depender de uma chamada extra à Graph API.
      //
      // campaign_id/ad_id dedicados quase sempre vêm NULL na prática: o link
      // de destino dos anúncios usa os parâmetros dinâmicos utm_campaign/
      // utm_content (não campaign_id/ad_id), então o ID numérico cru do Meta
      // acaba morando em utm_campaign/utm_content mesmo — resolve por ali
      // também, senão isso nunca teria dado nenhuma linha pra resolver.
      const isNumericId = (v: unknown): v is string => typeof v === "string" && /^\d+$/.test(v);
      const resolveCampaignId = (l: any) => l.campaign_id || (isNumericId(l.utm_campaign) ? l.utm_campaign : null);
      const resolveAdId = (l: any) => l.ad_id || (isNumericId(l.utm_content) ? l.utm_content : null);

      // ── As quatro consultas de origem saem JUNTAS ───────────────────────
      //
      // Nomes de campanha, nomes de anúncio, cache da Meta e cadastro de contas
      // eram quatro idas em fila. Nenhuma depende do resultado da outra: todas
      // dependem só dos ad_ids/campaign_ids da lista, que já estão resolvidos
      // aqui (a atribuição, acima, já preencheu o utm_content recuperado).
      //
      // Em fila custavam 253 + 289 + 232 ms. Em paralelo custam a mais lenta.
      const campaignIds = [...new Set((data || []).map(resolveCampaignId).filter(Boolean))] as string[];
      const adIds = [...new Set((data || []).map(resolveAdId).filter(Boolean))] as string[];

      const [{ data: campaignRows }, { data: adRows }, { data: cacheRows }, contasCadastradas] = await Promise.all([
        campaignIds.length > 0
          ? supabase.from("ad_spend").select("campaign_id, campaign_name").in("campaign_id", campaignIds).not("campaign_name", "is", null)
          : Promise.resolve({ data: [] as any[] }),
        adIds.length > 0
          ? supabase.from("ad_spend").select("ad_id, ad_name").in("ad_id", adIds).not("ad_name", "is", null)
          : Promise.resolve({ data: [] as any[] }),
        adIds.length > 0
          ? supabase.from("meta_ads_cache")
              .select("ad_id, ad_name, ad_account_id, campaign_id, campaign_name, adset_id, adset_name, creative_id, creative_name, creative_thumbnail_url, last_synced_at")
              .in("ad_id", adIds)
          : Promise.resolve({ data: [] as any[] }),
        lerContasDeAnuncio(supabase),
      ]);

      if (campaignIds.length > 0 || adIds.length > 0) {
        const campaignNameById = new Map<string, string>();
        (campaignRows || []).forEach((r: any) => { if (!campaignNameById.has(r.campaign_id)) campaignNameById.set(r.campaign_id, r.campaign_name); });
        const adNameById = new Map<string, string>();
        (adRows || []).forEach((r: any) => { if (!adNameById.has(r.ad_id)) adNameById.set(r.ad_id, r.ad_name); });

        (data || []).forEach((l: any) => {
          const cid = resolveCampaignId(l);
          const aid = resolveAdId(l);
          if (cid && campaignNameById.has(cid)) l.campaign_name_resolved = campaignNameById.get(cid);
          if (aid && adNameById.has(aid)) l.ad_name_resolved = adNameById.get(aid);
        });
      }

      // Nome do anúncio (ad_name) sozinho quase sempre não identifica o
      // criativo de verdade: muitos anúncios ficam com o nome padrão "Ad"
      // (não renomeado), só campanha/conjunto têm nome descritivo. Quem
      // identifica o criativo que vendeu é o creative (Graph API). Isso
      // também resolve campanha/anúncio pros casos que ad_spend não cobre
      // (venda de um anúncio fora da janela rolante de 3 dias que o
      // meta-ads-cron sincroniza). Usa cache em meta_ads_cache (24h) antes
      // de bater na API; limita quantos IDs novos resolve por request pra
      // não estourar rate limit nem deixar o /leads lento — o resto
      // resolve nos próximos carregamentos.
      // `cacheRows` já veio na rodada paralela acima.
      const adIdsNeedingCreative = adIds;

      if (adIdsNeedingCreative.length > 0) {
        const cacheByAdId = new Map<string, any>();
        (cacheRows || []).forEach((r: any) => cacheByAdId.set(r.ad_id, r));

        const nowMs = Date.now();
        // "Fresco" é TER SIDO TENTADO nas últimas 24h, não ter dado certo. Um
        // anúncio deletado nunca devolve creative_name; exigir o nome aqui era
        // o que colocava esses IDs na fila da Graph em todo carregamento.
        const isFresh = (r: any) =>
          !!r && !!r.last_synced_at && (nowMs - new Date(r.last_synced_at).getTime()) < 24 * 60 * 60 * 1000;

        const MAX_LIVE_LOOKUPS = 12;
        const idsToFetchLive = adIdsNeedingCreative
          .filter((id) => !isFresh(cacheByAdId.get(id)))
          .slice(0, MAX_LIVE_LOOKUPS);

        const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN");
        if (metaAccessToken && idsToFetchLive.length > 0) {
          const metaApiVersion = "v21.0";
          // Timeout por chamada: sem isso, uma Graph lenta segura a tela inteira
          // pelo tempo que ela quiser.
          const GRAPH_TIMEOUT_MS = 2500;
          const resolved = await Promise.all(idsToFetchLive.map(async (adId) => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
            try {
              // Pede a hierarquia INTEIRA de uma vez: conta, campanha, conjunto,
              // anúncio e criativo. Antes faltavam `account_id` e `adset`, e sem
              // eles o card não conseguia mostrar CONTA e CONJUNTO — os dois
              // níveis que tornam a origem inequívoca quando a mesma campanha
              // existe em duas contas.
              const res = await fetch(
                `https://graph.facebook.com/${metaApiVersion}/${adId}?fields=id,name,account_id,campaign{id,name},adset{id,name},creative{id,name,thumbnail_url}&access_token=${metaAccessToken}`,
                { signal: ctrl.signal }
              );
              if (!res.ok) return { ad_id: adId, __miss: true };
              const json: any = await res.json();
              if (!json.name && !json.campaign?.name && !json.creative?.name) {
                return { ad_id: adId, __miss: true };
              }
              const contaBruta = json.account_id ? String(json.account_id) : null;
              return {
                ad_id: adId,
                ad_name: json.name || null,
                ad_account_id: contaBruta ? (contaBruta.startsWith("act_") ? contaBruta : `act_${contaBruta}`) : null,
                campaign_id: json.campaign?.id || null,
                campaign_name: json.campaign?.name || null,
                adset_id: json.adset?.id || null,
                adset_name: json.adset?.name || null,
                creative_id: json.creative?.id || null,
                creative_name: json.creative?.name || null,
                creative_thumbnail_url: json.creative?.thumbnail_url || null,
                __miss: false,
              };
            } catch {
              // Timeout ou erro de rede também contam como tentativa: o objetivo
              // é não repetir o mesmo prejuízo no próximo carregamento.
              return { ad_id: adId, __miss: true };
            } finally {
              clearTimeout(timer);
            }
          }));

          // TODA tentativa é registrada — a que resolveu com os dados, a que
          // falhou só com o carimbo de data. É o carimbo que tira o ID da fila
          // pelas próximas 24h.
          if (resolved.length > 0) {
            const stamp = new Date().toISOString();
            await supabase.from("meta_ads_cache").upsert(
              resolved.map((r: any) => (r.__miss
                ? { ad_id: r.ad_id, last_synced_at: stamp }
                : {
                    ad_id: r.ad_id,
                    ad_name: r.ad_name,
                    ad_account_id: r.ad_account_id,
                    campaign_id: r.campaign_id,
                    campaign_name: r.campaign_name,
                    adset_id: r.adset_id,
                    adset_name: r.adset_name,
                    creative_id: r.creative_id,
                    creative_name: r.creative_name,
                    creative_thumbnail_url: r.creative_thumbnail_url,
                    last_synced_at: stamp,
                  })),
              { onConflict: "ad_id" }
            );
            resolved.forEach((r: any) => { if (!r.__miss) cacheByAdId.set(r.ad_id, r); });
          }
        }

        // Nome da CONTA vem do cadastro permanente, nunca de texto solto.
        // `contasCadastradas` já veio na rodada paralela, do cache do isolate.

        (data || []).forEach((l: any) => {
          const aid = resolveAdId(l);
          const cached = aid ? cacheByAdId.get(aid) : null;
          if (cached) {
            // ATENÇÃO: `creative_name` NÃO é o nome do anúncio. Quando o
            // criativo nasce de um post, a Meta o nomeia com o TEXTO DA COPY.
            // Ele vai separado, para o card poder mostrar "anúncio" e
            // "criativo" como as coisas diferentes que são — e nunca um no
            // lugar do outro.
            if (cached.creative_name) l.creative_name_resolved = cached.creative_name;
            if (cached.creative_id) l.creative_id_resolved = cached.creative_id;
            if (cached.creative_thumbnail_url) l.creative_thumbnail_url_resolved = cached.creative_thumbnail_url;
            if (!l.ad_name_resolved && cached.ad_name) l.ad_name_resolved = cached.ad_name;
            if (!l.campaign_name_resolved && cached.campaign_name) l.campaign_name_resolved = cached.campaign_name;
            if (cached.adset_id) l.adset_id_resolved = cached.adset_id;
            if (cached.adset_name) l.adset_name_resolved = cached.adset_name;
            if (cached.ad_account_id) {
              l.ad_account_id_resolved = cached.ad_account_id;
              l.account_name_resolved = contasCadastradas.get(cached.ad_account_id) ?? null;
            }
          }
        });
      }

      // ── Estado do CRM, por lead ──────────────────────────────────────────
      //
      // A coluna de CRM na lista precisa do MESMO estado que a fila comercial
      // mostra. Por isso lê `lead_fila` — a view que já classifica estado,
      // balde e próxima ação — em vez de recalcular aqui. Duas cópias da regra
      // é como se descobre, semanas depois, que a lista e a fila discordam
      // sobre o que fazer com o mesmo lead.
      //
      // Vai em `emLotes` porque `in(...)` com a lista inteira estoura o limite
      // de tamanho da URL do PostgREST quando o período é largo.
      if (data?.length) {
        try {
          const idsCrm = (data as Array<{ id: string }>).map((l) => l.id).filter(Boolean);
          const fila = await emLotes<any>(idsCrm, 100, (lote) =>
            supabase
              .from("lead_fila")
              .select(
                "lead_id, estado, bucket, tentativas, ultima_interacao_at, ultima_direcao, " +
                "proxima_acao_at, proxima_acao_owner, sla_estourado, desfecho_pendente, teve_no_show"
              )
              .in("lead_id", lote)
          );
          const crmPorLead = new Map(fila.map((f: any) => [f.lead_id, f]));
          (data as Array<Record<string, unknown>>).forEach((l) => {
            const f: any = crmPorLead.get(l.id as string);
            if (!f) return;
            l.crm_estado = f.estado;
            l.crm_bucket = f.bucket;
            l.crm_tentativas = f.tentativas;
            l.crm_ultima_interacao_at = f.ultima_interacao_at;
            l.crm_ultima_direcao = f.ultima_direcao;
            l.crm_proxima_acao_at = f.proxima_acao_at;
            l.crm_proxima_acao_owner = f.proxima_acao_owner;
            l.crm_sla_estourado = f.sla_estourado;
            l.crm_desfecho_pendente = f.desfecho_pendente;
            l.crm_teve_no_show = f.teve_no_show;
          });
        } catch (e) {
          // A lista de leads nunca pode cair por causa do CRM.
          console.error("[leads] estado de crm:", e);
        }
      }

      return new Response(
        JSON.stringify(enxugarParaALista(data || [])),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PUT /leads/:id - Update lead (e.g., mark as read)
    const leadUpdateMatch = path.match(/^\/leads\/([a-f0-9-]+)$/);
    if (leadUpdateMatch && req.method === "PUT") {
      const leadId = leadUpdateMatch[1];
      const body = await req.json();

      // Fetch current lead state before update (including lido for auto-increment)
      const leadForCheck = await supabase
        .from("leads")
        .select("sdr_override, investimento_faixa, lido, origem_lead")
        .eq("id", leadId)
        .maybeSingle();
      const currentLead = leadForCheck.data;
      // Lead de prospecção e do direct não nasceu de anúncio: o MQL dele não vai para a Meta (24/10/2026)
      const leadDoSite = !currentLead?.origem_lead || currentLead.origem_lead === "site";

      // Check if sdr_override is being set to "Caio" for a true MQL faixa only
      const mqlFaixas = [
        "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
        "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
        "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
        "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
        "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
        "Acima de R$ 10 milhões", "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
      ];
      const nextInvestimentoFaixa = body.investimento_faixa ?? currentLead?.investimento_faixa;
      // Migrate: treat "Rodger" override as "Caio"
      if (body.sdr_override === "Rodger") body.sdr_override = "Caio";
      // "Rodger" também é MQL (é assim que o retroativo e o `wasMQL` abaixo
      // já tratavam); só "Caio" disparava o evento e o override para o Rodger
      // ficava mudo para o Meta.
      const isSettingMQL = leadDoSite && (body.sdr_override === "Caio" || body.sdr_override === "Rodger") && mqlFaixas.includes(nextInvestimentoFaixa || "");

      let wasMQL = false;
      if (isSettingMQL) {
        wasMQL = currentLead?.sdr_override === "Caio" || currentLead?.sdr_override === "Rodger";
      }

      // Detect lido transition: false -> true
      const wasLido = currentLead?.lido === true;
      const isSettingLido = body.lido === true;
      const isLidoTransition = !wasLido && isSettingLido;

      // First-open response-time tracking: stamp first_opened_at exactly once
      // Body flag `mark_opened: true` triggers the stamp (only if not already set).
      if (body.mark_opened === true) {
        delete body.mark_opened;
        // Only set if currently null in DB
        const { data: existing } = await supabase
          .from("leads")
          .select("first_opened_at")
          .eq("id", leadId)
          .maybeSingle();
        if (existing && !existing.first_opened_at) {
          body.first_opened_at = new Date().toISOString();
        }
      }

      // ── "Chamei" ──────────────────────────────────────────────────────────
      // O carimbo que para o relógio do SLA. É DIFERENTE de `mark_opened`:
      // abrir o card não é falar com ninguém, e dá para abrir dez cards em vinte
      // segundos sem ter chamado uma pessoa. Era exatamente assim que o tempo de
      // resposta ficava bonito sem que nada tivesse acontecido.
      //
      // Grava uma vez só. Reabrir a conversa três dias depois não pode
      // reescrever o instante do primeiro contato, que é o que mede o time.
      if (body.mark_contacted === true) {
        delete body.mark_contacted;
        const { data: existente } = await supabase
          .from("leads")
          .select("contacted_at")
          .eq("id", leadId)
          .maybeSingle();
        if (existente && !existente.contacted_at) {
          body.contacted_at = new Date().toISOString();
          body.contacted_by = typeof body.contacted_by === "string" ? body.contacted_by : null;
        } else {
          delete body.contacted_by;
        }
      }

      // EXPERIMENTO 07/09/2026: "quem mais decide", perguntado pelo SDR antes de
      // existir reunião. Lista fechada; valor fora dela vira null em vez de
      // derrubar o update no CHECK do banco. Não pontua e não define MQL.
      if (body.decisao_processo !== undefined) {
        const DECISAO_VALIDA = new Set(["sozinho", "socio", "acima", "outra_pessoa", "nao_sabe"]);
        body.decisao_processo = DECISAO_VALIDA.has(body.decisao_processo)
          ? body.decisao_processo
          : null;
      }

      const { data, error } = await supabase
        .from("leads")
        .update(body)
        .eq("id", leadId)
        .select()
        .maybeSingle();

      if (error) throw error;

      // Prospecção (24/10/2026, Rodger): o lead nasce sem faturamento e sem nota. Quando o Miguel informa o
      // faturamento ou o mercado no modal, a nota sai na régua do formulário curto (faturamento + mercado).
      // Sem faturamento não tem nota: nota só de mercado seria inventada.
      if (data && data.origem_lead === "prospeccao" && (body.investimento_faixa !== undefined || body.mercado !== undefined)) {
        const nota = data.investimento_faixa
          ? calcularNotaFormulario({ investimento_faixa: data.investimento_faixa, mercado: data.mercado })
          : null;
        const raw: Record<string, unknown> = { ...((data.raw_answers_json as Record<string, unknown>) ?? {}), qualificado_manual_em: new Date().toISOString() };
        // o agent que lê a conversa do direct não troca o que o Miguel marcou à mão
        if (body.investimento_faixa !== undefined) raw.faturamento_fonte = "manual";
        if (body.mercado !== undefined) raw.mercado_fonte = "manual";
        if (body.whatsapp !== undefined) raw.whatsapp_fonte = "manual";
        const { data: comNota, error: erroNota } = await supabase
          .from("leads")
          .update({
            score: nota?.score ?? null,
            score_breakdown: nota?.breakdown ?? null,
            score_version: nota?.version ?? null,
            score_calculated_at: nota ? new Date().toISOString() : null,
            raw_answers_json: raw,
          })
          .eq("id", leadId)
          .select()
          .maybeSingle();
        if (erroNota) console.error("Error in prospeccao score:", erroNota);
        else if (comNota) Object.assign(data, comNota);
      }

      // Auto-increment mqls_chamados when an MQL lead is marked as lido
      if (isLidoTransition && data) {
        const SDR_CAIO_FAT = [
          "De R$ 5 mil a R$ 10 mil", "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil",
          "De R$ 30 mil a R$ 50 mil", "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil",
          "De R$ 100 mil a R$ 150 mil", "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil",
          "De R$ 300 mil a R$ 500 mil", "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão",
          "De R$ 1 milhão a R$ 2 milhões", "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões",
          "De R$ 5 milhões a R$ 10 milhões", "Acima de R$ 10 milhões",
        ];
        const leadInvest = data.investimento_faixa || "";
        let sdrName = "Miguel";
        if (data.sdr_override) {
          if (data.sdr_override === "Rodger") sdrName = "Caio";
          else if (data.sdr_override === "Dara") sdrName = "Miguel";
          else sdrName = data.sdr_override;
        }
        else if (SDR_CAIO_FAT.includes(leadInvest)) sdrName = "Caio";

        const isMql = mqlFaixas.includes(leadInvest);
        if (isMql) {
          const today = new Date().toISOString().slice(0, 10);
          try {
            const { data: existingReport } = await supabase
              .from("daily_reports")
              .select("id, mqls_chamados")
              .eq("report_date", today)
              .eq("sdr_name", sdrName)
              .maybeSingle();

            // Only increment if a report already exists for today/SDR.
            // Do NOT auto-create reports — SDRs must create them manually.
            if (existingReport) {
              await supabase
                .from("daily_reports")
                .update({ mqls_chamados: (existingReport.mqls_chamados || 0) + 1 })
                .eq("id", existingReport.id);
              console.log(`Auto-incremented mqls_chamados for ${sdrName} on ${today}`);
            } else {
              console.log(`Skipped auto-create of daily_report for ${sdrName} on ${today} (no existing report)`);
            }
          } catch (mqErr) {
            console.error("Error auto-incrementing mqls_chamados:", mqErr);
          }
        }
      }

      // Fire Meta CAPI MQL event if sdr_override just changed to MQL-eligible "Caio"
      if (isSettingMQL && !wasMQL) {
        try {
          const capiRes = await chamarMetaCapi({
            lead_id: leadId,
            event_name: "MQL",
            // Mesmo id que o MQL do quiz teria: se o lead já foi MQL pelo
            // formulário, o meta-capi vê a reserva e não manda de novo.
            event_id: `${leadId}_MQL`,
            dedup_key: "MQL",
            // Nasceu de uma decisão no admin, não de um clique na página.
            action_source: "system_generated",
            ...(valorEsperadoMql(data?.investimento_faixa) ? { value: valorEsperadoMql(data?.investimento_faixa), currency: "BRL" } : {}),
          }, "admin");
          const capiResult = await capiRes.json();
          console.log("Meta CAPI MQL result:", JSON.stringify(capiResult));

          if (capiRes.ok && capiResult.success) {
            await marcarNoLead(supabase, leadId, ["MQL"]);
          }
        } catch (capiErr) {
          console.error("Error calling meta-capi:", capiErr);
        }
      }

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /sessions - List sessions with filters
    if (path === "/sessions" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const status = url.searchParams.get("status");
      const buttonId = url.searchParams.get("button_id");
      const search = url.searchParams.get("q");
      const showInternal = url.searchParams.get("show_internal") === "true";
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = (page - 1) * limit;

      let query = supabase
        .from("lead_sessions")
        .select("*", { count: "exact" })
        .order("last_seen_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // Filter out internal/noise sessions by default
      if (!showInternal) {
        // Exclude Lovable preview referrers
        query = query.not("referrer", "ilike", "%lovable.dev%")
          .not("referrer", "ilike", "%lovableproject.com%")
          .not("referrer", "ilike", "%forceHideBadge%");
        // Exclude admin-only visits
        query = query.neq("first_page", "/admin");
      }

      // Apply filters
      if (from) {
        query = query.gte("last_seen_at", from);
      }
      if (to) {
        const toEnd = to.includes("T") ? to : to + "T23:59:59.999Z";
        query = query.lte("last_seen_at", toEnd);
      }
      if (buttonId) {
        query = query.eq("start_button_id", buttonId);
      }
      if (status) {
        switch (status) {
          case "completed":
            query = query.eq("completed", true);
            break;
          case "started":
            query = query.eq("started_quiz", true).eq("completed", false);
            break;
          case "entered":
            query = query.eq("entered_quiz_page", true).eq("started_quiz", false);
            break;
          case "not_entered":
            query = query.eq("entered_quiz_page", false);
            break;
          case "interacted":
            // Sessions that had any interaction (entered quiz page OR started quiz)
            query = query.eq("entered_quiz_page", true);
            break;
        }
      }
      if (search) {
        query = query.or(`lead_name.ilike.%${search}%,lead_whatsapp.ilike.%${search}%,lead_instagram.ilike.%${search}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return new Response(
        JSON.stringify({ data, total: count, page, limit }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /sessions/:id - Get session details
    const sessionMatch = path.match(/^\/sessions\/([a-f0-9-]+)$/);
    if (sessionMatch && req.method === "GET") {
      const sessionId = sessionMatch[1];
      
      const { data, error } = await supabase
        .from("lead_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return new Response(
          JSON.stringify({ error: "Sessão não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /sessions/:id/events - Get session events
    const eventsMatch = path.match(/^\/sessions\/([a-f0-9-]+)\/events$/);
    if (eventsMatch && req.method === "GET") {
      const sessionId = eventsMatch[1];
      
      const { data, error } = await supabase
        .from("lead_events")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /weekly-metrics - Aggregate visitors / quiz entries / completions per calendar day (America/Sao_Paulo)
    if (path === "/weekly-metrics" && req.method === "GET") {
      let from = url.searchParams.get("from");
      let to = url.searchParams.get("to");

      // Clamp range to a maximum of 90 days to avoid worker resource limits.
      // The weekly-analysis section only renders day-of-week aggregates, so
      // ranges longer than ~3 months provide no extra signal but easily OOM.
      const MAX_DAYS = 31;
      if (from && to) {
        const fromMs = new Date(from).getTime();
        const toMs = new Date(to).getTime();
        if (Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs > fromMs) {
          const spanDays = (toMs - fromMs) / 86400000;
          if (spanDays > MAX_DAYS) {
            const clampedFromMs = toMs - MAX_DAYS * 86400000;
            from = new Date(clampedFromMs).toISOString();
          }
        }
      }
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;

      async function fetchAllPaged<T>(table: string, select: string, filters: (q: any) => any): Promise<T[]> {
        const PAGE_SIZE = 1000;
        const MAX_ROWS = 8000; // hard cap to prevent OOM/CPU exhaustion (503)
        // As páginas seguintes saem em leva, não uma por vez.
        //
        // A versão anterior pedia a página 2 só depois de a 1 voltar. Como o
        // banco está em us-west-2, cada página custava a travessia inteira:
        // uma janela com 12 mil eventos eram 12 viagens em fila. Agora a
        // primeira página diz se há mais, e o resto vem em levas de 5.
        const LEVA = 5;
        let all: T[] = [];
        const pagina = (offset: number) => {
          let q = supabase.from(table).select(select).range(offset, offset + PAGE_SIZE - 1);
          q = filters(q);
          return q;
        };
        const { data: primeira, error: erroPrimeira } = await pagina(0);
        if (erroPrimeira) throw erroPrimeira;
        if (primeira) all = all.concat(primeira as T[]);

        let offset = PAGE_SIZE;
        let hasMore = (primeira?.length || 0) === PAGE_SIZE;
        while (hasMore && all.length < MAX_ROWS) {
          const offsets: number[] = [];
          for (let k = 0; k < LEVA && offset + k * PAGE_SIZE < MAX_ROWS; k++) {
            offsets.push(offset + k * PAGE_SIZE);
          }
          if (!offsets.length) break;
          const respostas = await Promise.all(offsets.map((o) => pagina(o)));
          hasMore = false;
          for (const { data, error } of respostas) {
            if (error) throw error;
            if (data) all = all.concat(data as T[]);
            // Só continua se a ÚLTIMA página da leva veio cheia: uma página
            // curta no meio significaria buraco, e isso não acontece com
            // `range` sobre a mesma consulta ordenada.
            hasMore = (data?.length || 0) === PAGE_SIZE;
          }
          offset += offsets.length * PAGE_SIZE;
        }
        return all;
      }

      // Fetch sessions acquired in range (cohort by first touch)
      const rawSessions = await fetchAllPaged<any>(
        "lead_sessions",
        "id, ip_address, created_at, last_seen_at, referrer, first_page, completed, utm_content",
        (q: any) => {
          if (from) q = q.gte("created_at", from);
          if (toEnd) q = q.lte("created_at", toEnd);
          return q;
        }
      );

      // Filter internal/noise traffic (same rules as /metrics)
      const weeklyPageFilter = parsePageFilter(url);
      const weeklyCreativeFilter = parseCreativeFilter(url);
      const sessions = rawSessions.filter((s: any) => {
        const ref = (s.referrer || "").toLowerCase();
        const firstPage = (s.first_page || "").toLowerCase();
        if (ref.includes("lovable.dev") || ref.includes("lovableproject.com") || ref.includes("lovable.app/?forcehidebadge")) return false;
        if (firstPage === "/admin") return false;
        // Filtro global de variante de headline do admin.
        if (weeklyPageFilter && firstPage !== weeklyPageFilter.toLowerCase()) return false;
        if (weeklyCreativeFilter && !weeklyCreativeFilter(s.utm_content)) return false;
        return true;
      });
      const sessionIds = new Set(sessions.map((s: any) => s.id));

      // Fetch events to detect quiz entry (quiz_view event)
      const events = await fetchAllPaged<any>(
        "lead_events",
        "event_name, session_id, created_at",
        (q: any) => {
          if (from) q = q.gte("created_at", from);
          if (toEnd) q = q.lte("created_at", toEnd);
          // Only need quiz_view + submit events for weekly aggregation
          q = q.in("event_name", ["quiz_view", "submit"]);
          return q;
        }
      );
      // Mesma correção do /metrics: quem já tinha sessão de antes do período e
      // voltou pra responder o quiz precisa contar, senão a conclusão do dia
      // desaparece do gráfico semanal enquanto aparece no funil por etapa.
      const weeklyReturning = new Set<string>();
      events.forEach((e: any) => {
        if (e.session_id && !sessionIds.has(e.session_id)) weeklyReturning.add(e.session_id);
      });
      const weeklyEventSessionIds = new Set<string>(sessionIds);
      if (weeklyReturning.size > 0) {
        const ids = Array.from(weeklyReturning).slice(0, 5000);
        const CHUNK = 200;
        // Lotes em paralelo: nunca dependeram uns dos outros. Ver `emLotes`.
        const extras = await emLotes<any>(ids, CHUNK, (lote) =>
          supabase.from("lead_sessions").select("id, referrer, first_page, utm_content").in("id", lote)
        );
        {
          (extras || []).forEach((s: any) => {
            const ref = (s.referrer || "").toLowerCase();
            const fp = (s.first_page || "").toLowerCase();
            if (ref.includes("lovable.dev") || ref.includes("lovableproject.com")) return;
            if (fp === "/admin") return;
            if (weeklyPageFilter && fp !== weeklyPageFilter.toLowerCase()) return;
            if (weeklyCreativeFilter && !weeklyCreativeFilter(s.utm_content)) return;
            weeklyEventSessionIds.add(s.id);
          });
        }
      }

      const enteredQuizSessionIds = new Set(
        events
          .filter((e: any) => e.event_name === "quiz_view" && weeklyEventSessionIds.has(e.session_id))
          .map((e: any) => e.session_id)
      );

      // Completions = submits do período + fallback para sessões ativas no período
      // que terminaram com completed=true mas ficaram sem event submit.
      const submittedSessionIds = new Set(
        events
          .filter((e: any) => e.event_name === "submit" && weeklyEventSessionIds.has(e.session_id))
          .map((e: any) => e.session_id)
      );
      sessions.forEach((s: any) => {
        if (s.completed && !submittedSessionIds.has(s.id)) submittedSessionIds.add(s.id);
      });

      // Fetch ad_spend in range. ad_spend.date is a DATE column already in
      // local calendar (no timezone conversion needed) — query as YYYY-MM-DD.
      const fromYmd = from ? from.slice(0, 10) : null;
      const toYmd = to ? to.slice(0, 10) : null;
      const adSpendRows = await fetchAllPaged<any>(
        "ad_spend",
        "date, spend, impressions, clicks",
        (q: any) => {
          if (fromYmd) q = q.gte("date", fromYmd);
          if (toYmd) q = q.lte("date", toYmd);
          return q;
        }
      );

      const leadRows = await fetchAllPaged<any>(
        "leads",
        "id, created_at, ip_address",
        (q: any) => {
          if (from) q = q.gte("created_at", from);
          if (toEnd) q = q.lte("created_at", toEnd);
          return q;
        }
      );

      // Helpers — convert UTC ISO -> America/Sao_Paulo calendar date (YYYY-MM-DD)
      // SP = UTC-3 (no DST currently). Use Intl for safety.
      const tzFmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const toLocalDate = (iso: string): string => {
        // en-CA produces YYYY-MM-DD
        return tzFmt.format(new Date(iso));
      };
      // Day of week 0=Sun..6=Sat, computed from local date string to be safe
      const dowFromYmd = (ymd: string): number => {
        const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
        // Construct as UTC noon to avoid TZ rollover
        return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
      };

      type DayBucket = {
        date: string; // YYYY-MM-DD local
        dow: number;
        visitors: Set<string>; // unique IPs (fallback to session ids if no IP)
        sessions: number;
        entered_quiz: number;
        completed: number;
        spend: number;
        impressions: number;
        clicks: number;
      };
      const byDate = new Map<string, DayBucket>();
      const ensure = (ymd: string): DayBucket => {
        let b = byDate.get(ymd);
        if (!b) {
          b = {
            date: ymd, dow: dowFromYmd(ymd),
            visitors: new Set(), sessions: 0, entered_quiz: 0, completed: 0,
            spend: 0, impressions: 0, clicks: 0,
          };
          byDate.set(ymd, b);
        }
        return b;
      };

      // Per-session -> acquisition date inside the selected range
      const sessionDate = new Map<string, string>();
      sessions.forEach((s: any) => {
        const ymd = toLocalDate(s.created_at || s.last_seen_at);
        sessionDate.set(s.id, ymd);
        const b = ensure(ymd);
        b.sessions += 1;
        const visitorKey = (s.ip_address && s.ip_address !== "unknown") ? s.ip_address : `sess:${s.id}`;
        b.visitors.add(visitorKey);
      });

      const enteredQuizByDay = new Set<string>();
      events.forEach((e: any) => {
        if (e.event_name !== "quiz_view" || !sessionIds.has(e.session_id)) return;
        enteredQuizByDay.add(`${e.session_id}|${toLocalDate(e.created_at)}`);
      });
      enteredQuizByDay.forEach((key) => {
        const [, ymd] = key.split("|");
        ensure(ymd).entered_quiz += 1;
      });

      const completedByDay = new Set<string>();
      events.forEach((e: any) => {
        if (e.event_name !== "submit" || !sessionIds.has(e.session_id)) return;
        completedByDay.add(`${e.session_id}|${toLocalDate(e.created_at)}`);
      });
      submittedSessionIds.forEach((sid) => {
        const ymd = sessionDate.get(sid as string);
        if (!ymd) return;
        completedByDay.add(`${sid}|${ymd}`);
      });
      completedByDay.forEach((key) => {
        const [, ymd] = key.split("|");
        ensure(ymd).completed += 1;
      });

      // ad_spend.date is already a YYYY-MM-DD string aligned to São Paulo
      adSpendRows.forEach((row: any) => {
        const ymd = String(row.date).slice(0, 10);
        const b = ensure(ymd);
        b.spend += Number(row.spend) || 0;
        b.impressions += Number(row.impressions) || 0;
        b.clicks += Number(row.clicks) || 0;
      });

      // A tabela `leads` não guarda por qual página nem por qual criativo o lead
      // entrou. Com filtro global ativo ela não pode servir de piso: jogaria os
      // leads de TODAS as variantes dentro da que está selecionada — foi o que
      // fez o bloco semanal mostrar 4 conclusões enquanto o funil do site,
      // filtrado corretamente, mostrava 0.
      const weeklyLeadFloorOk = !weeklyPageFilter && !weeklyCreativeFilter;
      const leadCountsByDate = new Map<string, number>();
      const leadVisitorsByDate = new Map<string, Set<string>>();
      (weeklyLeadFloorOk ? leadRows : []).forEach((lead: any) => {
        const ymd = toLocalDate(lead.created_at);
        ensure(ymd);
        leadCountsByDate.set(ymd, (leadCountsByDate.get(ymd) || 0) + 1);
        if (!leadVisitorsByDate.has(ymd)) leadVisitorsByDate.set(ymd, new Set<string>());
        const visitorKey = (lead.ip_address && lead.ip_address !== "unknown")
          ? `ip:${lead.ip_address}`
          : `lead:${lead.id}`;
        leadVisitorsByDate.get(ymd)!.add(visitorKey);
      });

      const days = Array.from(byDate.values())
        .map((b) => {
          const leadVisitors = leadVisitorsByDate.get(b.date);
          leadVisitors?.forEach((visitorKey) => b.visitors.add(visitorKey));
          const leadCompleted = leadCountsByDate.get(b.date) || 0;
          const completed = Math.max(b.completed, leadCompleted);
          // Honestidade (mesmo padrão do /metrics, ver comentário lá): só "completamos"
          // entered_quiz até bater com completed quando o dia tem sinal REAL de quiz_view
          // (b.entered_quiz > 0). Sem essa checagem, todo dia anterior ao fix de
          // lead_sessions/lead_events (11/07/2026) mostrava entered_quiz === completed,
          // uma igualdade artificial. `visitors` continua usando o piso real de IPs
          // (sessão + leads), que é uma garantia matemática válida (todo lead concluído
          // também é um visitante) — não depende de entered_quiz estar disponível.
          const enteredQuizKnown = b.entered_quiz > 0;
          const enteredQuiz = enteredQuizKnown ? Math.max(b.entered_quiz, completed) : null;
          const visitors = Math.max(b.visitors.size, enteredQuiz ?? completed);
          const sessions = Math.max(b.sessions, completed);
          // Sem sessão real registrada nesse dia, `visitors` é só o piso derivado dos IPs
          // dos próprios leads (sempre igual a completed, já que não há sinal independente
          // de quem visitou sem converter) — daí a "conversão total" de 100% enganosa que o
          // usuário reportou. Com sinal real de sessão, o piso passa a refletir gente que
          // visitou de fato (converteu ou não).
          const visitorsKnown = b.sessions > 0;

          return {
            date: b.date,
            dow: b.dow,
            visitors,
            visitors_known: visitorsKnown,
            sessions,
            entered_quiz: enteredQuiz,
            entered_quiz_known: enteredQuizKnown,
            completed,
            spend: Number(b.spend.toFixed(2)),
            impressions: b.impressions,
            clicks: b.clicks,
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      return new Response(
        JSON.stringify({ days }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /metrics - Get funnel metrics
    if (path === "/metrics" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;

      // Guard: clamp range to max 90 days to avoid 150s timeout on huge windows
      // (e.g. preset "maximum" 2020→today). Heavy queries: landing_hits + lead_events.
      let fromClamped = from;
      if (from && toEnd) {
        const fromMs = new Date(from).getTime();
        const toMs = new Date(toEnd).getTime();
        const MAX_MS = 90 * 24 * 60 * 60 * 1000;
        if (toMs - fromMs > MAX_MS) {
          fromClamped = new Date(toMs - MAX_MS).toISOString();
          console.log(`[metrics] Range clamped to 90d: ${fromClamped} -> ${toEnd}`);
        }
      }

      // Helper to fetch rows with pagination, capped to protect Edge runtime memory/CPU.
      async function fetchAll<T>(table: string, select: string, filters: (q: any) => any): Promise<T[]> {
        const PAGE_SIZE = 1000;
        const MAX_ROWS = 15000;
        // As páginas seguintes saem em leva, não uma por vez.
        //
        // A versão anterior pedia a página 2 só depois de a 1 voltar. Como o
        // banco está em us-west-2, cada página custava a travessia inteira:
        // uma janela com 12 mil eventos eram 12 viagens em fila. Agora a
        // primeira página diz se há mais, e o resto vem em levas de 5.
        const LEVA = 5;
        let all: T[] = [];
        const pagina = (offset: number) => {
          let q = supabase.from(table).select(select).range(offset, offset + PAGE_SIZE - 1);
          q = filters(q);
          return q;
        };
        const { data: primeira, error: erroPrimeira } = await pagina(0);
        if (erroPrimeira) throw erroPrimeira;
        if (primeira) all = all.concat(primeira as T[]);

        let offset = PAGE_SIZE;
        let hasMore = (primeira?.length || 0) === PAGE_SIZE;
        while (hasMore && all.length < MAX_ROWS) {
          const offsets: number[] = [];
          for (let k = 0; k < LEVA && offset + k * PAGE_SIZE < MAX_ROWS; k++) {
            offsets.push(offset + k * PAGE_SIZE);
          }
          if (!offsets.length) break;
          const respostasPag = await Promise.all(offsets.map((o) => pagina(o)));
          hasMore = false;
          for (const { data, error } of respostasPag) {
            if (error) throw error;
            if (data) all = all.concat(data as T[]);
            hasMore = (data?.length || 0) === PAGE_SIZE;
          }
          offset += offsets.length * PAGE_SIZE;
        }
        if (all.length >= MAX_ROWS) {
          console.warn(`[metrics] ${table} capped at ${MAX_ROWS} rows to avoid runtime exhaustion`);
        }
        return all;
      }

      // Fetch ALL sessions acquired in range (cohort by first touch)
      // `quiz_variant` diz por qual FORMULÁRIO a sessão passou. Sem ele não dá
      // para distinguir "o período não tem dado" de "o período é do formulário
      // curto, que não tem etapas por natureza" — ver o bloco do funil abaixo.
      // As sessões e os eventos do período são independentes: as duas consultas
      // só filtram por data. Esperar uma para começar a outra custava a
      // travessia até us-west-2 duas vezes, em fila. Aqui as duas partem
      // juntas; os eventos são colhidos mais abaixo, onde já eram usados.
      const promessaEventos = fetchAll<any>(
        "lead_events",
        "event_name, step_id, session_id, metadata, button_id, created_at",
        (q: any) => {
          if (fromClamped) q = q.gte("created_at", fromClamped);
          if (toEnd) q = q.lte("created_at", toEnd);
          return q;
        }
      );
      // A promessa nasce aqui e só é colhida lá embaixo. Se a consulta das
      // sessões falhar antes disso, esta rejeição fica sem dono — e rejeição
      // sem dono derruba o isolate no Deno Deploy. O `catch` vazio só marca a
      // promessa como observada; quem der `await` nela continua recebendo o
      // erro normalmente.
      promessaEventos.catch(() => {});

      const rawSessions = await fetchAll<any>("lead_sessions", "id, ip_address, created_at, last_seen_at, referrer, first_page, completed, started_quiz, quiz_variant, utm_content", (q: any) => {
        if (fromClamped) q = q.gte("created_at", fromClamped);
        if (toEnd) q = q.lte("created_at", toEnd);
        return q;
      });

      // Filter out internal/noise sessions:
      // 1. Lovable preview referrers
      // 2. Sessions that started on /admin
      // 3. Lovable project URLs in referrer
      const metricsPageFilter = parsePageFilter(url);
      const metricsCreativeFilter = parseCreativeFilter(url);
      // Lista de criativos do período ANTES do filtro de criativo — é ela que
      // alimenta o seletor no admin, então não pode vir já filtrada.
      const creativeTally = new Map<string, number>();
      rawSessions.forEach((s: any) => {
        const ref = (s.referrer || '').toLowerCase();
        const fp = (s.first_page || '').toLowerCase();
        if (ref.includes('lovable.dev') || ref.includes('lovableproject.com')) return;
        if (fp === '/admin') return;
        if (metricsPageFilter && fp !== metricsPageFilter.toLowerCase()) return;
        const c = normalizeUtm(s.utm_content);
        if (!c) return;
        creativeTally.set(c, (creativeTally.get(c) || 0) + 1);
      });
      const creativesAvailable = Array.from(creativeTally.entries())
        .map(([content, sessions]) => ({ content, sessions }))
        .sort((a, b) => b.sessions - a.sessions);

      const sessions = rawSessions.filter((s: any) => {
        const ref = (s.referrer || '').toLowerCase();
        const firstPage = (s.first_page || '').toLowerCase();
        // Exclude Lovable previews and editor
        if (ref.includes('lovable.dev') || ref.includes('lovableproject.com') || ref.includes('lovable.app/?forceHideBadge')) return false;
        // Exclude admin-only visits
        if (firstPage === '/admin') return false;
        // Filtro global de variante de headline do admin: restringe o funil
        // inteiro (visitantes, entrada no quiz, etapas, conclusão) às sessões
        // que entraram POR aquela página.
        if (metricsPageFilter && firstPage !== metricsPageFilter.toLowerCase()) return false;
        if (metricsCreativeFilter && !metricsCreativeFilter(s.utm_content)) return false;
        return true;
      });
      const filteredOutCount = rawSessions.length - sessions.length;

      const sessionIds = new Set(sessions.map((s: any) => s.id));
      const trackedSessionTotal = sessions.length;

      // Calculate unique visitors by IP
      const sessionsWithIp = sessions.filter((s: any) => s.ip_address && s.ip_address !== 'unknown');
      const uniqueIps = new Set(sessionsWithIp.map((s: any) => s.ip_address));
      const ipCoverage = trackedSessionTotal > 0 ? (sessionsWithIp.length / trackedSessionTotal) : 0;
      const trackedUniqueVisitors = ipCoverage >= 0.5 ? uniqueIps.size : trackedSessionTotal;
      const hasReliableIpData = ipCoverage >= 0.5;

      // Fetch ALL events for those sessions (paginated)
      const allEvents = await promessaEventos;
      // Filter to only sessions in our range
      // Sessões que agiram no período mas foram CRIADAS antes dele (visitante
      // recorrente: o session_id vive no localStorage e não é recriado).
      // Sem isso, quem já tinha visitado o site antes e voltou pra responder o
      // quiz sumia do funil por etapa e da contagem de conclusões — foi o que
      // fez o painel mostrar "concluíram 0" num dia com submit registrado.
      const returningIds = new Set<string>();
      allEvents.forEach((e: any) => {
        if (e.session_id && !sessionIds.has(e.session_id)) returningIds.add(e.session_id);
      });
      const eventSessionIds = new Set<string>(sessionIds);
      if (returningIds.size > 0) {
        const ids = Array.from(returningIds).slice(0, 5000);
        const CHUNK = 200;
        // Os lotes saem JUNTOS, não em fila.
        //
        // Este laço tinha o `await` dentro dele: cada lote de 200 ids esperava o
        // anterior voltar de us-west-2. Com os 5.000 ids que o corte permite,
        // são 25 viagens em sequência, ~250 ms cada — 6 segundos só aqui, e foi
        // o que fez a rota /metrics levar 16,7 s em produção em 18/09/2026.
        //
        // O resultado é idêntico: os lotes são independentes entre si e tudo
        // termina no mesmo Set. Só deixaram de esperar uns pelos outros.
        const lotes: string[][] = [];
        for (let i = 0; i < ids.length; i += CHUNK) lotes.push(ids.slice(i, i + CHUNK));
        const respostas = await Promise.all(lotes.map((lote) =>
          supabase.from("lead_sessions").select("id, referrer, first_page, utm_content").in("id", lote)
        ));
        for (const { data: extra } of respostas) {
          (extra || []).forEach((s: any) => {
            const ref = (s.referrer || "").toLowerCase();
            const fp = (s.first_page || "").toLowerCase();
            if (ref.includes("lovable.dev") || ref.includes("lovableproject.com")) return;
            if (fp === "/admin") return;
            if (metricsPageFilter && fp !== metricsPageFilter.toLowerCase()) return;
            if (metricsCreativeFilter && !metricsCreativeFilter(s.utm_content)) return;
            eventSessionIds.add(s.id);
          });
        }
      }

      const filteredEvents = allEvents.filter((e: any) => eventSessionIds.has(e.session_id));

      // Ground truth for "completed" = sessões que efetivamente concluíram o quiz
      // (event submit OU session.completed=true), restritas às sessões NÃO filtradas (sem ruído interno).
      // Usar leads.count diretamente inflava o número porque inclui leads sem sessão (importações,
      // duplicatas, bio recovery), gerando taxas > 100%.
      const sessionsWithSubmitGround = new Set(
        allEvents
          .filter((e: any) => e.event_name === "submit" && eventSessionIds.has(e.session_id))
          .map((e: any) => e.session_id)
      );
      const completedSessionIds = new Set<string>(sessionsWithSubmitGround);
      sessions.forEach((s: any) => {
        if (s.completed && !completedSessionIds.has(s.id)) completedSessionIds.add(s.id);
      });
      const trackedCompleted = completedSessionIds.size;

      const leadRows = await fetchAll<any>(
        "leads",
        "id, created_at, ip_address",
        (q: any) => {
          if (fromClamped) q = q.gte("created_at", fromClamped);
          if (toEnd) q = q.lte("created_at", toEnd);
          return q;
        }
      );
      const totalLeads = leadRows.length;
      const uniqueLeadVisitors = new Set(
        leadRows.map((lead: any) =>
          lead.ip_address && lead.ip_address !== "unknown"
            ? `ip:${lead.ip_address}`
            : `lead:${lead.id}`
        )
      ).size;
      // Com filtro de variante, `leads` não serve de piso: a tabela não guarda
      // por qual página o lead entrou, então somar totalLeads jogaria pra dentro
      // de UMA variante os leads de todas as outras. Só o sinal por sessão
      // (submit / lead_sessions.completed) sabe distinguir.
      const completed = (metricsPageFilter || metricsCreativeFilter) ? trackedCompleted : Math.max(trackedCompleted, totalLeads);
      console.log("[metrics] tracked", JSON.stringify({
        tracked_sessions: trackedSessionTotal,
        tracked_unique_visitors: trackedUniqueVisitors,
        tracked_completed: trackedCompleted,
        total_leads: totalLeads,
        unique_lead_visitors: uniqueLeadVisitors,
      }));

      // ===== Landing Views (fonte da verdade) =====
      // Conta hits únicos por session_id; se session_id null, dedup por (ip + user_agent) janela de 30min
      let hitsQuery = supabase
        .from("landing_hits")
        .select("session_id, ip_address, user_agent, created_at, referrer, path, utm_content")
        .order("created_at", { ascending: true })
        .limit(15000);
      if (fromClamped) hitsQuery = hitsQuery.gte("created_at", fromClamped);
      if (toEnd) hitsQuery = hitsQuery.lte("created_at", toEnd);
      const { data: hitsData } = await hitsQuery;
      const cleanHits = (hitsData || []).filter((h: any) => {
        const ref = (h.referrer || "").toLowerCase();
        if (ref.includes("lovable.dev") || ref.includes("lovableproject.com")) return false;
        if (metricsPageFilter) {
          // `path` inclui a query string (?utm_source=…): compara só o pathname.
          const hitPath = ((h.path || "/").split("?")[0] || "/").toLowerCase();
          if (hitPath !== metricsPageFilter.toLowerCase()) return false;
        }
        if (metricsCreativeFilter && !metricsCreativeFilter(h.utm_content)) return false;
        return true;
      });
      const hitSessionIds = new Set<string>();
      const ipUaBuckets = new Map<string, number>(); // key -> last timestamp ms
      let landingHitsTotal = 0;
      for (const h of cleanHits) {
        landingHitsTotal++;
        if (h.session_id) {
          hitSessionIds.add(h.session_id);
        } else if (h.ip_address) {
          const key = `${h.ip_address}|${(h.user_agent || "").slice(0, 80)}`;
          const ts = new Date(h.created_at).getTime();
          const last = ipUaBuckets.get(key);
          if (!last || ts - last > 30 * 60 * 1000) {
            ipUaBuckets.set(key, ts);
          }
        }
      }
      const landingViews = hitSessionIds.size + ipUaBuckets.size;

      // ===== Meta clicks (do ad_spend já agregado) =====
      let spendQuery = supabase.from("ad_spend").select("clicks, date");
      if (fromClamped) spendQuery = spendQuery.gte("date", fromClamped.slice(0, 10));
      if (toEnd) spendQuery = spendQuery.lte("date", toEnd.slice(0, 10));
      const { data: spendData } = await spendQuery;
      const metaClicks = (spendData || []).reduce((sum: number, r: any) => sum + (r.clicks || 0), 0);

      // Calculate event-based metrics
      const sessionsWithQuizView = new Set(
        filteredEvents.filter((e: any) => e.event_name === "quiz_view").map((e: any) => e.session_id)
      );
      // `sessionsWithStepView` saiu em 17/09/2026: o formulário curto não tem
      // etapa, `step_view` não existe mais, e era ele que alimentava
      // `started_quiz`. Ver a nova definição logo abaixo.

      // ===== Honestidade dos números (2026-07-11) =====
      // ANTES: uniqueVisitors/enteredQuiz eram forçados pra cima via Math.max(..., completed)
      // pra manter um funil "monotônico" (nunca completar > visitar). Isso parecia razoável,
      // mas lead_sessions/lead_events ficaram 100% vazias desde sempre até hoje (bug de FK/
      // colisão de localStorage, corrigido nesta mesma data) — então trackedUniqueVisitors,
      // sessionsWithQuizView etc. eram sempre 0, e o Math.max IGUALAVA visitantes/entradas ao
      // número de conclusões reais (leads), produzindo "5 visitantes = 5 entraram = 5
      // concluíram = 100% conversão" pra QUALQUER período — escondendo o drop-off real, que é
      // o propósito desta tela. Índice separado: o beacon early-fire em index.html também
      // apontava pro projeto Supabase ERRADO (troqylihudenqjsxsnwy, órfão da era Lovable) em
      // vez do projeto real (VITE_SUPABASE_PROJECT_ID), então landing_hits também ficou vazia
      // — corrigido junto nesta mesma data.
      //
      // AGORA: só "completamos" um número (visitantes/entradas) até bater com `completed`
      // quando existe ALGUM sinal real de tracking pro período (landing_hits ou lead_sessions
      // não-vazios). Esse "clamp pra cima" continua válido matematicamente (todo lead que
      // converteu também foi um visitante/entrou no quiz, então visitors/entered >= completed
      // sempre) — a diferença é que agora só o aplicamos quando sabemos que há alguma
      // contagem real por trás, em vez de inventar um número igual a completed do zero.
      // Quando NÃO há nenhum sinal de tracking no período, retornamos null e o front mostra
      // isso explicitamente em vez de fingir 100% de conversão.
      const hasVisitorSignal = landingHitsTotal > 0 || trackedSessionTotal > 0;
      const hasEventSignal = allEvents.length > 0;

      // uniqueLeadVisitors vem da tabela `leads`, que não sabe de página nem de
      // criativo — com filtro ativo, ele infla a variante selecionada com gente
      // que entrou por outra.
      const uniqueVisitors: number | null = hasVisitorSignal
        ? Math.max(landingViews, trackedUniqueVisitors, metricsPageFilter || metricsCreativeFilter ? 0 : uniqueLeadVisitors, completed)
        : null;
      const total: number | null = hasVisitorSignal
        ? Math.max(trackedSessionTotal, (metricsPageFilter || metricsCreativeFilter) ? 0 : totalLeads, uniqueVisitors ?? 0)
        : null;
      const enteredQuiz: number | null = hasEventSignal
        ? Math.min(Math.max(sessionsWithQuizView.size, completed), uniqueVisitors ?? Number.MAX_SAFE_INTEGER)
        : null;

      // ===== `started_quiz` desacoplado do `step_view` (17/09/2026) ==========
      //
      // DEFINIÇÃO NOVA: sessão que COMEÇOU a responder = sessão com evento
      // `quiz_view` OU com `lead_sessions.started_quiz = true`. União dos dois,
      // porque cada um falha de um jeito: o evento se perde quando a escrita em
      // `lead_events` não completa, e a flag da sessão se perde quando a RPC de
      // progresso não roda.
      //
      // DEFINIÇÃO ANTIGA: `Math.max(sessões com step_view, completed)`. Ela
      // quebrou em 17/09/2026, quando o formulário curto substituiu o quiz de
      // 14 passos: o formulário não tem etapa nenhuma, logo não emite
      // `step_view`, logo `sessões com step_view` era 0 e o `Math.max` puxava o
      // número até `completed`. Resultado: "iniciou" virava exatamente igual a
      // "enviou" e a tela mostrava 100% de conversão início→envio todo dia —
      // pior que não mostrar nada, porque parecia um funil perfeito.
      //
      // Sem `Math.max(..., completed)` de propósito: o piso agora vem de sinal
      // real. No formulário curto o `marcarInicio()` dispara no primeiro foco E
      // no submit (src/components/landing/HeroLeadForm.tsx), então toda sessão
      // que enviou também tem o sinal de início — o piso não é necessário, e
      // fabricá-lo era justamente o defeito.
      //
      // No formulário curto `entered_quiz` e `started_quiz` ficam iguais por
      // construção: o mesmo toque marca os dois. A perda que interessa ali é
      // visitante → tocou no formulário → enviou, não início → envio.
      const sessionsStartedFlag = new Set(
        sessions.filter((s: any) => s.started_quiz === true).map((s: any) => s.id),
      );
      const sessionsIniciaram = new Set<string>([...sessionsWithQuizView, ...sessionsStartedFlag]);
      const hasStartSignal = hasEventSignal || sessionsStartedFlag.size > 0;
      const startedQuiz: number | null = hasStartSignal
        ? Math.min(sessionsIniciaram.size, uniqueVisitors ?? Number.MAX_SAFE_INTEGER)
        : null;

      // ===== Qual formulário este período viu ===============================
      //
      // `lead_sessions.quiz_variant` é gravado pelo próprio formulário
      // (FORM_VARIANT em HeroLeadForm.tsx = "form_curto") e pelo sorteio do
      // quiz antigo. Sem essa leitura o painel só sabia dizer "sem dados do
      // quiz novo" — a mesma frase para "ninguém respondeu" e para "este
      // período inteiro é do formulário curto, que não tem etapas". São coisas
      // opostas: a primeira é falta de dado, a segunda é o dado.
      const variantTally = new Map<string, number>();
      sessions.forEach((s: any) => {
        const v = (s.quiz_variant || "").trim();
        if (v) variantTally.set(v, (variantTally.get(v) || 0) + 1);
      });
      const sessoesFormCurto = variantTally.get("form_curto") || 0;
      const sessoesComVariante = [...variantTally.values()].reduce((a, b) => a + b, 0);
      const sessoesOutroQuiz = sessoesComVariante - sessoesFormCurto;

      // Button distribution
      const buttonEventCounts: Record<string, Set<string>> = {
        start_btn_1: new Set(), start_btn_2: new Set(), start_btn_3: new Set(),
      };
      filteredEvents.forEach((event: any) => {
        if (event.event_name === "start_click" && event.button_id && buttonEventCounts[event.button_id]) {
          buttonEventCounts[event.button_id].add(event.session_id);
        }
      });
      const buttonDistribution = {
        start_btn_1: buttonEventCounts.start_btn_1.size,
        start_btn_2: buttonEventCounts.start_btn_2.size,
        start_btn_3: buttonEventCounts.start_btn_3.size,
      };

      const sessionsWithSubmit = new Set(
        filteredEvents.filter((e: any) => e.event_name === "submit").map((e: any) => e.session_id)
      );
      const isLoadingStep = (stepId: string) => stepId.toLowerCase().includes("loading");

      // ====== QUIZ v2 ONLY ======
      // Critério de detecção: step_id ∈ V2_STEP_IDS abaixo. Qualquer outro step
      // (q1_nome, q2_whats, q3_insta, q4_mercado, q5_estagio, q6_investimento, q7_dor —
      // steps do quiz v1, descontinuado) é considerado v1 e IGNORADO no funil. Se o
      // período não tiver dados v2, step_funnel volta vazio e o front mostra "Sem dados
      // do quiz novo...".
      // IMPORTANTE: esta lista precisa bater 1:1 com STEP_IDS em src/pages/Quiz.tsx —
      // se alguém adicionar/remover uma etapa do quiz, atualizar aqui também (e em
      // STEP_LABELS_LOCAL em src/components/admin/FunnelMetricsTab.tsx). q12_loading é
      // deliberadamente excluído (tela de transição, não uma decisão do usuário) via
      // isLoadingStep() abaixo, não precisa estar na lista.
      const V2_STEP_IDS = [
        "q1_quer_vender",
        "q2_mercado",
        "q3_operacoes",
        "q4_faturamento",
        "q5_nome",
        "q6_whats",
        "q7_insta",
        "q8_email",
        "q9_dor",
        "q10_nps",
        "q11_aceita_call",
      ];
      const V2_STEP_SET = new Set(V2_STEP_IDS);
      const V2_LABELS: Record<string, string> = {
        q1_quer_vender: "Quer vender mais?",
        q2_mercado: "Mercado",
        q3_operacoes: "Operações ativas",
        q4_faturamento: "Faturamento atual",
        q5_nome: "Nome completo",
        q6_whats: "WhatsApp",
        q7_insta: "Instagram",
        q8_email: "E-mail",
        q9_dor: "Dor / Desejo",
        q10_nps: "Nota NPS",
        q11_aceita_call: "Aceita call de diagnóstico",
      };

      const stepCounts: Record<string, Set<string>> = {};
      const sessionViewedSteps: Record<string, Set<string>> = {};
      const sessionAdvancedFrom: Record<string, Set<string>> = {};
      let hasV1Data = false;

      filteredEvents.forEach((event: any) => {
        if (event.event_name === "step_view" && event.step_id) {
          if (!V2_STEP_SET.has(event.step_id)) {
            if (!isLoadingStep(event.step_id)) hasV1Data = true;
            return;
          }
          if (!stepCounts[event.step_id]) stepCounts[event.step_id] = new Set();
          stepCounts[event.step_id].add(event.session_id);
          if (!sessionViewedSteps[event.session_id]) sessionViewedSteps[event.session_id] = new Set();
          sessionViewedSteps[event.session_id].add(event.step_id);
        }
        if (event.event_name === "step_next" && event.metadata) {
          const metadata = event.metadata as Record<string, unknown>;
          const fromStep = metadata?.from_step as string | undefined;
          if (fromStep && V2_STEP_SET.has(fromStep)) {
            if (!sessionAdvancedFrom[event.session_id]) sessionAdvancedFrom[event.session_id] = new Set();
            sessionAdvancedFrom[event.session_id].add(fromStep);
          }
        }
      });

      const v2SessionIds = new Set<string>();
      Object.values(stepCounts).forEach((set) => set.forEach((id) => v2SessionIds.add(id)));
      const hasV2Data = v2SessionIds.size > 0;

      const stepFunnel: Array<{
        step_id: string;
        label: string;
        count: number;
        flow: string;
        flow_started: number;
        flow_completed: number;
      }> = [];

      let v2Completed = 0;
      let v2Entered = 0;

      if (hasV2Data) {
        v2Completed = Array.from(v2SessionIds).filter((sid) => sessionsWithSubmit.has(sid)).length;
        v2Entered = Math.max(stepCounts["q1_quer_vender"]?.size || 0, v2SessionIds.size);
        V2_STEP_IDS.forEach((stepId) => {
          stepFunnel.push({
            step_id: stepId,
            label: V2_LABELS[stepId],
            count: stepCounts[stepId]?.size || 0,
            flow: "v2",
            flow_started: v2Entered,
            flow_completed: v2Completed,
          });
        });
      }

      const dropOffs: Record<string, number> = {};
      Object.entries(sessionViewedSteps).forEach(([sessionId, viewedSteps]) => {
        if (sessionsWithSubmit.has(sessionId)) return;
        const advancedFrom = sessionAdvancedFrom[sessionId] || new Set();
        let dropOffStep: string | null = null;
        let dropOffIndex = -1;
        viewedSteps.forEach((step) => {
          const stepIndex = V2_STEP_IDS.indexOf(step);
          if (stepIndex >= 0 && !advancedFrom.has(step) && stepIndex > dropOffIndex) {
            dropOffStep = step;
            dropOffIndex = stepIndex;
          }
        });
        if (dropOffStep) dropOffs[dropOffStep] = (dropOffs[dropOffStep] || 0) + 1;
      });

      console.log("[FUNNEL v2] Sessions:", v2SessionIds.size, "Completed:", v2Completed, "HasV1:", hasV1Data);

      // Qual fluxo o período tem, para a tela dizer a frase certa quando não há
      // funil por etapa. Sem etapa registrada e com sessões de `form_curto`, a
      // resposta não é "sem dados": é "este formulário não tem etapas".
      const quizFlow: "form_curto" | "quiz_v2" | "misto" | "desconhecido" =
        hasV2Data && sessoesFormCurto > 0
          ? "misto"
          : hasV2Data
            ? "quiz_v2"
            : sessoesFormCurto > 0
              ? "form_curto"
              : "desconhecido";

      return new Response(
        JSON.stringify({
          total_visitors: total,
          unique_visitors: uniqueVisitors,
          has_reliable_ip_data: hasReliableIpData,
          ip_coverage_percent: Math.round(ipCoverage * 100),
          filtered_out: filteredOutCount,
          entered_quiz: enteredQuiz,
          started_quiz: startedQuiz,
          completed,
          landing_views: landingViews,
          landing_hits_total: landingHitsTotal,
          meta_clicks: metaClicks,
          loss_clicks_vs_views: Math.max(0, metaClicks - landingViews),
          conversion_rate: uniqueVisitors && uniqueVisitors > 0 ? (completed / uniqueVisitors * 100).toFixed(1) : null,
          completion_rate: enteredQuiz && enteredQuiz > 0 ? (completed / enteredQuiz * 100).toFixed(1) : null,
          // Flags de qualidade de dado: quando false, o front NÃO deve mostrar um número
          // (nem 0) pros campos correspondentes — deve mostrar um estado "sem dados" explícito.
          visitors_known: hasVisitorSignal,
          entered_quiz_known: hasEventSignal,
          started_quiz_known: hasStartSignal,
          button_distribution: buttonDistribution,
          step_funnel: stepFunnel,
          drop_offs: dropOffs,
          quiz_v2_empty: !hasV2Data,
          quiz_v1_present: hasV1Data,
          // ── Qual formulário este período viu ─────────────────────────────
          // "form_curto"  → não existe funil por etapa, por construção
          // "quiz_v2"     → o quiz de 14 passos, que tem step_funnel
          // "misto"       → o período pega a virada de 17/09/2026
          // "desconhecido"→ nenhuma sessão gravou variante (dado antigo ou vazio)
          quiz_flow: quizFlow,
          sessoes_form_curto: sessoesFormCurto,
          sessoes_outro_quiz: sessoesOutroQuiz,
          // Alimenta o seletor de criativo do admin (já com os nomes de UTM
          // normalizados, então cada criativo aparece uma vez só).
          creatives_available: creativesAvailable,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    // DELETE /leads - Delete multiple leads
    if (path === "/leads" && req.method === "DELETE") {
      const body = await req.json();
      const ids = body.ids as string[];
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return new Response(
          JSON.stringify({ error: "IDs não fornecidos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── Guarda de histórico comercial (decisão 3 do pré-mortem) ─────────
      // `lead_interactions.lead_id` e `lead_tasks.lead_id` são ON DELETE
      // RESTRICT, então o banco já recusa — mas devolveria um erro cru de chave
      // estrangeira (500) que não diz o que fazer. Esta guarda transforma isso
      // numa recusa legível, e vale para a exclusão individual E para a em
      // lote, que é justamente a que apagaria muitos de uma vez sem ninguém
      // conferir.
      //
      // Um lead trabalhado não se apaga: marca-se como perdido (motivo
      // `duplicado`, quando for o caso). Apagar só faz sentido para lead de
      // teste, que por definição não tem histórico.
      const historico = await leadsComHistoricoComercial(supabase, ids);
      if (historico.size > 0) {
        const detalhe = [...historico.entries()].map(([id, c]) => ({
          lead_id: id, interacoes: c.interacoes, tarefas: c.tarefas,
        }));
        return new Response(
          JSON.stringify({
            error: `${historico.size} de ${ids.length} lead(s) têm histórico comercial e não podem ser apagados. ` +
              `Marque como perdido (motivo "duplicado", se for o caso) em vez de excluir.`,
            leads_com_historico: detalhe,
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Deleting leads:", ids);

      const { error } = await supabase
        .from("leads")
        .delete()
        .in("id", ids);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, deleted: ids.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /campaigns - Get campaign analytics
    if (path === "/campaigns" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const source = url.searchParams.get("source");
      const campaign = url.searchParams.get("campaign");

      // Get sessions with campaign data
      let sessionsQuery = supabase.from("lead_sessions").select("*");
      if (from) sessionsQuery = sessionsQuery.gte("created_at", from);
      if (to) sessionsQuery = sessionsQuery.lte("created_at", to.includes("T") ? to : to + "T23:59:59Z");
      if (source && source !== "all") sessionsQuery = sessionsQuery.eq("utm_source", source);
      if (campaign && campaign !== "all") {
        sessionsQuery = sessionsQuery.or(`utm_campaign.eq.${campaign},campaign_id.eq.${campaign}`);
      }

      const { data: sessions, error: sessionsError } = await sessionsQuery;
      if (sessionsError) throw sessionsError;

      // Get meta ads cache for name resolution
      const { data: metaCache } = await supabase.from("meta_ads_cache").select("*");
      const cacheByAdId = new Map(metaCache?.map(c => [c.ad_id, c]) || []);
      const cacheByCampaignId = new Map(metaCache?.map(c => [c.campaign_id, c]) || []);

      // Calculate metrics
      const totalSessions = sessions?.length || 0;
      const startedQuiz = sessions?.filter(s => s.started_quiz).length || 0;
      const completed = sessions?.filter(s => s.completed).length || 0;
      const completionRate = startedQuiz > 0 ? (completed / startedQuiz) * 100 : 0;

      // Group by campaign
      const campaignMap = new Map<string, { 
        campaign_id: string | null;
        utm_campaign: string | null;
        campaign_name: string | null;
        display_name: string; // The name to show in the UI
        total: number; 
        started: number; 
        completed: number;
      }>();

      sessions?.forEach(s => {
        const key = s.campaign_id || s.utm_campaign || "direct";
        
        // Get the best display name: utm_campaign > campaign_name from cache > campaign_id
        const displayName = s.utm_campaign || cacheByCampaignId.get(s.campaign_id)?.campaign_name || s.campaign_id || "Tráfego Direto";
        
        const existing = campaignMap.get(key) || {
          campaign_id: s.campaign_id,
          utm_campaign: s.utm_campaign,
          campaign_name: cacheByCampaignId.get(s.campaign_id)?.campaign_name || null,
          display_name: displayName,
          total: 0,
          started: 0,
          completed: 0,
        };
        existing.total++;
        if (s.started_quiz) existing.started++;
        if (s.completed) existing.completed++;
        campaignMap.set(key, existing);
      });

      const campaigns = Array.from(campaignMap.values())
        .map(c => ({ ...c, completion_rate: c.started > 0 ? (c.completed / c.started) * 100 : 0 }))
        .sort((a, b) => b.completed - a.completed);

      // Group by ad
      const adMap = new Map<string, {
        ad_id: string | null;
        utm_content: string | null;
        ad_name: string | null;
        display_name: string; // The name to show in the UI
        campaign_name: string | null;
        campaign_display_name: string; // The campaign name to show in the UI
        total: number;
        started: number;
        completed: number;
      }>();

      sessions?.forEach(s => {
        // Prioritize utm_content for display since it contains the actual names from Meta Ads URL params
        const key = s.ad_id || s.utm_content || "no_ad";
        const cached = cacheByAdId.get(s.ad_id);
        
        // Get the best display name: utm_content > ad_name from cache > ad_id
        const displayName = s.utm_content || cached?.ad_name || s.ad_id || "Não identificado";
        
        // Get the best campaign display name: utm_campaign > campaign_name from cache > campaign_id
        const campaignDisplayName = s.utm_campaign || cached?.campaign_name || cacheByCampaignId.get(s.campaign_id)?.campaign_name || s.campaign_id || "-";
        
        const existing = adMap.get(key) || {
          ad_id: s.ad_id,
          utm_content: s.utm_content,
          ad_name: cached?.ad_name || null,
          display_name: displayName,
          campaign_name: cached?.campaign_name || cacheByCampaignId.get(s.campaign_id)?.campaign_name || null,
          campaign_display_name: campaignDisplayName,
          total: 0,
          started: 0,
          completed: 0,
        };
        existing.total++;
        if (s.started_quiz) existing.started++;
        if (s.completed) existing.completed++;
        adMap.set(key, existing);
      });

      const ads = Array.from(adMap.values())
        .map(a => ({ ...a, completion_rate: a.started > 0 ? (a.completed / a.started) * 100 : 0 }))
        .sort((a, b) => b.completed - a.completed);

      // Group by source
      const sourceMap = new Map<string, { utm_source: string; total: number; completed: number }>();
      sessions?.forEach(s => {
        const key = s.utm_source || "direct";
        const existing = sourceMap.get(key) || { utm_source: key, total: 0, completed: 0 };
        existing.total++;
        if (s.completed) existing.completed++;
        sourceMap.set(key, existing);
      });

      const sources = Array.from(sourceMap.values()).sort((a, b) => b.total - a.total);

      // Drop-off by step per campaign
      const stepDropoffs: Array<{ step_id: string; campaign_id: string | null; utm_campaign: string | null; count: number }> = [];
      const stepOrder = ["q1_nome", "q2_whats", "q3_insta", "q4_mercado", "q5_estagio", "q6_dor"];
      
      // Group non-completed sessions by their current_step_id and campaign
      const dropoffMap = new Map<string, number>();
      sessions?.filter(s => !s.completed && s.current_step_id).forEach(s => {
        const key = `${s.current_step_id}|${s.campaign_id || s.utm_campaign || "direct"}`;
        dropoffMap.set(key, (dropoffMap.get(key) || 0) + 1);
      });

      dropoffMap.forEach((count, key) => {
        const [stepId, campaignKey] = key.split("|");
        stepDropoffs.push({
          step_id: stepId,
          campaign_id: campaignKey === "direct" ? null : campaignKey,
          utm_campaign: campaignKey === "direct" ? null : campaignKey,
          count,
        });
      });

      stepDropoffs.sort((a, b) => {
        const aIdx = stepOrder.indexOf(a.step_id);
        const bIdx = stepOrder.indexOf(b.step_id);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return b.count - a.count;
      });

      return new Response(
        JSON.stringify({
          total_sessions: totalSessions,
          started_quiz: startedQuiz,
          completed,
          completion_rate: completionRate,
          campaigns,
          ads,
          sources,
          stepDropoffs,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /campaigns/sessions - Get sessions with campaign data
    if (path === "/campaigns/sessions" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const source = url.searchParams.get("source");
      const campaign = url.searchParams.get("campaign");
      const search = url.searchParams.get("q");
      const limit = parseInt(url.searchParams.get("limit") || "100");

      let query = supabase
        .from("lead_sessions")
        .select("id, created_at, campaign_id, utm_campaign, ad_id, utm_content, utm_source, utm_medium, start_button_id, current_step_id, completed, lead_name")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to.includes("T") ? to : to + "T23:59:59Z");
      if (source && source !== "all") query = query.eq("utm_source", source);
      if (campaign && campaign !== "all") {
        query = query.or(`utm_campaign.eq.${campaign},campaign_id.eq.${campaign}`);
      }
      if (search) {
        query = query.or(`lead_name.ilike.%${search}%,utm_campaign.ilike.%${search}%,utm_content.ilike.%${search}%`);
      }

      const { data: sessions, error } = await query;
      if (error) throw error;

      // Enrich with cache names
      const { data: metaCache } = await supabase.from("meta_ads_cache").select("*");
      const cacheByAdId = new Map(metaCache?.map(c => [c.ad_id, c]) || []);
      const cacheByCampaignId = new Map(metaCache?.map(c => [c.campaign_id, c]) || []);

      const enrichedSessions = sessions?.map(s => ({
        ...s,
        campaign_name: cacheByCampaignId.get(s.campaign_id)?.campaign_name || null,
        ad_name: cacheByAdId.get(s.ad_id)?.ad_name || null,
      }));

      return new Response(
        JSON.stringify({ data: enrichedSessions }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /kommo-logs - List kommo webhook logs
    if (path === "/kommo-logs" && req.method === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);

      const { data, error } = await supabase
        .from("kommo_webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /kommo-test - Send test lead to Kommo
    if (path === "/kommo-test" && req.method === "POST") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const webhookSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET") || '';

      const testPayload = {
        _source: 'admin_test',
        lead_db_id: null,
        nome_completo: 'Teste Admin ' + new Date().toLocaleTimeString('pt-BR'),
        whatsapp: '(11) 99999-8888',
        instagram: '@teste_admin',
        mercado: 'Infoproduto',
        estagio_negocio: 'Escala (buscando otimização)',
        investimento_faixa: 'R$ 8k – 20k',
        dor_desejo: 'Teste automático do painel admin para validar integração Kommo.',
        score: 9,
        tier: 'Large',
      };

      const response = await fetch(`${supabaseUrl}/functions/v1/kommo-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': webhookSecret,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(testPayload),
      });

      const responseText = await response.text();
      let responseJson;
      try { responseJson = JSON.parse(responseText); } catch { responseJson = { raw: responseText }; }

      return new Response(
        JSON.stringify({
          test_status: response.ok ? 'SUCCESS' : 'FAILED',
          http_status: response.status,
          response: responseJson,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /kommo-retry/:leadId - Retry Kommo sync for a specific lead
    const retryMatch = path.match(/^\/kommo-retry\/([a-f0-9-]+)$/);
    if (retryMatch && req.method === "POST") {
      const leadId = retryMatch[1];

      // Get lead data
      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();

      if (leadErr || !lead) {
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const webhookSecretVal = Deno.env.get("INTERNAL_WEBHOOK_SECRET") || '';

      const retryPayload = {
        _source: 'admin_retry',
        lead_db_id: lead.id,
        nome_completo: lead.nome_completo,
        whatsapp: lead.whatsapp,
        instagram: lead.instagram,
        mercado: lead.mercado,
        estagio_negocio: lead.estagio_negocio,
        investimento_faixa: lead.investimento_faixa,
        dor_desejo: lead.dor_desejo,
        score: lead.score,
        tier: lead.tier,
        utm_source: lead.utm_source,
        utm_campaign: lead.utm_campaign,
        utm_content: lead.utm_content,
      };

      // Update retry count
      await supabase.from("leads")
        .update({ kommo_retry_count: (lead.kommo_retry_count || 0) + 1, kommo_status: 'retrying' })
        .eq("id", leadId);

      const response = await fetch(`${supabaseUrl}/functions/v1/kommo-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': webhookSecretVal,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(retryPayload),
      });

      const responseText = await response.text();
      let responseJson;
      try { responseJson = JSON.parse(responseText); } catch { responseJson = { raw: responseText }; }

      return new Response(
        JSON.stringify({
          retry_status: response.ok ? 'SUCCESS' : 'FAILED',
          http_status: response.status,
          response: responseJson,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── GET /creatives ────
    if (path === "/creatives" && req.method === "GET") {
      // ── A JANELA É UMA SÓ, E É OBRIGATÓRIA ───────────────────────────────
      //
      // Esta rota lê de DUAS grandezas de tempo: leads/sessões por `created_at`
      // (instante, UTC) e gasto por `ad_spend.date` (dia, no fuso da conta). Os
      // parâmetros também vinham em pares — `from`/`to` e `from_date`/`to_date`
      // — e cada metade filtrava a sua. Bastava uma das metades faltar para
      // aquele lado varrer a base inteira em silêncio: leads de 2020 contra
      // gasto da semana, ou o contrário. O painel não mostrava erro nenhum,
      // mostrava números.
      //
      // Agora as duas metades são derivadas uma da outra e a janela é sempre
      // declarada na resposta (`data_quality.janela`). Sem parâmetro nenhum, o
      // padrão são os últimos 7 dias — o mesmo padrão da tela —, nunca "tudo".
      const fromParam = url.searchParams.get("from");
      const toParam = url.searchParams.get("to");
      let from = fromParam;
      let to = toParam;
      let fromDate = url.searchParams.get("from_date") || (fromParam && !fromParam.includes("T") ? fromParam : null);
      let toDate = url.searchParams.get("to_date") || (toParam && !toParam.includes("T") ? toParam : null);
      {
        // O fuso em que a tela montou o filtro, deduzido da hora do `from`.
        const offsetMin = offsetDoFiltro(from);
        /** O dia (no fuso do filtro) de um instante ISO. */
        const diaDoInstante = (iso: string): string =>
          new Date(new Date(iso).getTime() + offsetMin * 60000).toISOString().slice(0, 10);
        /** 00:00 daquele dia, no fuso do filtro, em UTC. */
        const inicioDoDia = (dia: string): string =>
          new Date(Date.parse(dia + "T00:00:00Z") - offsetMin * 60000).toISOString();
        /** 23:59:59.999 daquele dia, no fuso do filtro, em UTC. */
        const fimDoDia = (dia: string): string =>
          new Date(Date.parse(dia + "T23:59:59.999Z") - offsetMin * 60000).toISOString();

        if (!from && !to && !fromDate && !toDate) {
          const hoje = diaNoFuso(new Date(), FUSO_PADRAO_CONTA);
          const seteAtras = new Date(Date.parse(hoje + "T00:00:00Z") - 6 * 86400000).toISOString().slice(0, 10);
          fromDate = seteAtras;
          toDate = hoje;
        }
        if (!fromDate && from) fromDate = from.includes("T") ? diaDoInstante(from) : from;
        if (!toDate && to) toDate = to.includes("T") ? diaDoInstante(to) : to;
        if (!from && fromDate) from = inicioDoDia(fromDate);
        if (!to && toDate) to = fimDoDia(toDate);
      }
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;
      const campaignType = url.searchParams.get("campaign_type"); // "mql" | "lead" | null (all)
      // Filter by specific campaign names (comma-separated). When set, ALL aggregations
      // (leads, spend, sales, meetings) are restricted to rows matching those campaigns.
      const campaignsParam = url.searchParams.get("campaigns");
      const campaignFilter: Set<string> | null = campaignsParam
        ? new Set(campaignsParam.split("|||").map(c => c.trim()).filter(Boolean))
        : null;
      const matchesCampaignFilter = (name: string | null | undefined): boolean => {
        if (!campaignFilter) return true;
        if (!name) return false;
        return campaignFilter.has(name);
      };

      // Helper to check if a campaign name is an MQL campaign
      function isMqlCampaign(campaignName: string | null): boolean {
        if (!campaignName) return false;
        const lower = campaignName.toLowerCase();
        return lower.includes('obj: "mql"') || lower.includes('obj: \u201cmql\u201d') || lower.includes('"mql"') || lower.includes('mql');
      }

      // Helper to normalize creative key — a MESMA normalização de sempre,
      // agora vinda de `identidade_criativo.ts` para o teste exercitar este
      // código e não uma cópia dele. `manual_sales.creative_key` está gravada
      // nesta forma, então ela não pode mudar.
      const normalizeKey = normalizarChaveCriativo;

      // ── MACRO LITERAL DA META NUNCA É DADO ────────────────────────────────
      //
      // `ad_id={{ad.id}}` na URL é clique em PRÉVIA de anúncio dentro do
      // Gerenciador, não tráfego. Em 16/09/2026 um lead (Vic, score 89) nasceu
      // com os três IDs como macro crua e entrou na tabela como se fosse mídia.
      // `sanitizarIdentificador` é a ÚNICA porta de entrada de
      // campaign_id/adset_id/ad_id/utm_* nesta rota, e `ehMacroLiteral` manda
      // o registro para um balde próprio — separado do orgânico.
      const idLimpo = sanitizarIdentificador;

      // MQL logic — MQL = faturamento >= 10k (Rodger removido, agora tudo é Caio)
      const MQL_FAIXAS = [
        "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
        "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
        "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
        "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
        "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
        "Acima de R$ 10 milhões",
        // Legacy quiz format faixas
        "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
      ];
      function isMql(_estagio: string, investimento: string | null, sdrOverride?: string | null): boolean {
        if (sdrOverride === "Dara" || sdrOverride === "Miguel") return false;
        return investimento ? MQL_FAIXAS.includes(investimento) : false;
      }

      // ── As quatro fontes, em PARALELO ────────────────────────────────────
      //
      // Eram lidas em fila: leads (paginado), depois gasto (paginado), depois
      // vendas, depois reuniões. Nenhuma depende da anterior, então o tempo da
      // rota era a soma de quatro idas ao banco quando podia ser a da mais
      // lenta. Numa aba que já espera por outras rotas, isso é o que separa
      // "abriu" de "está carregando".
      const PAGE_SIZE = 1000;

      /** Lê todas as páginas de uma consulta. */
      const paginar = async (build: (from: number) => any): Promise<any[]> => {
        const linhas: any[] = [];
        let offset = 0;
        for (;;) {
          const { data, error } = await build(offset).range(offset, offset + PAGE_SIZE - 1);
          if (error) throw error;
          if (data?.length) linhas.push(...data);
          if ((data?.length || 0) < PAGE_SIZE) return linhas;
          offset += PAGE_SIZE;
        }
      };

      // ── O mês inteiro, para o CAC ────────────────────────────────────────
      //
      // O CAC não pode depender do filtro de tela. Olhar "hoje" e dividir a
      // mídia do dia pelas vendas do dia dá um custo por venda que não existe:
      // a venda de hoje foi paga por semanas de tráfego, e o tráfego de hoje
      // vai pagar vendas que ainda não aconteceram. Então o custo por venda é
      // sempre mensal — mídia do mês ÷ vendas do mês — e a tela só escolhe
      // quais vendas exibir.
      const primeiroDiaDoMes = (d: string) => d.slice(0, 7) + "-01";
      const ultimoDiaDoMes = (d: string) => {
        const [y, m] = d.slice(0, 7).split("-").map(Number);
        return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      };
      // O "hoje" que decide o MÊS DO CAC é o dia NO FUSO DA CONTA, não em UTC.
      // `new Date().toISOString().slice(0,10)` fazia o mês virar às 21:00 BRT
      // do último dia do mês: nas últimas três horas de 30/09, o CAC passaria a
      // dividir a mídia de outubro (quase zero) pelas vendas de outubro (zero).
      // Ver `diaNoFuso` em identidade_criativo.ts.
      const hojeISO = diaNoFuso(new Date(), FUSO_PADRAO_CONTA);
      const mesInicio = primeiroDiaDoMes(fromDate || toDate || hojeISO);
      const mesFim = ultimoDiaDoMes(toDate || fromDate || hojeISO);

      const [allLeads, spendData, salesData, meetingsData, spendMes, salesMes] = await Promise.all([
        paginar(() => {
          // `score` (a nota GRAVADA) entra aqui em 16/09/2026 para o HQL
          // desta rota ser o MESMO número do bloco "Desempenho por conta" e do
          // evento HighQualityLead enviado à Meta. O `computeScore` abaixo
          // recalcula ao vivo e serve para a média; contar o corte pelo
          // recalculado faria o painel discordar de si mesmo.
          //
          // `score_version` entra em 17/09/2026: o corte é 73 no quiz (v2.3) e
          // 67 no formulário curto (v3-form), e é ela quem diz qual vale.
          //
          // `ad_id`, `campaign_id` e `adset_id` entram em 18/09/2026: a linha
          // da tabela passa a ser o par (CONTA, ANÚNCIO) e o `ad_id` do lead é
          // o caminho FORTE para chegar nela. Sem estas três colunas o painel
          // só tinha o nome — que é o que fundia três contas numa linha.
          let q = supabase.from("leads").select("id, created_at, origem_lead, utm_content, utm_campaign, utm_source, campaign_id, adset_id, ad_id, estagio_negocio, investimento_faixa, sdr_override, score, score_version, tier, ip_address, fbp, mercado, operacoes_ativas, nps_score, dor_desejo, raw_answers_json");
          if (from) q = q.gte("created_at", from);
          if (toEnd) q = q.lte("created_at", toEnd);
          return q;
        }),
        paginar(() => {
          let sq = supabase.from("ad_spend").select("*");
          if (fromDate) sq = sq.gte("date", fromDate);
          if (toDate) sq = sq.lte("date", toDate);
          return sq;
        }),
        (async () => {
          // Só mídia paga. Indicação e social selling não têm criativo, não têm
          // campanha e não custaram mídia: contá-las aqui derrubaria o custo por
          // venda de toda a conta com receita que o tráfego não gerou.
          let q = supabase.from("manual_sales").select("*").eq("origem", "midia_paga");
          if (fromDate) q = q.gte("sale_date", fromDate);
          if (toDate) q = q.lte("sale_date", toDate);
          const { data } = await q;
          return data || [];
        })(),
        (async () => {
          // Duas janelas, não uma. Reunião AGENDADA conta no dia em que foi
          // marcada; REALIZADA conta no dia em que aconteceu. Uma call marcada
          // em 28/08 e feita em 02/09 é resultado de setembro, e filtrar só por
          // `created_at` a deixava fora do mês inteiro — o mês perdia a reunião
          // que de fato aconteceu nele.
          let q = supabase.from("meetings").select("*").eq("origem", "midia_paga");
          if (from && toEnd) {
            q = q.or(
              `and(created_at.gte.${from},created_at.lte.${toEnd}),` +
              `and(scheduled_at.gte.${from},scheduled_at.lte.${toEnd})`,
            );
          } else if (from) {
            q = q.or(`created_at.gte.${from},scheduled_at.gte.${from}`);
          } else if (toEnd) {
            q = q.or(`created_at.lte.${toEnd},scheduled_at.lte.${toEnd}`);
          }
          const { data } = await q;
          return data || [];
        })(),
        paginar(() =>
          supabase.from("ad_spend").select("date, spend, campaign_name, campaign_id, ad_account_id")
            .gte("date", mesInicio).lte("date", mesFim)
        ),
        (async () => {
          const { data } = await supabase.from("manual_sales")
            .select("sale_date, sale_type, revenue")
            .eq("origem", "midia_paga")
            // Reembolsada não paga mídia: entraria no denominador do CAC como
            // venda e faria o custo por venda parecer menor do que foi.
            .is("refunded_at", null)
            .gte("sale_date", mesInicio).lte("sale_date", mesFim);
          return data || [];
        })(),
      ]);

      // ── ÍNDICE DE IDENTIDADE DOS ANÚNCIOS ────────────────────────────────
      //
      // A partir daqui a linha da tabela é o par (CONTA, ANÚNCIO). O índice diz,
      // para cada `ad_id`: em que conta o `ad_spend` o registrou, qual é o nome
      // atual dele e quais `ad_id` compartilham cada nome — este último é o que
      // permite declarar "nome ambíguo" em vez de escolher uma conta no chute.
      //
      // Um anúncio pode ter trazido lead no período sem ter gastado nele (verba
      // de ontem, lead de hoje). A identidade desses vem de `ad_spend` de outra
      // data e, na falta, de `meta_ads_cache` — o mesmo caminho da rota
      // /contas-desempenho, para as duas telas nunca discordarem sobre a conta
      // do mesmo anúncio.
      // `campaign_id`, `adset_id` e `spend` entram em 18/09/2026 (tarde): os dois
      // primeiros dão a CONTA de um registro que só tem nome, o terceiro é o
      // desempate quando um nome serve a vários anúncios. Ver `resolverIdentidade`.
      const CAMPOS_IDENTIDADE = "ad_account_id, ad_id, ad_name, utm_content, creative_key, date, campaign_id, adset_id, spend";
      const identidadesExtrasCriativo: any[] = [];
      {
        const comGasto = new Set((spendData || []).map((s: any) => idLimpo(s.ad_id)).filter(Boolean) as string[]);
        const faltando = [...new Set(
          (allLeads || [])
            .map((l: any) => idLimpo(l.ad_id))
            .filter((id): id is string => !!id && !comGasto.has(id)),
        )];
        const PEDACO_ID = 100;
        // Gasto de FORA da janela não entra em desempate nenhum: estas linhas
        // existem só para dizer de quem é o anúncio. Ver o bloco dos nomes.
        identidadesExtrasCriativo.push(...(await emLotes<any>(faltando, PEDACO_ID, (lote) =>
          supabase.from("ad_spend").select(CAMPOS_IDENTIDADE)
            .in("ad_id", lote).order("date", { ascending: false }).limit(1000)
        )).map((x: any) => ({ ...x, spend: 0 })));
        const achados = new Set(identidadesExtrasCriativo.map((x: any) => x.ad_id));
        const aindaSem = faltando.filter((id) => !achados.has(id));
        identidadesExtrasCriativo.push(...await emLotes<any>(aindaSem, PEDACO_ID, (lote) =>
          supabase.from("meta_ads_cache").select("ad_account_id, ad_id, ad_name").in("ad_id", lote)
        ));

        // ── E os anúncios que o índice só conhece pelo NOME ────────────────
        //
        // Um lead pode trazer `utm_content` sem `ad_id` (link antigo, webview,
        // storage limpo). Se o anúncio daquele nome não gastou DENTRO da
        // janela, ele não está no índice, e o lead cairia no balde "sem
        // anúncio" mesmo existindo o anúncio — perdendo conta, gasto e nome.
        // Então os nomes que sobraram são procurados em `ad_spend` por
        // `creative_key`, sem recorte de data: o que se quer daqui é
        // IDENTIDADE (qual anúncio, de qual conta), nunca dinheiro — o gasto
        // da linha continua vindo só de `spendData`, que é a janela.
        const nomesConhecidos = new Set(
          [...(spendData || []), ...identidadesExtrasCriativo]
            .map((x: any) => idLimpo(x.creative_key) ?? (x.ad_name ? normalizeKey(String(x.ad_name)) : null))
            .filter(Boolean) as string[],
        );
        const nomesFaltando = [...new Set(
          (allLeads || [])
            .filter((l: any) => !idLimpo(l.ad_id))
            .map((l: any) => { const n = idLimpo(l.utm_content); return n && !ehIdNumerico(n) ? normalizeKey(n) : null; })
            .filter((k): k is string => !!k && k.length > 0 && !nomesConhecidos.has(k)),
        )];
        // `spend` é zerado de propósito: estas linhas são de FORA da janela e
        // só entram para dizer quem é o anúncio. Deixar o valor entraria no
        // desempate por gasto com dinheiro que a tela não está mostrando.
        identidadesExtrasCriativo.push(...(await emLotes<any>(nomesFaltando, PEDACO_ID, (lote) =>
          supabase.from("ad_spend").select(CAMPOS_IDENTIDADE)
            .in("creative_key", lote).order("date", { ascending: false }).limit(2000)
        )).map((x: any) => ({ ...x, spend: 0 })));
      }
      const indiceAnuncios: IndiceDeAnuncios = montarIndiceDeAnuncios([
        ...(spendData || []),
        ...identidadesExtrasCriativo,
      ]);

      /** A identidade da linha de um registro qualquer, com a macro já filtrada. */
      const identidadeDe = (e: {
        ad_id?: unknown; ad_account_id?: unknown; nome?: unknown;
        campaign_id?: unknown; adset_id?: unknown; outrosIds?: unknown[];
      }): IdentidadeDaLinha =>
        resolverIdentidade(
          {
            ad_id: (e.ad_id ?? null) as string | null,
            ad_account_id: (e.ad_account_id ?? null) as string | null,
            nome: (e.nome ?? null) as string | null,
            // Campanha e conjunto não são só checagem de macro: são o caminho
            // para a CONTA de um registro que chegou sem `ad_id`. Sem eles o
            // nome não tinha como saber em qual das três contas ele rodou.
            campaign_id: (e.campaign_id ?? null) as string | null,
            adset_id: (e.adset_id ?? null) as string | null,
            outrosIds: (e.outrosIds ?? []) as Array<string | null | undefined>,
          },
          indiceAnuncios,
        );

      // Custo por venda de cada mês tocado pelo filtro: mídia do mês inteiro
      // dividida pelas vendas do mês inteiro. Os mesmos filtros de campanha da
      // tela valem aqui, senão o CAC contaria mídia que a tela não mostra.
      const cacPorMes: Record<string, { spend: number; sales: number; cac: number }> = {};
      for (const s of (spendMes || [])) {
        if (campaignType === "mql" && !isMqlCampaign(s.campaign_name)) continue;
        if (campaignType === "lead" && isMqlCampaign(s.campaign_name)) continue;
        if (campaignFilter && !matchesCampaignFilter(s.campaign_name)) continue;
        const ym = String(s.date).slice(0, 7);
        (cacPorMes[ym] ??= { spend: 0, sales: 0, cac: 0 }).spend += Number(s.spend) || 0;
      }
      for (const v of (salesMes || [])) {
        const ym = String(v.sale_date).slice(0, 7);
        (cacPorMes[ym] ??= { spend: 0, sales: 0, cac: 0 }).sales += 1;
      }
      for (const ym of Object.keys(cacPorMes)) {
        const m = cacPorMes[ym];
        m.cac = m.sales > 0 ? m.spend / m.sales : 0;
      }

      // NOME DE CAMPANHA NAO E IDENTIDADE.
      //
      // O CAC mensal acima e filtrado por `campaign_name`, e nome se repete
      // entre contas. Duas campanhas chamadas "Teste" em contas diferentes sao
      // DUAS campanhas, e somar as duas num CAC daria um numero plausivel e
      // errado. A identidade tecnica e (ad_account_id, campaign_id).
      //
      // Em 10/09/2026 nenhum nome colide: o backfill de ad_account_id resolveu
      // as 162 linhas orfas que criavam colisao artificial. Isto existe para o
      // dia em que voltar a colidir — a ambiguidade sai na resposta em vez de
      // virar soma silenciosa.
      const identidadesPorNome = new Map<string, Set<string>>();
      for (const s of (spendMes || [])) {
        const nome = (s as any).campaign_name;
        if (!nome) continue;
        const identidade = `${(s as any).ad_account_id ?? "(sem conta)"}|${(s as any).campaign_id ?? "(sem id)"}`;
        if (!identidadesPorNome.has(nome)) identidadesPorNome.set(nome, new Set());
        identidadesPorNome.get(nome)!.add(identidade);
      }
      const campanhasComNomeAmbiguo = Array.from(identidadesPorNome.entries())
        .filter(([, ids]) => ids.size > 1)
        .map(([nome, ids]) => ({
          campaign_name: nome,
          identidades: Array.from(ids).map((x) => {
            const [conta, id] = x.split("|");
            return { ad_account_id: conta, campaign_id: id };
          }),
        }));
      if (campanhasComNomeAmbiguo.length > 0) {
        console.warn("[creatives] CROSS_ACCOUNT_MERGE_RISK:", JSON.stringify(campanhasComNomeAmbiguo));
      }

      // Determine active status: check if creative has ad_spend in the last 3 days.
      // O dia de corte é o dia NO FUSO DA CONTA, porque `ad_spend.date` também
      // é — comparar com um dia em UTC acendia e apagava a bolinha verde por
      // três horas todo fim de dia. E a chave é a LINHA (conta+anúncio): um
      // anúncio parado na CA05 não fica "ativo" porque o homônimo da CA02 gastou.
      const now = new Date();
      const threeDaysAgo = diaNoFuso(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), FUSO_PADRAO_CONTA);
      const recentSpendKeys = new Set<string>();
      for (const s of (spendData || [])) {
        if (s.date >= threeDaysAgo) {
          const id = identidadeDe({ ad_id: s.ad_id, ad_account_id: s.ad_account_id, nome: s.ad_name ?? s.utm_content });
          recentSpendKeys.add(id.row_key);
        }
      }

      /**
       * Quantos sprints uma venda representa.
       *
       * O Sprint é vendido por nível: "Sprint nível 4" são quatro sprints numa
       * linha só. Contar a linha subestima o volume e infla o ticket do
       * produto. Nulo vale 1 — venda antiga sem o campo é uma unidade, nunca
       * zero, que a faria sumir da contagem.
       */
      const sprintsDaVenda = (v: any): number => {
        const n = Number(v?.sprint_levels);
        return Number.isFinite(n) && n > 0 ? n : 1;
      };

      // Build creative map from leads
      interface CreativeAgg {
        /**
         * A CHAVE DA LINHA: `${conta}::${ad_id}` — ou a chave de um dos três
         * baldes: `sem-anuncio-identificado`, `previa-gerenciador`,
         * `direct-link-in-bio`. NOME nunca vira linha (ver identidade_criativo.ts).
         * É por ela que tudo é agregado desde 18/09/2026.
         */
        row_key: string;
        /** `ad_id` da linha. Nulo nos baldes e nas linhas de nome ambíguo. */
        ad_id: string | null;
        ad_account_id: string | null;
        account_name: string | null;
        /** Como esta linha foi identificada (ad_id, nome_unico, nome_na_conta, sem_anuncio, ...). */
        identidade_metodo: string;
        /**
         * A identidade do CRIATIVO (nome normalizado), não da linha. Continua
         * existindo com o mesmo significado de sempre porque
         * `manual_sales.creative_key` e `meetings.creative_key` guardam ESTA
         * forma, e porque é por ela que a tela soma contas quando o usuário
         * pede. Duas linhas podem compartilhá-la — é exatamente o ponto.
         */
        creative_key: string;
        creative_label: string;
        creative_source_field: string;
        /** Notas separadas por VERSÃO de score. Ver `fecharNotas`. */
        notas: NotasPorVersao;
        leads_count: number;
        mql_count: number;
        tier_small_count: number;
        tier_medium_count: number;
        tier_large_count: number;
        tier_enterprise_count: number;
        tier_enterprise_plus_count: number;
        leads_5_10k_count: number;
        lead_score_sum: number;
        lead_score_n: number;
        /** Leads com `score` GRAVADO acima do corte DA VERSÃO dele (73 no quiz, 67 no formulário) — mesmo critério do evento HighQualityLead. */
        hql_count: number;
        spend: number;
        clicks: number;
        impressions: number;
        sales_count: number;
        sales_sprint_count: number;
        /** Sprints vendidos (soma dos níveis). Grandeza diferente de sales_sprint_count, que conta transações. */
        sprint_units_count: number;
        sales_assessoria_count: number;
        sales_parceria_count?: number;
        sales_refunded_count?: number;
        revenue: number;
        revenue_sprint: number;
        revenue_assessoria: number;
        revenue_assessoria_received: number;
        revenue_assessoria_to_receive: number;
        meetings_count: number;
        meetings_attended_count: number;
        meetings_decided_count: number;
        /** MQL DESTE período que agendaram, compareceram e compraram (coorte). */
        mql_agendaram: number;
        mql_compareceram: number;
        mql_compraram: number;
        landing_page_views: number;
        // Sessões e entradas no quiz vêm do tracking próprio (lead_sessions /
        // lead_events), não do Meta: são elas que permitem calcular conversão da
        // PÁGINA (sessão → quiz) e do QUIZ (quiz → lead) por criativo. O
        // landing_page_views do Meta não serve pra isso, é outra medição e
        // costuma divergir bastante do nosso número.
        sessions_count: number;
        quiz_views_count: number;
        last_activity: string | null;
        leads_by_stage: Record<string, number>;
        campaigns: Set<string>;
        /**
         * Gasto quebrado POR CONTA de anuncio.
         *
         * `creative_key` e derivada de texto (`utm_content`/`ad_name`), entao o
         * MESMO criativo rodando em duas contas cai na mesma chave. Em
         * 10/09/2026 isso somava numa linha so R$ 6.916,88 de
         * `luis-nathan-case-2-v3`: R$ 2.097,54 da CA 02 (julho) mais
         * R$ 4.819,34 da CA 03 (agosto/setembro). O criativo migrou de conta e
         * o painel juntou os dois periodos sem avisar.
         *
         * A fusao e intermitente por natureza: so aparece quando o filtro de
         * data cobre os dois periodos. Num recorte de julho, ou de setembro,
         * ela some — e e por isso que passou despercebida.
         */
        spend_por_conta: Map<string, { spend: number; clicks: number; impressions: number }>;
      }

      const creativeMap = new Map<string, CreativeAgg>();

      /**
       * A linha da tabela para uma identidade já resolvida.
       *
       * Assinatura nova em 18/09/2026: recebe a IDENTIDADE (conta + anúncio),
       * não mais um texto. O `key` de antes era o nome normalizado, e era ele
       * que fundia contas.
       */
      function getOrCreate(id: IdentidadeDaLinha, source: string): CreativeAgg {
        const key = id.row_key;
        if (!creativeMap.has(key)) {
          creativeMap.set(key, {
            row_key: key,
            ad_id: id.ad_id,
            ad_account_id: id.ad_account_id,
            account_name: null,
            identidade_metodo: id.metodo,
            creative_key: id.creative_key,
            creative_label: id.creative_label,
            creative_source_field: source,
            notas: novaNotaPorVersao(),
            leads_count: 0,
            mql_count: 0,
            tier_small_count: 0,
            tier_medium_count: 0,
            tier_large_count: 0,
            tier_enterprise_count: 0,
            tier_enterprise_plus_count: 0,
            leads_5_10k_count: 0,
            lead_score_sum: 0,
            lead_score_n: 0,
            hql_count: 0,
            spend: 0,
            clicks: 0,
            impressions: 0,
            sales_count: 0,
            sales_sprint_count: 0,
            sprint_units_count: 0,
            sales_assessoria_count: 0, sales_parceria_count: 0, sales_refunded_count: 0,
            revenue: 0,
            revenue_sprint: 0,
            revenue_assessoria: 0,
            revenue_assessoria_received: 0,
            revenue_assessoria_to_receive: 0,
            meetings_count: 0,
            meetings_attended_count: 0,
            meetings_decided_count: 0,
            mql_agendaram: 0,
            mql_compareceram: 0,
            mql_compraram: 0,
            landing_page_views: 0,
            sessions_count: 0,
            quiz_views_count: 0,
            last_activity: null,
            leads_by_stage: {},
            campaigns: new Set(),
            spend_por_conta: new Map(),
          });
        }
        const linha = creativeMap.get(key)!;
        // O rótulo melhor vence: quem chega com o nome do anúncio resolvido por
        // ID substitui um rótulo que era só o ID numérico cru.
        if (id.creative_label && ehIdNumerico(linha.creative_label) && !ehIdNumerico(id.creative_label)) {
          linha.creative_label = id.creative_label;
          linha.creative_key = id.creative_key;
        }
        if (!linha.ad_account_id && id.ad_account_id) linha.ad_account_id = id.ad_account_id;
        return linha;
      }

      // Tier mapping
      const FATURAMENTO_TIER: Record<string, string> = {
        "Não vendo ainda (R$0/mês)": "Desqualificado",
        "Até R$ 5 mil": "Small",
        "De R$ 5 mil a R$ 10 mil": "Medium", "De R$ 10 mil a R$ 20 mil": "Medium",
        "De R$ 20 mil a R$ 30 mil": "Medium",
        "De R$ 30 mil a R$ 50 mil": "Large", "De R$ 50 mil a R$ 75 mil": "Large",
        "De R$ 75 mil a R$ 100 mil": "Large",
        "De R$ 100 mil a R$ 150 mil": "Enterprise", "De R$ 150 mil a R$ 200 mil": "Enterprise",
        "De R$ 200 mil a R$ 300 mil": "Enterprise", "De R$ 300 mil a R$ 500 mil": "Enterprise",
        "De R$ 500 mil a R$ 750 mil": "Enterprise+", "De R$ 750 mil a R$ 1 milhão": "Enterprise+",
        "De R$ 1 milhão a R$ 2 milhões": "Enterprise+", "De R$ 2 milhões a R$ 3 milhões": "Enterprise+",
        "De R$ 3 milhões a R$ 5 milhões": "Enterprise+", "De R$ 5 milhões a R$ 10 milhões": "Enterprise+",
        "Acima de R$ 10 milhões": "Enterprise+",
        "R$ 0 – 2k": "Small",
        "R$ 2k – 8k": "Medium",
        "R$ 8k – 20k": "Large",
        "R$ 20k – 50k": "Enterprise",
        "R$ 50k – 100k": "Enterprise",
      };

      function getLeadTier(lead: any): string {
        return FATURAMENTO_TIER[lead.investimento_faixa || ""] || (lead.tier || "Desqualificado");
      }

      // ─── Taxa de Qualificação ────────────────────────────────────────────
      //
      // A conta vive em `leadScore.ts`, cópia do módulo do front. Antes ela
      // estava escrita aqui dentro, com pesos diferentes dos do app — o mesmo
      // lead saía com 65 no painel e 78 no banco.
      // Desde 17/09/2026 o recálculo respeita a VERSÃO do score do lead: rodar
      // a fórmula do quiz num lead de formulário devolve uma nota que a Meta
      // nunca viu, e a média por criativo passaria a somar duas réguas.
      function computeScore(lead: any): number {
        return calcularNotaPorVersao(lead as EntradaNota, lead?.score_version).score;
      }

      /**
       * Versão de score de quem não tem versão gravada.
       *
       * É o quiz: todo lead anterior a 25/08/2026 nasceu sem `score_version` e
       * a nota dele é v2.3. Mesmo padrão de `limiarHql` em `_shared/hql.ts` —
       * um só lugar decide o que "sem versão" significa.
       */
      const VERSAO_SCORE_PADRAO = SCORE_VERSION_QUIZ;

      let leadsWithCreative = 0;
      let leadsWithoutUtms = 0;
      /** Quantos registros caíram no balde PRÉVIA (macro literal da Meta). */
      let leadsPrevia = 0;
      /** Leads com nome de criativo que não casou com anúncio nenhum. Balde, não linha. */
      let leadsSemAnuncio = 0;
      /** Leads cuja linha foi achada só pelo NOME (fallback). Método fraco: tem que aparecer. */
      let leadsPorNome = 0;
      // (Os antigos `UNATTRIBUTED_KEY`, `UNATTRIBUTED_LABEL` e `DIRECT_KEYS`
      // saíram em 18/09/2026: viraram `CHAVE_SEM_ATRIBUICAO`,
      // `ROTULO_SEM_ATRIBUICAO` e `NOMES_DIRETOS` em identidade_criativo.ts,
      // onde a resolução de identidade mora inteira e é testada.)

      // ── Recuperar o criativo de leads que chegaram sem utm_content ────────
      //
      // Quando o utm_content não chega junto do lead (link sem parâmetro,
      // navegador in-app, redirect), o criativo ainda existe na SESSÃO. A
      // cascata submit → fbp → ip vive em `attribution.ts`, compartilhada com
      // /leads, para as duas telas nunca discordarem sobre a origem do mesmo
      // lead. O histórico do que estava errado aqui está documentado lá.
      const semCriativo = allLeads.filter((l) => !l.utm_content && l.id);
      if (semCriativo.length > 0) {
        const atribuicao = await resolveLeadAttribution(supabase, semCriativo, { from, to: toEnd });
        for (const lead of allLeads) {
          const a = atribuicao.get(lead.id);
          if (!a?.utm_content || lead.utm_content) continue;
          lead.utm_content = a.utm_content;
          lead._recovered = true;
          lead._recovered_by = a.method;
        }
      }

      // Resolve nome real dos criativos cujo utm_content é o ID numérico cru do Meta
      // (ex: "120253695740100054") — antes esses IDs viravam o rótulo direto na
      // tabela "Performance por Criativo"; a resolução (ad_spend/meta_ads_cache/Graph
      // API) já existia pra /leads, faltava plugar aqui também.
      const isNumericAdId = (v: unknown): v is string => typeof v === "string" && /^\d+$/.test(v);
      const numericIdsForResolve = new Set<string>();
      for (const lead of allLeads) {
        if (isNumericAdId(lead.utm_content)) numericIdsForResolve.add(lead.utm_content);
      }
      for (const s of (spendData || [])) {
        const k = s.utm_content || s.ad_name;
        if (isNumericAdId(k)) numericIdsForResolve.add(k);
      }
      for (const sale of (salesData || [])) {
        const k = sale.creative_key || sale.utm_content;
        if (isNumericAdId(k)) numericIdsForResolve.add(k);
      }
      for (const meeting of (meetingsData || [])) {
        const k = meeting.creative_key || meeting.utm_content;
        if (isNumericAdId(k)) numericIdsForResolve.add(k);
      }
      const resolvedCreativeNames = await resolveCreativeNames(supabase, [...numericIdsForResolve]);

      // O nome resolvido pela Graph API entra no ÍNDICE, e não numa tabela de
      // tradução paralela. Desde 18/09/2026 o casamento lead ↔ gasto é pelo
      // `ad_id` (a linha é o par conta+anúncio), então o que faltava aqui não
      // era a chave — era o RÓTULO de um anúncio que só apareceu como ID cru.
      for (const [id, r] of resolvedCreativeNames) {
        const nome = (r as any)?.ad_name || (r as any)?.creative_name;
        if (nome && !indiceAnuncios.nomeDoAnuncio.has(id)) indiceAnuncios.nomeDoAnuncio.set(id, String(nome));
      }

      // ── Coortes: o que os leads DESTE período fizeram depois ──────────────
      //
      // Taxa de conversão do funil é propriedade de uma COORTE: dos leads que
      // entraram no período, quantos agendaram, compareceram e compraram — não
      // importa em que dia isso aconteceu. Contar "reuniões do período" contra
      // "MQL do período" mistura dois grupos e produz taxa acima de 100%:
      // aconteceu com o Caio Case #4, que apareceu com 2 reuniões para 1 MQL
      // porque o lead da outra reunião entrou antes do início do filtro.
      let totalMqlAgendaram = 0, totalMqlCompareceram = 0, totalMqlCompraram = 0;
      const idsDoPeriodo = new Set(allLeads.map((l) => l.id));
      const leadsQueAgendaram = new Set<string>();
      const leadsQueCompareceram = new Set<string>();
      const leadsQueCompraram = new Set<string>();
      {
        const [todasReunioes, todasVendas] = await Promise.all([
          supabase.from("meetings").select("lead_id, status, attended"),
          supabase.from("manual_sales").select("lead_id"),
        ]);
        for (const m of (todasReunioes.data || [])) {
          if (!m.lead_id || !idsDoPeriodo.has(m.lead_id)) continue;
          leadsQueAgendaram.add(m.lead_id);
          if (isRealizada(m)) leadsQueCompareceram.add(m.lead_id);
        }
        for (const v of (todasVendas.data || [])) {
          if (v.lead_id && idsDoPeriodo.has(v.lead_id)) leadsQueCompraram.add(v.lead_id);
        }
      }

      // ── A LINHA DE CADA LEAD, resolvida uma vez só ────────────────────────
      //
      // Venda e reunião SEGUEM O LEAD: é o lead que tem `ad_id`, e portanto é
      // ele que sabe em qual conta a linha mora. `manual_sales.creative_key` e
      // `meetings.creative_key` guardam NOME, e nome funde contas — usá-los
      // como chave era o que colocava a venda de uma conta na linha de outra.
      // Este mapa cobre TODOS os leads da janela, inclusive os que os filtros
      // de campanha tiram da tabela, porque a venda deles continua existindo.
      const leadIdentidade = new Map<string, IdentidadeDaLinha>();
      for (const lead of allLeads) {
        leadIdentidade.set(
          lead.id,
          identidadeDe({
            ad_id: lead.ad_id,
            nome: lead.utm_content,
            campaign_id: lead.campaign_id,
            adset_id: lead.adset_id,
            outrosIds: [lead.campaign_id, lead.adset_id],
          }),
        );
      }

      /**
       * A linha do lead de uma venda ou reunião — quando ela resolve um ANÚNCIO.
       *
       * Devolve `null` quando o lead não tem anúncio determinado (bio, orgânico,
       * prévia, nome ambíguo). Nesse caso quem decide volta a ser o texto
       * `creative_key` da própria venda/reunião, que é o que o operador digitou
       * ao lançar — é fraco, mas é mais do que nada, e era o comportamento
       * anterior. O que NÃO pode voltar a acontecer é esse texto (um nome)
       * mandar quando o lead tem `ad_id`: nome funde contas.
       */
      const identidadeDoLead = (leadId: string | null | undefined): IdentidadeDaLinha | null => {
        if (!leadId) return null;
        const id = leadIdentidade.get(leadId);
        if (!id) return null;
        return id.ad_id ? id : null;
      };

      // Process leads (filter by campaign_type if specified)
      for (const lead of allLeads) {
        // Campaign type filter
        if (campaignType === "mql" && !isMqlCampaign(lead.utm_campaign)) continue;
        if (campaignType === "lead" && isMqlCampaign(lead.utm_campaign)) continue;
        // Specific campaign-name filter
        if (campaignFilter && !matchesCampaignFilter(lead.utm_campaign)) continue;

        // A LINHA DO LEAD É (CONTA, ANÚNCIO). `ad_id` é o caminho forte; o
        // `utm_content` entra só como nome, e `campaign_id`/`adset_id` entram
        // na checagem de macro para que um clique de prévia do Gerenciador não
        // consiga entrar como tráfego por nenhuma das portas.
        const identidade = leadIdentidade.get(lead.id)!;
        if (identidade.metodo === "previa") leadsPrevia++;
        else if (identidade.metodo === "sem_atribuicao") leadsWithoutUtms++;
        else if (identidade.metodo === "sem_anuncio") leadsSemAnuncio++;
        else {
          leadsWithCreative++;
          // Achado pelo nome, não pelo ID. Conta separado porque é o caminho
          // que pode errar de conta — e o que erra é o que precisa de número.
          if (identidade.metodo !== "ad_id" && identidade.metodo !== "utm_content_id") leadsPorNome++;
        }
        const agg = getOrCreate(identidade, "utm_content");
        agg.leads_count++;
        if (isMql(lead.estagio_negocio, lead.investimento_faixa, lead.sdr_override)) {
          agg.mql_count++;
          // Denominador e numerador no MESMO grupo: estes três contam o que os
          // MQL deste período fizeram depois, e são a base de toda taxa.
          if (leadsQueAgendaram.has(lead.id)) { agg.mql_agendaram++; totalMqlAgendaram++; }
          if (leadsQueCompareceram.has(lead.id)) { agg.mql_compareceram++; totalMqlCompareceram++; }
          if (leadsQueCompraram.has(lead.id)) { agg.mql_compraram++; totalMqlCompraram++; }
        }
        const computedTier = getLeadTier(lead);
        if (computedTier === "Small") agg.tier_small_count++;
        else if (computedTier === "Medium") agg.tier_medium_count++;
        else if (computedTier === "Large") agg.tier_large_count++;
        else if (computedTier === "Enterprise") agg.tier_enterprise_count++;
        else if (computedTier === "Enterprise+") agg.tier_enterprise_plus_count++;
        if ((lead.investimento_faixa || "") === "De R$ 5 mil a R$ 10 mil") {
          agg.leads_5_10k_count++;
        }
        const _score = computeScore(lead);
        agg.lead_score_sum += _score;
        agg.lead_score_n += 1;
        // E a MESMA nota, separada por VERSÃO. `lead_score_sum` continua
        // existindo (é o total bruto, usado por quem só quer a soma), mas a
        // média que a tela mostra passa a sair daqui: quiz e formulário curto
        // são duas réguas e a média das duas não existe em régua nenhuma.
        acumularNota(agg.notas, versaoDoScore(lead.score_version, VERSAO_SCORE_PADRAO), _score);
        // HQL pela nota GRAVADA, não pela recalculada acima, e no corte da
        // VERSÃO do lead: é o mesmo critério de `contas_desempenho.ts` e do
        // evento enviado à Meta (ver ../_shared/hql.ts). Lead sem score
        // gravado não conta, igual lá.
        if (ehHighQualityLead(lead.score, lead.score_version)) agg.hql_count++;
        agg.leads_by_stage[lead.estagio_negocio] = (agg.leads_by_stage[lead.estagio_negocio] || 0) + 1;
        if (lead.utm_campaign) agg.campaigns.add(lead.utm_campaign);
        if (!agg.last_activity || lead.created_at > agg.last_activity) {
          agg.last_activity = lead.created_at;
        }
      }

      // Process spend
      let spendMapped = 0;
      let spendTotal = 0;
      for (const s of (spendData || [])) {
        // Campaign type filter for spend
        if (campaignType === "mql" && !isMqlCampaign(s.campaign_name)) continue;
        if (campaignType === "lead" && isMqlCampaign(s.campaign_name)) continue;
        // Specific campaign-name filter
        if (campaignFilter && !matchesCampaignFilter(s.campaign_name)) continue;
        const amount = Number(s.spend) || 0;
        spendTotal += amount;
        // A linha do gasto é a conta em que a Meta o registrou + o `ad_id` da
        // linha. Nome só rotula. Linha sem `ad_id` e sem nome não tem onde cair
        // e vira resíduo (`spendTotal - spendMapped`), como antes.
        const rawKey = s.ad_name || s.utm_content;
        if (!idLimpo(s.ad_id) && !rawKey) continue;
        spendMapped += amount;
        const identidadeGasto = identidadeDe({
          ad_id: s.ad_id,
          ad_account_id: s.ad_account_id,
          nome: rawKey,
          campaign_id: s.campaign_id,
          adset_id: s.adset_id,
        });
        const agg = getOrCreate(identidadeGasto, s.utm_content ? "utm_content" : "fallback");
        agg.spend += amount;
        agg.clicks += Number(s.clicks) || 0;
        agg.impressions += Number(s.impressions) || 0;
        agg.landing_page_views += Number(s.landing_page_views) || 0;
        // Identidade tecnica do gasto: a CONTA e a chave, o nome e rotulo.
        {
          const conta = s.ad_account_id || "(sem conta)";
          const porConta = agg.spend_por_conta.get(conta) ?? { spend: 0, clicks: 0, impressions: 0 };
          porConta.spend += amount;
          porConta.clicks += Number(s.clicks) || 0;
          porConta.impressions += Number(s.impressions) || 0;
          agg.spend_por_conta.set(conta, porConta);
        }
        if (s.campaign_name) agg.campaigns.add(s.campaign_name);
        const spendDate = s.date;
        if (!agg.last_activity || spendDate > agg.last_activity) {
          agg.last_activity = spendDate;
        }
      }

      // Sessão → criativo e página, exposto para a agregação por CAMPANHA logo
      // abaixo: sem isso as conversões de página e de quiz só existiriam por
      // criativo, e a campanha ficaria sem os degraus de cima do funil.
      // `ck` é a CHAVE DA LINHA (conta+anúncio), usada pela tabela de criativos;
      // `rotulo` é o nome, que é o que a agregação por CAMPANHA usa para casar
      // com `porCriativo` — lá a chave continua sendo o nome, de propósito, uma
      // vez que campanha é outra dimensão e o gasto dela vem direto do
      // `ad_spend.campaign_name`.
      const sessaoInfo = new Map<string, { ck: string; page: string | null; rotulo: string }>();
      const sessoesComQuiz = new Set<string>();

      // ── Sessões e entradas no quiz por criativo (tracking próprio) ──
      // Alimenta as conversões de página e de quiz na aba de criativos. Sem
      // isso só dava pra medir do clique pra baixo, e o degrau que mais perde
      // gente (página → quiz) ficava invisível por criativo.
      {
        const sessionRows: any[] = [];
        const PAGE = 1000;
        let off = 0;
        let more = true;
        while (more && sessionRows.length < 20000) {
          let sq = supabase
            .from("lead_sessions")
            // `ad_id`, `campaign_id` e `adset_id` entram em 18/09/2026 pelo
            // mesmo motivo dos leads: a sessão também pertence a um par
            // (conta, anúncio), e a macro literal também chega por aqui.
            .select("id, utm_content, utm_campaign, referrer, first_page, campaign_id, adset_id, ad_id")
            .order("created_at", { ascending: true })
            .range(off, off + PAGE - 1);
          if (from) sq = sq.gte("created_at", from);
          if (toEnd) sq = sq.lte("created_at", toEnd);
          const { data } = await sq;
          if (data) sessionRows.push(...data);
          more = (data?.length || 0) === PAGE;
          off += PAGE;
        }

        const sessionCreative = new Map<string, string>();
        for (const sess of sessionRows) {
          const ref = (sess.referrer || "").toLowerCase();
          const fp = (sess.first_page || "").toLowerCase();
          if (ref.includes("lovable.dev") || ref.includes("lovableproject.com")) continue;
          if (fp === "/admin") continue;
          if (campaignType === "mql" && !isMqlCampaign(sess.utm_campaign)) continue;
          if (campaignType === "lead" && isMqlCampaign(sess.utm_campaign)) continue;
          if (campaignFilter && !matchesCampaignFilter(sess.utm_campaign)) continue;

          const identidadeSessao = identidadeDe({
            ad_id: sess.ad_id,
            nome: sess.utm_content,
            campaign_id: sess.campaign_id,
            adset_id: sess.adset_id,
            outrosIds: [sess.campaign_id, sess.adset_id],
          });
          const ck = identidadeSessao.row_key;
          sessionCreative.set(sess.id, ck);
          sessaoInfo.set(sess.id, { ck, page: sess.first_page || null, rotulo: identidadeSessao.creative_label });
          const agg = getOrCreate(identidadeSessao, "utm_content");
          agg.sessions_count += 1;
        }

        if (sessionCreative.size > 0) {
          const quizSessions = new Set<string>();
          let qoff = 0;
          let qmore = true;
          while (qmore && quizSessions.size < 20000) {
            let qq = supabase
              .from("lead_events")
              .select("session_id")
              .eq("event_name", "quiz_view")
              .order("created_at", { ascending: true })
              .range(qoff, qoff + PAGE - 1);
            if (from) qq = qq.gte("created_at", from);
            if (toEnd) qq = qq.lte("created_at", toEnd);
            const { data } = await qq;
            (data || []).forEach((e: any) => quizSessions.add(e.session_id));
            qmore = (data?.length || 0) === PAGE;
            qoff += PAGE;
          }
          for (const sid of quizSessions) {
            const ck = sessionCreative.get(sid);
            if (!ck) continue;
            const agg = creativeMap.get(ck);
            if (agg) agg.quiz_views_count += 1;
            sessoesComQuiz.add(sid);
          }
        }
      }

      // (O antigo `leadUtmMap` — lead → texto do utm_content — saiu em
      // 18/09/2026. Quem resolve a linha de venda e reunião agora é
      // `leadIdentidade`, que carrega conta e `ad_id` em vez de um nome.)

      // When filtering by campaign names, only sales/meetings whose linked lead matches
      // the campaign filter should be aggregated. Build the allowed-lead set.
      const campaignFilteredLeadIds: Set<string> | null = campaignFilter
        ? new Set(
            allLeads
              .filter(l => matchesCampaignFilter(l.utm_campaign))
              .map(l => l.id)
          )
        : null;

      // Process sales - resolve creative from linked lead if needed
      let salesWithoutCreative = 0;
      for (const sale of (salesData || [])) {
        // When campaign filter is active, drop sales not linked to a matching lead
        if (campaignFilteredLeadIds && (!sale.lead_id || !campaignFilteredLeadIds.has(sale.lead_id))) continue;
        // A VENDA SEGUE O LEAD, quando há lead. O lead sabe o `ad_id`; a venda
        // só tem o texto de `creative_key`, que é nome — e nome funde contas.
        // Só quando não há lead vinculado é que o texto da venda decide.
        const identidadeVenda: IdentidadeDaLinha =
          identidadeDoLead(sale.lead_id) ?? identidadeDe({ nome: sale.creative_key || sale.utm_content });
        if (identidadeVenda.metodo === "sem_atribuicao") salesWithoutCreative++;
        const agg = getOrCreate(identidadeVenda, "utm_content");
        // Reembolsada: o anúncio trouxe e a call fechou, então fica visível no
        // criativo — mas fora de receita, ticket, CAC e ROAS, porque o dinheiro
        // voltou. Apagar a linha (que era o que se fazia) sumia com o histórico.
        if (sale.refunded_at) {
          agg.sales_refunded_count = (agg.sales_refunded_count || 0) + 1;
          continue;
        }
        agg.sales_count++;
        const saleRevenue = Number(sale.revenue) || 0;
        agg.revenue += saleRevenue;
        const saleType = sale.sale_type || "sprint";
        if (saleType === "assessoria") {
          agg.sales_assessoria_count++;
          agg.revenue_assessoria += saleRevenue;
          const received = Number(sale.amount_received) || 0;
          agg.revenue_assessoria_received += received;
          agg.revenue_assessoria_to_receive += Math.max(0, saleRevenue - received);
        } else if (saleType === "parceria") {
          // Conta como venda fechada, mas fora do Sprint e fora do TCV: em
          // parceria não há contrato, só comissão sobre o resultado do cliente.
          agg.sales_parceria_count = (agg.sales_parceria_count || 0) + 1;
        } else {
          agg.sales_sprint_count++;
          agg.sprint_units_count += sprintsDaVenda(sale);
          agg.revenue_sprint += saleRevenue;
        }
      }

      /**
       * O instante está dentro do período filtrado?
       *
       * Existe porque a consulta agora traz reuniões por DUAS janelas (marcada
       * ou realizada), então nem toda linha lida pertence às duas contagens. Sem
       * este filtro, uma call de agosto realizada em setembro passaria a contar
       * como agendada em setembro também, e o número do SDR dobraria.
       */
      const dentroDaJanela = (iso: string | null | undefined): boolean => {
        if (!iso) return false;
        if (from && iso < from) return false;
        if (toEnd && iso > toEnd) return false;
        return true;
      };

      // Process meetings - resolve creative from linked lead if needed
      let totalMeetingsCount = 0;
      let totalMeetingsAttendedCount = 0;
      // Reunião com desfecho (realizada ou no-show) e reunião que já passou da
      // data sem ninguém marcar. A primeira é o denominador do comparecimento;
      // a segunda é o aviso de que o denominador está incompleto.
      let totalMeetingsDecidedCount = 0;
      let totalMeetingsPendingCount = 0;
      for (const meeting of (meetingsData || [])) {
        // When campaign filter is active, drop meetings not linked to a matching lead
        if (campaignFilteredLeadIds && (!meeting.lead_id || !campaignFilteredLeadIds.has(meeting.lead_id))) continue;
        // Mesma regra da venda: a reunião segue o LEAD, que é quem tem o ID.
        const identidadeReuniao: IdentidadeDaLinha =
          identidadeDoLead(meeting.lead_id) ?? identidadeDe({ nome: meeting.creative_key || meeting.utm_content });
        const agg = getOrCreate(identidadeReuniao, "utm_content");
        // Agendada: o dia em que o SDR marcou. Realizada: o dia em que a call
        // aconteceu. A mesma reunião pode contar como agendada num mês e como
        // realizada no seguinte, e isso é o correto — são duas perguntas.
        const marcadaNaJanela = dentroDaJanela(meeting.created_at);
        const aconteceuNaJanela = dentroDaJanela(meeting.scheduled_at || meeting.created_at);
        if (marcadaNaJanela) {
          agg.meetings_count++;
          totalMeetingsCount++;
        }
        if (aconteceuNaJanela && jaAconteceu(meeting)) {
          agg.meetings_decided_count++;
          totalMeetingsDecidedCount++;
        } else if (marcadaNaJanela && pendenteDeMarcacao(meeting)) {
          totalMeetingsPendingCount++;
        }
        if (aconteceuNaJanela && isRealizada(meeting)) {
          agg.meetings_attended_count++;
          totalMeetingsAttendedCount++;
        }
      }

      // Calculate derived metrics
      // ── Performance por CAMPANHA ─────────────────────────────────────────
      //
      // Agregado a partir das MESMAS fontes que os criativos, e não somando os
      // criativos: um criativo roda em mais de uma campanha (há um rodando em
      // nove), e o gasto dele não se divide igualmente entre elas. Somar por
      // criativo daria números errados justamente nos criativos mais usados.
      //
      // Cada fonte tem a sua ligação com a campanha:
      //   gasto     → `ad_spend.campaign_name`, direto na linha;
      //   leads     → `utm_campaign`, que às vezes chega como o ID numérico do
      //               Meta e é resolvido pelo nome via ad_spend;
      //   vendas e
      //   reuniões  → pelo lead de origem, que é quem sabe a campanha.
      interface CampaignAgg {
        campaign: string;
        spend: number;
        impressions: number;
        clicks: number;
        landing_page_views: number;
        leads_count: number;
        mql_count: number;
        leads_5_10k_count: number;
        tier_small_count: number;
        tier_medium_count: number;
        tier_large_count: number;
        tier_enterprise_count: number;
        tier_enterprise_plus_count: number;
        lead_score_sum: number;
        lead_score_n: number;
        /** Notas por VERSÃO de score — quiz e formulário nunca entram na mesma média. */
        notas: NotasPorVersao;
        meetings_count: number;
        meetings_attended_count: number;
        meetings_decided_count: number;
        mql_agendaram: number;
        mql_compareceram: number;
        mql_compraram: number;
        sales_count: number;
        sales_sprint_count: number;
        /** Sprints vendidos (soma dos níveis). Grandeza diferente de sales_sprint_count, que conta transações. */
        sprint_units_count: number;
        sales_assessoria_count: number;
        sales_parceria_count?: number;
        sales_refunded_count?: number;
        revenue: number;
        revenue_sprint: number;
        revenue_assessoria: number;
        creatives: Set<string>;
        last_activity: string | null;
        is_active: boolean;
        sessions_count: number;
        quiz_views_count: number;
      }

      const SEM_CAMPANHA = "(sem campanha)";
      const campaignMap = new Map<string, CampaignAgg>();
      const getCampaign = (nome: string): CampaignAgg => {
        const chave = nome || SEM_CAMPANHA;
        if (!campaignMap.has(chave)) {
          campaignMap.set(chave, {
            campaign: chave,
            spend: 0, impressions: 0, clicks: 0, landing_page_views: 0,
            leads_count: 0, mql_count: 0, leads_5_10k_count: 0,
            tier_small_count: 0, tier_medium_count: 0, tier_large_count: 0,
            tier_enterprise_count: 0, tier_enterprise_plus_count: 0,
            lead_score_sum: 0, lead_score_n: 0, notas: novaNotaPorVersao(),
            meetings_count: 0, meetings_attended_count: 0, meetings_decided_count: 0,
            mql_agendaram: 0, mql_compareceram: 0, mql_compraram: 0,
            sales_count: 0, sales_sprint_count: 0, sprint_units_count: 0, sales_assessoria_count: 0, sales_parceria_count: 0, sales_refunded_count: 0,
            revenue: 0, revenue_sprint: 0, revenue_assessoria: 0,
            creatives: new Set(), last_activity: null, is_active: false,
            sessions_count: 0, quiz_views_count: 0,
          });
        }
        return campaignMap.get(chave)!;
      };

      // ── De qual campanha veio o lead ─────────────────────────────────────
      //
      // O `utm_campaign` NÃO serve como fonte de verdade. Quando uma campanha é
      // duplicada no Meta — que é como o time cria variação de teste — o UTM do
      // anúncio vem junto com o NOME ANTIGO. Foi assim que os leads do teste de
      // subheadline apareceram sob "TESTE AB (Headlines)" e sob "(Headlines) —
      // Cópia": a campanha era outra, o texto do UTM não. Nenhum lead traz
      // `ad_id` ou `campaign_id` (0 de 54 em agosto), então não há ID para usar.
      //
      // O que é confiável: o CRIATIVO que o lead clicou e o DIA em que clicou.
      // `ad_spend` sabe, por dia, em quais campanhas cada criativo rodou e com
      // quanto de verba. Isso resolve sozinho a maioria dos casos; para o resto
      // há a página de entrada, porque cada campanha de teste aponta para uma
      // landing própria e os conjuntos são nomeados como ela (conjunto "SH 4" →
      // página "/SH4").
      //
      // A cascata, do mais forte para o mais fraco:
      //   1. criativo + dia → uma única campanha com verba  (atribuição exata)
      //   2. empate desfeito pela página de entrada do lead
      //   3. empate desfeito pela campanha que mais gastou naquele criativo no dia
      //   4. criativo sozinho, na janela inteira
      //   5. utm_campaign normalizado (aceita o "+" que vira espaço na URL)
      const normalizarNome = (v: string): string =>
        v.toLowerCase().replace(/\+/g, " ").replace(/\s+/g, " ").trim();

      const chaveCriativo = (v: string | null | undefined): string =>
        v ? String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "";

      // Nome canônico da campanha: o do ad_spend manda, porque é o nome atual
      // no Meta. O do UTM pode estar velho.
      const nomeCanonico = new Map<string, string>();
      for (const sp of spendData) {
        if (sp.campaign_name) nomeCanonico.set(normalizarNome(sp.campaign_name), sp.campaign_name);
      }
      const campanhaPorId = new Map<string, string>();
      for (const sp of spendData) {
        if (sp.campaign_id && sp.campaign_name) campanhaPorId.set(String(sp.campaign_id), sp.campaign_name);
      }
      const nomeDaCampanha = (valor: string | null | undefined): string => {
        if (!valor) return SEM_CAMPANHA;
        const bruto = String(valor).trim();
        if (!bruto || /\{\{.*\}\}/.test(bruto)) return SEM_CAMPANHA;
        if (/^\d+$/.test(bruto)) return campanhaPorId.get(bruto) || bruto;
        return nomeCanonico.get(normalizarNome(bruto)) || bruto;
      };

      // (criativo|dia) → campanhas que rodaram, com verba e nome do conjunto.
      const porCriativoDia = new Map<string, Map<string, { gasto: number; adsets: Set<string> }>>();
      const porCriativo = new Map<string, Map<string, number>>();
      for (const sp of spendData) {
        const ck = chaveCriativo(sp.creative_key || sp.utm_content || sp.ad_name);
        if (!ck || !sp.campaign_name) continue;
        const gasto = Number(sp.spend) || 0;

        const chaveDia = `${ck}|${sp.date}`;
        if (!porCriativoDia.has(chaveDia)) porCriativoDia.set(chaveDia, new Map());
        const doDia = porCriativoDia.get(chaveDia)!;
        const atual = doDia.get(sp.campaign_name) || { gasto: 0, adsets: new Set<string>() };
        atual.gasto += gasto;
        if (sp.adset_name) atual.adsets.add(String(sp.adset_name));
        doDia.set(sp.campaign_name, atual);

        if (!porCriativo.has(ck)) porCriativo.set(ck, new Map());
        const geral = porCriativo.get(ck)!;
        geral.set(sp.campaign_name, (geral.get(sp.campaign_name) || 0) + gasto);
      }

      /** "/SH4" → "sh4"; serve para casar com o conjunto "SH 4". */
      const tokenDaPagina = (page: string | null | undefined): string =>
        page ? page.replace(/^\//, "").toLowerCase().replace(/[^a-z0-9]/g, "") : "";

      const diaBr = (iso: string): string =>
        new Date(Date.parse(iso) - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Página de entrada de cada lead, usada só para desempatar.
      let paginaDoLead = new Map<string, string | null>();
      try {
        const attr = await resolveLeadAttribution(supabase, allLeads as any[], { from, to: toEnd });
        paginaDoLead = new Map([...attr.entries()].map(([id, a]) => [id, a.first_page]));
      } catch {
        // Sem a página o desempate cai para a verba, que já resolve bem.
      }

      const atribuirCampanha = (lead: any): { nome: string; metodo: string } => {
        // `idLimpo` aqui pelo mesmo motivo do resto da rota: `utm_content` com
        // macro literal (`{{ad.name}}`) viraria a chave "ad-name" e casaria com
        // um criativo que não existe.
        const ck = chaveCriativo(idLimpo(lead.utm_content));
        const dia = lead.created_at ? diaBr(lead.created_at) : null;

        if (ck && dia) {
          const doDia = porCriativoDia.get(`${ck}|${dia}`);
          const candidatas = doDia ? [...doDia.entries()].filter(([, v]) => v.gasto > 0) : [];

          if (candidatas.length === 1) return { nome: candidatas[0][0], metodo: "criativo+dia" };

          if (candidatas.length > 1) {
            const token = tokenDaPagina(paginaDoLead.get(lead.id));
            if (token) {
              const casaPagina = candidatas.filter(([nome, v]) =>
                [...v.adsets].some((a) => tokenDaPagina(a) === token) ||
                tokenDaPagina(nome).includes(token));
              if (casaPagina.length === 1) return { nome: casaPagina[0][0], metodo: "pagina" };
            }
            const maior = candidatas.sort((a, b) => b[1].gasto - a[1].gasto)[0];
            return { nome: maior[0], metodo: "maior verba no dia" };
          }
        }

        if (ck) {
          const geral = porCriativo.get(ck);
          if (geral?.size === 1) return { nome: [...geral.keys()][0], metodo: "criativo (janela)" };
          if (geral && geral.size > 1) {
            const maior = [...geral.entries()].sort((a, b) => b[1] - a[1])[0];
            return { nome: maior[0], metodo: "maior verba na janela" };
          }
        }

        const porUtm = nomeDaCampanha(lead.utm_campaign);
        return { nome: porUtm, metodo: porUtm === SEM_CAMPANHA ? "sem sinal" : "utm (frágil)" };
      };

      // Mesmo corte do `threeDaysAgo` dos criativos, e pelo mesmo motivo: o dia
      // aqui é o do FUSO DA CONTA, porque `ad_spend.date` é o dia da conta.
      const tresDiasAtras = diaNoFuso(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), FUSO_PADRAO_CONTA);
      for (const sp of spendData) {
        const c = getCampaign(sp.campaign_name || SEM_CAMPANHA);
        c.spend += Number(sp.spend) || 0;
        c.impressions += Number(sp.impressions) || 0;
        c.clicks += Number(sp.clicks) || 0;
        c.landing_page_views += Number(sp.landing_page_views) || 0;
        const ck = sp.creative_key || sp.utm_content || sp.ad_name;
        if (ck) c.creatives.add(String(ck));
        if (sp.date >= tresDiasAtras) c.is_active = true;
      }

      // Campanha de cada lead, para vendas e reuniões chegarem pelo mesmo caminho.
      const campanhaDoLead = new Map<string, string>();
      const metodosAtribuicao: Record<string, number> = {};
      for (const lead of allLeads) {
        const { nome, metodo } = atribuirCampanha(lead);
        metodosAtribuicao[metodo] = (metodosAtribuicao[metodo] || 0) + 1;
        campanhaDoLead.set(lead.id, nome);
        const c = getCampaign(nome);
        c.leads_count++;
        if (isMql(lead.estagio_negocio, lead.investimento_faixa, lead.sdr_override)) {
          c.mql_count++;
          if (leadsQueAgendaram.has(lead.id)) c.mql_agendaram++;
          if (leadsQueCompareceram.has(lead.id)) c.mql_compareceram++;
          if (leadsQueCompraram.has(lead.id)) c.mql_compraram++;
        }
        const tier = getLeadTier(lead);
        if (tier === "Small") c.tier_small_count++;
        else if (tier === "Medium") c.tier_medium_count++;
        else if (tier === "Large") c.tier_large_count++;
        else if (tier === "Enterprise") c.tier_enterprise_count++;
        else if (tier === "Enterprise+") c.tier_enterprise_plus_count++;
        if ((lead.investimento_faixa || "") === "De R$ 5 mil a R$ 10 mil") c.leads_5_10k_count++;
        const notaDaCampanha = computeScore(lead);
        c.lead_score_sum += notaDaCampanha;
        c.lead_score_n += 1;
        acumularNota(c.notas, versaoDoScore(lead.score_version, VERSAO_SCORE_PADRAO), notaDaCampanha);
        if (!c.last_activity || lead.created_at > c.last_activity) c.last_activity = lead.created_at;
      }

      // Sessões e entradas no quiz por campanha. A sessão não traz a data no
      // select, então aqui a cascata é criativo na janela + desempate pela
      // página de entrada — que no caso dos testes é o sinal mais forte, porque
      // cada campanha aponta para a sua landing.
      for (const [sid, info] of sessaoInfo) {
        let nome = SEM_CAMPANHA;
        const geral = porCriativo.get(chaveCriativo(info.rotulo));
        if (geral?.size === 1) {
          nome = [...geral.keys()][0];
        } else if (geral && geral.size > 1) {
          const token = tokenDaPagina(info.page);
          const casa = token
            ? [...geral.keys()].filter((c) => tokenDaPagina(c).includes(token))
            : [];
          nome = casa.length === 1
            ? casa[0]
            : [...geral.entries()].sort((a, b) => b[1] - a[1])[0][0];
        }
        const c = getCampaign(nome);
        c.sessions_count += 1;
        if (sessoesComQuiz.has(sid)) c.quiz_views_count += 1;
      }

      for (const venda of (salesData || [])) {
        const nome = venda.lead_id ? (campanhaDoLead.get(venda.lead_id) || SEM_CAMPANHA) : SEM_CAMPANHA;
        const c = getCampaign(nome);
        if (venda.refunded_at) {
          c.sales_refunded_count = (c.sales_refunded_count || 0) + 1;
          continue;
        }
        const receita = Number(venda.revenue) || 0;
        c.sales_count++;
        c.revenue += receita;
        if (venda.sale_type === "assessoria") {
          c.sales_assessoria_count++;
          c.revenue_assessoria += receita;
        } else if (venda.sale_type === "parceria") {
          c.sales_parceria_count = (c.sales_parceria_count || 0) + 1;
        } else {
          c.sales_sprint_count++;
          c.sprint_units_count += sprintsDaVenda(venda);
          c.revenue_sprint += receita;
        }
      }

      for (const reuniao of (meetingsData || [])) {
        const nome = reuniao.lead_id ? (campanhaDoLead.get(reuniao.lead_id) || SEM_CAMPANHA) : SEM_CAMPANHA;
        const c = getCampaign(nome);
        c.meetings_count++;
        if (jaAconteceu(reuniao)) c.meetings_decided_count++;
        if (isRealizada(reuniao)) c.meetings_attended_count++;
      }

      // ── Performance por VARIANTE do teste A/B ────────────────────────────
      //
      // A variante é a PÁGINA por onde a pessoa entrou (/SH4, /HD3, /). Cada
      // fonte chega por um caminho diferente:
      //
      //   sessões e quiz → `first_page`, direto no tracking;
      //   leads          → a página da sessão que converteu (casada pelo evento
      //                    `submit`, mesmo instante da criação do lead);
      //   vendas e reun. → pelo lead de origem;
      //   verba          → pelo CONJUNTO. No teste, cada variante tem o seu
      //                    conjunto e ele é nomeado como a página ("SH 4" para
      //                    /SH4). É a única ligação que existe entre gasto e
      //                    variante, porque `ad_spend` não sabe de página.
      //
      // Quando o conjunto não casa com variante nenhuma (campanha que não é de
      // teste), a verba fica fora — melhor deixar a coluna vazia do que ratear
      // um número que ninguém consegue defender depois.
      interface VarianteAgg {
        page: string;
        spend: number;
        impressions: number;
        clicks: number;
        landing_page_views: number;
        sessions_count: number;
        quiz_views_count: number;
        leads_count: number;
        mql_count: number;
        leads_5_10k_count: number;
        lead_score_sum: number;
        lead_score_n: number;
        /** Notas por VERSÃO de score — quiz e formulário nunca entram na mesma média. */
        notas: NotasPorVersao;
        meetings_count: number;
        meetings_attended_count: number;
        meetings_decided_count: number;
        mql_agendaram: number;
        mql_compareceram: number;
        mql_compraram: number;
        sales_count: number;
        sales_sprint_count: number;
        /** Sprints vendidos (soma dos níveis). Grandeza diferente de sales_sprint_count, que conta transações. */
        sprint_units_count: number;
        sales_assessoria_count: number;
        sales_parceria_count?: number;
        sales_refunded_count?: number;
        revenue: number;
        is_active: boolean;
      }

      const varianteMap = new Map<string, VarianteAgg>();
      const getVariante = (page: string): VarianteAgg => {
        if (!varianteMap.has(page)) {
          varianteMap.set(page, {
            page, spend: 0, impressions: 0, clicks: 0, landing_page_views: 0,
            sessions_count: 0, quiz_views_count: 0,
            leads_count: 0, mql_count: 0, leads_5_10k_count: 0,
            lead_score_sum: 0, lead_score_n: 0, notas: novaNotaPorVersao(),
            meetings_count: 0, meetings_attended_count: 0, meetings_decided_count: 0,
            mql_agendaram: 0, mql_compareceram: 0, mql_compraram: 0,
            sales_count: 0, sales_sprint_count: 0, sprint_units_count: 0, sales_assessoria_count: 0, sales_parceria_count: 0, sales_refunded_count: 0,
            revenue: 0, is_active: false,
          });
        }
        return varianteMap.get(page)!;
      };

      // Token da página → caminho, para casar com o nome do conjunto.
      const paginaPorToken = new Map<string, string>();
      for (const path of LANDING_PATHS) {
        const t = tokenDaPagina(path);
        if (t) paginaPorToken.set(t, path);
      }

      for (const sp of spendData) {
        const t = tokenDaPagina(sp.adset_name);
        const page = t ? paginaPorToken.get(t) : undefined;
        if (!page) continue; // conjunto que não é variante de teste
        const v = getVariante(page);
        v.spend += Number(sp.spend) || 0;
        v.impressions += Number(sp.impressions) || 0;
        v.clicks += Number(sp.clicks) || 0;
        v.landing_page_views += Number(sp.landing_page_views) || 0;
        if (sp.date >= tresDiasAtras) v.is_active = true;
      }

      for (const [sid, info] of sessaoInfo) {
        if (!info.page || !LANDING_PATHS.includes(info.page)) continue;
        const v = getVariante(info.page);
        v.sessions_count += 1;
        if (sessoesComQuiz.has(sid)) v.quiz_views_count += 1;
      }

      const varianteDoLead = new Map<string, string>();
      for (const lead of allLeads) {
        const page = paginaDoLead.get(lead.id);
        if (!page || !LANDING_PATHS.includes(page)) continue;
        varianteDoLead.set(lead.id, page);
        const v = getVariante(page);
        v.leads_count += 1;
        if (isMql(lead.estagio_negocio, lead.investimento_faixa, lead.sdr_override)) {
          v.mql_count += 1;
          if (leadsQueAgendaram.has(lead.id)) v.mql_agendaram += 1;
          if (leadsQueCompareceram.has(lead.id)) v.mql_compareceram += 1;
          if (leadsQueCompraram.has(lead.id)) v.mql_compraram += 1;
        }
        if ((lead.investimento_faixa || "") === "De R$ 5 mil a R$ 10 mil") v.leads_5_10k_count += 1;
        const notaDaVariante = computeScore(lead);
        v.lead_score_sum += notaDaVariante;
        v.lead_score_n += 1;
        acumularNota(v.notas, versaoDoScore(lead.score_version, VERSAO_SCORE_PADRAO), notaDaVariante);
      }

      for (const venda of (salesData || [])) {
        const page = venda.lead_id ? varianteDoLead.get(venda.lead_id) : undefined;
        if (!page) continue;
        const v = getVariante(page);
        const receita = Number(venda.revenue) || 0;
        v.sales_count += 1;
        v.revenue += receita;
        if (venda.sale_type === "assessoria") v.sales_assessoria_count += 1;
        else {
          v.sales_sprint_count += 1;
          v.sprint_units_count += sprintsDaVenda(venda);
        }
      }

      for (const reuniao of (meetingsData || [])) {
        const page = reuniao.lead_id ? varianteDoLead.get(reuniao.lead_id) : undefined;
        if (!page) continue;
        const v = getVariante(page);
        v.meetings_count += 1;
        if (jaAconteceu(reuniao)) v.meetings_decided_count += 1;
        if (isRealizada(reuniao)) v.meetings_attended_count += 1;
      }

      const divide = (a: number, b: number): number | null => (b > 0 ? a / b : null);
      const divideV = divide;

      /**
       * A nota média que a tela mostra — a da VERSÃO DOMINANTE, nunca a soma
       * das duas réguas.
       *
       * `avg_lead_score` mantém o nome e o tipo que o front já consome, e muda
       * de SEMÂNTICA: de "média de todos os leads" para "média dos leads da
       * versão de score mais frequente nesta linha". As outras versões vão em
       * `score_por_versao`, e `score_misturado` diz que existe mais de uma.
       * Misturar era o defeito: mesma faixa de faturamento dá 43,8 no quiz e
       * 20,0 no formulário curto (auditoria de 18/09/2026).
       */
      const notasParaSaida = (notas: NotasPorVersao) => {
        const m = fecharNotas(notas);
        return {
          avg_lead_score: m.media_dominante,
          score_por_versao: m.versoes,
          score_versao_dominante: m.versao_dominante,
          score_misturado: m.misturado,
          score_leads_fora_da_media: m.n_fora,
        };
      };
      const variantsPerformance = Array.from(varianteMap.values())
        .filter((v) => v.spend > 0 || v.sessions_count > 0 || v.leads_count > 0)
        .map((v) => ({
          page: v.page,
          spend: v.spend,
          impressions: v.impressions,
          clicks: v.clicks,
          landing_page_views: v.landing_page_views,
          sessions_count: v.sessions_count,
          quiz_views_count: v.quiz_views_count,
          leads_count: v.leads_count,
          mql_count: v.mql_count,
          leads_5_10k_count: v.leads_5_10k_count,
          meetings_count: v.meetings_count,
          meetings_attended_count: v.meetings_attended_count,
          meetings_decided_count: v.meetings_decided_count,
          sales_count: v.sales_count,
          sales_sprint_count: v.sales_sprint_count,
          sprint_units_count: v.sprint_units_count,
          sales_assessoria_count: v.sales_assessoria_count,
          revenue: v.revenue,
          is_active: v.is_active,
          ctl: divideV(v.spend, v.leads_count),
          cost_per_mql: divideV(v.spend, v.mql_count),
          mql_rate: divideV(v.mql_count, v.leads_count),
          cost_per_meeting: divideV(v.spend, v.meetings_attended_count),
          meeting_rate: divideV(v.meetings_count, v.mql_count),
          show_rate: divideV(v.mql_compareceram, v.mql_agendaram),
          win_rate: divideV(v.mql_compraram, v.mql_compareceram),
          cac: divideV(v.spend, v.sales_count),
          cac_sprint: divideV(v.spend, v.sales_sprint_count),
          cac_assessoria: divideV(v.spend, v.sales_assessoria_count),
          roas: divideV(v.revenue, v.spend),
          ...notasParaSaida(v.notas),
          cost_per_5_10k: divideV(v.spend, v.leads_5_10k_count),
          conv_page: divideV(v.quiz_views_count, v.sessions_count),
          conv_quiz: divideV(v.leads_count, v.quiz_views_count),
          conv_total: divideV(v.leads_count, v.sessions_count),
          conv_total_mql: divideV(v.mql_count, v.sessions_count),
        }))
        .sort((a, b) => a.page.localeCompare(b.page));

      const campaignsPerformance = Array.from(campaignMap.values())
        .filter((c) => c.spend > 0 || c.leads_count > 0)
        .map((c) => ({
          campaign: c.campaign,
          spend: c.spend,
          impressions: c.impressions,
          clicks: c.clicks,
          landing_page_views: c.landing_page_views,
          leads_count: c.leads_count,
          mql_count: c.mql_count,
          leads_5_10k_count: c.leads_5_10k_count,
          tier_small_count: c.tier_small_count,
          tier_medium_count: c.tier_medium_count,
          tier_large_count: c.tier_large_count,
          tier_enterprise_count: c.tier_enterprise_count,
          tier_enterprise_plus_count: c.tier_enterprise_plus_count,
          meetings_count: c.meetings_count,
          meetings_attended_count: c.meetings_attended_count,
          meetings_decided_count: c.meetings_decided_count,
          sales_count: c.sales_count,
          sales_sprint_count: c.sales_sprint_count,
          sprint_units_count: c.sprint_units_count,
          sales_assessoria_count: c.sales_assessoria_count,
          revenue: c.revenue,
          revenue_sprint: c.revenue_sprint,
          revenue_assessoria: c.revenue_assessoria,
          creatives_count: c.creatives.size,
          is_active: c.is_active,
          last_activity: c.last_activity,
          sessions_count: c.sessions_count,
          quiz_views_count: c.quiz_views_count,
          // Derivadas, calculadas sobre a soma — nunca média de taxas.
          ctl: divide(c.spend, c.leads_count),
          cost_per_mql: divide(c.spend, c.mql_count),
          mql_rate: divide(c.mql_count, c.leads_count),
          lead_per_view: divide(c.leads_count, c.landing_page_views),
          cost_per_meeting: divide(c.spend, c.meetings_attended_count),
          meeting_rate: divide(c.meetings_count, c.mql_count),
          show_rate: divide(c.mql_compareceram, c.mql_agendaram),
          win_rate: divide(c.mql_compraram, c.mql_compareceram),
          cac: divide(c.spend, c.sales_count),
          cac_sprint: divide(c.spend, c.sales_sprint_count),
          cac_assessoria: divide(c.spend, c.sales_assessoria_count),
          roas: divide(c.revenue, c.spend),
          ...notasParaSaida(c.notas),
          cost_per_5_10k: divide(c.spend, c.leads_5_10k_count),
          // Os três degraus do topo, medidos pelo tracking próprio.
          conv_page: divide(c.quiz_views_count, c.sessions_count),
          conv_quiz: divide(c.leads_count, c.quiz_views_count),
          conv_total: divide(c.leads_count, c.sessions_count),
          conv_total_mql: divide(c.mql_count, c.sessions_count),
        }))
        .sort((a, b) => b.spend - a.spend);

      // Nome das contas vem do cadastro permanente. Serve so para exibicao:
      // o agrupamento e a identidade sao pelo ad_account_id.
      const nomeDaConta = new Map<string, string>();
      let contasCadastradas: any[] = [];
      {
        // `timezone_name` é OPCIONAL: a coluna só passa a existir com a
        // migration 20260918160000. Pedi-la antes disso faria o PostgREST
        // devolver 400 e a aba inteira morreria por causa de um diagnóstico —
        // então a leitura cai para o select sem ela e o fuso vira o padrão
        // documentado (America/Sao_Paulo). Ver `diagnosticarFusos`.
        let res = await supabase.from("meta_ad_accounts").select("ad_account_id, account_name, timezone_name");
        if (res.error) res = await supabase.from("meta_ad_accounts").select("ad_account_id, account_name");
        contasCadastradas = res.data || [];
        contasCadastradas.forEach((x: any) => nomeDaConta.set(x.ad_account_id, x.account_name));
      }

      // ── FUSO: o dia da Meta contra o dia do banco ─────────────────────────
      //
      // `ad_spend.date` é o dia NO FUSO DA CONTA (a Meta devolve `date_start`
      // com `time_increment=1`). Leads e sessões são filtrados por `created_at`
      // em UTC contra um `from`/`to` que a tela já converteu do fuso do
      // navegador. Hoje as três contas que gastam são UTC−3, igual ao BRT, e o
      // deslocamento medido em 18/09/2026 foi de ZERO dias — por coincidência
      // de cadastro, não por desenho. Aqui o fuso passa a ser DECLARADO: cada
      // conta diz o seu (ou herda o padrão) e `divergente` acende quando ele
      // não bate com o fuso em que o filtro foi montado.
      const offsetFiltro = offsetDoFiltro(from);
      const contasComGastoNoPeriodo = new Set(
        (spendData || []).map((s: any) => idLimpo(s.ad_account_id)).filter(Boolean) as string[],
      );
      const fusosDasContas = diagnosticarFusos(
        contasCadastradas.filter((c: any) => contasComGastoNoPeriodo.has(c.ad_account_id)),
        offsetFiltro,
      );

      const creatives = Array.from(creativeMap.values()).map(c => {
        const mql_rate = c.leads_count > 0 ? c.mql_count / c.leads_count : 0;
        const cost_per_mql = c.mql_count > 0 ? c.spend / c.mql_count : null;
        const cost_per_tier_large = c.tier_large_count > 0 ? c.spend / c.tier_large_count : null;
        const cost_per_small = c.tier_small_count > 0 ? c.spend / c.tier_small_count : null;
        const cost_per_medium = c.tier_medium_count > 0 ? c.spend / c.tier_medium_count : null;
        const cost_per_enterprise = c.tier_enterprise_count > 0 ? c.spend / c.tier_enterprise_count : null;
        const cost_per_enterprise_plus = c.tier_enterprise_plus_count > 0 ? c.spend / c.tier_enterprise_plus_count : null;
        // Leads "qualificados" — apenas faixa exata "De R$ 5 mil a R$ 10 mil"
        const qualified_count = c.leads_5_10k_count;
        const cost_per_qualified = qualified_count > 0 ? c.spend / qualified_count : null;
        const cac = c.sales_count > 0 ? c.spend / c.sales_count : null;
        const cac_sprint = c.sales_sprint_count > 0 ? c.spend / c.sales_sprint_count : null;
        const cac_assessoria = c.sales_assessoria_count > 0 ? c.spend / c.sales_assessoria_count : null;
        const roas = c.spend > 0 ? c.revenue / c.spend : null;
        const cost_per_meeting = c.meetings_count > 0 ? c.spend / c.meetings_count : null;
        const lead_per_view = c.landing_page_views > 0 ? c.leads_count / c.landing_page_views : null;
        const ctl = c.clicks > 0 ? (c.leads_count / c.clicks) * 100 : null;
        const is_active = recentSpendKeys.has(c.row_key);
        const notas = notasParaSaida(c.notas);
        return {
          ...c,
          // `notas` é estado interno (soma por versão); a resposta leva as
          // médias já fechadas. Sai daqui para o JSON não carregar as somas.
          notas: undefined,
          account_name: c.ad_account_id ? (nomeDaConta.get(c.ad_account_id) ?? null) : null,
          mql_rate,
          cost_per_mql,
          cost_per_tier_large,
          cost_per_small,
          cost_per_medium,
          cost_per_enterprise,
          cost_per_enterprise_plus,
          qualified_count,
          cost_per_qualified,
          cac,
          cac_sprint,
          cac_assessoria,
          roas,
          cost_per_meeting,
          lead_per_view,
          ctl,
          meetings_count: c.meetings_count,
          meetings_attended_count: c.meetings_attended_count,
          is_active,
          ...notas,
          campaigns: Array.from(c.campaigns),
          // IDENTIDADE FINANCEIRA: de quais contas veio o gasto desta linha.
          //
          // Desde 18/09/2026 a linha JÁ É de uma conta só, então isto tem
          // sempre zero ou um item e `fusao_de_contas` é sempre falso. Os dois
          // campos ficam porque a tela já os consome e porque são a PROVA, na
          // própria resposta, de que a fusão acabou: se um dia voltarem a ter
          // mais de um item, a fusão voltou e a tela avisa em vez de somar em
          // silêncio.
          contas: Array.from(c.spend_por_conta.entries())
            .map(([id, v]) => ({
              ad_account_id: id,
              account_name: nomeDaConta.get(id) ?? null,
              spend: Math.round(v.spend * 100) / 100,
              clicks: v.clicks,
              impressions: v.impressions,
            }))
            .sort((a, b) => b.spend - a.spend),
          fusao_de_contas: c.spend_por_conta.size > 1,
          // AGORA SÃO. A linha é o par (conta, anúncio): gasto, LPV, leads,
          // MQL, HQL, reuniões, vendas e todas as taxas são de UMA conta. O que
          // sobra sem conta são os baldes (bio/direto, prévia do Gerenciador) e
          // as linhas de nome ambíguo, que se declaram por `identidade_metodo`.
          leads_separaveis_por_conta: c.ad_id !== null,
        };
      });

      // Totals
      const totalSpend = creatives.reduce((s, c) => s + c.spend, 0) + (spendTotal - spendMapped);
      const totalLeads = campaignFilter
        ? creatives.reduce((s, c) => s + c.leads_count, 0)
        : allLeads.length;
      // Lead de prospecção (garimpo do Instagram) não nasceu de mídia: fica fora
      // do custo por lead, do CTL e do lead/LPV (pedido do Rodger, 28/10/2026).
      // Com filtro de campanha ele já não entra, porque não tem campanha.
      const leadsProspeccao = campaignFilter
        ? 0
        : allLeads.filter((l: any) => l.origem_lead === "prospeccao").length;
      const leadsDeMidia = totalLeads - leadsProspeccao;
      const totalMql = creatives.reduce((s, c) => s + c.mql_count, 0);
      const totalTierSmall = creatives.reduce((s, c) => s + c.tier_small_count, 0);
      const totalTierMedium = creatives.reduce((s, c) => s + c.tier_medium_count, 0);
      const totalTierLarge = creatives.reduce((s, c) => s + c.tier_large_count, 0);
      const totalTierEnterprise = creatives.reduce((s, c) => s + c.tier_enterprise_count, 0);
      const totalTierEnterprisePlus = creatives.reduce((s, c) => s + c.tier_enterprise_plus_count, 0);
      const totalSales = creatives.reduce((s, c) => s + c.sales_count, 0);
      const totalSalesSprint = creatives.reduce((s, c) => s + c.sales_sprint_count, 0);
      // Sprints vendidos (níveis) — o Sprint é vendido por nível, então três
      // transações podem ser dezessete sprints. Contagem separada de propósito:
      // misturar as duas fazia o painel mostrar "17 vendas" no card do Sprint e
      // "3 vendas" no card Total, com win rate de 1700%.
      const totalSprintUnits = creatives.reduce((s, c) => s + (c.sprint_units_count || 0), 0);
      const totalSalesAssessoria = creatives.reduce((s, c) => s + c.sales_assessoria_count, 0);
      const totalSalesParceria = creatives.reduce((s, c) => s + (c.sales_parceria_count || 0), 0);
      const totalSalesRefunded = creatives.reduce((s, c) => s + (c.sales_refunded_count || 0), 0);
      const totalRevenue = creatives.reduce((s, c) => s + c.revenue, 0);
      const totalRevenueSprint = creatives.reduce((s, c) => s + c.revenue_sprint, 0);
      const totalRevenueAssessoria = creatives.reduce((s, c) => s + c.revenue_assessoria, 0);
      const totalRevenueAssessoriaReceived = creatives.reduce((s, c) => s + (c.revenue_assessoria_received || 0), 0);
      const totalRevenueAssessoriaToReceive = creatives.reduce((s, c) => s + (c.revenue_assessoria_to_receive || 0), 0);
      const totalLandingPageViews = creatives.reduce((s, c) => s + c.landing_page_views, 0);
      const totalQualified = creatives.reduce((s, c) => s + c.leads_5_10k_count, 0);
      const totalClicks = creatives.reduce((s, c) => s + (c.clicks || 0), 0);
      const totalImpressions = creatives.reduce((s, c) => s + (c.impressions || 0), 0);
      // Nota do TOTAL, também por versão. Somar as duas réguas num número só
      // era o mesmo defeito da coluna, na linha de cima da tela.
      const notasTotais = novaNotaPorVersao();
      for (const agg of creativeMap.values()) {
        for (const [versao, s] of Object.entries(agg.notas.porVersao)) {
          const alvo = (notasTotais.porVersao[versao] ??= { soma: 0, n: 0 });
          alvo.soma += s.soma;
          alvo.n += s.n;
        }
      }
      const totaisDeNota = notasParaSaida(notasTotais);
      const avgLeadScore = totaisDeNota.avg_lead_score;
      // HQL somado pelos criativos, igual ao MQL logo acima. A nota média e o
      // HQL respondem coisas diferentes: a média descreve o lote inteiro, o
      // HQL conta quem passou do portão que concentra a receita.
      const totalHql = creatives.reduce((s, c) => s + (c.hql_count || 0), 0);

      return new Response(
        JSON.stringify({
          creatives,
          // Health check CROSS_ACCOUNT_MERGE_RISK, exposto para a tela poder
          // avisar em vez de somar em silencio. Vazio significa nenhuma
          // entidade de contas diferentes disputando o mesmo nome.
          cross_account_merge_risk: campanhasComNomeAmbiguo,
          // Corte de HQL por versão de score: { "v2.3": 73, "v3-form": 67 }.
          // A tela mostra o número daqui em vez de repetir 73 na mão.
          limiares_hql: LIMIARES_HQL,
          /**
           * Fuso declarado de cada conta que gastou no período, o fuso em que a
           * tela montou o filtro, e se eles divergem. `divergente: true` em
           * qualquer conta significa que gasto e leads podem estar falando de
           * dias diferentes — e a tela avisa em vez de somar em silêncio.
           */
          fuso: {
            padrao: FUSO_PADRAO_CONTA,
            offset_filtro_min: offsetFiltro,
            contas: fusosDasContas,
            divergencia: fusosDasContas.some((f) => f.divergente),
          },
        campaigns_performance: campaignsPerformance,
        campaign_attribution_methods: metodosAtribuicao,
        variants_performance: variantsPerformance,
       
          totals: {
            spend: totalSpend,
            leads: totalLeads,
            mql: totalMql,
            clicks: totalClicks,
            impressions: totalImpressions,
            ctl: totalClicks > 0 ? (leadsDeMidia / totalClicks) * 100 : null,
            landing_page_views: totalLandingPageViews,
            lead_per_view: totalLandingPageViews > 0 ? leadsDeMidia / totalLandingPageViews : null,
            tier_small: totalTierSmall,
            tier_medium: totalTierMedium,
            tier_large: totalTierLarge,
            tier_enterprise: totalTierEnterprise,
            tier_enterprise_plus: totalTierEnterprisePlus,
            qualified: totalQualified,
            cp_qualified: totalQualified > 0 ? totalSpend / totalQualified : null,
            sales: totalSales,
            sales_sprint: totalSalesSprint,
            sprint_units: totalSprintUnits,
            /** Custo por venda de cada mês tocado pelo filtro. Ver `cacPorMes`. */
            cac_by_month: cacPorMes,
            sales_assessoria: totalSalesAssessoria,
            sales_parceria: totalSalesParceria,
            sales_refunded: totalSalesRefunded,
            revenue: totalRevenue,
            revenue_sprint: totalRevenueSprint,
            revenue_assessoria: totalRevenueAssessoria,
            revenue_assessoria_received: totalRevenueAssessoriaReceived,
            revenue_assessoria_to_receive: totalRevenueAssessoriaToReceive,
            meetings: totalMeetingsCount,
            meetings_attended: totalMeetingsAttendedCount,
            /** Reuniões com desfecho (realizada ou no-show): denominador do comparecimento. */
            meetings_decided: totalMeetingsDecidedCount,
            meetings_pending: totalMeetingsPendingCount,
            /** Coorte: o que os MQL DESTE período fizeram depois. Base das taxas. */
            mql_agendaram: totalMqlAgendaram,
            mql_compareceram: totalMqlCompareceram,
            mql_compraram: totalMqlCompraram,
            leads_prospeccao: leadsProspeccao,
            cpl: leadsDeMidia > 0 ? totalSpend / leadsDeMidia : null,
            cpmql: totalMql > 0 ? totalSpend / totalMql : null,
            hql: totalHql,
            cp_hql: totalHql > 0 ? totalSpend / totalHql : null,
            cp_tier_small: totalTierSmall > 0 ? totalSpend / totalTierSmall : null,
            cp_tier_medium: totalTierMedium > 0 ? totalSpend / totalTierMedium : null,
            cp_tier_large: totalTierLarge > 0 ? totalSpend / totalTierLarge : null,
            cp_tier_enterprise: totalTierEnterprise > 0 ? totalSpend / totalTierEnterprise : null,
            cp_tier_enterprise_plus: totalTierEnterprisePlus > 0 ? totalSpend / totalTierEnterprisePlus : null,
            cac: totalSales > 0 ? totalSpend / totalSales : null,
            cac_sprint: totalSalesSprint > 0 ? totalSpend / totalSalesSprint : null,
            cac_assessoria: totalSalesAssessoria > 0 ? totalSpend / totalSalesAssessoria : null,
            roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
            cp_meeting: totalMeetingsCount > 0 ? totalSpend / totalMeetingsCount : null,
            avg_lead_score: avgLeadScore,
            score_por_versao: totaisDeNota.score_por_versao,
            score_versao_dominante: totaisDeNota.score_versao_dominante,
            score_misturado: totaisDeNota.score_misturado,
            score_leads_fora_da_media: totaisDeNota.score_leads_fora_da_media,
          },
          data_quality: {
            leads_with_creative: leadsWithCreative,
            leads_total: allLeads.length,
            spend_mapped: spendMapped,
            spend_total: spendTotal,
            sales_without_creative: salesWithoutCreative,
            leads_without_utms: leadsWithoutUtms,
            leads_recovered: allLeads.filter((l: any) => l._recovered).length,
            /** Leads que chegaram com macro literal da Meta: clique de PRÉVIA no Gerenciador, não tráfego. */
            leads_previa_gerenciador: leadsPrevia,
            /** Leads com nome de criativo que não casou com anúncio nenhum conhecido. */
            leads_sem_anuncio: leadsSemAnuncio,
            /** Leads cuja linha saiu do NOME e não de um ID — o caminho que pode errar de conta. */
            leads_por_nome: leadsPorNome,
            /** A janela realmente usada nas contagens, para a tela nunca discordar do servidor. */
            janela: { from, to: toEnd, from_date: fromDate, to_date: toDate },
            /** Como cada linha da tabela foi identificada. Método fraco é para aparecer. */
            identidade_por_metodo: (() => {
              const contagem: Record<string, number> = {};
              for (const c of creativeMap.values()) {
                contagem[c.identidade_metodo] = (contagem[c.identidade_metodo] || 0) + 1;
              }
              return contagem;
            })(),
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── GET /manual-sales ────
    if (path === "/manual-sales" && req.method === "GET" && url.searchParams.get("_method") !== "POST") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      
      // O NOME DE QUEM COMPROU vem do lead vinculado, não do campo digitado.
      // Medido em 16/09/2026: das 14 vendas desde julho, 14 têm `lead_id` e
      // NENHUMA tem `lead_nome` preenchido — esse campo só existe para venda
      // lançada sem vínculo. Quem lia `lead_nome` mostrava "sem nome" sempre.
      let query = supabase.from("manual_sales").select("*, leads:lead_id(created_at, nome_completo)").order("sale_date", { ascending: false });
      if (from) query = query.gte("sale_date", from);
      if (to) query = query.lte("sale_date", to);
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Flatten lead_created_at into the row
      const flat = (data || []).map((s: any) => ({
        ...s,
        lead_created_at: s.leads?.created_at ?? null,
        // Nome já resolvido: o do lead vinculado, e o digitado como reserva.
        lead_nome_resolvido: s.leads?.nome_completo ?? s.lead_nome ?? null,
        leads: undefined,
      }));
      return new Response(JSON.stringify(flat), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── GET /sales-cycle ────
    // Returns avg sales cycle (days) over ALL historical sales with a linked lead
    if (path === "/sales-cycle" && req.method === "GET") {
      const { data, error } = await supabase
        .from("manual_sales")
        .select("sale_date, leads:lead_id(created_at)")
        .not("lead_id", "is", null);
      if (error) throw error;

      const days: number[] = [];
      for (const s of (data || []) as any[]) {
        const leadCreated = s.leads?.created_at;
        if (!leadCreated || !s.sale_date) continue;
        const leadDate = new Date(leadCreated);
        const saleDate = new Date(s.sale_date + "T12:00:00Z");
        if (isNaN(leadDate.getTime()) || isNaN(saleDate.getTime())) continue;
        const diffDays = Math.max(0, Math.round((saleDate.getTime() - leadDate.getTime()) / 86400000));
        days.push(diffDays);
      }
      const avg = days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : null;
      const sorted = [...days].sort((a, b) => a - b);
      const median = sorted.length > 0
        ? (sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[(sorted.length - 1) / 2])
        : null;

      return new Response(JSON.stringify({
        avg_days: avg,
        median_days: median,
        count: days.length,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── DELETE /manual-sales/:id ────
    const deleteSaleMatch = path.match(/^\/manual-sales\/([a-f0-9-]+)$/);
    if (deleteSaleMatch && req.method === "DELETE") {
      const saleId = deleteSaleMatch[1];
      const { error } = await supabase.from("manual_sales").delete().eq("id", saleId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── PUT /manual-sales/:id ────
    const updateSaleMatch = path.match(/^\/manual-sales\/([a-f0-9-]+)$/);
    if (updateSaleMatch && req.method === "PUT") {
      const saleId = updateSaleMatch[1];
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.revenue !== undefined) updates.revenue = parseFloat(body.revenue);
      if (body.sale_type !== undefined) updates.sale_type = body.sale_type;
      if (body.commission_pct !== undefined) {
        updates.commission_pct = body.commission_pct === null || body.commission_pct === ""
          ? null
          : parseFloat(body.commission_pct);
      }
      if (body.notes !== undefined) updates.notes = body.notes || null;
      if (body.closer !== undefined) updates.closer = body.closer || null;
      if (body.origem !== undefined && ORIGENS_VALIDAS.has(body.origem)) updates.origem = body.origem;
      if (body.lead_nome !== undefined) updates.lead_nome = body.lead_nome || null;
      // Reembolso é estado, não exclusão. Data vazia desfaz o reembolso.
      if (body.refunded_at !== undefined) updates.refunded_at = body.refunded_at || null;
      if (body.refund_amount !== undefined) updates.refund_amount = body.refund_amount === null || body.refund_amount === "" ? null : parseFloat(body.refund_amount);
      if (body.refund_reason !== undefined) updates.refund_reason = body.refund_reason || null;
      if (body.payment_type !== undefined) updates.payment_type = body.payment_type;
      if (body.installments_count !== undefined) updates.installments_count = body.installments_count === null || body.installments_count === "" ? null : parseInt(body.installments_count);
      if (body.installment_value !== undefined) updates.installment_value = body.installment_value === null || body.installment_value === "" ? null : parseFloat(body.installment_value);
      if (body.amount_received !== undefined) updates.amount_received = parseFloat(body.amount_received) || 0;
      if (body.delivery_months !== undefined) updates.delivery_months = body.delivery_months === null || body.delivery_months === "" ? null : parseFloat(body.delivery_months);
      if (body.ads_contracted !== undefined) updates.ads_contracted = body.ads_contracted === null || body.ads_contracted === "" ? null : parseInt(body.ads_contracted, 10);
      if (body.bodies_per_month !== undefined) updates.bodies_per_month = body.bodies_per_month === null || body.bodies_per_month === "" ? null : parseInt(body.bodies_per_month, 10);
      // Quantos sprints a venda representa. Vazio grava nulo, e quem lê trata
      // nulo como uma unidade — nunca como zero, que sumiria com a venda.
      if (body.sprint_levels !== undefined) updates.sprint_levels = body.sprint_levels === null || body.sprint_levels === "" ? null : parseInt(body.sprint_levels, 10);
      const { data, error } = await supabase.from("manual_sales").update(updates).eq("id", saleId).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── POST /manual-sales ────
    if (path === "/manual-sales" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const params = Object.fromEntries(url.searchParams);
      const leadId = params.lead_id || null;
      const revenue = parseFloat(params.revenue);
      // De qual funil veio. Indicação e social selling não passam pelo
      // formulário, então chegam sem lead_id e trazem o nome no lugar.
      const origem = ORIGENS_VALIDAS.has(params.origem || "") ? params.origem : "midia_paga";
      const paymentType = params.payment_type || "tcv_total";
      const installmentsCount = params.installments_count ? parseInt(params.installments_count) : null;
      const installmentValue = params.installment_value ? parseFloat(params.installment_value) : null;
      const amountReceived = params.amount_received !== undefined && params.amount_received !== ""
        ? parseFloat(params.amount_received)
        : (paymentType === "tcv_total" ? revenue : 0);
      const deliveryMonths = params.delivery_months ? parseFloat(params.delivery_months) : null;
      // Criativos contratados: base do custo de entrega (4 ganchos = 1 body).
      const adsContracted = params.ads_contracted ? parseInt(params.ads_contracted, 10) : null;
      const bodiesPerMonth = params.bodies_per_month ? parseInt(params.bodies_per_month, 10) : null;
      const sprintLevels = params.sprint_levels ? parseInt(params.sprint_levels, 10) : null;
      // Parceria é comissionada: não tem TCV, não tem parcela e não tem caixa
      // no fechamento. Zerar aqui, no servidor, evita que um campo esquecido na
      // tela vire receita contratada que não existe.
      const ehParceria = params.sale_type === "parceria";
      const comissao = params.commission_pct ? parseFloat(params.commission_pct) : null;
      const { data, error } = await supabase.from("manual_sales").insert([{
        sale_date: params.sale_date,
        revenue: ehParceria ? 0 : revenue,
        lead_id: leadId,
        creative_key: params.creative_key || null,
        utm_content: params.utm_content || null,
        notes: params.notes || null,
        origem,
        lead_nome: params.lead_nome || null,
        sale_type: params.sale_type || "sprint",
        commission_pct: comissao !== null && !isNaN(comissao) ? comissao : null,
        refunded_at: params.refunded_at || null,
        refund_amount: params.refund_amount ? parseFloat(params.refund_amount) : null,
        refund_reason: params.refund_reason || null,
        closer: params.closer || null,
        payment_type: ehParceria ? "tcv_total" : paymentType,
        installments_count: ehParceria ? null : installmentsCount,
        installment_value: ehParceria ? null : installmentValue,
        amount_received: ehParceria ? 0 : (isNaN(amountReceived) ? 0 : amountReceived),
        delivery_months: deliveryMonths !== null && !isNaN(deliveryMonths) ? deliveryMonths : null,
        ads_contracted: adsContracted !== null && !isNaN(adsContracted) ? adsContracted : null,
        bodies_per_month: bodiesPerMonth !== null && !isNaN(bodiesPerMonth) ? bodiesPerMonth : null,
        sprint_levels: sprintLevels !== null && !isNaN(sprintLevels) && sprintLevels > 0 ? sprintLevels : null,
      }]).select().maybeSingle();

      if (error) throw error;

      // Fire Purchase event to Meta CAPI if we have a linked lead
      if (leadId) {
        try {
          const respVenda = await chamarMetaCapi({
            lead_id: leadId,
            event_name: "Purchase",
            // Parceria vale zero para o Meta: não houve receita contratada, e
            // mandar um valor inventado ensinaria o algoritmo a otimizar para
            // um resultado que não aconteceu.
            value: ehParceria ? 0 : revenue,
            currency: "BRL",
            // event_id preso à VENDA, não ao instante do envio. O padrão do
            // meta-capi inclui o timestamp, então cada reenvio virava um
            // evento novo aos olhos do Meta e a mesma venda podia ser contada
            // duas vezes — inflando o ROAS da campanha e fazendo o algoritmo
            // otimizar para o anúncio errado.
            event_id: `sale_${data?.id}`,
            // Registra o envio POR VENDA (chave "Purchase:<id da venda>"). A
            // chave antiga "Purchase" era por lead e fazia a segunda venda do
            // mesmo cliente nunca chegar ao Meta.
            dedup_key: capiKey("Purchase", data?.id),
            // A data da VENDA, não a do clique no botão de salvar. Sem isso
            // uma venda de ontem entra como receita de hoje e o Meta compara
            // a janela de atribuição contra o horário errado. Venda com mais
            // de 7 dias o meta-capi recusa (422) e fica no log como rejected.
            event_time: saleDateSeconds(params.sale_date),
            // A venda é registrada à mão no painel: não veio de clique na
            // página. O Meta pede isso e usa para ponderar o sinal.
            action_source: "system_generated",
            custom_data: {
              order_id: data?.id,
              content_name: params.sale_type || "sprint",
              content_type: "product",
            },
          }, "admin");
          const respTexto = await respVenda.text();
          console.log(`Purchase CAPI event for lead ${leadId}, revenue ${revenue}: ${respVenda.status} ${respTexto.slice(0, 300)}`);
          // A chave por venda o meta-capi marca; a chave antiga por lead fica
          // marcada aqui para o retroativo continuar sabendo da primeira venda.
          if (respVenda.ok) await marcarNoLead(supabase, leadId, ["Purchase"]);
        } catch (capiErr) {
          console.error("Failed to fire Purchase CAPI:", capiErr);
        }
      }

      // Com o e-mail do cliente, a venda vira cliente no Hub (Sprint ou
      // Assessoria). Parceria não tem cliente para atender. Falha aqui não
      // desfaz a venda: o resultado fica gravado na linha e volta para a tela.
      const clienteEmail = (params.cliente_email || "").trim().toLowerCase();
      let hub: Record<string, unknown> | null = null;
      if (data?.id && clienteEmail && (data.sale_type === "sprint" || data.sale_type === "assessoria")) {
        hub = await criarClienteNoHub({
          sale_id: data.id,
          email: clienteEmail,
          nome: (params.cliente_nome || params.lead_nome || "").trim() || clienteEmail,
          tipo: data.sale_type,
          whatsapp: params.cliente_whatsapp || null,
          valor: isNaN(revenue) ? null : revenue,
          data_venda: params.sale_date || null,
          // Call em dupla fica com o Caio, que tem login de vendas no Hub.
          closer: params.closer === CLOSER_DUPLA_HUB ? "Caio" : (params.closer || null),
          forma_pagamento: paymentType,
        });
        await supabase.from("manual_sales").update({
          cliente_email: clienteEmail,
          hub_client_id: typeof hub.client_id === "string" ? hub.client_id : null,
          hub_status: hub.ok ? (hub.ja_existia ? "ja_existia" : "criado") : "erro",
          hub_erro: hub.ok ? ((hub.avisos as string[] | undefined)?.join(" | ") || null) : String(hub.erro ?? "erro"),
          hub_em: new Date().toISOString(),
        }).eq("id", data.id);
      } else if (data?.id && clienteEmail) {
        await supabase.from("manual_sales").update({ cliente_email: clienteEmail }).eq("id", data.id);
      }

      return new Response(JSON.stringify({ ...data, hub }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── POST /ad-spend ────
    if (path === "/ad-spend" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const params = Object.fromEntries(url.searchParams);
      const { data, error } = await supabase.from("ad_spend").insert([{
        date: params.date,
        spend: parseFloat(params.spend),
        impressions: parseInt(params.impressions) || 0,
        clicks: parseInt(params.clicks) || 0,
        utm_content: params.utm_content || null,
        creative_key: params.creative_key || null,
        campaign_name: params.campaign_name || null,
      }]).select().maybeSingle();

      if (error) throw error;
      return new Response(JSON.stringify(data), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── GET /drive-folders ────
    //
    // Onde fica, no Drive, a pasta de cada balde de gravação. O balde é
    // calculado na tela (criativo, senão campanha, senão funil) e a pasta é
    // registrada uma vez, na primeira gravação daquele balde. Da segunda em
    // diante o botão já abre direto no lugar certo.
    //
    // Enquanto o Drive não estiver conectado por OAuth é o Caio quem cola o
    // link uma vez por balde. Quando estiver, a mesma tabela passa a ser
    // preenchida pela API e nada na tela muda.
    if (path === "/drive-folders" && req.method === "GET") {
      const { data, error } = await supabase
        .from("drive_folders")
        .select("*")
        .order("bucket");
      if (error) throw error;
      return new Response(JSON.stringify(data || []), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ──── POST /drive-folders ────
    if (path === "/drive-folders" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const params = Object.fromEntries(url.searchParams);
      const bucket = (params.bucket || "").trim();
      const folderUrl = (params.folder_url || "").trim();
      if (!bucket || !folderUrl) {
        return new Response(JSON.stringify({ error: "bucket e folder_url são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // O id da pasta serve para quando o Drive entrar por API: com ele dá para
      // subir o arquivo direto, sem o humano navegar até lá.
      const idMatch = folderUrl.match(/\/folders\/([A-Za-z0-9_-]+)/);
      const { data, error } = await supabase
        .from("drive_folders")
        .upsert({
          bucket,
          label: params.label || null,
          folder_url: folderUrl,
          folder_id: idMatch ? idMatch[1] : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "bucket" })
        .select()
        .maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ──── POST /meetings/:id/analise ────
    //
    // A leitura da call pela IA. Não é a gravação: é o Processo Abóbora, o que
    // o lead declarou no quiz, o desfecho, e o histórico de todas as outras
    // reuniões com Abóbora — com as taxas de fechamento calculadas em SQL, não
    // pelo modelo. Ver `analise_call.ts`.
    const analiseMatch = path.match(/^\/meetings\/([a-f0-9-]+)\/analise$/);
    if (analiseMatch && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const r = await analisarCall(supabase, analiseMatch[1]);
      if (!r.ok) {
        return new Response(JSON.stringify({ error: r.erro }), {
          status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(r.analise), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ──── GET /metas-periodo ────
    //
    // A meta rateada para o intervalo que a tela está filtrando, para aparecer
    // ao lado de cada KPI. É o mesmo rateio das semanas (dias úteis para o
    // funil, dias corridos para mídia), só que para um recorte arbitrário.
    //
    // Existe separada do /metas de propósito: aquela rota devolve o mês inteiro
    // com a cascata das semanas e é cara; esta responde uma pergunta só e é
    // chamada a cada troca de filtro.
    if (path === "/metas-periodo" && req.method === "GET") {
      const hojeBr = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const de = (url.searchParams.get("from") || hojeBr).slice(0, 10);
      const ate = (url.searchParams.get("to") || hojeBr).slice(0, 10);
      if (ate < de) {
        return new Response(JSON.stringify({ error: "intervalo invertido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const meses = mesesDoIntervalo(de, ate);
      const { data: linhasMeta } = await supabase
        .from("commercial_goals")
        .select("*")
        .in("month", meses);

      const porMes: Record<string, Record<string, number | null>> = {};
      for (const m of (linhasMeta || [])) {
        porMes[String((m as Record<string, unknown>).month)] = m as Record<string, number | null>;
      }

      const resultado = metaDoIntervalo(porMes, de, ate);
      return new Response(JSON.stringify(resultado), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /**
     * Bloqueia horário que fica a menos de 3 horas de outra call do mesmo
     * closer. A checagem é no servidor porque a tela do SDR só tem em memória as
     * reuniões do período filtrado — uma call daqui a duas semanas não estaria
     * lá, e o bloqueio passaria batido.
     */
    const checarAgenda = async (
      quando: string,
      closer: string | null,
      ignorarId?: string,
    ): Promise<Response | null> => {
      const alvo = Date.parse(quando);
      if (Number.isNaN(alvo)) return null;
      const janelaMs = INTERVALO_MINIMO_HORAS * 60 * 60 * 1000;
      const { data: proximas } = await supabase
        .from("meetings")
        .select("id, scheduled_at, closer, notes, status, attended")
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", new Date(alvo - janelaMs).toISOString())
        .lte("scheduled_at", new Date(alvo + janelaMs).toISOString());
      const choque = conflitoDeAgenda(quando, closer, (proximas || []) as never[], ignorarId);
      if (!choque) return null;
      return new Response(JSON.stringify({
        error: mensagemDeConflito(choque),
        conflito: { id: choque.id, scheduled_at: choque.scheduled_at, closer: choque.closer },
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    };

    // ──── GET /funis ────
    //
    // Reuniões, vendas e receita separadas por funil de origem. Existe porque
    // desde 03/09/2026 há três funis rodando e só um deles custa mídia: sem
    // separar, a receita de indicação entra na conta do tráfego e faz o CAC
    // parecer metade do que é.
    //
    // A mídia aparece só na linha de mídia paga, e de propósito: é o único
    // funil que tem custo mensurável hoje. Indicação e social selling têm custo
    // (tempo de time), mas ele não está em lugar nenhum do sistema, e inventar
    // um número seria pior do que deixar em branco.
    // ── Desempenho por conta → campanha → conjunto → anúncio → lead ────────
    //
    // Tudo por ID. A conta de um anúncio é a conta em que o `ad_spend` o
    // registrou; nome é só rótulo (ver contas_desempenho.ts, onde moram a soma e
    // as regras de MQL e HQL). Esta rota só lê.
    // ──── GET /aquisicao-ritmo ────
    //
    // Uma linha por DIA: gasto, lead, MQL, HQL e SQL. Serve a duas perguntas
    // que o total do período não responde — quais dias da semana rendem HQL, e
    // qual semana do mês rende — e é o insumo do gráfico diário.
    //
    // A agregação por dia-da-semana e por semana-do-mês fica no FRONT de
    // propósito: é a mesma série, cortada de dois jeitos, e devolver as duas
    // somas prontas criaria dois números que um dia discordam do gráfico.
    //
    // O dia do gasto é o dia da CONTA de anúncio (`ad_spend.date` já vem no
    // fuso dela) e o dia do lead é o dia de São Paulo. Eles não são o mesmo
    // relógio, e juntar os dois numa linha só é uma aproximação — boa para ler
    // ritmo, ruim para fechar caixa. Está dito aqui porque quem ler a tela não
    // tem como saber.
    if (path === "/aquisicao-ritmo" && req.method === "GET") {
      const fromDate = (url.searchParams.get("from_date") || url.searchParams.get("from") || "").slice(0, 10);
      const toDate = (url.searchParams.get("to_date") || url.searchParams.get("to") || "").slice(0, 10);
      if (!fromDate || !toDate) {
        return new Response(
          JSON.stringify({ error: "from_date e to_date são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const LOTE = 1000;
      const paginarTudo = async (montar: () => any): Promise<any[]> => {
        const linhas: any[] = [];
        for (let offset = 0; ; offset += LOTE) {
          const { data, error } = await montar().range(offset, offset + LOTE - 1);
          if (error) throw error;
          if (data?.length) linhas.push(...data);
          if ((data?.length || 0) < LOTE) return linhas;
        }
      };

      const [gastos, leadsRitmo] = await Promise.all([
        paginarTudo(() => supabase.from("ad_spend")
          .select("date, spend").gte("date", fromDate).lte("date", toDate).order("id")),
        paginarTudo(() => supabase.from("leads")
          .select("created_at, score, score_version, investimento_faixa, sdr_override, sql_at")
          .gte("created_at", fromDate + "T00:00:00.000Z")
          .lte("created_at", toDate + "T23:59:59.999Z")
          .order("created_at")),
      ]);

      const porDia = new Map<string, { dia: string; spend: number; leads: number; mql: number; hql: number; sql: number }>();
      const linhaDe = (dia: string) => {
        let l = porDia.get(dia);
        if (!l) { l = { dia, spend: 0, leads: 0, mql: 0, hql: 0, sql: 0 }; porDia.set(dia, l); }
        return l;
      };
      for (const g of gastos) linhaDe(String(g.date)).spend += Number(g.spend) || 0;
      for (const l of leadsRitmo) {
        // O dia do lead é o dia de SÃO PAULO, não o do servidor: um lead das
        // 22h de Brasília nasce no dia seguinte em UTC, e isso moveria leads
        // de domingo para segunda — exatamente a leitura que a tela quer fazer.
        const dia = new Date(l.created_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const linha = linhaDe(dia);
        linha.leads++;
        if (ehMqlDoPainel(l.investimento_faixa, l.sdr_override)) linha.mql++;
        if (ehHighQualityLead(l.score, l.score_version)) linha.hql++;
        if (l.sql_at) linha.sql++;
      }

      const dias = [...porDia.values()].sort((x, y) => x.dia.localeCompare(y.dia))
        .map((d) => ({ ...d, spend: Number(d.spend.toFixed(2)) }));
      return new Response(JSON.stringify({ periodo: { from: fromDate, to: toDate }, dias }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── GET /aquisicao-topo ────
    //
    // As três primeiras etapas da cascata de aquisição: quem chegou, quem
    // entrou no formulário e quem completou — já sem robô e sem escritório.
    //
    // Existe separado do `/contas-desempenho` porque o topo do funil mora em
    // `lead_sessions` e o resto mora em `ad_spend` + `leads`. Juntar as duas
    // leituras numa rota só faria o custo de uma virar o custo da outra.
    //
    // O filtro é o coração da rota, não um detalhe: o crawler da Meta dispara
    // `started_quiz` sem nunca completar nada (D-007), e em 30 dias ele foi 73%
    // dos inícios de quiz. Sem tirá-lo, a taxa de início da página aparece três
    // vezes maior do que é, e o denominador de toda a cascata fica errado.
    //
    // Sessão SEM IP conta como gente, de propósito. Não há prova de robô nela,
    // e o lado seguro é não descartar pessoa — descartar infla conversão, que é
    // o erro que ninguém percebe.
    if (path === "/aquisicao-topo" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (!from || !to) {
        return new Response(
          JSON.stringify({ error: "from e to são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const fromISO = from;
      const toISO = to.includes("T") ? to : to + "T23:59:59.999Z";

      // Blocos IPv4 e o prefixo IPv6 do AS32934 (Meta). Lista explícita, não
      // regex esperta: um bloco novo tem que ser acrescentado à mão, com data,
      // em vez de aparecer por acidente num padrão frouxo.
      const BLOCOS_META = new Set([
        "31.13", "66.220", "69.63", "69.170", "69.171", "173.252",
        "157.240", "179.60", "185.60", "204.15", "102.132",
      ]);
      const PREFIXO_META_V6 = "2a03:2880";
      // IP fixo do escritório da Champion. Visita de dentro de casa não é lead
      // nem é mercado, e some no meio de 6 mil sessões se não for nomeada.
      const IP_ESCRITORIO = "168.196.82.22";

      const ehMeta = (ip: string | null): boolean => {
        if (!ip) return false;
        if (ip.startsWith(PREFIXO_META_V6)) return true;
        const partes = ip.split(".");
        return partes.length === 4 && BLOCOS_META.has(`${partes[0]}.${partes[1]}`);
      };

      const LOTE = 1000;
      const linhas: Array<{ ip_address: string | null; started_quiz: boolean | null; completed: boolean | null }> = [];
      for (let offset = 0; ; offset += LOTE) {
        const { data, error } = await supabase
          .from("lead_sessions")
          .select("ip_address, started_quiz, completed")
          .gte("created_at", fromISO)
          .lte("created_at", toISO)
          .order("id")
          .range(offset, offset + LOTE - 1);
        if (error) throw error;
        if (data?.length) linhas.push(...(data as typeof linhas));
        if ((data?.length || 0) < LOTE) break;
      }

      let crawlerMeta = 0, escritorio = 0, semIp = 0, gente = 0, genteQuiz = 0, genteCompletou = 0;
      for (const l of linhas) {
        const ip = l.ip_address ? String(l.ip_address) : null;
        if (ehMeta(ip)) { crawlerMeta++; continue; }
        if (ip === IP_ESCRITORIO) { escritorio++; continue; }
        if (!ip) semIp++;
        gente++;
        if (l.started_quiz) genteQuiz++;
        if (l.completed) genteCompletou++;
      }

      return new Response(JSON.stringify({
        periodo: { from: fromISO, to: toISO },
        total: linhas.length,
        descartadas: crawlerMeta + escritorio,
        crawler_meta: crawlerMeta,
        escritorio,
        // Dentro de `gente`, não fora dela: está aqui para a aba de qualidade
        // saber de quantas sessões não se sabe a procedência.
        sem_ip: semIp,
        gente,
        gente_quiz: genteQuiz,
        gente_completou: genteCompletou,
        regra: {
          ip_escritorio: IP_ESCRITORIO,
          blocos_meta: [...BLOCOS_META, PREFIXO_META_V6],
          sem_ip_conta_como_gente: true,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/contas-desempenho" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;
      const fromDate = url.searchParams.get("from_date") || (from && !from.includes("T") ? from : null);
      const toDate = url.searchParams.get("to_date") || (to && !to.includes("T") ? to : null);

      const LOTE = 1000;
      const paginar = async (montar: () => any): Promise<any[]> => {
        const linhas: any[] = [];
        for (let offset = 0; ; offset += LOTE) {
          const { data, error } = await montar().range(offset, offset + LOTE - 1);
          if (error) throw error;
          if (data?.length) linhas.push(...data);
          if ((data?.length || 0) < LOTE) return linhas;
        }
      };
      const CAMPOS_ID = "ad_account_id, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date";

      const [gasto, leadsPeriodo, contasRes] = await Promise.all([
        paginar(() => {
          let q = supabase
            .from("ad_spend")
            .select(`${CAMPOS_ID}, spend, impressions, clicks, inline_link_clicks, landing_page_views, meta_leads`)
            .not("ad_id", "is", null);
          if (fromDate) q = q.gte("date", fromDate);
          if (toDate) q = q.lte("date", toDate);
          return q.order("id");
        }),
        paginar(() => {
          let q = supabase
            .from("leads")
            .select("id, created_at, nome_completo, campaign_id, adset_id, ad_id, placement, score, score_version, investimento_faixa, sdr_override, faturamento_declarado, sql_at");
          if (from) q = q.gte("created_at", from);
          if (toEnd) q = q.lte("created_at", toEnd);
          return q.order("created_at").order("id");
        }),
        supabase.from("meta_ad_accounts").select("ad_account_id, account_name, currency, sync_enabled"),
      ]);
      if (contasRes.error) throw contasRes.error;

      // Anúncio que trouxe lead mas não gastou no período: a identidade vem do
      // `ad_spend` de outra data (mais recente primeiro) e, na falta, do cache.
      const PEDACO = 100;
      const comGasto = new Set(gasto.map((g) => g.ad_id));
      const semIdentidade = [...new Set(leadsPeriodo.map((l) => l.ad_id).filter((id) => id && !comGasto.has(id)))] as string[];
      const identidadesExtras: any[] = [];
      for (let i = 0; i < semIdentidade.length; i += PEDACO) {
        const pedaco = semIdentidade.slice(i, i + PEDACO);
        identidadesExtras.push(
          ...(await paginar(() =>
            supabase.from("ad_spend").select(CAMPOS_ID).in("ad_id", pedaco).order("date", { ascending: false }).order("id")
          )),
        );
      }
      const achados = new Set(identidadesExtras.map((x) => x.ad_id));
      const aindaSem = semIdentidade.filter((id) => !achados.has(id));
      identidadesExtras.push(...await emLotes<any>(aindaSem, PEDACO, (lote) =>
        supabase.from("meta_ads_cache")
          .select("ad_account_id, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name")
          .in("ad_id", lote)
      ));

      // Reuniões e vendas dos leads do período, de qualquer data.
      const idsLeads = leadsPeriodo.map((l) => l.id);
      const reunioes: any[] = [];
      const vendas: any[] = [];
      // Os dois lados já saíam juntos DENTRO de cada pedaço; o que estava em
      // fila eram os pedaços. Com 2.287 leads e pedaços de 100, eram 23 voltas
      // esperando umas pelas outras.
      {
        const [r, v] = await Promise.all([
          emLotes<any>(idsLeads, PEDACO, (lote) =>
            supabase.from("meetings").select("lead_id, status, attended, scheduled_at, created_at").in("lead_id", lote)),
          emLotes<any>(idsLeads, PEDACO, (lote) =>
            supabase.from("manual_sales").select("lead_id, revenue, refunded_at").in("lead_id", lote)),
        ]);
        reunioes.push(...r);
        vendas.push(...v);
      }

      const saida = montarDesempenho({
        gasto,
        identidadesExtras,
        leads: leadsPeriodo,
        reunioes,
        vendas,
        contas: contasRes.data || [],
      });
      return new Response(
        JSON.stringify({
          ...saida,
          periodo: { from, to: toEnd, from_date: fromDate, to_date: toDate },
          gerado_em: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (path === "/funis" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;
      const fromDate = from ? from.slice(0, 10) : null;
      const toDate = to ? to.slice(0, 10) : null;

      const [vendas, reunioes, gasto] = await Promise.all([
        (async () => {
          let q = supabase.from("manual_sales").select("origem, revenue, amount_received, sale_type, sale_date, refunded_at");
          if (fromDate) q = q.gte("sale_date", fromDate);
          if (toDate) q = q.lte("sale_date", toDate);
          const { data } = await q;
          return data || [];
        })(),
        (async () => {
          let q = supabase.from("meetings").select("origem, status, attended, scheduled_at, created_at, abobora_completa, recording_url");
          if (from) q = q.gte("created_at", from);
          if (toEnd) q = q.lte("created_at", toEnd);
          const { data } = await q;
          return data || [];
        })(),
        (async () => {
          // `spend` já está em BRL: a sincronização converte na entrada usando
          // exchange_rate, porque a conta é em dólar e o painel inteiro é em real.
          let q = supabase.from("ad_spend").select("spend");
          if (fromDate) q = q.gte("date", fromDate);
          if (toDate) q = q.lte("date", toDate);
          const { data } = await q;
          return data || [];
        })(),
      ]);

      type LinhaFunil = {
        origem: string;
        reunioes: number;
        realizadas: number;
        no_show: number;
        agendadas: number;
        abobora_completo: number;
        com_gravacao: number;
        vendas: number;
        receita: number;
        recebido: number;
        reembolsadas?: number;
        gasto: number | null;
        custo_por_venda: number | null;
      };

      const linhas: Record<string, LinhaFunil> = {};
      const linha = (o: string): LinhaFunil => (linhas[o] ??= {
        origem: o, reunioes: 0, realizadas: 0, no_show: 0, agendadas: 0,
        abobora_completo: 0, com_gravacao: 0, vendas: 0, receita: 0,
        recebido: 0, gasto: null, custo_por_venda: null,
      });
      for (const o of ["midia_paga", "indicacao", "social_selling"]) linha(o);

      for (const r of reunioes) {
        const l = linha(ORIGENS_VALIDAS.has(r.origem || "") ? r.origem! : "midia_paga");
        l.reunioes++;
        const st = statusDaReuniao(r);
        if (st === "realizada") l.realizadas++;
        else if (st === "no_show") l.no_show++;
        else l.agendadas++;
        if (r.abobora_completa) l.abobora_completo++;
        if (r.recording_url) l.com_gravacao++;
      }

      for (const v of vendas) {
        const l = linha(ORIGENS_VALIDAS.has(v.origem || "") ? v.origem! : "midia_paga");
        if (v.refunded_at) { l.reembolsadas = (l.reembolsadas || 0) + 1; continue; }
        l.vendas++;
        l.receita += Number(v.revenue) || 0;
        l.recebido += Number(v.amount_received) || 0;
      }

      const totalGasto = gasto.reduce((acc: number, g: Record<string, unknown>) => acc + (Number(g.spend) || 0), 0);
      const paga = linha("midia_paga");
      paga.gasto = totalGasto;
      paga.custo_por_venda = paga.vendas > 0 ? totalGasto / paga.vendas : null;

      const ordem = ["midia_paga", "indicacao", "social_selling"];
      const saida = ordem.map((o) => linhas[o]).filter(Boolean);
      const receitaTotal = saida.reduce((a, l) => a + l.receita, 0);

      return new Response(JSON.stringify({
        periodo: { from: from || null, to: to || null },
        funis: saida.map((l) => ({
          ...l,
          rotulo: ROTULO_ORIGEM[l.origem] || l.origem,
          // Quanto deste período veio de cada funil. É o número que responde
          // "quanto do faturamento depende de anúncio".
          pct_receita: receitaTotal > 0 ? l.receita / receitaTotal : null,
          taxa_comparecimento: (l.realizadas + l.no_show) > 0
            ? l.realizadas / (l.realizadas + l.no_show)
            : null,
        })),
        receita_total: receitaTotal,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── GET /organico ────
    //
    // O orgânico aberto por canal (direct por comentário, story, DM, link da bio,
    // link de story) e por peça (S5-C3, story-2026-10-21). O canal vem da view
    // lead_canal (migração de 21/10/2026). Reunião e venda entram pelo lead_id,
    // então só conta o que foi ligado ao lead. Contato é quem falou no direct,
    // virando lead ou não.
    if (path === "/organico" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;

      let qCanal = supabase.from("lead_canal")
        .select("lead_id, canal, peca_codigo, peca_titulo, peca_tipo, peca_link, peca_confianca")
        .not("canal", "in", "(pago,pago_sem_anuncio)");
      if (from) qCanal = qCanal.gte("created_at", from);
      if (toEnd) qCanal = qCanal.lte("created_at", toEnd);
      let qContatos = supabase.from("ig_contatos").select("origem, origem_detalhe");
      if (from) qContatos = qContatos.gte("primeira_em", from);
      if (toEnd) qContatos = qContatos.lte("primeira_em", toEnd);
      const [{ data: canais }, { data: contatos }] = await Promise.all([qCanal, qContatos]);

      const ids = (canais || []).map((c: Record<string, unknown>) => c.lead_id as string);
      const [leadsInfo, reunioes, vendas] = ids.length ? await Promise.all([
        supabase.from("leads").select("id, investimento_faixa, faturamento_faixa, sdr_override").in("id", ids).then((r) => r.data || []),
        supabase.from("meetings").select("lead_id, status, attended, scheduled_at, created_at").in("lead_id", ids).then((r) => r.data || []),
        supabase.from("manual_sales").select("lead_id, revenue, refunded_at").in("lead_id", ids).then((r) => r.data || []),
      ]) : [[], [], []];

      // O lead do direct responde faturamento, não investimento: vale o que tiver.
      const mql = new Set(leadsInfo
        .filter((l: Record<string, unknown>) => ehMqlDoPainel((l.investimento_faixa || l.faturamento_faixa) as string | null, l.sdr_override as string | null))
        .map((l: Record<string, unknown>) => l.id as string));
      const reuniaoPor: Record<string, { reunioes: number; realizadas: number }> = {};
      for (const r of reunioes) {
        const x = (reuniaoPor[r.lead_id as string] ??= { reunioes: 0, realizadas: 0 });
        x.reunioes++;
        if (statusDaReuniao(r) === "realizada") x.realizadas++;
      }
      const vendaPor: Record<string, { vendas: number; receita: number }> = {};
      for (const v of vendas) {
        if (v.refunded_at) continue;
        const x = (vendaPor[v.lead_id as string] ??= { vendas: 0, receita: 0 });
        x.vendas++;
        x.receita += Number(v.revenue) || 0;
      }

      type LinhaOrg = {
        chave: string; rotulo: string; contatos: number; leads: number; mql: number;
        reunioes: number; realizadas: number; vendas: number; receita: number;
        link?: string | null; tipo?: string | null; confianca?: string | null;
      };
      const nova = (chave: string, rotulo: string): LinhaOrg =>
        ({ chave, rotulo, contatos: 0, leads: 0, mql: 0, reunioes: 0, realizadas: 0, vendas: 0, receita: 0 });
      const ROTULO_CANAL: Record<string, string> = {
        direct_comentario: "Direct · comentário em post", direct_story: "Direct · resposta a story",
        direct_dm: "Direct · mensagem direta", direct_seguidor: "Direct · novo seguidor", direct_link: "Direct · link ref",
        story_link: "Link no story", bio: "Link da bio", prospeccao: "Prospecção", sem_origem: "Site sem origem",
      };
      const porCanal: Record<string, LinhaOrg> = {};
      const porPeca: Record<string, LinhaOrg> = {};
      const pecaPorLink: Record<string, LinhaOrg> = {};
      const somar = (l: LinhaOrg, id: string) => {
        l.leads++;
        if (mql.has(id)) l.mql++;
        const r = reuniaoPor[id]; if (r) { l.reunioes += r.reunioes; l.realizadas += r.realizadas; }
        const v = vendaPor[id]; if (v) { l.vendas += v.vendas; l.receita += v.receita; }
      };
      for (const c of (canais || []) as Record<string, string | null>[]) {
        const canal = c.canal || "sem_origem";
        somar(porCanal[canal] ??= nova(canal, ROTULO_CANAL[canal] || canal), c.lead_id!);
        const chavePeca = c.peca_codigo || c.peca_link;
        if (!chavePeca) continue;
        const p = (porPeca[chavePeca] ??= { ...nova(chavePeca, c.peca_titulo || chavePeca), link: c.peca_link, tipo: c.peca_tipo, confianca: c.peca_confianca });
        if (c.peca_link) pecaPorLink[c.peca_link] = p;
        somar(p, c.lead_id!);
      }
      // ig_contatos.origem usa os nomes do motor do direct (comentario, story, seguidor, ref, dm).
      const CANAL_DO_CONTATO: Record<string, string> = { comentario: "direct_comentario", story: "direct_story", seguidor: "direct_seguidor", ref: "direct_link" };
      for (const ct of (contatos || []) as Record<string, unknown>[]) {
        const canal = CANAL_DO_CONTATO[(ct.origem as string) || ""] || "direct_dm";
        (porCanal[canal] ??= nova(canal, ROTULO_CANAL[canal])).contatos++;
        const det = (ct.origem_detalhe || {}) as Record<string, string>;
        const p = (det.permalink && pecaPorLink[det.permalink]) || (det.automacao && porPeca[det.automacao]);
        if (p) p.contatos++;
      }

      const ordem = (a: LinhaOrg, b: LinhaOrg) => b.leads - a.leads || b.contatos - a.contatos;
      return new Response(JSON.stringify({
        periodo: { from: from || null, to: to || null },
        canais: Object.values(porCanal).sort(ordem),
        pecas: Object.values(porPeca).sort(ordem),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── GET /meetings/:id/detalhe ────
    //
    // A reunião com a APLICAÇÃO do lead junto. Existe separada da listagem
    // porque só serve quando alguém abre uma reunião: carregar o quiz inteiro de
    // trinta reuniões para mostrar sete colunas seria pagar caro por nada.
    //
    // O que ela responde é a pergunta do closer cinco minutos antes da call:
    // "com quem eu vou falar, o que essa pessoa declarou, e o que o SDR
    // levantou". Estava tudo no banco e em nenhuma tela.
    const detalheMatch = path.match(/^\/meetings\/([a-f0-9-]+)\/detalhe$/);
    if (detalheMatch && req.method === "GET") {
      const { data: reuniao } = await supabase
        .from("meetings").select("*").eq("id", detalheMatch[1]).maybeSingle();
      if (!reuniao) {
        return new Response(JSON.stringify({ error: "Reunião não encontrada" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let lead: Record<string, unknown> | null = null;
      if (reuniao.lead_id) {
        const { data } = await supabase
          .from("leads").select("*").eq("id", reuniao.lead_id).maybeSingle();
        lead = data || null;
      }

      const headlines = reuniao.lead_id
        ? await resolveHeadlineByLead(supabase, [reuniao.lead_id as string])
        : {};

      return new Response(JSON.stringify({
        ...reuniao,
        status: statusDaReuniao(reuniao),
        headline_path: reuniao.lead_id ? (headlines[reuniao.lead_id as string] || null) : null,
        lead_nome_resolvido: (lead?.nome_completo as string)
          || reuniao.lead_nome
          || (reuniao.notes ? String(reuniao.notes).split(" — ")[0] : null),
        lead,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── GET /meetings ────
    if (path === "/meetings" && req.method === "GET" && url.searchParams.get("_method") !== "POST") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      
      let query = supabase.from("meetings").select("*").order("created_at", { ascending: false });
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to.includes("T") ? to : to + "T23:59:59.999Z");

      const { data, error } = await query;
      if (error) throw error;

      // De qual headline veio o lead de cada reunião. O criativo já estava na
      // lista, mas ele responde "qual anúncio" — a página de entrada é a outra
      // metade do teste, e sem as duas juntas não dá para ler nenhuma delas.
      const meetingLeadIds = [...new Set((data || []).map((m: any) => m.lead_id).filter(Boolean))] as string[];
      const meetingHeadlines = await resolveHeadlineByLead(supabase, meetingLeadIds);

      // O NOME do lead, vindo da tabela de leads.
      //
      // Até aqui a tela mostrava `notes`, que é a observação — e como o
      // formulário grava "Nome — observação" ali dentro, o nome do cliente
      // aparecia no campo de observação. Ninguém conseguia responder "esta
      // reunião é de quem, mesmo?" sem abrir o lead. O nome agora vem da fonte.
      const nomesDeLead: Record<string, string> = {};
      if (meetingLeadIds.length > 0) {
        const { data: leadsDaReuniao } = await supabase
          .from("leads")
          .select("id, nome_completo, utm_content, investimento_faixa")
          .in("id", meetingLeadIds);
        for (const l of (leadsDaReuniao || [])) {
          nomesDeLead[l.id as string] = (l.nome_completo as string) || "";
        }
      }

      const meetingsWithHeadline = (data || []).map((m: any) => ({
        ...m,
        status: statusDaReuniao(m),
        pendente: pendenteDeMarcacao(m),
        // Quem marcou: "auto" = o próprio lead, em /agendar; qualquer outra
        // coisa (inclusive nulo, que é toda linha anterior a 17/09/2026) = o
        // time, pelo painel. Normalizado aqui para a tela não ter que adivinhar
        // entre null, "" e o valor gravado.
        agendado_por: m.agendado_por === "auto" ? "auto" : "time",
        headline_path: m.lead_id ? (meetingHeadlines[m.lead_id] || null) : null,
        // Prioridade: o lead do banco; depois o nome digitado (indicação e
        // social selling não têm lead); e só então o resto da observação.
        lead_nome_resolvido: (m.lead_id ? nomesDeLead[m.lead_id] : null)
          || m.lead_nome
          || (m.notes ? String(m.notes).split(" — ")[0] : null),
      }));

      return new Response(JSON.stringify(meetingsWithHeadline), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── POST /meetings ────
    if (path === "/meetings" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const params = Object.fromEntries(url.searchParams);
      const ck = params.creative_key || null;
      const leadId = params.lead_id || null;
      // A reunião nasce AGENDADA. Antes nascia com `attended = false`, que o
      // painel lia como falta: quem marcasse a call de sexta na segunda já
      // derrubava o comparecimento do mês sem nada ter acontecido.
      const statusInicial = ["agendada", "realizada", "no_show"].includes(params.status || "")
        ? params.status
        : "agendada";

      const origem = ORIGENS_VALIDAS.has(params.origem || "") ? params.origem : "midia_paga";

      // Processo Abóbora. A reunião não entra sem ele: a call só sai do SDR
      // para o closer quando se sabe com quem se está falando, o que a operação
      // faz, se a pessoa decide, e quanto ela investe. Sem essa trava as
      // respostas simplesmente não eram coletadas.
      const abobora = {
        abobora_posicao: (params.abobora_posicao || "").trim() || null,
        abobora_segmento: (params.abobora_segmento || "").trim() || null,
        abobora_decide: params.abobora_decide === "sim" || params.abobora_decide === "nao"
          ? params.abobora_decide
          : null,
        abobora_quem_decide: (params.abobora_quem_decide || "").trim() || null,
        abobora_investimento: (params.abobora_investimento || "").trim() || null,
      };

      const faltas = faltasNoAbobora(abobora);
      if (faltas.length > 0) {
        return new Response(JSON.stringify({
          error: `Processo Abóbora incompleto. Falta responder: ${faltas.join(", ")}.`,
          faltas,
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Uma call agendada por lead (17/09/2026) ───────────────────────────
      //
      // Desde que o lead de faixa alta agenda sozinho em /agendar, o painel
      // passou a registrar por cima: o SDR não vê a reunião que o próprio lead
      // marcou, cria a dele, e o lead fica com duas calls. O efeito não é só
      // visual — cada insert dispara um `Schedule` na CAPI e conta de novo em
      // "Reuniões agendadas", inflando a meta do Miguel com a mesma call.
      //
      // A trava é por LEAD e só olha o estado `agendada`, de QUALQUER
      // `agendado_por`: realizada e no-show são passado, e remarcar depois
      // delas é legítimo. Sem lead_id não há como checar (indicação e social
      // selling entram sem lead) e a criação segue livre.
      if (leadId) {
        const { data: jaAgendada } = await supabase
          .from("meetings")
          .select("id, scheduled_at, closer, status, attended, agendado_por")
          .eq("lead_id", leadId);
        const aberta = (jaAgendada || []).find((m: any) => statusDaReuniao(m) === "agendada");
        if (aberta) {
          const quando = aberta.scheduled_at
            ? new Date(Date.parse(aberta.scheduled_at) - 3 * 60 * 60 * 1000)
                .toISOString().replace("T", " ").slice(0, 16)
            : "sem data definida";
          const quem = aberta.agendado_por === "auto" ? "o próprio lead" : "o time";
          return new Response(JSON.stringify({
            error: `Este lead já tem call agendada para ${quando} com ${aberta.closer || "closer não definido"}, ` +
              `marcada por ${quem}. Remarque ou marque o desfecho da existente antes de criar outra.`,
            reuniao_existente: {
              id: aberta.id,
              scheduled_at: aberta.scheduled_at,
              closer: aberta.closer,
              agendado_por: aberta.agendado_por || null,
            },
          }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (params.scheduled_at) {
        const bloqueio = await checarAgenda(params.scheduled_at, params.closer || null);
        if (bloqueio) return bloqueio;
      }

      const { data, error } = await supabase.from("meetings").insert([{
        creative_key: ck,
        utm_content: params.utm_content || null,
        notes: params.notes || null,
        lead_id: leadId,
        lead_nome: params.lead_nome || null,
        origem,
        closer: params.closer || null,
        status: statusInicial,
        scheduled_at: params.scheduled_at || null,
        ...abobora,
      }]).select().maybeSingle();

      if (error) throw error;

      // Evento na agenda de quem participa. Best effort: agenda desconectada ou
      // Google fora do ar não pode impedir o registro da reunião no painel.
      let calendario: unknown = null;
      if (data?.id && params.scheduled_at) {
        calendario = await sincronizarReuniao(supabase, data.id);
      }
      if (calendario) (data as Record<string, unknown>).calendario = calendario;

      // Fire CAPI Meeting event if lead_id is present
      if (leadId && data?.id) {
        const meetingNovaId = data.id as string;
        const { data: leadCheck } = await supabase.from("leads").select("capi_events_sent").eq("id", leadId).maybeSingle();
        const marcas = (leadCheck?.capi_events_sent as Record<string, boolean>) || {};

        // Reunião agendada = evento padrão `Schedule` do Meta (antes era o
        // custom "Meeting", sem id estável). Dedup POR REUNIÃO: a chave é
        // "Schedule:<id da reunião>", não o lead.
        const chaveSchedule = capiKey("Schedule", meetingNovaId);
        if (marcas[chaveSchedule]) {
          console.log(`[admin-data] CAPI Schedule skipped (dedup) for meeting ${meetingNovaId}`);
        } else {
          try {
            const resp = await chamarMetaCapi({
              lead_id: leadId,
              event_name: "Schedule",
              event_id: `meeting_${meetingNovaId}`,
              dedup_key: chaveSchedule,
              action_source: "system_generated",
              custom_data: { meeting_id: meetingNovaId, closer: params.closer || null },
            }, "admin");
            console.log(`[admin-data] CAPI Schedule event for meeting ${meetingNovaId}: ${resp.status}`, await resp.text());
            if (resp.ok) await marcarNoLead(supabase, leadId, [chaveSchedule, "Meeting"]);
          } catch (e) {
            console.error("[admin-data] CAPI Schedule error:", e);
          }
        }

        // Reunião registrada DEPOIS de acontecer (nasce "realizada" ou
        // "no_show"): o desfecho também vai, com o mesmo id que o PUT usaria,
        // senão o sinal mais forte antes da venda ficava mudo neste caminho.
        if (statusInicial === "realizada" || statusInicial === "no_show") {
          const eventoDesfecho = statusInicial === "realizada" ? "MeetingHeld" : "NoShow";
          const chaveDesfecho = capiKey(eventoDesfecho, meetingNovaId);
          if (!marcas[chaveDesfecho]) {
            try {
              const horaCall = horaDaCallSeconds(params.scheduled_at || null);
              const resp = await chamarMetaCapi({
                lead_id: leadId,
                event_name: eventoDesfecho,
                event_id: `meeting_${meetingNovaId}_${eventoDesfecho}`,
                dedup_key: chaveDesfecho,
                action_source: "system_generated",
                ...(horaCall ? { event_time: horaCall } : {}),
                custom_data: { meeting_id: meetingNovaId },
              }, "admin");
              console.log(`[admin-data] CAPI ${eventoDesfecho} for new meeting ${meetingNovaId}: ${resp.status}`, await resp.text());
              if (resp.ok) await marcarNoLead(supabase, leadId, [chaveDesfecho]);
            } catch (e) {
              console.error(`[admin-data] CAPI ${eventoDesfecho} error:`, e);
            }
          }
        }
      }

      return new Response(JSON.stringify(data), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── DELETE /meetings/:id ────
    const deleteMeetingMatch = path.match(/^\/meetings\/([a-f0-9-]+)$/);
    if (deleteMeetingMatch && req.method === "DELETE") {
      const meetingId = deleteMeetingMatch[1];
      await apagarEventoDaReuniao(supabase, meetingId);
      const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── PUT /meetings/:id ────
    const updateMeetingMatch = path.match(/^\/meetings\/([a-f0-9-]+)$/);
    if (updateMeetingMatch && req.method === "PUT") {
      const meetingId = updateMeetingMatch[1];
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.notes !== undefined) updates.notes = body.notes || null;
      if (body.attended !== undefined) updates.attended = !!body.attended;
      if (body.status !== undefined && ["agendada", "realizada", "no_show"].includes(body.status)) {
        updates.status = body.status;
      }

      // ── Trava do desfecho (07/09/2026) ──────────────────────────────────
      //
      // Marcar "realizada" com um clique deixava a call sem motivo para sempre:
      // 12 das 17 reuniões sem venda estavam assim. A partir daqui, uma reunião
      // só VIRA realizada se houver venda ligada ao lead ou um motivo escrito.
      //
      // O que NÃO é travado, de propósito: no_show, agendada, reunião que já
      // estava realizada antes desta regra (o registro histórico continua
      // válido e editável), e reunião cujo lead tem venda. Só a TRANSIÇÃO para
      // realizada é verificada, então nada retroativo é invalidado.
      const virandoRealizada = updates.status === "realizada";
      const motivoNoPedido = typeof body.motivo_categoria === "string" && body.motivo_categoria.trim() !== "";
      if (virandoRealizada && !motivoNoPedido) {
        const { data: atualM } = await supabase
          .from("meetings")
          .select("status, motivo_categoria, lead_id")
          .eq("id", meetingId)
          .maybeSingle();

        const jaEraRealizada = atualM?.status === "realizada";
        const jaTemMotivo = !!atualM?.motivo_categoria;

        if (!jaEraRealizada && !jaTemMotivo) {
          // Venda ligada ao lead dispensa o motivo: o desfecho bom já está
          // registrado em manual_sales e não precisa ser escrito de novo.
          let temVenda = false;
          if (atualM?.lead_id) {
            const { data: vendas } = await supabase
              .from("manual_sales")
              .select("id")
              .eq("lead_id", atualM.lead_id)
              .is("refunded_at", null)
              .limit(1);
            temVenda = !!(vendas && vendas.length > 0);
          }
          if (!temVenda) {
            return new Response(JSON.stringify({
              error: "Reunião realizada sem venda precisa do motivo. Abra a reunião e registre o desfecho.",
              code: "MOTIVO_OBRIGATORIO",
            }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      }
      if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at || null;
      if (body.closer !== undefined) updates.closer = body.closer || null;
      if (body.origem !== undefined && ORIGENS_VALIDAS.has(body.origem)) updates.origem = body.origem;
      if (body.lead_nome !== undefined) updates.lead_nome = body.lead_nome || null;

      // Desfecho da call: por que fechou ou por que não fechou. Escrito pelo
      // closer depois da reunião, e é a informação que muda oferta e roteiro —
      // a contagem de perdidas sozinha nunca ensinou nada a ninguém.
      //
      // Este bloco nasceu (04/09) dentro da rota de VENDA por um erro de âncora
      // de edição, e por dois dias o "Salvar desfecho" da tela devolvia 200 sem
      // gravar nada. Corrigido em 06/09; o único desfecho gravado até então foi
      // o do Jean Brondani, direto no banco.
      const CATEGORIAS = new Set([
        "fechou", "reembolso", "preco", "decisor", "timing", "sem_fit", "concorrente", "sumiu", "outro",
      ]);
      if (body.motivo_categoria !== undefined) {
        const cat = String(body.motivo_categoria || "");
        updates.motivo_categoria = CATEGORIAS.has(cat) ? cat : null;
        updates.motivo_at = cat ? new Date().toISOString() : null;
        if (body.motivo_por !== undefined) updates.motivo_por = body.motivo_por || null;
      }
      if (body.motivo_detalhe !== undefined) updates.motivo_detalhe = body.motivo_detalhe || null;

      // Editar o Abóbora é permitido, esvaziá-lo não. A trava do POST viraria
      // decorativa se desse para registrar completo e apagar em seguida.
      const camposAbobora = [
        "abobora_posicao", "abobora_segmento", "abobora_decide",
        "abobora_quem_decide", "abobora_investimento",
      ] as const;
      const mexeuNoAbobora = camposAbobora.some((c) => body[c] !== undefined);
      if (mexeuNoAbobora) {
        const { data: atual } = await supabase
          .from("meetings")
          .select("abobora_posicao, abobora_segmento, abobora_decide, abobora_quem_decide, abobora_investimento")
          .eq("id", meetingId)
          .maybeSingle();
        const proposto = { ...(atual || {}) } as Record<string, string | null>;
        for (const campo of camposAbobora) {
          if (body[campo] === undefined) continue;
          proposto[campo] = String(body[campo] ?? "").trim() || null;
        }
        const faltas = faltasNoAbobora(proposto);
        if (faltas.length > 0) {
          return new Response(JSON.stringify({
            error: "Processo Abóbora incompleto",
            faltas,
          }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        for (const campo of camposAbobora) updates[campo] = proposto[campo];
      }

      // Link da gravação no Drive. Chega por aqui porque quem sobe a gravação é
      // o Caio, depois da call, sem mexer em mais nada da reunião.
      if (body.recording_url !== undefined) {
        const link = String(body.recording_url || "").trim();
        updates.recording_url = link || null;
        updates.recording_uploaded_at = link ? new Date().toISOString() : null;
        if (body.recording_folder !== undefined) updates.recording_folder = body.recording_folder || null;
        if (body.recording_by !== undefined) updates.recording_by = body.recording_by || null;
      }

      // Remarcar também respeita as 3 horas. Sem isto dava para burlar a regra
      // criando a reunião num horário livre e movendo em seguida.
      if (updates.scheduled_at) {
        const closerFinal = (updates.closer as string | undefined) ?? null;
        const { data: atualMeet } = await supabase
          .from("meetings").select("closer").eq("id", meetingId).maybeSingle();
        const bloqueio = await checarAgenda(
          String(updates.scheduled_at),
          closerFinal || atualMeet?.closer || null,
          meetingId,
        );
        if (bloqueio) return bloqueio;
      }

      const { data, error } = await supabase.from("meetings").update(updates).eq("id", meetingId).select().maybeSingle();
      if (error) throw error;

      // Reunião REALIZADA é o sinal mais forte antes da venda, e até 06/09
      // não gerava evento nenhum para o Meta. Vai como custom `MeetingHeld`
      // (e `NoShow` para a falta, útil para público de exclusão), com id por
      // reunião e dedup por reunião.
      const leadDaReuniao = (data as Record<string, unknown> | null)?.lead_id as string | null | undefined;
      if (leadDaReuniao && (updates.status === "realizada" || updates.status === "no_show")) {
        const eventName = updates.status === "realizada" ? "MeetingHeld" : "NoShow";
        const chave = capiKey(eventName, meetingId);
        try {
          const { data: leadRow } = await supabase.from("leads").select("capi_events_sent").eq("id", leadDaReuniao).maybeSingle();
          const sent = (leadRow?.capi_events_sent as Record<string, boolean>) || {};
          if (!sent[chave]) {
            // A hora do evento é a da call (scheduled_at), quando ela já
            // passou e está dentro dos 7 dias; senão, a hora da marcação.
            const horaCall = horaDaCallSeconds((data as Record<string, unknown> | null)?.scheduled_at as string | null | undefined);
            const resp = await chamarMetaCapi({
              lead_id: leadDaReuniao,
              event_name: eventName,
              event_id: `meeting_${meetingId}_${eventName}`,
              dedup_key: chave,
              action_source: "system_generated",
              ...(horaCall ? { event_time: horaCall } : {}),
              custom_data: { meeting_id: meetingId },
            }, "admin");
            console.log(`[admin-data] CAPI ${eventName} for meeting ${meetingId}: ${resp.status}`, await resp.text());
            if (resp.ok) {
              await marcarNoLead(supabase, leadDaReuniao, [chave]);
            }
          }
        } catch (e) {
          console.error(`[admin-data] CAPI ${eventName} error:`, e);
        }
      }

      // Remarcar move o evento; marcar no-show tira o compromisso da agenda;
      // marcar realizada deixa o evento onde está, que é o registro da call.
      let calendario: unknown = null;
      if (updates.scheduled_at !== undefined || updates.status !== undefined) {
        calendario = await sincronizarReuniao(supabase, meetingId);
      }
      const resposta = calendario ? { ...(data as Record<string, unknown>), calendario } : data;
      return new Response(JSON.stringify(resposta), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── GET /capi-stats?days=7 ────
    // Gerado → enviado → aceito → falhou, por evento e por chamador, a partir
    // de `capi_events_log`. É a resposta para "quantos sinais estamos perdendo".
    if (path === "/capi-stats" && req.method === "GET") {
      const dias = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "7") || 7));
      const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
      type LinhaStats = { event_name: string; caller: string; status: string; created_at: string; error_message: string | null; http_status: number | null; lead_id: string | null; event_id: string };
      const linhas: LinhaStats[] = [];
      for (let de = 0; de < 20000; de += 1000) {
        const { data, error } = await supabase
          .from("capi_events_log")
          .select("event_name, caller, status, created_at, error_message, http_status, lead_id, event_id")
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .range(de, de + 999);
        if (error) {
          return new Response(JSON.stringify({ error: error.message, hint: "capi_events_log não existe? aplique a migration 20260906200000" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        linhas.push(...((data || []) as LinhaStats[]));
        if (!data || data.length < 1000) break;
      }
      const conta = (chave: (l: LinhaStats) => string) => {
        const m: Record<string, Record<string, number>> = {};
        for (const l of linhas) {
          const k = chave(l);
          m[k] = m[k] || {};
          m[k][l.status] = (m[k][l.status] || 0) + 1;
        }
        return m;
      };
      const porStatus: Record<string, number> = {};
      for (const l of linhas) porStatus[l.status] = (porStatus[l.status] || 0) + 1;
      const ultimosErros = linhas
        .filter((l) => l.status === "failed" || l.status === "rejected")
        .slice(0, 20)
        .map((l) => ({ created_at: l.created_at, event_name: l.event_name, caller: l.caller, http_status: l.http_status, lead_id: l.lead_id, event_id: l.event_id, error: l.error_message }));
      const { count: reservasPendentes } = await supabase
        .from("capi_event_claims")
        .select("event_id", { count: "exact", head: true })
        .is("sent_at", null);
      return new Response(JSON.stringify({
        days: dias,
        since: desde,
        total: linhas.length,
        por_status: porStatus,
        por_evento: conta((l) => l.event_name),
        por_chamador: conta((l) => l.caller),
        por_dia: conta((l) => l.created_at.slice(0, 10)),
        reservas_pendentes: reservasPendentes ?? null,
        ultimos_erros: ultimosErros,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── GET /capi-log?lead_id=&event_name=&status=&limit=100 ────
    if (path === "/capi-log" && req.method === "GET") {
      const limite = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("limit") || "100") || 100));
      let q = supabase
        .from("capi_events_log")
        .select("id, created_at, lead_id, event_name, event_id, caller, action_source, status, http_status, events_received, fbtrace_id, error_message, identity, attempt, retry_of, test_event_code")
        .order("created_at", { ascending: false })
        .limit(limite);
      const leadId = url.searchParams.get("lead_id");
      const eventName = url.searchParams.get("event_name");
      const status = url.searchParams.get("status");
      if (leadId) q = q.eq("lead_id", leadId);
      if (eventName) q = q.eq("event_name", eventName);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify(data || []), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── POST /capi-retry?days=7&max=50 ────
    // Reenvia o que falhou por rede ou 5xx nos últimos dias, com o MESMO
    // event_id, e no máximo 3 tentativas por evento. O que foi `rejected`
    // (ex.: mais de 7 dias) não volta: reenviar não muda a recusa.
    if (path === "/capi-retry" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const dias = Math.min(7, Math.max(1, parseInt(url.searchParams.get("days") || "7") || 7));
      const maximo = Math.min(500, Math.max(1, parseInt(url.searchParams.get("max") || "50") || 50));
      const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

      // Reserva órfã: envio que morreu entre reservar e mandar. Sem isso o
      // id fica travado para sempre e nem o retry consegue reenviar.
      const limiteOrfa = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: orfas } = await supabase
        .from("capi_event_claims")
        .delete()
        .is("sent_at", null)
        .lt("claimed_at", limiteOrfa)
        .select("event_id");

      type LinhaRetry = { id: string; lead_id: string | null; event_name: string; event_id: string; status: string; request: Record<string, unknown> | null; created_at: string };
      const { data: recentes, error: logErr } = await supabase
        .from("capi_events_log")
        .select("id, lead_id, event_name, event_id, status, request, created_at")
        .gte("created_at", desde)
        .in("status", ["sent", "failed", "deduplicated"])
        .order("created_at", { ascending: false })
        .limit(5000);
      if (logErr) {
        return new Response(JSON.stringify({ error: logErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const porEvento = new Map<string, LinhaRetry[]>();
      for (const l of (recentes || []) as LinhaRetry[]) {
        const k = `${l.event_id}|${l.event_name}`;
        if (!porEvento.has(k)) porEvento.set(k, []);
        porEvento.get(k)!.push(l);
      }
      const candidatos: LinhaRetry[] = [];
      for (const linhas of porEvento.values()) {
        if (linhas.some((l) => l.status === "sent")) continue;
        const falhas = linhas.filter((l) => l.status === "failed");
        if (!falhas.length || falhas.length >= 3) continue;
        const ultima = falhas[0];
        if (!ultima.lead_id) continue;
        candidatos.push(ultima);
      }

      const chaveDedup = (evt: string, cd: Record<string, unknown> | undefined): string => {
        const id = (cd?.order_id || cd?.meeting_id) as string | undefined;
        if (evt === "Purchase" && id) return capiKey("Purchase", id);
        if ((evt === "Schedule" || evt === "MeetingHeld" || evt === "NoShow") && id) return capiKey(evt, id);
        return evt;
      };

      let reenviados = 0, falharam = 0, rejeitados = 0;
      const erros: string[] = [];
      for (const c of candidatos.slice(0, maximo)) {
        const r = c.request || {};
        const cd = (r.custom_data && typeof r.custom_data === "object" ? r.custom_data : {}) as Record<string, unknown>;
        try {
          const resp = await chamarMetaCapi({
            lead_id: c.lead_id,
            event_name: c.event_name,
            event_id: c.event_id,
            dedup_key: chaveDedup(c.event_name, cd),
            action_source: r.action_source || "website",
            ...(r.event_time ? { event_time: r.event_time } : {}),
            ...(r.event_source_url ? { event_source_url: r.event_source_url } : {}),
            ...(cd.value != null ? { value: cd.value, currency: cd.currency || "BRL" } : {}),
            custom_data: cd,
            retry_of: c.id,
          }, "retry");
          if (resp.ok) reenviados++;
          else if (resp.status === 422) rejeitados++;
          else { falharam++; erros.push(`${c.event_name} ${c.event_id}: ${resp.status}`); }
        } catch (e) {
          falharam++;
          erros.push(`${c.event_name} ${c.event_id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return new Response(JSON.stringify({
        candidatos: candidatos.length, reenviados, falharam, rejeitados,
        reservas_orfas_limpas: (orfas || []).length, erros: erros.slice(0, 10),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── POST /capi-retroactive-held ────
    // Reuniões já marcadas como realizada ou no-show que nunca geraram
    // evento (MeetingHeld/NoShow existem desde 06/09). Só as dos últimos 7
    // dias: o Meta recusa mais que isso, e não inventamos data para as outras.
    if (path === "/capi-retroactive-held" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const { data: reunioes, error: rErr } = await supabase
        .from("meetings")
        .select("id, lead_id, status, scheduled_at, created_at")
        .in("status", ["realizada", "no_show"])
        .not("lead_id", "is", null);
      if (rErr) throw rErr;
      let sent = 0, skippedOld = 0, skippedSent = 0, failed = 0;
      const errors: string[] = [];
      for (const m of (reunioes || [])) {
        const eventName = m.status === "realizada" ? "MeetingHeld" : "NoShow";
        const chave = capiKey(eventName, m.id);
        const { data: leadRow } = await supabase.from("leads").select("capi_events_sent").eq("id", m.lead_id).maybeSingle();
        const marcas = (leadRow?.capi_events_sent as Record<string, boolean>) || {};
        if (marcas[chave]) { skippedSent++; continue; }
        const hora = horaDaCallSeconds(m.scheduled_at as string | null);
        if (!hora) { skippedOld++; continue; }
        try {
          const resp = await chamarMetaCapi({
            lead_id: m.lead_id,
            event_name: eventName,
            event_id: `meeting_${m.id}_${eventName}`,
            dedup_key: chave,
            action_source: "system_generated",
            event_time: hora,
            custom_data: { meeting_id: m.id },
          }, "retro");
          if (resp.ok) { sent++; await marcarNoLead(supabase, m.lead_id, [chave]); }
          else { failed++; errors.push(`Meeting ${m.id}: ${resp.status} ${(await resp.text()).slice(0, 200)}`); }
        } catch (e) {
          failed++;
          errors.push(`Meeting ${m.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return new Response(
        JSON.stringify({ total: (reunioes || []).length, sent, skipped_already_sent: skippedSent, skipped_older_than_7_days: skippedOld, failed, errors: errors.slice(0, 10) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ──── POST /capi-retroactive-meetings ────
    if (path === "/capi-retroactive-meetings" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const { data: allMeetings, error: meetErr } = await supabase
        .from("meetings")
        .select("id, lead_id, notes")
        .not("lead_id", "is", null);
      if (meetErr) throw meetErr;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      let sent = 0, failed = 0;
      const errors: string[] = [];

      for (const m of (allMeetings || [])) {
        try {
          // Dedup POR REUNIÃO (chave "Schedule:<id>"); a chave antiga por lead
          // ("Meeting") continua valendo para não reenviar o histórico.
          const chave = capiKey("Schedule", m.id);
          const { data: leadCheck } = await supabase.from("leads").select("capi_events_sent").eq("id", m.lead_id).maybeSingle();
          const sentMap = (leadCheck?.capi_events_sent as Record<string, boolean>) || {};
          if (sentMap[chave] || sentMap["Meeting"]) {
            continue;
          }
          const resp = await chamarMetaCapi({ lead_id: m.lead_id, event_name: "Schedule", event_id: `meeting_${m.id}`, dedup_key: chave, action_source: "system_generated", custom_data: { meeting_id: m.id } }, "retro");
          if (resp.ok) {
            sent++;
            await marcarNoLead(supabase, m.lead_id, [chave, "Meeting"]);
          } else {
            failed++;
            errors.push(`Meeting ${m.id}: ${resp.status}`);
          }
        } catch (e) {
          failed++;
          errors.push(`Meeting ${m.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return new Response(
        JSON.stringify({ total: (allMeetings || []).length, sent, failed, errors: errors.slice(0, 10) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── POST /capi-retroactive-tiers ────
    if (path === "/capi-retroactive-tiers" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const { data: allLeads, error: leadsErr } = await supabase
        .from("leads")
        .select("id, tier, capi_events_sent");
      if (leadsErr) throw leadsErr;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      let sent = 0, skipped = 0, failed = 0;
      const errors: string[] = [];

      for (const lead of (allLeads || [])) {
        const tier = lead.tier || "Desqualificado";
        if (tier === "Desqualificado") { skipped++; continue; }
        const eventName = `Lead_${tier.replace("+", "Plus")}`;
        const capiSent = (lead.capi_events_sent as Record<string, boolean>) || {};
        if (capiSent[eventName]) { skipped++; continue; }

        try {
          const resp = await chamarMetaCapi({ lead_id: lead.id, event_name: eventName, dedup_key: eventName }, "retro");
          if (resp.ok) {
            sent++;
            await marcarNoLead(supabase, lead.id, [eventName]);
          } else {
            failed++;
            errors.push(`Lead ${lead.id} (${eventName}): ${resp.status}`);
          }
        } catch (e) {
          failed++;
          errors.push(`Lead ${lead.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return new Response(
        JSON.stringify({ total: (allLeads || []).length, sent, skipped, failed, errors: errors.slice(0, 10) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── POST /capi-retroactive-purchases ────
    if (path === "/capi-retroactive-purchases" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      // Fetch all manual_sales that have a lead_id
      const { data: sales, error: salesErr } = await supabase
        .from("manual_sales")
        .select("id, lead_id, revenue, sale_date")
        .not("lead_id", "is", null);
      if (salesErr) throw salesErr;

      // Quem já foi enviado fica de fora. O event_id abaixo já protege contra
      // duplicata no lado do Meta, mas não gastar a requisição é melhor ainda.
      const saleLeadIds = [...new Set((sales || []).map((x: any) => x.lead_id))];
      const { data: leadsCapi } = await supabase
        .from("leads")
        .select("id, capi_events_sent")
        .in("id", saleLeadIds);
      // Dedup POR VENDA: chave "Purchase:<id da venda>". A chave antiga por
      // lead ("Purchase") só vale para a PRIMEIRA venda daquele lead, senão o
      // histórico inteiro seria reenviado; vendas seguintes do mesmo lead
      // passam a ir.
      const capiPorLead = new Map<string, Record<string, boolean>>(
        (leadsCapi || []).map((l: any) => [l.id, (l.capi_events_sent as Record<string, boolean>) || {}]),
      );
      const primeiraVendaDoLead = new Map<string, string>();
      for (const s of [...(sales || [])].sort((a: any, b: any) => String(a.sale_date).localeCompare(String(b.sale_date)))) {
        if (!primeiraVendaDoLead.has(s.lead_id)) primeiraVendaDoLead.set(s.lead_id, s.id);
      }
      const purchaseAlreadySent = new Set(
        (sales || [])
          .filter((s: any) => {
            const c = capiPorLead.get(s.lead_id) || {};
            return c[capiKey("Purchase", s.id)] || (c["Purchase"] && primeiraVendaDoLead.get(s.lead_id) === s.id);
          })
          .map((s: any) => s.id),
      );

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      let skipped = 0;
      for (const sale of (sales || [])) {
        if (purchaseAlreadySent.has(sale.id)) { skipped++; continue; }
        try {
          const resp = await chamarMetaCapi({
            lead_id: sale.lead_id,
            event_name: "Purchase",
            value: Number(sale.revenue),
            currency: "BRL",
            // Mesmo event_id do envio original: a reserva no meta-capi
            // reconhece que é a MESMA venda e não manda de novo.
            event_id: `sale_${sale.id}`,
            dedup_key: capiKey("Purchase", sale.id),
            // Venda com mais de 7 dias o meta-capi recusa (422): o Meta não
            // aceita, e empurrar a data seria inventar quando ela aconteceu.
            event_time: saleDateSeconds(sale.sale_date),
            action_source: "system_generated",
            custom_data: { order_id: sale.id, content_type: "product" },
          }, "retro");
          if (resp.ok) {
            sent++;
            await marcarNoLead(supabase, sale.lead_id, ["Purchase", capiKey("Purchase", sale.id)]);
          } else {
            failed++;
            const body = await resp.text();
            errors.push(`Sale ${sale.id}: ${resp.status} - ${body}`);
          }
        } catch (e) {
          failed++;
          errors.push(`Sale ${sale.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return new Response(
        JSON.stringify({ total: (sales || []).length, sent, skipped, failed, errors: errors.slice(0, 10) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── POST /capi-retroactive-mqls ────
    if (path === "/capi-retroactive-mqls" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      // Regra única de MQL em _shared/meta.ts (antes esta lista era a quarta
      // versão divergente da mesma regra).
      const { data: allLeads, error: leadsErr } = await supabase
        .from("leads")
        .select("id, sdr_override, investimento_faixa, capi_events_sent")
        .order("created_at", { ascending: false })
        .limit(100);
      if (leadsErr) throw leadsErr;

      const mqls = (allLeads || []).filter(l =>
        l.sdr_override === "Caio" || l.sdr_override === "Rodger" || isMqlFaixa(l.investimento_faixa)
      );

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      let sent = 0, skipped = 0, failed = 0;
      const errors: string[] = [];

      for (const lead of mqls) {
        const capiSent = (lead.capi_events_sent as Record<string, boolean>) || {};
        if (capiSent["MQL"]) { skipped++; continue; }

        try {
          const resp = await chamarMetaCapi({
            lead_id: lead.id,
            event_name: "MQL",
            event_id: `${lead.id}_MQL`,
            dedup_key: "MQL",
            action_source: "system_generated",
            ...(valorEsperadoMql(lead.investimento_faixa) ? { value: valorEsperadoMql(lead.investimento_faixa), currency: "BRL" } : {}),
          }, "retro");
          if (resp.ok) {
            sent++;
            await marcarNoLead(supabase, lead.id, ["MQL"]);
          } else {
            failed++;
            const body = await resp.text();
            errors.push(`Lead ${lead.id}: ${resp.status} - ${body}`);
          }
        } catch (e) {
          failed++;
          errors.push(`Lead ${lead.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return new Response(
        JSON.stringify({ total: mqls.length, sent, skipped, failed, errors: errors.slice(0, 10) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Daily Reports CRUD ───
    const pathParts = path.replace(/^\//, "").split("/");
    if (req.method === "GET" && path === "/daily-reports") {
      const sdr = url.searchParams.get("sdr");
      const month = url.searchParams.get("month"); // YYYY-MM
      let query = supabase.from("daily_reports").select("*");
      if (sdr) query = query.eq("sdr_name", sdr);
      if (month) {
        const [y, m] = month.split("-").map(Number);
        const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of current month
        query = query.gte("report_date", `${month}-01`).lte("report_date", `${month}-${String(lastDay).padStart(2, "0")}`);
      }
      const { data, error: qErr } = await query.order("report_date", { ascending: false });
      if (qErr) return new Response(JSON.stringify({ error: qErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && path === "/daily-reports") {
      const body = await req.json();
      const { data, error: iErr } = await supabase.from("daily_reports").upsert(body, { onConflict: "report_date,sdr_name" }).select().single();
      if (iErr) return new Response(JSON.stringify({ error: iErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "PUT" && path.startsWith("/daily-reports/")) {
      const reportId = path.split("/").filter(Boolean)[1];
      const body = await req.json();
      const { data, error: uErr } = await supabase.from("daily_reports").update({ ...body, updated_at: new Date().toISOString() }).eq("id", reportId).select().single();
      if (uErr) return new Response(JSON.stringify({ error: uErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "DELETE" && path.startsWith("/daily-reports/")) {
      const reportId = path.split("/").filter(Boolean)[1];
      const { error: dErr } = await supabase.from("daily_reports").delete().eq("id", reportId);
      if (dErr) return new Response(JSON.stringify({ error: dErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // GET /landing-behavior — funil por seção, scroll depth, cliques + comparação período anterior
    if (path === "/landing-behavior" && req.method === "GET") {
      // null = "todas as páginas" (soma a original com as variantes).
      const pageFilter = parsePageFilter(url);
      const behaviorCreativeFilter = parseCreativeFilter(url);
      const matchesPage = (p: string | null) => {
        const v = p || "/";
        return pageFilter ? v.toLowerCase() === pageFilter.toLowerCase() : LANDING_PATHS.includes(v);
      };
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;

      // Compute previous period (same length, immediately before)
      let prevFrom: string | null = null;
      let prevToEnd: string | null = null;
      if (from && toEnd) {
        const fromMs = new Date(from).getTime();
        const toMs = new Date(toEnd).getTime();
        const span = toMs - fromMs;
        prevFrom = new Date(fromMs - span).toISOString();
        prevToEnd = new Date(fromMs - 1).toISOString();
      }

      async function pagedFetch(
        table: string,
        select: string,
        fromIso: string | null,
        toIso: string | null,
        dateColumn = "created_at",
        maxRows = 8000,
      ) {
        const PAGE = 1000;
        let all: any[] = [];
        let offset = 0;
        let more = true;
        while (more && all.length < maxRows) {
          // order() é essencial aqui: sem ele, o corte em maxRows não é determinístico
          // (a ordem de retorno do Postgres/PostgREST não é garantida), então períodos
          // com muito volume podiam truncar em pontos diferentes a cada chamada.
          let q = supabase.from(table).select(select).order(dateColumn, { ascending: true }).range(offset, offset + PAGE - 1);
          if (fromIso) q = q.gte(dateColumn, fromIso);
          if (toIso) q = q.lte(dateColumn, toIso);
          const { data, error } = await q;
          if (error) throw error;
          if (data) all = all.concat(data);
          more = (data?.length || 0) === PAGE;
          offset += PAGE;
        }
        return all;
      }

      async function buildPeriod(fromIso: string | null, toIso: string | null) {
        // As 5 buscas paginadas abaixo não dependem umas das outras (só a
        // FILTRAGEM por validSessions depende, e essa roda depois que tudo já
        // voltou) — rodar em paralelo em vez de sequencial evita somar os
        // tempos de rede das 5 tabelas (isso ficava lento o suficiente pra
        // parecer travado no admin em ranges maiores, já que buildPeriod ainda
        // roda 2x — período atual e período anterior).
        const [sessionRows, sectionRows, clickRows, scrollRows, attentionRows] = await Promise.all([
          pagedFetch("lead_sessions", "id, referrer, first_page, utm_content", fromIso, toIso),
          pagedFetch("section_views", "session_id, section_id, section_order, time_spent_ms, page, pos_start_pct, pos_end_pct", fromIso, toIso, "created_at", 20000),
          pagedFetch("click_events", "session_id, click_type, click_id, section_id, label, href, pos_x_pct, pos_y_pct, page", fromIso, toIso, "created_at", 20000),
          pagedFetch("scroll_milestones", "session_id, milestone, page", fromIso, toIso, "reached_at", 20000),
          pagedFetch("scroll_attention_bins", "session_id, bin, time_ms, page", fromIso, toIso, "created_at", 20000),
        ]);

        // Só eventos da landing (da variante escolhida, ou de todas). As tabelas
        // de tracking são compartilhadas com outras páginas; sem esse filtro,
        // evento de /quiz entrava no funil da landing.
        const onLanding = (r: any) => matchesPage(r.page);

        const validSessions = new Set<string>();
        (sessionRows || []).forEach((s: any) => {
          const ref = (s.referrer || "").toLowerCase();
          const fp = (s.first_page || "").toLowerCase();
          if (ref.includes("lovable.dev") || ref.includes("lovableproject.com")) return;
          if (fp === "/admin") return;
          // Só quem entrou POR esta variante. Sem isso o denominador de cada
          // headline incluiria as sessões de todas as outras.
          if (!matchesPage(s.first_page)) return;
          if (behaviorCreativeFilter && !behaviorCreativeFilter(s.utm_content)) return;
          validSessions.add(s.id);
        });

        const sections = (sectionRows || []).filter((r: any) => onLanding(r) && validSessions.has(r.session_id));

        // BASE DO FUNIL — sessões com evidência de que a landing realmente
        // carregou e foi rastreada (viu alguma seção, rolou, ou clicou nela).
        //
        // Antes o denominador era `validSessions` inteiro (toda linha de
        // lead_sessions do período) e a primeira seção recebia TODAS elas à
        // força, enquanto as seções seguintes só contavam quem tinha evento de
        // tracking. Resultado: o degrau da 1ª pra 2ª seção não media abandono
        // de leitura, media a COBERTURA do tracking — por isso dava sempre a
        // mesma taxa de saída na headline em qualquer filtro de data.
        const trackedSessions = new Set<string>();
        sections.forEach((r: any) => trackedSessions.add(r.session_id));
        (scrollRows || []).forEach((r: any) => { if (onLanding(r) && validSessions.has(r.session_id)) trackedSessions.add(r.session_id); });
        (clickRows || []).forEach((r: any) => { if (onLanding(r) && validSessions.has(r.session_id)) trackedSessions.add(r.session_id); });

        const totalVisitors = trackedSessions.size;
        // Sessões registradas no período que não geraram nenhum evento de
        // landing (bot, saída antes do JS montar, tracking bloqueado). Ficam
        // FORA do funil e são reportadas à parte, em vez de virar "saiu na
        // headline".
        const untrackedSessions = Math.max(0, validSessions.size - totalVisitors);

        // Group sections. A ordem vem de LANDING_SECTIONS (o código da página),
        // não do section_order gravado: dados antigos carregam numeração de
        // versões anteriores da landing e embaralhavam o funil.
        const sectionMap = new Map<string, { id: string; order: number; sessions: Set<string>; totalTime: number; count: number; starts: number[]; ends: number[] }>();
        // Semeia com a página inteira: seção sem nenhum visitante no período
        // aparece com 0 em vez de sumir da lista.
        LANDING_SECTIONS.forEach((s) => {
          sectionMap.set(s.id, { id: s.id, order: s.order, sessions: new Set(), totalTime: 0, count: 0, starts: [], ends: [] });
        });
        sections.forEach((r: any) => {
          // Seção que não existe mais na página (portfolio, gancho_corpo…) fica
          // de fora: entraria com a numeração antiga e cairia no lugar errado.
          const s = sectionMap.get(r.section_id);
          if (!s) return;
          s.sessions.add(r.session_id);
          s.totalTime += r.time_spent_ms || 0;
          s.count += 1;
          // Posição real medida no browser do visitante. Varia com o tamanho da
          // tela (mobile alonga a página), por isso guardamos todas e usamos a
          // mediana em vez da média — um outlier de tela minúscula não desloca
          // a régua inteira.
          if (r.pos_start_pct !== null && r.pos_start_pct !== undefined) s.starts.push(Number(r.pos_start_pct));
          if (r.pos_end_pct !== null && r.pos_end_pct !== undefined) s.ends.push(Number(r.pos_end_pct));
        });

        const median = (arr: number[]) => {
          if (arr.length === 0) return null;
          const sorted = [...arr].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };

        const sortedSections = Array.from(sectionMap.values()).sort((a, b) => a.order - b.order);

        // click events (need them BEFORE funnel to count clicks per section)
        const clicks = (clickRows || []).filter((r: any) => onLanding(r) && trackedSessions.has(r.session_id));

        // Map: section_id -> Set of session_ids that clicked something in that section
        const clickSessionsBySection = new Map<string, Set<string>>();
        clicks.forEach((c: any) => {
          if (!c.section_id) return;
          let set = clickSessionsBySection.get(c.section_id);
          if (!set) { set = new Set(); clickSessionsBySection.set(c.section_id, set); }
          set.add(c.session_id);
        });

        // scroll milestones (precisamos ANTES do funil para usar como base)
        const scrolls = (scrollRows || []).filter((r: any) => onLanding(r) && trackedSessions.has(r.session_id));

        // maxScrollBySession: maior milestone atingido por cada sessão
        const maxScrollBySession = new Map<string, number>();
        scrolls.forEach((r: any) => {
          const cur = maxScrollBySession.get(r.session_id) || 0;
          if (r.milestone > cur) maxScrollBySession.set(r.session_id, r.milestone);
        });

        const milestones: Record<number, Set<string>> = { 25: new Set(), 50: new Set(), 75: new Set(), 100: new Set() };
        scrolls.forEach((r: any) => milestones[r.milestone]?.add(r.session_id));
        const scrollDepth = [25, 50, 75, 100].map((m) => ({
          milestone: m,
          users: milestones[m].size,
          pct: totalVisitors > 0 ? (milestones[m].size / totalVisitors) * 100 : 0,
        }));

        // Funil baseado em SCROLL-DEPTH (mais confiável que IntersectionObserver):
        // Cada seção recebe uma posição estimada de scroll (% da página) baseada na sua ordem.
        // Uma sessão "alcançou" a seção se: (a) viu a seção via observer OU (b) scroll máximo >= posição da seção.
        // Garantia de monotonicidade: reached(N) inclui todos de reached(N+1) — se chegou no fim, viu tudo antes.
        const N = sortedSections.length;
        // Posição de cada seção em % da altura da página. Prioridade pra medida
        // real enviada pelo browser (mediana entre os visitantes); a
        // distribuição uniforme entre 0% e 100% fica só como fallback pra dados
        // antigos, gravados antes da medição existir.
        const sectionScrollPos = sortedSections.map((s, idx) => {
          const real = median(s.starts);
          return real !== null ? real : (N > 1 ? (idx / (N - 1)) * 100 : 0);
        });
        const hasRealPositions = sortedSections.some((s) => s.starts.length > 0);

        // Construir reached do FINAL para o INÍCIO garantindo monotonicidade
        const reachedSets: Set<string>[] = new Array(N).fill(null).map(() => new Set<string>());
        for (let idx = N - 1; idx >= 0; idx--) {
          const s = sortedSections[idx];
          const pos = sectionScrollPos[idx];
          const set = reachedSets[idx];
          // (a) sessões que viram a seção via observer
          s.sessions.forEach((sid) => set.add(sid));
          // (b) sessões cujo scroll máximo passou da posição da seção
          maxScrollBySession.forEach((maxM, sid) => {
            if (maxM >= pos) set.add(sid);
          });
          // (c) herdar todas as sessões que alcançaram seções posteriores (monotonicidade)
          if (idx < N - 1) {
            reachedSets[idx + 1].forEach((sid) => set.add(sid));
          }
        }

        // A primeira seção recebe todas as sessões RASTREADAS (quem carregou a
        // landing viu o topo). Não usar validSessions aqui: sessão sem nenhum
        // evento de landing não é "chegou e saiu na headline", é sessão sem
        // medição — ela é reportada em untrackedSessions.
        if (N > 0) {
          trackedSessions.forEach((sid) => reachedSets[0].add(sid));
        }

        const funnel = sortedSections.map((s, idx) => {
          const reached = reachedSets[idx].size;
          const next = sortedSections[idx + 1];
          const clickersHere = clickSessionsBySection.get(s.id) || new Set<string>();
          const clickedCount = Array.from(clickersHere).filter((sid) => reachedSets[idx].has(sid)).length;
          // "continued" = avançou para a próxima seção OU clicou em algo nesta seção
          const continuedSet = new Set<string>();
          if (next) reachedSets[idx + 1].forEach((sid) => { if (reachedSets[idx].has(sid)) continuedSet.add(sid); });
          clickersHere.forEach((sid) => { if (reachedSets[idx].has(sid)) continuedSet.add(sid); });
          const continued = next ? continuedSet.size : clickedCount;
          const dropped = Math.max(0, reached - continued);
          return {
            section_id: s.id,
            order: s.order,
            reached,
            continued,
            clicked: clickedCount,
            dropped,
            drop_rate: reached > 0 ? (dropped / reached) * 100 : 0,
            continue_rate: reached > 0 ? (continued / reached) * 100 : 0,
            click_rate: reached > 0 ? (clickedCount / reached) * 100 : 0,
            avg_time_ms: s.sessions.size > 0 ? Math.round(s.totalTime / s.sessions.size) : 0,
            // Quantas sessões entram na média de tempo. É menor que `reached`
            // (que inclui quem foi inferido por scroll, sem tempo medido) — sem
            // esse número a média de tempo parece falar da mesma população da
            // coluna "chegou", e não fala.
            time_sample: s.sessions.size,
            pct_of_visitors: totalVisitors > 0 ? (reached / totalVisitors) * 100 : 0,
          };
        });

        // click aggregations (clicks already fetched above for funnel calc)

        const clicksByType: Record<string, number> = {};
        const clicksBySection: Record<string, number> = {};
        const topClicks: Record<string, { id: string; label: string; section: string | null; type: string; count: number; uniqueUsers: Set<string> }> = {};
        clicks.forEach((c: any) => {
          clicksByType[c.click_type] = (clicksByType[c.click_type] || 0) + 1;
          if (c.section_id) clicksBySection[c.section_id] = (clicksBySection[c.section_id] || 0) + 1;
          const key = `${c.click_type}::${c.click_id || c.label || "unknown"}`;
          if (!topClicks[key]) {
            topClicks[key] = { id: c.click_id || "?", label: c.label || c.click_id || "?", section: c.section_id, type: c.click_type, count: 0, uniqueUsers: new Set() };
          }
          topClicks[key].count += 1;
          topClicks[key].uniqueUsers.add(c.session_id);
        });
        const topClicksArr = Object.values(topClicks)
          .map((t) => ({ ...t, uniqueUsers: t.uniqueUsers.size }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15);

        // Breakdown de cliques POR SEÇÃO + click_id (usado p/ ver cliques em cada item, ex: cada pergunta do FAQ)
        const buttonAgg: Record<string, Record<string, { id: string; label: string; type: string; count: number; users: Set<string> }>> = {};
        clicks.forEach((c: any) => {
          if (!c.section_id) return;
          const cid = c.click_id || c.label || "unknown";
          if (!buttonAgg[c.section_id]) buttonAgg[c.section_id] = {};
          if (!buttonAgg[c.section_id][cid]) {
            buttonAgg[c.section_id][cid] = { id: cid, label: c.label || cid, type: c.click_type, count: 0, users: new Set() };
          }
          buttonAgg[c.section_id][cid].count += 1;
          buttonAgg[c.section_id][cid].users.add(c.session_id);
        });
        const clicksByButton: Record<string, Array<{ id: string; label: string; type: string; count: number; uniqueUsers: number }>> = {};
        Object.keys(buttonAgg).forEach((sid) => {
          clicksByButton[sid] = Object.values(buttonAgg[sid])
            .map((b) => ({ id: b.id, label: b.label, type: b.type, count: b.count, uniqueUsers: b.users.size }))
            .sort((a, b) => b.count - a.count);
        });

        // Heatmap de clique/toque por posição: grid 12x8 por seção, só considera
        // cliques com posição capturada (pos_x_pct/pos_y_pct — cliques antigos, de
        // antes dessa coluna existir, ou fora de qualquer seção, ficam de fora).
        const clickGridAgg: Record<string, Record<string, number>> = {};
        const GRID_COLS = 12;
        const GRID_ROWS = 8;
        clicks.forEach((c: any) => {
          if (!c.section_id || c.pos_x_pct == null || c.pos_y_pct == null) return;
          const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((c.pos_x_pct / 100) * GRID_COLS)));
          const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((c.pos_y_pct / 100) * GRID_ROWS)));
          const cellKey = `${col},${row}`;
          if (!clickGridAgg[c.section_id]) clickGridAgg[c.section_id] = {};
          clickGridAgg[c.section_id][cellKey] = (clickGridAgg[c.section_id][cellKey] || 0) + 1;
        });
        const clickHeatmap: Record<string, Array<{ col: number; row: number; count: number }>> = {};
        Object.keys(clickGridAgg).forEach((sid) => {
          clickHeatmap[sid] = Object.entries(clickGridAgg[sid]).map(([cell, count]) => {
            const [col, row] = cell.split(",").map(Number);
            return { col, row, count };
          });
        });

        // Heatmap de atenção por scroll: tempo acumulado (ms) em cada faixa de 5% da
        // página (20 bins), mais confiável que os 4 milestones pra achar "onde pararam
        // de ler" — funciona igual pra mouse e toque, já que é baseado em scroll.
        const attentionValid = (attentionRows || []).filter((r: any) => onLanding(r) && trackedSessions.has(r.session_id));
        const binAgg: Record<number, { totalMs: number; sessions: Set<string> }> = {};
        for (let b = 0; b < 20; b++) binAgg[b] = { totalMs: 0, sessions: new Set() };
        attentionValid.forEach((r: any) => {
          if (r.bin < 0 || r.bin > 19) return;
          binAgg[r.bin].totalMs += r.time_ms || 0;
          if ((r.time_ms || 0) > 0) binAgg[r.bin].sessions.add(r.session_id);
        });
        const scrollAttention = Array.from({ length: 20 }, (_, bin) => {
          const agg = binAgg[bin];
          const users = agg.sessions.size;
          return {
            bin,
            range_pct: [bin * 5, bin * 5 + 5],
            total_time_ms: agg.totalMs,
            avg_time_ms: users > 0 ? Math.round(agg.totalMs / users) : 0,
            users,
            pct_of_visitors: totalVisitors > 0 ? (users / totalVisitors) * 100 : 0,
          };
        });

        // Posição (% da altura da página) de cada seção, pra alinhar visualmente a
        // faixa de scroll-attention com o nome da seção no admin.
        const sectionBoundaries = sortedSections.map((s, idx) => ({
          section_id: s.id,
          pos_pct: sectionScrollPos[idx],
          end_pct: median(s.ends),
          measured: s.starts.length > 0,
        }));

        return {
          totalVisitors,
          sessionsInPeriod: validSessions.size,
          untrackedSessions,
          hasRealPositions,
          funnel,
          scrollDepth,
          scrollAttention,
          sectionBoundaries,
          clicksByType,
          clicksBySection,
          clicksByButton,
          clickHeatmap,
          topClicks: topClicksArr,
          totalClicks: clicks.length,
        };
      }

      const [current, previous] = await Promise.all([
        buildPeriod(from, toEnd),
        (prevFrom && prevToEnd) ? buildPeriod(prevFrom, prevToEnd) : Promise.resolve(null),
      ]);

      // Insights
      const insights: string[] = [];
      // Cobertura de medição vem PRIMEIRO: se boa parte das sessões não gerou
      // evento nenhum, o funil abaixo fala de uma amostra, não do tráfego todo.
      if (current.sessionsInPeriod > 0 && current.untrackedSessions > 0) {
        const coveragePct = (current.untrackedSessions / current.sessionsInPeriod) * 100;
        if (coveragePct >= 15) {
          insights.push(
            `${current.untrackedSessions} de ${current.sessionsInPeriod} sessões (${coveragePct.toFixed(0)}%) não geraram nenhum evento na landing — bot, saída antes do JS carregar ou tracking bloqueado. O funil abaixo considera só as ${current.totalVisitors} sessões medidas.`,
          );
        }
      }
      if (current.funnel.length > 0) {
        const worst = [...current.funnel].sort((a, b) => b.drop_rate - a.drop_rate)[0];
        const best = [...current.funnel].sort((a, b) => b.continue_rate - a.continue_rate)[0];
        if (worst) insights.push(`Maior queda acontece na seção "${worst.section_id}" (${worst.drop_rate.toFixed(0)}% saem aqui).`);
        if (best && best.section_id !== worst?.section_id) insights.push(`Melhor retenção na seção "${best.section_id}" (${best.continue_rate.toFixed(0)}% continuam).`);
        const lastReached = current.funnel.filter((f) => f.pct_of_visitors >= 50).pop();
        if (lastReached) insights.push(`A maioria dos visitantes alcança até "${lastReached.section_id}".`);
      }
      const scroll50 = current.scrollDepth.find((s) => s.milestone === 50);
      const scroll100 = current.scrollDepth.find((s) => s.milestone === 100);
      if (scroll50 && scroll50.pct < 50) insights.push(`Apenas ${scroll50.pct.toFixed(0)}% chegam à metade da página — perda forte no início.`);
      if (scroll100 && scroll100.pct < 20) insights.push(`Só ${scroll100.pct.toFixed(0)}% chegam ao fim da página.`);
      if (previous && current.funnel.length > 0 && previous.funnel.length > 0) {
        const cReach = current.funnel[current.funnel.length - 1]?.pct_of_visitors || 0;
        const pReach = previous.funnel[previous.funnel.length - 1]?.pct_of_visitors || 0;
        const diff = cReach - pReach;
        if (Math.abs(diff) > 3) {
          insights.push(`Retenção até o final ${diff > 0 ? "melhorou" : "piorou"} ${Math.abs(diff).toFixed(0)}pp vs período anterior.`);
        }
      }

      return new Response(JSON.stringify({ current, previous, insights }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /tracking-diagnostics - Compare Meta clicks vs landing_hits vs cta_clicks vs pageview sessions
    if (path === "/tracking-diagnostics" && req.method === "GET") {
      const fromParam = url.searchParams.get("from");
      const toParam = url.searchParams.get("to");
      if (!fromParam || !toParam) {
        return new Response(
          JSON.stringify({ error: "from e to são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const fromISO = fromParam;
      const toISO = toParam.includes("T") ? toParam : toParam + "T23:59:59.999Z";
      const fromDateOnly = fromParam.slice(0, 10);
      const toDateOnly = toParam.slice(0, 10);

      // 1. Meta Ads clicks (from ad_spend.clicks)
      const { data: spendRows } = await supabase
        .from("ad_spend")
        .select("clicks, impressions, spend, date")
        .gte("date", fromDateOnly)
        .lte("date", toDateOnly);
      const metaClicks = (spendRows || []).reduce((s: number, r: any) => s + (r.clicks || 0), 0);
      const metaImpressions = (spendRows || []).reduce((s: number, r: any) => s + (r.impressions || 0), 0);

      // 2. Landing hits (paginated to bypass 1000 row limit)
      type Hit = { device_type: string | null; utm_source: string | null; click_id: string | null; session_id: string | null };
      const allHits: Hit[] = [];
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("landing_hits")
          .select("device_type, utm_source, click_id, session_id")
          .gte("created_at", fromISO)
          .lte("created_at", toISO)
          .range(offset, offset + PAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        allHits.push(...(data as Hit[]));
        if (data.length < PAGE) break;
        offset += PAGE;
      }

      const totalHits = allHits.length;
      const byDevice: Record<string, number> = { ios: 0, android: 0, desktop: 0, mobile: 0, unknown: 0 };
      let hitsFromAds = 0;
      let hitsOrganic = 0;
      for (const h of allHits) {
        const d = h.device_type || "unknown";
        byDevice[d] = (byDevice[d] || 0) + 1;
        const src = (h.utm_source || "").toLowerCase();
        if (src && src !== "direct" && src !== "organic" && !src.includes("{{")) hitsFromAds++;
        else hitsOrganic++;
      }

      // 3. CTA clicks (click_events with click_type=cta_primary or button + start_btn)
      const allClicks: { click_type: string; click_id: string | null }[] = [];
      offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("click_events")
          .select("click_type, click_id")
          .gte("created_at", fromISO)
          .lte("created_at", toISO)
          .eq("page", "/")
          .range(offset, offset + PAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        allClicks.push(...(data as any));
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      const ctaClicks = allClicks.filter((c) => {
        const t = (c.click_type || "").toLowerCase();
        const id = (c.click_id || "").toLowerCase();
        return t === "cta_primary" || id.includes("start_btn") || id.includes("cta");
      }).length;

      // 4. Lead sessions (legacy "pageviews") in same period - filter for landing page only
      const { count: legacyPageviews } = await supabase
        .from("lead_sessions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .eq("first_page", "/");

      // 5. Diagnostics
      const alerts: { severity: "ALTA" | "MÉDIA" | "BAIXA"; title: string; message: string }[] = [];
      const lossMetaToHits = metaClicks - totalHits;
      const lossPct = metaClicks > 0 ? (lossMetaToHits / metaClicks) * 100 : 0;

      if (metaClicks > 0 && lossPct > 30) {
        alerts.push({
          severity: "ALTA",
          title: "Perda de carregamento crítica",
          message: `${lossMetaToHits} cliques (${lossPct.toFixed(1)}%) do Meta não chegaram na landing. Possível lentidão, timeout ou script bloqueando o carregamento.`,
        });
      } else if (metaClicks > 0 && lossPct > 15) {
        alerts.push({
          severity: "MÉDIA",
          title: "Perda de carregamento moderada",
          message: `${lossMetaToHits} cliques (${lossPct.toFixed(1)}%) do Meta não viraram landing_hit. Verifique velocidade da página.`,
        });
      }

      const pvDiff = totalHits - (legacyPageviews || 0);
      if (totalHits > 50 && legacyPageviews && pvDiff / totalHits > 0.2) {
        alerts.push({
          severity: "MÉDIA",
          title: "Pixel/tracking secundário com perda",
          message: `${pvDiff} hits não foram registrados pelo tracking de sessão (lead_sessions). Pode indicar bloqueio de script (ITP/AdBlock/WebView).`,
        });
      }

      const iosShare = totalHits > 0 ? (byDevice.ios || 0) / totalHits : 0;
      const iosClicksShare = ctaClicks > 0 ? 0 : 0; // cant infer device from click_events
      if (iosShare > 0.3 && metaClicks > 0 && lossPct > 20) {
        alerts.push({
          severity: "MÉDIA",
          title: "Possível impacto de ITP/WebView (iOS)",
          message: `iOS representa ${(iosShare * 100).toFixed(0)}% dos hits e há perda de ${lossPct.toFixed(1)}%. Safari/WebView podem estar bloqueando scripts.`,
        });
      }

      if (metaClicks === 0 && totalHits === 0) {
        alerts.push({
          severity: "BAIXA",
          title: "Sem dados no período",
          message: "Nenhum clique do Meta nem landing_hit registrado neste período.",
        });
      }

      return new Response(
        JSON.stringify({
          period: { from: fromISO, to: toISO },
          meta: { clicks: metaClicks, impressions: metaImpressions },
          landing_hits: {
            total: totalHits,
            by_device: byDevice,
            from_ads: hitsFromAds,
            organic: hitsOrganic,
          },
          cta_clicks: ctaClicks,
          legacy_pageviews: legacyPageviews || 0,
          comparisons: {
            meta_vs_hits_loss: lossMetaToHits,
            meta_vs_hits_loss_pct: Number(lossPct.toFixed(2)),
            hits_vs_cta_engagement_pct:
              totalHits > 0 ? Number(((ctaClicks / totalHits) * 100).toFixed(2)) : 0,
          },
          alerts,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── GET /lead-journey ────
    // Reconstrói o caminho de um lead: de qual headline ele veio, quanto tempo
    // leu antes de clicar, quanto tempo levou no quiz e quantas vezes já tinha
    // visitado o site antes. Ver lead_journey.ts para como lead e sessão são
    // casados (fbp > IP > tempo) — a tabela `leads` não guarda session_id.
    if (path === "/lead-journey" && req.method === "GET") {
      const leadId = url.searchParams.get("lead_id");
      if (!leadId) {
        return new Response(
          JSON.stringify({ error: "lead_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const journey = await buildLeadJourney(supabase, leadId);
      return new Response(JSON.stringify(journey), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ──── GET /commercial-goals ────
    // Base do forecast comercial: meses fechados + taxas da janela de baseline.
    // NÃO respeita os filtros globais de página e de criativo — a meta é da
    // operação inteira, e recortá-la por variante de headline daria um plano
    // que só vale para uma fatia do tráfego. O front avisa isso na tela.
    // ── GET /metas?month=YYYY-MM ─────────────────────────────────────────
    //
    // ── O dia de hoje: o que já saiu e o que ainda vai sair ──────────────────
    //
    // Duas perguntas diferentes que o painel não respondia:
    //   1. quanto já gastei hoje  (realizado, vem do `ad_spend`)
    //   2. quanto vou gastar hoje (planejado, é a soma dos orçamentos no ar)
    //
    // A armadilha do número 2, e a razão desta rota existir em vez de uma soma
    // ingênua: **conjunto ativo sem nenhum anúncio ativo não gasta nada**.
    // Ele aparece com orçamento no Gerenciador e entrega zero. Foi o que houve
    // com o lote do Case Ighor, ligado um dia inteiro sem anúncio. Somar tudo
    // que está "ligado" dá um número que parece certo e é alto demais.
    //
    // O realizado do dia costuma vir atrasado: o `meta-ads-cron` sincroniza de
    // tempos em tempos, então de manhã o gasto aparece menor do que já é. Por
    // isso a resposta devolve `sincronizado_ate`, para a tela poder dizer de
    // quando é o número em vez de fingir que é agora.
    if (path === "/dia" && req.method === "GET") {
      const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const dia = url.searchParams.get("date") || hoje;

      // ESCOPO ÚNICO PARA OS DOIS NÚMEROS.
      //
      // Esta rota responde duas perguntas que só fazem sentido juntas: quanto
      // JÁ gastei hoje (realizado, do `ad_spend`) e quanto VOU gastar hoje
      // (planejado, a soma dos orçamentos no ar). Até 10/09/2026 elas viviam em
      // escopos diferentes: o realizado somava TODAS as contas e o planejado
      // olhava UMA conta cravada no código. Comparar os dois era comparar
      // grandezas de universos diferentes — e a conta cravada (CA 03) está
      // pausada desde 07/09.
      //
      // Agora há um escopo só, aplicado aos dois lados:
      //   ?ad_account_id=act_X  → exatamente essa conta;
      //   sem parâmetro         → todas as contas com sync_enabled.
      //
      // O cadastro manda. Some o ID cravado.
      const contaParam = url.searchParams.get("ad_account_id");
      let escopo: Array<{ ad_account_id: string; account_name: string | null; currency: string | null }> = [];
      if (contaParam) {
        const id = contaParam.startsWith("act_") ? contaParam : `act_${contaParam}`;
        const { data } = await supabase
          .from("meta_ad_accounts").select("ad_account_id, account_name, currency")
          .eq("ad_account_id", id).maybeSingle();
        // Conta pedida e não cadastrada: responde com o ID, sem inventar nome
        // nem moeda. Sem moeda, a conversão para real não acontece.
        escopo = [data ?? { ad_account_id: id, account_name: null, currency: null }];
      } else {
        const { data } = await supabase
          .from("meta_ad_accounts").select("ad_account_id, account_name, currency")
          .eq("sync_enabled", true).is("archived_at", null);
        escopo = data ?? [];
      }
      const idsDoEscopo = escopo.map((c) => c.ad_account_id);

      // Realizado: mesmo escopo.
      let qGasto = supabase
        .from("ad_spend")
        .select("spend, spend_original, spend_currency, exchange_rate, campaign_name, created_at, ad_account_id")
        .eq("date", dia);
      if (idsDoEscopo.length > 0) qGasto = qGasto.in("ad_account_id", idsDoEscopo);
      const { data: linhasHoje } = await qGasto;

      const gastoBrl = (linhasHoje ?? []).reduce((t, r: any) => t + (Number(r.spend) || 0), 0);
      // Gasto na moeda de origem, SEPARADO POR MOEDA. Somar `spend_original` de
      // contas diferentes num único número dava um total sem unidade: dólar
      // somado com real. O portfólio tem contas em USD e em BRL ao mesmo tempo.
      const gastoPorMoeda: Record<string, number> = {};
      for (const r of linhasHoje ?? []) {
        const m = (r as any).spend_currency || "?";
        gastoPorMoeda[m] = (gastoPorMoeda[m] ?? 0) + (Number((r as any).spend_original) || 0);
      }
      const sincronizadoAte = (linhasHoje ?? [])
        .map((r: any) => r.created_at)
        .filter(Boolean)
        .sort()
        .pop() ?? null;

      let orcamento: Record<string, unknown> = { disponivel: false, motivo: "META_ACCESS_TOKEN ausente" };
      const token = Deno.env.get("META_ACCESS_TOKEN");
      // Sem o prefixo `act_`, o Meta trata o número como outro tipo de objeto e
      // responde "nonexisting field (adsets)".
      const conta = idsDoEscopo[0] ?? null;

      // CÂMBIO VEM DA CAMADA FX CANÔNICA, PELA MOEDA DESTA CONTA.
      //
      // Antes daqui saía "o exchange_rate mais recente de qualquer linha de
      // ad_spend", sem filtrar moeda nem conta. Enquanto só uma conta gastava,
      // acertava por acidente. Com uma conta BRL na base — e há três no
      // portfólio — a linha mais recente traz `exchange_rate = 1`, e o
      // orçamento em dólar desta conta passaria a ser convertido 1:1,
      // subestimando a verba do dia em ~5 vezes.
      //
      // A moeda é da conta e a taxa é da camada FX. Nenhuma conta contamina a
      // conversão de outra.
      // A conta do escopo já veio com nome e moeda do cadastro; não há segunda
      // consulta. Com escopo vazio (nenhuma conta habilitada) não há moeda, e a
      // conversão simplesmente não acontece — em vez de chutar 1.
      const contaCadastro = escopo[0] ?? null;
      const moedaDaConta = (contaCadastro?.currency as string | null) ?? null;

      let taxa: number | null = null;
      let taxaProcedencia: Record<string, unknown> = { origem: "indisponivel" };
      if (moedaDaConta === "BRL") {
        taxa = 1;
        taxaProcedencia = { origem: "conta em BRL", rate: 1 };
      } else if (moedaDaConta) {
        const { data: fx } = await supabase
          .from("fx_rates")
          .select("rate, date, origem_date, source")
          .eq("currency", moedaDaConta)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fx?.rate) {
          taxa = Number(fx.rate);
          const origemData = (fx.origem_date as string) ?? (fx.date as string);
          const dias = Math.floor((Date.parse(hoje) - Date.parse(origemData)) / 86400000);
          taxaProcedencia = {
            origem: "fx_rates",
            moeda: moedaDaConta,
            rate: taxa,
            cotacao_de: origemData,
            fonte: fx.source ?? null,
            idade_dias: dias,
            status: dias === 0 ? "fresh" : dias <= 3 ? "stale" : "vencida",
          };
        } else {
          taxaProcedencia = { origem: "sem cotacao", moeda: moedaDaConta };
        }
      } else {
        taxaProcedencia = { origem: "conta sem moeda no cadastro", conta };
      }

      if (token && conta) {   // sem conta no escopo nao ha orcamento a somar
        try {
          const campos = [
            "id,name,daily_budget,effective_status",
            "campaign{id,name,effective_status,daily_budget}",
            "ads.limit(50){id,effective_status}",
          ].join(",");
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 6000);
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${conta}/adsets?fields=${encodeURIComponent(campos)}&limit=300&access_token=${token}`,
            { signal: ctrl.signal },
          );
          clearTimeout(timer);
          const j = await res.json();
          if (j.error) throw new Error(j.error.message ?? "erro do Meta");

          let usd = 0, ativos = 0, entregando = 0, paradoUsd = 0;
          const porCampanha = new Map<string, number>();
          const cboVistas = new Map<string, { nome: string; usd: number }>();
          const semAnuncio: Array<{ campanha: string; conjunto: string; usd: number }> = [];

          for (const a of (j.data ?? []) as Array<any>) {
            const c = a.campaign ?? {};
            if (a.effective_status !== "ACTIVE" || c.effective_status !== "ACTIVE") continue;
            ativos++;
            const ads = (a.ads?.data ?? []) as Array<{ effective_status?: string }>;
            // PENDING_REVIEW ainda não entrega, mas entra sozinho em horas.
            // Tratar como zero faria a previsão despencar a cada anúncio novo.
            const vivos = ads.filter((x) =>
              x.effective_status === "ACTIVE" || x.effective_status === "PENDING_REVIEW",
            );
            const valor = Number(a.daily_budget ?? 0) / 100;
            if (!vivos.length) {
              paradoUsd += valor;
              semAnuncio.push({ campanha: c.name ?? "?", conjunto: a.name ?? "?", usd: valor });
              continue;
            }
            entregando++;
            // Com CBO o orçamento vive na campanha; somar o do conjunto
            // contaria a mesma verba uma vez por conjunto.
            if (c.daily_budget) {
              cboVistas.set(String(c.id), { nome: c.name ?? "?", usd: Number(c.daily_budget) / 100 });
              continue;
            }
            usd += valor;
            porCampanha.set(c.name ?? "?", (porCampanha.get(c.name ?? "?") ?? 0) + valor);
          }
          for (const { nome, usd: v } of cboVistas.values()) {
            usd += v;
            porCampanha.set(nome, (porCampanha.get(nome) ?? 0) + v);
          }

          const arred = (n: number) => Math.round(n * 100) / 100;
          orcamento = {
            disponivel: true,
            usd: arred(usd),
            brl: taxa ? Math.round(usd * taxa) : null,
            conjuntos_ativos: ativos,
            conjuntos_entregando: entregando,
            parado_usd: arred(paradoUsd),
            parado_brl: taxa ? Math.round(paradoUsd * taxa) : null,
            ativos_sem_anuncio: semAnuncio.map((x) => ({ ...x, usd: arred(x.usd) })),
            por_campanha: [...porCampanha.entries()]
              .map(([campanha, v]) => ({ campanha, usd: arred(v), brl: taxa ? Math.round(v * taxa) : null }))
              .sort((a2, b2) => b2.usd - a2.usd),
          };
        } catch (e) {
          orcamento = { disponivel: false, motivo: e instanceof Error ? e.message : String(e) };
        }
      }

      return new Response(
        JSON.stringify({
          data: dia,
          gasto: {
            brl: Math.round(gastoBrl * 100) / 100,
            // Compatibilidade: continua existindo, mas agora é o total EM USD,
            // não a soma cega de spend_original de moedas diferentes.
            usd: Math.round((gastoPorMoeda.USD ?? 0) * 100) / 100,
            por_moeda: Object.fromEntries(
              Object.entries(gastoPorMoeda).map(([m, v]) => [m, Math.round(v * 100) / 100]),
            ),
          },
          sincronizado_ate: sincronizadoAte,
          taxa,
          taxa_procedencia: taxaProcedencia,
          // O escopo aparece na resposta: quem lê o número sabe sobre o que ele é.
          escopo: {
            modo: url.searchParams.get("ad_account_id") ? "conta especifica" : "contas com sync habilitado",
            contas: escopo.map((c) => ({ ad_account_id: c.ad_account_id, account_name: c.account_name, currency: c.currency })),
          },
          conta: { id: conta, nome: contaCadastro?.account_name ?? null, moeda: moedaDaConta },
          orcamento,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Meta do mês contra o realizado, com a quebra por semana e o ritmo. Não
    // projeta nada: a meta é um número decidido, gravado em commercial_goals.
    if (path === "/metas" && req.method === "GET") {
      const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const month = url.searchParams.get("month") || hoje.slice(0, 7);
      const [ano, mes] = month.split("-").map(Number);
      const primeiro = `${month}-01`;
      const ultimo = `${month}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, "0")}`;
      const fimReal = hoje < ultimo ? hoje : ultimo;

      const MQL_FAIXAS_META = [
        "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
        "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
        "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
        "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
        "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
        "Acima de R$ 10 milhões", "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
      ];
      const ehMql = (l: any) =>
        l?.sdr_override !== "Dara" && l?.sdr_override !== "Miguel" &&
        !!l?.investimento_faixa && MQL_FAIXAS_META.includes(l.investimento_faixa);

      // JANELA EM UTC QUE COBRE O DIA CIVIL BRASILEIRO.
      //
      // Antes a busca ia de `T00:00:00Z` do dia 1 até `T23:59:59Z` do último
      // dia. Só que o dia 30 brasileiro termina às 02:59:59Z do dia 1º seguinte:
      // TODO lead que entrava entre 21h e 23h59 do último dia do mês ficava fora
      // daquele mês, para sempre. Do outro lado a janela pega 3 horas de agosto,
      // que o filtro fino por `dataBr` descarta corretamente.
      const diaSeguinte = new Date(Date.parse(`${ultimo}T12:00:00Z`) + 86400000)
        .toISOString().slice(0, 10);
      const deUtc = `${primeiro}T03:00:00.000Z`;
      const ateUtc = `${diaSeguinte}T02:59:59.999Z`;

      // O PostgREST devolve no máximo 1000 linhas por resposta. `ad_spend` tem
      // uma linha por conta+dia+anúncio, então três contas com quinze anúncios
      // em trinta dias já encostam no teto — e sem paginar o "Investimento em
      // tráfego" simplesmente PARA de crescer perto do fim do mês, levando a
      // margem junto. Medido em 16/09/2026: 201 linhas em setembro, 82 leads e
      // 35 reuniões. Ainda não mordia: isto é prevenção, não sintoma.
      const paginarTudo = async (
        montar: (de: number, ate: number) => PromiseLike<{ data: any[] | null; error: any }>,
      ) => {
        const out: any[] = [];
        for (let i = 0; i < 40; i++) {
          const { data } = await montar(i * 1000, i * 1000 + 999);
          if (!data || data.length === 0) break;
          out.push(...data);
          if (data.length < 1000) break;
        }
        return out;
      };

      const [metaRow, leadsData, spendData, meetData, salesRows] = await Promise.all([
        supabase.from("commercial_goals").select("*").eq("month", month).maybeSingle(),
        paginarTudo((de, ate) =>
          supabase.from("leads").select("id, created_at, investimento_faixa, sdr_override")
            .gte("created_at", deUtc).lte("created_at", ateUtc)
            .order("created_at", { ascending: true }).range(de, ate)),
        paginarTudo((de, ate) =>
          supabase.from("ad_spend").select("date, spend")
            .gte("date", primeiro).lte("date", ultimo)
            .order("date", { ascending: true }).range(de, ate)),
        // `meetings` segue SEM filtro de data, só paginada. Filtrar por
        // `created_at` do mês perderia a reunião marcada no mês passado e
        // realizada neste — que é exatamente o que "Reuniões realizadas" conta.
        paginarTudo((de, ate) =>
          // `agendado_por` entra aqui porque "Reuniões agendadas" deixou de ser
          // uma conta só: a call que o próprio lead marcou em /agendar não é
          // conquista do SDR. Ver realizado() em metas.ts.
          supabase.from("meetings").select("created_at, scheduled_at, status, attended, agendado_por")
            .order("created_at", { ascending: true }).range(de, ate)),
        supabase.from("manual_sales").select("sale_date, revenue, amount_received, sale_type")
          .is("refunded_at", null)
          .gte("sale_date", primeiro).lte("sale_date", ultimo),
      ]);

      const fontes = {
        leads: leadsData,
        spend: spendData,
        meetings: meetData,
        sales: salesRows.data || [],
      } as any;

      const meta = (metaRow.data || {}) as Record<string, number | null>;
      // O DIA DE HOJE NÃO ESTÁ INTEIRO. No mês corrente ele entra rateado pela
      // hora; num mês já fechado a fração é 1 e nada muda.
      const fracaoHoje = fimReal === hoje ? fracaoDoDiaBr() : 1;
      const feito = realizado(fontes, primeiro, fimReal, ehMql);
      const prog = progresso(month, fimReal, fracaoHoje);

      // "Reuniões agendadas" deixou de ser uma conta só (17/09/2026).
      //
      // Desde que o lead de faixa alta marca sozinho em /agendar, parte das
      // agendadas nasce sem SDR nenhum no meio. A linha tem dono — Miguel — e
      // contar a call automática nela diria que ele produziu uma reunião num dia
      // em que não falou com ninguém. O REALIZADO da linha passa a ser só o do
      // time; o total e a fatia automática viajam junto, para a tela mostrar os
      // três. A meta cadastrada em `commercial_goals` não muda: ela continua
      // sendo o alvo desta linha, agora comparado com o trabalho do time.
      const REALIZADO_SO_DO_TIME: Record<string, string> = {
        reunioes_agendadas: "reunioes_agendadas_time",
      };
      const realizadoDaLinha = (fonte: any, chave: string): number =>
        fonte ? (fonte[REALIZADO_SO_DO_TIME[chave] ?? chave] ?? 0) : 0;

      const linhas = LINHAS.map((l) => {
        const contavel = l.formato === "numero";
        const bruto = meta[l.chave] == null ? null : Number(meta[l.chave]);
        // A meta do MÊS também sai inteira quando é coisa contável. "10,5
        // contratos" não é alvo que alguém persegue, e deixar o mês quebrado
        // enquanto os dias saem inteiros faria a soma dos dias não fechar o mês.
        // Para cima, sempre: meia venda não existe. 10,5 contratos vira 11.
        // Meta gravada como 0 vale como meta AUSENTE. Com zero a barra não
        // renderiza e a linha exibia "0% da meta" mesmo com realizado alto —
        // pior que dizer "sem meta", que ao menos é verdade.
        const alvo = bruto == null || bruto === 0 ? null : (contavel ? Math.ceil(bruto) : bruto);
        // O ritmo esperado é o acumulado até hoje pela régua da linha, não uma
        // fração multiplicada. Antes eram só duas frações (úteis e corridos), e
        // o funil inteiro usava a de úteis — dizendo que no sábado nada deveria
        // acontecer, com MQL entrando no sábado.
        const esperado = alvo == null
          ? null
          : metaEsperadaAgora(month, fimReal, alvo, l.pesoFimDeSemana, contavel, fracaoHoje);
        return {
          chave: l.chave,
          rotulo: l.rotulo,
          dono: l.dono,
          formato: l.formato,
          meta: alvo,
          // A meta como foi CADASTRADA, sem o arredondamento para cima. O
          // ticket implícito da tela precisa dela: `contratos_assessoria` está
          // gravado como 10,5, e dividir o TCV por 11 dizia que o ticket alvo
          // era R$ 20.024 quando a cascata que gerou a meta assume R$ 20.978.
          meta_bruta: bruto,
          realizado: realizadoDaLinha(feito, l.chave),
          esperado,
          pct: alvo ? realizadoDaLinha(feito, l.chave) / alvo : null,
          // Só em `reunioes_agendadas`: o total (time + automático) e a fatia
          // que o próprio lead marcou. Ausentes nas outras linhas.
          ...(REALIZADO_SO_DO_TIME[l.chave]
            ? {
              realizado_total: (feito as any).reunioes_agendadas ?? 0,
              realizado_auto: (feito as any).reunioes_agendadas_auto ?? 0,
            }
            : {}),
        };
      });

      // Semanas: cada uma com a sua fatia da meta e o que já foi feito nela.
      //
      // `hoje` de verdade, não `fimReal`: num mês JÁ FECHADO o `fimReal` é o
      // último dia do mês, e a última semana vinha marcada como "atual", verde,
      // ao abrir setembro em outubro. `fimReal` continua mandando no recorte do
      // realizado logo abaixo, que é outra pergunta.
      const semanas = semanasDoMes(month, hoje).map((sem) => {
        const ate = sem.fim < fimReal ? sem.fim : fimReal;
        const feitoSem = sem.inicio > fimReal ? null : realizado(fontes, sem.inicio, ate, ehMql);
        const linhasSem: Record<string, {
          meta: number | null;
          esperado: number | null;
          realizado: number;
          /** Só em `reunioes_agendadas`: total (time + automático). */
          realizado_total?: number;
          /** Só em `reunioes_agendadas`: as que o próprio lead marcou. */
          realizado_auto?: number;
        }> = {};
        for (const l of LINHAS) {
          const alvo = meta[l.chave] == null ? null : Number(meta[l.chave]);
          // Mesma régua do resto: diferença de acumulados, que sai inteira nas
          // linhas contáveis e faz a soma das semanas fechar o mês exatamente.
          const contavelSem = l.formato === "numero";
          const alvoSem = alvo == null ? null : (contavelSem ? Math.ceil(alvo) : alvo);
          const fatia = alvoSem == null
            ? null
            : metaNoIntervaloDoMes(month, sem.inicio, sem.fim, alvoSem, l.pesoFimDeSemana, contavelSem);
          // Quanto já deveria estar feito DENTRO desta semana, a esta altura.
          // Sem isto a semana corrente comparava realizado parcial com meta
          // cheia: no sábado a linha mostrava "R$ 0 / R$ 5.800" e parecia
          // desastre, sem nenhuma marca de ritmo como a das barras de cima.
          const esperadoSem = alvoSem == null || sem.inicio > fimReal
            ? null
            : metaNoIntervaloDoMes(month, sem.inicio, ate, alvoSem, l.pesoFimDeSemana, contavelSem);
          linhasSem[l.chave] = {
            meta: fatia,
            esperado: esperadoSem,
            // Mesma régua da linha do mês: agendada automática não entra.
            realizado: realizadoDaLinha(feitoSem, l.chave),
            ...(REALIZADO_SO_DO_TIME[l.chave]
              ? {
                realizado_total: feitoSem ? (feitoSem as any).reunioes_agendadas ?? 0 : 0,
                realizado_auto: feitoSem ? (feitoSem as any).reunioes_agendadas_auto ?? 0 : 0,
              }
              : {}),
          };
        }
        return { ...sem, linhas: linhasSem };
      });

      // Vendas sem valor lançado: sem isso a linha de TCV mostra menos do que
      // foi vendido, e a meta parece perdida por erro de digitação.
      //
      // PARCERIA NASCE COM `revenue` ZERO DE PROPÓSITO: ela é comissionada e não
      // tem TCV no fechamento. Contá-la aqui fazia a tarja amarela de "venda sem
      // valor lançado" aparecer com tudo certo. Venda com data futura também sai:
      // ela ainda não entra no realizado, então não há o que estar subestimado.
      const semValor = (salesRows.data || []).filter(
        (v: any) =>
          v.sale_type !== "parceria" &&
          v.sale_date <= fimReal &&
          (!v.revenue || Number(v.revenue) === 0),
      ).length;

      return new Response(JSON.stringify({
        month,
        hoje: fimReal,
        tem_meta: !!metaRow.data,
        observacao: (metaRow.data as any)?.observacao ?? null,
        progresso: prog,
        linhas,
        semanas,
        avisos: semValor > 0
          ? [`${semValor} venda(s) do mês sem valor lançado: o TCV realizado está subestimado.`]
          : [],
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/commercial-goals" && req.method === "GET") {
      const monthsBack = Math.min(36, Math.max(3, parseInt(url.searchParams.get("months_back") || "8", 10) || 8));
      const baselineDays = Math.min(365, Math.max(14, parseInt(url.searchParams.get("baseline_days") || "90", 10) || 90));
      const forecastMonths = Math.min(12, Math.max(1, parseInt(url.searchParams.get("forecast_months") || "6", 10) || 6));
      // baseline_from (YYYY-MM-DD) tem precedência sobre baseline_days: é o
      // preset "mês passado + este mês", que é como o time fecha o negócio.
      const rawFrom = url.searchParams.get("baseline_from");
      const baselineFrom = rawFrom && /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : null;
      const result = await buildCommercialGoals(supabase, { monthsBack, baselineDays, forecastMonths, baselineFrom });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ──── GET /commercial-plan ────
    // Só as PREMISSAS (decisão do time). O forecast nunca é gravado: ele é
    // recalculado sobre o histórico real a cada abertura da aba.
    if (path === "/commercial-plan" && req.method === "GET" && url.searchParams.get("_method") !== "POST") {
      const { data, error } = await supabase
        .from("commercial_plan")
        .select("assumptions, updated_at")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw error;
      return new Response(
        JSON.stringify({ assumptions: data?.assumptions || null, updated_at: data?.updated_at || null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ──── POST /commercial-plan ────
    if (path === "/commercial-plan" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const raw = url.searchParams.get("plan");
      if (!raw) {
        return new Response(
          JSON.stringify({ error: "Parâmetro plan (JSON) é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      let assumptions: unknown;
      try {
        assumptions = JSON.parse(raw);
      } catch {
        return new Response(
          JSON.stringify({ error: "plan não é um JSON válido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data, error } = await supabase
        .from("commercial_plan")
        .upsert({ id: "default", assumptions, updated_at: new Date().toISOString() }, { onConflict: "id" })
        .select("assumptions, updated_at")
        .maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Rota não encontrada" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Admin data error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
