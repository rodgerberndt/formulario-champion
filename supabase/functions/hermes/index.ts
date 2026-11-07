/**
 * HERMES — o agente de tráfego.
 *
 * Vigia o bucket `hermes-criativos`, e para cada arquivo novo: escreve as
 * variações de copy, sobe a mídia no Meta, cria um anúncio por variação dentro
 * do conjunto de destino e avisa no WhatsApp. Os anúncios nascem PAUSADOS até
 * alguém aprovar, a não ser que a config diga o contrário.
 *
 * Ações (query `?action=`):
 *   run      processa a fila (é o que o cron chama)
 *   ingest   só varre o bucket e registra os arquivos novos
 *   status   fila + últimas execuções
 *   approve  ativa os anúncios de um criativo (ou de uma variação só)
 *   reject   descarta as variações e deixa os anúncios pausados
 *   setup    lista BMs, contas, páginas e conjuntos que o token enxerga
 *   destinos para onde cada anúncio de uma campanha manda a pessoa
 *   config   grava a config de uma conta (POST)
 *
 * Auth: header `x-hermes-key` (secret HERMES_KEY) ou `x-admin-token` (JWT do painel).
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";
import {
  deleteCreative,
  listAdImages,
  adsetNames,
  adsetsDaCampanha,
  anunciosDaCampanha,
  campanhaInfo,
  insightsCrus,
  checkAccount,
  moedaDaConta,
  copyAdset,
  createAd,
  createAdCreative,
  listAdsets,
  listBusinesses,
  setAdsetDailyBudget,
  setAdsetStatus,
  setAdStatus,
  uploadImage,
  uploadVideo,
  videoThumbnail,
  waitVideoReady,
  duplicarComoVendas,
} from "./meta.ts";
import { generateCopies, parseManualCopies, referenceAds } from "./copy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token, x-hermes-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * Só o caminho da URL, minúsculo e sem barra final.
 *
 * É o caminho que identifica a variante de página; a query string carrega as
 * etiquetas de campanha e muda a cada anúncio, então comparar a URL inteira
 * acusaria diferença em todo lugar e não serviria de alarme para nada.
 */
function caminhoDaUrl(u: string): string {
  try {
    return (new URL(u).pathname.replace(/\/+$/, "") || "/").toLowerCase();
  } catch {
    return (u.replace(/\/+$/, "") || "/").toLowerCase();
  }
}

const BUCKET = "hermes-criativos";
const VIDEO_EXT = ["mp4", "mov", "m4v", "webm"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];

// Um criativo por invocação. Cada um custa upload de vídeo, transcodificação e
// uma chamada ao Claude; empilhar dois estoura o teto de tempo da edge function
// e o trabalho já feito no primeiro se perde.
const MAX_PER_RUN = 1;
const MAX_ATTEMPTS = 3;

// ── Travas do rebalance ──────────────────────────────────────────────────────
//
// Redistribuir verba é a única coisa que o Hermes faz que mexe em dinheiro já
// rodando. As regras abaixo existem para que um erro de digitação ou uma
// resposta estranha do Meta não consigam parar a operação inteira nem estourar
// o gasto. Elas são checadas SEMPRE, inclusive no plano, e qualquer uma que
// falhe aborta a chamada sem tocar em nada.

/** Nunca deixar a campanha com menos que isso rodando. */
const REBALANCE_MIN_ATIVOS = 2;
/** Nunca pausar mais que esta fração dos conjuntos ativos de uma vez. */
const REBALANCE_MAX_FRACAO_PAUSADA = 0.6;
/** Nunca multiplicar o orçamento de um conjunto além disso numa só operação. */
const REBALANCE_MAX_FATOR = 3;
/** Teto absoluto por conjunto, em centavos. R$ 1.000/dia. */
const REBALANCE_TETO_DIARIO_CENTAVOS = 100_000;

type Json = Record<string, unknown>;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function isAuthorized(req: Request): Promise<boolean> {
  const key = Deno.env.get("HERMES_KEY");
  if (key && req.headers.get("x-hermes-key") === key) return true;

  // Segunda chave, para operar sem ter a primeira em mãos.
  //
  // A HERMES_KEY não é recuperável: o painel do Supabase mostra só o SHA256 do
  // secret. E trocá-la quebraria o cron `hermes-run`, que carrega a chave
  // dentro do header do próprio `cron.schedule`. Então em vez de girar a chave
  // existente, o Hermes aceita uma segunda, criada para um operador específico
  // e removível sozinha (`supabase secrets unset HERMES_KEY_ALT`) sem mexer em
  // nada do que já roda.
  const alt = Deno.env.get("HERMES_KEY_ALT");
  if (alt && req.headers.get("x-hermes-key") === alt) return true;

  const adminToken = req.headers.get("x-admin-token");
  if (!adminToken) return false;
  try {
    const secret = Deno.env.get("ADMIN_JWT_SECRET");
    if (!secret) return false;
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    const payload = await verify(adminToken, cryptoKey);
    return (payload as { role?: string }).role === "admin";
  } catch {
    return false;
  }
}

/**
 * Token de ação por criativo, para o link de aprovação caber numa mensagem de
 * WhatsApp sem carregar a HERMES_KEY junto. Assina só aquele id e aquela ação:
 * quem intercepta a mensagem aprova aquele criativo, e nada além dele.
 */
async function actionToken(action: string, creativeId: string): Promise<string> {
  const secret = Deno.env.get("HERMES_KEY");
  if (!secret) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${action}:${creativeId}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function tokenMatches(req: Request, url: URL): Promise<boolean> {
  const t = url.searchParams.get("t");
  const creativeId = url.searchParams.get("creative_id");
  const action = url.searchParams.get("action");
  if (!t || !creativeId || !action) return false;
  const expected = await actionToken(action, creativeId);
  // Comparação de tamanho fixo: o token tem sempre 32 caracteres.
  return expected.length === 32 && t.length === 32 && expected === t;
}

function slugify(raw: string): string {
  return raw
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/**
 * Ângulo a partir do nome do arquivo. A convenção combinada com o time é
 * `angulo__resto-do-nome.mp4`; sem o separador, o nome inteiro vira o ângulo,
 * que já é melhor do que nada para orientar a copy.
 */
function angleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  const head = base.includes("__") ? base.split("__")[0] : base;
  return head.replace(/[-_]+/g, " ").trim();
}

function mediaType(fileName: string): "video" | "image" | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (IMAGE_EXT.includes(ext)) return "image";
  return null;
}

async function log(
  supabase: SupabaseClient,
  creativeId: string | null,
  step: string,
  ok: boolean,
  detail?: string,
) {
  console.log(`[hermes] ${step} ${ok ? "ok" : "FALHOU"}${detail ? `: ${detail}` : ""}`);
  await supabase.from("hermes_runs").insert({
    creative_id: creativeId,
    step,
    ok,
    detail: detail?.slice(0, 2000) ?? null,
  });
}

async function notify(text: string): Promise<void> {
  const url = Deno.env.get("WAHA_API_URL");
  const to = Deno.env.get("HERMES_NOTIFY_PHONE");
  if (!url || !to) return;
  const phone = to.replace(/\D/g, "");
  try {
    await fetch(`${url.replace(/\/$/, "")}/api/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session: Deno.env.get("WAHA_PHONE_NUMBER_ID") || "default",
        chatId: `${phone}@c.us`,
        text,
      }),
    });
  } catch (e) {
    console.error("[hermes] notificação falhou:", e);
  }
}

// ---------------------------------------------------------------- ingest

/** Registra os arquivos do bucket que ainda não estão na fila. */
async function ingest(supabase: SupabaseClient): Promise<{ novos: number; ignorados: number }> {
  const { data: files, error } = await supabase.storage.from(BUCKET).list("", {
    limit: 200,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (error) throw new Error(`storage.list: ${error.message}`);

  const { data: known } = await supabase.from("hermes_creatives").select("storage_path");
  const seen = new Set((known ?? []).map((r: { storage_path: string }) => r.storage_path));

  // Briefings viajam como .txt de mesmo nome ao lado da mídia.
  const briefings = new Map<string, string>();
  for (const f of files ?? []) {
    if (f.name.toLowerCase().endsWith(".txt")) {
      const dl = await supabase.storage.from(BUCKET).download(f.name);
      if (dl.data) briefings.set(f.name.replace(/\.txt$/i, ""), (await dl.data.text()).slice(0, 4000));
    }
  }

  const { data: configs } = await supabase
    .from("hermes_config").select("id").eq("active", true).limit(1);
  const configId = configs?.[0]?.id ?? null;

  let novos = 0;
  let ignorados = 0;
  for (const f of files ?? []) {
    if (seen.has(f.name)) continue;
    const type = mediaType(f.name);
    if (!type) {
      ignorados++;
      continue;
    }
    const { error: insErr } = await supabase.from("hermes_creatives").insert({
      storage_path: f.name,
      file_name: f.name,
      media_type: type,
      angle: angleFromFileName(f.name),
      briefing: briefings.get(f.name.replace(/\.[^.]+$/, "")) ?? null,
      config_id: configId,
    });
    if (!insErr) novos++;
  }
  return { novos, ignorados };
}

// ---------------------------------------------------------------- processamento

interface Config {
  id: string;
  ad_account_id: string;
  page_id: string;
  instagram_actor_id: string | null;
  adset_mode: "fixo" | "duplicar";
  default_adset_id: string | null;
  default_campaign_id: string | null;
  template_adset_id: string | null;
  adset_name_pattern: string;
  link_url: string;
  cta_type: string;
  copies_per_creative: number;
  auto_activate: boolean;
}

/**
 * Próximo número livre do padrão de nome dentro da campanha. Se já existem
 * HD1 a HD4, o próximo criativo começa no HD5, sem colidir com o que roda.
 */
function nextSlot(existentes: string[], pattern: string): number {
  // Escapa o padrão inteiro antes de abrir o buraco do número, senão um
  // padrão com parêntese ou ponto vira metacaractere de regex sem querer.
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped.replace("\\{n\\}", "(\\d+)")}$`, "i");
  let max = 0;
  for (const nome of existentes) {
    const m = nome.trim().match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

async function processOne(supabase: SupabaseClient, creative: Json, config: Config): Promise<void> {
  const id = creative.id as string;
  const fileName = creative.file_name as string;
  const adAccountId = config.ad_account_id;
  // Só usado no modo 'fixo'; no 'duplicar' cada variação ganha o conjunto dela.
  const adsetId = (creative.adset_id as string | null) ?? config.default_adset_id ?? "";

  await supabase.from("hermes_creatives")
    .update({ status: "processando", attempts: (creative.attempts as number) + 1, updated_at: new Date().toISOString() })
    .eq("id", id);

  // 1. Mídia no Meta. Se já subiu numa tentativa anterior, reaproveita: upload
  // de vídeo é caro e o Meta cobra a transcodificação de novo a cada envio.
  let videoId = creative.meta_video_id as string | null;
  let imageHash = creative.meta_image_hash as string | null;
  let thumbnailUrl = creative.thumbnail_url as string | undefined;

  if (!videoId && !imageHash) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET).createSignedUrl(creative.storage_path as string, 3600);
    if (signErr || !signed?.signedUrl) throw new Error(`signed url: ${signErr?.message}`);

    if (creative.media_type === "video") {
      videoId = await uploadVideo(adAccountId, signed.signedUrl, fileName);
      await supabase.from("hermes_creatives").update({ meta_video_id: videoId }).eq("id", id);
      await log(supabase, id, "upload_video", true, videoId);
    } else {
      const res = await fetch(signed.signedUrl);
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) {
        bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      }
      imageHash = await uploadImage(adAccountId, btoa(bin), fileName);
      await supabase.from("hermes_creatives").update({ meta_image_hash: imageHash }).eq("id", id);
      await log(supabase, id, "upload_image", true, imageHash);
    }
  }

  if (videoId && !thumbnailUrl) {
    // Espera curta de propósito: se a transcodificação demorar mais que isso, o
    // criativo volta para a fila com o video_id salvo e o próximo tick continua
    // daqui, em vez de a edge function ser morta no meio do trabalho.
    await waitVideoReady(videoId, 90_000);
    thumbnailUrl = await videoThumbnail(videoId);
    await supabase.from("hermes_creatives").update({ thumbnail_url: thumbnailUrl ?? null }).eq("id", id);
    await log(supabase, id, "video_pronto", true, thumbnailUrl ? "com thumbnail" : "sem thumbnail");
  }

  // 2. Copy. Só gera o que ainda falta, para uma retentativa não pagar de novo.
  const { data: existing } = await supabase
    .from("hermes_copies").select("*").eq("creative_id", id).order("variant");
  let copies = existing ?? [];

  if (copies.length === 0) {
    // Copy escrita à mão no .txt tem precedência: se alguém já decidiu o que
    // dizer, não há por que um modelo reescrever nem por que exigir chave.
    const briefing = creative.briefing as string | null;
    const manuais = parseManualCopies(briefing);
    let variants;
    if (manuais) {
      variants = manuais;
      await log(supabase, id, "copy_manual", true, `${manuais.length} variações lidas do .txt`);
    } else {
      const refs = await referenceAds(supabase, adAccountId);
      variants = await generateCopies({
        count: config.copies_per_creative,
        angle: creative.angle as string | null,
        briefing,
        fileName,
        references: refs,
      });
    }
    if (!variants.length) throw new Error("nenhuma variação de copy utilizável");

    // O pedaço do id entra no slug porque dois criativos do mesmo ângulo
    // gerariam o mesmo utm_content, e aí o funil somaria os dois como se
    // fossem um anúncio só.
    const angleSlug = slugify((creative.angle as string) || fileName) || "criativo";
    const rows = variants.map((v, i) => {
      const utm = `hermes-${angleSlug}-${id.slice(0, 4)}-v${i + 1}`;
      return {
        creative_id: id,
        variant: i + 1,
        primary_text: v.primary_text,
        headline: v.headline,
        description: v.description,
        angle_used: v.angle_used,
        rationale: v.rationale,
        // O nome carrega o utm_content porque é dele que o meta-ads-cron deriva
        // a creative_key. Sem isso o anúncio some do funil de CPMQL.
        ad_name: `HERMES | ${creative.angle ?? fileName} | v${i + 1} | utm_content=${utm}`,
      };
    });
    const { data: inserted, error: copyErr } = await supabase
      .from("hermes_copies").insert(rows).select();
    if (copyErr) throw new Error(`gravar copies: ${copyErr.message}`);
    copies = inserted ?? [];
    await log(supabase, id, "copy_gerada", true, `${copies.length} variações`);
  }

  // 3. Um anúncio por variação, para que cada copy tenha CPMQL próprio.
  const status = config.auto_activate ? "ACTIVE" : "PAUSED";
  const duplicando = config.adset_mode === "duplicar";
  const noAr: Array<{ variant: number; headline: string; adset?: string }> = [];
  let criados = 0;

  // No modo duplicar a headline é a variável do conjunto, então cada variação
  // precisa saber qual número de slot é o dela antes de sair criando conjunto.
  let slot = 0;
  if (duplicando && copies.some((c: Json) => !c.meta_adset_id)) {
    slot = nextSlot(await adsetNames(config.default_campaign_id!), config.adset_name_pattern);
  }

  for (const copy of copies) {
    if (copy.meta_ad_id) {
      // Já subiu num tick anterior que morreu depois. Entra na contagem para
      // não parecer que este criativo terminou sem produzir nada.
      noAr.push({ variant: copy.variant, headline: copy.headline, adset: copy.adset_name });
      continue;
    }
    try {
      // Destino desta variação: conjunto clonado só dela, ou o conjunto fixo.
      let destino = adsetId;
      let nomeConjunto: string | null = copy.adset_name ?? null;
      if (duplicando) {
        if (copy.meta_adset_id) {
          destino = copy.meta_adset_id;
        } else {
          nomeConjunto = config.adset_name_pattern.replace("{n}", String(slot));
          destino = await copyAdset(config.template_adset_id!, config.default_campaign_id!, nomeConjunto);
          await supabase.from("hermes_copies")
            .update({ meta_adset_id: destino, adset_name: nomeConjunto }).eq("id", copy.id);
          await log(supabase, id, `conjunto_v${copy.variant}`, true, `${nomeConjunto} = ${destino}`);
          slot++;
        }
      }

      // O link acompanha o conjunto quando a config usa {slot}: é assim que a
      // campanha de headlines distingue HD1 de HD2 no destino do clique.
      const linkUrl = nomeConjunto
        ? config.link_url.replace("{slot}", nomeConjunto)
        : config.link_url.replace("{slot}", "");

      const creativeMetaId = copy.meta_creative_id ?? await createAdCreative({
        adAccountId,
        name: copy.ad_name,
        pageId: config.page_id,
        instagramActorId: config.instagram_actor_id,
        linkUrl,
        ctaType: config.cta_type,
        primaryText: copy.primary_text,
        headline: copy.headline,
        description: copy.description,
        videoId: videoId ?? undefined,
        thumbnailUrl,
        imageHash: imageHash ?? undefined,
        // Mesmas macros dos anúncios que já rodam na conta, para os relatórios
        // não terem duas convenções de UTM convivendo. O `utm_content` legível
        // vem do nome do anúncio, que é de onde o meta-ads-cron o extrai.
        urlTags:
          `utm_source={{site_source_name}}&utm_medium=paid_social` +
          `&utm_campaign={{campaign.name}}&utm_content={{ad.name}}` +
          `&utm_term={{adset.name}}&utm_placement={{placement}}` +
          // IDs crus do Meta em parâmetros dedicados (o front lê campaign_id,
          // adset_id e ad_id direto). É a chave de cruzamento que o método
          // Allan Tracker usa (ad.id) sem mexer na convenção de utm_* que o
          // painel já consome.
          `&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}`,
      });
      const adId = await createAd(adAccountId, destino, copy.ad_name, creativeMetaId, status);
      await supabase.from("hermes_copies").update({
        meta_creative_id: creativeMetaId,
        meta_ad_id: adId,
        status: status === "ACTIVE" ? "ativo" : "pausado",
        last_error: null,
      }).eq("id", copy.id);
      noAr.push({ variant: copy.variant, headline: copy.headline, adset: nomeConjunto ?? undefined });
      criados++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("hermes_copies").update({ status: "erro", last_error: msg.slice(0, 1000) })
        .eq("id", copy.id);
      await log(supabase, id, `criar_anuncio_v${copy.variant}`, false, msg);
    }
  }

  if (noAr.length === 0) throw new Error("nenhum anúncio foi criado");

  await supabase.from("hermes_creatives").update({
    status: status === "ACTIVE" ? "ativo" : "no_ar",
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  await log(supabase, id, "concluido", true, `${noAr.length} anúncios ${status} (${criados} novos)`);

  // Só avisa se este tick produziu algo. Sem isso, um tick que só reencontra
  // anúncios de antes manda a mesma mensagem de novo.
  if (criados > 0) {
    const lista = noAr
      .map((c) => `${c.adset ? `${c.adset} ` : `v${c.variant} `}: ${c.headline}`)
      .join("\n");
    if (status === "ACTIVE") {
      await notify(`HERMES subiu e ATIVOU ${criados} anúncios do criativo "${fileName}":\n${lista}`);
    } else {
      const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/hermes`;
      const ok = `${base}?action=approve&creative_id=${id}&t=${await actionToken("approve", id)}`;
      const no = `${base}?action=reject&creative_id=${id}&t=${await actionToken("reject", id)}`;
      await notify(
        `HERMES subiu ${criados} anúncios do criativo "${fileName}", todos PAUSADOS:\n${lista}\n\n` +
          `Aprovar: ${ok}\nDescartar: ${no}`,
      );
    }
  }
}

async function run(supabase: SupabaseClient): Promise<Json> {
  const ingested = await ingest(supabase);

  const { data: configs } = await supabase.from("hermes_config").select("*").eq("active", true);
  if (!configs?.length) {
    return { ok: false, error: "nenhuma config ativa, rode ?action=setup e grave uma config", ingested };
  }
  const byId = new Map<string, Config>();
  for (const c of configs as Config[]) byId.set(c.id, c);

  const { data: fila } = await supabase
    .from("hermes_creatives")
    .select("*")
    .in("status", ["pendente", "processando"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at")
    .limit(MAX_PER_RUN);

  const processados: Json[] = [];
  for (const creative of fila ?? []) {
    const config = byId.get(creative.config_id as string) ?? configs[0];
    try {
      await processOne(supabase, creative, config);
      processados.push({ file: creative.file_name, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Vídeo ainda transcodificando não é falha: é o Meta demorando. Devolve a
      // tentativa, senão um vídeo pesado queima as três e vira erro sem motivo.
      const aguardandoMeta = msg.includes("não ficou pronto no tempo limite");
      const attempts = aguardandoMeta
        ? (creative.attempts as number)
        : (creative.attempts as number) + 1;
      // Fora esse caso, só desiste de vez no limite: rate limit do Meta também
      // é passageiro, e o estado parcial já está salvo para a próxima rodada.
      await supabase.from("hermes_creatives").update({
        status: attempts >= MAX_ATTEMPTS ? "erro" : "pendente",
        attempts,
        last_error: msg.slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq("id", creative.id);
      await log(supabase, creative.id as string, "processar", false, msg);
      processados.push({ file: creative.file_name, ok: false, erro: msg });
      if (attempts >= MAX_ATTEMPTS) {
        await notify(`HERMES desistiu do criativo "${creative.file_name}" após ${attempts} tentativas: ${msg}`);
      }
    }
  }
  return { ok: true, ingested, processados };
}

// ---------------------------------------------------------------- handler

/** Página de confirmação do link assinado. O botão faz o POST que executa. */
function confirmPage(action: string, url: URL): Response {
  const aprovar = action === "approve";
  const titulo = aprovar ? "Ativar os anúncios?" : "Descartar as variações?";
  const texto = aprovar
    ? "Os anúncios pausados deste criativo vão para ACTIVE e começam a gastar."
    : "Os anúncios ficam pausados no Meta e o criativo sai da fila.";
  const cor = aprovar ? "#16a34a" : "#dc2626";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Hermes</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b0c;color:#e7e7e8;display:flex;
min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.card{max-width:420px;width:100%}h1{font-size:20px;margin:0 0 8px}p{color:#a1a1a5;line-height:1.5}
button{width:100%;padding:14px;border:0;border-radius:10px;background:${cor};color:#fff;
font-size:16px;font-weight:600;cursor:pointer}#r{margin-top:16px}</style></head><body>
<div class="card"><h1>${titulo}</h1><p>${texto}</p>
<button onclick="go()">Confirmar</button><p id="r"></p></div>
<script>async function go(){document.getElementById('r').textContent='Executando...';
const res=await fetch(location.href,{method:'POST'});const j=await res.json();
document.getElementById('r').textContent=j.ok?('Pronto. '+(j.ativados!==undefined?j.ativados+' anúncios ativados.':'Descartado.')):('Falhou: '+j.error);}
</script></body></html>`;
  return new Response(html, {
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";

  // approve e reject aceitam também o token assinado do link do WhatsApp; o
  // resto exige a chave completa.
  const viaToken = (action === "approve" || action === "reject") && await tokenMatches(req, url);
  if (!viaToken && !(await isAuthorized(req))) {
    return json({ ok: false, error: "não autorizado" }, 401);
  }

  // O WhatsApp busca o link sozinho para montar a pré-visualização. Se o GET
  // já executasse, todo anúncio seria aprovado no instante em que a mensagem
  // chega. Então o link abre uma confirmação e a ação só roda no POST.
  if (viaToken && req.method === "GET") {
    return confirmPage(action, url);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (action) {
      case "run":
        return json(await run(supabase) as Json);

      case "ingest":
        return json({ ok: true, ...(await ingest(supabase)) });

      case "status": {
        const { data: fila } = await supabase
          .from("hermes_creatives")
          .select("id, file_name, angle, status, attempts, last_error, created_at")
          .order("created_at", { ascending: false }).limit(30);
        const { data: copies } = await supabase
          .from("hermes_copies")
          .select("creative_id, variant, headline, status, meta_ad_id, last_error")
          .order("created_at", { ascending: false }).limit(90);
        const { data: runs } = await supabase
          .from("hermes_runs").select("*").order("created_at", { ascending: false }).limit(30);
        return json({ ok: true, fila, copies, runs });
      }

      case "approve": {
        const creativeId = url.searchParams.get("creative_id");
        const copyId = url.searchParams.get("copy_id");
        if (!creativeId && !copyId) return json({ ok: false, error: "informe creative_id ou copy_id" }, 400);
        const q = supabase.from("hermes_copies").select("*").eq("status", "pausado");
        const { data: alvo } = copyId ? await q.eq("id", copyId) : await q.eq("creative_id", creativeId!);
        let ativados = 0;
        for (const c of alvo ?? []) {
          if (!c.meta_ad_id) continue;
          // O conjunto clonado nasce pausado. Ativar só o anúncio deixaria ele
          // ACTIVE dentro de um conjunto parado, que não entrega nada e é o
          // tipo de falha que ninguém percebe até cobrar o resultado.
          if (c.meta_adset_id) await setAdsetStatus(c.meta_adset_id, "ACTIVE");
          await setAdStatus(c.meta_ad_id, "ACTIVE");
          await supabase.from("hermes_copies").update({ status: "ativo" }).eq("id", c.id);
          ativados++;
        }
        if (creativeId && ativados) {
          await supabase.from("hermes_creatives").update({ status: "ativo" }).eq("id", creativeId);
        }
        await log(supabase, creativeId, "aprovado", true, `${ativados} anúncios ativados`);
        return json({ ok: true, ativados });
      }

      /**
       * Corta conjuntos perdedores de um teste e devolve o orçamento deles aos
       * que ficam.
       *
       * Num teste A/B por conjunto (as headlines HD0..HD4 e as subheadlines
       * SH0..SH6 da casa), matar variante é metade do trabalho: se a verba do
       * perdedor não voltar para os outros, o teste inteiro desacelera e a
       * decisão demora mais. Aqui as duas coisas acontecem juntas.
       *
       * Chamada:
       *   ?action=rebalance&campaign_id=<id>&pause=SH1,SH3,SH5
       *   ...&confirm=1   para executar de verdade
       *
       * Sem `confirm=1` devolve só o plano. Isso mexe em dinheiro que está
       * rodando: o padrão é mostrar o que vai fazer, nunca fazer.
       */
      /**
       * Volta conjuntos ao ar e reparte o orçamento da campanha por igual
       * entre todos os que ficam ativos.
       *
       * É o desfazer do `rebalance`. Existe porque pausar variante é decisão
       * que às vezes se toma com dado faltando, e voltar atrás precisa ser tão
       * fácil quanto cortar — senão o custo de errar vira motivo para não
       * mexer em nada.
       *
       *   ?action=resume&campaign_id=<id>&adsets=SH5[&confirm=1]
       */
      /**
       * Lista os anúncios de uma campanha, agrupados por conjunto.
       *
       *   ?action=ads&campaign_id=<id>
       */
      /** ?action=insights&ad_id=<id>&date=YYYY-MM-DD — o que o Meta devolve, sem filtro. */
      case "insights": {
        const adId = url.searchParams.get("ad_id");
        const dia = url.searchParams.get("date");
        if (!adId || !dia) return json({ ok: false, error: "informe ad_id e date" }, 400);
        return json({ ok: true, data: await insightsCrus(adId, dia) } as Json);
      }

      /**
       * Para onde cada anúncio da campanha manda a pessoa.
       *
       *   ?action=destinos&campaign_id=<id>[&esperado=/HD3]
       *
       * Existe porque o painel só sabe a variante que o site RECEBEU. Quando um
       * anúncio aponta para a página errada, o resultado dele aparece somado à
       * variante errada, e o teste de copy decide a favor de quem não foi
       * testado — sem nada no painel denunciando a troca.
       */
      case "destinos": {
        const campaignId = url.searchParams.get("campaign_id");
        if (!campaignId) return json({ ok: false, error: "informe campaign_id" }, 400);
        const esperado = caminhoDaUrl(url.searchParams.get("esperado") || "/HD3");
        const ads = await anunciosDaCampanha(campaignId);

        const linhas = ads.map((a) => {
          const caminhos = a.destinos.map(caminhoDaUrl);
          const fora = caminhos.filter((c) => c !== esperado);
          return {
            id: a.id,
            anuncio: a.name,
            conjunto: a.adset_name,
            status: a.status,
            entrega: a.effective_status,
            destino: a.destinos.join(" | "),
            caminho: caminhos.join(" | "),
            url_tags: a.url_tags,
            origem_do_link: a.origem_do_link,
            // Três estados, não dois: anúncio sem link legível não é anúncio
            // certo. Tratar o desconhecido como "ok" é o jeito de nunca achar
            // o que se foi procurar.
            situacao: a.destinos.length === 0
              ? "sem link legível"
              : (fora.length ? "fora do esperado" : "ok"),
          };
        });

        return json({
          ok: true,
          total: linhas.length,
          esperado,
          fora_do_esperado: linhas.filter((l) => l.situacao === "fora do esperado"),
          sem_link: linhas.filter((l) => l.situacao === "sem link legível"),
          anuncios: linhas,
        } as Json);
      }

      /**
       * Duplica uma campanha inteira como campanha de VENDAS.
       *
       *   ?action=duplicar_vendas&origem=<campaign_id>&modelo=<id ou nome>&nome=<nome novo>[&executar=1]
       *
       * Sem `executar=1` só devolve o plano (o que seria criado) e não toca na
       * conta. A campanha nova nasce PAUSADA; conjuntos e anúncios herdam o
       * status da origem, então ligar a campanha basta para ela rodar igual.
       */
      case "duplicar_vendas": {
        const origem = url.searchParams.get("origem");
        const modelo = url.searchParams.get("modelo");
        const nome = url.searchParams.get("nome");
        if (!origem || !modelo || !nome) return json({ ok: false, error: "informe origem, modelo e nome" }, 400);
        // Sem ad_account_id, a conta vem da própria campanha de origem.
        const adAccountId = url.searchParams.get("ad_account_id") ?? "";
        const r = await duplicarComoVendas({
          adAccountId,
          origemCampaignId: origem,
          modelo,
          nomeNovo: nome,
          executar: url.searchParams.get("executar") === "1",
          campanhaExistente: url.searchParams.get("campanha_id") ?? undefined,
          telefone: url.searchParams.get("telefone") ?? undefined,
        });
        return json(r as Json, r.ok ? 200 : 500);
      }

      case "ads": {
        const campaignId = url.searchParams.get("campaign_id");
        if (!campaignId) return json({ ok: false, error: "informe campaign_id" }, 400);
        const ads = await anunciosDaCampanha(campaignId);
        const porConjunto: Record<string, Array<Record<string, string>>> = {};
        for (const a of ads) {
          (porConjunto[a.adset_name] ??= []).push({
            id: a.id, nome: a.name, status: a.status, entrega: a.effective_status,
          });
        }
        return json({ ok: true, total: ads.length, conjuntos: porConjunto } as Json);
      }

      /**
       * Tira um criativo do ar em TODOS os conjuntos de uma campanha.
       *
       * Num teste de copy de página, o criativo é a variável que precisa ficar
       * constante — e o Meta distribui a verba entre criativos como quer, o que
       * transforma o teste numa mistura. Cortar para um criativo só é o que
       * torna o resultado legível.
       *
       *   ?action=cut_creative&campaign_id=<id>&creative=Arthur[&confirm=1]
       *
       * A trava principal: nenhum conjunto pode ficar sem anúncio ativo. Um
       * conjunto ligado e vazio não entrega nada e não avisa ninguém.
       */
      case "cut_creative": {
        const campaignId = url.searchParams.get("campaign_id");
        const alvoNome = (url.searchParams.get("creative") || "").trim().toLowerCase();
        const confirmar = url.searchParams.get("confirm") === "1";
        if (!campaignId) return json({ ok: false, error: "informe campaign_id" }, 400);
        if (!alvoNome) return json({ ok: false, error: "informe creative=<trecho do nome>" }, 400);

        const ads = await anunciosDaCampanha(campaignId);
        if (!ads.length) return json({ ok: false, error: "campanha sem anúncios" }, 404);

        const bate = (a: { name: string }) => a.name.toLowerCase().includes(alvoNome);
        const cortar = ads.filter((a) => bate(a) && a.status !== "PAUSED");
        if (!cortar.length) {
          return json({
            ok: false,
            error: "nenhum anúncio ativo bate com esse nome",
            nomes: [...new Set(ads.map((a) => a.name))],
          }, 404);
        }

        // Por conjunto: quem sobra ativo depois do corte.
        const sobra: Record<string, number> = {};
        const vazios: string[] = [];
        for (const a of ads) {
          if (a.status === "PAUSED" || bate(a)) continue;
          sobra[a.adset_name] = (sobra[a.adset_name] ?? 0) + 1;
        }
        for (const a of cortar) {
          if (!sobra[a.adset_name]) vazios.push(a.adset_name);
        }
        if (vazios.length) {
          return json({
            ok: false,
            error: "o corte deixaria conjunto sem nenhum anúncio ativo",
            conjuntos_que_ficariam_vazios: [...new Set(vazios)],
            sugestao: "pause o conjunto inteiro, ou ative outro criativo nele antes",
          }, 400);
        }

        const plano = {
          criativo: alvoNome,
          cortar: cortar.map((a) => ({ id: a.id, nome: a.name, conjunto: a.adset_name })),
          sobram_ativos_por_conjunto: sobra,
        };
        if (!confirmar) return json({ ok: true, dry_run: true, plano } as Json);

        const feito: string[] = [];
        for (const a of cortar) {
          await setAdStatus(a.id, "PAUSED");
          feito.push(`${a.adset_name}: pausou "${a.name}"`);
        }
        await log(supabase, null, "cut_creative", true, feito.join(" | "));
        await notify(`HERMES tirou "${alvoNome}" do ar em ${cortar.length} anúncios da campanha.`);
        return json({ ok: true, executado: true, plano, feito } as Json);
      }

      case "resume": {
        const campaignId = url.searchParams.get("campaign_id");
        const voltar = (url.searchParams.get("adsets") || "")
          .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
        const confirmar = url.searchParams.get("confirm") === "1";
        if (!campaignId) return json({ ok: false, error: "informe campaign_id" }, 400);
        if (!voltar.length) return json({ ok: false, error: "informe adsets=NOME,NOME" }, 400);

        const todos = await adsetsDaCampanha(campaignId);
        const chaveR = (n: string) => n.toLowerCase().replace(/\s+/g, "");
        const reativar = todos.filter((a) => voltar.includes(chaveR(a.name)));
        if (!reativar.length) {
          return json({ ok: false, error: "nenhum conjunto bateu", nomes: todos.map((a) => a.name) }, 404);
        }
        // O total da campanha não muda: o que estava concentrado em poucos
        // volta a ser dividido entre todos os que passam a rodar.
        const ativosDepois = todos.filter(
          (a) => a.status !== "PAUSED" || voltar.includes(chaveR(a.name)),
        );
        const totalAtual = todos
          .filter((a) => a.status !== "PAUSED")
          .reduce((t, a) => t + a.daily_budget_cents, 0);
        const porUm = Math.floor(totalAtual / ativosDepois.length);
        if (porUm < 100) {
          return json({ ok: false, error: "a divisão daria menos de 1 na moeda da conta por conjunto" }, 400);
        }
        const planoR = {
          reativar: reativar.map((a) => ({ id: a.id, nome: a.name, status: a.status })),
          ficam_todos: ativosDepois.map((a) => ({
            id: a.id, nome: a.name,
            budget_atual: a.daily_budget_cents / 100,
            budget_novo: porUm / 100,
          })),
          total_dia: totalAtual / 100,
        };
        if (!confirmar) return json({ ok: true, dry_run: true, plano: planoR } as Json);

        const feitoR: string[] = [];
        // Ajusta o orçamento ANTES de ligar: ligar primeiro deixaria o conjunto
        // reativado gastando o valor cheio de quando foi pausado.
        for (const a of ativosDepois) {
          await setAdsetDailyBudget(a.id, porUm);
        }
        for (const a of reativar) {
          await setAdsetStatus(a.id, "ACTIVE");
          feitoR.push(`reativou ${a.name}`);
        }
        feitoR.push(`todos os ${ativosDepois.length} ativos em ${(porUm / 100).toFixed(2)}/dia`);
        await log(supabase, null, "resume", true, feitoR.join(" | "));
        return json({ ok: true, executado: true, plano: planoR, feito: feitoR } as Json);
      }

      case "rebalance": {
        const campaignId = url.searchParams.get("campaign_id");
        const pausar = (url.searchParams.get("pause") || "")
          .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
        const confirmar = url.searchParams.get("confirm") === "1";
        if (!campaignId) return json({ ok: false, error: "informe campaign_id" }, 400);
        if (!pausar.length) return json({ ok: false, error: "informe pause=NOME,NOME" }, 400);

        const conjuntos = await adsetsDaCampanha(campaignId);
        if (!conjuntos.length) return json({ ok: false, error: "campanha sem conjuntos" }, 404);

        // Campanha com orçamento própria (CBO) não tem verba para redistribuir:
        // o Meta já reparte sozinho entre os conjuntos ativos, e o
        // `daily_budget` que os conjuntos devolvem é um número morto. Nesse
        // caso pausar basta, e mexer em orçamento de conjunto seria trabalho
        // que não faz efeito nenhum.
        const camp = await campanhaInfo(campaignId);
        // A conta é em USD: todo valor daqui para baixo é na moeda da conta,
        // nunca em reais, e o plano diz isso em voz alta.
        const { data: cfgMoeda } = await supabase.from("hermes_config")
          .select("ad_account_id").eq("active", true).limit(1);
        const moeda = cfgMoeda?.[0]?.ad_account_id
          ? await moedaDaConta(cfgMoeda[0].ad_account_id as string).catch(() => "")
          : "";
        if (camp.usa_cbo) {
          const alvoCbo = conjuntos.filter((a) =>
            pausar.includes(a.name.toLowerCase().replace(/\s+/g, ""))
          );
          const ficamCbo = conjuntos.filter(
            (a) => !pausar.includes(a.name.toLowerCase().replace(/\s+/g, "")) && a.status !== "PAUSED"
          );
          const planoCbo = {
            campanha: { nome: camp.name, orcamento_dia: camp.daily_budget_cents / 100, cbo: true },
            pausar: alvoCbo.map((a) => ({ id: a.id, nome: a.name, status: a.status })),
            ficam: ficamCbo.map((a) => ({ id: a.id, nome: a.name })),
            observacao: "campanha com orçamento no nível da campanha (CBO): a verba dos pausados " +
              "é redistribuída pelo próprio Meta entre os que ficam. Nenhum orçamento de conjunto é alterado.",
          };
          if (ficamCbo.length < REBALANCE_MIN_ATIVOS) {
            return json({ ok: false, error: `deixaria só ${ficamCbo.length} conjunto(s) rodando` }, 400);
          }
          const ativosCbo = conjuntos.filter((a) => a.status !== "PAUSED").length;
          const pausarAtivosCbo = alvoCbo.filter((a) => a.status !== "PAUSED").length;
          if (pausarAtivosCbo > Math.floor(ativosCbo * REBALANCE_MAX_FRACAO_PAUSADA)) {
            return json({ ok: false, error: `pausar ${pausarAtivosCbo} de ${ativosCbo} passa do limite de ${Math.round(REBALANCE_MAX_FRACAO_PAUSADA * 100)}%` }, 400);
          }
          if (!confirmar) return json({ ok: true, dry_run: true, plano: planoCbo } as Json);
          const feitoCbo: string[] = [];
          for (const a of alvoCbo) {
            await setAdsetStatus(a.id, "PAUSED");
            feitoCbo.push(`pausou ${a.name}`);
          }
          await log(supabase, null, "rebalance", true, feitoCbo.join(" | "));
          await notify(`HERMES pausou ${alvoCbo.map((a) => a.name).join(", ")} em "${camp.name}". A campanha tem CBO, então o Meta redistribui a verba sozinho.`);
          return json({ ok: true, executado: true, plano: planoCbo, feito: feitoCbo } as Json);
        }

        // O nome no Meta às vezes tem espaço ("SH 2") e às vezes não ("SH0"),
        // então a comparação ignora espaço e caixa.
        const chave = (n: string) => n.toLowerCase().replace(/\s+/g, "");
        const alvo = conjuntos.filter((a) => pausar.includes(chave(a.name)));
        const ficam = conjuntos.filter(
          (a) => !pausar.includes(chave(a.name)) && a.status !== "PAUSED" && a.daily_budget_cents > 0,
        );
        const naoAchados = pausar.filter((n) => !conjuntos.some((a) => chave(a.name) === n));
        if (!alvo.length) {
          return json({ ok: false, error: "nenhum conjunto bateu com os nomes", nomes: conjuntos.map((a) => a.name) }, 404);
        }
        if (!ficam.length) {
          return json({ ok: false, error: "nenhum conjunto sobraria ativo para receber a verba" }, 400);
        }
        // Só conta a verba de quem ainda está rodando: somar o orçamento de um
        // conjunto já pausado inventaria dinheiro que não estava sendo gasto.
        const aPausarAtivos = alvo.filter((a) => a.status !== "PAUSED");
        const liberado = aPausarAtivos.reduce((t, a) => t + a.daily_budget_cents, 0);
        const fatia = Math.floor(liberado / ficam.length);

        // ── As travas ────────────────────────────────────────────────────────
        const ativosAntes = conjuntos.filter((a) => a.status !== "PAUSED").length;
        const totalAntes = conjuntos
          .filter((a) => a.status !== "PAUSED")
          .reduce((t, a) => t + a.daily_budget_cents, 0);
        const totalDepois = ficam.reduce((t, a) => t + a.daily_budget_cents + fatia, 0);
        const recusa = (motivo: string, extra: Json = {}) =>
          json({ ok: false, error: motivo, ...extra }, 400);

        if (ficam.length < REBALANCE_MIN_ATIVOS) {
          return recusa(
            `a operação deixaria só ${ficam.length} conjunto(s) rodando; o mínimo é ${REBALANCE_MIN_ATIVOS}`,
          );
        }
        if (aPausarAtivos.length > Math.floor(ativosAntes * REBALANCE_MAX_FRACAO_PAUSADA)) {
          return recusa(
            `pausar ${aPausarAtivos.length} de ${ativosAntes} conjuntos ativos passa do limite de ` +
            `${Math.round(REBALANCE_MAX_FRACAO_PAUSADA * 100)}% por operação`,
          );
        }
        // A soma tem que se conservar: o rebalance MOVE verba, nunca cria. Uma
        // diferença aqui significa conta errada, e conta errada em orçamento
        // aparece na fatura antes de aparecer no painel.
        const sobra = totalAntes - totalDepois;
        if (sobra < 0 || sobra > ficam.length) {
          return recusa("a soma dos orçamentos não bate; nada foi alterado", {
            total_antes: totalAntes / 100, total_depois: totalDepois / 100,
          });
        }
        for (const a of ficam) {
          const novo = a.daily_budget_cents + fatia;
          if (novo > REBALANCE_TETO_DIARIO_CENTAVOS) {
            return recusa(
              `${a.name} passaria de R$ ${(novo / 100).toFixed(2)}/dia, acima do teto de ` +
              `R$ ${(REBALANCE_TETO_DIARIO_CENTAVOS / 100).toFixed(2)}`,
            );
          }
          if (a.daily_budget_cents > 0 && novo > a.daily_budget_cents * REBALANCE_MAX_FATOR) {
            return recusa(
              `${a.name} multiplicaria por ${(novo / a.daily_budget_cents).toFixed(1)}x, ` +
              `acima do limite de ${REBALANCE_MAX_FATOR}x por operação`,
            );
          }
        }
        const plano = {
          pausar: alvo.map((a) => ({ id: a.id, nome: a.name, status: a.status, budget: a.daily_budget_cents / 100 })),
          receber: ficam.map((a) => ({
            id: a.id, nome: a.name,
            budget_atual: a.daily_budget_cents / 100,
            budget_novo: (a.daily_budget_cents + fatia) / 100,
          })),
          verba_liberada: liberado / 100,
          por_conjunto: fatia / 100,
          nao_encontrados: naoAchados,
          total_dia_antes: totalAntes / 100,
          total_dia_depois: totalDepois / 100,
          moeda: moeda || "moeda da conta",
          travas_ok: true,
        };
        if (!confirmar) return json({ ok: true, dry_run: true, plano } as Json);

        // Pausa ANTES de aumentar. Se a chamada morrer no meio, a campanha
        // fica gastando menos do que devia, nunca mais. O contrário deixaria os
        // sobreviventes já aumentados e os perdedores ainda rodando, que é
        // gastar o dobro sem ninguém saber.
        const feito: string[] = [];
        for (const a of alvo) {
          await setAdsetStatus(a.id, "PAUSED");
          feito.push(`pausou ${a.name}`);
        }
        for (const a of ficam) {
          await setAdsetDailyBudget(a.id, a.daily_budget_cents + fatia);
          feito.push(`${a.name} -> ${moeda || "$"} ${((a.daily_budget_cents + fatia) / 100).toFixed(2)}/dia`);
        }
        await log(supabase, null, "rebalance", true, feito.join(" | "));
        await notify(
          `HERMES rebalanceou a campanha: pausou ${alvo.map((a) => a.name).join(", ")} e ` +
          `dividiu ${moeda || "$"} ${(liberado / 100).toFixed(2)}/dia entre ${ficam.map((a) => a.name).join(", ")}.`,
        );
        return json({ ok: true, executado: true, plano, feito } as Json);
      }

      case "reject": {
        const creativeId = url.searchParams.get("creative_id");
        const copyId = url.searchParams.get("copy_id");
        if (!creativeId && !copyId) return json({ ok: false, error: "informe creative_id ou copy_id" }, 400);
        const q = supabase.from("hermes_copies").select("*");
        const { data: alvo } = copyId ? await q.eq("id", copyId) : await q.eq("creative_id", creativeId!);
        for (const c of alvo ?? []) {
          // Deixa o anúncio pausado no Meta em vez de apagar: histórico de
          // entrega some junto com o anúncio, e às vezes a copy rejeitada hoje
          // é a que a gente quer olhar no mês que vem.
          if (c.meta_ad_id) await setAdStatus(c.meta_ad_id, "PAUSED").catch(() => {});
          if (c.meta_adset_id) await setAdsetStatus(c.meta_adset_id, "PAUSED").catch(() => {});
          await supabase.from("hermes_copies").update({ status: "rejeitado" }).eq("id", c.id);
        }
        if (creativeId) {
          await supabase.from("hermes_creatives").update({ status: "ignorado" }).eq("id", creativeId);
        }
        return json({ ok: true });
      }

      /**
       * Diagnóstico de escrita: tenta criar um creative com uma imagem que já
       * está na biblioteca da conta, e apaga em seguida. Separa duas causas que
       * dão a mesma mensagem: o app não poder criar creative nenhum, ou só não
       * poder usar mídia que ele mesmo subiu.
       */
      case "diag": {
        const { data: cfgs } = await supabase.from("hermes_config")
          .select("*").eq("active", true).limit(1);
        const cfg = cfgs?.[0] as Config | undefined;
        if (!cfg) return json({ ok: false, error: "nenhuma config ativa" }, 400);

        const imagens = await listAdImages(cfg.ad_account_id) as Array<{ hash?: string; name?: string }>;
        if (!imagens.length) return json({ ok: false, error: "conta sem imagens na biblioteca" }, 400);

        const resultados: Json[] = [];
        for (const img of imagens.slice(0, 2)) {
          if (!img.hash) continue;
          try {
            const cid = await createAdCreative({
              adAccountId: cfg.ad_account_id,
              name: `hermes-diag-${img.hash.slice(0, 8)}`,
              pageId: cfg.page_id,
              instagramActorId: cfg.instagram_actor_id,
              linkUrl: cfg.link_url.replace("{slot}", "HD3"),
              ctaType: cfg.cta_type,
              primaryText: "Diagnóstico do Hermes. Este creative é apagado em seguida.",
              headline: "Diagnóstico",
              description: null,
              imageHash: img.hash,
              urlTags: "utm_source=diag",
            });
            await deleteCreative(cid).catch(() => {});
            resultados.push({ imagem: img.name ?? img.hash, criou: true, apagado: true });
          } catch (e) {
            resultados.push({
              imagem: img.name ?? img.hash,
              criou: false,
              erro: (e instanceof Error ? e.message : String(e)).slice(0, 400),
            });
          }
        }
        return json({ ok: true, conta: cfg.ad_account_id, resultados });
      }

      case "setup": {
        const account = url.searchParams.get("ad_account_id");
        if (account) {
          const acc = account.startsWith("act_") ? account : `act_${account}`;
          return json({
            ok: true,
            conta: await checkAccount(acc),
            conjuntos: await listAdsets(acc) as Json,
          });
        }
        return json({ ok: true, businesses: await listBusinesses() as Json });
      }

      case "config": {
        if (req.method !== "POST") return json({ ok: false, error: "use POST" }, 405);
        const body = await req.json() as Json;
        const raw = String(body.ad_account_id ?? "");
        if (!raw) return json({ ok: false, error: "ad_account_id obrigatório" }, 400);
        const adAccountId = raw.startsWith("act_") ? raw : `act_${raw}`;
        await checkAccount(adAccountId); // falha cedo se o token não escreve nessa conta

        const modo = (body.adset_mode as string) ?? "fixo";
        if (modo === "duplicar" && !(body.template_adset_id && body.default_campaign_id)) {
          return json({
            ok: false,
            error: "modo duplicar exige template_adset_id e default_campaign_id",
          }, 400);
        }
        if (modo === "fixo" && !body.default_adset_id) {
          return json({ ok: false, error: "modo fixo exige default_adset_id" }, 400);
        }

        const { data, error } = await supabase.from("hermes_config").upsert({
          label: body.label ?? adAccountId,
          ad_account_id: adAccountId,
          page_id: body.page_id,
          instagram_actor_id: body.instagram_actor_id ?? null,
          adset_mode: modo,
          default_campaign_id: body.default_campaign_id ?? null,
          default_adset_id: body.default_adset_id ?? null,
          template_adset_id: body.template_adset_id ?? null,
          adset_name_pattern: body.adset_name_pattern ?? "HD{n}",
          link_url: body.link_url,
          cta_type: body.cta_type ?? "LEARN_MORE",
          copies_per_creative: body.copies_per_creative ?? 3,
          auto_activate: body.auto_activate ?? false,
          active: body.active ?? true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "ad_account_id" }).select();
        if (error) return json({ ok: false, error: error.message }, 400);
        return json({ ok: true, config: data?.[0] as Json });
      }

      default:
        return json({ ok: false, error: `ação desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[hermes]", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
