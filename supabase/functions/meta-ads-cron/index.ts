import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Lightweight cron-triggered function that syncs Meta Ads spend data.
 * Called automatically every 5 minutes via pg_cron.
 * No admin auth required — protected by internal secret.
 */

const META_API_VERSION = "v21.0";

interface MetaInsight {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  spend: string;
  impressions: string;
  /** Clique TOTAL no anúncio: inclui curtida, comentário, ver-mais. Não é clique de link. */
  clicks: string;
  /** Clique no link — é este que vira CTR. Ausente quando a Meta não reporta. */
  inline_link_clicks?: string;
  /** CTR de link em %, como a Meta calculou para esta linha. Serve de conferência. */
  inline_link_click_ctr?: string;
  date_start: string;
  date_stop: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

const PIXEL_PAGE_VIEW_ACTION_TYPES = new Set([
  "offsite_conversion.fb_pixel_page_view",
  "offsite_conversion.fb_pixel_custom.PageView",
]);

// Compras que o Meta atribui ao anúncio.
//
// Sem isto o banco não sabia de venda nenhuma vinda do pixel, e a única visão
// de faturamento por criativo era o que o time digita no painel à mão. Em
// 27/08/2026 isso levou a pausar um conjunto que o gerenciador mostrava com
// duas compras — o dado existia no Meta e não existia aqui.
// A MESMA compra volta do Meta sob vários nomes ao mesmo tempo: `purchase`,
// `omni_purchase`, `offsite_conversion.fb_pixel_purchase`. Somar todos
// multiplica a receita pelo número de apelidos — foi o que aconteceu em
// 28/08/2026, quando uma venda de R$ 28,8 mil apareceu como cinco compras e
// R$ 1,57 milhão de valor de conversão.
//
// Por isso a lista é uma ORDEM DE PREFERÊNCIA, não um conjunto para somar:
// usa o primeiro apelido que existir na resposta e ignora o resto.
const PURCHASE_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
  "omni_purchase",
  "onsite_web_purchase",
  "web_in_store_purchase",
];

/** Compras e valor pelo primeiro apelido presente, nunca pela soma de todos. */
function purchasesFromActions(
  actions: MetaInsight["actions"],
  values: MetaInsight["action_values"],
): { count: number; amount: number } {
  for (const tipo of PURCHASE_ACTION_TYPES) {
    const count = sumActionValues(actions, (t) => t === tipo);
    const amount = sumActionAmounts(values, (t) => t === tipo);
    if (count > 0 || amount > 0) return { count, amount };
  }
  return { count: 0, amount: 0 };
}

// O evento de lead tem o mesmo problema de apelidos. Mesma regra: o primeiro
// que existir, nunca a soma.
const LEAD_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_lead",
  "lead",
  "omni_lead",
  "onsite_conversion.lead_grouped",
];

function leadsFromActions(actions: MetaInsight["actions"]): number {
  for (const tipo of LEAD_ACTION_TYPES) {
    const n = sumActionValues(actions, (t) => t === tipo);
    if (n > 0) return n;
  }
  return 0;
}

const LANDING_PAGE_VIEW_ACTION_TYPES = new Set([
  "landing_page_view",
  "omni_landing_page_view",
  "onsite_conversion.landing_page_view",
]);

function sumActionValues(actions: MetaInsight["actions"], matcher: (actionType: string) => boolean): number {
  return (actions || []).reduce((sum, action) => {
    const actionType = action.action_type || "";
    return matcher(actionType) ? sum + (parseInt(action.value, 10) || 0) : sum;
  }, 0);
}

function getPageViewsFromActions(actions: MetaInsight["actions"]): number {
  const pixelPageViews = sumActionValues(actions, (type) => PIXEL_PAGE_VIEW_ACTION_TYPES.has(type));
  if (pixelPageViews > 0) return pixelPageViews;

  const landingPageViews = sumActionValues(actions, (type) => LANDING_PAGE_VIEW_ACTION_TYPES.has(type));
  if (landingPageViews > 0) return landingPageViews;

  return sumActionValues(actions, (type) => type.includes("fb_pixel_page_view") || type.endsWith(".page_view"));
}

/** Soma valores decimais (`action_values` vem com centavos, diferente de `actions`). */
function sumActionAmounts(
  values: MetaInsight["action_values"],
  matcher: (actionType: string) => boolean,
): number {
  return (values || []).reduce((sum, v) => {
    return matcher(v.action_type || "") ? sum + (parseFloat(v.value) || 0) : sum;
  }, 0);
}

function normalizeCreativeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

const BASE_CURRENCY = "BRL";

// Quantos dias uma cotação pode envelhecer e ainda ser usada. Além disso o
// gasto NÃO é convertido: a conta é pulada com erro explícito, porque gravar
// real convertido por taxa velha como se fosse saudável é o tipo de número
// errado que ninguém confere.
const TOLERANCIA_FX_DIAS = 3;

interface Cotacao {
  rate: number;
  origem_date: string | null;  // de quando é a taxa DE VERDADE
  status: "fresh" | "stale" | "vencida" | "n/a";
  source: string | null;
  idade_dias: number;
}

/**
 * Cotação para BRL, cacheada POR MOEDA e reaproveitada dentro da execução.
 *
 * O desenho anterior pedia cotação uma vez POR CONTA, a cada 5 minutos:
 * ~576 chamadas/dia à AwesomeAPI, muito além do plano gratuito. O resultado era
 * 429 em toda tentativa, `catch` silencioso e a taxa de 11/07/2026 em uso desde
 * então. Com `memo`, 7 contas em USD custam UMA chamada.
 *
 * E, ao falhar, grava a linha do dia marcada como reaproveitamento (`source` =
 * fallback, `origem_date` = a data real da cotação). Assim a próxima execução
 * lê do cache em vez de bater na API de novo — o que faz a tentativa cair para
 * uma por dia por moeda — sem que a linha do dia minta sobre a idade da taxa.
 */
async function cotacaoParaBRL(
  supabase: ReturnType<typeof createClient>,
  currency: string,
  memo: Map<string, Cotacao>,
): Promise<Cotacao> {
  if (currency === BASE_CURRENCY) {
    return { rate: 1, origem_date: null, status: "n/a", source: null, idade_dias: 0 };
  }
  const jaResolvida = memo.get(currency);
  if (jaResolvida) return jaResolvida;

  const hoje = new Date().toISOString().slice(0, 10);
  const idade = (d: string | null) =>
    d ? Math.floor((Date.parse(hoje) - Date.parse(d)) / 86400000) : 999;

  const guardar = (c: Cotacao) => { memo.set(currency, c); return c; };

  // 1. Já existe linha para hoje? Então nem toca na API.
  const { data: doDia } = await supabase
    .from("fx_rates").select("rate, origem_date, source")
    .eq("currency", currency).eq("date", hoje).maybeSingle();
  if (doDia?.rate) {
    const origem = (doDia.origem_date as string) ?? hoje;
    const dias = idade(origem);
    return guardar({
      rate: Number(doDia.rate),
      origem_date: origem,
      status: dias === 0 ? "fresh" : dias <= TOLERANCIA_FX_DIAS ? "stale" : "vencida",
      source: (doDia.source as string) ?? "cache",
      idade_dias: dias,
    });
  }

  // 2. Buscar fresca. Duas fontes: se a primeira estiver com rate limit, a
  //    segunda ainda salva o dia.
  const fontes: Array<{ nome: string; buscar: () => Promise<number> }> = [
    {
      nome: "awesomeapi",
      buscar: async () => {
        const r = await fetch(`https://economia.awesomeapi.com.br/json/last/${currency}-${BASE_CURRENCY}`);
        if (!r.ok) throw new Error(`awesomeapi HTTP ${r.status}`);
        const j: any = await r.json();
        return parseFloat(j[`${currency}${BASE_CURRENCY}`]?.bid);
      },
    },
    {
      nome: "open.er-api",
      buscar: async () => {
        const r = await fetch(`https://open.er-api.com/v6/latest/${currency}`);
        if (!r.ok) throw new Error(`open.er-api HTTP ${r.status}`);
        const j: any = await r.json();
        return Number(j?.rates?.[BASE_CURRENCY]);
      },
    },
  ];

  for (const fonte of fontes) {
    try {
      const rate = await fonte.buscar();
      if (!rate || Number.isNaN(rate)) throw new Error(`cotacao invalida de ${fonte.nome}`);
      await supabase.from("fx_rates").upsert(
        { currency, date: hoje, rate, origem_date: hoje, source: fonte.nome, fetched_at: new Date().toISOString() },
        { onConflict: "currency,date" },
      );
      console.log(`[fx] ${currency}->BRL ${rate} (fonte ${fonte.nome})`);
      return guardar({ rate, origem_date: hoje, status: "fresh", source: fonte.nome, idade_dias: 0 });
    } catch (e) {
      console.warn(`[fx] ${fonte.nome} falhou para ${currency}:`, e instanceof Error ? e.message : e);
    }
  }

  // 3. Nenhuma fonte respondeu: reaproveita a última conhecida, dizendo a idade.
  const { data: ultima } = await supabase
    .from("fx_rates").select("rate, date, origem_date, source")
    .eq("currency", currency).order("date", { ascending: false }).limit(1).maybeSingle();

  if (!ultima?.rate) {
    throw new Error(`FX_INDISPONIVEL: sem cotacao ${currency}->BRL, nem fresca nem em cache`);
  }

  const origem = (ultima.origem_date as string) ?? (ultima.date as string);
  const dias = idade(origem);
  // Grava a linha do dia como reaproveitamento explícito: evita que a próxima
  // execução (daqui a 5 minutos) tente de novo e tome 429 outra vez.
  await supabase.from("fx_rates").upsert(
    { currency, date: hoje, rate: Number(ultima.rate), origem_date: origem, source: `fallback:${ultima.source ?? "?"}`, fetched_at: new Date().toISOString() },
    { onConflict: "currency,date" },
  );
  const status = dias <= TOLERANCIA_FX_DIAS ? "stale" : "vencida";
  console.error(`[fx] FX_STALE ${currency}: usando cotacao de ${origem} (${dias} dias). status=${status}`);
  return guardar({ rate: Number(ultima.rate), origem_date: origem, status, source: `fallback:${ultima.source ?? "?"}`, idade_dias: dias });
}

/**
 * Converte o que a Meta mandou, preservando a diferença entre "zero" e "não veio".
 *
 * `parseInt(undefined) || 0` devolve 0, e 0 num campo de clique é uma
 * afirmação — a de que ninguém clicou. Aqui ausência continua ausência.
 */
function numeroOuNulo(v: string | undefined, parse: (s: string) => number): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = parse(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchMetaInsights(token: string, accountId: string, since: string, until: string): Promise<MetaInsight[]> {
  const fields = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,inline_link_click_ctr,actions,action_values";
  const timeRange = JSON.stringify({ since, until });
  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}/${accountId}/insights`;
  let url: string | null = `${baseUrl}?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=ad&time_increment=1&limit=500&access_token=${token}`;
  let allData: MetaInsight[] = [];

  while (url) {
    const response: Response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[meta-ads-cron] Meta API error em ${accountId}:`, response.status, errText);
      // 5xx da Meta NÃO pode virar lista vazia.
      //
      // Antes daqui saía `return allData` — uma lista vazia indistinguível de
      // "esta conta não gastou nada". Um erro da Meta virava zero silencioso, e
      // zero silencioso é exatamente o que fez a queda de 06/09 passar 4 dias
      // sem ninguém notar. Agora lança, o laço externo isola a conta e a
      // resposta devolve o erro nomeado.
      throw new Error(`META_${response.status}: ${errText.slice(0, 300)}`);
    }
    const json: any = await response.json();
    if (json.data) allData = allData.concat(json.data);
    url = json.paging?.next || null;
  }
  return allData;
}

Deno.serve(async (req: Request) => {
  try {
    const metaToken = Deno.env.get("META_ACCESS_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!metaToken) {
      console.log("[meta-ads-cron] META_ACCESS_TOKEN ausente, pulando");
      return new Response(JSON.stringify({ skipped: true, motivo: "META_ACCESS_TOKEN ausente" }), { status: 200 });
    }

    // A LISTA DE CONTAS VEM DO CADASTRO, NÃO DE SECRET.
    //
    // Até 10/09/2026 ela vinha de `META_AD_ACCOUNT_ID` + `META_AD_ACCOUNT_IDS_EXTRA`.
    // Em 06/09 10:41:33 esse segundo campo foi editado e a conta que respondia
    // por 100% do gasto do mês saiu do escopo. A última linha gravada em
    // `ad_spend` era de 80 segundos antes. O cron seguiu rodando de 5 em 5
    // minutos devolvendo `total_fetched: 0` com HTTP 200 por 4 dias.
    //
    // Um campo de texto sem histórico, sem revisão e sem alerta não pode ser o
    // cadastro de contas. Agora é `meta_ad_accounts`, com FK e histórico. Os
    // secrets continuam existindo para credencial — não para cadastro.
    const { data: contas, error: erroContas } = await supabase
      .from("meta_ad_accounts")
      .select("ad_account_id, account_name, currency, last_sync_error")
      .eq("sync_enabled", true)
      .is("archived_at", null);
    if (erroContas) throw new Error(`cadastro de contas ilegivel: ${erroContas.message}`);

    if (!contas || contas.length === 0) {
      console.log("[meta-ads-cron] nenhuma conta com sync_enabled, nada a fazer");
      return new Response(
        JSON.stringify({ skipped: true, motivo: "nenhuma conta com sync_enabled=true em meta_ad_accounts", contas: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Sync last 3 days to catch delayed data. `?days=N` permite re-sincronizar
    // uma janela maior quando a regra de nomeação muda e o histórico precisa ser
    // regravado (o upsert sobrescreve por conta + data + anúncio).
    const daysParam = parseInt(new URL(req.url).searchParams.get("days") || "3", 10);
    const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 30) : 3;
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - days);

    const dateFrom = threeDaysAgo.toISOString().slice(0, 10);
    const dateTo = now.toISOString().slice(0, 10);

    // Clamp to minimum date
    const minDate = "2026-02-01";
    const clampedFrom = dateFrom < minDate ? minDate : dateFrom;

    console.log(`[meta-ads-cron] Syncing ${clampedFrom} to ${dateTo} for ${contas.length} account(s)`);

    // Uma cotação por MOEDA por execução — não por conta. Sete contas em USD
    // custam uma chamada, não sete.
    const memoFx = new Map<string, Cotacao>();
    const porConta: any[] = [];
    let totalFetched = 0;
    let inserted = 0;
    let errors = 0;
    const batchSize = 50;

    // CADA CONTA É SINCRONIZADA ISOLADAMENTE.
    //
    // Antes, todas as contas caíam num array único e só depois eram gravadas:
    // uma falha no meio derrubava a execução inteira e as contas boas ficavam
    // sem dado. Agora cada conta busca, grava e carimba o próprio sucesso; um
    // erro fica contido na conta que o causou.
    for (const conta of contas) {
      const accountId = conta.ad_account_id as string;
      const relato: any = { ad_account_id: accountId, account_name: conta.account_name ?? null, periodo: `${clampedFrom}..${dateTo}` };
      const t0 = Date.now();

      try {
        // MOEDA É DA CONTA. Se o cadastro não sabe, a conta não sincroniza —
        // assumir BRL registrava dólar como real e dividia o gasto por ~5;
        // assumir USD para uma conta BRL multiplicava por ~5. Havia um único
        // `META_AD_ACCOUNT_CURRENCY` global valendo para todas, e o portfólio
        // tem contas em USD e em BRL ao mesmo tempo.
        if (conta.last_sync_error && String(conta.last_sync_error).startsWith("CONFLITO DE MOEDA")) {
          throw new Error(`INTEGRIDADE: ${conta.last_sync_error}. Resolva no cadastro antes de sincronizar.`);
        }
        const currency = String(conta.currency || "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) {
          throw new Error(`MOEDA_DESCONHECIDA: rode meta-accounts?action=atualizar antes de sincronizar ${accountId}`);
        }

        const fx = await cotacaoParaBRL(supabase, currency, memoFx);
        relato.currency = currency;
        relato.exchange_rate = fx.rate;
        relato.fx_rate_date = fx.origem_date;
        relato.fx_status = fx.status;
        relato.fx_source = fx.source;

        // Cotação além da tolerância não vira gasto convertido com cara de
        // saudável. A conta para, e o motivo aparece.
        if (fx.status === "vencida") {
          throw new Error(`FX_STALE: cotacao ${currency}->BRL e de ${fx.origem_date} (${fx.idade_dias} dias, tolerancia ${TOLERANCIA_FX_DIAS}). Gasto NAO convertido.`);
        }

        console.log(`[meta-ads-cron] ${accountId}: currency ${currency}, rate to BRL ${fx.rate} (${fx.status}, de ${fx.origem_date})`);

        const linhas = await fetchMetaInsights(metaToken, accountId, clampedFrom, dateTo);
        totalFetched += linhas.length;
        relato.linhas_recebidas = linhas.length;
        relato.spend_recebido = Number(linhas.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0).toFixed(2));
        relato.gravadas = 0;

        const insights = linhas.map((r) => ({ ...r, __account: accountId, __rate: fx.rate, __currency: currency, __fx: fx }));

    for (let i = 0; i < insights.length; i += batchSize) {
      const batch = insights.slice(i, i + batchSize);
      const rows = batch.map((row) => {
        // Nome do criativo: um utm_content= explícito no nome do anúncio ou do
        // conjunto ganha de tudo. Sem ele, vale o nome do ANÚNCIO — é ele que
        // identifica o criativo e é ele que vai na URL, então é o que casa com o
        // utm_content do lead.
        //
        // O fallback pro nome do conjunto existe pra estrutura antiga, em que o
        // anúncio se chamava "Ad" / "Ad — Cópia" e o conjunto carregava o nome
        // do criativo. Na estrutura de teste A/B o conjunto é a HEADLINE
        // (HD0..HD4), então priorizar o conjunto jogava TODO o gasto em chaves
        // "hd0".."hd4" e todo criativo aparecia com spend zero no painel.
        const genericAdName = (n?: string) =>
          !n || /^(ad|ads|an[úu]ncio|new ad|nova publica[çc][ãa]o)/i.test(n.trim());
        const utmContentMatch =
          row.ad_name?.match(/utm_content[=:]([^\s|,]+)/i) ||
          row.adset_name?.match(/utm_content[=:]([^\s|,]+)/i);
        const utmContent = utmContentMatch
          ? utmContentMatch[1]
          : (genericAdName(row.ad_name) ? (row.adset_name || row.ad_name) : row.ad_name);
        const creativeKey = utmContent ? normalizeCreativeKey(utmContent) : null;
        const landingPageViews = getPageViewsFromActions(row.actions);
        const spendOriginal = parseFloat(row.spend) || 0;
        const compra = purchasesFromActions(row.actions, row.action_values);
        const purchases = compra.count;
        const purchaseValueOriginal = compra.amount;
        const metaLeads = leadsFromActions(row.actions);

        return {
          date: row.date_start,
          spend: Number((spendOriginal * row.__rate).toFixed(2)),
          spend_original: spendOriginal,
          spend_currency: row.__currency,
          exchange_rate: row.__rate,
          ad_account_id: row.__account,
          impressions: parseInt(row.impressions) || 0,
          clicks: parseInt(row.clicks) || 0,
          // `?? null` e não `|| 0`: a Meta omite o campo quando não tem o dado,
          // e gravar zero aí inventaria um CTR de 0% indistinguível de um
          // anúncio que ninguém clicou. Nulo diz "não sei", que é a verdade.
          inline_link_clicks: numeroOuNulo(row.inline_link_clicks, parseInt),
          inline_link_click_ctr: numeroOuNulo(row.inline_link_click_ctr, parseFloat),
          landing_page_views: landingPageViews,
          purchases,
          // Valor na mesma moeda do `spend`, convertido pela mesma taxa do dia,
          // senão receita e custo do mesmo anúncio ficam em unidades diferentes.
          purchase_value: Number((purchaseValueOriginal * row.__rate).toFixed(2)),
          purchase_value_original: purchaseValueOriginal,
          meta_leads: metaLeads,
          ad_id: row.ad_id,
          ad_name: row.ad_name,
          adset_id: row.adset_id,
          adset_name: row.adset_name,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          utm_content: utmContent,
          creative_key: creativeKey,
          // Procedência do câmbio, para a auditoria de 2027 saber não só qual
          // taxa converteu esta linha, mas de quando ela era.
          fx_rate_date: row.__fx.origem_date,
          fx_source: row.__fx.source,
          fx_status: row.__fx.status,
          synced_at: new Date().toISOString(),
        };
      });

          // UPSERT no lugar de DELETE + INSERT.
          //
          // O par antigo tinha dois defeitos. Primeiro, o DELETE filtrava só por
          // `(date, ad_id)` — sem a conta — e dependia de um invariante da Meta
          // que o banco não conhecia. Segundo, o erro do DELETE nem era lido: se
          // ele falhasse, o INSERT rodava do mesmo jeito e a linha duplicava,
          // dobrando o gasto do dia sem nada acusar.
          //
          // Com o UNIQUE (ad_account_id, date, ad_id) o upsert é atômico e
          // idempotente, e a conta faz parte da chave: uma execução da CA 05 é
          // estruturalmente incapaz de tocar numa linha da CA 03.
          const { error: upsertError } = await supabase
            .from("ad_spend")
            .upsert(rows, { onConflict: "ad_account_id,date,ad_id" });
          if (upsertError) {
            console.error(`[meta-ads-cron] erro ao gravar ${accountId}:`, upsertError);
            errors += batch.length;
            throw new Error(`GRAVACAO: ${upsertError.message}`);
          }
          inserted += batch.length;
          relato.gravadas += batch.length;
        }

        relato.ok = true;
        relato.ms = Date.now() - t0;

        // `last_successful_sync_at` só avança quando a conta TROUXE linha.
        // Separar isso de "a Meta respondeu" é o que permite o health check
        // enxergar uma conta que responde bem e não entrega há dias.
        await supabase.from("meta_ad_accounts").update({
          last_seen_at: new Date().toISOString(),
          ...(linhasGravadasNesteRun(relato) ? { last_successful_sync_at: new Date().toISOString() } : {}),
          last_sync_error: null,
          last_sync_error_at: null,
        }).eq("ad_account_id", accountId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        relato.ok = false;
        relato.erro = msg.slice(0, 400);
        relato.ms = Date.now() - t0;
        errors += 1;
        console.error(`[meta-ads-cron] conta ${accountId} falhou: ${msg}`);
        await supabase.from("meta_ad_accounts").update({
          last_sync_error: msg.slice(0, 500),
          last_sync_error_at: new Date().toISOString(),
        }).eq("ad_account_id", accountId);
      }

      porConta.push(relato);
    }

    const houveErro = porConta.some((c) => c.ok === false);
    console.log(`[meta-ads-cron] Done: ${inserted} gravadas, ${errors} erros, ${porConta.length} contas`);
    return new Response(
      JSON.stringify({
        success: !houveErro,
        periodo: { de: clampedFrom, ate: dateTo, dias: days },
        total_fetched: totalFetched,
        inserted,
        errors,
        contas: porConta,
      }, null, 2),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[meta-ads-cron] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/** Trouxe linha nesta execução? É o que separa "respondeu" de "entregou". */
function linhasGravadasNesteRun(relato: { gravadas?: number }): boolean {
  return (relato.gravadas ?? 0) > 0;
}
