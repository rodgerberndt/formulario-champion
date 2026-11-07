import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildUserData, sendMetaEvents, registrarLog, identityFlags } from "../_shared/meta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function detectDevice(ua: string | null): string {
  if (!ua) return "unknown";
  const u = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(u)) return "ios";
  if (/android/.test(u)) return "android";
  if (/mobile|opera mini|iemobile|blackberry/.test(u)) return "mobile";
  return "desktop";
}

function sanitize(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.includes("{{") || s.length > 500) return null;
  return s;
}

// O beacon do index.html sai por `navigator.sendBeacon`, que SEMPRE manda
// credenciais. Para requisição com credenciais o navegador exige a origem
// explícita no Allow-Origin (o "*" é recusado no preflight e o beacon nunca
// chegava). Ecoa a origem do pedido.
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin) return corsHeaders;
  return {
    ...corsHeaders,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch {
      body = {};
    }

    const ua = req.headers.get("user-agent");
    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      null;

    const sessionIdRaw = sanitize(body.session_id);
    const sessionId =
      sessionIdRaw && /^[0-9a-f-]{36}$/i.test(sessionIdRaw) ? sessionIdRaw : null;

    const fbclid = sanitize(body.fbclid);
    const fbp = sanitize(body.fbp);
    const fbc = sanitize(body.fbc);
    const pvEventId = sanitize(body.pv_event_id);
    const pageUrl = sanitize(body.page_url);

    // O posicionamento vem no corpo quando o front manda, e é relido da própria
    // `path` quando não vem — a URL da visita já carrega a query string
    // inteira, então isto é LEITURA do que chegou, não inferência.
    //
    // Vale para as visitas de navegadores que ainda estejam com o bundle
    // anterior em cache: elas continuam entregando a URL completa em `path`.
    const caminho = sanitize(body.path) ?? "/";
    const placementDaPath = (() => {
      const i = caminho.indexOf("?");
      if (i < 0) return null;
      try {
        const p = new URLSearchParams(caminho.slice(i + 1));
        const v = p.get("utm_placement") || p.get("placement");
        // Macro não substituída pela Meta não é dado.
        return v && !/\{\{.*\}\}/.test(v) ? v : null;
      } catch {
        return null;
      }
    })();

    const row = {
      session_id: sessionId,
      click_id: sanitize(body.click_id),
      path: caminho,
      placement_raw: sanitize(body.placement) ?? placementDaPath,
      referrer: sanitize(body.referrer),
      user_agent: ua?.slice(0, 500) ?? null,
      device_type: detectDevice(ua),
      utm_source: sanitize(body.utm_source),
      utm_medium: sanitize(body.utm_medium),
      utm_campaign: sanitize(body.utm_campaign),
      utm_content: sanitize(body.utm_content),
      utm_term: sanitize(body.utm_term),
      fbclid,
      gclid: sanitize(body.gclid),
      ttclid: sanitize(body.ttclid),
      ip_address: ip,
      fbp,
      fbc,
      pv_event_id: pvEventId,
    };

    const { error } = await supabase.from("landing_hits").insert(row);
    if (error) {
      console.error("landing_hits insert error", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PageView pelo servidor, irmão do PageView do pixel (mesmo event_id).
    // É a redundância que o método do curso faz no GTM Server: se o pixel foi
    // bloqueado, o Meta ainda vê a visita; se não foi, desduplica pelo id.
    // Best effort: nunca segura a resposta do beacon por causa do Meta.
    if (pvEventId && pageUrl) {
      const ts = Math.floor(Date.now() / 1000);
      const p = (async () => {
        try {
          const userData = await buildUserData(
            { externalIds: [sessionId] },
            { fbc, fbp, fbclid, fbcClickTime: Date.now(), ip, userAgent: ua },
          );
          const r = await sendMetaEvents([{
            event_name: "PageView",
            event_id: pvEventId,
            event_time: ts,
            event_source_url: pageUrl,
            action_source: "website",
            user_data: userData,
          }]);
          // Rastreabilidade: o PageView do servidor também conta no log
          // (sem lead_id; o chamador é o beacon da landing).
          await registrarLog(supabase, {
            lead_id: null,
            event_name: "PageView",
            event_id: pvEventId,
            caller: "landing-hit",
            action_source: "website",
            status: r.success ? "sent" : (r.rejected ? "rejected" : "failed"),
            http_status: r.status || null,
            events_received: r.events_received ?? null,
            fbtrace_id: r.fbtrace_id ?? null,
            error_message: r.error ?? null,
            meta_response: r.success ? null : (r.response ?? null),
            identity: identityFlags(userData),
            attempt: r.attempts || 1,
          });
        } catch (e) {
          console.error("landing-hit PageView CAPI error", e);
        }
      })();
      // @ts-ignore EdgeRuntime existe no runtime do Supabase; fora dele, só aguarda.
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
      else await p;
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("landing-hit error", e);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
