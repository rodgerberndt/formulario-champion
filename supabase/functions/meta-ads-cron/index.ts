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
    const accountId = rawAccountId.startsWith("act_") ? rawAccountId : `act_${rawAccountId}`;

    if (!metaToken || !rawAccountId) {
      console.log("[meta-ads-cron] Meta credentials not configured, skipping");
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // Sync last 3 days to catch delayed data
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    const dateFrom = threeDaysAgo.toISOString().slice(0, 10);
    const dateTo = now.toISOString().slice(0, 10);

    // Clamp to minimum date
    const minDate = "2026-02-01";
    const clampedFrom = dateFrom < minDate ? minDate : dateFrom;

    console.log(`[meta-ads-cron] Syncing ${clampedFrom} to ${dateTo}`);
    const insights = await fetchMetaInsights(metaToken, accountId, clampedFrom, dateTo);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let inserted = 0;
    let errors = 0;
    const batchSize = 50;

    for (let i = 0; i < insights.length; i += batchSize) {
      const batch = insights.slice(i, i + batchSize);
      const rows = batch.map((row) => {
        const utmContentMatch = row.ad_name?.match(/utm_content[=:]([^\s|,]+)/i);
        const utmContent = utmContentMatch ? utmContentMatch[1] : row.ad_name;
        const creativeKey = utmContent ? normalizeCreativeKey(utmContent) : null;
        const landingPageViews = getPageViewsFromActions(row.actions);

        return {
          date: row.date_start,
          spend: parseFloat(row.spend) || 0,
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
