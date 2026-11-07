// Renova o access token do Google Calendar na tabela `calendar_integrations`.
//
// Existe por um motivo só: o Apito (squads/operacao-champion) roda no PC do Rodger e precisa de
// um access token válido para subir as cobranças na agenda dele. O refresh token já está na
// tabela, mas renovar exige GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, que só existem aqui, nos
// secrets deste projeto (o Google não mostra o secret depois de criado, e o cliente OAuth já
// tem os dois secrets permitidos em uso). Então a renovação acontece aqui, e o token renovado
// fica gravado na tabela, exatamente como `getValidAccessToken` já faz para o painel.
//
// Rota única: POST /functions/v1/apito-token
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>   (quem tem a service role já lê a tabela)
//   → { ok, renovado, connected_email, calendar_id, expira_em }
//
// Nenhum token do Google sai na resposta. Quem chamou lê a tabela depois.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { carregarIntegracao, getValidAccessToken } from "../_shared/google-calendar.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "use POST" }, 405);

  // Quem chama prova que é service role lendo a tabela protegida por RLS sem policy: anon e
  // publishable recebem lista vazia, só a service role (legada eyJ… ou nova sb_secret_…) vê a
  // linha. Comparar com SUPABASE_SERVICE_ROLE_KEY do ambiente não basta: o projeto pode ter os
  // dois formatos de chave e o .env local pode estar com o outro.
  const recebido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  if (!recebido) return json({ error: "não autorizado" }, 401);
  const prova = await fetch(`${supabaseUrl}/rest/v1/calendar_integrations?select=id&limit=1`, {
    headers: { apikey: recebido, Authorization: `Bearer ${recebido}` },
  }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  if (!Array.isArray(prova) || prova.length === 0) return json({ error: "não autorizado" }, 401);

  const esperado = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, esperado);
  const integ = await carregarIntegracao(supabase);
  if (!integ || integ.status !== "connected") {
    return json({ ok: false, error: `Google Calendar não conectado (status: ${integ?.status ?? "sem linha"})` }, 409);
  }

  const expiraAntes = integ.token_expires_at ? Date.parse(integ.token_expires_at) : 0;
  const valiaAntes = !!integ.access_token && expiraAntes - Date.now() > 5 * 60 * 1000;

  try {
    await getValidAccessToken(supabase, integ); // renova e persiste se faltar menos de 5 min
    const depois = await carregarIntegracao(supabase);
    return json({
      ok: true,
      renovado: !valiaAntes,
      connected_email: depois?.connected_email ?? integ.connected_email,
      calendar_id: depois?.calendar_id ?? integ.calendar_id,
      expira_em: depois?.token_expires_at ?? integ.token_expires_at,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error(`[apito-token] ${msg}`);
    return json({ ok: false, error: msg }, 502);
  }
});
