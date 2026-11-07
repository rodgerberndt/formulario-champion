import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";
import { graphGet, graphPost, IG_USER_ID } from "../_shared/instagram.ts";

// API do painel do Champion Direct. Usa o mesmo login do admin do formulário
// (token de admin-login, conferido com ADMIN_JWT_SECRET).

type AnyClient = SupabaseClient<any, any, any, any, any>;

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

const GATILHOS = ["comentario", "dm", "story", "ref"];

// Mesmos limites que a Meta impõe; o motor também corta, mas é melhor avisar na tela.
function validar(a: Record<string, any>): string | null {
  if (!a.nome?.trim()) return "Dê um nome à automação.";
  if (!GATILHOS.includes(a.gatilho)) return "Gatilho inválido.";
  if (a.gatilho === "dm" && !(a.palavras ?? []).length) return "Automação de DM precisa de pelo menos uma palavra-chave (senão responderia toda mensagem).";
  if (a.gatilho === "ref" && !a.ref?.trim()) return "Defina o ref do link ig.me.";
  const passos = a.passos ?? [];
  if (!passos.length) return "A automação precisa de pelo menos uma mensagem.";
  const ids = new Set(passos.map((p: any) => p.id));
  for (const [i, p] of passos.entries()) {
    const n = `Mensagem ${i + 1}`;
    if (!p.texto?.trim()) return `${n}: o texto está vazio.`;
    if (new TextEncoder().encode(p.texto).length > 1000) return `${n}: passa de 1000 caracteres.`;
    if (p.botoes?.length && p.opcoes?.length) return `${n}: use botões de link OU opções, não os dois.`;
    if ((p.botoes?.length ?? 0) > 3) return `${n}: no máximo 3 botões.`;
    if (p.botoes?.length && p.texto.length > 640) return `${n}: com botões, o texto vai até 640 caracteres.`;
    for (const b of p.botoes ?? []) {
      if (!b.titulo?.trim() || b.titulo.length > 20) return `${n}: título de botão entre 1 e 20 caracteres.`;
      if (!/^https?:\/\//.test(b.url ?? "")) return `${n}: o link do botão "${b.titulo}" precisa começar com https://`;
    }
    if ((p.opcoes?.length ?? 0) > 13) return `${n}: no máximo 13 opções.`;
    for (const o of p.opcoes ?? []) {
      if (!o.titulo?.trim() || o.titulo.length > 20) return `${n}: opção entre 1 e 20 caracteres.`;
      if (o.proximo && !ids.has(o.proximo)) return `${n}: a opção "${o.titulo}" aponta para uma mensagem que não existe.`;
    }
    if (p.proximo && !ids.has(p.proximo)) return `${n}: "depois" aponta para uma mensagem que não existe.`;
    if (p.coletar?.campo && !/^[a-z0-9_]+$/.test(p.coletar.campo)) return `${n}: nome do campo só com letras minúsculas, números e _.`;
    if (p.exigir_seguir && !p.texto_portao?.trim()) return `${n}: escreva a mensagem para quem ainda não segue.`;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await adminValido(req.headers.get("x-admin-token")))) return json({ error: "Sessão expirada. Entre de novo." }, 401);

  const sb: AnyClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { acao, ...d } = await req.json();

    if (acao === "listar") {
      const { data: automacoes } = await sb.from("ig_automacoes").select("*").order("criado_em", { ascending: false });
      const { data: cont } = await sb.rpc("ig_contadores");
      return json({ automacoes, contadores: cont ?? [] });
    }

    if (acao === "salvar") {
      const a = d.automacao ?? {};
      const erro = validar(a);
      if (erro) return json({ error: erro }, 400);
      const linha = {
        nome: a.nome.trim(),
        ativo: !!a.ativo,
        gatilho: a.gatilho,
        palavras: (a.palavras ?? []).map((p: string) => p.trim()).filter(Boolean),
        midias: a.gatilho === "comentario" ? (a.midias ?? []) : [],
        ref: a.gatilho === "ref" ? a.ref.trim() : null,
        respostas_publicas: a.gatilho === "comentario" ? (a.respostas_publicas ?? []).map((r: string) => r.trim()).filter(Boolean) : [],
        passos: a.passos,
        campanha: a.campanha?.trim() || null,
        atualizado_em: new Date().toISOString(),
      };
      const q = a.id ? sb.from("ig_automacoes").update(linha).eq("id", a.id) : sb.from("ig_automacoes").insert(linha);
      const { data, error } = await q.select("*").single();
      if (error) throw error;
      return json({ automacao: data });
    }

    if (acao === "ativar") {
      const { error } = await sb.from("ig_automacoes").update({ ativo: !!d.ativo }).eq("id", d.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (acao === "excluir") {
      const { error } = await sb.from("ig_automacoes").delete().eq("id", d.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (acao === "midias") {
      const r = await graphGet(sb, "me/media", { fields: "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp", limit: "30" });
      if (r.error) return json({ error: r.error.message }, 502);
      return json({ midias: r.data ?? [] });
    }

    if (acao === "contatos") {
      const { data } = await sb.from("ig_contatos").select("igsid,username,nome,foto_url,segue,tags,campos,optout,pausado_ate,ultima_interacao_em")
        .order("ultima_interacao_em", { ascending: false }).limit(200);
      return json({ contatos: data ?? [] });
    }

    if (acao === "historico") {
      const { data } = await sb.from("ig_execucoes").select("criado_em,tipo,passo,detalhe,igsid,automacao_id")
        .order("id", { ascending: false }).limit(100);
      return json({ historico: data ?? [] });
    }

    // Caixa de entrada: uma linha por pessoa, a mais recente primeiro.
    if (acao === "conversas") {
      const { data: msgs } = await sb.from("ig_mensagens").select("igsid,texto,direcao,autor,criado_em").order("criado_em", { ascending: false }).limit(1000);
      const ultima = new Map<string, any>();
      for (const m of msgs ?? []) if (!ultima.has(m.igsid)) ultima.set(m.igsid, m);
      const ids = [...ultima.keys()].slice(0, 150);
      const { data: cs } = ids.length
        ? await sb.from("ig_contatos").select("igsid,username,nome,foto_url,tags,origem,ultima_msg_em,pausado_ate,optout,lead_id").in("igsid", ids)
        : { data: [] as any[] };
      const porId = new Map((cs ?? []).map((c: any) => [c.igsid, c]));
      return json({ conversas: ids.map((id) => ({ ...(porId.get(id) ?? { igsid: id }), ultima: ultima.get(id) })) });
    }

    if (acao === "mensagens") {
      const { data } = await sb.from("ig_mensagens").select("mid,direcao,autor,texto,anexo,criado_em").eq("igsid", d.igsid).order("criado_em", { ascending: true }).limit(300);
      const { data: c } = await sb.from("ig_contatos").select("*").eq("igsid", d.igsid).maybeSingle();
      return json({ mensagens: data ?? [], contato: c });
    }

    // Resposta humana pelo painel: só dentro da janela de 24h, e o robô fica
    // quieto 12h com essa pessoa (igual a quando se responde pelo celular).
    if (acao === "responder") {
      const texto = String(d.texto ?? "").trim();
      if (!texto) return json({ error: "Escreva a mensagem." }, 400);
      const { data: c } = await sb.from("ig_contatos").select("igsid,ultima_msg_em").eq("igsid", d.igsid).maybeSingle();
      const aberta = c?.ultima_msg_em && Date.now() - new Date(c.ultima_msg_em).getTime() < 24 * 3600 * 1000;
      if (!aberta) return json({ error: "A janela de 24h fechou: a Meta só deixa responder depois que a pessoa mandar mensagem de novo." }, 400);
      const r = await graphPost(sb, `${IG_USER_ID}/messages`, { recipient: { id: d.igsid }, message: { text: texto.slice(0, 1000) } });
      if (!r.message_id) return json({ error: r.error?.message ?? "A Meta recusou o envio." }, 502);
      await sb.from("ig_enviadas").insert({ mid: r.message_id, igsid: d.igsid });
      await sb.from("ig_mensagens").upsert({ mid: r.message_id, igsid: d.igsid, direcao: "saida", autor: "humano", texto }, { onConflict: "mid", ignoreDuplicates: true });
      await sb.from("ig_contatos").update({ pausado_ate: new Date(Date.now() + 12 * 3600 * 1000).toISOString(), aguardando: null }).eq("igsid", d.igsid);
      return json({ ok: true });
    }

    if (acao === "retomar") {
      const { error } = await sb.from("ig_contatos").update({ pausado_ate: null }).eq("igsid", d.igsid);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "ação desconhecida" }, 400);
  } catch (error) {
    console.error("Error in direct-admin:", error);
    return json({ error: `Falha: ${(error as Error).message ?? error}` }, 500);
  }
});
