import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Meta Marketing API configuration
const META_API_VERSION = Deno.env.get('META_API_VERSION') || 'v19.0';
const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN');
const META_AD_ACCOUNT_ID = Deno.env.get('META_AD_ACCOUNT_ID');
const META_ENABLE_RESOLVE = Deno.env.get('META_ENABLE_RESOLVE') === 'true';

interface MetaAdData {
  ad_id: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  creative_id?: string;
  creative_name?: string;
  creative_thumbnail_url?: string;
}

async function fetchFromMetaAPI(endpoint: string): Promise<unknown> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${endpoint}&access_token=${META_ACCESS_TOKEN}`;
  console.log('Fetching from Meta API:', endpoint);
  
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.text();
    console.error('Meta API error:', error);
    throw new Error(`Meta API error: ${response.status}`);
  }
  
  return response.json();
}

async function resolveAdData(adId: string): Promise<MetaAdData | null> {
  if (!META_ACCESS_TOKEN || !META_ENABLE_RESOLVE) {
    console.log('Meta API not configured, skipping resolution');
    return null;
  }

  try {
    // Fetch ad details with nested adset and campaign info
    const adData = await fetchFromMetaAPI(
      `${adId}?fields=id,name,adset_id,campaign_id,creative{id,name,thumbnail_url}`
    ) as {
      id: string;
      name?: string;
      adset_id?: string;
      campaign_id?: string;
      creative?: { id: string; name?: string; thumbnail_url?: string };
    };

    const result: MetaAdData = {
      ad_id: adId,
      ad_name: adData.name,
      adset_id: adData.adset_id,
      campaign_id: adData.campaign_id,
      creative_id: adData.creative?.id,
      creative_name: adData.creative?.name,
      creative_thumbnail_url: adData.creative?.thumbnail_url,
    };

    // Fetch adset name if we have adset_id
    if (adData.adset_id) {
      try {
        const adsetData = await fetchFromMetaAPI(
          `${adData.adset_id}?fields=name`
        ) as { name?: string };
        result.adset_name = adsetData.name;
      } catch (e) {
        console.error('Error fetching adset:', e);
      }
    }

    // Fetch campaign name if we have campaign_id
    if (adData.campaign_id) {
      try {
        const campaignData = await fetchFromMetaAPI(
          `${adData.campaign_id}?fields=name`
        ) as { name?: string };
        result.campaign_name = campaignData.name;
      } catch (e) {
        console.error('Error fetching campaign:', e);
      }
    }

    console.log('Resolved ad data:', result);
    return result;
  } catch (error) {
    console.error('Error resolving ad data:', error);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { ad_id, campaign_id, adset_id, force_refresh } = await req.json();

    if (!ad_id && !campaign_id) {
      return new Response(
        JSON.stringify({ error: 'ad_id or campaign_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if Meta API is configured
    if (!META_ENABLE_RESOLVE || !META_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Meta API not configured',
          configured: false 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check cache first (unless force_refresh)
    if (!force_refresh && ad_id) {
      const { data: cached } = await supabase
        .from('meta_ads_cache')
        .select('*')
        .eq('ad_id', ad_id)
        .maybeSingle();

      if (cached) {
        // Check if cache is fresh (less than 24 hours old)
        const lastSynced = new Date(cached.last_synced_at);
        const hoursSinceSync = (Date.now() - lastSynced.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceSync < 24) {
          console.log('Returning cached data for ad:', ad_id);
          return new Response(
            JSON.stringify({ success: true, data: cached, from_cache: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Resolve from Meta API
    const resolvedData = await resolveAdData(ad_id);

    if (!resolvedData) {
      return new Response(
        JSON.stringify({ success: false, message: 'Could not resolve ad data' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert to cache
    const { error: upsertError } = await supabase
      .from('meta_ads_cache')
      .upsert({
        ad_id: resolvedData.ad_id,
        ad_name: resolvedData.ad_name,
        adset_id: resolvedData.adset_id || adset_id,
        adset_name: resolvedData.adset_name,
        campaign_id: resolvedData.campaign_id || campaign_id,
        campaign_name: resolvedData.campaign_name,
        creative_id: resolvedData.creative_id,
        creative_name: resolvedData.creative_name,
        creative_thumbnail_url: resolvedData.creative_thumbnail_url,
        last_synced_at: new Date().toISOString(),
      }, {
        onConflict: 'ad_id',
      });

    if (upsertError) {
      console.error('Error upserting cache:', upsertError);
    }

    return new Response(
      JSON.stringify({ success: true, data: resolvedData, from_cache: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in meta-ads-resolve:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
