import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { linkConfere } from "../_shared/instagram.ts";

// Link rastreado do Champion Direct: conta o clique no botão da DM e
// redireciona, acrescentando UTM de DM quando o destino não tiver.

type AnyClient = SupabaseClient<any, any, any, any, any>;

Deno.serve(async (req) => {
  const q = new URL(req.url).searchParams;
  const url = q.get("u") ?? "";
  const automacaoId = q.get("a") ?? "";
  const igsid = q.get("c") ?? "";
  const s = q.get("s") ?? "";

  if (!/^https?:\/\//.test(url) || !(await linkConfere(url, automacaoId, igsid, s))) {
    return new Response("link inválido", { status: 400 });
  }

  const destino = new URL(url);
  if (!destino.searchParams.has("utm_source")) {
    destino.searchParams.set("utm_source", "instagram");
    destino.searchParams.set("utm_medium", "dm");
    destino.searchParams.set("utm_campaign", `direct_${automacaoId.slice(0, 8)}`);
  }

  try {
    const supabase: AnyClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await supabase.from("ig_execucoes").insert({ tipo: "clique", automacao_id: automacaoId, igsid, detalhe: { url } });
  } catch (error) {
    console.error("Error in ig-link:", error);
  }

  return new Response(null, { status: 302, headers: { Location: destino.toString() } });
});
