// Conexão do painel com o Google Calendar.
//
// Rotas (todas sob /functions/v1/google-calendar):
//   GET  /status      → como está a conexão e as configurações (admin)
//   GET  /auth-url    → URL de consentimento do Google, para abrir em popup (admin)
//   GET  /callback    → para onde o Google devolve o `code` (público, sem token)
//   POST /settings    → agenda, convidados, duração, convidar o lead (admin)
//   POST /disconnect  → esquece os tokens (admin)
//   POST /sync        → força a sincronização de uma reunião (admin)
//
// `/callback` é o único aberto: quem chega nele é o navegador voltando do
// Google, sem header nenhum. Ele não devolve dado do banco — só troca o code por
// tokens e fecha a janela.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";
import { GOOGLE_SCOPES, sincronizarReuniao } from "../_shared/google-calendar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const jwtSecret = Deno.env.get("ADMIN_JWT_SECRET");
    if (!jwtSecret) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    const payload = await verify(token, key);
    return payload.role === "admin";
  } catch {
    return false;
  }
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** A URI de retorno é esta própria função. É ela que vai no console do Google. */
function redirectUri(): string {
  const base = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
  return `${base}/functions/v1/google-calendar/callback`;
}

/**
 * Base pública do site, para onde a volta do OAuth é redirecionada.
 *
 * O Supabase NÃO serve HTML de edge function: ele reescreve o Content-Type para
 * `text/plain` e manda `X-Content-Type-Options: nosniff`. A página que fechava o
 * popup abria mostrando o próprio código-fonte, o script nunca rodava, e o
 * painel ficava dizendo "DESCONECTADA" com a conexão já gravada e funcionando.
 *
 * Então a função não desenha mais nada: ela redireciona para o nosso domínio,
 * onde HTML é HTML. Ver src/pages/GoogleCalendarCallback.tsx.
 */
const BASE_PUBLICA = (Deno.env.get("PUBLIC_BASE_URL") || "https://www.championadstudio.com")
  .replace(/\/$/, "");

/** Volta para o site com o resultado na query. Nenhum token viaja aqui. */
function renderCallback(payload: Record<string, unknown>) {
  const q = new URLSearchParams();
  q.set("ok", payload.ok ? "1" : "0");
  if (typeof payload.email === "string") q.set("email", payload.email);
  if (typeof payload.error === "string") q.set("erro", payload.error);
  return new Response(null, {
    status: 302,
    headers: { Location: `${BASE_PUBLICA}/google-calendar-callback?${q}` },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/google-calendar/, "") || "/";
  const supabase = admin();

  try {
    // ── GET /callback ─ público: é o navegador voltando do Google ────────────
    if (path === "/callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      const erro = url.searchParams.get("error");
      if (erro) return renderCallback({ ok: false, error: decodeURIComponent(erro) });
      if (!code) return renderCallback({ ok: false, error: "Código de autorização ausente" });

      const clientId = Deno.env.get("GOOGLE_CLIENT_ID")?.trim();
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")?.trim();
      if (!clientId || !clientSecret) {
        return renderCallback({ ok: false, error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados" });
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri(),
          grant_type: "authorization_code",
        }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || tokenJson.error) {
        return renderCallback({ ok: false, error: tokenJson.error_description ?? tokenJson.error ?? "Falha ao obter tokens" });
      }

      // Qual conta acabou de conectar. Serve para a tela dizer de quem é a
      // agenda que está organizando as calls.
      let email: string | null = null;
      try {
        const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        });
        email = (await me.json())?.email ?? null;
      } catch { /* e-mail é conveniência, não requisito */ }

      const expiraEm = new Date(Date.now() + (tokenJson.expires_in ?? 3600) * 1000).toISOString();
      const { data: existente } = await supabase
        .from("calendar_integrations").select("id,refresh_token")
        .eq("provider", "google_calendar").maybeSingle();

      const linha = {
        provider: "google_calendar",
        status: "connected",
        connected_email: email,
        access_token: tokenJson.access_token,
        // O Google só manda refresh_token na PRIMEIRA autorização. Reconectar
        // sem `prompt=consent` devolveria nulo e apagaria o que já funciona.
        refresh_token: tokenJson.refresh_token ?? existente?.refresh_token ?? null,
        token_expires_at: expiraEm,
        scopes: GOOGLE_SCOPES,
        last_error: null,
      };

      if (existente) {
        await supabase.from("calendar_integrations").update(linha).eq("id", existente.id);
      } else {
        await supabase.from("calendar_integrations").insert(linha);
      }
      return renderCallback({ ok: true, email });
    }

    // ── Daqui para baixo, só admin ───────────────────────────────────────────
    const adminToken = req.headers.get("x-admin-token");
    if (!adminToken || !(await verifyAdminToken(adminToken))) {
      return json({ error: "Token inválido ou ausente" }, 401);
    }

    if (path === "/status" && req.method === "GET") {
      const { data } = await supabase
        .from("calendar_integrations")
        .select("status,connected_email,calendar_id,attendee_emails,invite_lead,default_duration_minutes,last_sync_at,last_error,token_expires_at")
        .eq("provider", "google_calendar").maybeSingle();

      const configurado = !!Deno.env.get("GOOGLE_CLIENT_ID") && !!Deno.env.get("GOOGLE_CLIENT_SECRET");
      return json({
        credenciais_configuradas: configurado,
        redirect_uri: redirectUri(),
        integracao: data ?? null,
      });
    }

    if (path === "/auth-url" && req.method === "GET") {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID")?.trim();
      if (!clientId) return json({ error: "GOOGLE_CLIENT_ID não configurado" }, 400);
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri(),
        response_type: "code",
        scope: GOOGLE_SCOPES.join(" "),
        access_type: "offline",
        // Sem isso, reconectar não devolve refresh_token novo.
        prompt: "consent",
        include_granted_scopes: "true",
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }

    if (path === "/settings" && req.method === "POST") {
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.calendar_id !== undefined) updates.calendar_id = String(body.calendar_id || "primary");
      if (Array.isArray(body.attendee_emails)) {
        updates.attendee_emails = body.attendee_emails
          .map((e: string) => String(e).trim().toLowerCase())
          .filter((e: string) => e.includes("@"));
      }
      if (body.invite_lead !== undefined) updates.invite_lead = !!body.invite_lead;
      if (body.default_duration_minutes !== undefined) {
        updates.default_duration_minutes = Math.max(15, Number(body.default_duration_minutes) || 45);
      }

      const { data: existente } = await supabase
        .from("calendar_integrations").select("id").eq("provider", "google_calendar").maybeSingle();
      if (existente) {
        await supabase.from("calendar_integrations").update(updates).eq("id", existente.id);
      } else {
        await supabase.from("calendar_integrations").insert({ provider: "google_calendar", ...updates });
      }
      return json({ ok: true });
    }

    if (path === "/disconnect" && req.method === "POST") {
      await supabase.from("calendar_integrations").update({
        status: "disconnected",
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        connected_email: null,
        last_error: null,
      }).eq("provider", "google_calendar");
      // As configurações (convidados, agenda, duração) ficam: reconectar não
      // deve obrigar a redigitar quem participa de toda reunião.
      return json({ ok: true });
    }

    if (path === "/sync" && req.method === "POST") {
      const body = await req.json();
      if (!body.meeting_id) return json({ error: "meeting_id é obrigatório" }, 400);
      const r = await sincronizarReuniao(supabase, String(body.meeting_id));
      return json(r, r.ok ? 200 : 200);
    }

    return json({ error: `Rota não encontrada: ${path}` }, 404);
  } catch (e) {
    console.error("[google-calendar]", e);
    return json({ error: e instanceof Error ? e.message : "erro desconhecido" }, 500);
  }
});
