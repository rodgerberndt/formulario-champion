// Cliente da Marketing API para o que o Hermes precisa: subir mídia, montar o
// creative e criar o anúncio. Só escrita — a leitura de performance continua no
// meta-ads-cron.

const API_VERSION = (Deno.env.get("META_API_VERSION") || "v21.0").toLowerCase();
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

// Token de escrita separado do de leitura: `ads_management` é um escopo bem mais
// perigoso que o `ads_read` usado hoje, então quem só lê continua com o antigo.
export function writeToken(): string {
  const t = Deno.env.get("META_MARKETING_TOKEN") || Deno.env.get("META_ACCESS_TOKEN");
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
      title: input.headline,
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
  const dof = {
    creative_features_spec: {
      standard_enhancements: { enroll_status: "OPT_OUT" },
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

export async function setAdStatus(adId: string, status: "ACTIVE" | "PAUSED"): Promise<void> {
  await graph("set_ad_status", adId, { method: "POST", body: form({ status }) });
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
