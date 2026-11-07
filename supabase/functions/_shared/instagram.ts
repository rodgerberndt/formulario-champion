import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Chamadas à API do Instagram (Instagram API with Instagram Login) usadas pelo
// Champion Direct. Doc: 01-Projetos/champion-direct/docs/ENGENHARIA-REVERSA-MANYCHAT.md

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

export const GRAPH = "https://graph.instagram.com/v25.0";
export const IG_USER_ID = Deno.env.get("IG_USER_ID") ?? "";

// O token do painel vale 60 dias. Ele nasce no secret IG_ACCESS_TOKEN e, a
// partir da 1ª renovação, passa a morar em ig_config (só a service role lê).
// Renova quando passou de RENOVAR_APOS_DIAS desde a última vez.
const RENOVAR_APOS_DIAS = 20;
// Data em que o token do secret foi gerado no painel (14/10/2026).
const TOKEN_INICIAL_EM = "2026-10-14T18:40:00Z";

let tokenEmMemoria: string | null = null;

export async function tokenInstagram(supabase: AnyClient): Promise<string> {
  if (tokenEmMemoria) return tokenEmMemoria;
  const { data } = await supabase.from("ig_config").select("chave, valor").in("chave", ["ig_token", "ig_token_renovado_em"]);
  const mapa = Object.fromEntries((data ?? []).map((r: { chave: string; valor: string }) => [r.chave, r.valor]));
  let token: string = mapa.ig_token ?? Deno.env.get("IG_ACCESS_TOKEN") ?? "";
  const renovadoEm = new Date(mapa.ig_token_renovado_em ?? TOKEN_INICIAL_EM).getTime();
  const dias = (Date.now() - renovadoEm) / 86_400_000;
  if (token && dias > RENOVAR_APOS_DIAS) {
    try {
      const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
      const j = await r.json();
      if (j.access_token) {
        token = j.access_token;
        const agora = new Date().toISOString();
        await supabase.from("ig_config").upsert([
          { chave: "ig_token", valor: token, atualizado_em: agora },
          { chave: "ig_token_renovado_em", valor: agora, atualizado_em: agora },
        ]);
        console.log("instagram: token renovado");
      } else {
        console.error("Error in tokenInstagram refresh:", j.error ?? j);
      }
    } catch (error) {
      console.error("Error in tokenInstagram refresh:", error);
    }
  }
  tokenEmMemoria = token;
  return token;
}

export async function graphGet(supabase: AnyClient, caminho: string, params: Record<string, string> = {}) {
  const token = await tokenInstagram(supabase);
  const qs = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${GRAPH}/${caminho}?${qs}`);
  return await r.json();
}

export async function graphPost(supabase: AnyClient, caminho: string, corpo: unknown) {
  const token = await tokenInstagram(supabase);
  const r = await fetch(`${GRAPH}/${caminho}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return await r.json();
}

// ── Link rastreado ─────────────────────────────────────────
// Botão de link aponta para a função ig-link, que conta o clique e redireciona.
// Assinado com HMAC para a função não virar redirecionador aberto.

const LINK_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ig-link`;

async function hmac(texto: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(texto));
  return [...new Uint8Array(sig)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function linkRastreado(url: string, automacaoId: string, igsid: string): Promise<string> {
  const base = `${url}|${automacaoId}|${igsid}`;
  const qs = new URLSearchParams({ u: url, a: automacaoId, c: igsid, s: await hmac(base) });
  return `${LINK_BASE}?${qs}`;
}

export async function linkConfere(url: string, automacaoId: string, igsid: string, s: string): Promise<boolean> {
  return (await hmac(`${url}|${automacaoId}|${igsid}`)) === s;
}
