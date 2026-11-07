import { createClient } from "jsr:@supabase/supabase-js@2";
import { create, verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";
import { etapaDe, FLUXOS, TipoPeca } from "./fluxos.ts";

// API da esteira do orgânico (/esteira), pedido do Rodger em 17/10/2026.
//
// ── Acesso sem roles ────────────────────────────────────────────────────────
// Senha própria, a mesma para o time inteiro (Rodger, Leo, Oton): ESTEIRA_SENHA_HASH = sha256 da senha
// normalizada (minúscula, sem espaço). O token sai assinado com ESTEIRA_JWT_SECRET, um segredo SÓ desta
// função: nenhuma outra função do admin aceita esse token. Isso importa porque o `ai-admin-assistant` confere
// só a assinatura do ADMIN_JWT_SECRET, sem olhar o role; um token da esteira assinado com o segredo do admin
// abriria aquela função para o Leo.
// O admin logado também entra (x-admin-token, role admin), para o Rodger não precisar de uma segunda senha.
//
// Rotas:  POST /login {password}  ·  GET /  (quadro + aprendizados)  ·  POST /acao {codigo, acao, motivo?, para?, quem}
//         (no ajuste, `prints`: até 4 imagens em data URL, coladas na tela; vão para o bucket em ajustes/<codigo>/)
//         POST /peca {codigo, tipo?, titulo?, dia?, doc_url?, pasta_url?, quem}  (cria card de Reel ou edita links)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-esteira-token",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const chave = (segredo: string) =>
  crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const normalizar = (s: string) => s.toLowerCase().replace(/\s+/g, "");

async function autorizado(req: Request): Promise<boolean> {
  const t = req.headers.get("x-esteira-token");
  if (t) {
    try { return (await verify(t, await chave(Deno.env.get("ESTEIRA_JWT_SECRET") ?? ""))).role === "esteira"; } catch { /* segue */ }
  }
  const a = req.headers.get("x-admin-token");
  if (a) {
    try { return (await verify(a, await chave(Deno.env.get("ADMIN_JWT_SECRET") ?? ""))).role === "admin"; } catch { /* segue */ }
  }
  return false;
}

const tentativas = new Map<string, { n: number; em: number }>();

async function login(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "?";
  const t = tentativas.get(ip);
  if (t && Date.now() - t.em < 10 * 60000 && t.n >= 8) return json({ error: "Muitas tentativas. Espere 10 minutos." }, 429);
  const { password } = await req.json().catch(() => ({}));
  const hash = Deno.env.get("ESTEIRA_SENHA_HASH"), segredo = Deno.env.get("ESTEIRA_JWT_SECRET");
  if (!hash || !segredo) return json({ error: "Esteira sem senha configurada no servidor" }, 500);
  if (typeof password !== "string" || (await sha256(normalizar(password))) !== hash.trim().toLowerCase()) {
    tentativas.set(ip, { n: (t && Date.now() - t.em < 10 * 60000 ? t.n : 0) + 1, em: Date.now() });
    return json({ error: "Senha incorreta" }, 401);
  }
  tentativas.delete(ip);
  // 30 dias: é ferramenta de trabalho diário e o que ela abre é só o quadro do orgânico
  const token = await create({ alg: "HS256", typ: "JWT" }, { role: "esteira", exp: Math.floor(Date.now() / 1000) + 30 * 86400 }, await chave(segredo));
  return json({ token });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const rota = new URL(req.url).pathname.replace(/^.*\/esteira/, "") || "/";
  try {
    if (rota === "/login" && req.method === "POST") return await login(req);
    if (!(await autorizado(req))) return json({ error: "Sessão expirada. Entre de novo." }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (req.method === "GET") {
      // publicado e descartado saem do quadro depois de 10 dias
      const corte = new Date(Date.now() - 10 * 86400000).toISOString();
      // aprendizados (aba "Aprendizados", 03/11/2026): as regras que os squads e o Claude gravaram nas revisões, os 200
      // mais novos. Quem escreve é o aprendizados.mjs do PC; tabela faltando ou erro nela não derruba o quadro.
      const [pecas, eventos, aprendizados] = await Promise.all([
        sb.from("esteira_pecas").select("*").or(`etapa.not.in.(publicado,descartado),atualizado_em.gte.${corte}`).order("dia", { ascending: true, nullsFirst: false }),
        sb.from("esteira_eventos").select("*").order("criado_em", { ascending: false }).limit(300),
        sb.from("esteira_aprendizados").select("id,chave,area,titulo,regra,porque,origem,arquivo,data_regra,criado_em,atualizado_em")
          .order("data_regra", { ascending: false, nullsFirst: false }).order("atualizado_em", { ascending: false }).limit(200),
      ]);
      if (pecas.error || eventos.error) return json({ error: (pecas.error || eventos.error)!.message }, 500);
      if (aprendizados.error) console.error("esteira aprendizados:", aprendizados.error.message);
      const caminhos = [...new Set(pecas.data.flatMap((p) => [...(p.previas || []), ...(p.ajuste && Array.isArray(p.extra?.ajuste_prints) ? p.extra.ajuste_prints : [])]))];
      const urls: Record<string, string> = {};
      if (caminhos.length) {
        const { data } = await sb.storage.from("esteira").createSignedUrls(caminhos, 3600);
        for (const d of data || []) if (d.signedUrl && d.path) urls[d.path] = d.signedUrl;
      }
      return json({ pecas: pecas.data, eventos: eventos.data, previas: urls, fluxos: FLUXOS, aprendizados: aprendizados.data || [], agora: new Date().toISOString() });
    }

    const corpo = await req.json().catch(() => ({}));
    const quem = String(corpo.quem || "").trim().slice(0, 30);
    if (!quem) return json({ error: "Diga quem é você antes (canto de cima)." }, 400);
    const agora = new Date().toISOString();

    if (rota === "/acao" && req.method === "POST") {
      const { data: p } = await sb.from("esteira_pecas").select("*").eq("codigo", String(corpo.codigo || "")).maybeSingle();
      if (!p) return json({ error: "Peça não encontrada" }, 404);
      const etapa = etapaDe(p.tipo, p.etapa);
      const motivo = String(corpo.motivo || "").trim().slice(0, 2000);
      let para: string | null = null, acao = String(corpo.acao || "");
      const mudanca: Record<string, unknown> = {};
      let prints: string[] | null | undefined; // undefined = não mexe; null = limpa

      if (acao === "aprovar") {
        if (!etapa?.aprovar) return json({ error: `"${etapa?.nome || p.etapa}" anda sozinha, pelo agente` }, 409);
        para = etapa.aprovar;
        Object.assign(mudanca, { ajuste: null, ajuste_por: null, ajuste_em: null });
        prints = null;
      } else if (acao === "ajuste") {
        if (!etapa?.volta) return json({ error: "Essa etapa não tem pedido de ajuste" }, 409);
        if (!motivo) return json({ error: "Escreva o que precisa mudar" }, 400);
        para = etapa.volta;
        Object.assign(mudanca, { ajuste: motivo, ajuste_por: quem, ajuste_em: agora });
        // prints do ajuste (pedido do Rodger, 21/10/2026: apontar erro de escrita na copy com a imagem)
        prints = [];
        const lista = Array.isArray(corpo.prints) ? corpo.prints.slice(0, 4) : [];
        for (const [i, d] of lista.entries()) {
          const m = typeof d === "string" && d.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
          if (!m) continue;
          const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
          if (bytes.length > 3_000_000) return json({ error: "Print grande demais (máx. 3 MB)" }, 400);
          const caminho = `ajustes/${p.codigo}/${Date.now()}-${i}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
          const { error } = await sb.storage.from("esteira").upload(caminho, bytes, { contentType: `image/${m[1]}` });
          if (error) return json({ error: `Não subiu o print: ${error.message}` }, 500);
          prints.push(caminho);
        }
      } else if (acao === "descartar") {
        if (p.etapa === "publicado") return json({ error: "Já foi publicado" }, 409);
        para = "descartado";
      } else if (acao === "reabrir") {
        if (p.etapa !== "descartado") return json({ error: "Só peça descartada é reaberta" }, 409);
        para = p.extra?.etapa_antes_de_descartar || FLUXOS[p.tipo as TipoPeca][0].id;
      } else if (acao === "mover") {
        // card anda à mão para qualquer etapa do seu fluxo (26/10/2026, Rodger: kanban de arrastar sem regra que bloqueia;
        // antes só o Reel). Publicado não anda: já está no Instagram.
        if (p.etapa === "publicado") return json({ error: "Já foi publicado" }, 409);
        if (!etapaDe(p.tipo, String(corpo.para))) return json({ error: "Etapa desconhecida" }, 400);
        para = String(corpo.para);
      } else if (acao === "trocar_tema") {
        // 26/10/2026 (Rodger: "não tem nenhum botão pra rejeitar as copys, pra gente usar novos temas virais"): o carrossel
        // volta para a copy, sem arte; o agent lê extra.trocar_tema, escreve outra copy com tema novo e não repete os de
        // extra.temas_rejeitados
        if (p.tipo !== "carrossel") return json({ error: "Trocar tema só vale para carrossel" }, 409);
        if (!["copy", "arte", "ajuste", "revisao_rodger"].includes(p.etapa)) return json({ error: "Esse carrossel já foi aprovado ou publicado" }, 409);
        para = "copy";
        Object.assign(mudanca, { ajuste: null, ajuste_por: null, ajuste_em: null, previas: [] });
        prints = null;
      } else if (acao === "editar_copy") {
        // 27/10/2026 (Rodger: "um botãozinho pra alteração" em cada slide da copy): a mudança aparece já no card (extra.copy)
        // e fica em extra.editar_copy até o agent passar para o Doc e o JSON da semana. A etapa não muda.
        if (p.tipo !== "carrossel" || p.etapa !== "copy") return json({ error: "A copy só é editada aqui antes de ser aprovada" }, 409);
        para = p.etapa;
      } else return json({ error: "Ação desconhecida" }, 400);

      // `reaberto` impede o agente de descartar de novo pela linha DESCARTAR que ainda está no Doc
      let extra = acao === "descartar" ? { ...(p.extra || {}), etapa_antes_de_descartar: p.etapa }
        : acao === "reabrir" ? { ...(p.extra || {}), reaberto: true } : p.extra;
      if (prints !== undefined) extra = { ...(extra || {}), ajuste_prints: prints };
      // 26/10/2026: todo pedido de ajuste fica no histórico (extra.ajustes), mesmo depois que o campo ajuste é limpo
      if (acao === "ajuste") extra = { ...(extra || {}), ajustes: [...(Array.isArray(p.extra?.ajustes) ? p.extra.ajustes : []), { texto: motivo, prints: prints || [], por: quem, em: agora, etapa: p.etapa }].slice(-20) };
      if (acao === "trocar_tema") {
        const rej = { titulo: p.extra?.copy?.slides?.[0]?.titulo || p.titulo || null, tema: p.extra?.ideia?.tema || null, motivo: motivo || null, por: quem, em: agora };
        extra = { ...(extra || {}), trocar_tema: { motivo: motivo || null, por: quem, em: agora }, temas_rejeitados: [...(Array.isArray(p.extra?.temas_rejeitados) ? p.extra.temas_rejeitados : []), rej].slice(-20) };
        delete (extra as Record<string, unknown>).ajuste_resposta;
      }
      let resumo = motivo;
      if (acao === "editar_copy") {
        const corte = (v: unknown, n: number) => typeof v === "string" ? v.trim().slice(0, n) : undefined;
        const antes = (p.extra?.editar_copy || {}) as { slides?: Record<string, Record<string, string>>; legenda?: string; capa_imagem?: string };
        const slides: Record<string, Record<string, string>> = { ...(antes.slides || {}) };
        const copy = p.extra?.copy ? structuredClone(p.extra.copy) : null;
        const feito: string[] = [];
        for (const [n, m] of Object.entries((corpo.slides || {}) as Record<string, Record<string, unknown>>)) {
          if (!/^\d{1,2}$/.test(n) || !m) continue;
          const titulo = corte(m.titulo, 300), texto = corte(m.texto, 2000);
          if (titulo === undefined && texto === undefined) continue;
          slides[n] = { ...(slides[n] || {}), ...(titulo !== undefined ? { titulo } : {}), ...(texto !== undefined ? { texto } : {}) };
          const sl = copy?.slides?.[+n - 1];
          if (sl) { if (titulo) sl.titulo = titulo; if (texto !== undefined) sl.texto = texto; }
          feito.push(`slide ${n}`);
        }
        const legenda = corte(corpo.legenda, 2200), capa = corte(corpo.capa_imagem, 1000);
        if (legenda) { if (copy) copy.legenda = legenda; feito.push("legenda"); }
        if (capa) feito.push("imagem da capa");
        if (!feito.length) return json({ error: "Nada mudou" }, 400);
        extra = { ...(extra || {}), ...(copy ? { copy } : {}), editar_copy: { slides, ...(legenda || antes.legenda ? { legenda: legenda || antes.legenda } : {}), ...(capa || antes.capa_imagem ? { capa_imagem: capa || antes.capa_imagem } : {}), por: quem, em: agora } };
        resumo = `editou ${feito.join(", ")}`;
      }
      // só grava se a peça ainda estiver na etapa que a pessoa viu (dois cliques ao mesmo tempo, ou o agente andou)
      const { data: feito, error } = await sb.from("esteira_pecas")
        .update({ ...mudanca, extra, etapa: para, ...(para !== p.etapa ? { etapa_desde: agora } : {}), atualizado_em: agora })
        .eq("codigo", p.codigo).eq("etapa", p.etapa).select("codigo");
      if (error) return json({ error: error.message }, 500);
      if (!feito?.length) return json({ error: "Essa peça mudou de etapa agora há pouco. Atualize o quadro." }, 409);
      await sb.from("esteira_eventos").insert({
        codigo: p.codigo, acao: { aprovar: "aprovado", ajuste: "ajuste", descartar: "descartado", reabrir: "movido", mover: "movido", trocar_tema: "trocar_tema", editar_copy: "editado" }[acao],
        de: p.etapa, para, quem, mensagem: (resumo + (prints?.length ? `\n[${prints.length} print${prints.length > 1 ? "s" : ""}]` : "")) || null,
      });
      return json({ ok: true, etapa: para });
    }

    if (rota === "/peca" && req.method === "POST") {
      const codigo = String(corpo.codigo || "").trim().toUpperCase().slice(0, 40);
      if (!codigo) return json({ error: "Informe o código (ex.: S3-E1)" }, 400);
      const campos: Record<string, unknown> = { atualizado_em: agora };
      for (const k of ["titulo", "doc_url", "pasta_url", "post_url"]) if (typeof corpo[k] === "string") campos[k] = corpo[k].trim().slice(0, 500) || null;
      if (typeof corpo.dia === "string") campos.dia = /^\d{4}-\d{2}-\d{2}$/.test(corpo.dia) ? corpo.dia : null;
      const { data: existe } = await sb.from("esteira_pecas").select("codigo").eq("codigo", codigo).maybeSingle();
      if (existe) {
        const { error } = await sb.from("esteira_pecas").update(campos).eq("codigo", codigo);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      // card novo: só Reel (o carrossel nasce pelo agente, quando ele escreve a copy)
      if (corpo.tipo !== "reel") return json({ error: "Card novo à mão é só de Reel" }, 400);
      const semana = Number((codigo.match(/^S(\d+)-/) || [])[1]) || null;
      const etapa = etapaDe("reel", String(corpo.etapa || "")) ? String(corpo.etapa) : FLUXOS.reel[0].id;
      const { error } = await sb.from("esteira_pecas").insert({ codigo, tipo: "reel", semana, etapa, ...campos });
      if (error) return json({ error: error.message }, 500);
      await sb.from("esteira_eventos").insert({ codigo, acao: "criado", para: etapa, quem });
      return json({ ok: true });
    }

    return json({ error: "Rota desconhecida" }, 404);
  } catch (e) {
    console.error("esteira:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
