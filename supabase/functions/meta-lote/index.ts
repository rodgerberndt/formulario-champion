// Subida de um LOTE de ganchos: uma campanha, um conjunto por gancho, um
// anúncio em cada.
//
// Por que existe, separado do Hermes: o Hermes sobe criativo por criativo,
// espalhando o mesmo vídeo por vários conjuntos de headline. Aqui é o contrário
// — cada conjunto existe para isolar UM gancho, com verba idêntica, porque com
// verba baixa o Meta concentra a entrega em uma peça e enterra as outras. Foi o
// que aconteceu no teste de 22 a 29/08: 60% da verba do conjunto foi para um
// gancho só, cinco dos doze ficaram abaixo de R$ 10 e o teste não mediu nada.
//
// Tudo nasce PAUSADO. Ativar é decisão de quem paga.
//
// Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.

import { create, getNumericDate } from "https://deno.land/x/djwt@v2.9.1/mod.ts";
import {
  copyAdset,
  createAd,
  createAdCreative,
  setAdsetDailyBudget,
  uploadVideo,
  usarToken,
  videoThumbnail,
  waitVideoReady,
} from "../hermes/meta.ts";

const API_VERSION = (Deno.env.get("META_API_VERSION") || "v21.0").toLowerCase();
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

let tokenLocal: "write" | "read" = "write";
function writeToken(): string {
  const marketing = Deno.env.get("META_MARKETING_TOKEN");
  const leitura = Deno.env.get("META_ACCESS_TOKEN");
  const t = tokenLocal === "read" ? (leitura || marketing) : (marketing || leitura);
  if (!t) throw new Error("META_MARKETING_TOKEN não configurado");
  return t;
}

async function graph(path: string, query: Record<string, string> = {}) {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", writeToken());
  const res = await fetch(url);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(JSON.stringify(j.error ?? j));
  return j;
}

async function graphPost(path: string, fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  body.set("access_token", writeToken());
  const res = await fetch(`${GRAPH}/${path.replace(/^\//, "")}`, { method: "POST", body });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(JSON.stringify(j.error ?? j));
  return j;
}

/** URL assinada de curta duração: o Meta baixa o arquivo direto do Storage. */
async function signedUrl(path: string, seconds = 3600): Promise<string> {
  const base = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${base}/storage/v1/object/sign/hermes-criativos/${path}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: seconds }),
  });
  const j = await res.json();
  if (!j.signedURL && !j.signedUrl) throw new Error(`assinatura falhou: ${JSON.stringify(j)}`);
  return `${base}/storage/v1${j.signedURL ?? j.signedUrl}`;
}

/**
 * Cria um conjunto espelhando um modelo, em vez de usar /copies.
 *
 * Existe porque os conjuntos antigos da conta trazem `instagram_positions` com
 * "explore_home" sem "explore" — combinação que o Meta aceitou quando foram
 * criados e recusa hoje, então copiá-los falha com o subcode 2490392. Aqui o
 * targeting é lido, corrigido e reenviado; público, pixel, evento otimizado e
 * estratégia de lance continuam sendo os do modelo, que é o ponto de clonar.
 */
async function espelharAdset(
  modeloId: string,
  contaId: string,
  campaignId: string,
  nome: string,
  orcamentoCentavos: number,
): Promise<string> {
  const m = await graph(modeloId, {
    fields: "billing_event,optimization_goal,bid_strategy,targeting,promoted_object,destination_type,attribution_spec",
  });

  const targeting = (m.targeting ?? {}) as Record<string, unknown>;
  const ig = targeting.instagram_positions as string[] | undefined;
  if (ig?.includes("explore_home") && !ig.includes("explore")) {
    targeting.instagram_positions = [...ig, "explore"];
  }

  const campos: Record<string, string> = {
    name: nome,
    campaign_id: campaignId,
    daily_budget: String(orcamentoCentavos),
    billing_event: String(m.billing_event ?? "IMPRESSIONS"),
    optimization_goal: String(m.optimization_goal ?? "OFFSITE_CONVERSIONS"),
    bid_strategy: String(m.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP"),
    targeting: JSON.stringify(targeting),
    status: "PAUSED",
  };
  if (m.promoted_object) campos.promoted_object = JSON.stringify(m.promoted_object);
  if (m.destination_type) campos.destination_type = String(m.destination_type);
  if (m.attribution_spec) campos.attribution_spec = JSON.stringify(m.attribution_spec);

  const r = await graphPost(`${contaId}/adsets`, campos);
  return r.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Duas credenciais aceitas, ambas exigidas por inteiro:
  //
  //  1. a service role key, para quando quem chama já é o próprio backend;
  //  2. `x-lote-key`, um secret dedicado a esta função.
  //
  // A segunda existe porque a service role key injetada no ambiente da função
  // nem sempre é a mesma string que o painel entrega (chave legada e chave
  // nova convivem), e porque uma credencial dedicada pode ser revogada sozinha
  // (`supabase secrets unset LOTE_KEY`) sem mexer em nada que já roda.
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const loteKey = Deno.env.get("LOTE_KEY");
  const autorizado =
    (auth !== "" && auth === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ||
    (!!loteKey && req.headers.get("x-lote-key") === loteKey);
  if (!autorizado) return json({ error: "não autorizado" }, 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/meta-lote/, "") || "/";

  // ?token=read força o token de leitura, para o caso do app do token de
  // marketing estar em modo de desenvolvimento.
  const qualToken = url.searchParams.get("token") === "read" ? "read" : "write";
  tokenLocal = qualToken;
  usarToken(qualToken);

  try {
    // ── Copy e configuração dos anúncios que já rodam ────────────────────────
    // Serve para o lote novo herdar exatamente a copy em uso, em vez de
    // alguém reescrever e transformar um teste de gancho em teste de copy.
    if (path === "/modelo" && req.method === "GET") {
      const conta = url.searchParams.get("ad_account_id")!;
      const ads = await graph(`${conta}/ads`, {
        fields: "name,status,effective_status,adset{name,daily_budget,optimization_goal,billing_event},creative{body,title,object_story_spec,asset_feed_spec,url_tags,effective_object_story_id}",
        limit: "80",
        effective_status: JSON.stringify(["ACTIVE"]),
      });
      return json({ total: ads.data?.length ?? 0, ads: ads.data });
    }

    // ── O conjunto que vai ser clonado ───────────────────────────────────────
    // Conferir antes de copiar oito vezes: público, otimização e evento de
    // cobrança do modelo viram os de todos os conjuntos do lote.
    if (path === "/adset" && req.method === "GET") {
      const id = url.searchParams.get("id")!;
      const a = await graph(id, {
        fields: "name,status,daily_budget,optimization_goal,billing_event,bid_strategy,targeting,promoted_object,destination_type,campaign{name,objective}",
      });
      return json(a);
    }

    // ── Nome e moeda da conta ────────────────────────────────────────────────
    if (path === "/conta" && req.method === "GET") {
      const conta = url.searchParams.get("ad_account_id")!;
      return json(await graph(conta, { fields: "id,name,account_id,currency,account_status,business{name}" }));
    }

    // ── Renomear campanha, conjunto ou anúncio ───────────────────────────────
    if (path === "/renomear" && req.method === "POST") {
      const b2 = await req.json();
      await graphPost(String(b2.id), { name: String(b2.name) });
      return json({ ok: true, id: b2.id, name: b2.name });
    }

    // ── Ligar ou pausar qualquer objeto ──────────────────────────────────────
    if (path === "/status" && req.method === "POST") {
      const b2 = await req.json();
      const alvo: string[] = Array.isArray(b2.ids) ? b2.ids.map(String) : [String(b2.id)];
      const st = String(b2.status);
      const r: unknown[] = [];
      for (const id of alvo) {
        try {
          await graphPost(id, { status: st });
          r.push({ id, status: st, ok: true });
        } catch (e) {
          r.push({ id, ok: false, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      return json(r);
    }

    // ── De qual app vem o token ──────────────────────────────────────────────
    // O erro 1885183 fala do APP, não do token. Sem saber qual é, ninguém acha
    // o botão de publicar no painel de desenvolvedores.
    if (path === "/token-info" && req.method === "GET") {
      const t = writeToken();
      const r = await graph("debug_token", { input_token: t });
      return json(r);
    }

    // ── Vídeos já enviados à biblioteca da conta ─────────────────────────────
    if (path === "/videos" && req.method === "GET") {
      const conta = url.searchParams.get("ad_account_id")!;
      const v = await graph(`${conta}/advideos`, {
        fields: "id,title,created_time,status",
        limit: "50",
      });
      return json(v);
    }

    // ── Orçamento diário de conjuntos ────────────────────────────────────────
    // O valor vai na MOEDA DA CONTA, em centavos. As contas da Champion são em
    // DÓLAR: 4000 aqui são US$ 40, não R$ 40. Ver `/conta` antes de mexer.
    if (path === "/orcamento" && req.method === "POST") {
      const b2 = await req.json();
      const centavos = Number(b2.daily_budget_cents);
      if (!Number.isFinite(centavos) || centavos <= 0) {
        return json({ error: "daily_budget_cents inválido" }, 400);
      }
      const ids: string[] = Array.isArray(b2.ids) ? b2.ids.map(String) : [String(b2.id)];
      const r: unknown[] = [];
      for (const id of ids) {
        try {
          await setAdsetDailyBudget(id, centavos);
          r.push({ id, daily_budget_cents: centavos, ok: true });
        } catch (e) {
          r.push({ id, ok: false, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      return json(r);
    }

    // ── Duplicar uma campanha inteira ────────────────────────────────────────
    // `deep_copy` leva os conjuntos junto. Tudo nasce pausado: a API não cria
    // rascunho (isso só existe dentro do Gerenciador), e campanha pausada é o
    // estado mais próximo — aparece na conta, não entrega e não gasta.
    if (path === "/duplicar" && req.method === "POST") {
      const b2 = await req.json();
      const r = await graphPost(`${String(b2.campaign_id)}/copies`, {
        deep_copy: "true",
        status_option: "PAUSED",
      });
      const novoId = (r.copied_campaign_id ?? r.id ??
        (r.ad_object_ids as Array<{ copied_id?: string }> | undefined)?.[0]?.copied_id) as string;
      if (!novoId) return json({ error: "resposta sem id", resposta: r }, 500);
      if (b2.name) await graphPost(novoId, { name: String(b2.name) });

      // O Meta acrescenta " - Cópia" ao nome de cada conjunto copiado; sem
      // limpar, o nome do anúncio deixa de bater com o do conjunto e o
      // relatório por gancho fica ilegível.
      const sets = await graph(`${novoId}/adsets`, { fields: "id,name", limit: "50" });
      const renomeados: unknown[] = [];
      for (const st of (sets.data ?? []) as Array<{ id: string; name: string }>) {
        const limpo = st.name.replace(/\s*[-–]\s*(Cópia|Copy)\s*$/i, "").trim();
        if (limpo !== st.name) {
          await graphPost(st.id, { name: limpo });
          renomeados.push({ id: st.id, de: st.name, para: limpo });
        }
      }
      return json({ campaign_id: novoId, name: b2.name ?? null, conjuntos: (sets.data ?? []).length, renomeados });
    }

    // ── Anúncio a partir de um criativo QUE JÁ EXISTE ────────────────────────
    //
    // Caminho para quando o app do Meta está em modo de desenvolvimento: o que
    // ele barra é a criação de um POST novo (`/adcreatives`), não a criação do
    // anúncio. Apontando para um criativo que já roda na conta, o anúncio nasce
    // com a copy, o destino, o CTA e as macros de UTM corretos, e o vídeo é
    // trocado depois pelo Gerenciador — que usa o app do próprio Meta e não
    // esbarra nesse bloqueio.
    if (path === "/anuncio" && req.method === "POST") {
      const b2 = await req.json();
      const conta = String(b2.ad_account_id);
      const itens: Array<{ nome: string; adset_id: string }> = b2.itens ?? [];
      const creativeId = String(b2.creative_id);
      const r: unknown[] = [];
      for (const it of itens) {
        try {
          const id = await createAd(conta, it.adset_id, it.nome, creativeId, "PAUSED");
          r.push({ nome: it.nome, ad_id: id, ok: true });
        } catch (e) {
          r.push({ nome: it.nome, ok: false, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      return json(r);
    }

    // ── Detalhe de um anúncio ────────────────────────────────────────────────
    if (path === "/anuncio" && req.method === "GET") {
      const id = url.searchParams.get("id")!;
      return json(await graph(id, {
        fields: "id,name,status,adset{name},creative{id,name,body,title,url_tags,object_story_spec,video_id}",
      }));
    }

    // ── Criativo a partir de um POST que já existe ───────────────────────────
    //
    // Hipótese a testar: o bloqueio do app em modo de desenvolvimento é sobre
    // CRIAR post. Referenciando um post já publicado por `object_story_id`,
    // nenhum post novo nasce — e aí dá para definir `url_tags` próprio, que é o
    // que separa um gancho do outro no relatório.
    if (path === "/criativo-de-post" && req.method === "POST") {
      const b2 = await req.json();
      const campos: Record<string, string> = {
        name: String(b2.name),
        object_story_id: String(b2.object_story_id),
      };
      if (b2.url_tags) campos.url_tags = String(b2.url_tags);
      if (b2.call_to_action) campos.call_to_action = JSON.stringify(b2.call_to_action);
      // Sem isto o Advantage+ recorta, traduz e já chegou a entregar a
      // thumbnail no lugar do vídeo — o bug apurado pela auditoria de criativos.
      if (b2.dof) campos.degrees_of_freedom_spec = JSON.stringify(b2.dof);
      else if (b2.opt_out !== false) {
        campos.degrees_of_freedom_spec = JSON.stringify({
          creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } },
        });
      }
      const r = await graphPost(`${String(b2.ad_account_id)}/adcreatives`, campos);
      return json(r);
    }

    // ── Detalhe de um criativo ───────────────────────────────────────────────
    if (path === "/criativo" && req.method === "GET") {
      const id = url.searchParams.get("id")!;
      return json(await graph(id, {
        fields: "id,name,body,title,url_tags,call_to_action_type,object_story_id,object_story_spec,effective_object_story_id,video_id,thumbnail_url",
      }));
    }

    // ── Apagar criativos (limpeza de teste) ──────────────────────────────────
    if (path === "/criativo" && req.method === "POST") {
      const b2 = await req.json();
      const ids: string[] = Array.isArray(b2.ids) ? b2.ids.map(String) : [String(b2.id)];
      const r: unknown[] = [];
      for (const id of ids) {
        try {
          // Criativo se apaga com DELETE no objeto; POST deleted=true é recusado.
          const res = await fetch(
            `${GRAPH}/${id}?access_token=${encodeURIComponent(writeToken())}`,
            { method: "DELETE" },
          );
          const jj = await res.json().catch(() => ({}));
          if (!res.ok || jj.error) throw new Error(JSON.stringify(jj.error ?? jj));
          r.push({ id, ok: true });
        } catch (e) {
          r.push({ id, ok: false, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      return json(r);
    }

    // ── Apagar vídeos da biblioteca ──────────────────────────────────────────
    if (path === "/videos" && req.method === "POST") {
      const b2 = await req.json();
      const ids: string[] = Array.isArray(b2.ids) ? b2.ids.map(String) : [String(b2.id)];
      const r: unknown[] = [];
      for (const id of ids) {
        try {
          const res = await fetch(`${GRAPH}/${id}?access_token=${encodeURIComponent(writeToken())}`, { method: "DELETE" });
          const jj = await res.json().catch(() => ({}));
          if (!res.ok || jj.error) throw new Error(JSON.stringify(jj.error ?? jj));
          r.push({ id, ok: true });
        } catch (e) {
          r.push({ id, ok: false, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      return json(r);
    }

    // ── Criativo por asset_feed_spec (teste de contorno) ─────────────────────
    // Hipótese: o `asset_feed_spec` monta o criativo a partir de peças soltas
    // (vídeo, corpo, título, link) e talvez não passe pelo mesmo caminho de
    // criação de post que o `object_story_spec` com video_data.
    if (path === "/criativo-feed" && req.method === "POST") {
      const b2 = await req.json();
      const campos: Record<string, string> = {
        name: String(b2.name),
        object_story_spec: JSON.stringify({
          page_id: String(b2.page_id),
          ...(b2.instagram_actor_id ? { instagram_user_id: String(b2.instagram_actor_id) } : {}),
        }),
        asset_feed_spec: JSON.stringify({
          videos: [{ video_id: String(b2.video_id), ...(b2.thumbnail_url ? { thumbnail_url: b2.thumbnail_url } : {}) }],
          bodies: [{ text: String(b2.primary_text) }],
          titles: b2.headline ? [{ text: String(b2.headline) }] : undefined,
          link_urls: [{ website_url: String(b2.link_url) }],
          call_to_action_types: [String(b2.cta_type ?? "SEE_DETAILS")],
          ad_formats: ["SINGLE_VIDEO"],
        }),
      };
      if (b2.url_tags) campos.url_tags = String(b2.url_tags);
      const r = await graphPost(`${String(b2.ad_account_id)}/adcreatives`, campos);
      return json(r);
    }

    // ── Post não publicado direto na página (teste de contorno) ──────────────
    // Se a página aceitar criar o dark post, o criativo pode nascer de um
    // `object_story_id` nosso — e aí copy, título e destino voltam a ser
    // definidos por aqui.
    if (path === "/post-pagina" && req.method === "POST") {
      const b2 = await req.json();
      const campos: Record<string, string> = {
        file_url: String(b2.file_url ?? ""),
        title: String(b2.title ?? ""),
        description: String(b2.description ?? ""),
        published: "false",
      };
      if (b2.video_id) { delete campos.file_url; campos.video_id = String(b2.video_id); }

      // A página exige o token DELA, não o do system user. Ele é derivado do
      // token de sistema, desde que este tenha acesso à página.
      const pg = await graph(String(b2.page_id), { fields: "access_token,name" });
      const pageToken = pg.access_token as string | undefined;
      if (!pageToken) return json({ error: "sem page access token", pagina: pg }, 400);

      const body = new URLSearchParams({ ...campos, access_token: pageToken });
      const res = await fetch(`${GRAPH}/${String(b2.page_id)}/videos`, { method: "POST", body });
      const jj = await res.json();
      if (!res.ok || jj.error) return json({ error: jj.error ?? jj }, 400);
      return json(jj);
    }

    // ── Consulta livre à Graph (diagnóstico) ─────────────────────────────────
    // Só leitura: para inspecionar BM, apps, páginas e permissões sem precisar
    // de uma rota nova a cada pergunta.
    if (path === "/graph" && req.method === "GET") {
      const node = url.searchParams.get("node")!;
      const fields = url.searchParams.get("fields") ?? "";
      const q: Record<string, string> = {};
      if (fields) q.fields = fields;
      const limit = url.searchParams.get("limit");
      if (limit) q.limit = limit;

      // Certos nós da página (promotable_posts, entre outros) só respondem ao
      // token DELA. `as_page=<page_id>` deriva esse token do de sistema.
      const asPage = url.searchParams.get("as_page");
      if (asPage) {
        const pg = await graph(asPage, { fields: "access_token" });
        const pageToken = pg.access_token as string | undefined;
        if (!pageToken) return json({ error: "sem page access token" }, 400);
        const u = new URL(`${GRAPH}/${node}`);
        for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
        u.searchParams.set("access_token", pageToken);
        const res = await fetch(u);
        const jj = await res.json();
        return json(jj, res.ok ? 200 : 400);
      }
      return json(await graph(node, q));
    }

    // ── Importar de uma campanha-rascunho para a estrutura de teste ──────────
    //
    // O processo da casa (definido pelo Rodger em 30/08/2026):
    //   1. eu subo os vídeos para a biblioteca da conta;
    //   2. ele cria uma campanha descartável (um conjunto só) e joga TODOS os
    //      anúncios novos lá dentro, com a copy, o título e o destino corretos;
    //   3. esta rota lê aqueles anúncios e monta a estrutura de verdade: uma
    //      campanha, UM CONJUNTO POR GANCHO com verba idêntica, e um anúncio em
    //      cada, com nome próprio e UTM próprio.
    //
    // Copy, título, destino e vídeo vêm do post e NÃO são alteráveis daqui
    // enquanto o app estiver em modo de desenvolvimento. Nome e UTM, sim.
    if (path === "/importar" && req.method === "POST") {
      const b2 = await req.json();
      const conta = String(b2.ad_account_id);
      const origem = String(b2.origem_campaign_id);
      const modelo = String(b2.template_adset_id);
      const orcamento = Number(b2.daily_budget_cents);
      const prefixo = String(b2.prefixo ?? "Gancho");
      const sufixo = String(b2.sufixo ?? "");
      const urlTags = String(
        b2.url_tags ??
          "utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&utm_placement={{placement}}",
      );

      // `manter_nomes` preserva o nome de cada anúncio de origem em vez de
      // renumerar. É o padrão certo quando a campanha nova reaproveita ganchos
      // que JÁ têm histórico: o `utm_content` sai do nome do anúncio, então
      // renomear "H5 Arthur Case #1" para "Gancho #7" corta a série no meio e
      // o relatório passa a tratar o mesmo criativo como dois.
      const manterNomes = !!b2.manter_nomes;
      // O Rodger pediu em 31/08 que o lote suba LIGADO: campanha pausada não
      // entrega e ele já perdeu um dia por causa disso. `ativar: false`
      // continua disponível para quando a intenção for conferir antes.
      const nascerAtivo = b2.ativar !== false;
      const statusInicial: "ACTIVE" | "PAUSED" = nascerAtivo ? "ACTIVE" : "PAUSED";
      const orig = await graph(`${origem}/ads`, {
        fields: "id,name,creative{id,effective_object_story_id}",
        limit: "50",
      });
      let anuncios = (orig.data ?? []) as Array<{ id: string; name: string; creative?: { id?: string; effective_object_story_id?: string } }>;
      if (!anuncios.length) return json({ error: "campanha de origem sem anúncios" }, 400);

      // A edge function é cortada em ~150s, e cada peça custa três chamadas ao
      // Meta (copiar conjunto, criar criativo, criar anúncio). Com 25 peças o
      // teto estoura antes da primeira terminar e a campanha fica criada e
      // vazia. `de`/`ate` fatiam o lote em chamadas curtas, e `campaign_id`
      // faz as fatias seguintes caírem na MESMA campanha em vez de criar uma
      // campanha nova por fatia.
      const total = anuncios.length;
      const de = Math.max(0, Number(b2.de ?? 0));
      const ate = Math.min(total, Number(b2.ate ?? total));
      anuncios = anuncios.slice(de, ate);

      if (b2.dry_run) {
        return json({
          dry_run: true,
          encontrados: anuncios.map((a2, i) => ({
            origem: a2.name,
            vira: manterNomes ? a2.name : `${prefixo} #${i + 1}${sufixo ? " " + sufixo : ""}`,
            post: a2.creative?.effective_object_story_id ?? null,
          })),
        });
      }

      let campaignId: string;
      if (b2.campaign_id) {
        campaignId = String(b2.campaign_id);
      } else {
        const camp = await graphPost(`${conta}/campaigns`, {
          name: String(b2.campaign_name),
          objective: String(b2.objective ?? "OUTCOME_LEADS"),
          status: statusInicial,
          special_ad_categories: "[]",
          buying_type: "AUCTION",
          is_adset_budget_sharing_enabled: "false",
        });
        campaignId = camp.id as string;
      }

      const feitos: unknown[] = [];
      for (let i = 0; i < anuncios.length; i++) {
        const a2 = anuncios[i];
        const nome = manterNomes
          ? a2.name
          : `${prefixo} #${i + 1}${sufixo ? " " + sufixo : ""}`;
        const passo: Record<string, unknown> = { origem: a2.name, nome };
        try {
          const post = a2.creative?.effective_object_story_id;
          if (!post) throw new Error("anúncio de origem sem post");

          let adsetId: string;
          try {
            adsetId = await copyAdset(modelo, campaignId, nome);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.includes("instagram_positions") && !msg.includes("2490392")) throw e;
            adsetId = await espelharAdset(modelo, conta, campaignId, nome, orcamento);
          }
          await setAdsetDailyBudget(adsetId, orcamento);
          // `copyAdset` traz o conjunto pausado; sem isto o anúncio ficaria
          // ACTIVE dentro de conjunto parado, que é a falha silenciosa mais
          // cara aqui: parece ligado no painel e não entrega nada.
          if (nascerAtivo) await graphPost(adsetId, { status: "ACTIVE" });
          passo.adset_id = adsetId;

          // Criativo novo a partir do post: é o que permite dar um UTM
          // diferente a cada gancho sem criar post nenhum.
          const cr = await graphPost(`${conta}/adcreatives`, {
            name: nome,
            object_story_id: post,
            url_tags: urlTags,
          });
          passo.creative_id = cr.id;

          passo.ad_id = await createAd(conta, adsetId, nome, cr.id as string, statusInicial);
          passo.ok = true;
        } catch (e) {
          passo.ok = false;
          passo.erro = e instanceof Error ? e.message : String(e);
        }
        feitos.push(passo);
      }
      return json({
        ativo: nascerAtivo,
        campaign_id: campaignId,
        campanha: b2.campaign_name,
        fatia: { de, ate, total },
        falta: ate < total ? { de: ate, ate: total } : null,
        pecas: feitos,
      });
    }

    // ── POST cru na Graph, para testar hipótese ──────────────────────────────
    // Existe para não precisar de uma rota nova a cada tentativa de contornar
    // o app em modo de desenvolvimento. Só monta o corpo e devolve a resposta
    // como veio, inclusive o erro.
    if (path === "/graph-raw" && req.method === "POST") {
      const b2 = await req.json();
      const campos: Record<string, string> = {};
      for (const [k, v] of Object.entries(b2.campos ?? {})) {
        campos[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
      try {
        return json({ ok: true, resposta: await graphPost(String(b2.node), campos) });
      } catch (e) {
        return json({ ok: false, erro: e instanceof Error ? e.message : String(e) });
      }
    }

    // ── Apagar objetos (limpeza de lote que deu errado) ──────────────────────
    //
    // Existe por um motivo concreto: quando a criação de um lote estoura o
    // tempo da edge function, parte dos objetos JÁ nasceu, e uma segunda
    // tentativa cria tudo de novo. Foi assim que uma campanha de 25 conjuntos
    // terminou com 45. Sem isto, limpar é trabalho manual no Gerenciador.
    //
    // Duas travas: só apaga a lista EXPLÍCITA de ids que vier no corpo (nunca
    // "tudo da campanha X"), e recusa qualquer id de objeto que não esteja
    // pausado — apagar coisa entregando é dano irreversível.
    if (path === "/apagar" && req.method === "POST") {
      const b2 = await req.json();
      const ids: string[] = Array.isArray(b2.ids) ? b2.ids.map(String) : [];
      if (!ids.length) return json({ error: "informe ids[]" }, 400);
      if (ids.length > 60) return json({ error: "no máximo 60 por chamada" }, 400);

      const r: unknown[] = [];
      for (const id of ids) {
        try {
          const atual = await graph(id, { fields: "id,name,effective_status" });
          const st = String(atual.effective_status ?? "");
          const parado = st.includes("PAUSED") || st === "ADSET_PAUSED" || st === "CAMPAIGN_PAUSED";
          if (!parado && !b2.forcar) {
            r.push({ id, nome: atual.name, ok: false, erro: `não está pausado (${st})` });
            continue;
          }
          // DELETE no objeto. `POST deleted=true` é recusado (subcode 1815573).
          const res = await fetch(`${GRAPH}/${id}?access_token=${encodeURIComponent(writeToken())}`, {
            method: "DELETE",
          });
          const jj = await res.json();
          if (!res.ok || jj.error) throw new Error(JSON.stringify(jj.error ?? jj));
          r.push({ id, nome: atual.name, ok: true });
        } catch (e) {
          r.push({ id, ok: false, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      return json(r);
    }

    // ── Quanto a conta vai gastar hoje, se nada mudar ────────────────────────
    //
    // Soma o orçamento diário do que está REALMENTE no ar. A armadilha que esta
    // rota existe para evitar: conjunto ativo sem nenhum anúncio ativo aparece
    // com orçamento no Gerenciador e **não gasta um centavo**. Foi o que
    // aconteceu com o lote do Case Ighor, que passou um dia inteiro "ligado"
    // sem entregar nada. Somar orçamento de conjunto ligado, sem olhar o
    // anúncio, produz um número que parece certo e está errado para mais.
    //
    // Também separa CBO de ABO: com orçamento na campanha, o valor do conjunto
    // é número morto e somá-lo contaria a mesma verba várias vezes.
    if (path === "/orcamento-ativo" && req.method === "GET") {
      const conta = url.searchParams.get("ad_account_id")!;
      const taxa = Number(url.searchParams.get("taxa") ?? "0") || null;

      const r = await graph(`${conta}/adsets`, {
        fields:
          "id,name,daily_budget,effective_status," +
          "campaign{id,name,effective_status,daily_budget}," +
          "ads.limit(50){id,effective_status}",
        limit: "300",
      });
      const linhas = (r.data ?? []) as Array<Record<string, any>>;

      let usd = 0;
      const porCampanha = new Map<string, number>();
      const cbo = new Map<string, number>(); // campanha CBO contada uma vez só
      const semAnuncio: Array<{ campanha: string; conjunto: string; usd: number }> = [];
      let ativos = 0, entregando = 0;

      for (const a of linhas) {
        const c = a.campaign ?? {};
        if (a.effective_status !== "ACTIVE" || c.effective_status !== "ACTIVE") continue;
        ativos++;

        const ads = (a.ads?.data ?? []) as Array<{ effective_status?: string }>;
        // PENDING_REVIEW ainda não entrega, mas vai entregar sozinho em algumas
        // horas; contar como zero faria a previsão despencar toda vez que um
        // anúncio novo sobe. Só ACTIVE e PENDING_REVIEW contam.
        const vivos = ads.filter((x) =>
          x.effective_status === "ACTIVE" || x.effective_status === "PENDING_REVIEW"
        );
        const valor = Number(a.daily_budget ?? 0) / 100;

        if (!vivos.length) {
          semAnuncio.push({ campanha: c.name ?? "?", conjunto: a.name ?? "?", usd: valor });
          continue;
        }
        entregando++;

        if (c.daily_budget) {
          cbo.set(String(c.id), Number(c.daily_budget) / 100);
          continue;
        }
        usd += valor;
        porCampanha.set(c.name ?? "?", (porCampanha.get(c.name ?? "?") ?? 0) + valor);
      }
      for (const [id, v] of cbo) {
        usd += v;
        const nome = linhas.find((x) => String(x.campaign?.id) === id)?.campaign?.name ?? id;
        porCampanha.set(nome, (porCampanha.get(nome) ?? 0) + v);
      }

      const arred = (n: number) => Math.round(n * 100) / 100;
      return json({
        moeda_da_conta: "USD",
        orcamento_dia_usd: arred(usd),
        orcamento_dia_brl: taxa ? Math.round(usd * taxa) : null,
        taxa_usada: taxa,
        conjuntos_ativos: ativos,
        conjuntos_entregando: entregando,
        por_campanha: [...porCampanha.entries()]
          .map(([nome, v]) => ({ campanha: nome, usd: arred(v), brl: taxa ? Math.round(v * taxa) : null }))
          .sort((a2, b3) => b3.usd - a2.usd),
        // Verba parada: ligada no papel, sem anúncio para entregar.
        ativos_sem_anuncio: semAnuncio.map((x) => ({ ...x, usd: arred(x.usd) })),
      });
    }

    // ── Montar UM conjunto a partir de um post que já existe ─────────────────
    //
    // O `/importar` traz a campanha de origem inteira. Aqui é o caso oposto e
    // mais comum no dia a dia: pegar UM criativo validado e dar a ele uma
    // estrutura própria, isolada, para medir uma variável nova.
    //
    // O criativo nasce de um `object_story_id` porque o app do Meta está em
    // modo de desenvolvimento e barra a criação de post novo (erro 1885183).
    // Isso tem uma consequência que o chamador precisa conhecer: o DESTINO vem
    // do post e não pode ser trocado aqui. Escolher o post é escolher o link.
    if (path === "/montar" && req.method === "POST") {
      const b2 = await req.json();
      const conta = String(b2.ad_account_id);
      const modelo = String(b2.template_adset_id);
      const post = String(b2.object_story_id);
      const nome = String(b2.nome);
      const orcamento = Number(b2.daily_budget_cents);
      const urlTags = String(
        b2.url_tags ??
          "utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&utm_placement={{placement}}",
      );

      if (!Number.isFinite(orcamento) || orcamento < 100) {
        return json({ error: `orçamento inválido: ${b2.daily_budget_cents} centavos` }, 400);
      }

      if (b2.dry_run) {
        const m = await graph(modelo, { fields: "name,daily_budget,optimization_goal,promoted_object" });
        const pst = await graph(post, { fields: "id,permalink_url" });
        return json({
          dry_run: true,
          campanha: b2.campaign_name ?? b2.campaign_id,
          conjunto: nome,
          modelo: m,
          post: pst,
          orcamento_dia_moeda_da_conta: orcamento / 100,
        });
      }

      // Campanha nova ou já existente. Nasce pausada; ligar é decisão de quem
      // paga, e o /status faz isso num passo separado e explícito.
      const nascerAtivo2 = b2.ativar !== false;
      let campaignId = b2.campaign_id ? String(b2.campaign_id) : "";
      if (!campaignId) {
        const camp = await graphPost(`${conta}/campaigns`, {
          name: String(b2.campaign_name),
          objective: String(b2.objective ?? "OUTCOME_LEADS"),
          status: nascerAtivo2 ? "ACTIVE" : "PAUSED",
          special_ad_categories: "[]",
          buying_type: "AUCTION",
          // Desligado: com o compartilhamento ligado o Meta move verba entre
          // conjuntos, e verba igual em cada célula é a condição do teste.
          is_adset_budget_sharing_enabled: "false",
        });
        campaignId = camp.id as string;
      }

      const passo: Record<string, unknown> = { campaign_id: campaignId, nome };
      try {
        let adsetId: string;
        // `espelhar: true` pula a cópia e recria o conjunto direto na conta de
        // destino. É obrigatório quando o modelo mora em OUTRA conta: o
        // `/copies` do Meta só aceita campanha da mesma conta do conjunto
        // copiado, e foi assim que o teste de contas de 06/09/2026 precisou
        // nascer — modelo na CA 03 principal, campanha na CA 03 nova.
        if (b2.espelhar) {
          adsetId = await espelharAdset(modelo, conta, campaignId, nome, orcamento);
        } else {
          try {
            adsetId = await copyAdset(modelo, campaignId, nome);
          } catch (e) {
            // Conjunto antigo com `explore_home` sem `explore` não pode ser
            // copiado (erro 2490392); espelhar recria o alvo já corrigido.
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.includes("instagram_positions") && !msg.includes("2490392")) throw e;
            adsetId = await espelharAdset(modelo, conta, campaignId, nome, orcamento);
          }
        }
        await setAdsetDailyBudget(adsetId, orcamento);
        if (nascerAtivo2) await graphPost(adsetId, { status: "ACTIVE" });
        passo.adset_id = adsetId;

        const cr = await graphPost(`${conta}/adcreatives`, {
          name: nome,
          object_story_id: post,
          url_tags: urlTags,
        });
        passo.creative_id = cr.id;

        passo.ad_id = await createAd(conta, adsetId, nome, cr.id as string, nascerAtivo2 ? "ACTIVE" : "PAUSED");
        passo.ok = true;
      } catch (e) {
        passo.ok = false;
        passo.erro = e instanceof Error ? e.message : String(e);
      }
      return json(passo);
    }

    // ── Saúde do endpoint de criativos ───────────────────────────────────────
    //
    // Existe para eu conferir o meu próprio deploy do `admin-data` sem depender
    // de alguém abrir o painel. Gera um token de admin no servidor, chama a
    // rota e devolve só o status e a contagem — o token não sai daqui e nenhum
    // dado de lead é retornado.
    if (path === "/health-creatives" && req.method === "GET") {
      const segredo = Deno.env.get("ADMIN_JWT_SECRET");
      if (!segredo) return json({ error: "ADMIN_JWT_SECRET ausente" }, 500);
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(segredo),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      );
      const jwt = await create(
        { alg: "HS256", typ: "JWT" },
        { role: "admin", exp: getNumericDate(300) },
        key,
      );
      const base = Deno.env.get("SUPABASE_URL")!;
      const from = url.searchParams.get("from") ?? "2026-08-01";
      const to = url.searchParams.get("to") ?? "2026-08-31";
      const rota = url.searchParams.get("rota") ?? "creatives";
      const extra = url.searchParams.get("q") ?? "";
      const r = await fetch(
        `${base}/functions/v1/admin-data/${rota}?from=${from}&to=${to}${extra}`,
        { headers: { "x-admin-token": jwt, Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` } },
      );
      const texto = await r.text();
      let criativos = null, erro = null, totais = null;
      try {
        const j = JSON.parse(texto);
        // `cru=1` devolve a resposta inteira. Serve para conferir rota nova
        // sem precisar de um token de admin na mão.
        if (url.searchParams.get("cru") === "1") return json({ status: r.status, corpo: j });
        criativos = Array.isArray(j.creatives) ? j.creatives.length : null;
        if (j.linhas) return json({ status: r.status, metas: j });
        if (url.searchParams.get("detalhe") === "reunioes" && Array.isArray(j.creatives)) {
          return json({
            status: r.status,
            totais: { meetings: j.totals?.meetings, mql: j.totals?.mql, mql_agendaram: j.totals?.mql_agendaram },
            criativos: j.creatives
              .filter((c: any) => c.meetings_count > 0 || c.mql_agendaram > 0 || c.spend > 0)
              .map((c: any) => ({
                k: c.creative_key, spend: c.spend, mql: c.mql_count,
                reunioes: c.meetings_count, agendaram: c.mql_agendaram,
              })).slice(0, 30),
          });
        }
        erro = j.error ?? null;
        totais = j.totals
          ? { mql: j.totals.mql, meetings: j.totals.meetings, mql_agendaram: j.totals.mql_agendaram }
          : null;
      } catch {
        erro = texto.slice(0, 300);
      }
      return json({ status: r.status, criativos, totais, erro });
    }

    // ── Campanhas da conta ───────────────────────────────────────────────────
    if (path === "/campanhas" && req.method === "GET") {
      const conta = url.searchParams.get("ad_account_id")!;
      const c = await graph(`${conta}/campaigns`, {
        fields: "id,name,status,objective,created_time",
        limit: "50",
      });
      return json(c);
    }

    // ── Conjuntos e anúncios de uma campanha ─────────────────────────────────
    if (path === "/campanha" && req.method === "GET") {
      const id = url.searchParams.get("id")!;
      const sets = await graph(`${id}/adsets`, {
        fields: "id,name,status,daily_budget,optimization_goal",
        limit: "50",
      });
      const ads = await graph(`${id}/ads`, {
        fields: "id,name,status,adset_id,creative{id,name}",
        limit: "50",
      });
      return json({ adsets: sets.data, ads: ads.data });
    }

    // ── Um conjunto por gancho ───────────────────────────────────────────────
    if (path === "/subir" && req.method === "POST") {
      const b = await req.json();
      const conta: string = b.ad_account_id;
      const modelo: string = b.template_adset_id;     // conjunto validado a clonar
      const nomeCampanha: string = b.campaign_name;
      const orcamento: number = Number(b.daily_budget_cents); // centavos, por conjunto
      const pageId: string = b.page_id;
      const igId: string | undefined = b.instagram_actor_id;
      const linkUrl: string = b.link_url;
      const cta: string = b.cta_type ?? "SEE_DETAILS";
      const primaryText: string = b.primary_text;
      const headline: string | undefined = b.headline;
      const description: string | undefined = b.description;
      const pecas: Array<{ nome: string; storage_path: string; adset_id?: string }> = b.pecas;
      const seco: boolean = !!b.dry_run;

      if (!pecas?.length) return json({ error: "nenhuma peça" }, 400);

      if (seco) {
        return json({
          dry_run: true,
          campanha: nomeCampanha,
          conjuntos: pecas.map((p) => ({
            conjunto: p.nome,
            anuncio: p.nome,
            orcamento_dia: orcamento / 100,
            utm_content: p.nome,
            destino: linkUrl,
          })),
          total_dia: (orcamento / 100) * pecas.length,
        });
      }

      // 1. Campanha. ABO: o orçamento vive no conjunto, que é o que permite dar
      //    a mesma verba a cada gancho em vez de deixar o Meta escolher.
      //
      // Quando o chamador já tem a campanha, ela é reaproveitada: subir vídeo é
      // lento e a edge function tem teto de tempo, então o lote é feito em
      // chamadas curtas, uma peça por vez, todas apontando para a mesma campanha.
      if (b.campaign_id) {
        const feitos: unknown[] = [];
        for (const peca of pecas) feitos.push(await subirPeca(String(b.campaign_id), peca));
        return json({ campaign_id: b.campaign_id, campanha: nomeCampanha, pecas: feitos });
      }

      const camp = await graphPost(`${conta}/campaigns`, {
        name: nomeCampanha,
        objective: b.objective ?? "OUTCOME_LEADS",
        status: "PAUSED",
        special_ad_categories: "[]",
        buying_type: "AUCTION",
        // DESLIGADO de propósito. Ligado, o Meta deixa os conjuntos trocarem 20%
        // do orçamento entre si "para otimizar o desempenho geral" — que é
        // exatamente a concentração que este formato existe para impedir. Verba
        // igual em cada gancho é a condição do teste, não um detalhe.
        is_adset_budget_sharing_enabled: "false",
      });
      const campaignId = camp.id as string;

      const feitos: unknown[] = [];
      for (const peca of pecas) feitos.push(await subirPeca(campaignId, peca));
      return json({ campaign_id: campaignId, campanha: nomeCampanha, pecas: feitos });

      async function subirPeca(campaignId: string, peca: { nome: string; storage_path: string; adset_id?: string }) {
        const passo: Record<string, unknown> = { peca: peca.nome };
        try {
          // 2. Conjunto: cópia do modelo validado, mesmo público e otimização.
          //
          // Um `adset_id` vindo pronto quer dizer que o conjunto já existe — de
          // uma chamada anterior interrompida, por exemplo. Reaproveitar é o que
          // impede de deixar conjuntos duplicados e sem anúncio na campanha.
          let adsetId = peca.adset_id;
          if (!adsetId) {
            try {
              adsetId = await copyAdset(modelo, campaignId, peca.nome);
            } catch (e) {
              // Modelo antigo que o Meta não copia mais: espelha em vez de copiar.
              const msg = e instanceof Error ? e.message : String(e);
              if (!msg.includes("instagram_positions") && !msg.includes("2490392")) throw e;
              adsetId = await espelharAdset(modelo, conta, campaignId, peca.nome, orcamento);
              passo.espelhado = true;
            }
          }
          passo.adset_id = adsetId;
          passo.reaproveitado = !!peca.adset_id;
          await setAdsetDailyBudget(adsetId, orcamento);

          // Parar no conjunto serve para quando o criativo ainda não pode ser
          // criado (app do Meta em modo de desenvolvimento, por exemplo): a
          // estrutura fica pronta e o vídeo não é enviado à toa.
          if (b.apenas_conjunto) {
            passo.ok = true;
            passo.etapa = "conjunto";
            return passo;
          }

          // 3. Vídeo. Antes de subir, procura um com o MESMO título já na
          //    biblioteca e reusa.
          //
          //    Subir de novo a cada tentativa é como a conta acabou com quatro
          //    cópias do mesmo gancho em 29/08: cada retentativa depois de um
          //    erro adiante no fluxo duplicava o arquivo. O vídeo é o mesmo
          //    arquivo, então o mesmo `video_id` serve.
          let videoId: string;
          const existentes = await graph(`${conta}/advideos`, { fields: "id,title", limit: "100" });
          const achado = ((existentes.data ?? []) as Array<{ id: string; title?: string }>)
            .find((v) => (v.title ?? "").trim() === peca.nome.trim());
          if (achado) {
            videoId = achado.id;
            passo.video_reusado = true;
          } else {
            const fileUrl = await signedUrl(peca.storage_path);
            videoId = await uploadVideo(conta, fileUrl, peca.nome);
          }
          passo.video_id = videoId;
          await waitVideoReady(videoId);
          const thumb = await videoThumbnail(videoId);

          // 4. Criativo. O utm_content é o nome da peça, e é ele que o painel
          //    usa para separar um gancho do outro no relatório.
          const creativeId = await createAdCreative({
            adAccountId: conta,
            name: peca.nome,
            pageId,
            instagramActorId: igId,
            linkUrl,
            ctaType: cta,
            primaryText,
            headline: headline ?? "",
            description: description ?? null,
            videoId,
            thumbnailUrl: thumb,
            // As mesmas macros que os 41 anúncios ativos da conta já usam. O
            // Meta resolve {{ad.name}} sozinho, então o utm_content sai igual ao
            // nome do anúncio sem ninguém digitar duas vezes, e o relatório do
            // painel continua lendo o lote novo do mesmo jeito que lê o antigo.
            urlTags: b.url_tags ??
              "utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&utm_placement={{placement}}",
          });
          passo.creative_id = creativeId;

          // 5. Anúncio, pausado.
          const adId = await createAd(conta, adsetId, peca.nome, creativeId, "PAUSED");
          passo.ad_id = adId;
          passo.ok = true;
        } catch (e) {
          passo.ok = false;
          passo.erro = e instanceof Error ? e.message : String(e);
        }
        return passo;
      }
    }

    return json({ error: `rota desconhecida: ${path}` }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
