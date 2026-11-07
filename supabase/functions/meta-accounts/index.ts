import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * CADASTRO DE CONTAS DE ANÚNCIO — descoberta e enriquecimento.
 *
 * Modelo: CADASTRO MANDA, DESCOBERTA ENRIQUECE.
 *
 * A razão de não ser o contrário está documentada em docs/HERMES.md:92 — a
 * `act_1965417164121284`, que respondeu por 100% do gasto de setembro/2026,
 * NÃO APARECE em `/me/adaccounts`, porque o usuário de sistema do token não
 * está atribuído a ela. O token consegue ler a conta pelo ID direto (as 789
 * linhas de ad_spend provam), mas ela não entra na listagem.
 *
 * Uma descoberta automática pura teria montado um cadastro sem a conta mais
 * importante do sistema. Por isso:
 *
 *   - `descobrir`  só ACRESCENTA contas novas, sempre com sync_enabled = false.
 *   - `atualizar`  lê CADA conta do cadastro PELO ID, uma a uma. É esta etapa
 *                  que enxerga a CA 03.
 *   - ausência em `/me/adaccounts` NUNCA desativa, arquiva ou apaga nada.
 *
 * Nenhuma ação desta função escreve gasto. Ela mexe em `meta_ad_accounts` e,
 * na ação `resolver-campanhas`, preenche `ad_spend.ad_account_id` de linhas
 * históricas órfãs — e apenas quando a Meta responde de forma inequívoca.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const META_API_VERSION = Deno.env.get("META_API_VERSION") || "v21.0";
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;

const STATUS_TXT: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  201: "ANY_ACTIVE",
  202: "ANY_CLOSED",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** `act_` na frente, sempre. Sem o prefixo o Graph trata o número como outro objeto. */
const comPrefixo = (id: string) => (id.startsWith("act_") ? id : `act_${id}`);

async function graph(caminho: string, token: string): Promise<any> {
  const sep = caminho.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}/${caminho}${sep}access_token=${token}`);
  const texto = await res.text();
  let corpo: any;
  try { corpo = JSON.parse(texto); } catch { corpo = { raw: texto }; }
  if (!res.ok || corpo?.error) {
    const msg = corpo?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Graph ${caminho}: ${msg}`);
  }
  return corpo;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = Deno.env.get("META_ACCESS_TOKEN");

  // Cadastro de conta não é dado de navegador: só quem tem a service_role entra.
  //
  // O projeto convive com dois formatos de chave desde 09/09/2026: o JWT legado
  // (`eyJ...`, com `role` no payload) e o formato novo (`sb_secret_...`). A
  // comparação literal com `SUPABASE_SERVICE_ROLE_KEY` só reconhece um dos dois,
  // então o JWT é aceito pelo `role` que ele carrega.
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const papelDoJwt = (() => {
    const partes = auth.split(".");
    if (partes.length !== 3) return null;
    try {
      const p = partes[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(p + "=".repeat((4 - (p.length % 4)) % 4)))?.role ?? null;
    } catch { return null; }
  })();
  if (auth !== serviceKey && papelDoJwt !== "service_role") {
    return json({ error: "nao autorizado" }, 401);
  }
  if (!token) return json({ error: "META_ACCESS_TOKEN ausente" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const url = new URL(req.url);
  const acao = url.searchParams.get("action") || "estado";
  const agora = new Date().toISOString();

  try {
    // ───────────────────────────────────────────────────────────────────────
    // estado — leitura pura. Nunca escreve.
    // ───────────────────────────────────────────────────────────────────────
    if (acao === "estado") {
      const { data: contas } = await supabase
        .from("meta_ad_accounts")
        .select("ad_account_id, account_name, currency, currency_source, account_status_txt, sync_enabled, archived_at, last_seen_at, last_successful_sync_at, last_sync_error")
        .order("account_name");

      const { count: orfas } = await supabase
        .from("ad_spend").select("id", { count: "exact", head: true }).is("ad_account_id", null);

      return json({
        contas,
        habilitadas_para_sync: (contas ?? []).filter((c: any) => c.sync_enabled && !c.archived_at).length,
        sem_moeda: (contas ?? []).filter((c: any) => !c.currency).length,
        ad_spend_sem_conta: orfas ?? 0,
      });
    }

    // ───────────────────────────────────────────────────────────────────────
    // descobrir — /me/adaccounts. SÓ ACRESCENTA.
    // ───────────────────────────────────────────────────────────────────────
    if (acao === "descobrir") {
      const campos = "account_id,name,currency,account_status,business";
      const resposta = await graph(`me/adaccounts?fields=${campos}&limit=200`, token);
      const listadas: any[] = resposta.data ?? [];

      const { data: existentes } = await supabase.from("meta_ad_accounts").select("ad_account_id");
      const jaTemos = new Set((existentes ?? []).map((c: any) => c.ad_account_id));

      const novas: string[] = [];
      const revistas: string[] = [];

      for (const c of listadas) {
        const id = comPrefixo(String(c.account_id ?? "").replace(/^act_/, ""));
        if (!/^act_\d+$/.test(id)) continue;

        if (jaTemos.has(id)) {
          // Conta já cadastrada: a descoberta NÃO decide nada sobre ela.
          // Só carimba que a Meta respondeu.
          await supabase.from("meta_ad_accounts")
            .update({ last_seen_at: agora }).eq("ad_account_id", id);
          revistas.push(id);
          continue;
        }

        // Conta nova: entra DESLIGADA. Descobrir não é autorizar.
        await supabase.from("meta_ad_accounts").insert({
          ad_account_id: id,
          account_name: c.name ?? null,
          currency: c.currency ?? null,
          currency_source: c.currency ? "graph" : null,
          currency_verified_at: c.currency ? agora : null,
          account_status: c.account_status ?? null,
          account_status_txt: STATUS_TXT[c.account_status] ?? null,
          business_id: c.business?.id ?? null,
          business_name: c.business?.name ?? null,
          sync_enabled: false,
          sync_notes: "Descoberta automatica via /me/adaccounts. Entra desligada por padrao.",
          last_seen_at: agora,
        });
        novas.push(id);
      }

      // Contas do cadastro que a listagem não trouxe. Isto é INFORMAÇÃO, não
      // ação: a CA 03 vive permanentemente nesta lista e é a conta principal.
      const naListagem = new Set(listadas.map((c: any) => comPrefixo(String(c.account_id ?? ""))));
      const foraDaListagem = [...jaTemos].filter((id) => !naListagem.has(id));

      return json({
        acao,
        listadas_pela_meta: listadas.length,
        cadastradas_novas: novas,
        ja_conhecidas: revistas.length,
        no_cadastro_mas_fora_da_listagem: foraDaListagem,
        nota: "Ausencia em /me/adaccounts nao desativa nem arquiva nada. A conta act_1965417164121284 e o caso conhecido.",
      });
    }

    // ───────────────────────────────────────────────────────────────────────
    // atualizar — lê CADA conta do cadastro pelo ID direto.
    // ───────────────────────────────────────────────────────────────────────
    if (acao === "atualizar") {
      const { data: contas } = await supabase
        .from("meta_ad_accounts")
        .select("ad_account_id, account_name, currency, currency_source")
        .is("archived_at", null);

      const resultado: any[] = [];

      for (const conta of contas ?? []) {
        const id = conta.ad_account_id as string;
        try {
          const c = await graph(`${id}?fields=name,currency,account_status,business`, token);
          const moedaMeta = String(c.currency ?? "").toUpperCase() || null;

          // CONFLITO: o cadastro já afirma uma moeda e a Meta discorda.
          // Não sobrescreve em silêncio — registra e deixa a conta travada
          // para o sync, que recusa conta com conflito aberto.
          if (conta.currency && moedaMeta && conta.currency !== moedaMeta) {
            const erro = `CONFLITO DE MOEDA: cadastro=${conta.currency}, Meta=${moedaMeta}`;
            await supabase.from("meta_ad_accounts").update({
              last_seen_at: agora,
              last_sync_error: erro,
              last_sync_error_at: agora,
            }).eq("ad_account_id", id);
            resultado.push({ ad_account_id: id, conflito: erro });
            continue;
          }

          await supabase.from("meta_ad_accounts").update({
            account_name: c.name ?? conta.account_name,
            currency: moedaMeta ?? conta.currency,
            currency_source: moedaMeta ? "graph" : conta.currency_source,
            currency_verified_at: moedaMeta ? agora : null,
            account_status: c.account_status ?? null,
            account_status_txt: STATUS_TXT[c.account_status] ?? null,
            business_id: c.business?.id ?? null,
            business_name: c.business?.name ?? null,
            last_seen_at: agora,
            last_sync_error: null,
            last_sync_error_at: null,
          }).eq("ad_account_id", id);

          resultado.push({
            ad_account_id: id,
            account_name: c.name ?? null,
            currency: moedaMeta,
            account_status: c.account_status ?? null,
            account_status_txt: STATUS_TXT[c.account_status] ?? null,
            business: c.business?.name ?? null,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabase.from("meta_ad_accounts").update({
            last_sync_error: msg.slice(0, 500),
            last_sync_error_at: agora,
          }).eq("ad_account_id", id);
          resultado.push({ ad_account_id: id, erro: msg.slice(0, 300) });
        }
      }

      return json({ acao, contas: resultado });
    }

    // ───────────────────────────────────────────────────────────────────────
    // resolver-campanhas — backfill NÍVEL 2 do ad_spend histórico.
    //
    // Um campaign_id pertence a UMA conta na Meta. `GET /{campaign_id}?fields=
    // account_id` devolve a dona de forma inequívoca. Só grava com resposta da
    // Meta: sem nome, sem sufixo de ID, sem heurística.
    // ───────────────────────────────────────────────────────────────────────
    if (acao === "resolver-campanhas") {
      const { data: orfas } = await supabase
        .from("ad_spend")
        .select("campaign_id")
        .is("ad_account_id", null)
        .not("campaign_id", "is", null);

      const campanhas = [...new Set((orfas ?? []).map((r: any) => String(r.campaign_id)))];
      const resultado: any[] = [];
      let linhasResolvidas = 0;

      for (const campaignId of campanhas) {
        try {
          const c = await graph(`${campaignId}?fields=account_id,name`, token);
          const bruto = String(c.account_id ?? "");
          if (!bruto) {
            resultado.push({ campaign_id: campaignId, resultado: "Meta nao devolveu account_id — segue NULO" });
            continue;
          }
          const id = comPrefixo(bruto);

          // A conta pode não estar no cadastro. Entra, desligada — é
          // exatamente para isso que a descoberta serve.
          const { data: existe } = await supabase
            .from("meta_ad_accounts").select("ad_account_id").eq("ad_account_id", id).maybeSingle();
          if (!existe) {
            await supabase.from("meta_ad_accounts").insert({
              ad_account_id: id,
              sync_enabled: false,
              sync_notes: `Descoberta ao resolver a campanha ${campaignId} do historico. Entra desligada.`,
              last_seen_at: agora,
            });
          }

          const { data: atualizadas, error } = await supabase
            .from("ad_spend")
            .update({ ad_account_id: id })
            .is("ad_account_id", null)
            .eq("campaign_id", campaignId)
            .select("id");
          if (error) throw error;

          const n = (atualizadas ?? []).length;
          linhasResolvidas += n;
          resultado.push({ campaign_id: campaignId, campanha: c.name ?? null, conta: id, linhas: n });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          resultado.push({ campaign_id: campaignId, erro: msg.slice(0, 300), resultado: "segue NULO" });
        }
      }

      const { count: aindaNulas } = await supabase
        .from("ad_spend").select("id", { count: "exact", head: true }).is("ad_account_id", null);

      return json({ acao, campanhas: resultado, linhas_resolvidas: linhasResolvidas, ad_spend_ainda_sem_conta: aindaNulas ?? 0 });
    }

    // ───────────────────────────────────────────────────────────────────────
    // anuncio — resolve a hierarquia completa de um ad_id e alimenta o
    // catálogo `meta_ads_cache`.
    //
    // Serve para dois usos: conferir o que a Meta realmente devolve para um
    // anúncio (a pergunta que abriu o caso do lead 74382da7, cujo nome no
    // painel era a copy e não o nome do anúncio) e pré-carregar o catálogo
    // sem depender de alguém abrir a tela.
    // ───────────────────────────────────────────────────────────────────────
    if (acao === "anuncio") {
      const pedidos = (url.searchParams.get("ad_id") || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!pedidos.length) return json({ error: "informe ?ad_id=123 (ou varios separados por virgula)" }, 400);

      const resultado: any[] = [];
      for (const adId of pedidos) {
        try {
          const a = await graph(`${adId}?fields=id,name,account_id,campaign{id,name},adset{id,name},creative{id,name,thumbnail_url}`, token);
          const contaBruta = a.account_id ? String(a.account_id) : null;
          const contaId = contaBruta ? comPrefixo(contaBruta) : null;

          // A conta pode ainda não estar no cadastro — entra desligada.
          if (contaId) {
            const { data: existe } = await supabase
              .from("meta_ad_accounts").select("ad_account_id").eq("ad_account_id", contaId).maybeSingle();
            if (!existe) {
              await supabase.from("meta_ad_accounts").insert({
                ad_account_id: contaId, sync_enabled: false, last_seen_at: agora,
                sync_notes: `Descoberta ao resolver o anuncio ${adId}. Entra desligada.`,
              });
            }
          }

          const linha = {
            ad_id: adId,
            ad_name: a.name ?? null,
            ad_account_id: contaId,
            campaign_id: a.campaign?.id ?? null,
            campaign_name: a.campaign?.name ?? null,
            adset_id: a.adset?.id ?? null,
            adset_name: a.adset?.name ?? null,
            creative_id: a.creative?.id ?? null,
            creative_name: a.creative?.name ?? null,
            creative_thumbnail_url: a.creative?.thumbnail_url ?? null,
            last_synced_at: agora,
          };
          await supabase.from("meta_ads_cache").upsert(linha, { onConflict: "ad_id" });

          const { data: conta } = contaId
            ? await supabase.from("meta_ad_accounts").select("account_name, currency").eq("ad_account_id", contaId).maybeSingle()
            : { data: null };

          resultado.push({
            ...linha,
            account_name: conta?.account_name ?? null,
            account_currency: conta?.currency ?? null,
            // O ponto do caso: os dois nomes existem e são coisas diferentes.
            nota: "ad_name identifica o ANUNCIO. creative_name e o nome do CRIATIVO e costuma ser o texto da copy.",
          });
        } catch (e) {
          resultado.push({ ad_id: adId, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      return json({ acao, anuncios: resultado });
    }

    // ───────────────────────────────────────────────────────────────────────
    // health — os seis checks críticos da fonte financeira.
    //
    // Cada um existe por causa de um incidente real, e o critério para entrar
    // aqui foi um só: teria pego a falha de 06/09/2026, em que o gasto sumiu
    // do painel por 4 dias sem um único alerta.
    // ───────────────────────────────────────────────────────────────────────
    if (acao === "health") {
      const checks: any[] = [];
      const agoraMs = Date.now();
      const hoje = new Date(agoraMs - 3 * 3600e3).toISOString().slice(0, 10);

      const { data: contas } = await supabase
        .from("meta_ad_accounts")
        .select("ad_account_id, account_name, currency, sync_enabled, archived_at, last_seen_at, last_successful_sync_at, last_sync_error, last_sync_error_at");
      const ativas = (contas ?? []).filter((c: any) => c.sync_enabled && !c.archived_at);

      // ── SYNC_STALE ──────────────────────────────────────────────────────
      // Usa `created_at` (quando NÓS gravamos), nunca `date` (o dia do
      // anúncio): um domingo sem entrega zera o segundo e não o primeiro.
      // 36h porque a cadência é de 5 minutos — 24h dispararia a cada soluço,
      // 48h deixaria passar um dia inteiro de decisão às cegas.
      {
        const { data: ultima } = await supabase
          .from("ad_spend").select("synced_at, created_at").order("synced_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
        // `synced_at`, não `created_at`. Desde que a gravação virou UPSERT, o
        // `created_at` para de avançar: ele guarda quando a linha NASCEU, e a
        // linha de um dia é criada uma vez e atualizada dezenas. Ler `created_at`
        // aqui faria o alerta disparar sozinho depois de 36h de operação normal
        // — o pior tipo de falso positivo, o que aparece justamente quando tudo
        // está certo.
        const carimbo = (ultima?.synced_at ?? ultima?.created_at) as string | undefined;
        const quando = carimbo ? new Date(carimbo).getTime() : null;
        const horas = quando ? (agoraMs - quando) / 3600e3 : null;
        checks.push({
          check: "SYNC_STALE",
          severidade: "CRITICA",
          ok: horas !== null && horas <= 36,
          detalhe: quando ? `ultima gravacao ha ${horas!.toFixed(1)}h` : "ad_spend vazia",
          limiar: "36h",
        });
      }

      // ── CLICKS_WITHOUT_SPEND ────────────────────────────────────────────
      // O alarme é "tem clique e NAO tem gasto", nunca "nao tem gasto". Sem a
      // primeira metade, toda conta legitimamente parada dispararia todo dia e
      // alguem desligaria o alerta — que e como health check morre.
      {
        const desde = new Date(agoraMs - 2 * 86400e3).toISOString();
        const { data: sess } = await supabase
          .from("lead_sessions").select("utm_campaign").not("fbclid", "is", null).gte("created_at", desde);
        const { data: gasto } = await supabase
          .from("ad_spend").select("ad_account_id, campaign_name, spend").gte("date", desde.slice(0, 10));

        const comGasto = new Set((gasto ?? []).filter((g: any) => Number(g.spend) > 0).map((g: any) => g.campaign_name));
        const campanhasClicadas = new Map<string, number>();
        for (const s of sess ?? []) {
          const c = decodeURIComponent(String((s as any).utm_campaign || "")).replace(/\+/g, " ").trim();
          if (!c || c === "(not set)") continue;
          campanhasClicadas.set(c, (campanhasClicadas.get(c) ?? 0) + 1);
        }
        // PISO DE RUIDO. Um fbclid sobrevive na URL: alguem reabrindo um link
        // antigo de campanha pausada gera 1 clique sem gasto e dispararia o
        // alerta todo dia. Health check que grita a toa e desligado, e ai nao
        // pega a falha de verdade. No incidente de 06/09/2026 a conta sumida
        // tinha 115 cliques/dia — dez de piso pega aquilo no primeiro dia e
        // ignora o eco de link velho.
        const PISO_CLIQUES_48H = 10;
        const orfas = [...campanhasClicadas.entries()]
          .filter(([nome, n]) => n >= PISO_CLIQUES_48H &&  ![...comGasto].some((g) => String(g).trim() === nome))
          .map(([nome, n]) => ({ campanha: nome, cliques_48h: n }))
          .sort((a, b) => b.cliques_48h - a.cliques_48h);
        checks.push({
          check: "CLICKS_WITHOUT_SPEND",
          severidade: "CRITICA",
          ok: orfas.length === 0,
          detalhe: orfas.length ? `${orfas.length} campanha(s) com clique e sem gasto nas ultimas 48h` : "toda campanha com clique tem gasto",
          campanhas: orfas.slice(0, 8),
        });
      }

      // ── META_API_ERROR ──────────────────────────────────────────────────
      {
        const comErro = (contas ?? []).filter((c: any) => c.last_sync_error && !String(c.last_sync_error).startsWith("CONFLITO DE MOEDA"));
        checks.push({
          check: "META_API_ERROR",
          severidade: "ALTA",
          ok: comErro.length === 0,
          detalhe: comErro.length ? `${comErro.length} conta(s) com erro registrado` : "nenhum erro registrado",
          contas: comErro.map((c: any) => ({ ad_account_id: c.ad_account_id, erro: String(c.last_sync_error).slice(0, 160), quando: c.last_sync_error_at })),
        });
      }

      // ── FX_STALE ────────────────────────────────────────────────────────
      // `origem_date` e a data REAL da cotacao. A linha do dia pode ser
      // reaproveitamento — e ai ela diz isso.
      {
        const moedas = [...new Set(ativas.map((c: any) => c.currency).filter((m: any) => m && m !== "BRL"))];
        const detalhes: any[] = [];
        let pior = 0;
        for (const moeda of moedas) {
          const { data: fx } = await supabase
            .from("fx_rates").select("rate, date, origem_date, source")
            .eq("currency", moeda).order("date", { ascending: false }).limit(1).maybeSingle();
          const origem = (fx?.origem_date as string) ?? (fx?.date as string) ?? null;
          const dias = origem ? Math.floor((Date.parse(hoje) - Date.parse(origem)) / 86400000) : 999;
          pior = Math.max(pior, dias);
          detalhes.push({ moeda, rate: fx?.rate ?? null, cotacao_de: origem, idade_dias: dias, fonte: fx?.source ?? null });
        }
        checks.push({
          check: "FX_STALE",
          severidade: "CRITICA",
          ok: moedas.length === 0 || pior <= 3,
          detalhe: moedas.length === 0 ? "nenhuma conta ativa em moeda estrangeira" : `cotacao mais velha em uso tem ${pior} dia(s)`,
          limiar: "3 dias",
          moedas: detalhes,
        });
      }

      // ── CURRENCY_CONFLICT ───────────────────────────────────────────────
      {
        const conflito = (contas ?? []).filter((c: any) => String(c.last_sync_error || "").startsWith("CONFLITO DE MOEDA"));
        const semMoeda = ativas.filter((c: any) => !c.currency);
        checks.push({
          check: "CURRENCY_CONFLICT",
          severidade: "CRITICA",
          ok: conflito.length === 0 && semMoeda.length === 0,
          detalhe: conflito.length || semMoeda.length
            ? `${conflito.length} conflito(s), ${semMoeda.length} conta(s) ativa(s) sem moeda`
            : "toda conta ativa tem moeda confirmada e sem divergencia",
          conflitos: conflito.map((c: any) => ({ ad_account_id: c.ad_account_id, erro: c.last_sync_error })),
          sem_moeda: semMoeda.map((c: any) => c.ad_account_id),
        });
      }

      // ── CROSS_ACCOUNT_MERGE_RISK ────────────────────────────────────────
      // Nome nao e identidade. Este check procura NOMES que pertencem a mais de
      // uma identidade tecnica — o defeito que somou R$ 6.916,88 de duas contas
      // numa linha so de criativo.
      {
        const { data: linhas } = await supabase
          .from("ad_spend").select("ad_account_id, campaign_id, campaign_name, adset_name, creative_key");
        const acumular = (campo: string) => {
          const m = new Map<string, Set<string>>();
          for (const l of linhas ?? []) {
            const nome = (l as any)[campo];
            if (!nome) continue;
            if (!m.has(nome)) m.set(nome, new Set());
            m.get(nome)!.add((l as any).ad_account_id ?? "(sem conta)");
          }
          return [...m.entries()].filter(([, s]) => s.size > 1)
            .map(([nome, s]) => ({ nome, contas: [...s] }));
        };
        const campanhas = acumular("campaign_name");
        const criativos = acumular("creative_key");
        const conjuntos = acumular("adset_name");

        // RISCO ATIVO vs AMBIGUIDADE HISTORICA.
        //
        // Um nome compartilhado so pode FUNDIR DE NOVO se mais de uma das
        // contas envolvidas ainda receber gasto novo. Quando a colisao existe
        // apenas entre contas desligadas, ela e uma cicatriz do passado: o
        // historico segue somado numa linha so se alguem agrupar por nome, mas
        // nenhuma linha nova entra ali.
        //
        // Sem essa separacao o painel ficaria amarelo para sempre por causa de
        // dois criativos de julho — e alerta que nunca apaga vira decoracao.
        const habilitadas = new Set(ativas.map((c: any) => c.ad_account_id));
        const ativoAgora = (x: { contas: string[] }) =>
          x.contas.filter((c) => habilitadas.has(c)).length > 1;

        const todos = [
          ...campanhas.map((x) => ({ tipo: "campaign_name", ...x })),
          ...criativos.map((x) => ({ tipo: "creative_key", ...x })),
          ...conjuntos.map((x) => ({ tipo: "adset_name", ...x })),
        ];
        const risco = todos.filter(ativoAgora);
        const historico = todos.filter((x) => !ativoAgora(x));

        checks.push({
          check: "CROSS_ACCOUNT_MERGE_RISK",
          severidade: "ALTA",
          // So falha se houver possibilidade ATUAL de fusao indevida.
          ok: risco.length === 0,
          detalhe: risco.length
            ? `${risco.length} nome(s) compartilhados entre contas ATIVAS — fusao nova e possivel`
            : historico.length
              ? `nenhum risco ativo; ${historico.length} ambiguidade(s) historica(s) entre contas desligadas`
              : "nenhum nome pertence a mais de uma conta",
          risco_estrutural_ativo: risco,
          // Conhecido e contido: as contas envolvidas nao recebem gasto novo, e
          // a identidade tecnica (ad_account_id, campaign_id/ad_id) ja separa
          // as linhas no banco desde 10/09/2026.
          ambiguidade_historica_conhecida: historico,
        });
      }

      const criticasFalhando = checks.filter((c) => !c.ok && c.severidade === "CRITICA");
      return json({
        acao,
        status: criticasFalhando.length ? "PROBLEMA" : checks.some((c) => !c.ok) ? "ATENCAO" : "SAUDAVEL",
        criticas_falhando: criticasFalhando.map((c) => c.check),
        contas_ativas: ativas.map((c: any) => ({ ad_account_id: c.ad_account_id, account_name: c.account_name, currency: c.currency })),
        checks,
      });
    }

    return json({ error: `acao desconhecida: ${acao}`, acoes: ["estado", "descobrir", "atualizar", "resolver-campanhas", "anuncio", "health"] }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[meta-accounts]", msg);
    return json({ error: msg }, 500);
  }
});
