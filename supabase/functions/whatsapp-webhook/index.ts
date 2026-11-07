import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Webhook do WhatsApp (Cloud API, app "Champion CRM Mensagens").
// Grava toda mensagem que entra, os status das que saem e, em coexistência,
// o que o Miguel manda pelo app do celular (smb_message_echoes).

type AnyClient = SupabaseClient<any, any, any, any, any>;

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

function textoDe(m: Record<string, any>): string | null {
  if (m.text?.body) return m.text.body;
  if (m.button?.text) return m.button.text;
  if (m.interactive?.button_reply?.title) return m.interactive.button_reply.title;
  if (m.interactive?.list_reply?.title) return m.interactive.list_reply.title;
  for (const k of ["image", "video", "document", "audio", "sticker"]) {
    if (m[k]) return m[k].caption ?? `(${k === "audio" ? "áudio" : k === "image" ? "imagem" : k === "video" ? "vídeo" : k === "document" ? "documento" : "figurinha"})`;
  }
  return null;
}

// Liga o contato ao lead com o mesmo telefone (últimos 8 dígitos, que sobrevivem
// ao 9 extra do celular brasileiro).
async function ligarLead(sb: AnyClient, waId: string) {
  const { data: c } = await sb.from("wa_contatos").select("lead_id").eq("wa_id", waId).maybeSingle();
  if (c?.lead_id) return;
  const fim = waId.slice(-8);
  const { data: l } = await sb.from("leads").select("id").ilike("whatsapp", `%${fim}`).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (l?.id) await sb.from("wa_contatos").update({ lead_id: l.id }).eq("wa_id", waId);
}

async function contato(sb: AnyClient, waId: string, nome?: string, daPessoa = false) {
  const agora = new Date().toISOString();
  const linha: Record<string, unknown> = { wa_id: waId, ultima_interacao_em: agora };
  if (nome) linha.nome = nome;
  if (daPessoa) linha.ultima_msg_em = agora;
  await sb.from("wa_contatos").upsert(linha, { onConflict: "wa_id" });
  await ligarLead(sb, waId);
}

async function processar(sb: AnyClient, corpo: any) {
  for (const entry of corpo.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      if (ch.field === "messages") {
        const nomes = new Map<string, string>((v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
        for (const m of v.messages ?? []) {
          await contato(sb, m.from, nomes.get(m.from), true);
          await sb.from("wa_mensagens").upsert({
            wamid: m.id, wa_id: m.from, direcao: "entrada", autor: "contato", tipo: m.type,
            texto: textoDe(m), criado_em: new Date(Number(m.timestamp) * 1000).toISOString(),
          }, { onConflict: "wamid", ignoreDuplicates: true });
        }
        for (const s of v.statuses ?? []) {
          await sb.from("wa_mensagens").update({ status: s.status, erro: s.errors?.[0]?.title ?? null }).eq("wamid", s.id);
        }
      }
      if (ch.field === "smb_message_echoes") {
        for (const m of v.message_echoes ?? []) {
          await contato(sb, m.to);
          await sb.from("wa_mensagens").upsert({
            wamid: m.id, wa_id: m.to, direcao: "saida", autor: "app", tipo: m.type,
            texto: textoDe(m), status: "sent", criado_em: new Date(Number(m.timestamp) * 1000).toISOString(),
          }, { onConflict: "wamid", ignoreDuplicates: true });
        }
      }
    }
  }
}

async function assinaturaOk(req: Request, bruto: string): Promise<boolean> {
  const segredo = Deno.env.get("WA_APP_SECRET");
  if (!segredo) return true; // sem a chave configurada, não confere (igual ao instagram-webhook)
  const assinatura = req.headers.get("x-hub-signature-256")?.replace("sha256=", "") ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(bruto)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === assinatura;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === Deno.env.get("WA_WEBHOOK_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("ok");

  const bruto = await req.text();
  if (!(await assinaturaOk(req, bruto))) return new Response("assinatura", { status: 401 });
  const sb: AnyClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let corpo: any;
  try { corpo = JSON.parse(bruto); } catch { return new Response("ok"); }
  await sb.from("wa_webhook_eventos").insert({ corpo });
  EdgeRuntime.waitUntil(processar(sb, corpo).catch((e) => console.error("Error in whatsapp-webhook:", e)));
  return new Response("ok");
});
