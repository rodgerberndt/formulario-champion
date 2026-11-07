import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

// API da aba WhatsApp do admin. Mesmo login do admin do formulário
// (token de admin-login, conferido com ADMIN_JWT_SECRET), igual ao direct-admin.

type AnyClient = SupabaseClient<any, any, any, any, any>;

const GRAPH = "https://graph.facebook.com/v25.0";
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
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("ADMIN_JWT_SECRET") ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const payload = await verify(token, key);
    return payload.role === "admin";
  } catch {
    return false;
  }
}

async function graph(caminho: string, metodo = "GET", corpo?: unknown) {
  const r = await fetch(`${GRAPH}/${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${Deno.env.get("WA_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return await r.json();
}

// Telefone brasileiro digitado de qualquer jeito vira só dígitos com o 55 na frente.
function normalizar(tel: string): string {
  const d = String(tel ?? "").replace(/\D/g, "");
  return d.length <= 11 ? `55${d}` : d;
}

async function gravarSaida(sb: AnyClient, waId: string, r: any, tipo: string, texto: string) {
  const wamid = r.messages?.[0]?.id;
  if (!wamid) return;
  const waReal = r.contacts?.[0]?.wa_id ?? waId;
  await sb.from("wa_contatos").upsert({ wa_id: waReal, ultima_interacao_em: new Date().toISOString() }, { onConflict: "wa_id" });
  await sb.from("wa_mensagens").upsert({ wamid, wa_id: waReal, direcao: "saida", autor: "crm", tipo, texto, status: "accepted" }, { onConflict: "wamid", ignoreDuplicates: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await adminValido(req.headers.get("x-admin-token")))) return json({ error: "Sessão expirada. Entre de novo." }, 401);

  const sb: AnyClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const PHONE = Deno.env.get("WA_PHONE_NUMBER_ID");
  const WABA = Deno.env.get("WA_WABA_ID");
  try {
    const { acao, ...d } = await req.json();

    // Caixa de entrada: uma linha por pessoa, a mais recente primeiro.
    if (acao === "conversas") {
      const { data: msgs } = await sb.from("wa_mensagens").select("wa_id,texto,direcao,criado_em").order("criado_em", { ascending: false }).limit(1000);
      const ultima = new Map<string, any>();
      for (const m of msgs ?? []) if (!ultima.has(m.wa_id)) ultima.set(m.wa_id, m);
      const ids = [...ultima.keys()].slice(0, 150);
      const { data: cs } = ids.length ? await sb.from("wa_contatos").select("*").in("wa_id", ids) : { data: [] as any[] };
      const porId = new Map((cs ?? []).map((c: any) => [c.wa_id, c]));
      return json({ conversas: ids.map((id) => ({ ...(porId.get(id) ?? { wa_id: id }), ultima: ultima.get(id) })) });
    }

    if (acao === "mensagens") {
      const { data } = await sb.from("wa_mensagens").select("*").eq("wa_id", d.wa_id).order("criado_em", { ascending: true }).limit(300);
      const { data: c } = await sb.from("wa_contatos").select("*").eq("wa_id", d.wa_id).maybeSingle();
      return json({ mensagens: data ?? [], contato: c });
    }

    // Texto livre: a Meta só aceita dentro de 24h da última mensagem da pessoa.
    if (acao === "enviar") {
      const texto = String(d.texto ?? "").trim();
      if (!texto) return json({ error: "Escreva a mensagem." }, 400);
      const waId = normalizar(d.wa_id);
      const { data: c } = await sb.from("wa_contatos").select("ultima_msg_em").eq("wa_id", waId).maybeSingle();
      const aberta = c?.ultima_msg_em && Date.now() - new Date(c.ultima_msg_em).getTime() < 24 * 3600 * 1000;
      if (!aberta) return json({ error: "Fora da janela de 24h: para começar a conversa, envie um modelo aprovado." }, 400);
      const r = await graph(`${PHONE}/messages`, "POST", { messaging_product: "whatsapp", to: waId, type: "text", text: { body: texto.slice(0, 4096) } });
      if (!r.messages) return json({ error: r.error?.message ?? "A Meta recusou o envio." }, 502);
      await gravarSaida(sb, waId, r, "text", texto);
      return json({ ok: true });
    }

    // Modelo aprovado: é o único jeito de começar uma conversa.
    if (acao === "enviar_modelo") {
      const waId = normalizar(d.wa_id);
      if (waId.length < 12) return json({ error: "Telefone incompleto. Use DDD + número." }, 400);
      const params = (d.parametros ?? []).filter((p: string) => String(p).trim());
      const template: Record<string, unknown> = { name: d.nome, language: { code: d.idioma || "pt_BR" } };
      if (params.length) template.components = [{ type: "body", parameters: params.map((p: string) => ({ type: "text", text: String(p) })) }];
      const r = await graph(`${PHONE}/messages`, "POST", { messaging_product: "whatsapp", to: waId, type: "template", template });
      if (!r.messages) return json({ error: r.error?.error_user_msg ?? r.error?.message ?? "A Meta recusou o envio." }, 502);
      await gravarSaida(sb, waId, r, "template", `[modelo ${d.nome}]${d.previa ? " " + d.previa : ""}`);
      return json({ ok: true, wa_id: r.contacts?.[0]?.wa_id ?? waId });
    }

    if (acao === "modelos") {
      const r = await graph(`${WABA}/message_templates?fields=id,name,status,category,language,components,rejected_reason&limit=100`);
      if (r.error) return json({ error: r.error.message }, 502);
      return json({ modelos: r.data ?? [] });
    }

    if (acao === "criar_modelo") {
      const nome = String(d.nome ?? "").trim().toLowerCase();
      if (!/^[a-z0-9_]{1,512}$/.test(nome)) return json({ error: "Nome do modelo: só letras minúsculas, números e _." }, 400);
      const corpo = String(d.corpo ?? "").trim();
      if (!corpo) return json({ error: "Escreva o texto do modelo." }, 400);
      if (!["MARKETING", "UTILITY"].includes(d.categoria)) return json({ error: "Categoria inválida." }, 400);
      const body: Record<string, unknown> = { type: "BODY", text: corpo };
      const vars = corpo.match(/\{\{\d+\}\}/g) ?? [];
      if (vars.length) body.example = { body_text: [vars.map((_: string, i: number) => d.exemplos?.[i] || `exemplo ${i + 1}`)] };
      const r = await graph(`${WABA}/message_templates`, "POST", { name: nome, category: d.categoria, language: d.idioma || "pt_BR", components: [body] });
      if (r.error) return json({ error: r.error.error_user_msg ?? r.error.message }, 502);
      return json({ modelo: r });
    }

    return json({ error: "ação desconhecida" }, 400);
  } catch (error) {
    console.error("Error in whatsapp-admin:", error);
    return json({ error: `Falha: ${(error as Error).message ?? error}` }, 500);
  }
});
