import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { tratarComentario, tratarMensageria } from "./motor.ts";

// Receptor de webhooks do Instagram (Champion Direct). Confere a assinatura da
// Meta, grava o evento cru em ig_webhook_eventos e entrega ao motor (motor.ts).
// Doc: 01-Projetos/champion-direct/docs/ENGENHARIA-REVERSA-MANYCHAT.md

type AnyClient = SupabaseClient<any, any, any, any, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("IG_WEBHOOK_VERIFY_TOKEN");
// Chave secreta do app do Instagram. Sem ela o evento ainda é gravado, mas
// marcado como assinatura_ok = null, para a spike não depender dela.
const APP_SECRET = Deno.env.get("IG_APP_SECRET");

async function assinaturaConfere(corpo: string, cabecalho: string | null): Promise<boolean | null> {
  if (!APP_SECRET) return null;
  if (!cabecalho?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo));
  const esperado = [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = cabecalho.slice("sha256=".length);
  if (recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++) diferenca |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diferenca === 0;
}

async function processar(supabase: AnyClient, payload: unknown) {
  const entradas = (payload as { entry?: Array<Record<string, unknown>> })?.entry ?? [];
  for (const entrada of entradas) {
    for (const mudanca of (entrada.changes as Array<{ field?: string; value?: unknown }>) ?? []) {
      try {
        if (mudanca.field === "comments") await tratarComentario(supabase, mudanca.value as Parameters<typeof tratarComentario>[1]);
      } catch (error) {
        console.error("Error in instagram-webhook comments:", error);
      }
    }
    for (const m of (entrada.messaging as Array<Parameters<typeof tratarMensageria>[1]>) ?? []) {
      try {
        await tratarMensageria(supabase, m);
      } catch (error) {
        console.error("Error in instagram-webhook messaging:", error);
      }
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verificação do endpoint pela Meta (botão "Verificar e salvar").
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const desafio = url.searchParams.get("hub.challenge");
    if (modo === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN && desafio) {
      return new Response(desafio, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const corpo = await req.text();
  const assinaturaOk = await assinaturaConfere(corpo, req.headers.get("x-hub-signature-256"));
  if (assinaturaOk === false) return new Response("bad signature", { status: 401 });

  let payload: unknown = null;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // A Meta reenvia se não receber 200 rápido; por isso grava, responde, e o
  // motor roda depois da resposta. Erro vira log, não 500.
  const supabase: AnyClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const objeto = (payload as { object?: string })?.object ?? null;
    const entradas = (payload as { entry?: Array<Record<string, unknown>> })?.entry ?? [];
    const campos = entradas.flatMap((e) => [
      ...((e.changes as Array<{ field?: string }>) ?? []).map((c) => c.field ?? "?"),
      ...((e.messaging as unknown[]) ?? []).map(() => "messaging"),
    ]);
    const { error } = await supabase.from("ig_webhook_eventos").insert({
      objeto,
      campos,
      assinatura_ok: assinaturaOk,
      payload,
    });
    if (error) console.error("Error in instagram-webhook insert:", error);
  } catch (error) {
    console.error("Error in instagram-webhook:", error);
  }

  EdgeRuntime.waitUntil(processar(supabase, payload));
  return new Response("EVENT_RECEIVED", { status: 200 });
});
