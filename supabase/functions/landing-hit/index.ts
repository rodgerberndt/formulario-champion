import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

Deno.serve(async (req) => {
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

    const row = {
      session_id: sessionId,
      click_id: sanitize(body.click_id),
      path: sanitize(body.path) ?? "/",
      referrer: sanitize(body.referrer),
      user_agent: ua?.slice(0, 500) ?? null,
      device_type: detectDevice(ua),
      utm_source: sanitize(body.utm_source),
      utm_medium: sanitize(body.utm_medium),
      utm_campaign: sanitize(body.utm_campaign),
      utm_content: sanitize(body.utm_content),
      utm_term: sanitize(body.utm_term),
      fbclid: sanitize(body.fbclid),
      gclid: sanitize(body.gclid),
      ttclid: sanitize(body.ttclid),
      ip_address: ip,
    };

    const { error } = await supabase.from("landing_hits").insert(row);
    if (error) {
      console.error("landing_hits insert error", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
