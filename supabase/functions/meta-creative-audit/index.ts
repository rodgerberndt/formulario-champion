import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-audit-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const META_API_VERSION = (Deno.env.get("META_API_VERSION") || "v21.0").toLowerCase();
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");

function accountIds(): string[] {
  const main = Deno.env.get("META_AD_ACCOUNT_ID") || "";
  const extra = (Deno.env.get("META_AD_ACCOUNT_IDS_EXTRA") || "").split(",");
  return Array.from(new Set(
    [main, ...extra].map((a) => a.trim()).filter(Boolean)
      .map((a) => (a.startsWith("act_") ? a : `act_${a}`)),
  ));
}

async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const jwtSecret = Deno.env.get("ADMIN_JWT_SECRET");
    if (!jwtSecret) return false;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
    );
    const payload = await verify(token, key);
    return (payload as { role?: string }).role === "admin";
  } catch { return false; }
}

/** Shortcode do Instagram (o /p/XXXX/ da URL) para o ID numérico da mídia. */
const IG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function shortcodeToMediaId(shortcode: string): string {
  let n = 0n;
  for (const ch of shortcode) {
    const idx = IG_ALPHABET.indexOf(ch);
    if (idx < 0) return "";
    n = n * 64n + BigInt(idx);
  }
  return n.toString();
}

function parsePostParam(raw: string): { shortcode: string; mediaId: string } {
  const m = raw.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = m ? m[1] : raw.trim().replace(/\/+$/, "");
  return { shortcode, mediaId: shortcodeToMediaId(shortcode) };
}

/**
 * Posicionamentos que NÃO entregam vídeo: neles o Meta mostra a thumbnail, e o
 * anúncio aparece como imagem estática mesmo tendo vídeo. É a causa nº 3 da
 * lista de suspeitas do bug "criativo virando imagem".
 */
const IMAGE_ONLY_POSITIONS: Record<string, string[]> = {
  facebook_positions: ["right_hand_column", "search", "marketplace"],
  audience_network_positions: ["classic"],
  messenger_positions: ["sponsored_messages"],
};

async function graph(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("access_token", META_ACCESS_TOKEN || "");
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `Graph ${res.status}`);
  return json;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auditKey = Deno.env.get("META_AUDIT_KEY");
  const providedKey = req.headers.get("x-audit-key");
  const adminToken = req.headers.get("x-admin-token");
  const authorized = (auditKey && providedKey && providedKey === auditKey) ||
    (adminToken && await verifyAdminToken(adminToken));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!META_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: "META_ACCESS_TOKEN não configurado" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const postParam = url.searchParams.get("post");
    const target = postParam ? parsePostParam(postParam) : null;
    const onlyActive = url.searchParams.get("all") !== "1";

    const adFields = [
      "id", "name", "status", "effective_status",
      "adset{id,name,targeting{publisher_platforms,facebook_positions,instagram_positions,audience_network_positions,messenger_positions}}",
      "campaign{id,name}",
      "creative{id,name,object_type,video_id,effective_instagram_media_id,instagram_permalink_url,object_story_id,effective_object_story_id,asset_feed_spec,degrees_of_freedom_spec}",
    ].join(",");

    const findings: any[] = [];
    const matches: any[] = [];
    let scanned = 0;

    for (const account of accountIds()) {
      let next: string | null = null;
      do {
        const page: any = next
          ? await (await fetch(next)).json()
          : await graph(`${account}/ads`, {
              fields: adFields,
              limit: "200",
              ...(onlyActive ? { effective_status: JSON.stringify(["ACTIVE"]) } : {}),
            });
        if (page.error) throw new Error(page.error.message);

        for (const ad of page.data || []) {
          scanned++;
          const cr = ad.creative || {};
          const targeting = ad.adset?.targeting || {};

          // 1. Melhorias automáticas (Advantage+ creative): a Meta gera variações
          //    do criativo, inclusive exibir a thumbnail como imagem.
          const dof = cr.degrees_of_freedom_spec?.creative_features_spec || {};
          const enhancements = Object.entries(dof)
            .filter(([, v]: [string, any]) => v?.enroll_status === "OPT_IN")
            .map(([k]) => k);

          // 2. Formato flexível: imagens E vídeos no mesmo anúncio, a Meta escolhe
          //    qual mostrar por pessoa.
          const afs = cr.asset_feed_spec || {};
          const mixedMedia = Array.isArray(afs.images) && afs.images.length > 0 &&
            Array.isArray(afs.videos) && afs.videos.length > 0;

          // 3. Posicionamentos que só entregam imagem.
          const badPositions: string[] = [];
          for (const [field, values] of Object.entries(IMAGE_ONLY_POSITIONS)) {
            const chosen: string[] = targeting[field] || [];
            chosen.filter((p) => values.includes(p)).forEach((p) => badPositions.push(`${field}:${p}`));
          }
          // Advantage+ placements = campo de posicionamento ausente: a Meta usa
          // TODOS, incluindo os que não suportam vídeo.
          const autoPlacements = !targeting.publisher_platforms;

          // 4. O criativo em si não tem vídeo.
          const hasVideo = !!cr.video_id ||
            (Array.isArray(afs.videos) && afs.videos.length > 0) ||
            cr.object_type === "VIDEO";

          const risks: string[] = [];
          if (enhancements.length) risks.push(`melhorias automáticas ligadas (${enhancements.join(", ")})`);
          if (mixedMedia) risks.push("formato flexível com imagem E vídeo no mesmo anúncio");
          if (badPositions.length) risks.push(`posicionamento sem suporte a vídeo (${badPositions.join(", ")})`);
          if (autoPlacements) risks.push("posicionamentos automáticos (inclui os que só entregam imagem)");
          if (!hasVideo) risks.push("criativo sem vídeo (é imagem mesmo)");

          const row = {
            account,
            ad_id: ad.id,
            ad_name: ad.name,
            status: ad.effective_status,
            campaign: ad.campaign?.name,
            adset: ad.adset?.name,
            creative_id: cr.id,
            has_video: hasVideo,
            instagram_media_id: cr.effective_instagram_media_id || null,
            instagram_permalink: cr.instagram_permalink_url || null,
            risks,
            manager_url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${account.replace("act_", "")}&selected_ad_ids=${ad.id}`,
          };

          if (target && target.mediaId) {
            const permalink = (cr.instagram_permalink_url || "").toLowerCase();
            if (
              cr.effective_instagram_media_id === target.mediaId ||
              permalink.includes(target.shortcode.toLowerCase())
            ) {
              matches.push(row);
            }
          }
          if (risks.length) findings.push(row);
        }
        next = page.paging?.next || null;
      } while (next);
    }

    return new Response(JSON.stringify({
      scanned,
      accounts: accountIds(),
      target: target ? { shortcode: target.shortcode, media_id: target.mediaId, matches } : null,
      at_risk: findings.length,
      findings,
    }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
