import { createClient } from "jsr:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

// API da aba "Agentes" do admin: o estado de cada agente (Reels, carrossel, stories...), os eventos recentes
// e as rotinas do servidor (pg_cron). Só leitura. Mesmo login do admin (token do admin-login, ADMIN_JWT_SECRET).
// Quem escreve em agentes_status/agentes_eventos são os agentes, com a service role
// (01-Projetos/instagram-postagem/telemetria.mjs).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function adminValido(token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(Deno.env.get("ADMIN_JWT_SECRET") ?? ""),
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await adminValido(req.headers.get("x-admin-token")))) return json({ error: "Sessão expirada. Entre de novo." }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const [agentes, eventos, crons] = await Promise.all([
    sb.from("agentes_status").select("*").order("agente"),
    sb.from("agentes_eventos").select("*").order("criado_em", { ascending: false }).limit(80),
    sb.rpc("agentes_crons"),
  ]);
  const erro = agentes.error || eventos.error || crons.error;
  if (erro) return json({ error: erro.message }, 500);
  return json({ agentes: agentes.data, eventos: eventos.data, crons: crons.data, agora: new Date().toISOString() });
});
