// Cliente da Marketing API para o que o Hermes precisa: subir mídia, montar o
// creative e criar o anúncio. Só escrita — a leitura de performance continua no
// meta-ads-cron.

const API_VERSION = (Deno.env.get("META_API_VERSION") || "v21.0").toLowerCase();
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

// Token de escrita separado do de leitura: `ads_management` é um escopo bem mais
// perigoso que o `ads_read` usado hoje, então quem só lê continua com o antigo.
// Qual token usar nas chamadas de escrita.
//
// O padrão é o de marketing. O de leitura entra como alternativa porque o erro
// 1885183 do Meta ("app em modo de desenvolvimento") não é sobre permissão e sim
// sobre QUAL APP gerou o token: se os dois tokens vierem de apps diferentes e um
// deles estiver publicado, é ele que consegue criar o post do anúncio.
let tokenPreferido: "write" | "read" = "write";
export function usarToken(qual: "write" | "read") {
  tokenPreferido = qual;
}

export function writeToken(): string {
  const marketing = Deno.env.get("META_MARKETING_TOKEN");
  const leitura = Deno.env.get("META_ACCESS_TOKEN");
  const t = tokenPreferido === "read" ? (leitura || marketing) : (marketing || leitura);
  if (!t) throw new Error("META_MARKETING_TOKEN não configurado");
  return t;
}

export class MetaError extends Error {
  constructor(public step: string, public detail: unknown) {
    super(`[${step}] ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
}

async function graph(
  step: string,
  path: string,
  init: { method?: string; body?: URLSearchParams; query?: Record<string, string> } = {},
): Promise<Record<string, unknown>> {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  if (!init.body) url.searchParams.set("access_token", writeToken());

  const res = await fetch(url, { method: init.method ?? "GET", body: init.body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as { error?: unknown }).error) {
    throw new MetaError(step, (json as { error?: unknown }).error ?? `HTTP ${res.status}`);
  }
  return json as Record<string, unknown>;
}

function form(fields: Record<string, string | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) p.set(k, v);
  p.set("access_token", writeToken());
  return p;
}

/**
 * Sobe um vídeo por URL. O arquivo vive no Storage privado e chega aqui como
 * signed URL de curta duração, então o Meta baixa direto sem passarmos os bytes
 * pela edge function, que tem teto de memória bem menor que um vídeo de anúncio.
 */
export async function uploadVideo(adAccountId: string, fileUrl: string, name: string): Promise<string> {
  const json = await graph("upload_video", `${adAccountId}/advideos`, {
    method: "POST",
    body: form({ file_url: fileUrl, name, title: name }),
  });
  const id = json.id as string | undefined;
  if (!id) throw new MetaError("upload_video", "resposta sem id");
  return id;
}

/**
 * O vídeo não fica utilizável na hora: o Meta transcodifica primeiro. Criar o
 * anúncio antes disso devolve erro de vídeo indisponível, então esperamos aqui.
 */
export async function waitVideoReady(videoId: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let delay = 3_000;
  while (Date.now() < deadline) {
    const json = await graph("video_status", videoId, { query: { fields: "status" } });
    const status = json.status as { video_status?: string } | undefined;
    if (status?.video_status === "ready") return;
    if (status?.video_status === "error") throw new MetaError("video_status", status);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 15_000);
  }
  throw new MetaError("video_status", `vídeo ${videoId} não ficou pronto no tempo limite`);
}

/** Thumbnail preferida do vídeo, obrigatória no video_data do creative. */
export async function videoThumbnail(videoId: string): Promise<string | undefined> {
  try {
    const json = await graph("video_thumb", `${videoId}/thumbnails`, {
      query: { fields: "uri,is_preferred" },
    });
    const list = (json.data ?? []) as Array<{ uri?: string; is_preferred?: boolean }>;
    return (list.find((t) => t.is_preferred) ?? list[0])?.uri;
  } catch {
    return undefined;
  }
}

/** Sobe uma imagem (bytes em base64) e devolve o hash usado pelo creative. */
export async function uploadImage(
  adAccountId: string,
  bytesB64: string,
  fileName: string,
): Promise<string> {
  const json = await graph("upload_image", `${adAccountId}/adimages`, {
    method: "POST",
    body: form({ bytes: bytesB64, name: fileName }),
  });
  const images = json.images as Record<string, { hash?: string }> | undefined;
  const hash = images && Object.values(images)[0]?.hash;
  if (!hash) throw new MetaError("upload_image", "resposta sem hash");
  return hash;
}

export interface CreativeInput {
  adAccountId: string;
  name: string;
  pageId: string;
  instagramActorId?: string | null;
  linkUrl: string;
  ctaType: string;
  primaryText: string;
  headline: string;
  description?: string | null;
  videoId?: string;
  thumbnailUrl?: string;
  imageHash?: string;
  urlTags: string;
}

export async function createAdCreative(input: CreativeInput): Promise<string> {
  const cta = { type: input.ctaType, value: { link: input.linkUrl } };

  const storySpec: Record<string, unknown> = { page_id: input.pageId };
  // `instagram_user_id`, não `instagram_actor_id`: é o campo que os anúncios
  // que já rodam na conta usam, e o antigo está a caminho da aposentadoria.
  if (input.instagramActorId) storySpec.instagram_user_id = input.instagramActorId;

  if (input.videoId) {
    storySpec.video_data = {
      video_id: input.videoId,
      ...(input.thumbnailUrl ? { image_url: input.thumbnailUrl } : {}),
      message: input.primaryText,
      // Headline vazia é omitida, não enviada em branco: 28 dos 41 anúncios
      // ativos da conta rodam sem headline, e mandar string vazia é diferente
      // de não mandar o campo.
      ...(input.headline ? { title: input.headline } : {}),
      ...(input.description ? { link_description: input.description } : {}),
      call_to_action: cta,
    };
  } else if (input.imageHash) {
    storySpec.link_data = {
      image_hash: input.imageHash,
      link: input.linkUrl,
      message: input.primaryText,
      name: input.headline,
      ...(input.description ? { description: input.description } : {}),
      call_to_action: cta,
    };
  } else {
    throw new MetaError("create_creative", "criativo sem vídeo nem imagem");
  }

  // OPT_OUT nas melhorias automáticas. Com OPT_IN o Advantage+ recorta, traduz
  // voz e chega a entregar a thumbnail no lugar do vídeo, que foi exatamente o
  // bug apurado pela auditoria de criativos. Um teste de copy também exige
  // criativo idêntico entre as variações, e melhoria automática quebra isso.
  //
  // `standard_enhancements` foi DESCONTINUADO (erro 3858504, "o recurso de
  // inclusão do campo de aprimoramentos padrão no criativo foi descontinuado.
  // Defina recursos individuais"), verificado em 30/08/2026 contra a API. O
  // desligamento agora é recurso a recurso.
  const dof = {
    creative_features_spec: {
      video_auto_crop: { enroll_status: "OPT_OUT" },
      image_touchups: { enroll_status: "OPT_OUT" },
      text_generation: { enroll_status: "OPT_OUT" },
    },
  };

  const json = await graph("create_creative", `${input.adAccountId}/adcreatives`, {
    method: "POST",
    body: form({
      name: input.name,
      object_story_spec: JSON.stringify(storySpec),
      degrees_of_freedom_spec: JSON.stringify(dof),
      url_tags: input.urlTags,
    }),
  });
  const id = json.id as string | undefined;
  if (!id) throw new MetaError("create_creative", "resposta sem id");
  return id;
}

export async function createAd(
  adAccountId: string,
  adsetId: string,
  name: string,
  creativeId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<string> {
  const json = await graph("create_ad", `${adAccountId}/ads`, {
    method: "POST",
    body: form({
      name,
      adset_id: adsetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status,
    }),
  });
  const id = json.id as string | undefined;
  if (!id) throw new MetaError("create_ad", "resposta sem id");
  return id;
}

/**
 * Clona um conjunto-modelo dentro da campanha indicada e renomeia o clone.
 *
 * É assim, e não montando um adset do zero, porque público, pixel, evento de
 * otimização, orçamento e estratégia de lance são decisões que a casa já tomou
 * no modelo. Recriar isso por parâmetro significaria eu adivinhar cada uma, e
 * um público errado só aparece depois de a verba ter sido gasta.
 *
 * `deep_copy: false` copia o conjunto sem arrastar os anúncios do modelo junto.
 */
export async function copyAdset(
  templateAdsetId: string,
  campaignId: string,
  newName: string,
): Promise<string> {
  const json = await graph("copiar_conjunto", `${templateAdsetId}/copies`, {
    method: "POST",
    body: form({
      campaign_id: campaignId,
      deep_copy: "false",
      status_option: "PAUSED",
    }),
  });
  // A resposta varia entre versões: ora `copied_adset_id`, ora `id`, ora a
  // lista `ad_object_ids`. Aceita as três em vez de apostar numa.
  const objs = json.ad_object_ids as Array<{ copied_id?: string }> | undefined;
  const newId = (json.copied_adset_id as string | undefined) ??
    (json.id as string | undefined) ??
    objs?.[0]?.copied_id;
  if (!newId) throw new MetaError("copiar_conjunto", json);

  await graph("renomear_conjunto", newId, { method: "POST", body: form({ name: newName }) });
  return newId;
}

/** Nomes dos conjuntos de uma campanha, para descobrir o próximo slot livre. */
export async function adsetNames(campaignId: string): Promise<string[]> {
  const json = await graph("nomes_conjuntos", `${campaignId}/adsets`, {
    query: { fields: "name", limit: "500" },
  });
  return ((json.data ?? []) as Array<{ name?: string }>).map((a) => a.name ?? "");
}

export async function setAdStatus(adId: string, status: "ACTIVE" | "PAUSED"): Promise<void> {
  await graph("set_ad_status", adId, { method: "POST", body: form({ status }) });
}

export async function setAdsetStatus(adsetId: string, status: "ACTIVE" | "PAUSED"): Promise<void> {
  await graph("set_adset_status", adsetId, { method: "POST", body: form({ status }) });
}

/**
 * Conjuntos de uma campanha, com orçamento e status.
 *
 * `daily_budget` vem em centavos e como string — é assim que o Meta devolve, e
 * converter aqui evita que cada chamador invente a própria conta.
 */
export interface AdsetInfo {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  daily_budget_cents: number;
  lifetime_budget_cents: number;
}

export async function adsetsDaCampanha(campaignId: string): Promise<AdsetInfo[]> {
  const json = await graph("adsets_da_campanha", `${campaignId}/adsets`, {
    query: { fields: "id,name,status,effective_status,daily_budget,lifetime_budget", limit: "200" },
  });
  const data = (json.data ?? []) as Array<Record<string, string>>;
  return data.map((a) => ({
    id: a.id,
    name: a.name ?? "",
    status: a.status ?? "",
    effective_status: a.effective_status ?? "",
    daily_budget_cents: Number(a.daily_budget ?? 0),
    lifetime_budget_cents: Number(a.lifetime_budget ?? 0),
  }));
}

/**
 * Troca o orçamento diário de um conjunto. Valor em centavos, como o Meta
 * espera — R$ 46,00 é 4600, e mandar 46 aqui cria um conjunto de 46 centavos
 * por dia que não entrega nada e ninguém percebe até o fim da semana.
 */
/**
 * Onde mora o orçamento de uma campanha.
 *
 * Existe orçamento no conjunto (ABO) e orçamento na campanha (CBO), e os dois
 * não convivem: quando a campanha tem CBO, o `daily_budget` do conjunto vira
 * um número morto que a API continua devolvendo. Mexer nele nesse caso não
 * muda nada, e o rebalance acharia que trabalhou. Por isso o plano lê a
 * campanha antes de decidir.
 */
/**
 * Moeda da conta de anúncios.
 *
 * A conta da casa é em USD, e o `daily_budget` do Meta vem em centavos da
 * moeda DA CONTA, não em reais. Sem isso, um orçamento de US$ 10/dia aparece
 * como "10" e todo mundo lê dez reais — e o teto de segurança do rebalance
 * estaria protegendo mil dólares achando que protege mil reais.
 */
export async function moedaDaConta(adAccountId: string): Promise<string> {
  const j = await graph("moeda_da_conta", adAccountId, { query: { fields: "currency" } });
  return String(j.currency ?? "");
}

export async function campanhaInfo(campaignId: string): Promise<{
  id: string; name: string; status: string;
  daily_budget_cents: number; lifetime_budget_cents: number;
  usa_cbo: boolean;
}> {
  const j = await graph("campanha_info", campaignId, {
    query: { fields: "id,name,status,daily_budget,lifetime_budget,budget_remaining" },
  });
  const daily = Number(j.daily_budget ?? 0);
  const lifetime = Number(j.lifetime_budget ?? 0);
  return {
    id: String(j.id ?? campaignId),
    name: String(j.name ?? ""),
    status: String(j.status ?? ""),
    daily_budget_cents: daily,
    lifetime_budget_cents: lifetime,
    usa_cbo: daily > 0 || lifetime > 0,
  };
}

export async function setAdsetDailyBudget(adsetId: string, centavos: number): Promise<void> {
  if (!Number.isFinite(centavos) || centavos < 100) {
    throw new MetaError("set_adset_budget", `orçamento inválido: ${centavos} centavos`);
  }
  await graph("set_adset_budget", adsetId, {
    method: "POST",
    body: form({ daily_budget: String(Math.round(centavos)) }),
  });
}

/** Um anúncio dentro de um conjunto, com o nome do conjunto junto. */
export interface AdInfo {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  adset_id: string;
  adset_name: string;
  /** Para onde o anúncio manda a pessoa. Vazio quando o criativo não expõe link. */
  destinos: string[];
  /** Etiquetas de URL do criativo — entram na query string depois do link. */
  url_tags: string;
  /** Em que campo do criativo o link foi achado, ou por que não foi. */
  origem_do_link: string;
}

/**
 * Tira do criativo a URL para onde o anúncio manda a pessoa.
 *
 * O Meta guarda esse link em quatro lugares diferentes conforme o formato do
 * anúncio, e nenhum deles vem na listagem de anúncios por padrão. Sem ler os
 * quatro, anúncio apontando para a página errada passa despercebido: o painel
 * só enxerga a variante que o site recebeu, nunca a que o anúncio pediu.
 */
function linksDoCriativo(creative: Record<string, unknown>): { links: string[]; origem: string } {
  const spec = (creative.object_story_spec ?? {}) as Record<string, unknown>;

  const linkData = (spec.link_data ?? {}) as Record<string, unknown>;
  if (typeof linkData.link === "string" && linkData.link) {
    return { links: [linkData.link], origem: "link_data" };
  }

  const videoData = (spec.video_data ?? {}) as Record<string, unknown>;
  const cta = (videoData.call_to_action ?? {}) as Record<string, unknown>;
  const valorCta = (cta.value ?? {}) as Record<string, unknown>;
  if (typeof valorCta.link === "string" && valorCta.link) {
    return { links: [valorCta.link], origem: "video_data" };
  }

  const templateData = (spec.template_data ?? {}) as Record<string, unknown>;
  if (typeof templateData.link === "string" && templateData.link) {
    return { links: [templateData.link], origem: "template_data" };
  }

  // Anúncio dinâmico: o Meta testa vários destinos dentro do mesmo anúncio.
  // Aqui um único link não descreve o anúncio, por isso a lista inteira volta.
  const feed = (creative.asset_feed_spec ?? {}) as Record<string, unknown>;
  const doFeed = ((feed.link_urls ?? []) as Array<Record<string, unknown>>)
    .map((u) => String(u.website_url ?? ""))
    .filter((u) => u.length > 0);
  if (doFeed.length) return { links: doFeed, origem: "asset_feed_spec" };

  if (typeof creative.template_url === "string" && creative.template_url) {
    return { links: [creative.template_url], origem: "template_url" };
  }

  // Anúncio criado a partir de um post que já existia: o link mora no post e a
  // API do criativo não devolve. Dizer isso é melhor que devolver vazio, que se
  // confunde com "não tem destino".
  const post = creative.effective_object_story_id;
  if (post) return { links: [], origem: `post existente ${String(post)}` };

  return { links: [], origem: "criativo sem link legível" };
}

/**
 * Todos os anúncios de uma campanha.
 *
 * O teste de copy de página roda o mesmo criativo em vários conjuntos, então
 * decidir "corta o criativo X" é uma operação sobre a campanha inteira, não
 * sobre um anúncio. Isto lista o que existe para essa decisão ser tomada com
 * a lista na mão.
 */
export async function anunciosDaCampanha(campaignId: string): Promise<AdInfo[]> {
  const json = await graph("anuncios_da_campanha", `${campaignId}/ads`, {
    query: {
      fields:
        "id,name,status,effective_status,adset{id,name}," +
        "creative{object_story_spec,asset_feed_spec,url_tags,template_url,effective_object_story_id}",
      limit: "500",
    },
  });
  const data = (json.data ?? []) as Array<Record<string, unknown>>;
  return data.map((a) => {
    const adset = (a.adset ?? {}) as Record<string, string>;
    const creative = (a.creative ?? {}) as Record<string, unknown>;
    const { links, origem } = linksDoCriativo(creative);
    return {
      id: String(a.id ?? ""),
      name: String(a.name ?? ""),
      status: String(a.status ?? ""),
      effective_status: String(a.effective_status ?? ""),
      adset_id: String(adset.id ?? ""),
      adset_name: String(adset.name ?? ""),
      destinos: links,
      url_tags: String(creative.url_tags ?? ""),
      origem_do_link: origem,
    };
  });
}

/**
 * Insights crus de um anúncio num dia, sem filtro nenhum.
 *
 * Serve para conferir o que o Meta realmente devolve quando um número do
 * painel não fecha com a venda registrada. Sem isto, a alternativa é adivinhar
 * qual `action_type` está inflando o valor.
 */
export async function insightsCrus(adId: string, dia: string): Promise<unknown> {
  const json = await graph("insights_crus", `${adId}/insights`, {
    query: {
      fields: "ad_name,spend,actions,action_values,purchase_roas,website_purchase_roas",
      time_range: JSON.stringify({ since: dia, until: dia }),
    },
  });
  return json.data ?? [];
}

/** Confere se o token realmente escreve na conta antes de gastar upload à toa. */
export async function checkAccount(adAccountId: string): Promise<{ name: string; status: number }> {
  const json = await graph("check_account", adAccountId, {
    query: { fields: "name,account_status,user_tasks" },
  });
  const tasks = (json.user_tasks ?? []) as string[];
  if (tasks.length && !tasks.includes("MANAGE") && !tasks.includes("ADVERTISE")) {
    throw new MetaError(
      "check_account",
      `token sem permissão de escrita em ${adAccountId} (tasks: ${tasks.join(",")})`,
    );
  }
  return { name: json.name as string, status: json.account_status as number };
}

/** Lista as BMs, contas e páginas que o token enxerga. Usado no setup, não no dia a dia. */
export async function listBusinesses(): Promise<unknown> {
  const me = await graph("list_bm", "me/businesses", { query: { fields: "id,name", limit: "200" } });
  const businesses = (me.data ?? []) as Array<{ id: string; name: string }>;
  const out: unknown[] = [];
  for (const bm of businesses) {
    const fields = "id,account_id,name,currency,account_status";
    const empty = { data: [] as unknown[] };
    const [owned, client, pages] = await Promise.all([
      graph("list_acc", `${bm.id}/owned_ad_accounts`, { query: { fields, limit: "200" } }).catch(() => empty),
      graph("list_acc", `${bm.id}/client_ad_accounts`, { query: { fields, limit: "200" } }).catch(() => empty),
      graph("list_pages", `${bm.id}/owned_pages`, { query: { fields: "id,name", limit: "200" } }).catch(() => empty),
    ]);
    const seen = new Set<string>();
    const accounts = [
      ...((owned.data ?? []) as Array<{ id?: string }>),
      ...((client.data ?? []) as Array<{ id?: string }>),
    ].filter((a) => {
      if (!a?.id || seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
    out.push({ businessId: bm.id, businessName: bm.name, accounts, pages: pages.data ?? [] });
  }
  return out;
}

/** Imagens já na biblioteca da conta, com quem as carregou. */
export async function listAdImages(adAccountId: string, limit = 5): Promise<unknown> {
  const json = await graph("listar_imagens", `${adAccountId}/adimages`, {
    query: { fields: "hash,name,created_time,original_width,original_height", limit: String(limit) },
  });
  return json.data ?? [];
}

/** Apaga um creative criado por engano ou por diagnóstico. */
export async function deleteCreative(creativeId: string): Promise<void> {
  await graph("apagar_creative", creativeId, { method: "DELETE", body: form({}) });
}

/** Conjuntos de uma conta, para preencher o default_adset_id da config. */
export async function listAdsets(adAccountId: string): Promise<unknown> {
  const json = await graph("list_adsets", `${adAccountId}/adsets`, {
    query: {
      fields: "id,name,status,campaign{id,name,objective}",
      limit: "200",
      effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
    },
  });
  return json.data ?? [];
}

// ── Duplicar campanha como VENDAS ──────────────────────────────────────────
//
// O "Duplicar" do Gerenciador não troca o objetivo: uma campanha de Leads
// duplicada continua Leads. Para ter a MESMA campanha (conjuntos, lance,
// segmentação, criativos) rodando com objetivo Vendas, é preciso criar a
// campanha nova e recriar conjunto a conjunto, anúncio a anúncio, reusando
// os creative_id — dentro da mesma conta o criativo atravessa, e assim o
// histórico social do post (curtidas, comentários) vem junto.
//
// A configuração de conversão (evento, pixel, destino "site e ligações") não
// se inventa: é lida de uma campanha-modelo que já roda com objetivo Vendas.

const CAMP_CAMPOS =
  "id,name,account_id,objective,buying_type,bid_strategy,daily_budget,lifetime_budget,special_ad_categories,status,effective_status,spend_cap";
const ADSET_CAMPOS =
  "id,name,status,effective_status,daily_budget,lifetime_budget,bid_amount,bid_strategy,targeting,start_time,end_time,attribution_spec,optimization_goal,billing_event,promoted_object,destination_type,is_dynamic_creative,pacing_type,dsa_beneficiary,dsa_payor";
const AD_CAMPOS =
  "id,name,status,effective_status,adset_id,conversion_domain,creative{id,name,object_story_id,effective_object_story_id,object_story_spec,asset_feed_spec,url_tags,call_to_action_type,degrees_of_freedom_spec}";

type Obj = Record<string, unknown>;

async function graphTodos(step: string, path: string, fields: string): Promise<Obj[]> {
  const out: Obj[] = [];
  let after: string | undefined;
  for (let i = 0; i < 50; i++) {
    const json = await graph(step, path, { query: { fields, limit: "200", ...(after ? { after } : {}) } });
    out.push(...((json.data as Obj[]) ?? []));
    after = (json.paging as { cursors?: { after?: string }; next?: string } | undefined)?.next
      ? (json.paging as { cursors: { after: string } }).cursors.after
      : undefined;
    if (!after) break;
  }
  return out;
}

/**
 * Só as chaves com valor: o Graph rejeita `null` em vários campos.
 * O token vai no corpo, porque `graph()` só o põe na URL quando não há corpo —
 * sem isso o POST chega anônimo e a Meta responde "Unsupported post request".
 */
function semNulos(o: Obj): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  p.set("access_token", writeToken());
  return p;
}

export interface DuplicarVendasInput {
  adAccountId: string;
  origemCampaignId: string;
  /** id OU nome exato da campanha cuja config de conversão será copiada */
  modelo: string;
  nomeNovo: string;
  executar: boolean;
  /** Campanha já criada numa tentativa anterior: reaproveita e só cria o que falta. */
  campanhaExistente?: string;
  /** Telefone do destino "site e ligações", ex. +5535916527 23. Sem ele, usa o do modelo. */
  telefone?: string;
}

/**
 * Criativo da origem com o telefone do destino "site e ligações".
 *
 * Um conjunto com esse destino exige que o criativo carregue o telefone, e o
 * criativo de uma campanha de Leads não carrega. Reusar o creative_id falha
 * com "Número de telefone inválido". Lido do modelo em 25/09/2026: o telefone
 * mora em `asset_feed_spec.call_ads_configuration`, não no call_to_action.
 * Então nasce um criativo novo: o post, o link, as url_tags e as
 * otimizações desligadas continuam os da origem; só entra a configuração de
 * ligação, com o número informado (ou o do modelo, se nenhum for passado).
 */
async function criarCriativoComTelefone(
  conta: string,
  origem: Obj,
  modelo: Obj,
  telefone: string | undefined,
): Promise<{ id: string; variante: string; link?: string }> {
  const cfgModelo = ((modelo.asset_feed_spec as Obj | undefined)?.call_ads_configuration ?? {}) as Obj;
  const numero = telefone ? `tel:${telefone.replace(/[^\d+]/g, "")}` : cfgModelo.phone_number;
  const asset_feed_spec = {
    call_ads_configuration: {
      call_destination_type: cfgModelo.call_destination_type ?? "WEBSITE_AND_CALL",
      phone_number: numero,
    },
  };
  const postId = String(origem.object_story_id ?? origem.effective_object_story_id ?? "");
  const mss = (modelo.object_story_spec ?? {}) as Obj;
  const linkModelo = ((mss.video_data as Obj | undefined)?.call_to_action as Obj | undefined)?.value as Obj | undefined;

  // Variantes em ordem de fidelidade. A 1ª mantém o post original (curtidas e
  // comentários vêm junto); a 2ª recria o post a partir do vídeo, como o
  // modelo foi feito, e perde o social do post antigo. Registra qual passou.
  const variantes: Array<[string, () => Promise<Obj>]> = [
    // Sempre pelo post que já existe (effective_object_story_id), mesmo quando
    // o criativo tem object_story_spec: recriar o post falha porque o app do
    // token está em modo de desenvolvimento ("deve estar em modo público").
    ["post_existente", async () => {
      if (!postId) throw new Error("criativo sem post existente");
      return { name: origem.name, url_tags: origem.url_tags, object_story_id: postId, asset_feed_spec };
    }],
    ["object_story_spec", async () => {
      if (!origem.object_story_spec) throw new Error("criativo sem object_story_spec");
      // A leitura devolve image_url E image_hash; a criação aceita só um
      // ("ObjectStorySpecRedundant"). Fica o hash, que é o estável.
      const oss = JSON.parse(JSON.stringify(origem.object_story_spec)) as Obj;
      for (const k of ["video_data", "link_data"]) {
        const d = oss[k] as Obj | undefined;
        if (d?.image_hash) { delete d.image_url; delete d.picture; }
      }
      return { name: origem.name, url_tags: origem.url_tags, object_story_spec: oss, asset_feed_spec };
    }],
    ["reconstruido_do_post", async () => {
      const post = await graph("post", postId, {
        query: { fields: "message,attachments{type,media_type,target,url,unshimmed_url,title,description,media}" },
      });
      const att = ((post.attachments as { data?: Obj[] } | undefined)?.data ?? [])[0] ?? {};
      const target = (att.target ?? {}) as Obj;
      let link = String(att.unshimmed_url ?? att.url ?? "");
      try {
        const u = new URL(link);
        if (/facebook\.com$/.test(u.hostname) && u.searchParams.get("u")) link = u.searchParams.get("u")!;
      } catch { /* sem link legível */ }
      if (!link || /facebook\.com|instagram\.com/.test(link)) link = String(linkModelo?.link ?? "");
      const cta = { type: String(origem.call_to_action_type ?? "LEARN_MORE"), value: { link } };
      const spec: Obj = { page_id: mss.page_id, instagram_user_id: mss.instagram_user_id };
      const ehVideo = /video/i.test(String(att.media_type ?? att.type ?? ""));
      if (ehVideo) {
        spec.video_data = { video_id: target.id, message: post.message, call_to_action: cta };
      } else {
        const foto = ((att.media as Obj | undefined)?.image as Obj | undefined)?.src;
        spec.link_data = { link, message: post.message, call_to_action: cta, ...(foto ? { picture: foto } : {}) };
      }
      return { name: origem.name, url_tags: origem.url_tags, degrees_of_freedom_spec: origem.degrees_of_freedom_spec, object_story_spec: spec, asset_feed_spec, _link: link };
    }],
  ];

  const erros: string[] = [];
  for (const [nome, monta] of variantes) {
    try {
      const corpo = await monta();
      const link = corpo._link as string | undefined;
      delete corpo._link;
      const r = await graph(`criar_criativo:${nome}`, `${conta}/adcreatives`, { method: "POST", body: semNulos(corpo) });
      return { id: String(r.id), variante: nome, link };
    } catch (e) {
      erros.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new MetaError("criar_criativo", erros.join(" || "));
}

const erroDeTelefone = (e: unknown) => /2061044|telefone|phone/i.test(e instanceof Error ? e.message : String(e));

export async function duplicarComoVendas(input: DuplicarVendasInput): Promise<Obj> {
  const origem = await graph("origem", input.origemCampaignId, { query: { fields: CAMP_CAMPOS } });
  const conta = input.adAccountId || `act_${origem.account_id}`;

  let modeloId = input.modelo;
  if (!/^\d+$/.test(modeloId)) {
    const campanhas = await graphTodos("campanhas", `${conta}/campaigns`, "id,name,objective");
    const achada = campanhas.find((c) => String(c.name).trim() === input.modelo.trim());
    if (!achada) {
      throw new MetaError("modelo", `campanha-modelo "${input.modelo}" não encontrada. Nomes: ${campanhas.map((c) => c.name).join(" | ")}`);
    }
    modeloId = String(achada.id);
  }
  const modelo = await graph("modelo", modeloId, { query: { fields: CAMP_CAMPOS } });
  const modeloAdsets = await graphTodos("modelo_adsets", `${modeloId}/adsets`, ADSET_CAMPOS);
  const ref = modeloAdsets.find((a) => a.effective_status === "ACTIVE") ?? modeloAdsets[0];
  if (!ref) throw new MetaError("modelo", "campanha-modelo sem conjuntos");
  const conversao = {
    optimization_goal: ref.optimization_goal,
    billing_event: ref.billing_event,
    promoted_object: ref.promoted_object,
    destination_type: ref.destination_type,
  };

  const vivo = (x: Obj) => !["DELETED", "ARCHIVED"].includes(String(x.effective_status));
  const adsets = (await graphTodos("adsets", `${input.origemCampaignId}/adsets`, ADSET_CAMPOS)).filter(vivo);
  const ads = (await graphTodos("ads", `${input.origemCampaignId}/ads`, AD_CAMPOS)).filter(vivo);
  const adsModelo = (await graphTodos("modelo_ads", `${ref.id}/ads`, AD_CAMPOS)).filter(vivo);
  const criativoModelo = (adsModelo[0]?.creative ?? {}) as Obj;

  const plano = {
    origem: { id: origem.id, name: origem.name, objective: origem.objective, bid_strategy: origem.bid_strategy, daily_budget: origem.daily_budget },
    modelo: { id: modelo.id, name: modelo.name, objective: modelo.objective, conjunto_ref: ref.name },
    conversao,
    criativo_modelo: criativoModelo,
    criativo_origem_exemplo: ads[0]?.creative,
    conjuntos: adsets.map((a) => ({
      id: a.id, name: a.name, status: a.status, bid_amount: a.bid_amount, bid_strategy: a.bid_strategy,
      daily_budget: a.daily_budget, anuncios: ads.filter((x) => x.adset_id === a.id).length,
    })),
    total_anuncios: ads.length,
  };
  if (!input.executar) return { ok: true, executado: false, plano };

  const criados: { campaign?: string; adsets: string[]; ads: string[]; criativos: string[]; reaproveitados: string[] } =
    { adsets: [], ads: [], criativos: [], reaproveitados: [] };
  try {
    let campId = input.campanhaExistente ?? "";
    if (!campId) {
      const temVerbaNaCampanha = !!(origem.daily_budget || origem.lifetime_budget);
      const camp = await graph("criar_campanha", `${conta}/campaigns`, {
        method: "POST",
        body: semNulos({
          name: input.nomeNovo,
          objective: "OUTCOME_SALES",
          buying_type: origem.buying_type ?? "AUCTION",
          special_ad_categories: origem.special_ad_categories ?? [],
          status: "PAUSED",
          daily_budget: origem.daily_budget,
          lifetime_budget: origem.lifetime_budget,
          bid_strategy: temVerbaNaCampanha ? origem.bid_strategy : undefined,
          spend_cap: origem.spend_cap,
        }),
      });
      campId = String(camp.id);
    }
    criados.campaign = campId;

    // O que uma tentativa anterior já deixou na campanha, para não duplicar.
    const jaConjuntos = input.campanhaExistente
      ? (await graphTodos("conjuntos_existentes", `${campId}/adsets`, "id,name,effective_status")).filter(vivo)
      : [];
    const jaAds = input.campanhaExistente
      ? (await graphTodos("anuncios_existentes", `${campId}/ads`, "id,name,adset_id,effective_status")).filter(vivo)
      : [];

    for (const a of adsets) {
      const existente = jaConjuntos.find((x) => x.name === a.name);
      let novoId: string;
      if (existente) {
        novoId = String(existente.id);
        criados.reaproveitados.push(novoId);
      } else {
        const inicio = a.start_time && new Date(String(a.start_time)) > new Date() ? a.start_time : undefined;
        const novo = await graph("criar_conjunto", `${conta}/adsets`, {
          method: "POST",
          body: semNulos({
            name: a.name,
            campaign_id: campId,
            status: a.status,
            daily_budget: a.daily_budget,
            lifetime_budget: a.lifetime_budget,
            bid_amount: a.bid_amount,
            bid_strategy: a.bid_strategy,
            targeting: a.targeting,
            start_time: inicio,
            end_time: a.end_time,
            attribution_spec: a.attribution_spec,
            is_dynamic_creative: a.is_dynamic_creative,
            pacing_type: a.pacing_type,
            dsa_beneficiary: a.dsa_beneficiary,
            dsa_payor: a.dsa_payor,
            ...conversao,
          }),
        });
        novoId = String(novo.id);
        criados.adsets.push(novoId);
      }

      for (const ad of ads.filter((x) => x.adset_id === a.id)) {
        if (jaAds.some((x) => x.adset_id === novoId && x.name === ad.name)) continue;
        const criativo = ad.creative as Obj;
        const criarAd = (creative: Obj) =>
          graph("criar_anuncio", `${conta}/ads`, {
            method: "POST",
            body: semNulos({
              name: ad.name,
              adset_id: novoId,
              status: ad.status,
              creative,
              conversion_domain: ad.conversion_domain,
            }),
          });
        let novoAd: Obj;
        try {
          novoAd = await criarAd({ creative_id: criativo.id });
        } catch (e) {
          if (!erroDeTelefone(e)) throw e;
          const novoCriativo = await criarCriativoComTelefone(conta, criativo, criativoModelo, input.telefone);
          criados.criativos.push(`${novoCriativo.id} (${novoCriativo.variante}${novoCriativo.link ? " → " + novoCriativo.link : ""})`);
          novoAd = await criarAd({ creative_id: novoCriativo.id });
        }
        criados.ads.push(String(novoAd.id));
      }
    }
    return { ok: true, executado: true, plano, criados };
  } catch (e) {
    // Devolve o que já nasceu: sem isso, uma falha no meio deixa lixo na conta
    // sem ninguém saber o id para apagar.
    return { ok: false, executado: true, erro: e instanceof Error ? e.message : String(e), criados, plano };
  }
}
