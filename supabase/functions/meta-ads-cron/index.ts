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
  clicks: string;
  date_start: string;
  date_stop: string;
  actions?: Array<{ action_type: string; value: string }>;
}

const PIXEL_PAGE_VIEW_ACTION_TYPES = new Set([
  "offsite_conversion.fb_pixel_page_view",
  "offsite_conversion.fb_pixel_custom.PageView",
]);

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

function normalizeCreativeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

const BASE_CURRENCY = "BRL";

// A conta de anúncios fatura em USD — o Marketing API retorna `spend` na moeda
// da conta, não em BRL. Sem isso, todo o funil (CPL, CPMQL, ROAS) tratava
// dólares como se fossem reais.
//
// META_AD_ACCOUNT_CURRENCY tem prioridade: a detecção via Graph API
// (`act_.../?fields=currency`) vinha falhando silenciosamente em produção
// (causa não confirmada — possivelmente escopo/permissão distinto do usado
// pelo endpoint de insights) e caindo pro fallback BRL, zerando a conversão
// sempre que o cron rodava. Setar a env var evita depender dessa chamada.
async function getAdAccountCurrency(token: string, accountId: string): Promise<string> {
  const override = Deno.env.get("META_AD_ACCOUNT_CURRENCY");
  if (override) return override.toUpperCase();

  const url = `https://graph.facebook.com/${META_API_VERSION}/${accountId}?fields=currency&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error("Failed to fetch ad account currency, assuming BRL:", await res.text());
    return BASE_CURRENCY;
  }
  const json: any = await res.json();
  return json.currency || BASE_CURRENCY;
}

// Cacheia a cotação por dia em `fx_rates` — evita bater na AwesomeAPI a cada
// sync (o cron roda de 5 em 5 min) e tomar rate limit (429). Só busca uma
// cotação nova quando não há uma já salva para o dia corrente.
async function getExchangeRateToBRL(supabase: ReturnType<typeof createClient>, currency: string): Promise<number> {
  if (currency === BASE_CURRENCY) return 1;

  const today = new Date().toISOString().slice(0, 10);
  const { data: cached } = await supabase
    .from("fx_rates")
    .select("rate")
    .eq("currency", currency)
    .eq("date", today)
    .maybeSingle();
  if (cached?.rate) return Number(cached.rate);

  try {
    const res = await fetch(`https://economia.awesomeapi.com.br/json/last/${currency}-${BASE_CURRENCY}`);
    if (!res.ok) throw new Error(`Failed to fetch exchange rate ${currency}-${BASE_CURRENCY}: ${res.status}`);
    const json: any = await res.json();
    const rate = parseFloat(json[`${currency}${BASE_CURRENCY}`]?.bid);
    if (!rate || Number.isNaN(rate)) throw new Error(`Invalid exchange rate response for ${currency}-${BASE_CURRENCY}`);
    await supabase.from("fx_rates").upsert({ currency, date: today, rate }, { onConflict: "currency,date" });
    return rate;
  } catch (e) {
    console.error(`[fx] Fresh rate fetch failed for ${currency}, falling back to most recent cached rate:`, e);
    const { data: lastKnown } = await supabase
      .from("fx_rates")
      .select("rate")
      .eq("currency", currency)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastKnown?.rate) return Number(lastKnown.rate);
    throw e;
  }
}

async function fetchMetaInsights(token: string, accountId: string, since: string, until: string): Promise<MetaInsight[]> {
  const fields = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,actions";
  const timeRange = JSON.stringify({ since, until });
  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}/${accountId}/insights`;
  let url: string | null = `${baseUrl}?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=ad&time_increment=1&limit=500&access_token=${token}`;
  let allData: MetaInsight[] = [];

  while (url) {
    const response: Response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      console.error("Meta API error:", response.status, errText);
      if (response.status >= 500) return allData;
      throw new Error(`Meta API error ${response.status}: ${errText}`);
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
    const rawAccountId = Deno.env.get("META_AD_ACCOUNT_ID") || "";
    // Contas extras (lista separada por vírgula) — o teste de headline roda numa
    // conta separada da principal, e sem isso o gasto dele não entra no painel.
    // Fica numa env var própria pra não precisar reescrever a que já funciona.
    const extraAccounts = (Deno.env.get("META_AD_ACCOUNT_IDS_EXTRA") || "")
      .split(",").map((a) => a.trim()).filter(Boolean);
    const accountIds = Array.from(new Set(
      [rawAccountId, ...extraAccounts]
        .filter(Boolean)
        .map((a) => (a.startsWith("act_") ? a : `act_${a}`))
    ));

    if (!metaToken || accountIds.length === 0) {
      console.log("[meta-ads-cron] Meta credentials not configured, skipping");
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // Sync last 3 days to catch delayed data. `?days=N` permite re-sincronizar
    // uma janela maior quando a regra de nomeação muda e o histórico precisa ser
    // regravado (o upsert apaga e reinsere por ad_id + data).
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

    console.log(`[meta-ads-cron] Syncing ${clampedFrom} to ${dateTo} for ${accountIds.length} account(s)`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Cada conta tem a própria moeda e o próprio câmbio: uma fatura em USD e a
    // outra pode faturar em BRL. Converter tudo pela taxa de uma só multiplicaria
    // o gasto da outra por ~5.
    const insights: (MetaInsight & { __account: string; __rate: number; __currency: string })[] = [];
    for (const accountId of accountIds) {
      const accountCurrency = await getAdAccountCurrency(metaToken, accountId);
      let rate = 1;
      try {
        rate = await getExchangeRateToBRL(supabase, accountCurrency);
      } catch (e) {
        console.error(`[meta-ads-cron] Could not resolve exchange rate for ${accountCurrency} (${accountId}), spend will NOT be converted this run:`, e);
      }
      console.log(`[meta-ads-cron] ${accountId}: currency ${accountCurrency}, rate to BRL ${rate}`);
      const rows = await fetchMetaInsights(metaToken, accountId, clampedFrom, dateTo);
      rows.forEach((r) => insights.push({ ...r, __account: accountId, __rate: rate, __currency: accountCurrency }));
    }

    let inserted = 0;
    let errors = 0;
    const batchSize = 50;

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

        return {
          date: row.date_start,
          spend: Number((spendOriginal * row.__rate).toFixed(2)),
          spend_original: spendOriginal,
          spend_currency: row.__currency,
          exchange_rate: row.__rate,
          ad_account_id: row.__account,
          impressions: parseInt(row.impressions) || 0,
          clicks: parseInt(row.clicks) || 0,
          landing_page_views: landingPageViews,
          ad_id: row.ad_id,
          ad_name: row.ad_name,
          adset_id: row.adset_id,
          adset_name: row.adset_name,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          utm_content: utmContent,
          creative_key: creativeKey,
        };
      });

      for (const row of rows) {
        await supabase.from("ad_spend").delete().eq("date", row.date).eq("ad_id", row.ad_id);
      }

      const { error: insertError } = await supabase.from("ad_spend").insert(rows);
      if (insertError) {
        console.error("Insert error:", insertError);
        errors += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    console.log(`[meta-ads-cron] Done: ${inserted} inserted, ${errors} errors`);
    return new Response(
      JSON.stringify({ success: true, total_fetched: insights.length, inserted, errors }),
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
