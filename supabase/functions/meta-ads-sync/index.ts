import { createClient } from "jsr:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const META_API_VERSION = Deno.env.get('META_API_VERSION') || 'v21.0';
const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN');
const META_AD_ACCOUNT_ID = Deno.env.get('META_AD_ACCOUNT_ID');

async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const jwtSecret = Deno.env.get("ADMIN_JWT_SECRET");
    if (!jwtSecret) return false;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
    );
    const payload = await verify(token, key);
    return payload.role === "admin";
  } catch { return false; }
}

function normalizeCreativeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

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
}

async function fetchMetaInsights(dateFrom: string, dateTo: string): Promise<MetaInsight[]> {
  const fields = 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks';
  const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });
  const level = 'ad';
  const limit = 500;

  let allData: MetaInsight[] = [];
  let url = `https://graph.facebook.com/${META_API_VERSION}/${META_AD_ACCOUNT_ID}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=${level}&time_increment=1&limit=${limit}&access_token=${META_ACCESS_TOKEN}`;

  while (url) {
    console.log('Fetching Meta Insights page...');
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      console.error('Meta API error:', response.status, errText);
      throw new Error(`Meta API error ${response.status}: ${errText}`);
    }
    const json = await response.json();
    if (json.data) {
      allData = allData.concat(json.data);
    }
    // Handle pagination
    url = json.paging?.next || null;
  }

  console.log(`Fetched ${allData.length} insight rows from Meta`);
  return allData;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check
    const adminToken = req.headers.get("x-admin-token");
    if (!adminToken || !(await verifyAdminToken(adminToken))) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
      return new Response(
        JSON.stringify({ error: "Meta API credentials not configured", configured: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { date_from, date_to } = await req.json();
    if (!date_from || !date_to) {
      return new Response(
        JSON.stringify({ error: "date_from and date_to required (YYYY-MM-DD)" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch insights from Meta
    const insights = await fetchMetaInsights(date_from, date_to);

    // Prepare upsert rows
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let inserted = 0;
    let errors = 0;

    // Process in batches of 50
    const batchSize = 50;
    for (let i = 0; i < insights.length; i += batchSize) {
      const batch = insights.slice(i, i + batchSize);
      const rows = batch.map(row => {
        // Try to extract utm_content from ad_name patterns like "utm_content=XXX" or use ad_name itself
        const utmContentMatch = row.ad_name?.match(/utm_content[=:]([^\s|,]+)/i);
        const utmContent = utmContentMatch ? utmContentMatch[1] : row.ad_name;
        const creativeKey = utmContent ? normalizeCreativeKey(utmContent) : null;

        return {
          date: row.date_start,
          spend: parseFloat(row.spend) || 0,
          impressions: parseInt(row.impressions) || 0,
          clicks: parseInt(row.clicks) || 0,
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

      // Delete existing rows for these ad_id + date combos to avoid duplicates, then insert
      for (const row of rows) {
        const { error: delError } = await supabase
          .from("ad_spend")
          .delete()
          .eq("date", row.date)
          .eq("ad_id", row.ad_id);

        if (delError) {
          console.error("Delete error:", delError);
        }
      }

      const { error: insertError } = await supabase.from("ad_spend").insert(rows);
      if (insertError) {
        console.error("Insert error:", insertError);
        errors += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: insights.length,
        inserted,
        errors,
        date_from,
        date_to,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in meta-ads-sync:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
